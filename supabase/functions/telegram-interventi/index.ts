// Supabase Edge Function: telegram-interventi
//
// Bot Telegram multi-funzione, guidato da un menu a pulsanti (tastiera persistente):
//  - "📋 Registra intervento": wizard (solo volontari con bot_registra_interventi=true)
//  - "📍 Condividi posizione" (anche "in tempo reale"): storico in posizioni_tracciate
//    (mai sovrascritto, così si vede il percorso), agganciato all'intervento
//    attivo (bot_config.intervento_attivo_id). Se non c'è nessun intervento
//    attivo la posizione viene scartata (non salvata da nessuna parte): il
//    percorso GPS ha senso solo dentro un intervento, a differenza delle
//    segnalazioni. Per la condivisione a durata scelta dal menu, un job
//    pg_cron chiama periodicamente l'azione "promemoria_posizione" per
//    ricordare di rimandare la posizione (un bot non può avviare da solo una
//    condivisione live continua, vedi setup4.sql)
//  - "📸 Segnala emergenza": foto + testo + posizione -> segnalazioni_emergenza
//    + Storage bucket "segnalazioni". Agganciata all'intervento attivo se
//    presente, ma salvata comunque anche se nessun intervento è attivo
//    (a differenza delle posizioni GPS)
//  - messaggi massivi e impostazione dell'intervento attivo: chiamate interne
//    dall'app (non da Telegram), vedi rami "broadcast" e "set_intervento_attivo"
//
// Ogni scrittura sul DB ora controlla l'esito ed avvisa l'utente/i log in caso
// di errore, invece di fallire in silenzio.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const TIPO_ATTIVITA = [
  'EMERGENZA', 'ESERCITAZIONE', 'CORSI', 'PREVENZIONE INFORTUNI',
  'RAPPRESENTANZA', 'ASSEMBLEE E RIUNIONI', 'CONTROLLO TERRITORIO',
  'SEGRETERIA', 'MAGAZZINO',
];
const ORE_RAPIDE = [1, 2, 3, 4, 5, 6, 8];

const MENU_KEYBOARD = {
  keyboard: [
    [{ text: '📋 Registra intervento' }, { text: '📸 Segnala emergenza' }],
    [{ text: '📍 Condividi posizione' }, { text: '⏹ Interrompi posizione' }],
  ],
  resize_keyboard: true,
};
const DURATE_POSIZIONE: Record<string, number> = { '15': 15, '60': 60, '240': 240, '480': 480, 'indef': 60 * 24 * 30 };
const INTERVALLO_PROMEMORIA_MIN = 3; // ogni quanto il bot chiede di rimandare la posizione durante una condivisione a durata
const tastieraDurata = () => ({
  inline_keyboard: [
    [{ text: '15 minuti', callback_data: 'durata:15' }, { text: '1 ora', callback_data: 'durata:60' }],
    [{ text: '4 ore', callback_data: 'durata:240' }, { text: '8 ore', callback_data: 'durata:480' }],
    [{ text: 'Fino a nuovo avviso', callback_data: 'durata:indef' }],
  ],
});

