// Supabase Edge Function: bot-app
//
// Le azioni dell'area riservata sul bot (pagina S.C.I., Eventi, schede): link personali,
// scollegamento, iscritti, messaggi massivi, risposta alle richieste dei volontari.
// verify_jwt = false perché il controllo è qui: ogni richiesta porta il token della sessione e
// passa da ho_permesso eseguito con quel token, prima di qualunque altra cosa.
// Azioni del bot: permesso 'eventi' o 'sci'. Risposta alle richieste: 'sci' o 'gestione_segnalazioni'.
// Tracciamento (S.C.I. fase 2): 'richiedi_posizione' apre le richieste in evento_tracciamento e manda le
// istruzioni ai destinatari scelti; 'termina_tracciamento' le chiude e avvisa chi stava condividendo.
// Invio a un massimo di 25 messaggi al secondo. Una chat bloccata non ferma gli altri invii.

import { ambiente, sha256, pulisci, statoAbilitato, dbLeggi, dbScrivi, tg, logAttivita } from '../_shared/bot.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const VALIDITA_LINK_MS = 7 * 86400000;
const PAUSA_MS = 40;   // 25 messaggi al secondo
const MAX_TESTO = 4000;
const ARPA_URL = 'https://www.arpa.piemonte.it/bollettino/allerta-meteoidrologica-idraulica';
const ARPA_MAX_ETA_MS = 35 * 60 * 1000;   // come allerta-home.js
const LIVELLI: Record<string, string> = { VERDE: 'verde', GIALLO: 'giallo', ARANCIONE: 'arancione', ROSSO: 'rosso', BIANCO: 'non valutato', SCONOSCIUTO: 'non disponibile' };
const RISCHI: Record<string, string> = { idrogeologico: 'Idrogeologico', idraulico: 'Idraulico', temporali: 'Temporali', neve: 'Neve' };

const dorme = (ms: number) => new Promise(r => setTimeout(r, ms));

