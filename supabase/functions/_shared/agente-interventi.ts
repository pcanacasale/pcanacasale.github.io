// Assistente che compila la Scheda Intervento da un messaggio di report (WhatsApp o simili).
// Comune a due Edge Function:
//   - Agente-Interventi (app): legge con il token della sessione di chi scrive; salva l'app dopo conferma.
//   - bot-telegram (staff con la spunta bot_interventi): legge con la service role, dopo aver
//     verificato chi scrive; salva il bot quando si preme ✅ Salva.
// Tre tool: cerca_volontari e cerca_interventi_recenti (sola lettura) e proponi_riepilogo,
// che NON scrive nulla: restituisce la bozza da far confermare.
// Secret richiesto: ANTHROPIC_API_KEY.

export const TIPO_ATTIVITA = [
  'EMERGENZA', 'ESERCITAZIONE', 'CORSI', 'PREVENZIONE INFORTUNI',
  'RAPPRESENTANZA', 'ASSEMBLEE E RIUNIONI', 'CONTROLLO TERRITORIO',
  'SEGRETERIA', 'MAGAZZINO'
];

const ANTHROPIC_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ITERATIONS = 6;

// Lettura dal database: percorso REST (es. 'volontari?select=...'); lancia un errore se negata
export type Lettore = (percorso: string) => Promise<any[]>;
export type Risposta = { status: 'question' | 'draft'; text: string; draft?: any; messages: any[] };

export function normalizza(s: string): string {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function oggiRoma(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });   // YYYY-MM-DD
}

const TOOLS = [
  {
    name: 'cerca_volontari',
    description:
      "Cerca tra i volontari (attivi o sospesi) dell'associazione per cognome e/o nome, anche parziale, con soprannomi o con l'ordine invertito. Usalo per OGNI nome di persona menzionato nel messaggio, per trovare il volontario_id corretto. Ritorna una lista di candidati con id, cognome, nome.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Nome e/o cognome (anche parziale/impreciso) da cercare' } },
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
      "Chiamalo SOLO quando hai raccolto tutte le informazioni necessarie (evento, data, volontari con relative ore) per proporre la scheda intervento completa. NON scrive nulla nel database: serve solo a mostrare un riepilogo all'utente, che deciderà se confermare o correggere. Ogni volontario deve avere un volontario_id reale ottenuto da cerca_volontari: non inventare mai un volontario_id.",
    input_schema: {
      type: 'object',
      properties: {
        evento: { type: 'string' },
        data: { type: 'string', description: 'Data inizio in formato YYYY-MM-DD' },
        data_fine: { type: 'string', description: 'Data fine in formato YYYY-MM-DD, solo se diversa dalla data inizio, altrimenti ometti il campo' },
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
          description: "Testo breve e leggibile in italiano da mostrare in chat all'utente, che riassume cosa hai capito dal messaggio",
        },
      },
      required: ['evento', 'data', 'volontari', 'messaggio_riepilogo'],
    },
  },
];

function buildSystemPrompt(utente: string, conferma: string): string {
  return `Sei l'agente che aiuta ${utente} (staff della Protezione Civile ANA, Sezione di Casale Monferrato) a compilare la Scheda Intervento a partire da messaggi informali di report (spesso copiati o inoltrati da WhatsApp).

Oggi è ${oggiRoma()} (fuso orario Europe/Rome). Usa questa data per risolvere riferimenti relativi ("oggi", "ieri", "stamattina", "sabato scorso"...).

Tipi di attività validi (tipo_attivita): ${TIPO_ATTIVITA.join(', ')}.

Il tuo compito, in ordine:
1. Leggi il messaggio e individua: evento/motivo dell'intervento, data (e data fine se copre più giorni), luogo, tipo attività, i volontari intervenuti con le ore di ciascuno, ed eventuali note utili (uso radio, mezzi, ecc.).
2. Per OGNI nome di persona nel messaggio chiama cerca_volontari per trovare il volontario_id reale. Se c'è un solo candidato plausibile usalo direttamente, senza chiedere conferma. Se ci sono più candidati ambigui o nessun risultato, chiedilo all'utente con una domanda diretta elencando le opzioni trovate.
3. Se le ore di uno o più volontari non sono specificate nel messaggio, NON inventarle: chiedile all'utente (raggruppa tutte le domande sui mancanti in un solo messaggio, non una alla volta). Le ore vanno SEMPRE arrotondate al numero intero più vicino (mai decimali/mezz'ore): se dal messaggio risulta un valore come "3 ore e mezza" o "dalle 14 alle 17:30", arrotonda al numero intero più vicino (in questo caso 4).
4. Se qualcosa è ambiguo o manca (data, evento poco chiaro, tipo attività non deducibile dal contesto) fai una domanda breve e diretta in linguaggio naturale — in quel turno non chiamare proponi_riepilogo.
5. Quando hai tutte le informazioni essenziali (evento, data, volontari con ore risolti — luogo/note/tipo possono restare vuoti se davvero non deducibili), chiama proponi_riepilogo con i dati completi. Non chiamarlo con dati indovinati o incompleti sui volontari.
6. Se l'utente risponde con una correzione dopo un riepilogo (es. "le ore di Mario sono 4", "aggiungi anche Luca", "la data è sbagliata, era ieri"), aggiorna i dati (rifai le ricerche necessarie) e richiama proponi_riepilogo con la versione corretta.
7. Non scrivi mai direttamente nel database: ${conferma}
8. Se uno strumento di ricerca restituisce un errore, dillo all'utente in una frase e non inventare dati.
9. Sii sintetico. Le domande devono essere brevi, dirette, in italiano, e poste solo quando davvero necessarie.`;
}

