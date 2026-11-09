// Supabase Edge Function: archivio-volontario
//
// Archivio documenti del volontario su Google Drive (Drive condiviso), in sola lettura.
// Ogni volontario ha volontari.drive_folder_id; dentro ci sono le sottocartelle "Attestati" e "Documenti".
//
// verify_jwt = false perché il controllo è qui: ogni richiesta porta il token della sessione
// (Supabase Auth, staff e volontari) e passa se:
//   - chi chiede ha ho_permesso('documenti_volontari'), 'volontari' o 'formazione' (i master li hanno di default), oppure
//   - chi chiede è proprio quel volontario (mio_volontario_id() = volontario_id).
//
// GET ?azione=lista&volontario_id=N            → elenco file di Attestati e Documenti
// GET ?azione=file&volontario_id=N&file_id=X   → il file in streaming (solo se sta in una delle due cartelle)
// POST ?azione=importa                         → porta nel registro formazione (formazione_registro) data e
//   scadenza dei corsi fissi (4 ore, 12 ore, Caposquadra, DAE) e le abilitazioni prese dai file Attestati di
//   tutti i volontari (anche file senza "Abilitazione -" nel nome, se il titolo è di una voce abilitazione del
//   catalogo). Salta le copie "(copia)/(2)" e i doppioni stesso volontario + voce + data. Solo con permesso formazione o modifica_volontari. Ogni riga importata ricorda il file
//   (drive_file_id): rilanciando, i file già importati si saltano. Nessuna riga viene cancellata.
//
// Secrets: GOOGLE_SA_JSON (service account con accesso in lettura al Drive condiviso).
// Ogni apertura di file finisce in log_attivita.

const ORIGINI = ['https://pcanacasale.com', 'https://www.pcanacasale.com'];
const LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const SOTTOCARTELLE = ['Attestati', 'Documenti'];
const DRIVE = 'https://www.googleapis.com/drive/v3';
const COMUNI = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
const GOOGLE_NATIVI = 'application/vnd.google-apps.';

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINI.includes(o) || LOCALE.test(o) ? o : ORIGINI[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'content-disposition, content-type',
    'Vary': 'Origin',
  };
}

function ambiente() {
  const get = (k: string) => Deno.env.get(k) || '';
  return { supaUrl: get('SUPABASE_URL'), service: get('SUPABASE_SERVICE_ROLE_KEY'), anon: get('SUPABASE_ANON_KEY'), sa: get('GOOGLE_SA_JSON') };
}

class Errore extends Error { constructor(public status: number, msg: string) { super(msg); } }

// -- AUTENTICAZIONE (con il token di chi chiede) --
async function chiEChiede(req: Request, perImport = false) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Errore(401, 'Accesso richiesto.');
  const { supaUrl, anon } = ambiente();
  const h = { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' };
  const u = await fetch(supaUrl + '/auth/v1/user', { headers: h });
  if (!u.ok) throw new Errore(401, 'Sessione scaduta: esci e rientra.');
  const rpc = async (nome: string, corpo: unknown) => {
    const r = await fetch(supaUrl + '/rest/v1/rpc/' + nome, { method: 'POST', headers: h, body: JSON.stringify(corpo) });
    return r.ok ? await r.json() : null;
  };
  const [permArchivio, permVolontari, mioId, prof, permFormazione, permModifica] = await Promise.all([
    rpc('ho_permesso', { chiave: 'documenti_volontari' }),
    rpc('ho_permesso', { chiave: 'volontari' }),
    rpc('mio_volontario_id', {}),
    rpc('mio_profilo', {}),
    rpc('ho_permesso', { chiave: 'formazione' }),
    perImport ? rpc('ho_permesso', { chiave: 'modifica_volontari' }) : null,
  ]);
  const p = Array.isArray(prof) ? prof[0] : prof;
  const nome = p ? [p.cognome, p.nome].filter(Boolean).join(' ') : '';
  return {
    staff: permArchivio === true || permVolontari === true || permFormazione === true,
    importa: permFormazione === true || permModifica === true,
    mioId: mioId == null ? null : Number(mioId), nome: nome || 'Utente',
  };
}

