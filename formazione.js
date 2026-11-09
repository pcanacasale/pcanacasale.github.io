// ============================================================
// AMMINISTRAZIONE — pagine Visite mediche e Formazione.
// Prefisso funzioni: fz* (registro formazione); le visite tengono i nomi storici.
// ============================================================
// Le visite stanno in volontari (data_visita, stato_visita, cdc_*).
// Il registro sta in formazione_registro (supabase/formazione_registro.sql): i corsi con
// codice sono quelli fissi della scheda e fzRiallinea ne ricopia l'esito in volontari.
// ============================================================

// -- VISITE MEDICHE --
let visiteData = [];

async function caricaVisite() {
  const list = document.getElementById('visiteList');
  if (!list) return;
  list.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/volontari?select=*&or=(stato.is.null,stato.neq.DIMESSO)&order=cognome,nome', { headers: H });
    if (!res.ok) throw new Error('errore');
    visiteData = await res.json();
    renderDashboardVisite();
    filtraVisite();
  } catch(e) {
    list.innerHTML = '<div class="loading-msg bad">Non disponibile.</div>';
  }
}

function renderDashboardVisite() {
  const dash = document.getElementById('visiteDashboard');
  if (!dash) return;
  const cnt = { VUOTO: 0 };
  Object.keys(VISITA_STATI).forEach(k => { cnt[k] = 0; });
  visiteData.forEach(v => { const k = visitaStatoNorm(v) || 'VUOTO'; if (cnt[k] !== undefined) cnt[k]++; });
  const corrente = document.getElementById('visiteFiltroStato').value;
  const voci = [['', 'Tutti', visiteData.length]]
    .concat(Object.keys(VISITA_STATI).map(k => [k, VISITA_STATI[k].label, cnt[k]]))
    .concat([['VUOTO', 'Non impostato', cnt.VUOTO]]);
  dash.innerHTML = voci.map(c => '<button class="chip' + (corrente === c[0] ? ' on' : '') + '" onclick="filtraVisitePerStato(\'' + c[0] + '\')">'
    + c[1] + ' <span class="n">' + c[2] + '</span></button>').join('');
}

function filtraVisitePerStato(stato) {
  const sel = document.getElementById('visiteFiltroStato');
  sel.value = sel.value === stato ? '' : stato;
  filtraVisite();
  renderDashboardVisite();
}

function filtraVisite() {
  const q = document.getElementById('visiteSearch').value.toLowerCase().trim();
  const stato = document.getElementById('visiteFiltroStato').value;
  renderVisite(visiteData.filter(v => {
    if (q && !((v.cognome || '') + ' ' + (v.nome || '') + ' ' + (v.codice_fiscale || '') + ' ' + (v.note_visita || '')).toLowerCase().includes(q)) return false;
    return !stato || (visitaStatoNorm(v) || 'VUOTO') === stato;
  }));
}

function renderVisite(data) {
  const list = document.getElementById('visiteList');
  if (!data.length) { list.innerHTML = '<div class="empty">Nessun volontario trovato.</div>'; return; }
  list.innerHTML = '<div class="card tbl db-wrap"><table class="db-table visite-tbl"><thead><tr>'
    + '<th>Cognome</th><th>Nome</th><th>Codice fiscale</th><th>Stato visita</th><th>Esito visita</th><th>Data visita</th><th>Scadenza</th><th>CDC 1°</th><th>CDC 2°</th><th>Note</th>'
    + '</tr></thead><tbody>' + data.map(v => '<tr>'
      + '<td><b>' + aggEsc(v.cognome || '') + '</b></td><td>' + aggEsc(v.nome || '') + '</td><td>' + aggEsc(v.codice_fiscale || '—') + '</td>'
      + '<td><select aria-label="Stato visita" onchange="cambiaVisitaCampo(' + v.id + ',\'stato_visita\',this.value)">' + visitaOpzioniHtml(visitaStatoNorm(v)) + '</select></td>'
      + '<td><select aria-label="Esito visita" onchange="cambiaVisitaCampo(' + v.id + ',\'esito_visita\',this.value)">' + visitaEsitoOpzioniHtml(v.esito_visita) + '</select></td>'
      + '<td><input type="date" aria-label="Data visita" value="' + aggEsc(v.data_visita || '') + '" onchange="cambiaVisitaCampo(' + v.id + ',\'data_visita\',this.value)"></td>'
      + '<td><input type="date" aria-label="Scadenza visita" value="' + aggEsc(v.scadenza_visita || '') + '" onchange="cambiaVisitaCampo(' + v.id + ',\'scadenza_visita\',this.value)">'
        + (svStatoScadenza(v.scadenza_visita) ? '<div style="margin-top:4px">' + svPillScadenza(svStatoScadenza(v.scadenza_visita)) + '</div>' : '') + '</td>'
      + '<td><input type="checkbox" aria-label="CDC 1° Step"' + (v.cdc_1_step ? ' checked' : '') + ' onchange="cambiaVisitaCampo(' + v.id + ',\'cdc_1_step\',this.checked)"></td>'
      + '<td><input type="checkbox" aria-label="CDC 2° Step"' + (v.cdc_2_step ? ' checked' : '') + ' onchange="cambiaVisitaCampo(' + v.id + ',\'cdc_2_step\',this.checked)"></td>'
      + '<td><textarea class="visite-note" rows="1" aria-label="Note visita di ' + aggEsc((v.cognome || '') + ' ' + (v.nome || '')) + '" placeholder="Note" onchange="cambiaVisitaCampo(' + v.id + ',\'note_visita\',this.value.trim())">' + aggEsc(v.note_visita || '') + '</textarea></td>'
      + '</tr>').join('') + '</tbody></table></div>';
}

// Esito della visita (volontari.esito_visita, supabase/visite_esito_scadenza.sql)
const VISITA_ESITI = {
  IDONEO: 'Idoneo', IDONEO_LIMITAZIONI: 'Idoneo con Limitazioni', IDONEO_PRESCRIZIONI: 'Idoneo con Prescrizioni', INIDONEO: 'Inidoneo',
};
function visitaEsitoOpzioniHtml(sel) {
  return '<option value="">—</option>' + Object.keys(VISITA_ESITI).map(k =>
    '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + VISITA_ESITI[k] + '</option>').join('');
}

async function cambiaVisitaCampo(volId, campo, valore) {
  const v = visiteData.find(x => x.id === volId);
  if (!v) return;
  if (valore === '') valore = null;
  const err = document.getElementById('visiteErr');
  err.hidden = true;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + volId, {
      method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ [campo]: valore }),
    });
    if (!res.ok) throw new Error('errore');
    v[campo] = valore;
    if (campo === 'stato_visita') renderDashboardVisite();
    if (campo === 'scadenza_visita') filtraVisite();     // aggiorna l'avviso di scadenza
    logAttivita('ha modificato la visita di: ' + v.cognome + ' ' + v.nome);
  } catch(e) {
    err.textContent = 'Modifica non salvata per ' + v.cognome + ' ' + v.nome + ': riprova.';
    err.hidden = false;
    filtraVisite();
  }
}

