// Supabase Edge Function: agg-pub
//
// Endpoint PUBBLICO (verify_jwt = false) usato da aggiorna.html: il volontario
// apre il link personale generato dal master (agg-api → link_genera) e propone
// l'aggiornamento dei propri dati. Nessun login: l'accesso è dato dal token
// del link + la data di nascita.
//
// Sicurezza:
// - Il token in chiaro non è mai salvato: in agg_link.token_hash c'è solo lo SHA-256.
// - Ogni chiamata riverifica link (esistente, non revocato, non scaduto, non
//   bloccato) e data di nascita. 5 tentativi errati → link bloccato.
// - Espone SOLO i dati di quel volontario e il catalogo DPI attivo.
// - Scrive SOLO in agg_proposte e agg_documenti (stato IN_ATTESA, origine
//   VOLONTARIO) + storage agg-privato/<volontario>/<proposta>/…, oltre ai
//   contatori di accesso in agg_link. Mai su altre tabelle: i dati reali
//   cambiano solo quando il master approva la proposta (agg-api → proposta_approva).
// - Messaggi d'errore generici, nessun dettaglio interno al client.
//
// Body JSON: { t, data_nascita, action, ... }   (action: apri | invia | doc_rimuovi)
// Upload:    multipart/form-data con t, data_nascita, action=upload, tipo, descrizione, scadenza, file
// Risposta:  { ok: true, ... } oppure { ok: false, error }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const BUCKET = 'agg-privato';
const MAX_TENTATIVI = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_PER_PROPOSTA = 15;
const MAX_FOTO_BYTES = 50 * 1024;
const MAX_FIRMA_BYTES = 300 * 1024;
const DESCR_FIRMA = 'Firma per il consenso al trattamento dei dati personali';

const MSG_LINK = 'Link non valido o scaduto. Chiedi alla segreteria un nuovo link.';

// Campi anagrafica che il volontario può vedere e proporre di modificare.
const CAMPI_PUB = [
  'cognome', 'nome', 'codice_fiscale', 'data_nascita', 'luogo_nascita', 'provincia_nascita',
  'indirizzo', 'civico', 'cap', 'citta', 'provincia', 'telefono', 'email',
  'titolo_studio', 'professione', 'patenti', 'tessera_ana',
];

// FIRMA: firma autografa (PNG dal riquadro di firma) che autorizza il
// trattamento dei dati personali; una sola per proposta, fuori dal limite file.
const TIPI_DOC_PUB = ['FOTO', 'CARTA_IDENTITA', 'CODICE_FISCALE', 'PATENTE', 'ATTESTATO', 'ABILITAZIONE', 'FIRMA'];
// Tipi con uno "slot" per lato (descrizione FRONTE / RETRO): un nuovo file
// nello stesso slot sostituisce il precedente della stessa proposta.
const TIPI_DOC_SLOT = ['CARTA_IDENTITA', 'CODICE_FISCALE', 'PATENTE'];

const TAGLIE: Record<string, string[]> = {
  ABITO:  ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'],
  SCARPA: Array.from({ length: 14 }, (_, i) => String(35 + i)),
  GUANTO: ['S', 'M', 'L', 'XL', 'XXL'],
  UNICA:  [],
};

// Stessa logica di agg-api (tenerle allineate).
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
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function nomeFotoPIA(cognome: string, nome: string): string {
  const pulisci = (s: string) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/'/g, '')
    .trim().toUpperCase().replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
  return pulisci(cognome) + '_' + pulisci(nome) + '_PIA.jpg';
}

// Tipo reale del file dai magic bytes (mai fidarsi del content-type del client).
function rilevaTipo(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D) return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

function stringaPulita(v: unknown, max = 200): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}
const reData = /^\d{4}-\d{2}-\d{2}$/;