function oggiRoma(): string {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date());
}
function normalizzaTelefono(s: string): string {
  return (s || '').replace(/\D/g, '').slice(-9);
}
function parseDataItaliana(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, g, mese, a] = m;
  const gg = g.padStart(2, '0'), mm = mese.padStart(2, '0');
  if (+gg < 1 || +gg > 31 || +mm < 1 || +mm > 12) return null;
  return `${a}-${mm}-${gg}`;
}
function fmtDataItaliana(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

// CORS: serve solo per la chiamata "broadcast" fatta dal browser (area-riservata.js);
// Telegram chiama il webhook server-to-server e non ne ha bisogno, ma non fa male.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const handlerAutenticato = withSupabase({ auth: 'none' }, async (req: Request, _ctx: any) => {
  if (req.method !== 'POST') return jsonResponse({ ok: true });

  const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const SUPA_URL = Deno.env.get('SUPABASE_URL');
  const SUPA_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const BROADCAST_SECRET = Deno.env.get('BROADCAST_SECRET');
  if (!TELEGRAM_TOKEN || !SUPA_URL || !SUPA_KEY) {
    console.error('Secrets mancanti: TELEGRAM_BOT_TOKEN / SUPABASE_URL / SUPABASE_ANON_KEY');
    return jsonResponse({ ok: true });
  }

  const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
  const HJ = { ...H, 'Content-Type': 'application/json' };
  const TG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

  async function tg(method: string, body: Record<string, unknown>) {
    await fetch(`${TG}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  const sendMsg = (chat_id: number, text: string, reply_markup: unknown = MENU_KEYBOARD) =>
    tg('sendMessage', { chat_id, text, reply_markup, parse_mode: 'HTML' });

  // Log leggibile nei log della function in caso di scrittura fallita
  async function checkOk(res: Response, etichetta: string): Promise<boolean> {
    if (res.ok) return true;
    console.error(`${etichetta} fallito: ${res.status} ${await res.text()}`);
    return false;
  }

  let update: any;
  try { update = await req.json(); } catch { return jsonResponse({ ok: true }); }

  // --- Chiamata dall'app (non da Telegram): messaggio massivo ---
  if (update.action === 'broadcast') {
    if (!BROADCAST_SECRET || update.secret !== BROADCAST_SECRET) return jsonResponse({ ok: false, error: 'non autorizzato' }, 401);
    const testo = String(update.testo || '').trim();
    if (!testo) return jsonResponse({ ok: false, error: 'testo mancante' }, 400);
    const r = await fetch(`${SUPA_URL}/rest/v1/telegram_volontari?select=telegram_chat_id`, { headers: H });
    const chats = await r.json();
    let inviati = 0;
    for (const c of chats || []) { await tg('sendMessage', { chat_id: c.telegram_chat_id, text: testo }); inviati++; }
    return jsonResponse({ ok: true, inviati });
  }

  // --- Chiamata dall'app: imposta/rimuove l'intervento "attivo" per le emergenze
  // (le posizioni e le segnalazioni inviate dal bot vengono agganciate a questo) ---
  if (update.action === 'set_intervento_attivo') {
    if (!BROADCAST_SECRET || update.secret !== BROADCAST_SECRET) return jsonResponse({ ok: false, error: 'non autorizzato' }, 401);
    const valore = update.intervento_id ? String(update.intervento_id) : null;
    const res = await fetch(`${SUPA_URL}/rest/v1/bot_config`, {
      method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ chiave: 'intervento_attivo_id', valore }),
    });
    return jsonResponse({ ok: res.ok });
  }

  // --- Chiamata schedulata (pg_cron, ogni minuto): manda un promemoria con il
  // bottone "invia posizione" a chi ha una condivisione a durata ancora attiva,
  // così il "quasi continuo" tramite bot richiede solo un tocco ogni tot minuti
  // invece di dover riavviare tutto da capo. Approssima la condivisione live
  // nativa di Telegram, che un bot non può avviare da solo. ---
  if (update.action === 'promemoria_posizione') {
    if (!BROADCAST_SECRET || update.secret !== BROADCAST_SECRET) return jsonResponse({ ok: false, error: 'non autorizzato' }, 401);
    const ora = new Date().toISOString();

    // Sessioni scadute: notifica di chiusura e pulizia (una volta sola).
    const rScadute = await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione?scade_il=lt.${ora}&select=volontario_id,telegram_volontari:volontario_id(telegram_chat_id)`, { headers: H });
    const scadute = (await checkOk(rScadute, 'promemoria: lookup scadute')) ? await rScadute.json() : [];
    for (const s of scadute || []) {
      const chatId = s.telegram_volontari?.telegram_chat_id;
      if (chatId) await sendMsg(chatId, '⏹ Condivisione posizione terminata (tempo scaduto).');
    }
    if ((scadute || []).length) {
      await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione?scade_il=lt.${ora}`, { method: 'DELETE', headers: H });
    }

    // Sessioni ancora attive con promemoria in scadenza: rimanda il bottone e sposta avanti il prossimo promemoria.
    const rDovute = await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione?scade_il=gte.${ora}&prossimo_promemoria=lte.${ora}&select=volontario_id,telegram_volontari:volontario_id(telegram_chat_id)`, { headers: H });
    const dovute = (await checkOk(rDovute, 'promemoria: lookup dovute')) ? await rDovute.json() : [];
    let inviati = 0;
    for (const s of dovute || []) {
      const chatId = s.telegram_volontari?.telegram_chat_id;
      if (!chatId) continue;
      await sendMsg(chatId, '📍 Rimanda la posizione per continuare a condividerla.', { keyboard: [[{ text: '📍 Invia posizione', request_location: true }]], resize_keyboard: true, one_time_keyboard: true });
      const prossimo = new Date(Date.now() + INTERVALLO_PROMEMORIA_MIN * 60000).toISOString();
      await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione?volontario_id=eq.${s.volontario_id}`, {
        method: 'PATCH', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify({ prossimo_promemoria: prossimo }),
      });
      inviati++;
    }
    return jsonResponse({ ok: true, inviati, scadute: (scadute || []).length });
  }

  async function getStato(chat_id: number) {
    const r = await fetch(`${SUPA_URL}/rest/v1/telegram_stato?chat_id=eq.${chat_id}&select=*`, { headers: H });
    return (await r.json())[0] || null;
  }
  async function setStato(chat_id: number, step: string, dati: Record<string, unknown>) {
    const res = await fetch(`${SUPA_URL}/rest/v1/telegram_stato`, {
      method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ chat_id, step, dati, aggiornato_il: new Date().toISOString() }),
    });
    await checkOk(res, 'setStato');
  }
  async function resetStato(chat_id: number) {
    await fetch(`${SUPA_URL}/rest/v1/telegram_stato?chat_id=eq.${chat_id}`, { method: 'DELETE', headers: H });
  }
  async function getVolontarioCollegato(chat_id: number) {
    const r = await fetch(`${SUPA_URL}/rest/v1/telegram_volontari?telegram_chat_id=eq.${chat_id}&select=volontario_id,volontari(id,nome,cognome,bot_registra_interventi)`, { headers: H });
    if (!(await checkOk(r, 'getVolontarioCollegato'))) return null;
    const rows = await r.clone().json().catch(() => []);
    return rows[0]?.volontari || null;
  }
  async function getInterventoAttivo(): Promise<number | null> {
    const r = await fetch(`${SUPA_URL}/rest/v1/bot_config?chiave=eq.intervento_attivo_id&select=valore`, { headers: H });
    if (!(await checkOk(r, 'getInterventoAttivo'))) return null;
    const rows = await r.json();
    const v = rows[0]?.valore;
    return v ? parseInt(v, 10) : null;
  }
  async function isInPausa(volontario_id: number): Promise<boolean> {
    const r = await fetch(`${SUPA_URL}/rest/v1/posizioni_pausa?volontario_id=eq.${volontario_id}&select=in_pausa`, { headers: H });
    if (!(await checkOk(r, 'isInPausa'))) return false;
    const rows = await r.json();
    return !!rows[0]?.in_pausa;
  }
  async function setPausa(volontario_id: number, in_pausa: boolean) {
    await fetch(`${SUPA_URL}/rest/v1/posizioni_pausa`, {
      method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ volontario_id, in_pausa, aggiornato_il: new Date().toISOString() }),
    });
  }
  // Registra un NUOVO punto (non sovrascrive): serve per poter vedere il percorso.
  // Ogni punto viene agganciato all'eventuale intervento attivo per le emergenze.
  // Se non c'è nessun intervento attivo la posizione viene scartata (non ha senso
  // tracciare un percorso che non sarà mai consultabile da nessuna parte
  // dell'app): a differenza delle segnalazioni/foto, che restano indipendenti
  // dall'intervento attivo, il tracciamento GPS vive solo dentro un intervento.
  async function registraPosizione(volontario_id: number, lat: number, lon: number, minuti?: number, creaPromemoria = false): Promise<'saved' | 'discarded' | 'error'> {
    const intervento_id = await getInterventoAttivo();
    if (!intervento_id) return 'discarded';
    const scade_il = minuti ? new Date(Date.now() + minuti * 60000).toISOString() : null;
    const res = await fetch(`${SUPA_URL}/rest/v1/posizioni_tracciate`, {
      method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' },
      body: JSON.stringify({ volontario_id, intervento_id, lat, lon, scade_il }),
    });
    await setPausa(volontario_id, false); // una condivisione esplicita riattiva sempre il tracciamento
    // Solo per la condivisione a durata scelta dal menu del bot: mantiene/aggiorna
    // la sessione di promemoria (il bot non può avviare da solo una condivisione
    // live continua, quindi ricorda periodicamente di rimandare la posizione finché
    // la durata non scade). Non serve per la condivisione live nativa di Telegram,
    // che è già continua da sola.
    if (creaPromemoria && scade_il) {
      const prossimo_promemoria = new Date(Date.now() + INTERVALLO_PROMEMORIA_MIN * 60000).toISOString();
      await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione`, {
        method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ volontario_id, scade_il, prossimo_promemoria }),
      });
    } else if (!minuti) {
      // Nessuna durata (posizione "del momento"): niente da tracciare come sessione.
      await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione?volontario_id=eq.${volontario_id}`, { method: 'DELETE', headers: H });
    }
    return (await checkOk(res, 'registraPosizione')) ? 'saved' : 'error';
  }
  async function interrompiPosizione(volontario_id: number) {
    await setPausa(volontario_id, true); // i punti storici restano: si ferma solo la ricezione di nuovi aggiornamenti live
    await fetch(`${SUPA_URL}/rest/v1/sessioni_posizione?volontario_id=eq.${volontario_id}`, { method: 'DELETE', headers: H });
  }
  async function caricaFotoESalva(file_id: string): Promise<string | null> {
    const rf = await fetch(`${TG}/getFile?file_id=${file_id}`);
    const jf = await rf.json();
    const filePath = jf?.result?.file_path;
    if (!filePath) { console.error('getFile Telegram fallito', JSON.stringify(jf)); return null; }
    const rb = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`);
    const bytes = await rb.arrayBuffer();
    const nome = `${Date.now()}_${Math.round(Math.random() * 1e6)}.jpg`;
    const up = await fetch(`${SUPA_URL}/storage/v1/object/segnalazioni/${nome}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: bytes,
    });
    if (!(await checkOk(up, 'upload foto storage'))) return null;
    return `${SUPA_URL}/storage/v1/object/public/segnalazioni/${nome}`;
  }

  // --- Tastiere inline (per i passi del wizard) ---
  const tastieraTipo = () => {
    const rows = [];
    for (let i = 0; i < TIPO_ATTIVITA.length; i += 2) rows.push(TIPO_ATTIVITA.slice(i, i + 2).map(t => ({ text: t, callback_data: `tipo:${t}` })));
    return { inline_keyboard: rows };
  };
  const tastieraOre = () => ({ inline_keyboard: [ORE_RAPIDE.map(n => ({ text: String(n), callback_data: `ore:${n}` })), [{ text: 'Altro numero…', callback_data: 'ore:altro' }]] });
  const tastieraSalta = (campo: string) => ({ inline_keyboard: [[{ text: 'Salta', callback_data: `${campo}:skip` }]] });
  const tastieraConferma = () => ({ inline_keyboard: [[{ text: '✅ Conferma', callback_data: 'conferma:si' }, { text: '❌ Annulla', callback_data: 'conferma:no' }]] });
  const tastieraPosizione = () => ({ keyboard: [[{ text: '📍 Invia posizione', request_location: true }]], resize_keyboard: true, one_time_keyboard: true });

  // --- Wizard intervento ---
  async function chiediEvento(chat_id: number) { await setStato(chat_id, 'evento', {}); await sendMsg(chat_id, "Qual è il nome/evento dell'intervento?", undefined); }
  async function chiediData(chat_id: number, dati: any) { await setStato(chat_id, 'data', dati); await sendMsg(chat_id, `Data? Scrivi gg/mm/aaaa oppure premi "Oggi".`, { inline_keyboard: [[{ text: 'Oggi', callback_data: 'data:oggi' }]] }); }
  async function chiediTipo(chat_id: number, dati: any) { await setStato(chat_id, 'tipo', dati); await sendMsg(chat_id, 'Tipo di attività?', tastieraTipo()); }
  async function chiediLuogo(chat_id: number, dati: any) { await setStato(chat_id, 'luogo', dati); await sendMsg(chat_id, 'Luogo (facoltativo)?', tastieraSalta('luogo')); }
  async function chiediOre(chat_id: number, dati: any) { await setStato(chat_id, 'ore', dati); await sendMsg(chat_id, 'Ore svolte? (arrotondate al numero intero)', tastieraOre()); }
  async function promptAltriVolontari(chat_id: number, dati: any) {
    dati.altri_volontari = dati.altri_volontari || [];
    dati.altri_non_trovati = dati.altri_non_trovati || [];
    delete dati._candidatiTmp; delete dati._ultimoTesto;
    await setStato(chat_id, 'altri_volontari_nome', dati);
    const finora = dati.altri_volontari.map((v: any) => `${v.nome} ${v.cognome}`).join(', ');
    const testo = (finora ? `Aggiunti finora: ${finora}\n\n` : '') + 'Scrivi il nome di un altro volontario intervenuto (oltre a te), oppure premi "Fine".';
    await sendMsg(chat_id, testo, { inline_keyboard: [[{ text: '✅ Fine', callback_data: 'altrifine' }]] });
  }
  async function chiediNote(chat_id: number, dati: any) { await setStato(chat_id, 'note', dati); await sendMsg(chat_id, 'Note (facoltativo)?', tastieraSalta('note')); }
  async function chiediConferma(chat_id: number, dati: any) {
    await setStato(chat_id, 'conferma', dati);
    const altriTxt = (dati.altri_volontari || []).map((v: any) => `${v.nome} ${v.cognome}`).join(', ');
    const nonTrovatiTxt = (dati.altri_non_trovati || []).join(', ');
    const riepilogo = [`<b>Riepilogo intervento</b>`, `Evento: ${dati.evento}`, `Data: ${fmtDataItaliana(dati.data)}`, `Tipo: ${dati.tipo_attivita}`,
      dati.luogo ? `Luogo: ${dati.luogo}` : null, `Ore: ${dati.ore}`, altriTxt ? `Altri volontari: ${altriTxt}` : null,
      nonTrovatiTxt ? `⚠️ Non trovati (da aggiungere a mano): ${nonTrovatiTxt}` : null,
      dati.note ? `Note: ${dati.note}` : null].filter(Boolean).join('\n');
    await sendMsg(chat_id, riepilogo, tastieraConferma());
  }
  function normalizzaTesto(s: string): string {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
    return dp[m][n];
  }
  function similarita(a: string, b: string): number {
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  }
  // Cerca UN volontario per nome scritto libero: match esatto (token contenuti) se univoco,
  // altrimenti propone candidati (anche per errori di battitura, via distanza di Levenshtein)
  // invece di indovinare — l'utente sceglie con i bottoni.
  async function cercaVolontarioSingolo(testo: string, escludiIds: number[]): Promise<{ esatto: any | null; candidati: any[] }> {
    const r = await fetch(`${SUPA_URL}/rest/v1/volontari?select=id,nome,cognome&attivo=eq.true`, { headers: H });
    const tutti = (await checkOk(r, 'cercaVolontarioSingolo')) ? await r.json() : [];
    const pool = (tutti || []).filter((v: any) => !escludiIds.includes(v.id));
    const tokens = normalizzaTesto(testo).split(/\s+/).filter(Boolean);
    const esatti = pool.filter((v: any) => tokens.every(t => normalizzaTesto(`${v.cognome} ${v.nome}`).includes(t)));
    if (esatti.length === 1) return { esatto: esatti[0], candidati: [] };
    if (esatti.length >= 2) return { esatto: null, candidati: esatti.slice(0, 5) };
    const testoNorm = normalizzaTesto(testo);
    const punteggi = pool
      .map((v: any) => ({ v, score: Math.max(similarita(testoNorm, normalizzaTesto(`${v.cognome} ${v.nome}`)), similarita(testoNorm, normalizzaTesto(`${v.nome} ${v.cognome}`))) }))
      .filter((x: any) => x.score > 0.45)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 3);
    if (punteggi.length === 1 && punteggi[0].score > 0.8) return { esatto: punteggi[0].v, candidati: [] };
    return { esatto: null, candidati: punteggi.map((x: any) => x.v) };
  }
  async function salvaIntervento(dati: any, volontario: any): Promise<boolean> {
    const altri = dati.altri_volontari || [];
    const tuttiIds = [volontario.id, ...altri.map((v: any) => v.id)];
    const payload = {
      evento: dati.evento, data: dati.data, tipo_attivita: dati.tipo_attivita, luogo: dati.luogo || null,
      utente: `${volontario.nome} ${volontario.cognome} (via Telegram)`, n_volontari: tuttiIds.length, n_ore: dati.ore,
      n_ore_override: false, utilizzo_radio: false, volontari_ids: tuttiIds, note: dati.note || null,
    };
    const res = await fetch(`${SUPA_URL}/rest/v1/interventi`, { method: 'POST', headers: { ...HJ, Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    if (!(await checkOk(res, 'salvaIntervento'))) return false;
    const created = await res.json();
    const intId = Array.isArray(created) && created[0] ? created[0].id : null;
    if (intId) {
      const righe = tuttiIds.map(id => ({ intervento_id: intId, volontario_id: id, ore: dati.ore }));
      const res2 = await fetch(`${SUPA_URL}/rest/v1/intervento_volontari`, { method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify(righe) });
      await checkOk(res2, 'salvaIntervento (intervento_volontari)');
    }
    return true;
  }

  // --- Segnalazione emergenza ---
  async function finalizzaSegnalazione(chat_id: number, dati: any, volontario: any, lat: number, lon: number): Promise<boolean> {
    const foto_url = dati.file_id ? await caricaFotoESalva(dati.file_id) : null;
    const intervento_id = await getInterventoAttivo();
    const res = await fetch(`${SUPA_URL}/rest/v1/segnalazioni_emergenza`, {
      method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' },
      body: JSON.stringify({ volontario_id: volontario.id, intervento_id, lat, lon, foto_url, descrizione: dati.descrizione || null }),
    });
    if (!(await checkOk(res, 'finalizzaSegnalazione'))) return false;
    await resetStato(chat_id);
    return true;
  }

  try {
    // --- Callback da bottoni inline ---
    if (update.callback_query) {
      const cq = update.callback_query;
      const chat_id = cq.message.chat.id;
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      const volontario = await getVolontarioCollegato(chat_id);
      if (!volontario) { await sendMsg(chat_id, 'Devi prima collegare il tuo account con /start.'); return jsonResponse({ ok: true }); }
      const stato = await getStato(chat_id);
      const dati = stato?.dati || {};
      const [campo, valore] = String(cq.data).split(':');

      if (campo === 'data' && valore === 'oggi') { dati.data = oggiRoma(); await chiediTipo(chat_id, dati); }
      else if (campo === 'tipo') { dati.tipo_attivita = valore; await chiediLuogo(chat_id, dati); }
      else if (campo === 'luogo' && valore === 'skip') { dati.luogo = null; await chiediOre(chat_id, dati); }
      else if (campo === 'ore') {
        if (valore === 'altro') { await setStato(chat_id, 'ore_custom', dati); await sendMsg(chat_id, 'Scrivi il numero di ore (verrà arrotondato):', undefined); }
        else { dati.ore = Math.round(Number(valore)); await promptAltriVolontari(chat_id, dati); }
      } else if (cq.data === 'altrifine') { await chiediNote(chat_id, dati); }
      else if (campo === 'sceglivol') {
        if (valore !== 'no') {
          const scelto = (dati._candidatiTmp || []).find((c: any) => String(c.id) === valore);
          if (scelto) dati.altri_volontari = [...(dati.altri_volontari || []), scelto];
        } else if (dati._ultimoTesto) {
          dati.altri_non_trovati = [...(dati.altri_non_trovati || []), dati._ultimoTesto];
        }
        await promptAltriVolontari(chat_id, dati);
      }
      else if (campo === 'note' && valore === 'skip') { dati.note = null; await chiediConferma(chat_id, dati); }
      else if (campo === 'durata') {
        dati.durata_min = DURATE_POSIZIONE[valore] || 60;
        await setStato(chat_id, 'posizione_attesa_invio', dati);
        await sendMsg(chat_id, 'Ora invia la tua posizione.', tastieraPosizione());
      }
      else if (campo === 'conferma') {
        if (valore === 'si') {
          const ok = await salvaIntervento(dati, volontario);
          await resetStato(chat_id);
          await sendMsg(chat_id, ok ? '✅ Intervento registrato!' : '⚠️ Errore nel salvataggio, riprova con "📋 Registra intervento".');
        } else { await resetStato(chat_id); await sendMsg(chat_id, 'Operazione annullata.'); }
      }
      return jsonResponse({ ok: true });
    }

    const msg = update.message;
    const editedLoc = update.edited_message?.location;

    // --- Aggiornamento posizione live nativa di Telegram (nessuna risposta, per non fare spam) ---
    if (editedLoc) {
      const chat_id = update.edited_message.chat.id;
      const volontario = await getVolontarioCollegato(chat_id);
      if (volontario && !(await isInPausa(volontario.id))) {
        const minuti = editedLoc.live_period ? Math.round(editedLoc.live_period / 60) : undefined;
        await registraPosizione(volontario.id, editedLoc.latitude, editedLoc.longitude, minuti);
      }
      return jsonResponse({ ok: true });
    }

    if (!msg) return jsonResponse({ ok: true });
    const chat_id = msg.chat.id;
    const text = (msg.text || '').trim();

    // --- Collegamento account via contatto ---
    if (msg.contact) {
      const tel = normalizzaTelefono(msg.contact.phone_number || '');
      const r = await fetch(`${SUPA_URL}/rest/v1/volontari?select=id,nome,cognome,telefono&attivo=eq.true`, { headers: H });
      if (!(await checkOk(r, 'lookup volontari per collegamento'))) { await sendMsg(chat_id, '⚠️ Errore tecnico, riprova tra poco.', undefined); return jsonResponse({ ok: true }); }
      const tutti = await r.json();
      const match = (tutti || []).filter((v: any) => v.telefono && normalizzaTelefono(v.telefono) === tel);
      if (match.length === 1) {
        const linkRes = await fetch(`${SUPA_URL}/rest/v1/telegram_volontari`, { method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ telegram_chat_id: chat_id, volontario_id: match[0].id }) });
        if (!(await checkOk(linkRes, 'collegamento telegram_volontari'))) {
          await sendMsg(chat_id, '⚠️ Errore tecnico nel collegamento, riprova o contatta la segreteria.', undefined);
          return jsonResponse({ ok: true });
        }
        await resetStato(chat_id);
        await sendMsg(chat_id, `Ciao ${match[0].nome}! Account collegato ✅\nUsa i pulsanti qui sotto.`);
      } else if (match.length === 0) {
        await sendMsg(chat_id, 'Non trovo il tuo numero tra i volontari attivi. Contatta la segreteria.', undefined);
      } else {
        await sendMsg(chat_id, 'Il tuo numero risulta su più nominativi, non riesco a collegarti automaticamente. Contatta la segreteria.', undefined);
      }
      return jsonResponse({ ok: true });
    }

    if (text === '/start') {
      const volontario = await getVolontarioCollegato(chat_id);
      if (volontario) { await sendMsg(chat_id, `Bentornato ${volontario.nome}! Cosa vuoi fare?`); return jsonResponse({ ok: true }); }
      await setStato(chat_id, 'attesa_contatto', {});
      await sendMsg(chat_id, 'Ciao! Per collegare il tuo account condividi il tuo numero di telefono.', { keyboard: [[{ text: '📱 Condividi numero', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
      return jsonResponse({ ok: true });
    }
    if (text === '/annulla') { await resetStato(chat_id); await sendMsg(chat_id, 'Operazione annullata. Cosa vuoi fare?'); return jsonResponse({ ok: true }); }

    const volontario = await getVolontarioCollegato(chat_id);
    if (!volontario) { await sendMsg(chat_id, 'Scrivi /start per collegare il tuo account.', undefined); return jsonResponse({ ok: true }); }

    if (text === '/nuovo' || text === '📋 Registra intervento') {
      if (!volontario.bot_registra_interventi) { await sendMsg(chat_id, 'Non sei abilitato alla registrazione interventi. Contatta la segreteria.'); return jsonResponse({ ok: true }); }
      await chiediEvento(chat_id); return jsonResponse({ ok: true });
    }
    if (text === '📸 Segnala emergenza') {
      await sendMsg(chat_id, 'Manda la foto della segnalazione (puoi scrivere una descrizione come didascalia della foto).', undefined);
      return jsonResponse({ ok: true });
    }
    if (text === '📍 Condividi posizione') {
      const interventoAttivo = await getInterventoAttivo();
      if (!interventoAttivo) { await sendMsg(chat_id, '⚠️ Nessuna emergenza attiva al momento: la condivisione posizione è disponibile solo durante un intervento attivo.'); return jsonResponse({ ok: true }); }
      await sendMsg(chat_id, 'Per quanto tempo vuoi condividere la posizione?', tastieraDurata());
      return jsonResponse({ ok: true });
    }
    if (text === '⏹ Interrompi posizione') {
      await resetStato(chat_id);
      await interrompiPosizione(volontario.id);
      await sendMsg(chat_id, 'Condivisione posizione interrotta.');
      return jsonResponse({ ok: true });
    }

    // --- Posizione ricevuta fuori dal flusso segnalazione ---
    const statoAttuale = await getStato(chat_id);
    if (msg.location && statoAttuale?.step !== 'segnalazione_attesa_posizione') {
      let minuti: number | undefined;
      let creaPromemoria = false;
      if (statoAttuale?.step === 'posizione_attesa_invio') {
        minuti = statoAttuale.dati?.durata_min;
        creaPromemoria = true; // condivisione a durata scelta dal menu del bot: serve il promemoria periodico
        await resetStato(chat_id);
      } else if (msg.location.live_period) {
        minuti = Math.round(msg.location.live_period / 60); // condivisione "in tempo reale" nativa di Telegram, avviata senza passare dal menu (già continua da sola)
      }
      const esito = await registraPosizione(volontario.id, msg.location.latitude, msg.location.longitude, minuti, creaPromemoria);
      const nota = creaPromemoria ? `\nTi ricorderò di rimandarla ogni ${INTERVALLO_PROMEMORIA_MIN} minuti finché non scade o premi "⏹ Interrompi posizione".` : '';
      const testoEsito = esito === 'saved' ? `📍 Posizione ricevuta, grazie.${nota}`
        : esito === 'discarded' ? '⚠️ Nessuna emergenza attiva al momento: la posizione non è stata salvata.'
        : '⚠️ Errore nel salvataggio della posizione.';
      await sendMsg(chat_id, testoEsito);
      return jsonResponse({ ok: true });
    }

    // --- Foto -> avvio segnalazione ---
    if (msg.photo && msg.photo.length) {
      const file_id = msg.photo[msg.photo.length - 1].file_id;
      if (msg.caption) { await setStato(chat_id, 'segnalazione_attesa_posizione', { file_id, descrizione: msg.caption.trim() }); await sendMsg(chat_id, 'Ora invia la posizione della segnalazione.', tastieraPosizione()); }
      else { await setStato(chat_id, 'segnalazione_attesa_testo', { file_id }); await sendMsg(chat_id, 'Aggiungi una descrizione (o scrivi "salta").', undefined); }
      return jsonResponse({ ok: true });
    }

    if (!statoAttuale) { await sendMsg(chat_id, 'Usa i pulsanti qui sotto per iniziare.'); return jsonResponse({ ok: true }); }
    const dati = statoAttuale.dati || {};

    if (statoAttuale.step === 'segnalazione_attesa_testo') {
      dati.descrizione = /^salta$/i.test(text) ? null : (text || null);
      await setStato(chat_id, 'segnalazione_attesa_posizione', dati);
      await sendMsg(chat_id, 'Ora invia la posizione della segnalazione.', tastieraPosizione());
    } else if (statoAttuale.step === 'segnalazione_attesa_posizione' && msg.location) {
      const ok = await finalizzaSegnalazione(chat_id, dati, volontario, msg.location.latitude, msg.location.longitude);
      await sendMsg(chat_id, ok ? '✅ Segnalazione inviata alla segreteria.' : '⚠️ Errore nel salvataggio della segnalazione, riprova.');
    } else if (statoAttuale.step === 'evento') {
      if (!text) { await sendMsg(chat_id, 'Scrivi il nome/evento.', undefined); return jsonResponse({ ok: true }); }
      dati.evento = text; await chiediData(chat_id, dati);
    } else if (statoAttuale.step === 'data') {
      const iso = parseDataItaliana(text);
      if (!iso) { await sendMsg(chat_id, 'Formato non valido, scrivi gg/mm/aaaa.', undefined); return jsonResponse({ ok: true }); }
      dati.data = iso; await chiediTipo(chat_id, dati);
    } else if (statoAttuale.step === 'luogo') { dati.luogo = text || null; await chiediOre(chat_id, dati); }
    else if (statoAttuale.step === 'ore_custom') {
      const n = Math.round(Number(text.replace(',', '.')));
      if (!n || n <= 0) { await sendMsg(chat_id, 'Scrivi un numero valido di ore.', undefined); return jsonResponse({ ok: true }); }
      dati.ore = n; await promptAltriVolontari(chat_id, dati);
    } else if (statoAttuale.step === 'altri_volontari_nome') {
      if (!text) { await sendMsg(chat_id, 'Scrivi un nome, oppure premi "Fine".', undefined); return jsonResponse({ ok: true }); }
      const giaAggiunti = (dati.altri_volontari || []).map((v: any) => v.id);
      const { esatto, candidati } = await cercaVolontarioSingolo(text, [volontario.id, ...giaAggiunti]);
      if (esatto) { dati.altri_volontari = [...(dati.altri_volontari || []), esatto]; await promptAltriVolontari(chat_id, dati); }
      else if (candidati.length) {
        dati._candidatiTmp = candidati; dati._ultimoTesto = text;
        await setStato(chat_id, 'altri_volontari_nome', dati);
        const bottoni = candidati.map((c: any) => [{ text: `${c.nome} ${c.cognome}`, callback_data: `sceglivol:${c.id}` }]);
        bottoni.push([{ text: 'Nessuno di questi', callback_data: 'sceglivol:no' }]);
        await sendMsg(chat_id, `Forse intendevi (per "${text}")?`, { inline_keyboard: bottoni });
      } else {
        dati.altri_non_trovati = [...(dati.altri_non_trovati || []), text];
        await sendMsg(chat_id, `Non trovo "${text}" tra i volontari attivi, lo segno per l'aggiunta manuale.`, undefined);
        await promptAltriVolontari(chat_id, dati);
      }
    } else if (statoAttuale.step === 'note') { dati.note = text || null; await chiediConferma(chat_id, dati); }
    else { await sendMsg(chat_id, 'Usa i pulsanti, oppure /annulla per ricominciare.'); }
    return jsonResponse({ ok: true });
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: true });
  }
});

export default {
  fetch: (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    return handlerAutenticato(req);
  },
};