// L'esportazione lavora sull'elenco Volontari, che qui può non essere ancora caricato
function apriExportVisitePagina() {
  if (!volontariData.length) volontariData = visiteData;
  apriExportVisite();
}

// -- REGISTRO FORMAZIONE --
const FZ_CORSI_FISSI = {
  '4_ORE':  { titolo: 'Corso 4 ore',       campo: 'quattro_ore' },
  '12_ORE': { titolo: 'Corso 12 ore',      campo: 'dodici_ore' },
  'CAPOSQ': { titolo: 'Corso Caposquadra', campo: 'corso_caposq' },
  'DAE':    { titolo: 'DAE',               campo: 'dae', scadenza: 'scad_dae' },
};
const FZ_FILTRI = [
  ['',             'Tutti',        () => true],
  ['CORSO',        'Corsi',        r => r.tipo === 'CORSO'],
  ['ABILITAZIONE', 'Abilitazioni', r => r.tipo === 'ABILITAZIONE'],
  ['INTERNO',      'Interni',      r => r.origine === 'INTERNO'],
  ['ESTERNO',      'Esterni',      r => r.origine === 'ESTERNO'],
  ['SCADENZA',     'Scaduti o in scadenza', r => fzStatoRiga(r) === 'scaduto' || fzStatoRiga(r) === 'scadenza'],
  ['SENZA',        'Senza attestato', r => !r.origine && !r.drive_file_id],
];

let fzRighe = [];
let fzVolontari = [];
let fzFiltro = '';
let fzGruppi = [];
let fzAperti = new Set(); // corsi aperti, restano tali tra un salvataggio e l'altro
let fzForm = null;   // { id, volFisso, scelti }

function fzPuoScrivere() { return canModificaVolontari() || hasPerm('formazione'); }
function fzNomeVol(id) { const v = fzVolontari.find(x => x.id === id); return v ? v.cognome + ' ' + v.nome : '—'; }

async function fzCaricaVolontari() {
  const res = await sbFetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome,squadra,stato,tipo_volontario,esonero_12_ore,esonero_caposq&order=cognome,nome', { headers: H });
  if (!res.ok) throw new Error('errore');
  fzVolontari = await res.json();
}

async function caricaFormazione() {
  const list = document.getElementById('fzList');
  if (!list) return;
  document.getElementById('fzBtnNuovo').hidden = !fzPuoScrivere();
  document.getElementById('fzBtnDrive').hidden = !fzPuoScrivere();
  list.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const [res] = await Promise.all([
      sbFetch(SUPA_URL + '/rest/v1/formazione_registro?select=*&order=data_corso.desc.nullslast,id.desc', { headers: H }),
      fzCaricaVolontari(),
      fzCaricaCatalogo(),
    ]);
    document.getElementById('fzBtnCatalogo').hidden = !fzCatalogo.length;
    if (!res.ok) throw new Error('errore');
    fzRighe = await res.json();
    fzCalcolaAttuali();
    fzRenderDash();
    fzRenderChip();
    fzRenderLista();
  } catch(e) {
    list.innerHTML = '<div class="loading-msg bad">Registro non disponibile. Se è la prima apertura, va eseguito supabase/formazione_registro.sql.</div>';
  }
}

function fzRenderChip() {
  document.getElementById('fzChips').innerHTML = FZ_FILTRI.map(f => '<button class="chip' + (fzFiltro === f[0] ? ' on' : '') + '" onclick="fzImpostaFiltro(\'' + f[0] + '\')">'
    + f[1] + ' <span class="n">' + fzRighe.filter(f[2]).length + '</span></button>').join('');
}
function fzImpostaFiltro(k) { fzFiltro = fzFiltro === k ? '' : k; fzRenderChip(); fzRenderLista(); }