// -- DATABASE (service role, solo lato server) --
async function db(metodo: string, percorso: string, corpo?: unknown) {
  const { supaUrl, service } = ambiente();
  const r = await fetch(supaUrl + '/rest/v1/' + percorso, {
    method: metodo,
    headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error('db ' + percorso.split('?')[0] + ': ' + r.status);
  return metodo === 'GET' ? await r.json() : null;
}

async function logAttivita(utente: string, azione: string) {
  try { await db('POST', 'log_attivita', { utente_nome: utente, azione }); }
  catch (e) { console.error('log attività non scritto:', e instanceof Error ? e.message : e); }
}

// -- GOOGLE: token del service account (JWT RS256 con WebCrypto), tenuto in memoria --
let tokenGoogle: { valore: string; scade: number } | null = null;

const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  let s = ''; bytes.forEach(x => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function googleToken(): Promise<string> {
  if (tokenGoogle && tokenGoogle.scade > Date.now() + 60000) return tokenGoogle.valore;
  const sa = JSON.parse(ambiente().sa);
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const chiave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const ora = Math.floor(Date.now() / 1000);
  const testa = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: ora, exp: ora + 3600 }));
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chiave, new TextEncoder().encode(testa + '.' + corpo)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + testa + '.' + corpo + '.' + b64url(firma),
  });
  if (!r.ok) throw new Error('token Google: ' + r.status);
  const d = await r.json();
  tokenGoogle = { valore: d.access_token, scade: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tokenGoogle.valore;
}

async function drive(percorso: string): Promise<Response> {
  const r = await fetch(DRIVE + percorso, { headers: { Authorization: 'Bearer ' + await googleToken() } });
  if (r.status === 404) throw new Errore(404, 'File non trovato.');
  if (!r.ok) {
    let motivo = '';
    try { const e = await r.json(); motivo = [e.error?.errors?.[0]?.reason, e.error?.message].filter(Boolean).join(' – '); } catch (_) { /* corpo non JSON */ }
    throw new Error('Drive ' + percorso.split('?')[0] + ': ' + r.status + (motivo ? ' ' + motivo.slice(0, 300) : ''));
  }
  return r;
}

async function elenco(q: string, campi: string) {
  const out: any[] = [];
  let pagina = '';
  do {
    const r = await drive('/files?' + COMUNI + '&pageSize=1000&q=' + encodeURIComponent(q)
      + '&fields=' + encodeURIComponent('nextPageToken,files(' + campi + ')') + (pagina ? '&pageToken=' + pagina : ''));
    const d = await r.json();
    out.push(...(d.files || []));
    pagina = d.nextPageToken || '';
  } while (pagina);
  return out;
}

