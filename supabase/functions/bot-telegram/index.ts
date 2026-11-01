// Supabase Edge Function: bot-telegram
//
// Webhook del bot per gli Eventi. Pubblica (verify_jwt = false) perché la chiama Telegram:
// l'unica prova di provenienza è l'header X-Telegram-Bot-Api-Secret-Token, confrontato con il
// segreto TELEGRAM_WEBHOOK_SECRET prima di qualunque altro lavoro. Senza: 401.
//
// Risponde solo alle chat collegate con il link monouso a un volontario ATTIVO o SOSPESO.
// Una foto diventa una riga in evento_segnalazioni quando ha emergenza e posizione: nel frattempo
// resta in bot_attese per 10 minuti, senza scaricare il file.
// Le emergenze sono eventi con tipo EMERGENZA e stato IN CORSO, come in eventi.js.

import { ambiente, uguali, sha256, pulisci, statoAbilitato, NON_ABILITATO, dbLeggi, dbScrivi, tg, scaricaFile, logAttivita } from '../_shared/bot.ts';
import { leggiGpsExif } from '../_shared/exif.ts';

const FINESTRA_MS = 10 * 60 * 1000;
const MAX_FILE = 20 * 1024 * 1024;
const NOME_LOG = 'Bot Telegram';
const AIUTO = 'Come funziona:\n'
  + '• Invia una foto con una didascalia facoltativa: viene registrata come segnalazione dell\'emergenza in corso.\n'
  + '• Se invii la foto come file, la posizione si legge dalla foto, quando c\'è. Altrimenti te la chiedo io.\n'
  + '• Puoi anche inviare prima la posizione: vale per le foto dei 10 minuti successivi.\n\n'
  + 'Comandi: /aiuto';

const manda = (chat: number, text: string, extra: Record<string, unknown> = {}) => tg('sendMessage', { chat_id: chat, text, ...extra });
const togliTastiera = { reply_markup: { remove_keyboard: true } };
const adesso = () => new Date().toISOString();
const limite = () => new Date(Date.now() - FINESTRA_MS).toISOString();

async function volontarioDiChat(chat: number) {
  const righe = await dbLeggi('bot_chat?chat_id=eq.' + chat + '&select=volontario_id');
  if (!righe[0]) return null;
  const [v] = await dbLeggi('volontari?id=eq.' + righe[0].volontario_id + '&select=id,cognome,nome,stato');
  return v && statoAbilitato(v.stato) ? v : null;
}

const emergenzeInCorso = () => dbLeggi('eventi?tipo=eq.EMERGENZA&stato=eq.' + encodeURIComponent('IN CORSO') + '&select=id,titolo,luogo&order=data_inizio.desc');

// -- COLLEGAMENTO --
async function collega(chat: number, token: string) {
  const hash = await sha256(token);
  const [riga] = await dbLeggi('bot_link_token?token_hash=eq.' + hash + '&usato_il=is.null&scade_il=gt.' + encodeURIComponent(adesso()) + '&select=id,volontario_id');
  const [v] = riga ? await dbLeggi('volontari?id=eq.' + riga.volontario_id + '&select=id,cognome,nome,stato') : [];
  if (!v || !statoAbilitato(v.stato)) {
    const gia = await volontarioDiChat(chat);
    await manda(chat, gia ? 'Questo link non è valido, è scaduto o è già stato usato. Chiedi alla segreteria un nuovo link.' : NON_ABILITATO);
    return;
  }
  // Il filtro su usato_il rende il link davvero monouso anche con due aperture insieme
  const preso = await dbScrivi('PATCH', 'bot_link_token?id=eq.' + riga.id + '&usato_il=is.null', { usato_il: adesso() });
  if (!preso.length) { await manda(chat, NON_ABILITATO); return; }
  await dbScrivi('DELETE', 'bot_chat?chat_id=eq.' + chat);
  await dbScrivi('DELETE', 'bot_chat?volontario_id=eq.' + v.id);
  await dbScrivi('POST', 'bot_chat', { volontario_id: v.id, chat_id: chat });
  await logAttivita(NOME_LOG, 'ha collegato ' + v.cognome + ' ' + v.nome + ' con il link personale');
  await manda(chat, 'Collegamento riuscito, ' + v.nome + '.\n\n' + AIUTO);
}

// -- FOTO --
function fotoDelMessaggio(m: any) {
  if (Array.isArray(m.photo) && m.photo.length) {
    const f = m.photo[m.photo.length - 1];
    return { fileId: f.file_id, dim: f.file_size || 0, comeFile: false };
  }
  if (m.document) return { fileId: m.document.file_id, dim: m.document.file_size || 0, comeFile: true, mime: m.document.mime_type || '' };
  return null;
}

