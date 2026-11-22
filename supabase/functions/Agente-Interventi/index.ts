// Supabase Edge Function: Agente-Interventi (pulsante "Registra da messaggio" negli Interventi)
//
// Riceve la conversazione (formato messages di Anthropic) e la fa proseguire con l'assistente
// comune in ../_shared/agente-interventi.ts (usato anche dal bot Telegram).
// Questa funzione non scrive mai nel database: restituisce la bozza, e il salvataggio avviene
// nell'app solo dopo conferma esplicita (aicConfermaBozza() in area-riservata.js, che usa salvaIntervento()).
//
// Accesso: token della sessione nell'header Authorization e permesso 'interventi', verificati con
// mio_profilo prima di qualunque chiamata all'AI. Anche le ricerche usano il token della sessione
// (mai la chiave anon, che non può leggere volontari e interventi): valgono le regole del database.
//
// Deploy: entrypoint Agente-Interventi/index.ts insieme a _shared/agente-interventi.ts
// (verify_jwt = false in config.toml). Secret richiesto: ANTHROPIC_API_KEY.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { turnoAgente } from '../_shared/agente-interventi.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

// Regola di public.ho_permesso: master sì salvo permesso tolto, standard solo se concesso, volontari mai.
// Restituisce il profilo se il permesso c'è, altrimenti la risposta di errore.
async function verificaSessione(req: Request, supaUrl: string, anonKey: string): Promise<{ profilo?: any; errore?: Response }> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return { errore: jsonResponse({ error: 'Sessione mancante: accedi di nuovo.' }, 401) };
  try {
    const client = createClient(supaUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await client.rpc('mio_profilo');
    if (error) throw error;
    const u = Array.isArray(data) ? data[0] : data;
    const p = u?.permessi?.interventi;
    if (u?.tipo && u.tipo !== 'volontario' && p !== false && (u.tipo === 'master' || p === true)) return { profilo: u };
  } catch (e) {
    console.error('verifica permesso fallita', e);
  }
  return { errore: jsonResponse({ error: 'Permesso negato.' }, 403) };
}

// auth:'none': il token della sessione è verificato da verificaSessione, nel gestore.
// L'OPTIONS di preflight viene gestito a parte, sotto, prima di arrivare qui.
const handlerAutenticato = withSupabase({ auth: 'none' }, async (req: Request, _ctx: any) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'metodo non supportato' }, 405);

  const SUPA_URL = Deno.env.get('SUPABASE_URL');
  const SUPA_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return jsonResponse({ error: 'ANTHROPIC_API_KEY non configurata come secret della function' }, 500);
  if (!SUPA_URL || !SUPA_KEY) return jsonResponse({ error: 'SUPABASE_URL/SUPABASE_ANON_KEY non disponibili' }, 500);

  const { profilo, errore } = await verificaSessione(req, SUPA_URL, SUPA_KEY);
  if (errore) return errore;
  const AUTH = req.headers.get('authorization') || '';

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'JSON non valido' }, 400); }
  const msgs = body?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return jsonResponse({ error: 'messages mancanti o vuoti' }, 400);

  // Letture con il token della sessione di chi scrive
  const leggi = async (percorso: string) => {
    const res = await fetch(SUPA_URL + '/rest/v1/' + percorso, { headers: { apikey: SUPA_KEY, Authorization: AUTH } });
    if (!res.ok) throw new Error('lettura negata: ' + res.status);
    return await res.json();
  };

  try {
    const r = await turnoAgente(msgs, leggi, {
      utente: (profilo && profilo.nome) || "l'utente",
      conferma: "il salvataggio avviene solo quando l'utente conferma esplicitamente il riepilogo nell'interfaccia, con un'azione separata dalla tua.",
    });
    return jsonResponse(r);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return jsonResponse({ error: msg }, msg.startsWith('Errore chiamata AI') ? 502 : 500);
  }
});

export default {
  fetch: (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    return handlerAutenticato(req);
  },
};