// Import dall'archivio Google Drive (Edge Function archivio-volontario, azione importa):
// completa data e scadenza dei corsi fissi e aggiunge le abilitazioni. Si può rilanciare.
async function fzImportaDrive() {
  if (!confirm('Leggo gli attestati di tutti i volontari su Google Drive e porto nel registro data e scadenza dei corsi 4 ore, 12 ore, Caposquadra e DAE, più le abilitazioni.\n\nI file già importati vengono saltati. Procedo?')) return;
  const btn = document.getElementById('fzBtnDrive');
  btn.disabled = true;
  btn.textContent = 'Importazione…';
  try {
    const res = await sbFetch(SUPA_URL + '/functions/v1/archivio-volontario?azione=importa', { method: 'POST', headers: {}, silenzioso: true });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error(d.error || arcErrore(res.status));
    alert('Import completato.\n\nRighe completate con data e scadenza: ' + d.completate + '\nRighe aggiunte: ' + d.aggiunte
      + (d.saltati ? '\nDoppioni saltati: ' + d.saltati : '')
      + (d.errori ? '\nVolontari non letti (riprova più tardi): ' + d.errori : ''));
    arcCache = {};
    await caricaFormazione();
  } catch(e) {
    alert('Import non riuscito: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Importa da Drive';
  }
}

function fzPillOrigine(r) {
  if (!r.origine && r.drive_file_id) return '<span class="pill p-grey">Da Drive</span>';
  if (!r.origine) return '<span class="pill p-sand" title="Segnato nella vecchia scheda, attestato non trovato su Drive">Senza attestato</span>';
  return r.origine === 'INTERNO' ? '<span class="pill p-blue">Interno</span>' : '<span class="pill p-sand">Esterno</span>';
}
// -- DASHBOARD CORSI OBBLIGATORI --
// Volontari attivi e sospesi: 4 ore e 12 ore per tutti, Caposquadra solo per tipo_volontario "CAPO SQUADRA".
// Per ogni volontario conta l'ultima riga del registro (fzOrdineData): mai fatto > scaduto > in scadenza > senza attestato.
const FZ_DASH = [
  { codice: '4_ORE',  titolo: 'Corso 4 ore',       perChi: () => true },
  { codice: '12_ORE', titolo: 'Corso 12 ore',      perChi: () => true, esonero: 'esonero_12_ore' },
  { codice: 'CAPOSQ', titolo: 'Corso Caposquadra', perChi: v => String(v.tipo_volontario || '').toUpperCase().replace(/\s+/g, '') === 'CAPOSQUADRA', nota: 'solo capisquadra', esonero: 'esonero_caposq' },
];
const FZ_DASH_CAT = [['mai', 'Mai fatto'], ['scaduto', 'Scaduto'], ['scadenza', 'In scadenza'], ['senza', 'Senza attestato'], ['esonero', 'Esonerati']];
let fzDashSel = null;   // 'CODICE|categoria' dell'elenco aperto

function fzDashUltima(volId, codice) {
  const righe = fzRighe.filter(r => r.volontario_id === volId && r.codice === codice);
  return righe.length ? { righe, ultima: righe.reduce((m, r) => fzOrdineData(r) > fzOrdineData(m) ? r : m) } : null;
}
function fzDashStato(volId, codice) {
  const u = fzDashUltima(volId, codice);
  if (!u) return 'mai';
  const st = arcScadenza(u.ultima.scadenza);
  if (st) return st;
  return u.righe.some(r => r.drive_file_id) ? 'ok' : 'senza';
}
function fzDashCalcola() {
  const vol = fzVolontari.filter(v => ['ATTIVO', 'SOSPESO'].includes(v.stato || 'ATTIVO'));
  return FZ_DASH.map(c => {
    const per = { mai: [], scaduto: [], scadenza: [], senza: [], esonero: [], ok: [] };
    const tocca = vol.filter(c.perChi);
    tocca.forEach(v => {
      const st = fzDashStato(v.id, c.codice);
      // esonerato: non conta tra mancanti e scaduti (se il corso è valido resta "in regola")
      per[c.esonero && v[c.esonero] && st !== 'ok' ? 'esonero' : st].push(v);
    });
    return Object.assign({}, c, { tot: tocca.length - per.esonero.length, per });
  });
}
function fzDashScegli(codice, cat) {
  const k = codice ? codice + '|' + cat : null;
  fzDashSel = fzDashSel === k ? null : k;
  fzRenderDash();
}
function fzRenderDash() {
  const box = document.getElementById('fzDash');
  if (!box) return;
  const d = fzDashCalcola();
  let html = '<div class="fz-dash">' + d.map(c => '<div class="card fz-dash-c"><div class="fz-dash-h"><b>' + c.titolo + '</b>'
    + '<span class="sub">' + c.per.ok.length + ' in regola su ' + c.tot + (c.nota ? ' · ' + c.nota : '') + '</span></div><div class="chips">'
    + FZ_DASH_CAT.filter(([k]) => k !== 'esonero' || c.esonero).map(([k, lab]) => {
        const n = c.per[k].length;
        return '<button class="chip' + (fzDashSel === c.codice + '|' + k ? ' on' : '') + '"' + (n ? '' : ' disabled')
          + ' onclick="fzDashScegli(\'' + c.codice + '\',\'' + k + '\')">' + lab + ' <span class="n">' + n + '</span></button>';
      }).join('') + '</div></div>').join('') + '</div>';
  if (fzDashSel) {
    const [cod, k] = fzDashSel.split('|');
    const c = d.find(x => x.codice === cod);
    const lab = FZ_DASH_CAT.find(x => x[0] === k)[1];
    const elenco = c.per[k];
    const det = v => {
      const u = fzDashUltima(v.id, cod);
      if (k === 'scaduto' && u) return 'scaduto il ' + svData(u.ultima.scadenza);
      if (k === 'scadenza' && u) return 'scade il ' + svData(u.ultima.scadenza);
      return '';
    };
    html += '<div class="card fz-dash-l"><div class="fz-dash-h"><b>' + c.titolo + ' · ' + lab + ' (' + elenco.length + ')</b>'
      + '<span><button class="btn sm" onclick="fzDashCopia()">Copia nomi</button> <button class="btn sm" onclick="fzDashScegli()">Chiudi</button></span></div>'
      + elenco.map(v => '<div class="lr clk" onclick="apriDettaglio(' + v.id + ',\'formazione\')"><div class="mid"><b>' + aggEsc(v.cognome + ' ' + v.nome) + '</b>'
        + '<span class="sub">' + aggEsc([v.squadra, v.stato === 'SOSPESO' ? 'sospeso' : '', det(v)].filter(Boolean).join(' · ')) + '</span></div>'
        + (c.esonero && canModificaVolontari() && c.esonero in v
          ? '<button class="btn sm" onclick="event.stopPropagation();fzEsonera(' + v.id + ',\'' + c.esonero + '\',' + (k !== 'esonero') + ')">' + (k === 'esonero' ? 'Togli esonero' : 'Esonera') + '</button>' : '')
        + '</div>').join('')
      + '</div>';
  }
  box.innerHTML = html;
}
// Esonero dal corso (colonne esonero_12_ore / esonero_caposq di volontari, supabase/formazione_esoneri.sql)
async function fzEsonera(volId, campo, si) {
  const v = fzVolontari.find(x => x.id === volId);
  const corso = campo === 'esonero_caposq' ? ' dal corso Caposquadra' : ' dal corso 12 ore';
  if (!v || !confirm((si ? 'Esonerare ' : 'Togliere l\'esonero a ') + v.cognome + ' ' + v.nome + corso + '?')) return;
  const res = await sbFetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + volId, {
    method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ [campo]: si }),
  });
  if (!res.ok) { alert('Modifica non salvata: serve il permesso di modifica dei volontari.'); return; }
  v[campo] = si;
  logAttivita((si ? 'ha esonerato ' : 'ha tolto l\'esonero a ') + v.cognome + ' ' + v.nome + corso);
  fzRenderDash();
}

// Nomi dell'elenco aperto negli appunti, uno per riga (per convocazioni e iscrizioni ai corsi)
function fzDashCopia() {
  if (!fzDashSel) return;
  const [cod, k] = fzDashSel.split('|');
  const c = fzDashCalcola().find(x => x.codice === cod);
  const testo = c.per[k].map(v => v.cognome + ' ' + v.nome).join('\n');
  if (navigator.clipboard) navigator.clipboard.writeText(testo).then(() => alert('Copiati ' + c.per[k].length + ' nomi.'), () => prompt('Copia i nomi:', testo));
  else prompt('Copia i nomi:', testo);
}

// -- SCADENZE --
// Per ogni volontario e corso conta solo l'attestato più recente (data del corso, poi scadenza):
// quelli precedenti sono "Rinnovato" e non risultano scaduti. Avviso giallo entro 60 giorni (arcScadenza).
let fzAttuali = new Set();   // id delle righe più recenti per volontario e voce

