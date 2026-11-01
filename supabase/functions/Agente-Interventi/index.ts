// Supabase Edge Function: agente-intervento
//
// Riceve la conversazione (formato messages di Anthropic) e la fa proseguire
// tramite Claude con due tool di sola lettura (cerca_volontari, cerca_interventi_recenti)
// e un tool "proponi_riepilogo" che NON scrive nel database: serve solo a restituire
// al frontend la bozza della scheda intervento da mostrare a Federico.
// Il salvataggio vero e proprio avviene sempre lato client, solo dopo conferma esplicita
// dell'utente (vedi aicConfermaBozza() in area-riservata.js), riusando la normale
// salvaIntervento() dell'app — questa funzione non ha mai accesso in scrittura al DB.
//
// Accesso: token della sessione nell'header Authorization e permesso 'interventi',
// verificati qui con mio_profilo prima di qualunque chiamata all'AI.
//
// Deploy: supabase functions deploy Agente-Interventi (verify_jwt = false in config.toml)
// Secret richiesto: ANTHROPIC_API_KEY.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TIPO_ATTIVITA = [
  'EMERGENZA', 'ESERCITAZIONE', 'CORSI', 'PREVENZIONE INFORTUNI',
  'RAPPRESENTANZA', 'ASSEMBLEE E RIUNIONI', 'CONTROLLO TERRITORIO',
  'SEGRETERIA', 'MAGAZZINO'
];

const ANTHROPIC_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ITERATIONS = 6;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function normalizza(s: string): string {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function oggiRoma(): string {
  // formato YYYY-MM-DD nel fuso orario italiano
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

const TOOLS = [
  {
    name: 'cerca_volontari',
    description:
      "Cerca tra i volontari (attivi o sospesi) dell'associazione per cognome e/o nome, anche parziale, con soprannomi o con l'ordine invertito. Usalo per OGNI nome di persona menzionato nel messaggio, per trovare il volontario_id corretto. Ritorna una lista di candidati con id, cognome, nome.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nome e/o cognome (anche parziale/impreciso) da cercare' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cerca_interventi_recenti',
    description:
      "Cerca gli interventi registrati più di recente, opzionalmente filtrati per testo nell'evento o nel luogo. Usalo per capire se l'intervento descritto nel messaggio è già registrato (evita duplicati) o per recuperare contesto su un evento che dura più giorni.",
    input_schema: {
      type: 'object',
      properties: {
        termine: { type: 'string', description: "Testo da cercare nell'evento o nel luogo (opzionale)" },
        giorni: { type: 'number', description: 'Quanti giorni indietro cercare (default 14)' },
      },
    },
  },
  {
    name: 'proponi_riepilogo',
    description:
      "Chiamalo SOLO quando hai raccolto tutte le informazioni necessarie (evento, data, volontari con relative ore) per proporre la scheda intervento completa. NON scrive nulla nel database: serve solo a mostrare un riepilogo a Federico, che deciderà se confermare o correggere. Ogni volontario deve avere un volontario_id reale ottenuto da cerca_volontari: non inventare mai un volontario_id.",
    input_schema: {
      type: 'object',
      properties: {
        evento: { type: 'string' },
        data: { type: 'string', description: 'Data inizio in formato YYYY-MM-DD' },
        data_fine: { type: 'string', description: "Data fine in formato YYYY-MM-DD, solo se diversa dalla data inizio, altrimenti ometti il campo" },
        tipo_attivita: { type: 'string', description: 'Uno tra: ' + TIPO_ATTIVITA.join(', ') + '. Ometti il campo se non è chiaro.' },
        luogo: { type: 'string' },
        note: { type: 'string' },
        utilizzo_radio: { type: 'boolean' },
        volontari: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volontario_id: { type: 'number' },
              cognome: { type: 'string' },
              nome: { type: 'string' },
              ore: { type: 'number', description: 'Ore svolte, sempre arrotondate al numero intero (mai decimali, es. 3 o 4, non 3.5)' },
              art_39: { type: 'boolean' },
            },
            required: ['volontario_id', 'cognome', 'nome'],
          },
        },
        messaggio_riepilogo: {
          type: 'string',
          description: 'Testo breve e leggibile in italiano da mostrare in chat a Federico, che riassume cosa hai capito dal messaggio',
        },
      },
      required: ['evento', 'data', 'volontari', 'messaggio_riepilogo'],
    },
  },
];

