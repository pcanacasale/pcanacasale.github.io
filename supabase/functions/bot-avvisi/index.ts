// Supabase Edge Function: bot-avvisi
//
// Controllo periodico (pg_cron, ogni ora): se qualcosa non va avvisa i master su Telegram.
// Non legge nulla dalla richiesta e non restituisce dati: chi la chiama può solo farle fare un
// controllo. Lo stesso avviso non si ripete prima di 6 ore (24 per le segnalazioni).
// Il verde non si inventa: se un dato manca, è un problema da segnalare.

import { ambiente, dbLeggi, dbScrivi, pulisci } from '../_shared/bot.ts';
import { avvisaStaff } from '../_shared/avvisi.ts';

const ORE = 3600 * 1000;

async function stato() {
  const { supaUrl, service } = ambiente();
  const r = await fetch(supaUrl + '/rest/v1/rpc/stato_sistema', {
    method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!r.ok) throw new Error('stato_sistema: ' + r.status);
  return await r.json();
}

async function daAvvisare(chiave: string, pausaOre: number) {
  const [riga] = await dbLeggi('bot_avvisi_stato?chiave=eq.' + encodeURIComponent(chiave) + '&select=ultimo_invio');
  return !riga || Date.now() - Date.parse(riga.ultimo_invio) > pausaOre * ORE;
}
const segna = (chiave: string) => dbScrivi('POST', 'bot_avvisi_stato?on_conflict=chiave', { chiave, ultimo_invio: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');

Deno.serve(async () => {
  try {
    let s: any;
    try { s = await stato(); } catch (e) { s = null; console.error('controllo:', pulisci(e)); }
    const problemi: [string, string, number][] = [];
    if (!s) problemi.push(['controllo', 'Il controllo automatico non riesce a leggere lo stato del sistema.', 6]);
    else {
      if (s.allerta_eta_min === null || s.allerta_eta_min > 120) problemi.push(['allerta', 'L\'allerta ARPA non si aggiorna' + (s.allerta_eta_min === null ? ': nessun dato.' : ' da ' + s.allerta_eta_min + ' minuti.'), 6]);
      if (s.cron_falliti_2h > 0) problemi.push(['cron', s.cron_falliti_2h + ' attività automatiche non riuscite nelle ultime 2 ore.', 6]);
      if (s.segnalazioni_vecchie > 0) problemi.push(['segnalazioni', s.segnalazioni_vecchie + ' segnalazioni del bot da gestire da oltre 24 ore (Eventi).', 24]);
      const g = s.backup_ultimo && Date.UTC(+s.backup_ultimo.slice(0, 4), +s.backup_ultimo.slice(4, 6) - 1, +s.backup_ultimo.slice(6, 8));
      if (!g || Date.now() - g > 9 * 24 * ORE) problemi.push(['backup', 'La copia settimanale dei dati non è aggiornata.', 24]);
    }
    let inviati = 0;
    for (const [chiave, testo, pausa] of problemi) {
      if (!(await daAvvisare(chiave, pausa))) continue;
      if (await avvisaStaff('⚠️ ' + testo, { soloMaster: chiave !== 'segnalazioni' })) { await segna(chiave); inviati++; }
    }
    return new Response(JSON.stringify({ problemi: problemi.length, avvisi: inviati }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('errore avvisi:', pulisci(e));
    return new Response('errore', { status: 500 });
  }
});