function fzChiaveVoce(r) { return r.catalogo_id ? 'c' + r.catalogo_id : (r.codice || r.titolo.trim().toLowerCase()); }
function fzOrdineData(r) { return (r.data_corso || '') + '|' + (r.scadenza || ''); }
function fzCalcolaAttuali() {
  const ultima = new Map();
  fzRighe.forEach(r => {
    const k = fzChiaveVoce(r) + '|' + r.volontario_id;
    const m = ultima.get(k);
    if (!m || fzOrdineData(r) > fzOrdineData(m)) ultima.set(k, r);
  });
  fzAttuali = new Set([...ultima.values()].map(r => r.id));
}
// 'rinnovato' | 'scaduto' | 'scadenza' | ''
function fzStatoRiga(r) {
  if (!r.scadenza) return '';
  if (fzAttuali.size && !fzAttuali.has(r.id)) return 'rinnovato';
  return arcScadenza(r.scadenza);
}
// Stato della riga più recente: Valido (fino al…), In scadenza, Scaduto; senza scadenza = Valido
function fzCellaScadenza(r) {
  if (!r.scadenza) return '<span class="pill p-blue">Valido</span>';
  const st = fzStatoRiga(r);
  if (st === 'scaduto') return '<span class="fz-scad"><span class="pill p-red">Scaduto</span><span class="sub">' + svData(r.scadenza) + '</span></span>';
  if (st === 'scadenza') return '<span class="fz-scad"><span class="pill p-yellow">In scadenza</span><span class="sub">' + svData(r.scadenza) + '</span></span>';
  if (st === 'rinnovato') return '<span class="pill p-grey" title="Scadenza ' + svData(r.scadenza) + '">Rinnovato</span>';
  return '<span class="fz-scad"><span class="pill p-blue">Valido</span><span class="sub">fino al ' + svData(r.scadenza) + '</span></span>';
}
function fzDettaglio(r) {
  return [r.tipo === 'ABILITAZIONE' ? 'Abilitazione' : '', r.ore ? r.ore + ' h' : ''].filter(Boolean).map(aggEsc).join(' · ');
}

// -- CATALOGO (formazione_catalogo, supabase/formazione_catalogo.sql) --
// Una voce per corso o abilitazione: le righe del registro si collegano con catalogo_id
// (lo assegna il database dalle parole chiave); qui si raggruppa per voce.
let fzCatalogo = [];

async function fzCaricaCatalogo() {
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_catalogo?select=*&order=ordine,titolo', { headers: H });
    fzCatalogo = res.ok ? await res.json() : [];
  } catch(e) { fzCatalogo = []; }
}
function fzVoce(id) { return id ? fzCatalogo.find(c => c.id === id) || null : null; }
function fzVociAttive() { return fzCatalogo.filter(c => c.attivo); }

// Un blocco per voce di catalogo (righe senza voce: per codice o titolo). Si apre sui partecipanti.
function fzRaggruppa(righe) {
  const gruppi = new Map();
  righe.forEach(r => {
    const v = fzVoce(r.catalogo_id);
    const k = v ? 'c' + v.id : (r.codice || r.titolo.trim().toLowerCase());
    if (!gruppi.has(k)) gruppi.set(k, v
      ? { k, titolo: v.titolo, tipo: v.tipo, codice: v.codice, catalogo_id: v.id, validita: v.validita_anni, ordine: v.ordine, righe: [] }
      : { k, titolo: r.titolo, tipo: r.tipo, codice: r.codice, catalogo_id: null, validita: null, ordine: 500, righe: [] });
    gruppi.get(k).righe.push(r);
  });
  return [...gruppi.values()].sort((a, b) => a.ordine - b.ordine || a.titolo.localeCompare(b.titolo, 'it'));
}

function fzGruppoHtml(g, i, aperto, scrive) {
  const date = g.righe.map(r => r.data_corso).filter(Boolean).sort();
  const scaduti = g.righe.filter(r => fzStatoRiga(r) === 'scaduto').length;
  const inScadenza = g.righe.filter(r => fzStatoRiga(r) === 'scadenza').length;
  const persone = new Set(g.righe.map(r => r.volontario_id)).size;
  const info = [g.tipo === 'ABILITAZIONE' ? 'Abilitazione' : 'Corso', persone + (persone === 1 ? ' volontario' : ' volontari'),
    g.validita ? 'vale ' + g.validita + (g.validita === 1 ? ' anno' : ' anni') : '',
    date.length ? 'ultimo il ' + svData(date[date.length - 1]) : ''].filter(Boolean).join(' · ');
  // una riga per volontario: l'attestato più recente; le date precedenti sotto, in piccolo
  const perVol = new Map();
  g.righe.forEach(r => { if (!perVol.has(r.volontario_id)) perVol.set(r.volontario_id, []); perVol.get(r.volontario_id).push(r); });
  const righe = [...perVol.values()].map(l => {
    l.sort((a, b) => fzOrdineData(b).localeCompare(fzOrdineData(a)));
    const r = l[0];
    const precedenti = [...new Set(l.slice(1).map(x => x.data_corso).filter(d => d && d !== r.data_corso))].map(svData);
    // attestato: quello della riga più recente, altrimenti il più recente che ha un file
    const conFile = l.find(x => x.drive_file_id);
    return { r, precedenti, file: conFile ? conFile.drive_file_id : null };
  }).sort((a, b) => (b.r.data_corso || '').localeCompare(a.r.data_corso || '') || fzNomeVol(a.r.volontario_id).localeCompare(fzNomeVol(b.r.volontario_id), 'it'));
  return '<div class="card fz-gruppo"><div class="fz-gruppo-h"><button class="fz-gruppo-t" aria-expanded="' + aperto + '" onclick="fzApriGruppo(' + i + ')">'
    + '<span class="pst-chev" aria-hidden="true">' + (aperto ? '▾' : '▸') + '</span><span class="mid"><b>' + aggEsc(g.titolo) + '</b><span class="sub">' + info + '</span></span>'
    + (scaduti ? '<span class="pill p-red">' + scaduti + (scaduti === 1 ? ' scaduto' : ' scaduti') + '</span>' : '')
    + (inScadenza ? '<span class="pill p-yellow">' + inScadenza + ' in scadenza</span>' : '') + '</button>'
    + (scrive && g.catalogo_id ? '<button class="btn sm" onclick="fzApriVoce(' + g.catalogo_id + ')">Modifica</button>' : '')
    + (scrive ? '<button class="btn sm" onclick="fzApriForm(null,null,' + i + ')">Aggiungi</button>' : '') + '</div>'
    + (aperto ? '<div class="fz-gruppo-b"><div class="fz-row ihead"><span>Data</span><span>Volontario</span><span>Date precedenti</span><span>Attestato</span><span>Stato</span></div>'
      + righe.map(({ r, precedenti, file }) => '<div class="fz-row' + (scrive ? ' clk" onclick="fzApriForm(' + r.id + ')' : '') + '">'
        + '<span>' + (svData(r.data_corso) || '—') + '</span>'
        + '<b>' + aggEsc(fzNomeVol(r.volontario_id)) + '</b>'
        + '<span class="sub minw0">' + (precedenti.length ? precedenti.join(', ') : '—') + '</span>'
        + '<span>' + (file ? '<button class="btn sm" onclick="event.stopPropagation();arcApri(' + r.volontario_id + ',\'' + aggEsc(file) + '\')">Attestato</button>' : '—') + '</span>'
        + '<span>' + fzCellaScadenza(r) + '</span></div>').join('') + '</div>' : '') + '</div>';
}