async function cercaVolontari(leggi: Lettore, query: string) {
  let tutti: any[];
  try { tutti = await leggi('volontari?select=id,cognome,nome&stato=neq.DIMESSO&order=cognome'); }
  catch { return { errore: 'impossibile leggere anagrafica volontari' }; }
  const q = normalizza(query);
  const termini = q.split(/\s+/).filter(Boolean);
  const candidati = (tutti || []).filter((v: any) => {
    const full = normalizza((v.cognome || '') + ' ' + (v.nome || ''));
    if (full.includes(q)) return true;
    return termini.length > 0 && termini.every((t) => full.includes(t));
  });
  return { candidati: candidati.slice(0, 10).map((v: any) => ({ id: v.id, cognome: v.cognome, nome: v.nome })) };
}

async function cercaInterventiRecenti(leggi: Lettore, termine: string | undefined, giorni: number | undefined) {
  let dati: any[];
  try { dati = await leggi('interventi_con_stato?select=id,evento,data,luogo,tipo_attivita,stato_calcolato&order=data.desc&limit=25'); }
  catch { return { errore: 'impossibile leggere interventi recenti' }; }
  const soglia = new Date();
  soglia.setDate(soglia.getDate() - (giorni || 14));
  dati = (dati || []).filter((i: any) => !i.data || new Date(i.data) >= soglia);
  if (termine) {
    const t = normalizza(termine);
    dati = dati.filter((i: any) => normalizza(i.evento || '').includes(t) || normalizza(i.luogo || '').includes(t));
  }
  return { interventi: dati.slice(0, 15) };
}

async function eseguiTool(block: any, leggi: Lettore) {
  if (block.name === 'cerca_volontari') return await cercaVolontari(leggi, block.input?.query || '');
  if (block.name === 'cerca_interventi_recenti') return await cercaInterventiRecenti(leggi, block.input?.termine, block.input?.giorni);
  return { errore: 'tool sconosciuto: ' + block.name };
}

// Un turno di conversazione: riceve i messaggi (formato Anthropic) e risponde con una domanda o una bozza.
// Lancia un errore se l'AI non risponde (chi chiama decide cosa mostrare).
export async function turnoAgente(messaggi: any[], leggi: Lettore, opz: { utente: string; conferma: string }): Promise<Risposta> {
  const chiave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chiave) throw new Error('ANTHROPIC_API_KEY non configurata come secret');
  let msgs = messaggi;
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2048, system: buildSystemPrompt(opz.utente, opz.conferma), tools: TOOLS, messages: msgs }),
      signal: AbortSignal.timeout(90000),
    });
    if (!aiRes.ok) throw new Error('Errore chiamata AI: ' + aiRes.status + ' ' + (await aiRes.text()).slice(0, 300));
    const data = await aiRes.json();
    const content = data.content || [];
    msgs = [...msgs, { role: 'assistant', content }];

    const toolUse = content.filter((b: any) => b.type === 'tool_use');
    if (!toolUse.length) {
      const text = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      return { status: 'question', text: text || 'Puoi darmi qualche dettaglio in più?', messages: msgs };
    }

    const riepilogo = toolUse.find((b: any) => b.name === 'proponi_riepilogo');
    const risultati = [];
    for (const b of toolUse) {
      risultati.push(b.name === 'proponi_riepilogo'
        ? { type: 'tool_result', tool_use_id: b.id, content: "Riepilogo mostrato all'utente. In attesa della sua conferma o di eventuali correzioni." }
        : { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await eseguiTool(b, leggi)) });
    }
    msgs = [...msgs, { role: 'user', content: risultati }];
    if (riepilogo) {
      // Ore sempre intere, a prescindere dal modello
      const draft = riepilogo.input || {};
      if (Array.isArray(draft.volontari)) {
        draft.volontari = draft.volontari.map((v: any) => ({ ...v, ore: (v.ore === null || v.ore === undefined) ? v.ore : Math.round(Number(v.ore)) }));
      }
      return { status: 'draft', text: draft.messaggio_riepilogo || "Ecco la bozza dell'intervento.", draft, messages: msgs };
    }
  }
  return { status: 'question', text: "Non riesco a completare l'analisi in questo turno: prova a riformulare o a dare più dettagli in un unico messaggio.", messages: msgs };
}
