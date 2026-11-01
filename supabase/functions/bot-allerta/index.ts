// Supabase Edge Function: bot-allerta
//
// Allerta ARPA automatica (pg_cron, dopo le 14 alle 12:10-13:40 UTC, quando esce il bollettino; il dato lo tiene fresco allerta-arpa ogni 30 minuti).
// Scrive a tutti i volontari collegati al bot quando il quadro cambia e c'è almeno un'allerta gialla,
// e una volta sola quando rientra al verde. Con dato non fresco o scaduto non invia nulla (di quello
// avvisa bot-avvisi): il verde non si inventa. Per sospenderla: una riga in bot_avvisi_stato con
// chiave 'allerta_sospesa'. Non legge nulla dalla richiesta.

import { dbLeggi, dbScrivi, pulisci, statoAbilitato, tg } from '../_shared/bot.ts';
import { statoAllerta } from '../_shared/arpa.ts';

const TESTA = ['', '🟡 Allerta GIALLA', '🟠 Allerta ARANCIONE', '🔴 Allerta ROSSA'];
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

async function destinatari(): Promise<number[]> {
  const chat = await dbLeggi('bot_chat?select=chat_id,volontario_id');
  if (!chat.length) return [];
  const vol = await dbLeggi('volontari?select=id,stato&limit=5000');
  const ok = new Set(vol.filter(v => statoAbilitato(v.stato)).map(v => v.id));
  return chat.filter(c => ok.has(c.volontario_id)).map(c => Number(c.chat_id));
}

async function manda(chat: number, text: string) {
  let r = await tg('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
  if (!r.ok && r.attesa) { await pausa(Math.min(r.attesa, 10) * 1000 + 200); r = await tg('sendMessage', { chat_id: chat, text, disable_web_page_preview: true }); }
  return r.ok;
}

Deno.serve(async () => {
  const risposta = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
  try {
    if ((await dbLeggi('bot_avvisi_stato?chiave=eq.allerta_sospesa&select=chiave')).length) return risposta({ sospesa: true });
    const s = await statoAllerta();
    if (!s.ok) return risposta({ dato: 'non affidabile' });

    const [ultimo] = await dbLeggi('bot_avvisi_stato?chiave=eq.allerta_inviata&select=valore');
    const [vecchioMax, vecchiaFirma] = ultimo?.valore ? ultimo.valore.split('|') : ['0', ''];
    let testo = '';
    if (s.massimo >= 1 && s.firma !== vecchiaFirma) testo = TESTA[s.massimo] + '\n\n' + s.testo;
    else if (s.massimo === 0 && Number(vecchioMax) >= 1) testo = '🟢 Allerta rientrata: nessuna allerta in corso.\n\n' + s.testo;
    if (!testo) return risposta({ invii: 0 });

    const lista = await destinatari();
    let inviati = 0;
    for (const chat of lista) {
      try { if (await manda(chat, testo)) inviati++; } catch { /* prossimo */ }
      await pausa(50);   // ben sotto i limiti di Telegram
    }
    // se c'erano destinatari e nessuno ha ricevuto, si riprova al prossimo giro
    if (!lista.length || inviati) {
      await dbScrivi('POST', 'bot_avvisi_stato?on_conflict=chiave', { chiave: 'allerta_inviata', ultimo_invio: new Date().toISOString(), valore: s.massimo + '|' + s.firma }, 'resolution=merge-duplicates,return=minimal');
    }
    return risposta({ invii: inviati, destinatari: lista.length });
  } catch (e) {
    console.error('errore allerta:', pulisci(e));
    return new Response('errore', { status: 500 });
  }
});