function fzRenderLista() {
  const list = document.getElementById('fzList');
  const q = document.getElementById('fzSearch').value.toLowerCase().trim();
  const filtro = FZ_FILTRI.find(f => f[0] === fzFiltro)[2];
  const righe = fzRighe.filter(r => filtro(r) && (!q || (fzNomeVol(r.volontario_id) + ' ' + r.titolo + ' ' + ((fzVoce(r.catalogo_id) || {}).titolo || '')).toLowerCase().includes(q)));
  fzGruppi = fzRaggruppa(righe);
  document.getElementById('fzMostrati').textContent = fzGruppi.length + (fzGruppi.length === 1 ? ' corso' : ' corsi') + ' · ' + righe.length + (righe.length === 1 ? ' registrazione' : ' registrazioni');
  if (!righe.length) { list.innerHTML = '<div class="empty">' + (fzRighe.length ? 'Nessuna registrazione trovata.' : 'Nessun corso registrato.') + '</div>'; return; }
  const scrive = fzPuoScrivere();
  // cercando, i corsi trovati si aprono da soli: altrimenti il nome cercato resterebbe nascosto
  list.innerHTML = fzGruppi.map((g, i) => fzGruppoHtml(g, i, !!q || fzAperti.has(g.k), scrive)).join('');
}

function fzApriGruppo(i) {
  const k = fzGruppi[i].k;
  if (fzAperti.has(k)) fzAperti.delete(k); else fzAperti.add(k);
  fzRenderLista();
}

// -- FINESTRA REGISTRA / MODIFICA --
// Valori: 'c:<id>' voce di catalogo, 'k:<codice>' corso fisso (senza catalogo), '' nuova voce / titolo libero
function fzCatalogoHtml(sel) {
  const opz = (val, lab) => '<option value="' + val + '"' + (sel === val ? ' selected' : '') + '>' + aggEsc(lab) + '</option>';
  if (!fzCatalogo.length) return Object.keys(FZ_CORSI_FISSI).map(k => opz('k:' + k, FZ_CORSI_FISSI[k].titolo)).join('') + opz('', 'Altro corso o abilitazione');
  const voci = fzVociAttive().filter(c => c.codice !== 'DA_VERIFICARE' || sel === 'c:' + c.id);
  return ['CORSO', 'ABILITAZIONE'].map(t => '<optgroup label="' + (t === 'CORSO' ? 'Corsi' : 'Abilitazioni') + '">'
    + voci.filter(c => c.tipo === t).map(c => opz('c:' + c.id, c.titolo)).join('') + '</optgroup>').join('')
    + opz('', fzCatalogo.length ? 'Nuova voce di catalogo…' : 'Altro corso o abilitazione');
}
function fzSelDa(base) {
  if (!base) return fzCatalogo.length ? 'c:' + ((fzVociAttive()[0] || {}).id || '') : 'k:4_ORE';
  if (base.catalogo_id && fzVoce(base.catalogo_id)) return 'c:' + base.catalogo_id;
  if (base.codice) { const v = fzCatalogo.find(c => c.codice === base.codice); return v ? 'c:' + v.id : 'k:' + base.codice; }
  return '';
}

// id: riga da modificare; volFisso: volontario già scelto (dalla scheda volontario);
// gruppo: indice in fzGruppi del corso da precompilare
async function fzApriForm(id, volFisso, gruppo) {
  const ov = document.getElementById('fzOv');
  const r = id ? fzRighe.find(x => x.id === id) : null;
  if (id && !r) return;
  const g = gruppo != null ? fzGruppi[gruppo] : null;
  const base = r || g;
  if (!fzVolontari.length) { try { await fzCaricaVolontari(); } catch(e) {} }
  if (!fzCatalogo.length) await fzCaricaCatalogo();
  fzForm = { id: id || null, volFisso: r ? r.volontario_id : (volFisso || null), scelti: new Set() };
  const titoli = [...new Set(fzRighe.filter(x => !x.codice).map(x => x.titolo))];
  const sel = fzSelDa(base);
  const opz = (val, lab, cor) => '<option value="' + val + '"' + (cor === val ? ' selected' : '') + '>' + lab + '</option>';
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Registro formazione"><div class="shead"><h2>' + (id ? 'Modifica registrazione' : 'Registra corso') + '</h2>'
    + '<button class="x" onclick="fzChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="fzErr"></div>'
    + (fzForm.volFisso ? '<div class="kv"><span>Volontario</span><b>' + aggEsc(fzNomeVol(fzForm.volFisso)) + '</b></div>'
      : '<label>Volontari<input type="search" id="fzVolCerca" placeholder="Cerca per cognome o squadra" autocomplete="off" oninput="fzRenderPicker()"></label>'
        + '<div class="fz-picker" id="fzPicker"></div><span class="sub" id="fzSceltiN"></span>')
    + '<label>Corso o abilitazione<select id="fzCodice" onchange="fzAggiornaCatalogo()">' + fzCatalogoHtml(sel) + '</select></label>'
    + '<div id="fzLibero"><div class="row2"><label>' + (fzCatalogo.length ? 'Nome della nuova voce' : 'Titolo') + '<input id="fzTitolo" list="fzTitoli" value="' + aggEsc(base && !sel ? base.titolo : '') + '"><datalist id="fzTitoli">' + titoli.map(t => '<option value="' + aggEsc(t) + '">').join('') + '</datalist></label>'
    + '<label>Tipo<select id="fzTipo">' + opz('CORSO', 'Corso', base ? base.tipo : 'CORSO') + opz('ABILITAZIONE', 'Abilitazione', base ? base.tipo : '') + '</select></label></div></div>'
    + '<div class="row2"><label>Origine<select id="fzOrigine">' + opz('INTERNO', 'Interno (nostro)', r ? r.origine : 'INTERNO') + opz('ESTERNO', 'Esterno', r ? r.origine : '') + '</select></label>'
    + '<label>Ore<input type="number" id="fzOre" min="0" step="0.5" value="' + aggEsc(r && r.ore != null ? r.ore : '') + '"></label></div>'
    + '<div class="row2"><label>Data<input type="date" id="fzData" value="' + aggEsc(r ? r.data_corso || '' : '') + '"></label>'
    + '<label>Scadenza' + (fzCatalogo.length ? ' (vuota: calcolata dalla validità)' : ' (se prevista)') + '<input type="date" id="fzScadenza" value="' + aggEsc(r ? r.scadenza || '' : '') + '"></label></div>'
    + '<label>Note<textarea id="fzNote" rows="2">' + aggEsc(r ? r.note || '' : '') + '</textarea></label>'
    + '<div class="actions">' + (id ? '<button class="btn danger" onclick="fzElimina()">Elimina</button>' : '')
    + '<button class="btn" onclick="fzChiudiForm()">Annulla</button><button class="btn pri" id="fzSalvaBtn" onclick="fzSalva()">Salva</button></div></div></div>';
  ov.hidden = false;
  fzAggiornaCatalogo();
  if (!fzForm.volFisso) fzRenderPicker();
}