async function ultimaPosizione(chat: number) {
  const [p] = await dbLeggi('bot_posizioni?chat_id=eq.' + chat + '&creato_il=gte.' + encodeURIComponent(limite()) + '&select=lat,lon&order=creato_il.desc&limit=1');
  return p || null;
}

async function fotoRicevuta(chat: number, v: any, m: any) {
  const f = fotoDelMessaggio(m)!;
  if (f.comeFile && f.mime !== 'image/jpeg') {
    await manda(chat, 'Posso leggere solo file JPEG. Riprova inviandola come foto normale, non come file.');
    return;
  }
  if (f.dim > MAX_FILE) { await manda(chat, 'Il file è troppo grande (massimo 20 MB). Inviala come foto normale, non come file.'); return; }
  const eventi = await emergenzeInCorso();
  if (!eventi.length) { await manda(chat, 'Non c\'è nessuna emergenza attiva: la foto non è stata salvata.'); return; }

  let pos: { lat: number; lon: number } | null = null;
  if (f.comeFile) pos = leggiGpsExif(await scaricaFile(f.fileId));
  if (!pos) pos = await ultimaPosizione(chat);
  const [a] = await dbScrivi('POST', 'bot_attese', {
    chat_id: chat, volontario_id: v.id, file_id: f.fileId, didascalia: (m.caption || '').trim().slice(0, 1000) || null,
    lat: pos ? pos.lat : null, lon: pos ? pos.lon : null, evento_id: eventi.length === 1 ? eventi[0].id : null,
  });
  await avanza(chat, a, v, eventi);
}

// Chiede ciò che manca, nell'ordine: emergenza, posizione. Con tutto, salva.
async function avanza(chat: number, a: any, v: any, eventi?: any[]) {
  if (!a.evento_id) {
    const lista = eventi || await emergenzeInCorso();
    if (!lista.length) {
      await dbScrivi('DELETE', 'bot_attese?id=eq.' + a.id);
      await manda(chat, 'Non c\'è nessuna emergenza attiva: la foto non è stata salvata.', togliTastiera);
      return;
    }
    await manda(chat, 'A quale emergenza si riferisce la foto?', {
      reply_markup: { inline_keyboard: lista.map(e => [{ text: (e.titolo + (e.luogo ? ' - ' + e.luogo : '')).slice(0, 60), callback_data: 'ev:' + a.id + ':' + e.id }]) },
    });
    return;
  }
  if (a.lat == null || a.lon == null) {
    await manda(chat, 'Ho ricevuto la foto, ma manca la posizione. Premi il pulsante qui sotto entro 10 minuti.', {
      reply_markup: { keyboard: [[{ text: 'Invia la posizione', request_location: true }]], resize_keyboard: true, one_time_keyboard: true },
    });
    return;
  }
  await salvaSegnalazione(chat, a, v);
}

async function salvaSegnalazione(chat: number, a: any, v: any) {
  const [ev] = await dbLeggi('eventi?id=eq.' + a.evento_id + '&tipo=eq.EMERGENZA&stato=eq.' + encodeURIComponent('IN CORSO') + '&select=id,titolo');
  if (!ev) {
    await dbScrivi('DELETE', 'bot_attese?id=eq.' + a.id);
    await manda(chat, 'Questa emergenza non è più attiva: la foto non è stata salvata.', togliTastiera);
    return;
  }
  const { supaUrl, service } = ambiente();
  const bytes = await scaricaFile(a.file_id);
  const carica = (p: string) => fetch(supaUrl + '/storage/v1/object/segnalazioni/' + p, {
    method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'image/jpeg' }, body: bytes,
  });
  const cartella = ev.id + '/' + v.id + '/', ora = Date.now();
  let percorso = cartella + ora + '.jpg';
  let up = await carica(percorso);
  if (up.status === 400 || up.status === 409) {   // due foto dello stesso album nello stesso millisecondo
    percorso = cartella + (ora + 1) + '.jpg';
    up = await carica(percorso);
  }
  if (!up.ok) throw new Error('caricamento foto: ' + up.status);
  try {
    await dbScrivi('POST', 'evento_segnalazioni', {
      evento_id: ev.id, volontario_id: v.id, descrizione: a.didascalia, foto_path: 'segnalazioni/' + percorso, lat: a.lat, lon: a.lon, gestita: false,
    }, 'return=minimal');
  } catch (e) {
    await fetch(supaUrl + '/storage/v1/object/segnalazioni/' + percorso, { method: 'DELETE', headers: { apikey: service, Authorization: 'Bearer ' + service } });
    throw e;
  }
  await dbScrivi('DELETE', 'bot_attese?id=eq.' + a.id);
  await logAttivita(NOME_LOG, 'ha registrato una segnalazione di ' + v.cognome + ' ' + v.nome + ' per l\'evento: ' + ev.titolo);
  await manda(chat, 'Segnalazione registrata.', togliTastiera);
}

