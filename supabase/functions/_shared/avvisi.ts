// Avvisi di servizio allo staff via Telegram (livelli 2 e 3 del canale; il livello 1, allerta ARPA
// e messaggi dall'app, va a tutti i collegati e non passa da qui).
// Destinatari: staff attivo collegato al bot con la spunta del tipo di avviso in Gestione accessi:
//   segnalazioni → permesso "bot_segnalazioni"   (nuove foto dal bot, promemoria oltre 24 ore)
//   tecnici      → permesso "bot_avvisi_tecnici" (ARPA ferma, attività automatiche, backup)
// Stessa regola della matrice in gestione-accessi.js: un master ha la spunta finché non la toglie
// (permesso === false), uno standard solo se è true.
// Rete di sicurezza: se nessuno collegato ha la spunta, l'avviso va comunque ai master collegati,
// così una segnalazione non si perde mai.

import { dbLeggi, tg } from './bot.ts';

export type TipoAvviso = 'segnalazioni' | 'tecnici';
const CHIAVE: Record<TipoAvviso, string> = { segnalazioni: 'bot_segnalazioni', tecnici: 'bot_avvisi_tecnici' };

const haSpunta = (s: any, chiave: string) => {
  const p = s.permessi ? s.permessi[chiave] : undefined;
  if (s.tipo_accesso === 'master') return p !== false && p !== 'false';
  return p === true || p === 'true';
};

async function chatDi(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const chat = await dbLeggi('bot_chat?volontario_id=in.(' + ids.join(',') + ')&select=chat_id');
  return chat.map(c => Number(c.chat_id));
}

export async function chatStaff(tipo: TipoAvviso): Promise<number[]> {
  const staff = await dbLeggi('staff?attivo=eq.true&select=volontario_id,tipo_accesso,permessi');
  const scelti = await chatDi(staff.filter(s => haSpunta(s, CHIAVE[tipo])).map(s => s.volontario_id));
  if (scelti.length) return scelti;
  return await chatDi(staff.filter(s => s.tipo_accesso === 'master').map(s => s.volontario_id));
}

// Un destinatario che non risponde non deve bloccare gli altri né l'operazione in corso
export async function avvisaStaff(testo: string, opzioni: { tipo: TipoAvviso; escludi?: number }): Promise<number> {
  let inviati = 0;
  try {
    for (const chat of await chatStaff(opzioni.tipo)) {
      if (chat === opzioni.escludi) continue;
      try { if ((await tg('sendMessage', { chat_id: chat, text: testo, disable_web_page_preview: true })).ok) inviati++; } catch { /* prossimo */ }
    }
  } catch (e) { console.error('avviso staff non inviato'); }
  return inviati;
}