function fzChiudiForm() {
  const ov = document.getElementById('fzOv');
  ov.hidden = true; ov.innerHTML = ''; fzForm = null;
}
function fzAggiornaCatalogo() { document.getElementById('fzLibero').hidden = !!document.getElementById('fzCodice').value; }

function fzRenderPicker() {
  const q = document.getElementById('fzVolCerca').value.toLowerCase().trim();
  const vol = fzVolontari.filter(v => v.stato !== 'DIMESSO' && (!q || (v.cognome + ' ' + v.nome + ' ' + (v.squadra || '')).toLowerCase().includes(q)));
  document.getElementById('fzPicker').innerHTML = vol.map(v => '<label class="chk"><input type="checkbox"' + (fzForm.scelti.has(v.id) ? ' checked' : '') + ' onchange="fzScegli(' + v.id + ',this.checked)"> '
    + aggEsc(v.cognome + ' ' + v.nome) + '<span class="sub inl">' + aggEsc(v.squadra || '') + '</span></label>').join('') || '<p class="note m0">Nessun volontario trovato.</p>';
  fzContaScelti();
}
function fzScegli(id, si) { if (si) fzForm.scelti.add(id); else fzForm.scelti.delete(id); fzContaScelti(); }
function fzContaScelti() { document.getElementById('fzSceltiN').textContent = fzForm.scelti.size + ' selezionati'; }

function fzErrore(msg) { const e = document.getElementById('fzErr'); e.textContent = msg; e.style.display = 'block'; e.scrollIntoView({ block: 'nearest' }); }

async function fzSalva() {
  const val = id => document.getElementById(id).value.trim() || null;
  const sel = val('fzCodice') || '';
  const vol = fzForm.volFisso ? [fzForm.volFisso] : [...fzForm.scelti];
  const prima = fzForm.id ? fzRighe.find(x => x.id === fzForm.id) : null;
  let voce = sel.startsWith('c:') ? fzVoce(Number(sel.slice(2))) : null;
  let codice = sel.startsWith('k:') ? sel.slice(2) : (voce && FZ_CORSI_FISSI[voce.codice] ? voce.codice : null);
  // con una voce scelta il titolo è quello della voce; modificando senza cambiarla resta il titolo originale
  let titolo = voce ? (prima && prima.catalogo_id === voce.id ? prima.titolo : voce.titolo) : codice ? FZ_CORSI_FISSI[codice].titolo : val('fzTitolo');
  const tipo = voce ? voce.tipo : codice ? 'CORSO' : val('fzTipo');
  const dati = {
    codice, titolo, tipo, origine: val('fzOrigine'),
    data_corso: val('fzData'), scadenza: val('fzScadenza'), ore: val('fzOre'), note: val('fzNote'),
  };
  if (!vol.length) return fzErrore('Scegli almeno un volontario.');
  if (!titolo) return fzErrore('Indica il ' + (fzCatalogo.length ? 'nome della nuova voce.' : 'titolo del corso.'));
  if (!dati.data_corso) return fzErrore('Indica la data.');
  if (dati.scadenza && dati.scadenza < dati.data_corso) return fzErrore('La scadenza non può essere prima della data.');
  const btn = document.getElementById('fzSalvaBtn');
  btn.disabled = true;
  if (fzCatalogo.length) {
    // nuova voce: se ne esiste già una con lo stesso nome si usa quella
    if (!voce && !codice) {
      voce = fzVociAttive().find(c => c.tipo === tipo && c.titolo.trim().toLowerCase() === titolo.trim().toLowerCase()) || null;
      if (!voce) {
        try { voce = await fzSalvaVoce(null, { tipo, titolo }); }
        catch(e) { btn.disabled = false; return fzErrore('Nuova voce non creata: ' + e.message); }
      }
    }
    dati.catalogo_id = voce ? voce.id : null;   // scadenza vuota: la calcola il database dalla validità della voce
  }
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro' + (prima ? '?id=eq.' + prima.id : ''), {
      method: prima ? 'PATCH' : 'POST', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify(prima ? dati : vol.map(id => Object.assign({ volontario_id: id }, dati))),
    });
    if (!res.ok) throw new Error('errore');
  } catch(e) {
    btn.disabled = false;
    return fzErrore('Registrazione non salvata: riprova.');
  }
  logAttivita('ha registrato ' + titolo + ' per ' + vol.length + ' volontari');
  await fzDopoModifica(vol, [codice, prima && prima.codice]);
}

// -- GESTIONE CATALOGO (permesso formazione o modifica_volontari, ricontrollato dalle regole del database) --
// Le voci non si cancellano: si disattivano o si uniscono in un'altra (le righe passano alla voce di arrivo).
// Le voci fisse (corsi della scheda volontario e "Da verificare") si possono solo rinominare.
const FZ_VOCI_BLOCCATE = ['4_ORE', '12_ORE', 'CAPOSQ', 'DAE', 'DA_VERIFICARE'];

async function fzSalvaVoce(id, dati) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_catalogo' + (id ? '?id=eq.' + id : ''), {
    method: id ? 'PATCH' : 'POST', silenzioso: true,
    headers: Object.assign({}, HJ, { 'Prefer': 'return=representation' }), body: JSON.stringify(dati),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(d) || !d.length) throw new Error(res.status === 409 ? 'esiste già una voce con questo codice.' : 'operazione non consentita o non riuscita.');
  const v = d[0];
  const i = fzCatalogo.findIndex(c => c.id === v.id);
  if (i >= 0) fzCatalogo[i] = v; else fzCatalogo.push(v);
  return v;
}

function fzContaVoce(id) { return fzRighe.filter(r => r.catalogo_id === id).length; }

