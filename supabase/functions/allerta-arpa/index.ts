// Supabase Edge Function: allerta-arpa
//
// Legge il bollettino di allerta ARPA Piemonte (CAP-XML), estrae la zona di
// Casale Monferrato e salva l'ultimo stato in allerta_cache. La chiamano il
// pianificatore ogni 30 minuti (supabase/allerta_cron.sql) e l'app se la cache è
// più vecchia di 30 minuti (allerta-home.js).
//
// Pubblica (verify_jwt = false) perché espone solo dati già pubblici. Non accetta
// parametri e non legge ARPA più di una volta ogni 5 minuti, per quante chiamate arrivino.
//
// Se ARPA non risponde o il file è illeggibile, i dati in cache non vengono toccati:
// si registra solo il tentativo fallito e l'app mostra "Non aggiornato dalle HH:MM".
//
// Risposta: { ok: true, stato } oppure { ok: false, error, stato }
// Fonte: Arpa Piemonte - www.arpa.piemonte.it

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { leggiBollettino } from './parser.ts';

const FONTE_URL = 'https://www.arpa.piemonte.it/export/xmlcap/allerta.xml';
const ZONA = 'Piem-I'; // Casale Monferrato: "zone_di_allerta" nel JSON comunale ARPA (ISTAT 006039)
const INTERVALLO_MINIMO_MS = 5 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const SUPA_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const HSRV = { apikey: SERVICE_KEY!, Authorization: 'Bearer ' + SERVICE_KEY };

async function leggiCache() {
  const r = await fetch(`${SUPA_URL}/rest/v1/allerta_cache?id=eq.1&select=*`, { headers: HSRV });
  if (!r.ok) throw new Error('lettura cache: ' + r.status);
  return (await r.json())[0] || null;
}

async function scriviCache(campi: Record<string, unknown>) {
  const r = await fetch(`${SUPA_URL}/rest/v1/allerta_cache?on_conflict=id`, {
    method: 'POST',
    headers: { ...HSRV, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: 1, ...campi }),
  });
  if (!r.ok) throw new Error('scrittura cache: ' + r.status + ' ' + await r.text());
  return (await r.json())[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  let cache = null;
  try {
    cache = await leggiCache();
    const ultimo = cache?.ultimo_tentativo_il ? Date.parse(cache.ultimo_tentativo_il) : 0;
    if (Date.now() - ultimo < INTERVALLO_MINIMO_MS) return jsonResponse({ ok: true, stato: cache });

    const adesso = new Date().toISOString();
    try {
      const res = await fetch(FONTE_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('ARPA ha risposto ' + res.status);
      const dati = leggiBollettino(await res.text(), ZONA);
      const stato = await scriviCache({ ...dati, aggiornato_il: adesso, ultimo_tentativo_il: adesso, ultimo_errore: null });
      return jsonResponse({ ok: true, stato });
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : String(e);
      const stato = await scriviCache({ ultimo_tentativo_il: adesso, ultimo_errore: messaggio });
      return jsonResponse({ ok: false, error: messaggio, stato });
    }
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e), stato: cache });
  }
});
