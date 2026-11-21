// Edge Function: vp-api — pagina "Verifica piattaforme" (Amministrazione).
// Stessa autorizzazione di agg-api (permesso "aggiornamento_dati", verificato server-side con mio_profilo).
// Azioni: vp_dati (anagrafica del portale per il confronto), vp_leggi (decisioni di un anno), vp_salva (salva la decisione di una persona).
// Header: Authorization: Bearer <token sessione>. Body: { action, payload }. Risposta: { ok, ... }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const COLONNE = 'id,volontario_id,cognome,nome,codice_fiscale,data_nascita,luogo_nascita,provincia_nascita,indirizzo,civico,cap,citta,provincia,telefono,email,stato';

const handler = withSupabase({ auth: 'none' }, async (req: Request, _ctx: any) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'metodo non supportato' }, 405);
  const URL_ = Deno.env.get('SUPABASE_URL'), SRV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), ANON = Deno.env.get('SUPABASE_ANON_KEY');
  if (!URL_ || !SRV || !ANON) return json({ ok: false, error: 'configurazione server mancante' }, 500);
  const H = { apikey: SRV, Authorization: `Bearer ${SRV}` };
  const HJ = { ...H, 'Content-Type': 'application/json' };
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'body non valido' }, 400); }
  const { action, payload } = body || {};
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'credenziali mancanti' }, 401);

  let utente: { id: string | null; nome: string } | null = null;
  try {
    const c = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await c.rpc('mio_profilo');
    if (error) throw error;
    const u = Array.isArray(data) ? data[0] : data;
    if (u && u.tipo && u.tipo !== 'volontario') {
      const p = (u.permessi && typeof u.permessi === 'object') ? u.permessi : {};
      const ok = p.aggiornamento_dati === false ? false : (u.tipo === 'master' || p.aggiornamento_dati === true);
      if (ok) utente = { id: u.id ?? null, nome: [u.cognome, u.nome].filter(Boolean).join(' ') };
    }
  } catch (e) { console.error('verifica permesso fallita', e); }
  if (!utente) return json({ ok: false, error: 'non autorizzato' }, 403);

  const log = async (azione: string) => {
    try { await fetch(`${URL_}/rest/v1/log_attivita`, { method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify({ utente_nome: utente!.nome, azione }) }); } catch (e) { console.error(e); }
  };

  try {
    if (action === 'vp_dati') {
      const r = await fetch(`${URL_}/rest/v1/agg_volontari?select=${COLONNE}&order=cognome.asc,nome.asc`, { headers: H });
      if (!r.ok) return json({ ok: false, error: 'errore lettura: ' + await r.text() }, 500);
      await log(utente.nome + ' ha aperto Verifica piattaforme');
      return json({ ok: true, volontari: await r.json() });
    }
    if (action === 'vp_leggi') {
      const anno = Number(payload?.anno);
      if (!anno) return json({ ok: false, error: 'anno mancante' }, 400);
      const r = await fetch(`${URL_}/rest/v1/verifica_piattaforme?anno=eq.${anno}&select=chiave,dati,aggiornato_il,aggiornato_da`, { headers: H });
      if (!r.ok) return json({ ok: false, error: 'errore lettura: ' + await r.text() }, 500);
      const righe = await r.json();
      const anniRes = await fetch(`${URL_}/rest/v1/verifica_piattaforme?select=anno`, { headers: H });
      const anni = Array.from(new Set(((await anniRes.json()) || []).map((x: any) => x.anno))).sort();
      return json({ ok: true, decisioni: righe, anni });
    }
    if (action === 'vp_salva') {
      const anno = Number(payload?.anno), chiave = String(payload?.chiave || '');
      if (!anno || !/^[A-Za-z0-9_]{1,40}$/.test(chiave) || typeof payload?.dati !== 'object' || payload.dati === null) return json({ ok: false, error: 'parametri non validi' }, 400);
      const dati = JSON.stringify(payload.dati);
      if (dati.length > 20000) return json({ ok: false, error: 'dati troppo grandi' }, 400);
      const r = await fetch(`${URL_}/rest/v1/verifica_piattaforme?on_conflict=anno,chiave`, {
        method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ anno, chiave, dati: payload.dati, aggiornato_il: new Date().toISOString(), aggiornato_da: utente.nome }),
      });
      if (!r.ok) return json({ ok: false, error: 'errore salvataggio: ' + await r.text() }, 500);
      return json({ ok: true });
    }
    return json({ ok: false, error: 'azione sconosciuta' }, 400);
  } catch (e) { console.error(e); return json({ ok: false, error: 'errore interno' }, 500); }
});

export default { fetch: (req: Request) => req.method === 'OPTIONS' ? new Response('ok', { headers: CORS }) : handler(req) };