function fzApriCatalogo() {
  const ov = document.getElementById('fzOv');
  const scrive = fzPuoScrivere();
  const riga = c => '<div class="lr' + (scrive ? ' clk" onclick="fzApriVoce(' + c.id + ')' : '') + '"><div class="mid"><b>' + aggEsc(c.titolo) + '</b>'
    + '<span class="sub">' + aggEsc([fzContaVoce(c.id) + ' registrazioni', c.validita_anni ? 'vale ' + c.validita_anni + ' anni' : 'senza scadenza',
      (c.parole_chiave || []).length ? 'parole: ' + c.parole_chiave.join(', ') : ''].filter(Boolean).join(' · ')) + '</span></div>'
    + (c.attivo ? '' : '<span class="pill p-grey">' + (c.unita_in ? 'Unita in ' + aggEsc((fzVoce(c.unita_in) || {}).titolo || '') : 'Disattivata') + '</span>') + '</div>';
  const blocco = (t, lab) => {
    const voci = fzCatalogo.filter(c => c.tipo === t).sort((a, b) => (b.attivo - a.attivo) || a.ordine - b.ordine || a.titolo.localeCompare(b.titolo, 'it'));
    return '<div class="grp">' + lab + '</div>' + (voci.map(riga).join('') || '<p class="note m0 mb10">Nessuna voce.</p>');
  };
  const daVer = fzCatalogo.find(c => c.codice === 'DA_VERIFICARE');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Catalogo corsi"><div class="shead"><h2>Catalogo corsi e abilitazioni</h2>'
    + '<button class="x" onclick="fzChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<p class="note m0 mb10">Ogni registrazione è collegata a una voce. Le parole chiave servono a riconoscere i titoli (anche dei file su Drive): basta l\'inizio di una parola, senza maiuscole né accenti.</p>'
    + '<div class="form-err" id="fzErr"></div>'
    + blocco('CORSO', 'Corsi') + blocco('ABILITAZIONE', 'Abilitazioni')
    + (scrive ? '<div class="actions">' + (daVer ? '<button class="btn" onclick="fzRiapplica()">Riapplica parole chiave a "Da verificare" (' + fzContaVoce(daVer.id) + ')</button>' : '')
      + '<button class="btn pri" onclick="fzApriVoce(null)">Nuova voce</button></div>' : '')
    + '</div></div>';
  ov.hidden = false;
}

function fzApriVoce(id) {
  const c = id ? fzVoce(id) : null;
  if (id && !c) return;
  const bloccata = c && FZ_VOCI_BLOCCATE.includes(c.codice);
  const opz = (val, lab, cor) => '<option value="' + val + '"' + (String(cor) === String(val) ? ' selected' : '') + '>' + aggEsc(lab) + '</option>';
  const altre = c ? fzVociAttive().filter(x => x.id !== c.id && x.tipo === c.tipo) : [];
  const ov = document.getElementById('fzOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Voce di catalogo"><div class="shead"><h2>' + (c ? 'Modifica voce' : 'Nuova voce') + '</h2>'
    + '<button class="x" onclick="fzApriCatalogo()" aria-label="Indietro">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="fzErr"></div>'
    + '<label>Nome<input id="fzVTitolo" value="' + aggEsc(c ? c.titolo : '') + '"></label>'
    + '<div class="row2"><label>Tipo<select id="fzVTipo"' + (bloccata ? ' disabled' : '') + '>' + opz('CORSO', 'Corso', c ? c.tipo : 'CORSO') + opz('ABILITAZIONE', 'Abilitazione', c ? c.tipo : '') + '</select></label>'
    + '<label>Validità in anni (vuoto = non scade)<input type="number" id="fzVAnni" min="1" max="50" value="' + aggEsc(c && c.validita_anni ? c.validita_anni : '') + '"></label></div>'
    + '<label>Parole chiave (separate da virgola)<input id="fzVParole" value="' + aggEsc(c ? (c.parole_chiave || []).join(', ') : '') + '" placeholder="es. gru per autocarro, gru su autocarro"></label>'
    + '<div class="row2"><label>Ordine (più basso = controllata prima)<input type="number" id="fzVOrdine" value="' + aggEsc(c ? c.ordine : 100) + '"></label>'
    + (c && !bloccata ? '<label class="chk"><input type="checkbox" id="fzVAttivo"' + (c.attivo ? ' checked' : '') + '> Attiva</label>' : '<span></span>') + '</div>'
    + (c && !bloccata && c.attivo && altre.length ? '<div class="grp sv-mt">Unisci in un\'altra voce</div><p class="note m0 mb10">Le ' + fzContaVoce(c.id) + ' registrazioni passano alla voce scelta e questa viene disattivata.</p>'
      + '<div class="row2"><select id="fzVUnisci"><option value="">Scegli la voce…</option>' + altre.map(x => opz(x.id, x.titolo, '')).join('') + '</select>'
      + '<button class="btn" onclick="fzUnisciVoce(' + c.id + ')">Unisci</button></div>' : '')
    + '<div class="actions"><button class="btn" onclick="fzApriCatalogo()">Indietro</button><button class="btn pri" id="fzSalvaBtn" onclick="fzSalvaVoceForm(' + (c ? c.id : 'null') + ')">Salva</button></div>'
    + '</div></div>';
  ov.hidden = false;
}

async function fzSalvaVoceForm(id) {
  const c = id ? fzVoce(id) : null;
  const bloccata = c && FZ_VOCI_BLOCCATE.includes(c.codice);
  const el = x => document.getElementById(x);
  const anni = el('fzVAnni').value ? Number(el('fzVAnni').value) : null;
  const dati = {
    validita_anni: anni,
    parole_chiave: el('fzVParole').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    ordine: Number(el('fzVOrdine').value) || 100,
  };
  dati.titolo = el('fzVTitolo').value.trim();
  if (!bloccata) dati.tipo = el('fzVTipo').value;
  const tipo = dati.tipo || c.tipo;
  if (c && !bloccata && el('fzVAttivo')) dati.attivo = el('fzVAttivo').checked;
  if (!dati.titolo) return fzErrore('Indica il nome della voce.');
  if (anni !== null && (!Number.isInteger(anni) || anni < 1 || anni > 50)) return fzErrore('La validità va da 1 a 50 anni.');
  if (fzVociAttive().some(x => x.id !== id && x.tipo === tipo && x.titolo.trim().toLowerCase() === dati.titolo.toLowerCase()))
    return fzErrore('Esiste già una voce con questo nome: usa "Unisci".');
  el('fzSalvaBtn').disabled = true;
  try { await fzSalvaVoce(id, dati); }
  catch(e) { el('fzSalvaBtn').disabled = false; return fzErrore('Voce non salvata: ' + e.message); }
  logAttivita((id ? 'ha modificato' : 'ha creato') + ' la voce di catalogo formazione ' + dati.titolo);
  fzRenderLista();
  fzApriCatalogo();
}

async function fzUnisciVoce(id) {
  const c = fzVoce(id);
  const dest = fzVoce(Number(document.getElementById('fzVUnisci').value));
  if (!c || !dest) return fzErrore('Scegli la voce in cui unire.');
  if (!confirm('Unire "' + c.titolo + '" in "' + dest.titolo + '"?\n\nLe ' + fzContaVoce(c.id) + ' registrazioni passano a "' + dest.titolo + '" (il titolo originale resta). "' + c.titolo + '" viene disattivata.')) return;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro?catalogo_id=eq.' + c.id, {
      method: 'PATCH', silenzioso: true, headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ catalogo_id: dest.id }),
    });
    if (!res.ok) throw new Error('registrazioni non spostate.');
    await fzSalvaVoce(c.id, { attivo: false, unita_in: dest.id });
  } catch(e) { return fzErrore('Unione non riuscita: ' + e.message); }
  logAttivita('ha unito la voce di catalogo formazione ' + c.titolo + ' in ' + dest.titolo);
  await caricaFormazione();
  fzApriCatalogo();
}