function buildSystemPrompt(): string {
  return `Sei l'agente che aiuta Federico (segretario della sezione ANA di Casale Monferrato) a compilare la Scheda Intervento a partire da messaggi WhatsApp informali di report.

Oggi è ${oggiRoma()} (fuso orario Europe/Rome). Usa questa data per risolvere riferimenti relativi ("oggi", "ieri", "stamattina", "sabato scorso"...).

Tipi di attività validi (tipo_attivita): ${TIPO_ATTIVITA.join(', ')}.

Il tuo compito, in ordine:
1. Leggi il messaggio e individua: evento/motivo dell'intervento, data (e data fine se copre più giorni), luogo, tipo attività, i volontari intervenuti con le ore di ciascuno, ed eventuali note utili (uso radio, mezzi, ecc.).
2. Per OGNI nome di persona nel messaggio chiama cerca_volontari per trovare il volontario_id reale. Se c'è un solo candidato plausibile usalo direttamente, senza chiedere conferma. Se ci sono più candidati ambigui o nessun risultato, chiedilo a Federico con una domanda diretta elencando le opzioni trovate.
3. Se le ore di uno o più volontari non sono specificate nel messaggio, NON inventarle: chiedile a Federico (raggruppa tutte le domande sui mancanti in un solo messaggio, non una alla volta). Le ore vanno SEMPRE arrotondate al numero intero più vicino (mai decimali/mezz'ore): se dal messaggio risulta un valore come "3 ore e mezza" o "dalle 14 alle 17:30", arrotonda al numero intero più vicino (in questo caso 4).
4. Se qualcosa è ambiguo o manca (data, evento poco chiaro, tipo attività non deducibile dal contesto) fai una domanda breve e diretta in linguaggio naturale — in quel turno non chiamare proponi_riepilogo.
5. Quando hai tutte le informazioni essenziali (evento, data, volontari con ore risolti — luogo/note/tipo possono restare vuoti se davvero non deducibili), chiama proponi_riepilogo con i dati completi. Non chiamarlo con dati indovinati o incompleti sui volontari.
6. Se Federico risponde con una correzione dopo un riepilogo (es. "le ore di Mario sono 4", "aggiungi anche Luca", "la data è sbagliata, era ieri"), aggiorna i dati (rifai le ricerche necessarie) e richiama proponi_riepilogo con la versione corretta.
7. Non scrivi mai direttamente nel database: il salvataggio avviene solo quando Federico conferma esplicitamente il riepilogo nell'interfaccia, con un'azione separata dalla tua.
8. Sii sintetico. Le domande devono essere brevi, dirette, in italiano, e poste solo quando davvero necessarie.`;
}

async function cercaVolontari(supaUrl: string, supaKey: string, query: string) {
  const res = await fetch(
    supaUrl + '/rest/v1/volontari?select=id,cognome,nome&stato=neq.DIMESSO&order=cognome',
    { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey } },
  );
  if (!res.ok) return { errore: 'impossibile leggere anagrafica volontari' };
  const tutti = await res.json();
  const q = normalizza(query);
  const termini = q.split(/\s+/).filter(Boolean);
  const candidati = (tutti || []).filter((v: any) => {
    const full = normalizza((v.cognome || '') + ' ' + (v.nome || ''));
    if (full.includes(q)) return true;
    return termini.length > 0 && termini.every((t) => full.includes(t));
  });
  return { candidati: candidati.slice(0, 10).map((v: any) => ({ id: v.id, cognome: v.cognome, nome: v.nome })) };
}

async function cercaInterventiRecenti(supaUrl: string, supaKey: string, termine: string | undefined, giorni: number | undefined) {
  const res = await fetch(
    supaUrl + '/rest/v1/interventi_con_stato?select=id,evento,data,luogo,tipo_attivita,stato_calcolato&order=data.desc&limit=25',
    { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey } },
  );
  if (!res.ok) return { errore: 'impossibile leggere interventi recenti' };
  let dati = await res.json();
  const soglia = new Date();
  soglia.setDate(soglia.getDate() - (giorni || 14));
  dati = (dati || []).filter((i: any) => !i.data || new Date(i.data) >= soglia);
  if (termine) {
    const t = normalizza(termine);
    dati = dati.filter((i: any) => normalizza(i.evento || '').includes(t) || normalizza(i.luogo || '').includes(t));
  }
  return { interventi: dati.slice(0, 15) };
}

async function eseguiTool(block: any, supaUrl: string, supaKey: string) {
  if (block.name === 'cerca_volontari') {
    return await cercaVolontari(supaUrl, supaKey, block.input?.query || '');
  }
  if (block.name === 'cerca_interventi_recenti') {
    return await cercaInterventiRecenti(supaUrl, supaKey, block.input?.termine, block.input?.giorni);
  }
  return { errore: 'tool sconosciuto: ' + block.name };
}

