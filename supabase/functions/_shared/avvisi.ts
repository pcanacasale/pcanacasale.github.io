// Avvisi allo staff via Telegram. Destinatari: staff attivo collegato al bot.
// Con soloMaster solo i master; altrimenti chi ha il permesso "eventi" (stessa regola di ho_permesso).

import { dbLeggi, tg } from './bot.ts';

export async function chatStaff(soloMaster = false): Promise<number[]> {
  const staff = await dbLeggi('staff?attivo=eq.true&select=volontario_id,tipo_accesso,permessi');
  const ids = staff.filter(s => {
    if (s.tipo_accesso === 'master') return true;
    if (soloMaster) return false;
    const p = s.permessi && s.permessi.eventi;
    return p !== undefined && p !== null && p !== false;
  }).map(s => s.volontario_id);
  if (!ids.length) return [];
  const chat = await dbLeggi('bot_chat?volontario_id=in.(' + ids.join(',') + ')&select=chat_id');
  return chat.map(c => Number(c.chat_id));
}

// Un destinatario che non risponde non deve bloccare gli altri né l'operazione in corso
export async function avvisaStaff(testo: string, opzioni: { soloMaster?: boolean; escludi?: number } = {}): Promise<number> {
  let inviati = 0;
  try {
    for (const chat of await chatStaff(!!opzioni.soloMaster)) {
      if (chat === opzioni.escludi) continue;
      try { if ((await tg('sendMessage', { chat_id: chat, text: testo, disable_web_page_preview: true })).ok) inviati++; } catch { /* prossimo */ }
    }
  } catch (e) { console.error('avviso staff non inviato'); }
  return inviati;
}