// Con il token dell'utente: PostgREST rifiuta un token non valido e ho_permesso legge chi è
async function utenteAutorizzato(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const { supaUrl, anon } = ambiente();
  const rpc = async (nome: string, corpo: unknown) => {
    const r = await fetch(supaUrl + '/rest/v1/rpc/' + nome, { method: 'POST', headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return r.ok ? await r.json() : null;
  };
  const ha = async (k: string) => (await rpc('ho_permesso', { chiave: k })) === true;
  const [eventi, sci, gest] = await Promise.all([ha('eventi'), ha('sci'), ha('gestione_segnalazioni')]);
  const bot = eventi || sci, richieste = sci || gest;
  if (!bot && !richieste) return null;
  const p = await rpc('mio_profilo', {});
  const u = Array.isArray(p) ? p[0] : p;
  if (!u || !u.tipo || u.tipo === 'volontario') return null;
  return { nome: [u.cognome, u.nome].filter(Boolean).join(' ') || 'Staff', bot, richieste };
}

// -- COLLEGAMENTO --
async function stato(b: any) {
  const [c] = await dbLeggi('bot_chat?volontario_id=eq.' + Number(b.volontario_id) + '&select=collegato_il');
  return { ok: true, collegato: !!c, collegato_il: c ? c.collegato_il : null };
}

async function creaLink(b: any, utente: string) {
  const id = Number(b.volontario_id);
  const [v] = id ? await dbLeggi('volontari?id=eq.' + id + '&select=id,cognome,nome,stato') : [];
  if (!v || !statoAbilitato(v.stato)) return json({ ok: false, error: 'Il link si crea solo per volontari attivi o in operatività ridotta.' }, 400);
  const me = await tg('getMe', {});
  if (!me.ok || !me.result?.username) throw new Error('getMe: ' + me.descrizione);
  const casuali = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...casuali)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const scade = new Date(Date.now() + VALIDITA_LINK_MS).toISOString();
  // Un link nuovo annulla quelli ancora aperti dello stesso volontario
  await dbScrivi('PATCH', 'bot_link_token?volontario_id=eq.' + id + '&usato_il=is.null', { usato_il: new Date().toISOString() }, 'return=minimal');
  await dbScrivi('POST', 'bot_link_token', { token_hash: await sha256(token), volontario_id: id, creato_da: utente, scade_il: scade }, 'return=minimal');
  await logAttivita(utente, 'ha creato il link bot per ' + v.cognome + ' ' + v.nome);
  return json({ ok: true, link: 'https://t.me/' + me.result.username + '?start=' + token, scade_il: scade });
}

async function scollega(b: any, utente: string) {
  const id = Number(b.volontario_id);
  const [v] = id ? await dbLeggi('volontari?id=eq.' + id + '&select=cognome,nome') : [];
  if (!v) return json({ ok: false, error: 'Volontario non trovato.' }, 400);
  await dbScrivi('DELETE', 'bot_chat?volontario_id=eq.' + id);
  await logAttivita(utente, 'ha scollegato dal bot ' + v.cognome + ' ' + v.nome);
  return json({ ok: true });
}

// -- DESTINATARI --
async function collegati() {
  const chat = await dbLeggi('bot_chat?select=volontario_id,chat_id');
  if (!chat.length) return [];
  const vol = await dbLeggi('volontari?id=in.(' + chat.map(c => c.volontario_id).join(',') + ')&select=id,cognome,nome,stato,squadra');
  return chat.flatMap(c => {
    const v = vol.find(x => x.id === c.volontario_id);
    return v && statoAbilitato(v.stato) ? [{ chat_id: c.chat_id, volontario_id: v.id, nome: v.cognome + ' ' + v.nome, squadra: v.squadra || '' }] : [];
  });
}

async function destinatari(b: any) {
  const tutti = await collegati();
  if (b.tipo === 'tutti') return { elenco: tutti, testo: 'Tutti i collegati' };
  if (b.tipo === 'squadra' && b.squadra) return { elenco: tutti.filter(x => x.squadra === b.squadra), testo: 'Squadra ' + b.squadra };
  if (b.tipo === 'scelti' && Array.isArray(b.volontari) && b.volontari.length) {
    const ids = new Set(b.volontari.map(Number));
    const elenco = tutti.filter(x => ids.has(x.volontario_id));
    return { elenco, testo: elenco.length === 1 ? elenco[0].nome : elenco.length + ' volontari scelti' };
  }
  if (b.tipo === 'evento' && Number(b.evento_id)) {
    const id = Number(b.evento_id);
    const [ev] = await dbLeggi('eventi?id=eq.' + id + '&select=titolo');
    if (!ev) return null;
    const sq = await dbLeggi('evento_volontari?evento_id=eq.' + id + '&presente=eq.true&select=volontario_id');
    return { elenco: tutti.filter(x => sq.some(s => s.volontario_id === x.volontario_id)), testo: 'Squadra dell\'evento: ' + ev.titolo };
  }
  return null;
}

// -- ISCRITTI --
// Collegati (con data) e volontari attivi o in op. ridotta non collegati (con telefono, per contattarli)
async function iscritti() {
  const [chat, vol] = await Promise.all([
    dbLeggi('bot_chat?select=volontario_id,collegato_il'),
    dbLeggi('volontari?select=id,cognome,nome,squadra,telefono,stato&order=cognome,nome&limit=5000'),
  ]);
  const quando = new Map(chat.map(c => [c.volontario_id, c.collegato_il]));
  const attivi = vol.filter(v => statoAbilitato(v.stato));
  return {
    ok: true,
    collegati: attivi.filter(v => quando.has(v.id)).map(v => ({ volontario_id: v.id, cognome: v.cognome, nome: v.nome, squadra: v.squadra || '', collegato_il: quando.get(v.id) })),
    mancanti: attivi.filter(v => !quando.has(v.id)).map(v => ({ volontario_id: v.id, cognome: v.cognome, nome: v.nome, squadra: v.squadra || '', telefono: v.telefono || '' })),
  };
}

// -- RISPOSTA ALLE RICHIESTE DEI VOLONTARI (tabella segnalazioni) --
// Salva la risposta e, se richiesto e il volontario è collegato, gliela manda anche sul bot.
async function rispondiRichiesta(b: any, utente: string) {
  const id = Number(b.id);
  const risposta = String(b.risposta ?? '').trim();
  if (risposta.length > MAX_TESTO) return json({ ok: false, error: 'La risposta supera i ' + MAX_TESTO + ' caratteri.' }, 400);
  const [s] = id ? await dbLeggi('segnalazioni?id=eq.' + id + '&select=id,volontario_id,data_creazione') : [];
  if (!s) return json({ ok: false, error: 'Richiesta non trovata.' }, 400);
  await dbScrivi('PATCH', 'segnalazioni?id=eq.' + id, { note_admin: risposta || null }, 'return=minimal');
  const [c] = await dbLeggi('bot_chat?volontario_id=eq.' + Number(s.volontario_id) + '&select=chat_id');
  let inviato = false;
  if (b.avvisa && c && risposta) {
    const data = new Date(s.data_creazione).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' });
    const r = await inviaUno(Number(c.chat_id), '📩 Hai una risposta alla tua segnalazione del ' + data + ':\n«' + risposta + '»\n\nLa trovi anche in Area Riservata → Segnalazioni.');
    inviato = r.ok;
  }
  await logAttivita(utente, 'ha risposto alla richiesta n. ' + id + (inviato ? ' (inviata anche sul bot)' : ''));
  return json({ ok: true, collegato: !!c, inviato });
}

// -- ARPA --
// Non esiste un PDF del bollettino da scaricare: né il CAP-XML né la pagina ARPA lo espongono.
// Mai un verde finto: dato assente, scaduto o incompleto si dice, senza livelli.
function dataIt(s: string) { return new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

async function testoArpa() {
  const { supaUrl } = ambiente();
  try { await fetch(supaUrl + '/functions/v1/allerta-arpa', { method: 'POST', signal: AbortSignal.timeout(20000) }); } catch { /* resta il dato in cache */ }
  const [c] = await dbLeggi('allerta_cache?id=eq.1&select=numero_bollettino,valido_al,aggiornato_il,rischi');
  const link = '\n\nBollettino ufficiale: ' + ARPA_URL;
  if (!c || !c.aggiornato_il || !c.rischi) return 'Allerta ARPA: dato non disponibile.' + link;
  const eta = Date.now() - Date.parse(c.aggiornato_il);
  if (eta > ARPA_MAX_ETA_MS) return 'Allerta ARPA: dato non aggiornato dal ' + dataIt(c.aggiornato_il) + '. Controlla il bollettino ufficiale.' + link;
  if (c.valido_al && Date.parse(c.valido_al) < Date.now()) return 'Allerta ARPA: bollettino scaduto il ' + dataIt(c.valido_al) + '. Controlla il bollettino ufficiale.' + link;
  const righe = Object.keys(RISCHI).map(k => '• ' + RISCHI[k] + ': oggi ' + (LIVELLI[c.rischi[k]?.g0] || LIVELLI.SCONOSCIUTO) + ', domani ' + (LIVELLI[c.rischi[k]?.g1] || LIVELLI.SCONOSCIUTO));
  return 'Allerta ARPA Piemonte, zona Pianura Settentrionale (bollettino ' + (c.numero_bollettino || 'n.d.') + '):\n' + righe.join('\n') + link;
}

// -- INVIO --
async function inviaUno(chat: number, text: string) {
  let r = await tg('sendMessage', { chat_id: chat, text });
  if (r.status === 429) {
    await dorme(((r.attesa || 1) + 1) * 1000);
    r = await tg('sendMessage', { chat_id: chat, text });
  }
  return r;
}

async function invia(b: any, utente: string) {
  const testo = String(b.testo || '').trim();
  if (!testo) return json({ ok: false, error: 'Scrivi il testo del messaggio.' }, 400);
  if (testo.length > MAX_TESTO) return json({ ok: false, error: 'Il testo supera i ' + MAX_TESTO + ' caratteri.' }, 400);
  const d = await destinatari(b);
  if (!d) return json({ ok: false, error: 'Destinatari non validi.' }, 400);
  if (!d.elenco.length) return json({ ok: false, error: 'Nessun destinatario collegato al bot.' }, 400);
  const arpa = b.arpa ? await testoArpa() : '';
  const [riga] = await dbScrivi('POST', 'bot_invii', { utente, testo, destinatari: d.testo, con_arpa: !!b.arpa, n_destinatari: d.elenco.length });
  const falliti: { nome: string; motivo: string }[] = [];
  let consegnati = 0;
  for (const x of d.elenco) {
    try {
      const r = await inviaUno(x.chat_id, testo);
      if (!r.ok) falliti.push({ nome: x.nome, motivo: r.status === 403 ? 'Ha bloccato il bot' : r.status === 400 ? 'Chat non valida' : 'Errore di invio' });
      else {
        consegnati++;
        if (arpa) { await dorme(PAUSA_MS); await inviaUno(x.chat_id, arpa); }
      }
    } catch (e) {
      console.error('invio fallito:', pulisci(e));
      falliti.push({ nome: x.nome, motivo: 'Errore di invio' });
    }
    await dorme(PAUSA_MS);
  }
  await dbScrivi('PATCH', 'bot_invii?id=eq.' + riga.id, { consegnati, falliti: falliti.length, dettaglio_falliti: falliti, concluso_il: new Date().toISOString() }, 'return=minimal');
  await logAttivita(utente, 'ha inviato un messaggio bot a ' + d.testo + ': ' + consegnati + ' consegnati, ' + falliti.length + ' falliti');
  return json({ ok: true, n: d.elenco.length, consegnati, falliti });
}

// -- TRACCIAMENTO --
async function eventoInCorso(id: number) {
  const [ev] = id ? await dbLeggi('eventi?id=eq.' + id + '&select=id,titolo,tipo,stato') : [];
  return ev && ev.stato === 'IN CORSO' ? ev : null;
}

function istruzioniPosizione(ev: any) {
  return '📍 Richiesta di posizione in tempo reale\n' + (ev.tipo === 'EMERGENZA' ? 'Emergenza' : ev.tipo === 'ESERCITAZIONE' ? 'Esercitazione' : 'Evento') + ': ' + ev.titolo + '\n\n'
    + 'Condividi la tua posizione in tempo reale:\n'
    + '1. tocca la graffetta 📎 qui in basso\n'
    + '2. scegli Posizione\n'
    + '3. tocca «Condividi posizione in tempo reale» e scegli 8 ore\n\n'
    + 'La vede solo lo staff e resta legata a questo evento. Per smettere interrompi la condivisione oppure scrivi /stop.';
}

async function richiediPosizione(b: any, utente: string) {
  const ev = await eventoInCorso(Number(b.evento_id));
  if (!ev) return json({ ok: false, error: 'La richiesta di posizione si manda solo per un evento IN CORSO.' }, 400);
  const d = await destinatari(b);
  if (!d) return json({ ok: false, error: 'Destinatari non validi.' }, 400);
  if (!d.elenco.length) return json({ ok: false, error: 'Nessun destinatario collegato al bot.' }, 400);
  const ora = new Date().toISOString();
  await dbScrivi('POST', 'evento_tracciamento?on_conflict=evento_id,volontario_id',
    d.elenco.map(x => ({ evento_id: ev.id, volontario_id: x.volontario_id, richiesto_il: ora, richiesto_da: utente, fermato_il: null, fermato_da: null })),
    'resolution=merge-duplicates,return=minimal');
  const extra = String(b.testo || '').trim();
  return await invia({ ...b, arpa: false, testo: (extra ? extra + '\n\n' : '') + istruzioniPosizione(ev) }, utente);
}

async function terminaTracciamento(b: any, utente: string) {
  const id = Number(b.evento_id);
  const [ev] = id ? await dbLeggi('eventi?id=eq.' + id + '&select=id,titolo') : [];
  if (!ev) return json({ ok: false, error: 'Evento non trovato.' }, 400);
  const chiusi = await dbScrivi('PATCH', 'evento_tracciamento?evento_id=eq.' + id + '&fermato_il=is.null', { fermato_il: new Date().toISOString(), fermato_da: utente });
  let avvisati = 0;
  if (b.avvisa !== false && chiusi.length) {
    const chat = await dbLeggi('bot_chat?volontario_id=in.(' + chiusi.map((c: any) => c.volontario_id).join(',') + ')&select=chat_id');
    for (const c of chat) {
      try { if ((await inviaUno(Number(c.chat_id), '✅ Il tracciamento per «' + ev.titolo + '» è terminato: puoi interrompere la condivisione della posizione. Grazie!')).ok) avvisati++; } catch (_) { /* prossimo */ }
      await dorme(PAUSA_MS);
    }
  }
  await logAttivita(utente, 'ha terminato il tracciamento dell\'evento ' + ev.titolo + ' (' + chiusi.length + ' volontari)');
  return json({ ok: true, chiusi: chiusi.length, avvisati });
}

export async function gestisci(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'metodo non supportato' }, 405);
  const chi = await utenteAutorizzato(req).catch(() => null);
  if (!chi) return json({ ok: false, error: 'Non disponibile.' }, 403);
  const utente = chi.nome;
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'richiesta non valida' }, 400); }
  const negato = () => json({ ok: false, error: 'Non disponibile.' }, 403);
  try {
    if (b.azione === 'rispondi_richiesta') return chi.richieste ? await rispondiRichiesta(b, utente) : negato();
    if (!chi.bot) return negato();
    switch (b.azione) {
      case 'iscritti': return json(await iscritti());
      case 'stato': return json(await stato(b));
      case 'crea_link': return await creaLink(b, utente);
      case 'scollega': return await scollega(b, utente);
      case 'squadre': {
        const tutti = await collegati();
        return json({ ok: true, n: tutti.length, squadre: [...new Set(tutti.map(x => x.squadra).filter(Boolean))].sort() });
      }
      case 'conta': {
        const d = await destinatari(b);
        return d ? json({ ok: true, n: d.elenco.length, destinatari: d.testo }) : json({ ok: false, error: 'Destinatari non validi.' }, 400);
      }
      case 'invia': return await invia(b, utente);
      case 'richiedi_posizione': return await richiediPosizione(b, utente);
      case 'termina_tracciamento': return await terminaTracciamento(b, utente);
      default: return json({ ok: false, error: 'azione sconosciuta' }, 400);
    }
  } catch (e) {
    console.error('errore bot-app:', pulisci(e));
    return json({ ok: false, error: 'Operazione non riuscita. Riprova tra poco.' }, 500);
  }
}

Deno.serve(gestisci);