// Le righe in "Da verificare" (o senza voce) ripassano dalle parole chiave: quelle riconosciute cambiano voce
async function fzRiapplica() {
  const daVer = fzCatalogo.find(c => c.codice === 'DA_VERIFICARE');
  if (!daVer) return;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro?or=(catalogo_id.is.null,catalogo_id.eq.' + daVer.id + ')', {
      method: 'PATCH', silenzioso: true, headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ catalogo_id: null }),
    });
    if (!res.ok) throw new Error('errore');
  } catch(e) { return fzErrore('Operazione non riuscita: riprova.'); }
  const prima = fzContaVoce(daVer.id);
  await caricaFormazione();
  fzApriCatalogo();
  alert('Riconosciute ' + (prima - fzContaVoce(daVer.id)) + ' registrazioni; in "Da verificare" ne restano ' + fzContaVoce(daVer.id) + '.');
}

async function fzElimina() {
  const r = fzRighe.find(x => x.id === fzForm.id);
  if (!r || !confirm('Eliminare "' + r.titolo + '" di ' + fzNomeVol(r.volontario_id) + '?')) return;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro?id=eq.' + r.id, { method: 'DELETE', headers: H });
    if (!res.ok) throw new Error('errore');
  } catch(e) { return fzErrore('Registrazione non eliminata: riprova.'); }
  logAttivita('ha eliminato ' + r.titolo + ' di ' + fzNomeVol(r.volontario_id));
  await fzDopoModifica([r.volontario_id], [r.codice]);
}

async function fzDopoModifica(vol, codici) {
  let ok = true;
  try { await fzRiallinea(vol, codici.filter(Boolean)); } catch(e) { ok = false; }
  fzChiudiForm();
  // il registro è già salvato: la finestra si chiude comunque, così non si registra due volte
  if (!ok) alert('Registro salvato, ma la scheda del volontario non è stata aggiornata: controlla i corsi in Volontari.');
  if (document.getElementById('panelFormazione').classList.contains('active')) caricaFormazione();
  if (typeof sv !== 'undefined' && sv && vol.includes(sv.id)) fzAggiornaScheda();
}

// Ricopia in volontari l'esito dei corsi fissi: svolto se ha almeno una riga nel registro
async function fzRiallinea(vol, codici) {
  codici = [...new Set(codici)];
  if (!codici.length) return;
  const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro?select=volontario_id,codice,scadenza&volontario_id=in.(' + vol.join(',') + ')&codice=in.(' + codici.map(c => '"' + c + '"').join(',') + ')', { headers: H });
  if (!res.ok) throw new Error('errore');
  const righe = await res.json();
  await Promise.all(vol.map(async id => {
    const body = {};
    codici.forEach(cod => {
      const c = FZ_CORSI_FISSI[cod];
      const sue = righe.filter(r => r.volontario_id === id && r.codice === cod);
      body[c.campo] = sue.length > 0;
      if (c.scadenza) body[c.scadenza] = sue.map(r => r.scadenza).filter(Boolean).sort().pop() || null;
    });
    const r = await sbFetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + id, {
      method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('errore');
    if (typeof sv !== 'undefined' && sv && sv.id === id) Object.assign(sv.v, body);
  }));
  if (typeof volontariData !== 'undefined' && volontariData.length) caricaVolontari();
}

// -- REGISTRO NELLA SCHEDA VOLONTARIO --
function fzRigheHtml(righe, scrive) {
  return righe.map(r => '<div class="lr' + (scrive ? ' clk" onclick="fzApriForm(' + r.id + ')' : '') + '"><div class="mid"><b>' + aggEsc(r.titolo) + '</b>'
    + '<span class="sub">' + [svData(r.data_corso), fzDettaglio(r)].filter(Boolean).join(' · ') + '</span></div>'
    + (svStatoScadenza(r.scadenza) ? svPillScadenza(svStatoScadenza(r.scadenza)) : '') + fzPillOrigine(r) + '</div>').join('');
}

async function fzRenderScheda() {
  const box = document.getElementById('svRegistro');
  if (!box) return;
  const id = sv.id;
  let righe;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro?select=*&volontario_id=eq.' + id + '&order=data_corso.desc.nullslast,id.desc', { headers: H });
    if (!res.ok) throw new Error('errore');
    righe = await res.json();
  } catch(e) { box.innerHTML = '<p class="note m0 mb10">Registro non disponibile.</p>'; return; }
  if (!sv || sv.id !== id) return;
  righe.forEach(r => { if (!fzRighe.some(x => x.id === r.id)) fzRighe.push(r); else fzRighe[fzRighe.findIndex(x => x.id === r.id)] = r; });
  sv.registro = righe;
  svRenderRegistro(fzPuoScrivere());   // scheda-volontario.js: corsi fissi in alto, abilitazioni nella loro scheda
}

// Dopo una registrazione: aggiorna spunte e scadenza senza perdere le altre modifiche in corso
function fzAggiornaScheda() {
  svRenderBarra();
  if (!sv.dirty.has('formazione')) { svRenderFormazione(); return; }
  SV_CORSI.forEach(c => { const el = document.getElementById(c.id); if (el) el.checked = !!sv.v[c.campo]; });
  const sc = document.getElementById('fScadDae');
  if (sc) sc.value = sv.v.scad_dae || '';
  fzRenderScheda();
}

// -- REGISTRO IN "LA MIA SCHEDA" (sola lettura) --
async function fzRenderPersonale(volId) {
  const box = document.getElementById('spFormazione');
  if (!box) return;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_registro?select=*&volontario_id=eq.' + volId + '&order=data_corso.desc.nullslast,id.desc', { headers: H });
    if (!res.ok) throw new Error('errore');
    // i corsi fissi stanno già nella card Corsi obbligatori (archivio-volontario.js)
    // e quelle importate da Drive stanno già nelle card dell'archivio
    const righe = (await res.json()).filter(r => !FZ_CORSI_FISSI[r.codice] && !r.drive_file_id);
    if (!righe.length) return;
    box.innerHTML = '<h2>Altri corsi e abilitazioni</h2>' + fzRigheHtml(righe, false);
    box.hidden = false;
  } catch(e) { /* registro non ancora attivo: la scheda resta com'era */ }
}
