// Supabase Edge Function: agg-api
//
// Unico punto di accesso alle tabelle agg_volontari / agg_dpi_catalogo /
// agg_dpi_volontario / agg_documenti e al bucket privato "agg-privato"
// (tab "Aggiornamento dati" dell'area riservata — vedi aggiornamento-dati.js).
//
// Le tabelle agg_* hanno RLS attiva senza policy: l'anon key del client non le
// legge in nessun modo. Questa function usa la service role key (iniettata
// automaticamente da Supabase in ogni Edge Function come SUPABASE_SERVICE_ROLE_KEY,
// nessun secret da configurare a mano) e la espone SOLO dopo aver verificato
// server-side che chi chiama è un utente master, riautenticando username+password
// contro la tabella utenti esattamente come fa doLogin() in area-riservata.js.
// Non ci si fida mai di un flag "tipo_accesso" mandato dal client.
//
// Ogni azione che legge o scrive dati sensibili (schede, documenti, foto)
// viene registrata in log_attivita / log_accessi, come fa il resto dell'app.
//
// Body richiesta: { username, password, action, payload }
// Risposta: { ok: true, ...dati } oppure { ok: false, error }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const BUCKET = 'agg-privato';

const TIPI_DOCUMENTO = ['FOTO', 'CARTA_IDENTITA', 'CODICE_FISCALE', 'PATENTE', 'ATTESTATO', 'ABILITAZIONE'];
const TIPI_TAGLIA = ['ABITO', 'SCARPA', 'GUANTO', 'UNICA'];

// Documenti "effettivi" del volontario: esclude quelli caricati dal volontario
// tramite link (fase 2) e ancora in attesa di approvazione (stato IN_ATTESA).
const FILTRO_DOC_ATTIVI = 'or=(stato.is.null,stato.not.in.(IN_ATTESA,RIFIUTATO))';

// Fase 2 — link personale per i volontari (vedi agg-pub).
const LINK_BASE_URL = 'https://pcanacasale.com/aggiorna.html?t=';
const LINK_DURATA_GIORNI = 14;
const LINK_MAX_TENTATIVI = 5;

// Campi che il volontario può proporre (devono coincidere con CAMPI_PUB in agg-pub).
const CAMPI_PROPOSTA = [
  'cognome', 'nome', 'codice_fiscale', 'data_nascita', 'luogo_nascita', 'provincia_nascita',
  'indirizzo', 'civico', 'cap', 'citta', 'provincia', 'telefono', 'email',
  'titolo_studio', 'professione', 'patenti', 'tessera_ana',
];