// Regola di public.ho_permesso: master sì salvo permesso tolto, standard solo se concesso, volontari mai
async function erroreSessione(req: Request, supaUrl: string, anonKey: string): Promise<Response | null> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'Sessione mancante: accedi di nuovo.' }, 401);
  try {
    const client = createClient(supaUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await client.rpc('mio_profilo');
    if (error) throw error;
    const u = Array.isArray(data) ? data[0] : data;
    const p = u?.permessi?.interventi;
    if (u?.tipo && u.tipo !== 'volontario' && p !== false && (u.tipo === 'master' || p === true)) return null;
  } catch (e) {
    console.error('verifica permesso fallita', e);
  }
  return jsonResponse({ error: 'Permesso negato.' }, 403);
}

// auth:'none': il token della sessione è verificato da erroreSessione, nel gestore.
// L'OPTIONS di preflight viene gestito a parte, sotto, prima di arrivare qui.
const handlerAutenticato = withSupabase({ auth: 'none' }, async (req: Request, _ctx: any) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'metodo non supportato' }, 405);

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const SUPA_URL = Deno.env.get('SUPABASE_URL');
  const SUPA_KEY = Deno.env.get('SUPABASE_ANON_KEY');

  if (!ANTHROPIC_API_KEY) return jsonResponse({ error: 'ANTHROPIC_API_KEY non configurata come secret della function' }, 500);
  if (!SUPA_URL || !SUPA_KEY) return jsonResponse({ error: 'SUPABASE_URL/SUPABASE_ANON_KEY non disponibili' }, 500);

  const negato = await erroreSessione(req, SUPA_URL, SUPA_KEY);
  if (negato) return negato;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON non valido' }, 400);
  }

  let msgs = body?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return jsonResponse({ error: 'messages mancanti o vuoti' }, 400);

  try {
    let iterazioni = 0;
    while (iterazioni < MAX_TOOL_ITERATIONS) {
      iterazioni++;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 2048,
          system: buildSystemPrompt(),
          tools: TOOLS,
          messages: msgs,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        return jsonResponse({ error: 'Errore chiamata AI: ' + errText }, 502);
      }
      const data = await aiRes.json();
      const content = data.content || [];
      msgs = [...msgs, { role: 'assistant', content }];

      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use');

      if (!toolUseBlocks.length) {
        const text = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
        return jsonResponse({ status: 'question', text: text || 'Puoi darmi qualche dettaglio in più?', messages: msgs });
      }

      const riepilogo = toolUseBlocks.find((b: any) => b.name === 'proponi_riepilogo');
      if (riepilogo) {
        // Le ore vanno sempre arrotondate al numero intero: lo forziamo qui a prescindere
        // da cosa ha prodotto il modello, per non dipendere solo dal prompt.
        if (riepilogo.input && Array.isArray(riepilogo.input.volontari)) {
          riepilogo.input.volontari = riepilogo.input.volontari.map((v: any) => ({
            ...v,
            ore: (v.ore === null || v.ore === undefined) ? v.ore : Math.round(Number(v.ore)),
          }));
        }
        const toolResults = [];
        for (const b of toolUseBlocks) {
          if (b.name === 'proponi_riepilogo') {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: b.id,
              content: 'Riepilogo mostrato a Federico. In attesa della sua conferma o di eventuali correzioni.',
            });
          } else {
            const risultato = await eseguiTool(b, SUPA_URL, SUPA_KEY);
            toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(risultato) });
          }
        }
        msgs = [...msgs, { role: 'user', content: toolResults }];
        return jsonResponse({
          status: 'draft',
          text: riepilogo.input?.messaggio_riepilogo || "Ecco la bozza dell'intervento.",
          draft: riepilogo.input,
          messages: msgs,
        });
      }

      // solo tool di ricerca: eseguili e continua il loop
      const toolResults = [];
      for (const b of toolUseBlocks) {
        const risultato = await eseguiTool(b, SUPA_URL, SUPA_KEY);
        toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(risultato) });
      }
      msgs = [...msgs, { role: 'user', content: toolResults }];
    }

    return jsonResponse({
      status: 'question',
      text: "Non riesco a completare l'analisi in questo turno: prova a riformulare o a dare più dettagli in un unico messaggio.",
      messages: msgs,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

export default {
  fetch: (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    return handlerAutenticato(req);
  },
};