// Sottocartelle di una cartella volontario: { Attestati: id, Documenti: id }
async function sottocartelle(cartella: string) {
  const sotto: Record<string, string> = {};
  const radice = String(cartella).replace(/'/g, '');
  const f = await elenco("'" + radice + "' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'", 'id,name');
  f.forEach(x => {
    const nome = SOTTOCARTELLE.find(s => s.toLowerCase() === String(x.name).trim().toLowerCase());
    if (nome && !sotto[nome]) sotto[nome] = x.id;
  });
  return sotto;
}

async function cartelle(volId: number) {
  const [v] = await db('GET', 'volontari?id=eq.' + volId + '&select=id,cognome,nome,drive_folder_id');
  if (!v) throw new Errore(404, 'Volontario non trovato.');
  return { v, sotto: v.drive_folder_id ? await sottocartelle(v.drive_folder_id) : {} as Record<string, string> };
}

function fileDi(cartella: string, campi = 'id,name') {
  return elenco("'" + cartella + "' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'", campi);
}

// -- NOME FILE → tipo, titolo, data, scadenza --
// "Tipo - Titolo - AAAA-MM-GG.pdf", "... - AAAA-MM-GG - scade AAAA-MM-GG.pdf", "... - AAAA-MM-GG scade AAAA-MM.pdf"
const DATA = String.raw`(\d{4})[-_.](\d{1,2})(?:[-_.](\d{1,2}))?`;
function isoData(a: string, m: string, g?: string) {
  const mm = Number(m);
  if (mm < 1 || mm > 12) return null;
  const gg = g ? Number(g) : new Date(Date.UTC(Number(a), mm, 0)).getUTCDate();   // solo mese: ultimo giorno
  if (gg < 1 || gg > 31) return null;
  return a + '-' + String(mm).padStart(2, '0') + '-' + String(gg).padStart(2, '0');
}
// "(copia)", "(2)"… alla fine del nome: copie dello stesso file
const COPIA = /\s*\((copia|\d+)\)(?=\.[a-z0-9]{2,5}$|$)/i;
function leggiNome(nomeFile: string) {
  let s = nomeFile.replace(/\.[a-z0-9]{2,5}$/i, '').replace(COPIA, '').trim();
  let scadenza: string | null = null, data: string | null = null;
  const sc = s.match(new RegExp(String.raw`[\s\-–]*scad(?:e|enza)?[\s:]+` + DATA + String.raw`\s*$`, 'i'));
  if (sc) { scadenza = isoData(sc[1], sc[2], sc[3]); s = s.slice(0, sc.index).trim(); }
  const dt = s.match(new RegExp(String.raw`[\s\-–]*` + DATA + String.raw`\s*$`));
  if (dt && dt[3]) { data = isoData(dt[1], dt[2], dt[3]); s = s.slice(0, dt.index).trim(); }
  s = s.replace(/[\s\-–]+$/, '');
  const parti = s.split(/\s+[-–]\s+/).map(x => x.trim()).filter(Boolean);
  const tipo = parti.length > 1 ? parti[0] : null;
  const titolo = parti.length > 1 ? parti.slice(1).join(' - ') : (parti[0] || nomeFile);
  return { tipo, titolo, data, scadenza };
}

// -- AZIONI --
async function lista(volId: number) {
  const { sotto } = await cartelle(volId);
  const file: any[] = [];
  for (const categoria of SOTTOCARTELLE) {
    if (!sotto[categoria]) continue;
    const f = await fileDi(sotto[categoria], 'id,name,mimeType,size');
    f.forEach(x => file.push({ id: x.id, nome_file: x.name, categoria, ...leggiNome(x.name), dimensione: x.size ? Number(x.size) : null }));
  }
  file.sort((a, b) => (b.data || '').localeCompare(a.data || '') || a.nome_file.localeCompare(b.nome_file, 'it'));
  return file;
}

async function scarica(req: Request, volId: number, fileId: string, utente: string) {
  if (!/^[\w-]{10,200}$/.test(fileId)) throw new Errore(400, 'File non valido.');
  const [{ v, sotto }, meta] = await Promise.all([
    cartelle(volId),
    drive('/files/' + fileId + '?' + COMUNI + '&fields=id,name,mimeType,parents,size,trashed').then(r => r.json()),
  ]);
  const ammesse = Object.values(sotto);
  if (meta.trashed || !(meta.parents || []).some((p: string) => ammesse.includes(p))) throw new Errore(403, 'Non autorizzato.');
  const nativo = String(meta.mimeType || '').startsWith(GOOGLE_NATIVI);
  const r = await drive('/files/' + fileId + (nativo ? '/export?mimeType=application%2Fpdf&' : '?alt=media&') + COMUNI);
  const nome = nativo ? meta.name + '.pdf' : meta.name;
  await logAttivita(utente, 'ha aperto dall\'archivio Drive "' + meta.name + '" di ' + v.cognome + ' ' + v.nome);
  return new Response(r.body, {
    headers: {
      ...cors(req),
      'Content-Type': nativo ? 'application/pdf' : (meta.mimeType || 'application/octet-stream'),
      'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(nome),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// -- IMPORT NEL REGISTRO FORMAZIONE --
// Il corso fisso si riconosce dalle parole chiave del catalogo (formazione_catalogo, stessa regola di
// formazione_voce() nel database e di arcVoce() nel browser). Le espressioni qui sotto servono solo
// se il catalogo non c'è ancora.
function norm(t: string) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const CORSI_FISSI = [
  { codice: '4_ORE',  titolo: 'Corso 4 ore',       campo: 'quattro_ore',  re: /sensibilizzazione\s+(al\s+)?rischio|\b4\s*ore\b|quattro\s+ore/i },
  { codice: '12_ORE', titolo: 'Corso 12 ore',      campo: 'dodici_ore',   re: /rischio\s+alto|\b12\s*ore\b|dodici\s+ore/i },
  { codice: 'CAPOSQ', titolo: 'Corso Caposquadra', campo: 'corso_caposq', re: /capo\s*squadra/i },
  { codice: 'DAE',    titolo: 'DAE',               campo: 'dae',          re: /defibrillat|\bDAE\b|\bBLSD\b|\bAED\b/i },
];

async function aGruppi<T>(elenco: T[], quanti: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < elenco.length; i += quanti) await Promise.all(elenco.slice(i, i + quanti).map(fn));
}

async function importa(utente: string) {
  const vols = await db('GET', 'volontari?drive_folder_id=not.is.null&select=id,drive_folder_id');
  const reg: any[] = await db('GET', 'formazione_registro?select=id,volontario_id,tipo,codice,titolo,data_corso,scadenza,drive_file_id,catalogo_id');
  const giaImportati = new Set(reg.map(r => r.drive_file_id).filter(Boolean));
  let catalogo: any[] = [];
  try { catalogo = await db('GET', 'formazione_catalogo?attivo=eq.true&select=id,tipo,codice,parole_chiave,ordine&order=ordine,id'); } catch (_) { /* catalogo non ancora creato */ }
  // voce del catalogo dalle parole chiave ("Da verificare" esclusa)
  const voceDi = (tipo: string, testo: string) => {
    const t = ' ' + norm(testo) + ' ';
    return catalogo.find(c => c.tipo === tipo && c.codice !== 'DA_VERIFICARE'
      && (c.parole_chiave || []).some((k: string) => norm(k) && t.includes(' ' + norm(k)))) || null;
  };
  const corsoDi = (testo: string) => {
    if (!catalogo.length) return CORSI_FISSI.find(c => c.re.test(testo));
    const voce = voceDi('CORSO', testo);
    return voce ? CORSI_FISSI.find(c => c.codice === voce.codice) : undefined;
  };
  // Doppioni: stesso volontario, stessa voce, stessa data (es. attestato e tesserino dello stesso corso)
  const chiavi = new Set(reg.filter(r => r.catalogo_id && r.data_corso).map(r => r.volontario_id + '|' + r.catalogo_id + '|' + r.data_corso));
  let saltati = 0;
  const nuove: any[] = [];
  const modifiche: { id: number; volontario_id: number; codice: string | null; corpo: any }[] = [];
  const corsiToccati = new Map<number, Set<string>>();   // volontario → codici fissi con almeno un file
  let errori = 0;

  await aGruppi(vols, 6, async (v: any) => {
    try {
      const sotto = await sottocartelle(v.drive_folder_id);
      if (!sotto.Attestati) return;
      const tutti = (await fileDi(sotto.Attestati)).map((x: any) => ({ id: x.id, nome: x.name, ...leggiNome(x.name) }));
      const nomi = new Set(tutti.map((f: any) => f.nome.toLowerCase()));
      const file = tutti
        .filter((f: any) => !giaImportati.has(f.id))
        // "nome (copia).pdf" con l'originale nella stessa cartella: si salta
        .filter((f: any) => { const orig = f.nome.replace(COPIA, ''); const copia = orig !== f.nome && nomi.has(orig.toLowerCase()); if (copia) saltati++; return !copia; })
        .sort((a: any, b: any) => (b.data || '').localeCompare(a.data || ''));   // il più recente per primo
      for (const f of file) {
        const testo = (f.titolo || '') + ' ' + f.nome;
        const corso = corsoDi(testo);
        // abilitazione: nome "Abilitazione - …" oppure titolo riconosciuto da una voce abilitazione del catalogo
        const voceAbil = corso ? null : voceDi('ABILITAZIONE', f.titolo || '');
        const abil = !corso && (!!voceAbil || /^abilitazion/i.test(f.tipo || ''));
        if (!corso && !abil) continue;
        const voceId = corso ? (catalogo.find(c => c.codice === corso.codice) || {}).id : voceAbil ? voceAbil.id : null;
        if (voceId && f.data) {
          const k = v.id + '|' + voceId + '|' + f.data;
          if (chiavi.has(k)) { saltati++; continue; }
          chiavi.add(k);
        }
        const base = { data_corso: f.data, scadenza: f.scadenza, drive_file_id: f.id };
        // riga già presente senza file: si completa (pregressi dei corsi fissi, abilitazioni inserite a mano)
        const esistente = reg.find(r => r.volontario_id === v.id && !r.drive_file_id && (corso
          ? r.codice === corso.codice && !r.data_corso
          : r.tipo === 'ABILITAZIONE' && String(r.titolo).trim().toLowerCase() === String(f.titolo).trim().toLowerCase() && (!r.data_corso || r.data_corso === f.data)));
        if (esistente) {
          esistente.drive_file_id = f.id;
          const corpo = { ...base, data_corso: f.data || esistente.data_corso, scadenza: f.scadenza || esistente.scadenza };
          esistente.scadenza = corpo.scadenza;
          modifiche.push({ id: esistente.id, volontario_id: v.id, codice: esistente.codice, corpo });
        } else {
          nuove.push({ volontario_id: v.id, tipo: corso ? 'CORSO' : 'ABILITAZIONE', codice: corso ? corso.codice : null,
            titolo: corso ? corso.titolo : f.titolo, note: 'Da archivio Drive: ' + f.nome, ...base });
        }
        if (corso) {
          if (!corsiToccati.has(v.id)) corsiToccati.set(v.id, new Set());
          corsiToccati.get(v.id)!.add(corso.codice);
        }
      }
    } catch (e) {
      errori++;
      console.error('importa volontario ' + v.id + ':', e instanceof Error ? e.message : e);
    }
  });

  for (const m of modifiche) await db('PATCH', 'formazione_registro?id=eq.' + m.id, m.corpo);
  for (let i = 0; i < nuove.length; i += 200) await db('POST', 'formazione_registro', nuove.slice(i, i + 200));

  // Spunte dei corsi fissi in volontari: si aggiungono, mai si tolgono. DAE prende la scadenza più lontana.
  const tutte = reg.concat(nuove);
  for (const [volId, codici] of corsiToccati) {
    const corpo: Record<string, unknown> = {};
    codici.forEach(cod => {
      const c = CORSI_FISSI.find(x => x.codice === cod)!;
      corpo[c.campo] = true;
      if (cod === 'DAE') {
        const sc = tutte.filter(r => r.volontario_id === volId && r.codice === 'DAE').map(r => r.scadenza).filter(Boolean).sort().pop();
        if (sc) corpo.scad_dae = sc;
      }
    });
    await db('PATCH', 'volontari?id=eq.' + volId, corpo);
  }

  const esito = { volontari: vols.length, completate: modifiche.length, aggiunte: nuove.length, saltati, errori };
  await logAttivita(utente, 'ha importato da Drive il registro formazione: ' + esito.completate + ' righe completate, ' + esito.aggiunte + ' aggiunte, ' + saltati + ' doppioni saltati');
  return esito;
}

Deno.serve(async (req) => {
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    const url = new URL(req.url);
    const azione = url.searchParams.get('azione');
    if (req.method === 'POST' && azione === 'importa') {
      const chi = await chiEChiede(req, true);
      if (!chi.importa) return json({ ok: false, error: 'Non autorizzato.' }, 403);
      return json({ ok: true, ...(await importa(chi.nome)) });
    }
    if (req.method !== 'GET') return json({ ok: false, error: 'Metodo non ammesso.' }, 405);
    const volId = Number(url.searchParams.get('volontario_id'));
    if (!Number.isInteger(volId) || volId <= 0) return json({ ok: false, error: 'Volontario non valido.' }, 400);
    const chi = await chiEChiede(req);
    if (!chi.staff && chi.mioId !== volId) return json({ ok: false, error: 'Non autorizzato.' }, 403);
    if (azione === 'lista') return json({ ok: true, file: await lista(volId) });
    if (azione === 'file') return await scarica(req, volId, url.searchParams.get('file_id') || '', chi.nome);
    return json({ ok: false, error: 'Azione non valida.' }, 400);
  } catch (e) {
    if (e instanceof Errore) return json({ ok: false, error: e.message }, e.status);
    console.error('archivio-volontario:', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'Archivio non disponibile, riprova tra poco.' }, 500);
  }
});
