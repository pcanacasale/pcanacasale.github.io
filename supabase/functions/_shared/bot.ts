// Parti comuni alle Edge Function bot-telegram e bot-app.
// Token del bot e service role vengono solo dai segreti e non finiscono mai nei log.

export const STATI_ABILITATI = ['ATTIVO', 'SOSPESO'];
export const NON_ABILITATO = 'Non sei abilitato. Contatta la segreteria.';

export function ambiente() {
  const get = (k: string) => Deno.env.get(k) || '';
  return { supaUrl: get('SUPABASE_URL'), service: get('SUPABASE_SERVICE_ROLE_KEY'), anon: get('SUPABASE_ANON_KEY'), token: get('TELEGRAM_BOT_TOKEN'), segreto: get('TELEGRAM_WEBHOOK_SECRET') };
}

// Un errore di fetch può contenere l'URL, e l'URL di Telegram contiene il token
export function pulisci(e: unknown): string {
  const { token, service } = ambiente();
  let s = e instanceof Error ? e.message : String(e);
  if (token) s = s.split(token).join('[token]');
  if (service) s = s.split(service).join('[chiave]');
  return s.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[token]').slice(0, 300);
}

export function statoAbilitato(stato: string | null | undefined) { return STATI_ABILITATI.includes(stato || 'ATTIVO'); }

// -- DATABASE (service role) --
function hdb() {
  const { service } = ambiente();
  return { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
}

export async function dbLeggi(percorso: string): Promise<any[]> {
  const r = await fetch(ambiente().supaUrl + '/rest/v1/' + percorso, { headers: hdb() });
  if (!r.ok) throw new Error('lettura ' + percorso.split('?')[0] + ': ' + r.status);
  return await r.json();
}

export async function dbScrivi(metodo: string, percorso: string, corpo?: unknown, prefer = 'return=representation'): Promise<any[]> {
  const r = await fetch(ambiente().supaUrl + '/rest/v1/' + percorso, {
    method: metodo, headers: { ...hdb(), Prefer: prefer }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error('scrittura ' + percorso.split('?')[0] + ': ' + r.status);
  const testo = await r.text();
  return testo ? JSON.parse(testo) : [];
}

export async function logAttivita(utente: string, azione: string) {
  try { await dbScrivi('POST', 'log_attivita', { utente_nome: utente, azione }, 'return=minimal'); }
  catch (e) { console.error('log attività non scritto:', pulisci(e)); }
}

// -- TELEGRAM --
export async function tg(metodo: string, corpo: unknown): Promise<{ ok: boolean; status: number; descrizione: string; result?: any; attesa?: number }> {
  const { token } = ambiente();
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + metodo, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20000),
  });
  let d: any = {};
  try { d = await r.json(); } catch { /* risposta non JSON */ }
  return { ok: !!d.ok, status: r.status, descrizione: String(d.description || r.status), result: d.result, attesa: d.parameters?.retry_after };
}

// Scarica un file dai server di Telegram (limite delle API: 20 MB)
export async function scaricaFile(fileId: string): Promise<Uint8Array> {
  const f = await tg('getFile', { file_id: fileId });
  if (!f.ok || !f.result?.file_path) throw new Error('getFile: ' + f.descrizione);
  const r = await fetch('https://api.telegram.org/file/bot' + ambiente().token + '/' + f.result.file_path, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('download file: ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

export function uguali(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export async function sha256(testo: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
