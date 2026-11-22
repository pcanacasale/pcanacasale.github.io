// Supabase Edge Function: bot-telegram
//
// Webhook del bot per gli Eventi. Pubblica (verify_jwt = false) perché la chiama Telegram:
// l'unica prova di provenienza è l'header X-Telegram-Bot-Api-Secret-Token, confrontato con il
// segreto TELEGRAM_WEBHOOK_SECRET prima di qualunque altro lavoro. Senza: 401.
//
// Il volontario si collega inviando il proprio numero con il pulsante di Telegram: vale solo se
// il contatto è quello dell'utente che scrive (contact.user_id = from.id, numero verificato da
// Telegram) e corrisponde a una sola scheda ATTIVO o OP_RIDOTTA. In alternativa resta il link
// personale monouso generato dall'app.
// Una foto diventa una riga in evento_segnalazioni: per l'evento IN CORSO (emergenza o
// esercitazione) oppure, se non ce n'è nessuno, come segnalazione generica (evento_id nullo).
// Nel frattempo resta in bot_attese per 10 minuti, senza scaricare il file.
//
// Tracciamento (S.C.I. fase 2): lo staff manda da S.C.I. la richiesta di posizione per un evento
// (bot-app 'richiedi_posizione', righe in evento_tracciamento). Le posizioni in tempo reale di Telegram
// (message.location con live_period, poi edited_message) e quelle singole finiscono in evento_posizioni
// solo se c'è una richiesta aperta per quel volontario e l'evento è IN CORSO. /stop chiude le richieste.
//
// Registra intervento (solo staff con permesso interventi e spunta bot_interventi, stessa regola della
// matrice di Gestione accessi): il report incollato o inoltrato va all'assistente comune
// (_shared/agente-interventi.ts), la conversazione resta in bot_conversazioni (30 minuti), e
// l'intervento si scrive solo premendo ✅ Salva. SQL: supabase/bot_04_interventi.sql

import { ambiente, uguali, sha256, pulisci, statoAbilitato, dbLeggi, dbScrivi, tg, scaricaFile, logAttivita } from '../_shared/bot.ts';
import { leggiGpsExif } from '../_shared/exif.ts';
import { testoArpa } from '../_shared/arpa.ts';
import { avvisaStaff } from '../_shared/avvisi.ts';
import { turnoAgente, TIPO_ATTIVITA } from '../_shared/agente-interventi.ts';

const FINESTRA_MS = 10 * 60 * 1000;
const MAX_FILE = 20 * 1024 * 1024;
const NOME_LOG = 'Bot Telegram';

const BTN_FOTO = '📷 Invia foto';
const BTN_POS = '📍 Invia posizione';
const BTN_ARPA = '🌦 Bollettino ARPA';
const BTN_AIUTO = 'ℹ️ Aiuto';

const AIUTO = 'Come funziona:\n'
  + '• ' + BTN_FOTO + ': invia una foto, con una didascalia facoltativa. Va all\'evento in corso (emergenza o esercitazione); se non ce n\'è nessuno viene salvata come segnalazione generica.\n'
  + '• Se invii la foto come file, la posizione si legge dalla foto, quando c\'è. Altrimenti premi ' + BTN_POS + '.\n'
  + '• Puoi inviare prima la posizione: vale per le foto dei 10 minuti successivi.\n'
  + '• ' + BTN_ARPA + ': il bollettino di allerta aggiornato.\n'
  + '• Se la Sezione ti chiede la posizione in tempo reale per un evento, condividila da 📎 → Posizione. Per smettere: /stop.\n\n'
  + 'Comandi: /bollettino /aiuto /stop';

const MENU = {
  reply_markup: {
    keyboard: [[{ text: BTN_FOTO }, { text: BTN_POS, request_location: true }], [{ text: BTN_ARPA }, { text: BTN_AIUTO }]],
    resize_keyboard: true, is_persistent: true,
  },
};
const BTN_INTERVENTO = '📝 Registra intervento';
const MENU_STAFF = {
  reply_markup: {
    keyboard: [[{ text: BTN_FOTO }, { text: BTN_POS, request_location: true }], [{ text: BTN_ARPA }, { text: BTN_AIUTO }], [{ text: BTN_INTERVENTO }]],
    resize_keyboard: true, is_persistent: true,
  },
};
const AIUTO_STAFF = '\n\nPer lo staff:\n• ' + BTN_INTERVENTO + ': incolla o inoltra il report dell\'intervento (anche da WhatsApp). L\'assistente cerca i volontari, ti chiede ciò che manca e ti mostra il riepilogo: si salva solo con ✅ Salva. /annulla per lasciar perdere.';