const handler = withSupabase({ auth: 'none' }, async (req: Request, _ctx: any) => {
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'metodo non supportato' }, 405);

  const SUPA_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPA_URL || !SERVICE_KEY) {
    console.error('Secrets mancanti: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ ok: false, error: 'servizio non disponibile' }, 500);
  }
  const HSRV = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const HSRVJ = { ...HSRV, 'Content-Type': 'application/json' };

  // -- Lettura richiesta (JSON oppure multipart per l'upload) --
  let campi: Record<string, any> = {};
  let file: File | null = null;
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) {
        if (k === 'file' && v instanceof File) file = v;
        else if (typeof v === 'string') campi[k] = v;
      }
    } else {
      campi = await req.json();
    }
  } catch { return jsonResponse({ ok: false, error: 'richiesta non valida' }, 400); }

  const token = String(campi.t || '');
  const dataNascita = String(campi.data_nascita || '');
  const action = String(campi.action || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return jsonResponse({ ok: false, error: MSG_LINK }, 404);

  // -- Verifica link --
  const hash = await sha256Hex(token);
  const linkRes = await fetch(`${SUPA_URL}/rest/v1/agg_link?token_hash=eq.${hash}&select=*`, { headers: HSRV });
  const linkArr = await linkRes.json();
  const link = Array.isArray(linkArr) && linkArr.length ? linkArr[0] : null;
  if (!link || link.revocato || !link.scade_il || new Date(link.scade_il).getTime() < Date.now()
      || (link.tentativi_falliti || 0) >= MAX_TENTATIVI) {
    return jsonResponse({ ok: false, error: MSG_LINK }, 404);
  }

  const vRes = await fetch(`${SUPA_URL}/rest/v1/agg_volontari?id=eq.${Number(link.volontario_id)}&select=*`, { headers: HSRV });
  const vArr = await vRes.json();
  const v = Array.isArray(vArr) && vArr.length ? vArr[0] : null;
  if (!v || !v.data_nascita) return jsonResponse({ ok: false, error: MSG_LINK }, 404);

  async function patchLink(patch: Record<string, unknown>) {
    try {
      await fetch(`${SUPA_URL}/rest/v1/agg_link?id=eq.${link.id}`, {
        method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
    } catch (e) { console.error('patch agg_link fallita', e); }
  }

  // -- Verifica data di nascita --
  if (!reData.test(dataNascita) || dataNascita !== String(v.data_nascita).slice(0, 10)) {
    const falliti = (link.tentativi_falliti || 0) + 1;
    await patchLink({ tentativi_falliti: falliti });
    if (falliti >= MAX_TENTATIVI) return jsonResponse({ ok: false, error: 'Troppi tentativi errati: il link è stato bloccato. Chiedi alla segreteria un nuovo link.', bloccato: true }, 403);
    return jsonResponse({ ok: false, error: 'Data di nascita non corretta.', tentativi_rimasti: MAX_TENTATIVI - falliti, verifica: true }, 401);
  }

  const ora = new Date().toISOString();
  const patchAccesso: Record<string, unknown> = { ultimo_accesso: ora };
  if (link.tentativi_falliti) patchAccesso.tentativi_falliti = 0;
  if (action === 'apri' || action === 'invia') patchAccesso.usi = (link.usi || 0) + 1;
  await patchLink(patchAccesso);

  // Proposta ancora aperta (in attesa) per questo volontario, se c'è.
  async function propostaAperta() {
    const r = await fetch(`${SUPA_URL}/rest/v1/agg_proposte?volontario_id=eq.${v.id}&stato=eq.DA_APPROVARE&select=*&order=creato_il.desc&limit=1`, { headers: HSRV });
    const arr = await r.json();
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  }
  async function documentiProposta(propostaId: number) {
    const r = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?proposta_id=eq.${propostaId}&volontario_id=eq.${v.id}&stato=eq.IN_ATTESA&select=id,tipo,descrizione,scadenza,nome_file,caricato_il&order=caricato_il.asc`, { headers: HSRV });
    const arr = await r.json();
    return Array.isArray(arr) ? arr : [];
  }
  async function eliminaDocumento(d: { id: number; storage_path: string }) {
    if (d.storage_path) await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${d.storage_path}`, { method: 'DELETE', headers: HSRV });
    await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${d.id}`, { method: 'DELETE', headers: HSRV });
  }

  try {
    // ============================================================
    // APRI — dati del volontario, catalogo DPI attivo, eventuale proposta in attesa
    // ============================================================
    if (action === 'apri') {
      const [catRes, dpiRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?attivo=eq.true&select=id,categoria,nome,tipo_taglia,ordine&order=categoria.asc,ordine.asc`, { headers: HSRV }),
        fetch(`${SUPA_URL}/rest/v1/agg_dpi_volontario?volontario_id=eq.${v.id}&select=dpi_id,taglia`, { headers: HSRV }),
      ]);
      const catalogo = await catRes.json();
      const dpi = await dpiRes.json();
      const dati: Record<string, unknown> = {};
      CAMPI_PUB.forEach(k => { dati[k] = v[k] ?? null; });
      if (dati.data_nascita) dati.data_nascita = String(dati.data_nascita).slice(0, 10);

      const p = await propostaAperta();
      const proposta = p ? {
        id: p.id, inviata_il: p.inviata_il || p.creato_il, dati: p.dati || {}, dpi: p.dpi || [],
        documenti: await documentiProposta(p.id),
      } : null;

      return jsonResponse({
        ok: true, volontario: dati, catalogo: Array.isArray(catalogo) ? catalogo : [],
        dpi: Array.isArray(dpi) ? dpi : [], categorie_suggerite: categorieSuggerite(v),
        proposta, scade_il: link.scade_il,
        limiti: { max_file: MAX_FILE_PER_PROPOSTA, max_bytes: MAX_FILE_BYTES },
      });
    }

    // ============================================================
    // INVIA — crea o aggiorna la proposta DA_APPROVARE
    // ============================================================
    if (action === 'invia') {
      if (campi.privacy !== true) return jsonResponse({ ok: false, error: 'Devi confermare di aver letto l\'informativa privacy.' }, 400);

      const ingresso = (campi.dati && typeof campi.dati === 'object') ? campi.dati : {};
      const dati: Record<string, unknown> = {};
      for (const k of CAMPI_PUB) {
        const val = stringaPulita(ingresso[k]);
        if (k === 'data_nascita' && val && !reData.test(val)) continue;
        dati[k] = (k === 'codice_fiscale' && val) ? val.toUpperCase().replace(/\s+/g, '') : val;
      }
      dati._privacy_accettata_il = ora;

      // DPI: solo capi attivi del catalogo, taglia coerente con tipo_taglia.
      const catRes = await fetch(`${SUPA_URL}/rest/v1/agg_dpi_catalogo?attivo=eq.true&select=id,tipo_taglia`, { headers: HSRV });
      const catalogo = await catRes.json();
      const catById: Record<number, any> = {};
      (Array.isArray(catalogo) ? catalogo : []).forEach((c: any) => { catById[c.id] = c; });
      const visti = new Set<number>();
      const dpi: any[] = [];
      for (const r of (Array.isArray(campi.dpi) ? campi.dpi : [])) {
        const id = Number(r?.dpi_id);
        const capo = catById[id];
        if (!capo || visti.has(id) || typeof r?.ha !== 'boolean') continue;
        visti.add(id);
        const ammesse = TAGLIE[capo.tipo_taglia] || [];
        const taglia = r.ha && ammesse.includes(String(r.taglia)) ? String(r.taglia) : null;
        dpi.push({ dpi_id: id, ha: r.ha, taglia });
      }

      const esistente = await propostaAperta();
      let proposta: any;
      if (esistente) {
        const r = await fetch(`${SUPA_URL}/rest/v1/agg_proposte?id=eq.${esistente.id}&stato=eq.DA_APPROVARE`, {
          method: 'PATCH', headers: { ...HSRVJ, Prefer: 'return=representation' },
          body: JSON.stringify({ dati, dpi, link_id: link.id, inviata_il: ora }),
        });
        if (!r.ok) { console.error('update proposta', await r.text()); return jsonResponse({ ok: false, error: 'Invio non riuscito, riprova.' }, 500); }
        proposta = (await r.json())[0];
      } else {
        const r = await fetch(`${SUPA_URL}/rest/v1/agg_proposte`, {
          method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' },
          body: JSON.stringify({ volontario_id: v.id, link_id: link.id, stato: 'DA_APPROVARE', dati, dpi, creato_il: ora, inviata_il: ora }),
        });
        if (!r.ok) { console.error('insert proposta', await r.text()); return jsonResponse({ ok: false, error: 'Invio non riuscito, riprova.' }, 500); }
        proposta = (await r.json())[0];
      }
      if (!proposta) return jsonResponse({ ok: false, error: 'Invio non riuscito, riprova.' }, 500);
      return jsonResponse({ ok: true, proposta_id: proposta.id, documenti: await documentiProposta(proposta.id) });
    }

    // ============================================================
    // UPLOAD — un file per chiamata, legato alla proposta aperta
    // ============================================================
    if (action === 'upload') {
      const tipo = String(campi.tipo || '');
      if (!TIPI_DOC_PUB.includes(tipo) || !file) return jsonResponse({ ok: false, error: 'File non valido.' }, 400);
      const p = await propostaAperta();
      if (!p) return jsonResponse({ ok: false, error: 'Invia prima il modulo, poi carica i file.' }, 409);
      if (file.size > MAX_FILE_BYTES) return jsonResponse({ ok: false, error: 'File troppo grande (massimo 10 MB).' }, 400);

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > MAX_FILE_BYTES) return jsonResponse({ ok: false, error: 'File troppo grande (massimo 10 MB).' }, 400);
      const rilevato = rilevaTipo(bytes);
      if (!rilevato) return jsonResponse({ ok: false, error: 'Formato non ammesso: solo JPG, PNG o PDF.' }, 400);
      if (tipo === 'FOTO' && (rilevato.mime !== 'image/jpeg' || bytes.length > MAX_FOTO_BYTES)) {
        return jsonResponse({ ok: false, error: 'Foto non valida (JPG sotto i 50 KB).' }, 400);
      }
      if (tipo === 'FIRMA' && (rilevato.mime !== 'image/png' || bytes.length > MAX_FIRMA_BYTES)) {
        return jsonResponse({ ok: false, error: 'Firma non valida, riprova.' }, 400);
      }

      let descrizione = stringaPulita(campi.descrizione, 150);
      if (TIPI_DOC_SLOT.includes(tipo)) descrizione = descrizione === 'RETRO' ? 'RETRO' : 'FRONTE';
      if (tipo === 'FOTO') descrizione = null;
      if (tipo === 'FIRMA') descrizione = DESCR_FIRMA;
      const scadenzaRaw = stringaPulita(campi.scadenza, 10);
      const scadenza = (tipo === 'ATTESTATO' || tipo === 'ABILITAZIONE') && scadenzaRaw && reData.test(scadenzaRaw) ? scadenzaRaw : null;

      // Sostituzione: stessa foto / stesso lato dello stesso documento.
      const sostituireRes = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?proposta_id=eq.${p.id}&volontario_id=eq.${v.id}&stato=eq.IN_ATTESA&select=id,tipo,descrizione,storage_path`, { headers: HSRV });
      const esistenti: any[] = await sostituireRes.json();
      const daSostituire = (Array.isArray(esistenti) ? esistenti : []).filter(d =>
        (tipo === 'FOTO' && d.tipo === 'FOTO') ||
        (tipo === 'FIRMA' && d.tipo === 'FIRMA') ||
        (TIPI_DOC_SLOT.includes(tipo) && d.tipo === tipo && (d.descrizione || 'FRONTE') === descrizione));
      const contati = (Array.isArray(esistenti) ? esistenti : []).filter(d => d.tipo !== 'FIRMA');
      const totaleDopo = contati.length - daSostituire.filter(d => d.tipo !== 'FIRMA').length + 1;
      if (tipo !== 'FIRMA' && totaleDopo > MAX_FILE_PER_PROPOSTA) return jsonResponse({ ok: false, error: `Puoi caricare al massimo ${MAX_FILE_PER_PROPOSTA} file.` }, 400);

      // Nome file deciso dal server, mai quello del client.
      const nomeFile = tipo === 'FOTO'
        ? nomeFotoPIA(v.cognome, v.nome)
        : tipo === 'FIRMA'
        ? nomeFotoPIA(v.cognome, v.nome).replace(/_PIA\.jpg$/, '_FIRMA_' + Date.now() + '.png')
        : `${tipo}_${descrizione && TIPI_DOC_SLOT.includes(tipo) ? descrizione + '_' : ''}${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${rilevato.ext}`;
      const storagePath = `${v.id}/${p.id}/${tipo === 'FOTO' ? 'foto_' + Date.now() + '_' : ''}${nomeFile}`;

      const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
        method: 'POST', headers: { ...HSRV, 'Content-Type': rilevato.mime, 'x-upsert': 'false' }, body: bytes,
      });
      if (!up.ok) { console.error('upload storage', await up.text()); return jsonResponse({ ok: false, error: 'Caricamento non riuscito, riprova.' }, 500); }

      const ins = await fetch(`${SUPA_URL}/rest/v1/agg_documenti`, {
        method: 'POST', headers: { ...HSRVJ, Prefer: 'return=representation' },
        body: JSON.stringify({
          volontario_id: v.id, proposta_id: p.id, tipo, descrizione, scadenza,
          nome_file: nomeFile, storage_path: storagePath, caricato_il: ora,
          stato: 'IN_ATTESA', origine: 'VOLONTARIO',
        }),
      });
      if (!ins.ok) {
        console.error('insert documento', await ins.text());
        await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`, { method: 'DELETE', headers: HSRV });
        return jsonResponse({ ok: false, error: 'Caricamento non riuscito, riprova.' }, 500);
      }
      const doc = (await ins.json())[0];
      for (const d of daSostituire) await eliminaDocumento(d);

      return jsonResponse({ ok: true, documento: { id: doc.id, tipo: doc.tipo, descrizione: doc.descrizione, scadenza: doc.scadenza, nome_file: doc.nome_file } });
    }

    // ============================================================
    // DOC_RIMUOVI — solo un proprio documento ancora in attesa
    // ============================================================
    if (action === 'doc_rimuovi') {
      const id = Number(campi.id);
      const p = await propostaAperta();
      if (!id || !p) return jsonResponse({ ok: false, error: 'Documento non trovato.' }, 404);
      const r = await fetch(`${SUPA_URL}/rest/v1/agg_documenti?id=eq.${id}&proposta_id=eq.${p.id}&volontario_id=eq.${v.id}&stato=eq.IN_ATTESA&select=id,storage_path`, { headers: HSRV });
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) return jsonResponse({ ok: false, error: 'Documento non trovato.' }, 404);
      await eliminaDocumento(arr[0]);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'richiesta non valida' }, 400);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: 'Errore temporaneo, riprova tra poco.' }, 500);
  }
});

export default {
  fetch: (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    return handler(req);
  },
};
