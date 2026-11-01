// Testo del bollettino ARPA per il bot. Stessa regola di allerta-home.js e di bot-app:
// mai un verde finto. Dato assente, scaduto o non aggiornato lo si dice, senza livelli.

import { ambiente, dbLeggi } from './bot.ts';

export const ARPA_URL = 'https://www.arpa.piemonte.it/bollettino/allerta-meteoidrologica-idraulica';
const ARPA_MAX_ETA_MS = 35 * 60 * 1000;
const LIVELLI: Record<string, string> = { VERDE: 'verde', GIALLO: 'giallo', ARANCIONE: 'arancione', ROSSO: 'rosso', BIANCO: 'non valutato', SCONOSCIUTO: 'non disponibile' };
const RISCHI: Record<string, string> = { idrogeologico: 'Idrogeologico', idraulico: 'Idraulico', temporali: 'Temporali', neve: 'Neve' };

function dataIt(s: string) {
  return new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export async function testoArpa() {
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