// Menu della chat per la richiesta in corso: lo staff abilitato ha il pulsante in più
const menuChat = new Map<number, any>();
const menuDi = (chat: number) => menuChat.get(chat) || MENU;
const aiutoDi = (chat: number) => AIUTO + (menuChat.get(chat) === MENU_STAFF ? AIUTO_STAFF : '');

const CHIEDI_NUMERO = {
  reply_markup: { keyboard: [[{ text: '📱 Invia il mio numero', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
};
const togliTastiera = { reply_markup: { remove_keyboard: true } };

const manda = (chat: number, text: string, extra: Record<string, unknown> = {}) => tg('sendMessage', { chat_id: chat, text, ...extra });
const adesso = () => new Date().toISOString();
const limite = () => new Date(Date.now() - FINESTRA_MS).toISOString();

async function volontarioDiChat(chat: number) {
  const righe = await dbLeggi('bot_chat?chat_id=eq.' + chat + '&select=volontario_id');
  if (!righe[0]) return null;
  const [v] = await dbLeggi('volontari?id=eq.' + righe[0].volontario_id + '&select=id,cognome,nome,stato');
  return v && statoAbilitato(v.stato) ? v : null;
}

// -- REGISTRA INTERVENTO (staff) --
const CONV_MS = 30 * 60 * 1000;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataIt = (d: string) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';

// Stessa regola della matrice di Gestione accessi e di _shared/avvisi.ts
const haPermesso = (s: any, chiave: string) => {
  const p = s.permessi ? s.permessi[chiave] : undefined;
  if (s.tipo_accesso === 'master') return p !== false && p !== 'false';
  return p === true || p === 'true';
};

async function abilitatoInterventi(volId: number) {
  const [s] = await dbLeggi('staff?volontario_id=eq.' + volId + '&attivo=eq.true&select=tipo_accesso,permessi&limit=1');
  return !!s && haPermesso(s, 'interventi') && haPermesso(s, 'bot_interventi');
}

async function impostaMenu(chat: number, v: any) {
  let staff = false;
  try { staff = await abilitatoInterventi(v.id); } catch (e) { console.error('verifica staff:', pulisci(e)); }
  menuChat.set(chat, staff ? MENU_STAFF : MENU);
}
const staffAbilitato = (chat: number) => menuChat.get(chat) === MENU_STAFF;

async function convAttiva(chat: number) {
  const [c] = await dbLeggi('bot_conversazioni?chat_id=eq.' + chat + '&select=chat_id,volontario_id,messaggi,bozza,aggiornato_il');
  if (!c) return null;
  if (Date.now() - Date.parse(c.aggiornato_il) > CONV_MS) {
    await dbScrivi('DELETE', 'bot_conversazioni?chat_id=eq.' + chat, undefined, 'return=minimal');
    await manda(chat, 'Sono passati più di 30 minuti: la registrazione dell\'intervento è stata annullata, non ho salvato nulla. Se serve, ricomincia con ' + BTN_INTERVENTO + '.', menuDi(chat));
    return null;
  }
  return c;
}

async function iniziaIntervento(chat: number, v: any) {
  if (!staffAbilitato(chat)) { await manda(chat, 'Questa funzione è riservata allo staff abilitato. Contatta la segreteria.', menuDi(chat)); return; }
  await dbScrivi('POST', 'bot_conversazioni?on_conflict=chat_id', { chat_id: chat, volontario_id: v.id, messaggi: [], bozza: null, aggiornato_il: adesso() }, 'resolution=merge-duplicates,return=minimal');
  await manda(chat, 'Incolla o inoltra qui il report dell\'intervento: data, attività, luogo, volontari e ore. Ti chiedo qualcosa solo se manca.\nPer lasciar perdere: /annulla', menuDi(chat));
}

async function annullaIntervento(chat: number) {
  const tolte = await dbScrivi('DELETE', 'bot_conversazioni?chat_id=eq.' + chat);
  await manda(chat, tolte.length ? 'Registrazione dell\'intervento annullata: non ho salvato nulla.' : 'Non c\'è nessuna registrazione in corso.', menuDi(chat));
}

// Un messaggio inoltrato porta con sé autore e data originali: servono all'assistente per le date relative
function testoDaMessaggio(m: any) {
  const o = m.forward_origin;
  const da = o ? (o.sender_user ? [o.sender_user.first_name, o.sender_user.last_name].filter(Boolean).join(' ') : (o.sender_user_name || o.chat?.title || ''))
    : m.forward_from ? [m.forward_from.first_name, m.forward_from.last_name].filter(Boolean).join(' ') : (m.forward_sender_name || '');
  const quando = (o && o.date) || m.forward_date;
  const inoltrato = !!(o || m.forward_from || m.forward_sender_name || m.forward_date);
  const pre = inoltrato ? 'Messaggio inoltrato' + (da ? ' da ' + da : '') + (quando ? ' (scritto il ' + new Date(quando * 1000).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) + ')' : '') + ':\n' : '';
  return (pre + String(m.text || m.caption || '')).slice(0, 6000);
}

async function proseguiIntervento(chat: number, v: any, c: any, testo: string) {
  await tg('sendChatAction', { chat_id: chat, action: 'typing' });
  const messaggi = [...(Array.isArray(c.messaggi) ? c.messaggi : []), { role: 'user', content: testo }];
  let r;
  try {
    r = await turnoAgente(messaggi, dbLeggi, {
      utente: v.nome + ' ' + v.cognome,
      conferma: "il salvataggio avviene solo quando l'utente preme il pulsante Salva sotto il riepilogo, con un'azione separata dalla tua.",
    });
  } catch (e) {
    console.error('assistente interventi:', pulisci(e));
    await manda(chat, 'L\'assistente non risponde in questo momento. Riprova tra poco, oppure registra l\'intervento dall\'Area Riservata.', menuDi(chat));
    return;
  }
  const ora = adesso();
  await dbScrivi('PATCH', 'bot_conversazioni?chat_id=eq.' + chat, { messaggi: r.messages, bozza: r.status === 'draft' ? r.draft : null, aggiornato_il: ora }, 'return=minimal');
  if (r.status === 'draft') await mandaRiepilogo(chat, r.draft, ora);
  else await manda(chat, r.text.slice(0, 4000), menuDi(chat));
}

function volontariBozza(d: any) {
  const visti = new Set<number>();
  return (Array.isArray(d.volontari) ? d.volontari : []).filter((x: any) => {
    const id = Number(x && x.volontario_id);
    if (!Number.isInteger(id) || id <= 0 || visti.has(id)) return false;
    visti.add(id);
    return true;
  });
}
const oreDi = (x: any) => (x.ore === null || x.ore === undefined || x.ore === '') ? null : (Math.round(Number(x.ore)) || null);

function testoRiepilogo(d: any) {
  const vol = volontariBozza(d);
  const ore = vol.reduce((t: number, x: any) => t + (oreDi(x) || 0), 0);
  return ['📝 Riepilogo intervento', '',
    'Evento: ' + (d.evento || '—'),
    'Data: ' + dataIt(d.data) + (d.data_fine && d.data_fine !== d.data ? ' – ' + dataIt(d.data_fine) : ''),
    d.tipo_attivita ? 'Tipo: ' + d.tipo_attivita : '',
    d.luogo ? 'Luogo: ' + d.luogo : '',
    d.utilizzo_radio ? 'Utilizzo radio: sì' : '',
    '', 'Volontari (' + vol.length + ', ' + ore + ' ore):',
    ...vol.map((x: any) => '• ' + (x.cognome || '') + ' ' + (x.nome || '') + ' – ' + (oreDi(x) != null ? oreDi(x) + ' h' : 'ore non indicate') + (x.art_39 ? ' (art. 39)' : '')),
    d.note ? '\nNote: ' + d.note : '',
    '', 'Si salva solo con ✅ Salva.'].filter((r, i, a) => r !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

// Il codice nel pulsante lega il Salva a questo riepilogo: un riepilogo superato non salva
async function mandaRiepilogo(chat: number, d: any, versione: string) {
  const k = String(Date.parse(versione));
  await manda(chat, testoRiepilogo(d).slice(0, 4000), { reply_markup: { inline_keyboard: [[
    { text: '✅ Salva', callback_data: 'iv:salva:' + k }, { text: '✏️ Correggi', callback_data: 'iv:correggi:' + k }, { text: '❌ Annulla', callback_data: 'iv:annulla:' + k },
  ]] } });
}

async function salvaInterventoBot(chat: number, v: any, c: any) {
  const d = c.bozza || {};
  const vol = volontariBozza(d);
  const correggi = (t: string) => manda(chat, t + ' Scrivi la correzione oppure /annulla.', menuDi(chat));
  if (!d.evento || !RE_DATA.test(d.data || '')) return await correggi('Nel riepilogo mancano l\'evento o la data.');
  if (!vol.length) return await correggi('Nel riepilogo non ci sono volontari.');
  const ids = vol.map((x: any) => Number(x.volontario_id));
  const trovati = await dbLeggi('volontari?id=in.(' + ids.join(',') + ')&select=id,stato');
  if (trovati.length !== ids.length || trovati.some((x: any) => x.stato === 'DIMESSO')) return await correggi('Alcuni volontari del riepilogo non risultano in anagrafica (o sono dimessi).');

  // Presa in carico: con due tocchi su Salva l'intervento si scrive una volta sola
  const presa = await dbScrivi('DELETE', 'bot_conversazioni?chat_id=eq.' + chat + '&aggiornato_il=eq.' + encodeURIComponent(c.aggiornato_il));
  if (!presa.length) { await manda(chat, 'Questo intervento è già stato salvato o la registrazione è stata annullata.', menuDi(chat)); return; }

  const nome = v.cognome + ' ' + v.nome;
  const fine = d.data_fine && RE_DATA.test(d.data_fine) && d.data_fine > d.data ? d.data_fine : null;
  const nOre = vol.reduce((t: number, x: any) => t + (oreDi(x) || 0), 0);
  let intId: number | null = null;
  try {
    const [creato] = await dbScrivi('POST', 'interventi', {
      evento: String(d.evento).slice(0, 200), data: d.data, data_fine: fine,
      tipo_attivita: TIPO_ATTIVITA.includes(d.tipo_attivita) ? d.tipo_attivita : null,
      luogo: d.luogo ? String(d.luogo).slice(0, 200) : null, utente: nome,
      n_volontari: vol.length, n_ore: nOre, n_ore_override: false, utilizzo_radio: !!d.utilizzo_radio,
      volontari_ids: ids, note: (d.note ? String(d.note).slice(0, 2000) + '\n' : '') + '[creato dall\'agente da Telegram]',
    });
    intId = creato.id;
    await dbScrivi('POST', 'intervento_volontari', vol.map((x: any) => ({
      intervento_id: intId, volontario_id: Number(x.volontario_id), art_39: !!x.art_39, ore: oreDi(x), data_inizio: d.data, data_fine: fine || d.data,
    })), 'return=minimal');
  } catch (e) {
    console.error('intervento da bot non salvato:', pulisci(e));
    if (intId) {   // niente interventi a metà
      try { await dbScrivi('DELETE', 'intervento_volontari?intervento_id=eq.' + intId, undefined, 'return=minimal'); await dbScrivi('DELETE', 'interventi?id=eq.' + intId, undefined, 'return=minimal'); }
      catch (x) { console.error('pulizia intervento non riuscita:', pulisci(x)); }
    }
    const ora = adesso();   // il riepilogo torna disponibile per riprovare
    await dbScrivi('POST', 'bot_conversazioni?on_conflict=chat_id', { chat_id: chat, volontario_id: v.id, messaggi: c.messaggi, bozza: d, aggiornato_il: ora }, 'resolution=merge-duplicates,return=minimal');
    await manda(chat, 'Intervento non salvato per un errore. Riprova con ✅ Salva qui sotto.');
    await mandaRiepilogo(chat, d, ora);
    return;
  }
  await logAttivita(nome, 'ha registrato intervento: ' + d.evento + ' (da Telegram)');
  await manda(chat, '✅ Intervento registrato: ' + d.evento + ' del ' + dataIt(d.data) + ', ' + vol.length + ' volontari, ' + nOre + ' ore. Lo trovi in Interventi nell\'Area Riservata.', menuDi(chat));
}

async function sceltaIntervento(cb: any) {
  const chat = cb.message?.chat?.id;
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  if (!chat) return;
  const v = await volontarioDiChat(chat);
  if (!v) { await manda(chat, 'Per usare il bot devo riconoscerti dal tuo numero di telefono. Premi il pulsante qui sotto.', CHIEDI_NUMERO); return; }
  await impostaMenu(chat, v);
  await tg('editMessageReplyMarkup', { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
  const [, azione, versione] = String(cb.data || '').split(':');
  if (azione === 'annulla') { await annullaIntervento(chat); return; }
  if (!staffAbilitato(chat)) { await manda(chat, 'Non sei abilitato a registrare interventi. Contatta la segreteria.', menuDi(chat)); return; }
  const c = await convAttiva(chat);
  if (!c || !c.bozza) { await manda(chat, 'Questo riepilogo non è più valido (scaduto, già salvato o annullato). Ricomincia con ' + BTN_INTERVENTO + '.', menuDi(chat)); return; }
  if (String(Date.parse(c.aggiornato_il)) !== versione) { await manda(chat, 'Questo riepilogo è stato superato: usa i pulsanti dell\'ultimo riepilogo.', menuDi(chat)); return; }
  if (azione === 'correggi') { await manda(chat, 'Scrivi cosa correggere (es. "le ore di Rossi sono 4", "aggiungi anche Bianchi", "la data è il 18").', menuDi(chat)); return; }
  if (azione === 'salva') await salvaInterventoBot(chat, v, c);
}

// Eventi aperti collegati al bot: emergenze ed esercitazioni IN CORSO
const eventiInCorso = () => dbLeggi('eventi?tipo=in.(EMERGENZA,ESERCITAZIONE)&stato=eq.' + encodeURIComponent('IN CORSO') + '&select=id,titolo,luogo,tipo&order=data_inizio.desc');

async function registraCollegamento(chat: number, v: any, come: string) {
  await dbScrivi('DELETE', 'bot_chat?chat_id=eq.' + chat);
  await dbScrivi('DELETE', 'bot_chat?volontario_id=eq.' + v.id);
  await dbScrivi('POST', 'bot_chat', { volontario_id: v.id, chat_id: chat });
  await logAttivita(NOME_LOG, 'ha collegato ' + v.cognome + ' ' + v.nome + ' ' + come);
  await impostaMenu(chat, v);
  await manda(chat, 'Collegamento riuscito, ' + v.nome + '.\n\n' + aiutoDi(chat), menuDi(chat));
}

// -- COLLEGAMENTO --
async function collega(chat: number, token: string) {
  const hash = await sha256(token);
  const [riga] = await dbLeggi('bot_link_token?token_hash=eq.' + hash + '&usato_il=is.null&scade_il=gt.' + encodeURIComponent(adesso()) + '&select=id,volontario_id');
  const [v] = riga ? await dbLeggi('volontari?id=eq.' + riga.volontario_id + '&select=id,cognome,nome,stato') : [];
  if (!v || !statoAbilitato(v.stato)) {
    const gia = await volontarioDiChat(chat);
    await manda(chat, 'Questo link non è valido, è scaduto o è già stato usato.' + (gia ? ' Chiedi alla segreteria un nuovo link.' : ' Puoi collegarti con il tuo numero di telefono: premi il pulsante qui sotto.'), gia ? menuDi(chat) : CHIEDI_NUMERO);
    return;
  }
  // Il filtro su usato_il rende il link davvero monouso anche con due aperture insieme
  const preso = await dbScrivi('PATCH', 'bot_link_token?id=eq.' + riga.id + '&usato_il=is.null', { usato_il: adesso() });
  if (!preso.length) { await manda(chat, 'Questo link è già stato usato.', CHIEDI_NUMERO); return; }
  await registraCollegamento(chat, v, 'con il link personale');
}

const cifre = (s: unknown) => String(s ?? '').replace(/\D/g, '');
function numeroNormale(s: unknown) {
  let d = cifre(s);
  if (d.startsWith('0039')) d = d.slice(4);
  else if (d.startsWith('39') && d.length >= 11) d = d.slice(2);
  return d;
}

// Il numero vale solo se è quello di chi scrive: Telegram lo verifica, noi controlliamo user_id
async function collegaConNumero(chat: number, m: any) {
  const c = m.contact;
  if (!c || !m.from || c.user_id !== m.from.id) {
    await manda(chat, 'Per riconoscerti devo ricevere il tuo numero con il pulsante qui sotto, non un contatto qualsiasi.', CHIEDI_NUMERO);
    return;
  }
  const num = numeroNormale(c.phone_number);
  const tutti = num.length >= 9 ? await dbLeggi('volontari?select=id,cognome,nome,stato,telefono&limit=5000') : [];
  const trovati = tutti.filter(x => statoAbilitato(x.stato) && numeroNormale(x.telefono) === num);
  if (trovati.length !== 1) {
    await manda(chat, trovati.length ? 'Il tuo numero risulta associato a più schede. Contatta la segreteria.' : 'Il tuo numero non risulta in anagrafica. Contatta la segreteria.', togliTastiera);
    return;
  }
  await registraCollegamento(chat, trovati[0], 'con il numero di telefono');
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
    await manda(chat, 'Posso leggere solo file JPEG. Riprova inviandola come foto normale, non come file.', menuDi(chat));
    return;
  }
  if (f.dim > MAX_FILE) { await manda(chat, 'Il file è troppo grande (massimo 20 MB). Inviala come foto normale, non come file.', menuDi(chat)); return; }
  const eventi = await eventiInCorso();

  let pos: { lat: number; lon: number } | null = null;
  if (f.comeFile) pos = leggiGpsExif(await scaricaFile(f.fileId));
  if (!pos) pos = await ultimaPosizione(chat);
  const [a] = await dbScrivi('POST', 'bot_attese', {
    chat_id: chat, volontario_id: v.id, file_id: f.fileId, didascalia: (m.caption || '').trim().slice(0, 1000) || null,
    lat: pos ? pos.lat : null, lon: pos ? pos.lon : null,
    evento_id: eventi.length === 1 ? eventi[0].id : null, generica: eventi.length === 0,
  });
  await avanza(chat, a, v, eventi);
}

// Chiede ciò che manca, nell'ordine: evento (solo se ce ne sono più di uno), posizione. Con tutto, salva.
async function avanza(chat: number, a: any, v: any, eventi?: any[]) {
  if (!a.evento_id && !a.generica) {
    const lista = eventi || await eventiInCorso();
    if (!lista.length) {
      const [agg] = await dbScrivi('PATCH', 'bot_attese?id=eq.' + a.id, { generica: true });
      a = agg || { ...a, generica: true };
    } else {
      const bottoni = lista.map(e => [{ text: ((e.tipo === 'EMERGENZA' ? 'Emergenza: ' : 'Esercitazione: ') + e.titolo + (e.luogo ? ' - ' + e.luogo : '')).slice(0, 60), callback_data: 'ev:' + a.id + ':' + e.id }]);
      bottoni.push([{ text: 'Segnalazione generica', callback_data: 'ev:' + a.id + ':0' }]);
      await manda(chat, 'A quale evento si riferisce la foto?', { reply_markup: { inline_keyboard: bottoni } });
      return;
    }
  }
  if (a.lat == null || a.lon == null) {
    await manda(chat, 'Ho ricevuto la foto, ma manca la posizione. Premi "' + BTN_POS + '" qui sotto entro 10 minuti.', menuDi(chat));
    return;
  }
  await salvaSegnalazione(chat, a, v);
}

async function salvaSegnalazione(chat: number, a: any, v: any) {
  const volevaEvento = !!a.evento_id && !a.generica;
  const [ev] = volevaEvento ? await dbLeggi('eventi?id=eq.' + a.evento_id + '&stato=eq.' + encodeURIComponent('IN CORSO') + '&select=id,titolo') : [];
  const { supaUrl, service } = ambiente();
  const bytes = await scaricaFile(a.file_id);
  const carica = (p: string) => fetch(supaUrl + '/storage/v1/object/segnalazioni/' + p, {
    method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'image/jpeg' }, body: bytes,
  });
  const cartella = (ev ? ev.id : 'generiche') + '/' + v.id + '/', ora = Date.now();
  let percorso = cartella + ora + '.jpg';
  let up = await carica(percorso);
  if (up.status === 400 || up.status === 409) {   // due foto dello stesso album nello stesso millisecondo
    percorso = cartella + (ora + 1) + '.jpg';
    up = await carica(percorso);
  }
  if (!up.ok) throw new Error('caricamento foto: ' + up.status);
  try {
    await dbScrivi('POST', 'evento_segnalazioni', {
      evento_id: ev ? ev.id : null, volontario_id: v.id, descrizione: a.didascalia, foto_path: 'segnalazioni/' + percorso, lat: a.lat, lon: a.lon, gestita: false,
    }, 'return=minimal');
  } catch (e) {
    await fetch(supaUrl + '/storage/v1/object/segnalazioni/' + percorso, { method: 'DELETE', headers: { apikey: service, Authorization: 'Bearer ' + service } });
    throw e;
  }
  await dbScrivi('DELETE', 'bot_attese?id=eq.' + a.id);
  await logAttivita(NOME_LOG, 'ha registrato una segnalazione di ' + v.cognome + ' ' + v.nome + (ev ? ' per l\'evento: ' + ev.titolo : ' come segnalazione generica'));
  await manda(chat, ev ? 'Segnalazione registrata per: ' + ev.titolo + '.'
    : volevaEvento ? 'L\'evento non è più in corso: la segnalazione è stata registrata come generica.'
    : 'Segnalazione registrata come generica (nessun evento in corso).', menuDi(chat));
  // Lo staff lo sa subito, senza aprire Eventi (chi ha inviato la foto non riceve l'avviso)
  await avvisaStaff('📷 Nuova segnalazione da ' + v.cognome + ' ' + v.nome + ' — ' + (ev ? ev.titolo : 'generica')
    + (a.didascalia ? '\n' + a.didascalia : '') + '\nPosizione: https://www.google.com/maps?q=' + a.lat + ',' + a.lon, { tipo: 'segnalazioni', escludi: chat });
}

// Le foto ferme da più di 10 minuti non restano appese: si avvisa e si tolgono
async function scadute(chat: number) {
  const vecchie = await dbScrivi('DELETE', 'bot_attese?chat_id=eq.' + chat + '&creato_il=lt.' + encodeURIComponent(limite()));
  if (vecchie.length) await manda(chat, 'Sono passati più di 10 minuti: ' + (vecchie.length === 1 ? 'la foto precedente non è stata salvata. Inviala di nuovo.' : vecchie.length + ' foto precedenti non sono state salvate. Inviale di nuovo.'), menuDi(chat));
}

async function posizioneRicevuta(chat: number, v: any, l: any) {
  await dbScrivi('POST', 'bot_posizioni', { chat_id: chat, lat: l.latitude, lon: l.longitude }, 'return=minimal');
  const attese = await dbLeggi('bot_attese?chat_id=eq.' + chat + '&lat=is.null&select=id,file_id,didascalia,lat,lon,evento_id,generica,creato_il&order=creato_il');
  if (!attese.length) { await manda(chat, 'Posizione ricevuta. Ora invia la foto entro 10 minuti.', menuDi(chat)); return; }
  for (const a of attese) {
    const [agg] = await dbScrivi('PATCH', 'bot_attese?id=eq.' + a.id, { lat: l.latitude, lon: l.longitude });
    await avanza(chat, agg, v);
  }
}

async function sceltaEvento(cb: any) {
  const chat = cb.message?.chat?.id;
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  if (!chat) return;
  const v = await volontarioDiChat(chat);
  if (!v) { await manda(chat, 'Per usare il bot devo riconoscerti dal tuo numero di telefono. Premi il pulsante qui sotto.', CHIEDI_NUMERO); return; }
  await scadute(chat);
  const m = String(cb.data || '').match(/^ev:(\d+):(\d+)$/);
  const [a] = m ? await dbLeggi('bot_attese?id=eq.' + m[1] + '&chat_id=eq.' + chat + '&select=id,file_id,didascalia,lat,lon,evento_id,generica') : [];
  if (!a) { await manda(chat, 'Questa foto non è più in attesa. Inviala di nuovo.', menuDi(chat)); return; }
  const scelta = Number(m![2]);
  const [agg] = await dbScrivi('PATCH', 'bot_attese?id=eq.' + a.id, scelta === 0 ? { generica: true, evento_id: null } : { evento_id: scelta, generica: false });
  await avanza(chat, agg, v);
}

// -- TRACCIAMENTO --
const PAUSA_TRACCIA_MS = 20 * 1000;   // posizioni in diretta: al massimo una ogni 20 secondi

// Richieste aperte del volontario per eventi IN CORSO
async function tracciamentiAperti(volId: number) {
  const aperti = await dbLeggi('evento_tracciamento?volontario_id=eq.' + volId + '&fermato_il=is.null&select=id,evento_id,iniziato_il,ultimo_il');
  if (!aperti.length) return [];
  const ev = await dbLeggi('eventi?id=in.(' + aperti.map(a => a.evento_id).join(',') + ')&stato=eq.' + encodeURIComponent('IN CORSO') + '&select=id,titolo');
  return aperti.flatMap(a => { const e = ev.find(x => x.id === a.evento_id); return e ? [{ ...a, titolo: e.titolo }] : []; });
}

// Salva la posizione negli eventi con richiesta aperta. Restituisce i titoli degli eventi (vuoto = nessuna richiesta).
async function registraTracciamento(v: any, l: any, diretta: boolean, quando: number) {
  const aperti = await tracciamentiAperti(v.id);
  const ora = new Date(quando).toISOString();
  for (const a of aperti) {
    if (diretta && a.ultimo_il && quando - Date.parse(a.ultimo_il) < PAUSA_TRACCIA_MS) continue;
    await dbScrivi('POST', 'evento_posizioni', {
      evento_id: a.evento_id, volontario_id: v.id, lat: l.latitude, lon: l.longitude,
      precisione: l.horizontal_accuracy ?? null, in_diretta: diretta, creato_il: ora,
    }, 'return=minimal');
    await dbScrivi('PATCH', 'evento_tracciamento?id=eq.' + a.id, { ultimo_il: ora, ...(a.iniziato_il ? {} : { iniziato_il: ora }) }, 'return=minimal');
  }
  return aperti.map(a => a.titolo);
}

async function fermaTracciamento(chat: number, v: any) {
  const chiusi = await dbScrivi('PATCH', 'evento_tracciamento?volontario_id=eq.' + v.id + '&fermato_il=is.null', { fermato_il: adesso(), fermato_da: v.cognome + ' ' + v.nome + ' (bot)' });
  if (chiusi.length) await logAttivita(NOME_LOG, v.cognome + ' ' + v.nome + ' ha fermato il tracciamento');
  await manda(chat, chiusi.length
    ? 'Tracciamento fermato: non salvo più la tua posizione. Ricordati di interrompere anche la condivisione su Telegram (tocca la posizione in tempo reale → Interrompi).'
    : 'Non c\'è nessun tracciamento attivo.', menuDi(chat));
}

// Aggiornamenti della posizione in tempo reale: arrivano come messaggi modificati, senza risposta
async function messaggioModificato(m: any) {
  if (!m.location || m.chat?.type !== 'private') return;
  const v = await volontarioDiChat(m.chat.id);
  if (!v) return;
  await registraTracciamento(v, m.location, true, (m.edit_date || m.date) * 1000 || Date.now());
}

// -- MESSAGGI --
async function messaggio(m: any) {
  const chat = m.chat.id;
  if (m.chat.type !== 'private') return;
  const testo = String(m.text || '').trim();
  const start = testo.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  if (start && start[1]) { await collega(chat, start[1]); return; }
  if (m.contact) {
    const gia = await volontarioDiChat(chat);
    if (gia) { await impostaMenu(chat, gia); await manda(chat, 'Sei già collegato.', menuDi(chat)); return; }
    await collegaConNumero(chat, m);
    return;
  }

  const v = await volontarioDiChat(chat);
  if (!v) {
    await manda(chat, 'Ciao! Per usare il bot devo riconoscerti dal tuo numero di telefono. Premi il pulsante qui sotto.', CHIEDI_NUMERO);
    return;
  }
  await impostaMenu(chat, v);
  await scadute(chat);

  if (start) { await manda(chat, 'Ciao ' + v.nome + '.\n\n' + aiutoDi(chat), menuDi(chat)); return; }
  if (testo === BTN_AIUTO || /^\/aiuto(@\w+)?$/.test(testo)) { await manda(chat, aiutoDi(chat), menuDi(chat)); return; }
  if (testo === BTN_INTERVENTO || /^\/intervento(@\w+)?$/.test(testo)) { await iniziaIntervento(chat, v); return; }
  if (/^\/annulla(@\w+)?$/.test(testo)) { await annullaIntervento(chat); return; }
  if (/^\/stop(@\w+)?$/.test(testo)) { await fermaTracciamento(chat, v); return; }
  if (testo === BTN_ARPA || /^\/bollettino(@\w+)?$/.test(testo)) { await manda(chat, await testoArpa(), menuDi(chat)); return; }
  if (testo === BTN_FOTO) {
    await manda(chat, 'Invia ora la foto, con una didascalia se vuoi. Se la mandi come file conservo la posizione dello scatto; altrimenti premi "' + BTN_POS + '".', menuDi(chat));
    return;
  }
  if (m.location && m.location.live_period) {
    // Inizio di una condivisione in tempo reale: vale solo per il tracciamento, non per le foto
    const eventi = await registraTracciamento(v, m.location, true, (m.date || 0) * 1000 || Date.now());
    await manda(chat, eventi.length
      ? '📍 Posizione in tempo reale ricevuta per: ' + eventi.join(', ') + '. Grazie! Quando hai finito interrompi la condivisione o scrivi /stop.'
      : 'Al momento non c\'è nessuna richiesta di posizione in tempo reale per te, quindi non la salvo. Per accompagnare una foto usa "' + BTN_POS + '".', menuDi(chat));
    return;
  }
  if (m.location) {
    await registraTracciamento(v, m.location, false, (m.date || 0) * 1000 || Date.now());
    await posizioneRicevuta(chat, v, m.location);
    return;
  }
  if (fotoDelMessaggio(m)) { await fotoRicevuta(chat, v, m); return; }
  // Registrazione intervento in corso (solo staff abilitato): il testo va all'assistente
  if (testo && staffAbilitato(chat)) {
    const c = await convAttiva(chat);
    if (c) { await proseguiIntervento(chat, v, c, testoDaMessaggio(m)); return; }
  }
  const [ferma] = await dbLeggi('bot_attese?chat_id=eq.' + chat + '&lat=is.null&select=id&limit=1');
  await manda(chat, ferma ? 'Sto aspettando la posizione della foto: premi "' + BTN_POS + '".' : 'Non ho capito. Usa i pulsanti qui sotto o scrivi /aiuto.', menuDi(chat));
}

export async function gestisci(req: Request): Promise<Response> {
  const { segreto } = ambiente();
  const ricevuto = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!segreto || !uguali(ricevuto, segreto)) return new Response('non autorizzato', { status: 401 });
  if (req.method !== 'POST') return new Response('metodo non supportato', { status: 405 });

  let u: any;
  try { u = await req.json(); } catch { return new Response('ok'); }
  const chat = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;   // edited_message: nessun avviso d'errore
  try {
    // Telegram ripete un aggiornamento se la risposta tarda: il secondo si riconosce e si ignora
    const nuovo = await dbScrivi('POST', 'bot_update_visti?on_conflict=update_id', { update_id: u.update_id }, 'resolution=ignore-duplicates,return=representation');
    if (!nuovo.length) return new Response('ok');
    await dbScrivi('DELETE', 'bot_update_visti?visto_il=lt.' + encodeURIComponent(new Date(Date.now() - 2 * 86400000).toISOString()), undefined, 'return=minimal');
    if (u.message) await messaggio(u.message);
    else if (u.edited_message) await messaggioModificato(u.edited_message);
    else if (u.callback_query) await (String(u.callback_query.data || '').startsWith('iv:') ? sceltaIntervento(u.callback_query) : sceltaEvento(u.callback_query));
  } catch (e) {
    console.error('errore bot:', pulisci(e));
    if (chat) { try { await manda(chat, 'Si è verificato un errore e l\'operazione non è riuscita. Riprova tra poco.', menuDi(chat)); } catch (x) { console.error('avviso non inviato:', pulisci(x)); } }
  } finally {
    if (chat) menuChat.delete(chat);
  }
  return new Response('ok');   // sempre 200: un errore qui non va ripetuto da Telegram
}

Deno.serve(gestisci);