// Le foto ferme da più di 10 minuti non restano appese: si avvisa e si tolgono
async function scadute(chat: number) {
  const vecchie = await dbScrivi('DELETE', 'bot_attese?chat_id=eq.' + chat + '&creato_il=lt.' + encodeURIComponent(limite()));
  if (vecchie.length) await manda(chat, 'Sono passati più di 10 minuti: ' + (vecchie.length === 1 ? 'la foto precedente non è stata salvata. Inviala di nuovo.' : vecchie.length + ' foto precedenti non sono state salvate. Inviale di nuovo.'), togliTastiera);
}

async function posizioneRicevuta(chat: number, v: any, l: any) {
  await dbScrivi('POST', 'bot_posizioni', { chat_id: chat, lat: l.latitude, lon: l.longitude }, 'return=minimal');
  const attese = await dbLeggi('bot_attese?chat_id=eq.' + chat + '&lat=is.null&select=id,file_id,didascalia,lat,lon,evento_id,creato_il&order=creato_il');
  if (!attese.length) { await manda(chat, 'Posizione ricevuta. Ora invia la foto entro 10 minuti.', togliTastiera); return; }
  for (const a of attese) {
    const [agg] = await dbScrivi('PATCH', 'bot_attese?id=eq.' + a.id, { lat: l.latitude, lon: l.longitude });
    await avanza(chat, agg, v);
  }
}

async function sceltaEmergenza(cb: any) {
  const chat = cb.message?.chat?.id;
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  if (!chat) return;
  const v = await volontarioDiChat(chat);
  if (!v) { await manda(chat, NON_ABILITATO); return; }
  await scadute(chat);
  const m = String(cb.data || '').match(/^ev:(\d+):(\d+)$/);
  const [a] = m ? await dbLeggi('bot_attese?id=eq.' + m[1] + '&chat_id=eq.' + chat + '&select=id,file_id,didascalia,lat,lon,evento_id') : [];
  if (!a) { await manda(chat, 'Questa foto non è più in attesa. Inviala di nuovo.'); return; }
  const [agg] = await dbScrivi('PATCH', 'bot_attese?id=eq.' + a.id, { evento_id: Number(m![2]) });
  await avanza(chat, agg, v);
}

// -- MESSAGGI --
async function messaggio(m: any) {
  const chat = m.chat.id;
  if (m.chat.type !== 'private') return;
  const testo = String(m.text || '').trim();
  const start = testo.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  if (start && start[1]) { await collega(chat, start[1]); return; }

  const v = await volontarioDiChat(chat);
  if (!v) { await manda(chat, NON_ABILITATO); return; }
  await scadute(chat);

  if (start) { await manda(chat, 'Ciao ' + v.nome + '.\n\n' + AIUTO); return; }
  if (/^\/aiuto(@\w+)?$/.test(testo)) { await manda(chat, AIUTO); return; }
  if (m.location) { await posizioneRicevuta(chat, v, m.location); return; }
  if (fotoDelMessaggio(m)) { await fotoRicevuta(chat, v, m); return; }
  const [ferma] = await dbLeggi('bot_attese?chat_id=eq.' + chat + '&lat=is.null&select=id&limit=1');
  await manda(chat, ferma ? 'Sto aspettando la posizione della foto: usa il pulsante "Invia la posizione".' : 'Non ho capito. Invia una foto o scrivi /aiuto.');
}

export async function gestisci(req: Request): Promise<Response> {
  const { segreto } = ambiente();
  const ricevuto = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!segreto || !uguali(ricevuto, segreto)) return new Response('non autorizzato', { status: 401 });
  if (req.method !== 'POST') return new Response('metodo non supportato', { status: 405 });

  let u: any;
  try { u = await req.json(); } catch { return new Response('ok'); }
  const chat = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
  try {
    // Telegram ripete un aggiornamento se la risposta tarda: il secondo si riconosce e si ignora
    const nuovo = await dbScrivi('POST', 'bot_update_visti?on_conflict=update_id', { update_id: u.update_id }, 'resolution=ignore-duplicates,return=representation');
    if (!nuovo.length) return new Response('ok');
    await dbScrivi('DELETE', 'bot_update_visti?visto_il=lt.' + encodeURIComponent(new Date(Date.now() - 2 * 86400000).toISOString()), undefined, 'return=minimal');
    if (u.message) await messaggio(u.message);
    else if (u.callback_query) await sceltaEmergenza(u.callback_query);
  } catch (e) {
    console.error('errore bot:', pulisci(e));
    if (chat) { try { await manda(chat, 'Si è verificato un errore e l\'operazione non è riuscita. Riprova tra poco.'); } catch (x) { console.error('avviso non inviato:', pulisci(x)); } }
  }
  return new Response('ok');   // sempre 200: un errore qui non va ripetuto da Telegram
}

Deno.serve(gestisci);