function bytesToBase64Url(b: Uint8Array): string {
  let bin = '';
  b.forEach(x => { bin += String.fromCharCode(x); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Campi di agg_volontari considerati "obbligatori" ai fini della barra di
// completezza (blocco Anagrafica). Elenco regolabile: non è specificato nello
// spec quali campi siano davvero obbligatori, questa è la lista di partenza.
const CAMPI_ANAGRAFICA_OBBLIGATORI = [
  'cognome', 'nome', 'codice_fiscale', 'data_nascita', 'luogo_nascita', 'provincia_nascita',
  'squadra', 'tipo_volontario', 'indirizzo', 'civico', 'cap', 'citta', 'provincia', 'telefono',
];

// Campi aggiornabili dal blocco Anagrafica (whitelist: esclude id, origine,
// creato_il/aggiornato_il e i campi di verifica, che hanno le loro azioni dedicate)
const CAMPI_ANAGRAFICA_MODIFICABILI = [
  'cognome', 'nome', 'codice_fiscale', 'data_nascita', 'luogo_nascita', 'provincia_nascita',
  'squadra', 'tipo_volontario', 'stato', 'indirizzo', 'civico', 'cap', 'citta', 'provincia',
  'telefono', 'email', 'gruppo_alpini', 'titolo_studio', 'professione', 'patenti', 'tessera_ana',
  'note', 'pia_matricola', 'pia_badge',
];

// Categorie DPI suggerite in base a tipo/mansione/specializzazione (solo un
// suggerimento in UI — restano sempre modificabili manualmente).
function categorieSuggerite(v: any): string[] {
  const cat = new Set<string>(['GENERICO']);
  const testo = [v.tipo_volontario, v.mansione, v.specializzazione].filter(Boolean).join(' ').toUpperCase();
  if (testo.includes('CAPOSQUADRA')) cat.add('CAPOSQUADRA');
  if (testo.includes('MOTOSEGH')) cat.add('MOTOSEGHISTA');
  if (testo.includes('CUCINA')) cat.add('CUCINA');
  if (testo.includes('PIEMONTE') || testo.includes('REGIONE')) cat.add('REGIONE PIEMONTE');
  return Array.from(cat);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

function sanitizzaNomeFile(s: string): string {
  return (s || 'file')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function nomeFotoPIA(cognome: string, nome: string): string {
  const pulisci = (s: string) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/'/g, '')
    .trim().toUpperCase().replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
  return pulisci(cognome) + '_' + pulisci(nome) + '_PIA.jpg';
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const handler = withSupabase({ auth: 'none' }, async (req: Request, _ctx: any) => {
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'metodo non supportato' }, 405);

  const SUPA_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPA_URL || !SERVICE_KEY) {
    console.error('Secrets mancanti: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ ok: false, error: 'configurazione server mancante' }, 500);
  }
  const HSRV = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const HSRVJ = { ...HSRV, 'Content-Type': 'application/json' };

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'body non valido' }, 400); }

  const { username, password, action, payload } = body || {};
  if (!username || !password) return jsonResponse({ ok: false, error: 'credenziali mancanti' }, 401);

  // -- Verifica server-side che l'utente sia master, riusando lo stesso
  // meccanismo di identificazione di doLogin() in area-riservata.js. --
  let master: { id: number; nome: string } | null = null;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/utenti?username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}&attivo=eq.true&tipo_accesso=eq.master&select=id,nome`,
      { headers: HSRV }
    );
    const arr = await r.json();
    if (Array.isArray(arr) && arr.length) master = arr[0];
  } catch (e) { console.error('verifica master fallita', e); }
  if (!master) return jsonResponse({ ok: false, error: 'non autorizzato' }, 403);

  const userAgent = req.headers.get('user-agent') || null;

  async function logAttivita(azione: string) {
    try {
      await fetch(`${SUPA_URL}/rest/v1/log_attivita`, {
        method: 'POST', headers: { ...HSRVJ, Prefer: 'return=minimal' },
        body: JSON.stringify({ utente_nome: master!.nome, azione }),
      });
    } catch (e) { console.error('logAttivita fallito', e); }
  }
  async function logAccesso(label: string) {
    try {
      await fetch(`${SUPA_URL}/rest/v1/log_accessi`, {
        method: 'POST', headers: { ...HSRVJ, Prefer: 'return=minimal' },
        body: JSON.stringify({ utente_tipo: 'aggdati', utente_id: master!.id, utente_label: label, user_agent: userAgent }),
      });
    } catch (e) { console.error('logAccesso fallito', e); }
  }

  async function getVolontario(id: number) {
    const r = await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${id}&select=*`, { headers: HSRV });
    const arr = await r.json();
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  }

  // Calcola la percentuale di completezza di un volontario (vedi SPEC:
  // pesi uguali su anagrafica / foto / carta d'identità / codice fiscale /
  // patente (se presente) / DPI valutati / verifica = VERIFICATO).
  // "DPI valutati" = per ogni categoria pertinente (suggerita dal profilo)
  // esiste almeno una riga in agg_dpi_volontario (almeno una scelta fatta):
  // è l'unico segnale disponibile con lo schema attuale (una riga presente
  // vuol dire "ha il capo", non esiste un flag "valutato e non ha").
  function calcolaCompletezza(v: any, dpiRows: any[], docRows: any[]) {
    const blocchi: Record<string, boolean> = {};
    blocchi.anagrafica = CAMPI_ANAGRAFICA_OBBLIGATORI.every(c => v[c] !== null && v[c] !== undefined && String(v[c]).trim() !== '');
    blocchi.foto = docRows.some(d => d.tipo === 'FOTO');
    blocchi.carta_identita = docRows.some(d => d.tipo === 'CARTA_IDENTITA');
    blocchi.codice_fiscale = docRows.some(d => d.tipo === 'CODICE_FISCALE');
    const haPatente = !!(v.patenti && String(v.patenti).trim());
    if (haPatente) blocchi.patente = docRows.some(d => d.tipo === 'PATENTE');
    const catPertinenti = categorieSuggerite(v);
    blocchi.dpi_valutati = catPertinenti.every(cat => dpiRows.some(d => d._categoria === cat));
    blocchi.verifica = v.stato_verifica === 'VERIFICATO';

    const chiavi = Object.keys(blocchi);
    const fatti = chiavi.filter(k => blocchi[k]).length;
    return { percentuale: chiavi.length ? Math.round((fatti / chiavi.length) * 100) : 0, blocchi, foto_presente: blocchi.foto };
  }

  try {
    // ============================================================
    // LISTA
    // ============================================================
    if (action === 'list') {
      const [volRes, dpiRes, docRes, catRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/agg_volontari?select=*&order=cognome.asc,nome.asc`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?select=*`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_documenti?select=id,volontario_id,tipo&${FILTRO_DOC_ATTIVI}`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?select=id,categoria`, { headers: HSRV }),
      ]);
      const vols = await volRes.json();
      const dpi = await dpiRes.json();
      const docs = await docRes.json();
      const catalogo = await catRes.json();
      const catById: Record<number, string> = {};
      (catalogo || []).forEach((c: any) => { catById[c.id] = c.categoria; });
      (dpi || []).forEach((d: any) => { d._categoria = catById[d.dpi_id]; });

      const docsByVol: Record<number, any[]> = {};
      (docs || []).forEach((d: any) => { (docsByVol[d.volontario_id] ||= []).push(d); });
      const dpiByVol: Record<number, any[]> = {};
      (dpi || []).forEach((d: any) => { (dpiByVol[d.volontario_id] ||= []).push(d); });

      const cards = (vols || []).map((v: any) => {
        const dr = dpiByVol[v.id] || [];
        const dc = docsByVol[v.id] || [];
        const comp = calcolaCompletezza(v, dr, dc);
        return {
          id: v.id, cognome: v.cognome, nome: v.nome, squadra: v.squadra,
          tipo_volontario: v.tipo_volontario, stato: v.stato, stato_verifica: v.stato_verifica,
          pia_matricola: v.pia_matricola, pia_badge: v.pia_badge,
          completezza: comp.percentuale, blocchi: comp.blocchi, foto_presente: comp.foto_presente,
        };
      });

      const contatori = {
        totale: cards.length,
        foto_mancante: cards.filter((c: any) => !c.blocchi.foto).length,
        dpi_mancanti: cards.filter((c: any) => !c.blocchi.dpi_valutati).length,
        documenti_mancanti: cards.filter((c: any) => !c.blocchi.carta_identita || !c.blocchi.codice_fiscale || (c.blocchi.patente === false)).length,
        da_verificare: cards.filter((c: any) => c.stato_verifica !== 'VERIFICATO').length,
      };

      return jsonResponse({ ok: true, cards, contatori });
    }

    // ============================================================
    // SCHEDA SINGOLA
    // ============================================================
    if (action === 'get') {
      const id = Number(payload?.id);
      if (!id) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const v = await getVolontario(id);
      if (!v) return jsonResponse({ ok: false, error: 'volontario non trovato' }, 404);

      const [dpiRes, docRes, catRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?volontario_id=eq.${id}&select=*`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_documenti?volontario_id=eq.${id}&${FILTRO_DOC_ATTIVI}&select=id,tipo,descrizione,scadenza,nome_file,caricato_il&order=caricato_il.desc`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?select=*&order=categoria.asc,ordine.asc`, { headers: HSRV }),
      ]);
      const dpiRows = await dpiRes.json();
      const docRows = await docRes.json();
      const catalogo = await catRes.json();
      const catById: Record<number, any> = {};
      (catalogo || []).forEach((c: any) => { catById[c.id] = c; });
      (dpiRows || []).forEach((d: any) => { d._categoria = catById[d.dpi_id]?.categoria || null; d._nome = catById[d.dpi_id]?.nome || null; });

      const comp = calcolaCompletezza(v, dpiRows || [], docRows || []);
      await logAccesso(master!.nome + ' ha consultato la scheda di ' + v.cognome + ' ' + v.nome);

      return jsonResponse({
        ok: true, volontario: v, dpi: dpiRows, documenti: docRows, catalogo,
        categorie_suggerite: categorieSuggerite(v), completezza: comp,
      });
    }

    // ============================================================
    // ANAGRAFICA — aggiornamento
    // ============================================================
    if (action === 'update_anagrafica') {
      const id = Number(payload?.id);
      const campi = payload?.campi || {};
      if (!id) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const patch: Record<string, unknown> = { aggiornato_il: new Date().toISOString() };
      for (const k of Object.keys(campi)) {
        if (CAMPI_ANAGRAFICA_MODIFICABILI.includes(k)) patch[k] = campi[k];
      }
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${id}`, {
        method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });
      if (!r.ok) return jsonResponse({ ok: false, error: 'errore salvataggio: ' + await r.text() }, 500);
      const arr = await r.json();
      await logAttivita(master!.nome + ' ha aggiornato l\'anagrafica di ' + (arr[0]?.cognome || '') + ' ' + (arr[0]?.nome || '') + ' (agg. dati)');
      return jsonResponse({ ok: true, volontario: arr[0] });
    }

    // ============================================================
    // VERIFICA
    // ============================================================
    if (action === 'set_verifica') {
      const id = Number(payload?.id);
      const stato = String(payload?.stato_verifica || '');
      if (!id || !['DA_FARE', 'IN_CORSO', 'VERIFICATO'].includes(stato)) return jsonResponse({ ok: false, error: 'parametri non validi' }, 400);
      const patch: Record<string, unknown> = {
        stato_verifica: stato,
        verificato_il: stato === 'VERIFICATO' ? new Date().toISOString() : null,
        verificato_da: stato === 'VERIFICATO' ? master!.nome : null,
        aggiornato_il: new Date().toISOString(),
      };
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${id}`, {
        method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });
      if (!r.ok) return jsonResponse({ ok: false, error: 'errore salvataggio: ' + await r.text() }, 500);
      const arr = await r.json();
      await logAttivita(master!.nome + ' ha impostato la verifica di ' + (arr[0]?.cognome || '') + ' ' + (arr[0]?.nome || '') + ' a ' + stato);
      return jsonResponse({ ok: true, volontario: arr[0] });
    }

    // ============================================================
    // CATALOGO DPI
    // ============================================================
    if (action === 'dpi_catalogo_list') {
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?select=*&order=categoria.asc,ordine.asc`, { headers: HSRV });
      return jsonResponse({ ok: true, catalogo: await r.json() });
    }

    if (action === 'dpi_catalogo_upsert') {
      const p = payload || {};
      if (!p.categoria || !p.nome || !TIPI_TAGLIA.includes(p.tipo_taglia)) return jsonResponse({ ok: false, error: 'parametri non validi' }, 400);
      const record = { categoria: p.categoria, nome: p.nome, tipo_taglia: p.tipo_taglia, ordine: p.ordine ?? 0, attivo: p.attivo !== false };
      let r: Response;
      if (p.id) {
        r = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?id=eq.${Number(p.id)}`, {
          method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=representation' }, body: JSON.stringify(record),
        });
      } else {
        r = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo`, {
          method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' }, body: JSON.stringify(record),
        });
      }
      if (!r.ok) return jsonResponse({ ok: false, error: 'errore salvataggio: ' + await r.text() }, 500);
      const arr = await r.json();
      await logAttivita(master!.nome + ' ha ' + (p.id ? 'modificato' : 'aggiunto') + ' il capo DPI "' + record.nome + '" (' + record.categoria + ')');
      return jsonResponse({ ok: true, capo: arr[0] });
    }

    // ============================================================
    // DPI VOLONTARIO (ha / non ha, taglia, consegnato)
    // ============================================================
    if (action === 'dpi_set') {
      const volontarioId = Number(payload?.volontario_id);
      const dpiId = Number(payload?.dpi_id);
      if (!volontarioId || !dpiId) return jsonResponse({ ok: false, error: 'parametri non validi' }, 400);
      const ha = !!payload?.ha;

      const esistRes = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?volontario_id=eq.${volontarioId}&dpi_id=eq.${dpiId}&select=id`, { headers: HSRV });
      const esist = await esistRes.json();
      const rigaId = Array.isArray(esist) && esist.length ? esist[0].id : null;

      if (!ha) {
        if (rigaId) await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?id=eq.${rigaId}`, { method: 'DELETE', headers: HSRV });
        await logAttivita(master!.nome + ' ha segnato "non ha" un DPI per il volontario #' + volontarioId);
        return jsonResponse({ ok: true, rimosso: true });
      }

      const record = {
        volontario_id: volontarioId, dpi_id: dpiId,
        taglia: payload?.taglia ?? null, consegnato: !!payload?.consegnato,
        data_consegna: payload?.data_consegna ?? null, note: payload?.note ?? null,
        aggiornato_il: new Date().toISOString(),
      };
      let r: Response;
      if (rigaId) {
        r = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?id=eq.${rigaId}`, {
          method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=representation' }, body: JSON.stringify(record),
        });
      } else {
        r = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario`, {
          method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' }, body: JSON.stringify(record),
        });
      }
      if (!r.ok) return jsonResponse({ ok: false, error: 'errore salvataggio: ' + await r.text() }, 500);
      const arr = await r.json();
      await logAttivita(master!.nome + ' ha aggiornato un DPI per il volontario #' + volontarioId);
      return jsonResponse({ ok: true, riga: arr[0] });
    }

    // ============================================================
    // DOCUMENTI — upload (JSON + file in base64)
    // ============================================================
    if (action === 'doc_upload') {
      const p = payload || {};
      const volontarioId = Number(p.volontario_id);
      const tipo = String(p.tipo || '');
      if (!volontarioId || !TIPI_DOCUMENTO.includes(tipo)) return jsonResponse({ ok: false, error: 'parametri non validi' }, 400);
      if (!p.file_base64 || !p.content_type) return jsonResponse({ ok: false, error: 'file mancante' }, 400);

      const v = await getVolontario(volontarioId);
      if (!v) return jsonResponse({ ok: false, error: 'volontario non trovato' }, 404);

      let bytes: Uint8Array;
      try { bytes = base64ToBytes(p.file_base64); } catch { return jsonResponse({ ok: false, error: 'file non decodificabile' }, 400); }

      if (tipo === 'FOTO') {
        // Verifica server-side dei vincoli PIA (il client fa già tutta la pipeline,
        // questo è un controllo di sicurezza, non una seconda elaborazione).
        if (p.content_type !== 'image/jpeg') return jsonResponse({ ok: false, error: 'la foto deve essere JPEG' }, 400);
        if (bytes.length > 50 * 1024) return jsonResponse({ ok: false, error: 'la foto supera i 50 KB' }, 400);

        // Nome file deciso server-side da cognome/nome reali (mai dal client),
        // con suffisso id in caso di omonimi già presenti nel bucket.
        let nomeFile = nomeFotoPIA(v.cognome, v.nome);
        const omonimiRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?tipo=eq.FOTO&nome_file=eq.${encodeURIComponent(nomeFile)}&volontario_id=neq.${volontarioId}&select=id`, { headers: HSRV });
        const omonimi = await omonimiRes.json();
        if (Array.isArray(omonimi) && omonimi.length) nomeFile = nomeFotoPIA(v.cognome, v.nome).replace(/\.jpg$/, '_' + volontarioId + '.jpg');

        // Una sola foto attiva: elimina l'eventuale documento FOTO precedente.
        const vecchiRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?volontario_id=eq.${volontarioId}&tipo=eq.FOTO&${FILTRO_DOC_ATTIVI}&select=id,storage_path`, { headers: HSRV });
        const vecchi = await vecchiRes.json();
        for (const d of (vecchi || [])) {
          await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${d.storage_path}`, { method: 'DELETE', headers: HSRV });
          await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${d.id}`, { method: 'DELETE', headers: HSRV });
        }

        const storagePath = `${volontarioId}/foto/${nomeFile}`;
        const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
          method: 'POST', headers: { ...HSRV, 'Content-Type': p.content_type, 'x-upsert': 'true' }, body: bytes,
        });
        if (!up.ok) return jsonResponse({ ok: false, error: 'errore upload: ' + await up.text() }, 500);

        const insRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti`, {
          method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' },
          body: JSON.stringify({ volontario_id: volontarioId, tipo: 'FOTO', nome_file: nomeFile, storage_path: storagePath, caricato_il: new Date().toISOString(), stato: 'OK' }),
        });
        if (!insRes.ok) return jsonResponse({ ok: false, error: 'errore salvataggio record: ' + await insRes.text() }, 500);
        const doc = (await insRes.json())[0];

        await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${volontarioId}`, {
          method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ pia_foto: true }),
        });
        await logAttivita(master!.nome + ' ha caricato la foto PIA di ' + v.cognome + ' ' + v.nome);
        return jsonResponse({ ok: true, documento: doc });
      }

      // Documenti generici (carta identità, CF, patente, attestati, abilitazioni)
      if (bytes.length > 10 * 1024 * 1024) return jsonResponse({ ok: false, error: 'file troppo grande (max 10MB)' }, 400);
      const nomeOriginale = sanitizzaNomeFile(String(p.nome_file || 'documento'));
      const storagePath = `${volontarioId}/documenti/${tipo}_${Date.now()}_${nomeOriginale}`;
      const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
        method: 'POST', headers: { ...HSRV, 'Content-Type': p.content_type, 'x-upsert': 'true' }, body: bytes,
      });
      if (!up.ok) return jsonResponse({ ok: false, error: 'errore upload: ' + await up.text() }, 500);

      const insRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti`, {
        method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' },
        body: JSON.stringify({
          volontario_id: volontarioId, tipo, descrizione: p.descrizione || null, scadenza: p.scadenza || null,
          nome_file: p.nome_file || nomeOriginale, storage_path: storagePath, caricato_il: new Date().toISOString(), stato: 'OK',
        }),
      });
      if (!insRes.ok) return jsonResponse({ ok: false, error: 'errore salvataggio record: ' + await insRes.text() }, 500);
      const doc = (await insRes.json())[0];
      await logAttivita(master!.nome + ' ha caricato un documento (' + tipo + ') per ' + v.cognome + ' ' + v.nome);
      return jsonResponse({ ok: true, documento: doc });
    }

    // ============================================================
    // DOCUMENTI — elimina
    // ============================================================
    if (action === 'doc_delete') {
      const id = Number(payload?.id);
      if (!id) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${id}&select=*`, { headers: HSRV });
      const arr = await r.json();
      const doc = Array.isArray(arr) && arr.length ? arr[0] : null;
      if (!doc) return jsonResponse({ ok: false, error: 'documento non trovato' }, 404);

      await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${doc.storage_path}`, { method: 'DELETE', headers: HSRV });
      await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${id}`, { method: 'DELETE', headers: HSRV });

      if (doc.tipo === 'FOTO') {
        await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${doc.volontario_id}`, {
          method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ pia_foto: false }),
        });
      }
      await logAttivita(master!.nome + ' ha eliminato un documento (' + doc.tipo + ') dal volontario #' + doc.volontario_id);
      return jsonResponse({ ok: true });
    }

    // ============================================================
    // DOCUMENTI — signed URL a scadenza breve (anteprima/download)
    // ============================================================
    if (action === 'doc_signed_url') {
      const id = Number(payload?.id);
      if (!id) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${id}&select=storage_path,tipo,volontario_id,nome_file`, { headers: HSRV });
      const arr = await r.json();
      const doc = Array.isArray(arr) && arr.length ? arr[0] : null;
      if (!doc) return jsonResponse({ ok: false, error: 'documento non trovato' }, 404);

      const signRes = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${doc.storage_path}`, {
        method: 'POST', headers: HSRVJ, body: JSON.stringify({ expiresIn: 60 }),
      });
      if (!signRes.ok) return jsonResponse({ ok: false, error: 'errore generazione link: ' + await signRes.text() }, 500);
      const signed = await signRes.json();
      const url = `${SUPA_URL}/storage/v1${signed.signedURL}`;

      await logAccesso(master!.nome + ' ha scaricato/visualizzato un documento (' + doc.tipo + ') del volontario #' + doc.volontario_id);
      return jsonResponse({ ok: true, url, expires_in: 60, nome_file: doc.nome_file });
    }

    // ============================================================
    // FASE 2 — LINK PERSONALE: genera (il token in chiaro esce una volta sola)
    // ============================================================
    if (action === 'link_genera') {
      const volontarioId = Number(payload?.volontario_id);
      if (!volontarioId) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const v = await getVolontario(volontarioId);
      if (!v) return jsonResponse({ ok: false, error: 'volontario non trovato' }, 404);
      if (!v.data_nascita) return jsonResponse({ ok: false, error: 'serve la data di nascita in anagrafica: il volontario la usa per identificarsi' }, 400);

      // Un solo link attivo per volontario: revoca gli eventuali precedenti.
      await fetch(`${SUPA_URL}/rest/v1/agg_link?volontario_id=eq.${volontarioId}&revocato=not.is.true`, {
        method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ revocato: true }),
      });

      const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const scadeIl = new Date(Date.now() + LINK_DURATA_GIORNI * 86400000).toISOString();
      const ins = await fetch(`${SUPA_URL}/rest/v1/agg_link`, {
        method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' },
        body: JSON.stringify({
          volontario_id: volontarioId, token_hash: await sha256Hex(token), creato_il: new Date().toISOString(),
          creato_da: master!.nome, scade_il: scadeIl, revocato: false, tentativi_falliti: 0, usi: 0,
        }),
      });
      if (!ins.ok) return jsonResponse({ ok: false, error: 'errore creazione link: ' + await ins.text() }, 500);
      await logAttivita(master!.nome + ' ha generato il link di aggiornamento dati per ' + v.cognome + ' ' + v.nome);
      return jsonResponse({ ok: true, url: LINK_BASE_URL + token, scade_il: scadeIl, telefono: v.telefono || null, nome: v.nome, cognome: v.cognome });
    }

    if (action === 'link_revoca') {
      const volontarioId = Number(payload?.volontario_id);
      if (!volontarioId) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_link?volontario_id=eq.${volontarioId}&revocato=not.is.true`, {
        method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ revocato: true }),
      });
      if (!r.ok) return jsonResponse({ ok: false, error: 'errore revoca: ' + await r.text() }, 500);
      await logAttivita(master!.nome + ' ha revocato il link di aggiornamento dati del volontario #' + volontarioId);
      return jsonResponse({ ok: true });
    }

    // ============================================================
    // FASE 2 — PROPOSTE dei volontari
    // ============================================================
    if (action === 'proposte_lista') {
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_proposte?stato=eq.DA_APPROVARE&select=id,volontario_id,creato_il,inviata_il&order=inviata_il.desc`, { headers: HSRV });
      const arr = await r.json();
      return jsonResponse({ ok: true, proposte: Array.isArray(arr) ? arr : [] });
    }

    // Stato del link + eventuale proposta in attesa, con confronto campo per campo.
    if (action === 'proposta_dettaglio') {
      const volontarioId = Number(payload?.volontario_id);
      if (!volontarioId) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const v = await getVolontario(volontarioId);
      if (!v) return jsonResponse({ ok: false, error: 'volontario non trovato' }, 404);

      const [linkRes, propRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/agg_link?volontario_id=eq.${volontarioId}&select=id,creato_il,creato_da,scade_il,revocato,tentativi_falliti,ultimo_accesso,usi&order=creato_il.desc&limit=1`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_proposte?volontario_id=eq.${volontarioId}&stato=eq.DA_APPROVARE&select=*&order=creato_il.desc&limit=1`, { headers: HSRV }),
      ]);
      const linkArr = await linkRes.json();
      const propArr = await propRes.json();
      const l = Array.isArray(linkArr) && linkArr.length ? linkArr[0] : null;
      const link = l ? {
        ...l,
        bloccato: (l.tentativi_falliti || 0) >= LINK_MAX_TENTATIVI,
        scaduto: new Date(l.scade_il).getTime() < Date.now(),
        attivo: !l.revocato && (l.tentativi_falliti || 0) < LINK_MAX_TENTATIVI && new Date(l.scade_il).getTime() >= Date.now(),
      } : null;

      const p = Array.isArray(propArr) && propArr.length ? propArr[0] : null;
      if (!p) return jsonResponse({ ok: true, link, proposta: null });

      const norm = (x: unknown) => (x === null || x === undefined) ? '' : String(x).trim();
      const datiProp = p.dati || {};
      const campi = CAMPI_PROPOSTA
        .filter(k => k in datiProp)
        .map(k => ({
          campo: k,
          attuale: k === 'data_nascita' && v[k] ? String(v[k]).slice(0, 10) : (v[k] ?? null),
          proposto: datiProp[k] ?? null,
        }))
        .filter(c => norm(c.attuale) !== norm(c.proposto));

      const [catRes, dpiRes, docRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?select=id,categoria,nome,tipo_taglia`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?volontario_id=eq.${volontarioId}&select=dpi_id,taglia,consegnato`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_documenti?proposta_id=eq.${p.id}&stato=eq.IN_ATTESA&select=id,tipo,descrizione,scadenza,nome_file,caricato_il&order=caricato_il.asc`, { headers: HSRV }),
      ]);
      const catalogo = await catRes.json();
      const dpiAttuali = await dpiRes.json();
      const catById: Record<number, any> = {};
      (catalogo || []).forEach((c: any) => { catById[c.id] = c; });
      const dpi = (Array.isArray(p.dpi) ? p.dpi : [])
        .map((r: any) => {
          const att = (dpiAttuali || []).find((d: any) => d.dpi_id === r.dpi_id);
          return {
            dpi_id: r.dpi_id, nome: catById[r.dpi_id]?.nome || ('capo #' + r.dpi_id), categoria: catById[r.dpi_id]?.categoria || '',
            attuale: att ? { ha: true, taglia: att.taglia || null } : { ha: false, taglia: null },
            proposto: { ha: !!r.ha, taglia: r.taglia || null },
          };
        })
        .filter((r: any) => r.attuale.ha !== r.proposto.ha || (r.proposto.ha && norm(r.attuale.taglia) !== norm(r.proposto.taglia)));

      await logAccesso(master!.nome + ' ha consultato la proposta di aggiornamento di ' + v.cognome + ' ' + v.nome);
      return jsonResponse({
        ok: true, link,
        proposta: {
          id: p.id, creato_il: p.creato_il, inviata_il: p.inviata_il || p.creato_il,
          privacy_accettata_il: datiProp._privacy_accettata_il || null,
          campi, dpi, documenti: await docRes.json(),
        },
      });
    }

    if (action === 'proposta_approva' || action === 'proposta_rifiuta') {
      const id = Number(payload?.id);
      if (!id) return jsonResponse({ ok: false, error: 'id mancante' }, 400);
      const pr = await fetch(`${SUPA_URL}/rest/v1/agg_proposte?id=eq.${id}&stato=eq.DA_APPROVARE&select=*`, { headers: HSRV });
      const prArr = await pr.json();
      const p = Array.isArray(prArr) && prArr.length ? prArr[0] : null;
      if (!p) return jsonResponse({ ok: false, error: 'proposta non trovata o già gestita' }, 404);
      const v = await getVolontario(p.volontario_id);
      if (!v) return jsonResponse({ ok: false, error: 'volontario non trovato' }, 404);
      const ora = new Date().toISOString();
      const approva = action === 'proposta_approva';

      // Prima chiude la proposta (il filtro su DA_APPROVARE evita doppie approvazioni concorrenti).
      const chiudi = await fetch(`${SUPA_URL}/rest/v1/agg_proposte?id=eq.${id}&stato=eq.DA_APPROVARE`, {
        method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=representation' },
        body: JSON.stringify({
          stato: approva ? 'APPROVATA' : 'RIFIUTATA', gestita_il: ora, gestita_da: master!.nome,
          note: payload?.note ? String(payload.note).slice(0, 1000) : (p.note ?? null),
        }),
      });
      if (!chiudi.ok) return jsonResponse({ ok: false, error: 'errore aggiornamento proposta: ' + await chiudi.text() }, 500);
      if (!(await chiudi.json()).length) return jsonResponse({ ok: false, error: 'proposta già gestita' }, 409);

      const docRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?proposta_id=eq.${id}&stato=eq.IN_ATTESA&select=*`, { headers: HSRV });
      const docInAttesa: any[] = (await docRes.json()) || [];
      const docAccettati = approva ? new Set((payload?.documenti || []).map(Number)) : new Set<number>();
      const errori: string[] = [];

      if (approva) {
        // 1) Anagrafica: solo i campi spuntati, solo tra quelli proponibili.
        const datiProp = p.dati || {};
        const patch: Record<string, unknown> = {};
        for (const k of (payload?.campi || [])) {
          if (CAMPI_PROPOSTA.includes(k) && k in datiProp) patch[k] = datiProp[k] === '' ? null : datiProp[k];
        }
        if (Object.keys(patch).length) {
          patch.aggiornato_il = ora;
          const r = await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${v.id}`, {
            method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
          });
          if (!r.ok) errori.push('anagrafica: ' + await r.text());
        }

        // 2) DPI: righe spuntate → agg_dpi_volontario (ha = upsert taglia, non ha = rimozione).
        const dpiScelti = new Set((payload?.dpi || []).map(Number));
        for (const r of (Array.isArray(p.dpi) ? p.dpi : [])) {
          if (!dpiScelti.has(Number(r.dpi_id))) continue;
          const esRes = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?volontario_id=eq.${v.id}&dpi_id=eq.${Number(r.dpi_id)}&select=id`, { headers: HSRV });
          const es = await esRes.json();
          const rigaId = Array.isArray(es) && es.length ? es[0].id : null;
          let res: Response | null = null;
          if (!r.ha) {
            if (rigaId) res = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?id=eq.${rigaId}`, { method: 'DELETE', headers: HSRV });
          } else if (rigaId) {
            res = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?id=eq.${rigaId}`, {
              method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ taglia: r.taglia ?? null, aggiornato_il: ora }),
            });
          } else {
            res = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario`, {
              method: 'POST', headers: { ...HSRVJ, Prefer: 'return=minimal' },
              body: JSON.stringify({ volontario_id: v.id, dpi_id: Number(r.dpi_id), taglia: r.taglia ?? null, consegnato: false, aggiornato_il: ora }),
            });
          }
          if (res && !res.ok) errori.push('DPI #' + r.dpi_id + ': ' + await res.text());
        }

        // 3) Documenti accettati → OK. La foto approvata sostituisce quella attuale.
        for (const d of docInAttesa.filter(d => docAccettati.has(d.id))) {
          if (d.tipo === 'FOTO') {
            const vecchiRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?volontario_id=eq.${v.id}&tipo=eq.FOTO&${FILTRO_DOC_ATTIVI}&select=id,storage_path`, { headers: HSRV });
            for (const old of ((await vecchiRes.json()) || [])) {
              await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${old.storage_path}`, { method: 'DELETE', headers: HSRV });
              await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${old.id}`, { method: 'DELETE', headers: HSRV });
            }
          }
          const r = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${d.id}`, {
            method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ stato: 'OK' }),
          });
          if (!r.ok) { errori.push('documento ' + d.tipo + ': ' + await r.text()); continue; }
          if (d.tipo === 'FOTO') {
            await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${v.id}`, {
              method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ pia_foto: true }),
            });
          }
        }

        // Proposta chiusa: il link non serve più (il master può generarne uno nuovo).
        await fetch(`${SUPA_URL}/rest/v1/agg_link?volontario_id=eq.${v.id}&revocato=not.is.true`, {
          method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify({ revocato: true }),
        });
      }

      // Documenti non accettati (o proposta rifiutata): file e record eliminati.
      for (const d of docInAttesa.filter(d => !docAccettati.has(d.id))) {
        await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${d.storage_path}`, { method: 'DELETE', headers: HSRV });
        await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${d.id}`, { method: 'DELETE', headers: HSRV });
      }

      await logAttivita(master!.nome + (approva ? ' ha approvato' : ' ha rifiutato') + ' la proposta di aggiornamento dati di ' + v.cognome + ' ' + v.nome
        + (approva ? ' (' + (payload?.campi || []).length + ' campi, ' + (payload?.dpi || []).length + ' DPI, ' + docAccettati.size + ' documenti)' : ''));
      if (errori.length) {
        console.error('proposta ' + id + ' applicata con errori', errori);
        return jsonResponse({ ok: false, error: 'proposta chiusa ma alcune modifiche non sono state applicate: ' + errori.join(' | ') }, 500);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'azione sconosciuta' }, 400);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: 'errore interno' }, 500);
  }
});

export default {
  fetch: (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    return handler(req);
  },
};
