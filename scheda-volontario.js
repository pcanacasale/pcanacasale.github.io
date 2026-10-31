// ============================================================
// SCHEDA VOLONTARIO — finestra con le schede Dati, Documenti, Visita medica,
// Formazione, Dotazioni e Interventi. Prefisso funzioni: sv*
// ============================================================
// Si appoggia alle tabelle già in uso: volontari, documenti, interventi_con_stato,
// intervento_volontari e, per chi ha il permesso "aggiornamento_dati", alla Edge
// Function agg-api (agg_documenti, agg_dpi_volontario).
// I campi modificabili hanno gli stessi id del form volontario: il salvataggio
// completo resta salvaVolontario() di area-riservata.js.
// ============================================================

const SV_TABS = [
  { id: 'dati',       label: 'Dati' },
  { id: 'documenti',  label: 'Documenti' },
  { id: 'visita',     label: 'Visita medica' },
  { id: 'formazione', label: 'Formazione' },
  { id: 'dotazioni',  label: 'Dotazioni' },
  { id: 'interventi', label: 'Interventi' },
];

let sv = null;      // { id, v, docs, agg, tab, ore, dirty, interventiOk, anteprimeOk }
let svToken = 0;    // scarta le risposte di una scheda già chiusa o cambiata

// Chi può fare cosa: stesse regole di prima delle pagine accorpate
function svPuoDati()   { return canModificaVolontari(); }
function svPuoVisita() { return canModificaVolontari() || hasPerm('visite'); }
function svPuoDoc()    { return canModificaVolontari() || hasPerm('documenti'); }
function svHaAgg()     { return typeof aggHaAccesso === 'function' && aggHaAccesso(); }
function svTabVisibile(tab) {
  if (hasPerm('volontari')) return true;
  if (tab === 'documenti') return hasPerm('documenti');
  if (tab === 'visita') return hasPerm('visite');
  if (tab === 'formazione') return hasPerm('documenti') || hasPerm('visite') || hasPerm('formazione');
  return false;
}

// -- APERTURA / CHIUSURA --
async function apriDettaglio(id, tab) {
  const token = ++svToken;
  volCorrenteId = id;
  const ov = document.getElementById('volDetail');
  ov.hidden = false;
  document.body.classList.add('sv-open');
  document.getElementById('svBar').hidden = true;
  document.getElementById('svTabs').innerHTML = '';
  document.getElementById('svFoot').hidden = true;
  document.getElementById('svTesta').innerHTML = '<p class="note m0">Caricamento…</p>';
  document.getElementById('svBody').innerHTML = '';
  try {
    if (!schemaCache.length) await caricaSchema();
    const [vRes, dRes, agg, ore] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + id + '&select=*', { headers: H }),
      fetch(SUPA_URL + '/rest/v1/documenti?volontario_id=eq.' + id + '&select=*&order=data_carico.desc', { headers: H }),
      svCaricaAgg(id),
      svOreAnno(id),
    ]);
    if (token !== svToken) return;
    const v = (await vRes.json())[0];
    if (!v) { document.getElementById('svTesta').innerHTML = '<div class="empty">Volontario non trovato.</div>'; return; }
    sv = { id, v, docs: dRes.ok ? await dRes.json() : [], agg, ore, tab: null, dirty: new Set(), interventiOk: false, anteprimeOk: false };
    aggCorrente = agg;
    svRender();
    svMostraTab(tab || SV_TABS.map(t => t.id).filter(svTabVisibile)[0]);
    svCaricaFoto();
  } catch(e) {
    if (token === svToken) document.getElementById('svTesta').innerHTML = '<div class="empty">Errore nel caricamento.</div>';
  }
}

async function svCaricaAgg(id) {
  if (!svHaAgg()) return null;
  try { return await aggCall('get', { id }); } catch(e) { return null; } // volontario non ancora sincronizzato
}

async function svOreAnno(id) {
  try {
    const anno = String(new Date().getFullYear());
    const res = await fetch(SUPA_URL + '/rest/v1/intervento_volontari?volontario_id=eq.' + id + '&select=ore,data_inizio,intervento:intervento_id(data)', { headers: H });
    const righe = await res.json();
    return righe.filter(r => (r.data_inizio || (r.intervento && r.intervento.data) || '').slice(0, 4) === anno)
      .reduce((tot, r) => tot + (Number(r.ore) || 0), 0);
  } catch(e) { return null; }
}

function chiudiDettaglio() {
  svToken++;
  const ov = document.getElementById('volDetail');
  ov.hidden = true;
  document.body.classList.remove('sv-open');
  document.getElementById('svBody').innerHTML = '';
  volCorrenteId = null;
  aggCorrente = null;
  sv = null;
}

function svAnnulla() {
  if (sv && sv.dirty.size && !confirm('Chiudere senza salvare le modifiche?')) return;
  chiudiDettaglio();
}

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape' || !sv) return;
  if (document.querySelector('.doc-upload-overlay.open, .vista-form-overlay.open')) return;
  svAnnulla();
});

// -- DISEGNO --
function svRender() {
  svRenderTesta();
  svRenderBarra();
  document.getElementById('svTabs').innerHTML = SV_TABS.filter(t => svTabVisibile(t.id)).map(t =>
    '<button class="chip" role="tab" id="svTab_' + t.id + '" onclick="svMostraTab(\'' + t.id + '\')">' + t.label + '</button>').join('');

  const puoSalvare = svPuoDati() || svPuoVisita();
  document.getElementById('svFoot').hidden = false;
  document.getElementById('svSalva').hidden = !puoSalvare;
  document.getElementById('svAnnulla').textContent = puoSalvare ? 'Annulla' : 'Chiudi';

  document.getElementById('svBody').innerHTML = '<div class="vol-form-err" id="volFormErr"></div>'
    + SV_TABS.map(t => '<div class="sv-panel" id="svP_' + t.id + '" data-tab="' + t.id + '" role="tabpanel" hidden></div>').join('');
  svRenderDati();
  svRenderVisita();
  svRenderFormazione();
  svRenderDocumenti();
  svRenderDotazioni();
  if (svPuoDati()) riempiFormVolontario(sv.v);
}

function svRenderTesta() {
  const v = sv.v;
  const stato = VOL_STATO_PILL[v.stato || 'ATTIVO'] || VOL_STATO_PILL.ATTIVO;
  const riga = [v.specializzazione || v.mansione || v.tipo_volontario || 'Volontario'];
  if (sv.ore !== null) riga.push(String(sv.ore).replace('.', ',') + ' ore nel ' + new Date().getFullYear());
  document.getElementById('svTesta').innerHTML = '<span id="svAvatar">' + _volAvatar(v) + '</span>'
    + '<div class="mid"><h2 id="volDetailTitle">' + aggEsc(v.cognome + ' ' + v.nome) + '</h2>'
    + '<span class="sub">' + aggEsc(riga.join(' · ')) + '</span></div>'
    + '<span class="pill ' + stato[1] + '">' + stato[0] + '</span>';
}

// Foto dell'archivio PIA: il file è privato e serve un link temporaneo
async function svCaricaFoto() {
  if (!sv || sv.v.foto_url || !sv.agg) return;
  const foto = (sv.agg.documenti || []).find(d => d.tipo === 'FOTO');
  if (!foto) return;
  const token = svToken;
  try {
    const data = await aggCall('doc_signed_url', { id: foto.id });
    const box = document.getElementById('svAvatar');
    if (box && token === svToken) box.innerHTML = '<img src="' + data.url + '" class="av" alt="">';
  } catch(e) {}
}

function svRenderBarra() {
  const voci = svVociDaSistemare();
  const bar = document.getElementById('svBar');
  bar.hidden = !voci.length;
  bar.innerHTML = '<b>Da sistemare</b><div class="chips">' + voci.map(x =>
    '<button class="chip" onclick="svMostraTab(\'' + x.tab + '\')">' + aggEsc(x.label) + '</button>').join('') + '</div>';
}

// Voci della barra gialla: una per ogni cosa mancante o in scadenza
function svVociDaSistemare() {
  const voci = [];
  const p = svProblemi(sv.v, sv.agg ? { blocchi: sv.agg.completezza.blocchi } : null, sv.docs);
  const add = (tab, label) => { if (svTabVisibile(tab)) voci.push({ tab, label }); };
  if (p.foto) add('documenti', 'Foto');
  p.docMancanti.forEach(l => add('documenti', l));
  svDocAgg().forEach(d => {
    const st = svStatoScadenza(d.scadenza);
    if (!st) return;
    const tab = AGG_TIPI_DOC_MULTIPLI.includes(d.tipo) ? 'formazione' : 'documenti';
    add(tab, (d.descrizione || svEtichetta(AGG_DOC_LABEL[d.tipo] || d.tipo)) + (st === 'scaduto' ? ' scaduto' : ' in scadenza'));
  });
  if (p.visita) add('visita', 'Visita');
  p.formazione.forEach(l => add('formazione', l));
  if (p.taglie) add('dati', 'Taglie');
  return voci;
}

function svMostraTab(tab) {
  if (!sv || !svTabVisibile(tab)) return;
  sv.tab = tab;
  SV_TABS.forEach(t => {
    const p = document.getElementById('svP_' + t.id);
    if (p) p.hidden = t.id !== tab;
    const c = document.getElementById('svTab_' + t.id);
    if (c) { c.classList.toggle('on', t.id === tab); c.setAttribute('aria-selected', t.id === tab); }
  });
  const c = document.getElementById('svTab_' + tab);
  if (c) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (tab === 'interventi' && !sv.interventiOk) svCaricaInterventi();
  if (tab === 'documenti' && !sv.anteprimeOk) svCaricaAnteprime();
  document.getElementById('svBody').scrollTop = 0;
}

// -- SCHEDA DATI --
function svCampo(label, val) {
  return '<div class="vol-field"><span class="vol-field-label">' + label + '</span>'
    + (val || val === 0 ? '<span class="vol-field-value">' + aggEsc(val) + '</span>' : '<span class="vol-field-value null">—</span>') + '</div>';
}
function svSi(label, val) {
  return '<div class="vol-field"><span class="vol-field-label">' + label + '</span>'
    + (val ? '<span class="vol-field-value vol-bool-yes">✓ Sì</span>' : '<span class="vol-field-value vol-bool-no">—</span>') + '</div>';
}
function svData(iso) { return iso ? new Date(iso).toLocaleDateString('it-IT') : ''; }
function svSezione(titolo, html) {
  return '<div class="vol-section"><div class="vol-section-head" onclick="toggleVolSection(this)">' + titolo + '</div><div class="vol-section-body">' + html + '</div></div>';
}

function svRenderDati() {
  const box = document.getElementById('svP_dati');
  const v = sv.v;
  if (svPuoDati()) {
    box.innerHTML = '<div id="svTaglie"></div>' + volFormSezioniHtml(true);
    svRenderTaglie();
    svOsservaModifiche(box);
    return;
  }
  box.innerHTML = '<div id="svTaglie"></div>' + svSezione('Anagrafica', svCampo('Codice Fiscale', v.codice_fiscale) + svCampo('Data nascita', svData(v.data_nascita))
      + svCampo('Luogo nascita', v.luogo_nascita) + svCampo('Indirizzo', v.indirizzo ? v.indirizzo + (v.citta ? ', ' + v.citta : '') : ''))
    + svSezione('Unità', svCampo('Squadra', v.squadra) + svCampo('Tipo', v.tipo_volontario) + svCampo('Mansione', v.mansione)
      + svCampo('Specializzazione', v.specializzazione) + svCampo('Gruppo Alpini', v.gruppo_alpini) + svCampo('Professione', v.professione) + svCampo('Patenti', v.patenti))
    + svSezione('Contatti', '<div class="vol-field"><span class="vol-field-label">Telefono</span>'
      + (v.telefono ? '<a href="tel:' + aggEsc(v.telefono) + '">' + aggEsc(v.telefono) + '</a>' : '<span class="vol-field-value null">—</span>') + '</div>'
      + '<div class="vol-field"><span class="vol-field-label">Email</span>'
      + (v.email ? '<a href="mailto:' + aggEsc(v.email) + '">' + aggEsc(v.email) + '</a>' : '<span class="vol-field-value null">—</span>') + '</div>')
    + svSezione('Abilitazioni', svSi('Comm. Unità', v.comm_unita) + svSi('Radio ANA', v.radio_ana) + svSi('EMERCOM', v.emercom) + svCampo('Cod. EMERCOM', v.cod_emercom))
    + svSezione('Amministrativo', svSi('Iscrizione', v.iscrizione) + svSi('Tutela legale CAP', v.tutela_legale_cap) + svCampo('Disponibilità', v.dispon)
      + svCampo('Note dispon.', v.note_dispon) + svCampo('Varchi', v.varchi) + svSi('Attivo', v.attivo))
    + svSezione('Datore di lavoro (Art. 39)', svCampo('Ragione sociale', v.datore_lavoro) + svCampo('Indirizzo ditta', v.indirizzo_lavoro)
      + svCampo('CAP ditta', v.cap_lavoro) + svCampo('Città ditta', v.citta_lavoro));
  svRenderTaglie();
  renderCampiCustomDettaglio(v).then(html => { if (sv && box.isConnected) box.insertAdjacentHTML('beforeend', html); });
}

function svOsservaModifiche(box) {
  const segna = () => { if (sv) sv.dirty.add(box.dataset.tab); };
  box.addEventListener('input', segna);
  box.addEventListener('change', segna);
}

// -- SALVATAGGIO --
async function svSalva() {
  if (!sv) return;
  if (!sv.dirty.size) { chiudiDettaglio(); return; }
  const btn = document.getElementById('svSalva');
  btn.disabled = true;
  // Dati toccati: salvataggio completo con tutti i controlli. Solo visita o corsi: si aggiornano
  // solo quei campi, come faceva la pagina Visite (nessun blocco per un CF da correggere).
  if (sv.dirty.has('dati') && svPuoDati()) {
    await salvaVolontario();
    if (sv) svMostraTab('dati'); // ancora aperta: errore di validazione, va corretto nei Dati
  } else await svSalvaCampi();
  btn.disabled = false;
}

async function svSalvaCampi() {
  const val = (id) => { const el = document.getElementById(id); return el && el.value ? el.value : null; };
  const chk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
  const body = {};
  if (sv.dirty.has('visita')) { body.data_visita = val('fDataVisita'); body.stato_visita = val('fStatoVisita'); body.cdc_1_step = chk('fCdc1'); body.cdc_2_step = chk('fCdc2'); }
  if (sv.dirty.has('formazione')) {
    if (svPuoDati()) Object.assign(body, { quattro_ore: chk('f4Ore'), dodici_ore: chk('f12Ore'), corso_caposq: chk('fCorsoCaposq'), dae: chk('fDae'), scad_dae: val('fScadDae') });
  }
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + sv.id, {
      method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('errore');
    await logAttivita('ha modificato volontario: ' + sv.v.cognome + ' ' + sv.v.nome);
    chiudiDettaglio();
    caricaVolontari();
  } catch(e) {
    const err = document.getElementById('volFormErr');
    err.textContent = 'Errore salvataggio.';
    err.style.display = 'block';
    document.getElementById('svBody').scrollTop = 0;
  }
}

// -- FILTRI "DA SISTEMARE" DELL'ELENCO VOLONTARI --
const SV_FILTRI = [
  { id: 'visita',     label: 'Visita in scadenza',  test: p => p.visita },
  { id: 'formazione', label: 'Formazione mancante', test: p => p.formazione.length > 0 },
  { id: 'documenti',  label: 'Documenti mancanti',  test: p => p.docMancanti.length > 0 },
  { id: 'foto',       label: 'Foto mancante',       test: p => p.foto },
];
let svFiltro = null;        // id del filtro attivo
let svProblemiPerVol = {};  // volontario_id → esito di svProblemi

// Prepara le regole per tutto l'elenco. Chi ha il permesso vede anche i documenti d'archivio.
async function svCaricaProblemi(vols) {
  const [docs, lista] = await Promise.all([
    fetch(SUPA_URL + '/rest/v1/documenti?select=volontario_id,tipo', { headers: H }).then(r => r.ok ? r.json() : []).catch(() => []),
    svHaAgg() ? aggCall('list', {}).catch(() => null) : null,
  ]);
  const docsPerVol = {};
  docs.forEach(d => { (docsPerVol[d.volontario_id] = docsPerVol[d.volontario_id] || []).push(d); });
  const cardPerVol = {};
  ((lista && lista.cards) || []).forEach(c => { cardPerVol[c.id] = c; });
  svProblemiPerVol = {};
  vols.forEach(v => {
    const card = cardPerVol[v.id] || null;
    const p = svProblemi(v, card, docsPerVol[v.id] || []);
    p.incompleta = card ? card.completezza < 100 : (p.foto || p.visita || p.formazione.length > 0 || p.docMancanti.length > 0);
    svProblemiPerVol[v.id] = p;
  });
}

function svConteggi(vols) {
  const c = {};
  SV_FILTRI.forEach(f => { c[f.id] = 0; });
  c.incompleta = 0;
  vols.filter(v => v.stato !== 'DIMESSO').forEach(v => {
    const p = svProblemiPerVol[v.id];
    if (!p) return;
    SV_FILTRI.forEach(f => { if (f.test(p)) c[f.id]++; });
    if (p.incompleta) c.incompleta++;
  });
  return c;
}

function svRenderFiltri() {
  const box = document.getElementById('volChipsProblemi');
  if (!box) return;
  const c = svConteggi(volontariData);
  box.innerHTML = SV_FILTRI.concat(svFiltro === 'incompleta' ? [{ id: 'incompleta', label: 'Schede incomplete' }] : []).map(f =>
    '<button class="chip' + (svFiltro === f.id ? ' on' : '') + '" onclick="svImpostaFiltro(\'' + f.id + '\')">' + f.label + ' <span class="n">' + c[f.id] + '</span></button>').join('');
}

function svImpostaFiltro(id) {
  svFiltro = svFiltro === id ? null : id;
  svRenderFiltri();
  filtraVolontari();
}

function svPassaFiltro(v) {
  if (!svFiltro) return true;
  const p = svProblemiPerVol[v.id];
  if (!p || v.stato === 'DIMESSO') return false;
  const f = SV_FILTRI.find(x => x.id === svFiltro);
  return f ? f.test(p) : p.incompleta;
}

// -- DASHBOARD: CARD "DA SISTEMARE" --
async function svCardDashboard() {
  if (window.isVolUser || !(hasPerm('volontari') || hasPerm('documenti') || hasPerm('visite'))) return '';
  const res = await fetch(SUPA_URL + '/rest/v1/volontari?select=id,stato,stato_visita,quattro_ore,dodici_ore,dae,scad_dae,foto_url', { headers: H });
  const vols = await res.json();
  await svCaricaProblemi(vols);
  const c = svConteggi(vols);
  const righe = [
    ['visita', c.visita, c.visita === 1 ? 'visita in scadenza' : 'visite in scadenza'],
    ['formazione', c.formazione, 'con formazione mancante'],
    ['documenti', c.documenti, 'con documenti mancanti'],
    ['incompleta', c.incompleta, c.incompleta === 1 ? 'scheda incompleta' : 'schede incomplete'],
  ].filter(r => r[1] > 0);
  if (!righe.length) return '';
  return '<div class="card"><h2>Da sistemare</h2>' + righe.map(r =>
    '<button class="todo" onclick="svApriElencoFiltrato(&quot;' + r[0] + '&quot;)"><span class="dot yellow"></span><span class="grow"><b>' + r[1] + '</b> ' + r[2] + '</span><span class="go">→</span></button>').join('') + '</div>';
}

function svApriElencoFiltrato(id) {
  svFiltro = id;
  vistaAttiva = null;
  ['volSearch', 'filtroSquadra', 'filtroTipo', 'filtroMansione', 'filtroAttivo', 'filtroVisita'].forEach(x => { document.getElementById(x).value = ''; });
  if (visteCache.length) renderVisteBar();
  navVai('siVolontari');
}

// -- REGOLE "DA SISTEMARE" (uguali per scheda, elenco Volontari e dashboard) --
// Visita: stessa regola della vista "visita non completata"; l'esonero non è da sistemare.
function svVisitaDaSistemare(v) { return !['COMPLETATA', 'ESONERO'].includes(visitaStatoNorm(v)); }

// Scadenze: stessa regola delle revisioni mezzi in dashboard (scaduto o in scadenza nel mese corrente)
function svStatoScadenza(iso) {
  if (!iso) return '';
  const oggi = new Date().toISOString().slice(0, 10);
  if (iso.slice(0, 10) < oggi) return 'scaduto';
  return iso.slice(0, 7) === oggi.slice(0, 7) ? 'scadenza' : '';
}

// aggCard: { blocchi } di agg-api, null se non disponibile; docs: righe della tabella documenti
function svProblemi(v, aggCard, docs) {
  const blocchi = aggCard ? aggCard.blocchi : null;
  const haIdentita = docs.some(d => d.tipo === 'IDENTITA');
  const docMancanti = [];
  if (blocchi) {
    if (!blocchi.carta_identita && !haIdentita) docMancanti.push("Carta d'identità");
    if (!blocchi.codice_fiscale) docMancanti.push('Codice fiscale');
    if (blocchi.patente === false) docMancanti.push('Patente');
  } else if (!haIdentita) docMancanti.push("Carta d'identità");
  const formazione = [];
  if (!v.quattro_ore) formazione.push('Corso 4 ore');
  if (!v.dodici_ore) formazione.push('Corso 12 ore');
  const dae = svStatoScadenza(v.dae ? v.scad_dae : null);
  if (dae) formazione.push(dae === 'scaduto' ? 'DAE scaduto' : 'DAE in scadenza');
  return {
    foto: !v.foto_url && !(blocchi && blocchi.foto) && !docs.some(d => d.tipo === 'FOTO'),
    docMancanti, visita: svVisitaDaSistemare(v), formazione,
    taglie: !!blocchi && !blocchi.dpi_valutati,
  };
}

function svDocAgg() { return sv && sv.agg ? (sv.agg.documenti || []) : []; }
function svEtichetta(label) { return label.replace(/^[^\s\wÀ-ÿ]+\s*/u, ''); }

// -- ALLEGATI (due archivi: tabella documenti con URL pubblico, agg_documenti con link temporaneo) --
function svEImmagine(nome) { return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(nome || ''); }
function svAzioniDoc(d) {
  const apri = d.agg
    ? '<button class="btn sm" onclick="svApriAgg(' + d.id + ')">Apri</button><button class="btn sm" onclick="svApriAgg(' + d.id + ',true)">Scarica</button>'
    : '<a class="btn sm" href="' + aggEsc(d.url) + '" target="_blank" rel="noopener">Apri</a><a class="btn sm" href="' + aggEsc(d.url) + '?download=' + encodeURIComponent(d.nome || 'documento') + '">Scarica</a>';
  const puoEliminare = d.agg ? svHaAgg() : svPuoDoc();
  const del = !puoEliminare ? '' : '<button class="btn sm danger" aria-label="Elimina" onclick="' + (d.agg ? 'aggEliminaDocumento(' + d.id + ')' : 'eliminaDoc(' + d.id + ',' + sv.id + ')') + '">✕</button>';
  return apri + del;
}
function svRigaDaDocumenti(d) { return { id: d.id, tipo: d.tipo, nome: d.nome_file || svEtichetta(DOC_TIPO_LABEL[d.tipo] || d.tipo), url: d.url, data: d.data_carico, agg: false }; }
function svRigaDaAgg(d) { return { id: d.id, tipo: d.tipo, nome: d.descrizione || d.nome_file || svEtichetta(AGG_DOC_LABEL[d.tipo] || d.tipo), file: d.nome_file, scadenza: d.scadenza, data: d.caricato_il, agg: true }; }

function svPillScadenza(st) {
  return st === 'scaduto' ? '<span class="pill p-red">Scaduto</span>' : '<span class="pill p-yellow">In scadenza</span>';
}
function svRigaAllegato(d) {
  const st = svStatoScadenza(d.scadenza);
  const meta = [svData(d.data) ? 'Caricato il ' + svData(d.data) : '', d.scadenza ? 'Scade il ' + svData(d.scadenza) : ''].filter(Boolean).join(' · ');
  return '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(d.nome) + '</div>'
    + '<div class="doc-item-meta">' + aggEsc(meta) + '</div></div>'
    + (st ? svPillScadenza(st) : '')
    + '<div class="doc-item-actions">' + svAzioniDoc(d) + '</div></div>';
}

async function svApriAgg(id, scarica) {
  const finestra = window.open('', '_blank');
  try {
    const data = await aggCall('doc_signed_url', { id });
    finestra.location = data.url + (scarica ? '&download=' + encodeURIComponent(data.nome_file || 'documento') : '');
  } catch(e) { finestra.close(); alert('Errore: ' + e.message); }
}

// Dopo caricamenti ed eliminazioni: i campi non salvati delle schede restano intatti
async function svRicaricaDocumenti() {
  if (!sv) return;
  const token = svToken;
  const res = await fetch(SUPA_URL + '/rest/v1/documenti?volontario_id=eq.' + sv.id + '&select=*&order=data_carico.desc', { headers: H });
  const docs = res.ok ? await res.json() : sv.docs;
  if (!sv || token !== svToken) return;
  sv.docs = docs;
  const foto = docs.find(d => d.tipo === 'FOTO');
  sv.v.foto_url = foto ? foto.url : null;
  svAggiornaAllegati();
}
function svAggiornaAllegati() {
  sv.anteprimeOk = false;
  svRenderTesta();
  svRenderDocumenti();
  svRenderAllegatiVisita();
  svRenderAllegatiFormazione();
  svRenderDotazioni();
  svRenderTaglie();
  svRenderBarra();
  if (sv.tab === 'documenti') svCaricaAnteprime();
  svCaricaFoto();
}

// aggiornamento-dati.js ridisegna la propria scheda dopo ogni operazione: con questa
// finestra aperta aggiorna invece gli allegati qui.
(function svAggancioAgg() {
  const orig = window.aggRenderScheda;
  window.aggRenderScheda = function () {
    if (!sv) return orig.apply(this, arguments);
    sv.agg = aggCorrente;
    svAggiornaAllegati();
  };
})();
function svPreparaAgg() { aggIniettaCSS(); aggCostruisciOverlay(); }

// -- SCHEDA DOCUMENTI --
const SV_DOC_SLOT = [
  { tipo: 'CARTA_IDENTITA', label: "Carta d'identità", alias: 'IDENTITA' },
  { tipo: 'CODICE_FISCALE', label: 'Codice fiscale' },
  { tipo: 'PATENTE', label: 'Patente', soloPatenti: true },
];

function svCartaDoc(titolo, d, azioni) {
  const img = d && !d.agg && svEImmagine(d.url) ? '<img src="' + aggEsc(d.url) + '" alt="">' : '';
  const st = d ? svStatoScadenza(d.scadenza) : '';
  const pill = !d ? '<span class="pill p-sand">Mancante</span>' : (st ? svPillScadenza(st) : '<span class="pill p-blue">Presente</span>');
  return '<div class="card sv-doc"><div class="thumb b"' + (d && d.agg ? ' id="svThumb_' + d.id + '"' : '') + '>' + (img || navIc('file', 34)) + '</div>'
    + '<b>' + aggEsc(titolo) + '</b>' + (d && d.nome !== titolo ? '<span class="sub">' + aggEsc(d.nome) + '</span>' : '')
    + (d && d.scadenza ? '<span class="sub">Scade il ' + svData(d.scadenza) + '</span>' : '')
    + '<div class="sv-doc-pill">' + pill + '</div><div class="sv-doc-az">' + azioni + '</div></div>';
}

function svBottoneCarica(label, azione) { return '<button class="btn sm" onclick="' + azione + '">' + label + '</button>'; }

function svRenderDocumenti() {
  const box = document.getElementById('svP_documenti');
  if (!box) return;
  const puoAgg = svHaAgg() && !!sv.agg;
  const agg = svDocAgg();
  let html = '';

  // Foto tessera
  const fotoAgg = agg.find(d => d.tipo === 'FOTO');
  const fotoDoc = sv.docs.find(d => d.tipo === 'FOTO');
  const foto = fotoAgg ? svRigaDaAgg(fotoAgg) : (fotoDoc ? svRigaDaDocumenti(fotoDoc) : null);
  let azFoto = '';
  if (puoAgg) azFoto = svBottoneCarica(foto ? 'Sostituisci' : 'Carica', 'svCaricaFotoPIA()');
  else if (svPuoDoc() && !foto) azFoto = svBottoneCarica('Carica', "apriUploadDoc(" + sv.id + ",'FOTO')");
  html += svCartaDoc('Foto tessera', foto, azFoto + (foto ? svAzioniDoc(foto) : ''));

  // Documenti richiesti
  SV_DOC_SLOT.forEach(s => {
    if (s.soloPatenti && !(sv.v.patenti && String(sv.v.patenti).trim())) return;
    const presenti = agg.filter(d => d.tipo === s.tipo).map(svRigaDaAgg)
      .concat(s.alias ? sv.docs.filter(d => d.tipo === s.alias).map(svRigaDaDocumenti) : []);
    let az = '';
    if (puoAgg) az = svBottoneCarica('Carica', "svCaricaArchivio('" + s.tipo + "')");
    else if (s.alias && svPuoDoc()) az = svBottoneCarica('Carica', "apriUploadDoc(" + sv.id + ",'" + s.alias + "')");
    if (!presenti.length) html += svCartaDoc(s.label, null, az);
    presenti.forEach(d => { html += svCartaDoc(s.label, d, svAzioniDoc(d)); });
  });

  // Firma del consenso (arriva dal link del volontario) e altri file
  agg.filter(d => d.tipo === 'FIRMA').map(svRigaDaAgg).forEach(r => { html += svCartaDoc('Firma consenso privacy', r, svAzioniDoc(r)); });
  sv.docs.filter(d => d.tipo === 'ALTRO').map(svRigaDaDocumenti).forEach(r => { html += svCartaDoc('Altro', r, svAzioniDoc(r)); });

  if (svPuoDoc()) html += '<button class="sv-doc sv-doc-add" onclick="apriUploadDoc(' + sv.id + ')">' + navIc('file', 28) + '<span>Carica documento</span></button>';
  box.innerHTML = '<div class="sv-docs">' + html + '</div>'
    + (svHaAgg() && !sv.agg ? '<p class="note">Questo volontario non è ancora in Aggiornamento dati: usa "Sincronizza nuovi volontari" per caricare foto PIA e documenti d\'archivio.</p>' : '');
}

function svCaricaFotoPIA() { svPreparaAgg(); aggApriEditorFoto(sv.id); }
function svCaricaArchivio(tipo) { svPreparaAgg(); aggApriUploadDoc(sv.id, tipo); }

// Anteprime dell'archivio privato: richieste solo aprendo la scheda (ognuna finisce nel log accessi)
function svCaricaAnteprime() {
  if (!sv) return;
  sv.anteprimeOk = true;
  const token = svToken;
  svDocAgg().filter(d => svEImmagine(d.nome_file)).forEach(async d => {
    try {
      const data = await aggCall('doc_signed_url', { id: d.id });
      const box = document.getElementById('svThumb_' + d.id);
      if (box && token === svToken) box.innerHTML = '<img src="' + data.url + '" alt="">';
    } catch(e) {}
  });
}

// -- SCHEDA VISITA MEDICA --
// CDC 1° e 2° Step sono controlli sanitari: stanno con la visita, non tra i corsi
const SV_CDC = [
  { id: 'fCdc1', campo: 'cdc_1_step', label: 'CDC 1° Step', tipo: 'CDC_1' },
  { id: 'fCdc2', campo: 'cdc_2_step', label: 'CDC 2° Step', tipo: 'CDC_2' },
];

function svRenderVisita() {
  const box = document.getElementById('svP_visita');
  const v = sv.v;
  const stato = visitaStatoNorm(v);
  const info = VISITA_STATI[stato];
  const daSistemare = svVisitaDaSistemare(v);
  let html = '<div class="card sv-big' + (daSistemare ? ' warn' : '') + '"><span class="sub">' + (daSistemare ? 'Visita da sistemare' : 'Visita in regola') + '</span>'
    + '<b>' + (info ? info.label : 'Non impostata') + '</b>'
    + '<span class="sub">' + (v.data_visita ? 'Ultima visita il ' + svData(v.data_visita) : 'Nessuna data registrata') + '</span></div>';
  if (svPuoVisita()) {
    html += '<div class="vol-form-grid sv-mt">'
      + '<div class="vol-form-field"><label class="vol-form-lbl" for="fDataVisita">Data ultima visita</label><input class="vol-form-inp" type="date" id="fDataVisita" value="' + aggEsc(v.data_visita || '') + '"></div>'
      + '<div class="vol-form-field"><label class="vol-form-lbl" for="fStatoVisita">Esito</label><select class="vol-form-inp" id="fStatoVisita">' + visitaOpzioniHtml(stato) + '</select></div>'
      + '</div>';
  } else {
    html += '<div class="sv-mt">' + svCampo('Data ultima visita', svData(v.data_visita)) + svCampo('Esito', info ? info.label : '') + '</div>';
  }
  html += '<div class="grp sv-mt">Controlli sanitari</div>' + SV_CDC.map(c => {
    const pill = v[c.campo] ? '<span class="pill p-blue">Svolto</span>' : '<span class="pill p-grey">Non svolto</span>';
    const titolo = svPuoVisita()
      ? '<label class="sv-corso-t"><input type="checkbox" id="' + c.id + '"' + (v[c.campo] ? ' checked' : '') + '> ' + c.label + '</label>'
      : '<b class="sv-corso-t">' + c.label + '</b>';
    return '<div class="sv-corso"><div class="sv-corso-h">' + titolo + pill + '</div><div id="svAll_' + c.tipo + '"></div></div>';
  }).join('');
  html += '<div class="grp sv-mt">Allegato</div><div id="svAllVisita"></div>';
  box.innerHTML = html;
  svRenderAllegatiVisita();
  svOsservaModifiche(box);
}

function svRenderAllegatiVisita() {
  const box = document.getElementById('svAllVisita');
  if (!box) return;
  const righe = sv.docs.filter(d => d.tipo === 'VISITA').map(svRigaDaDocumenti);
  box.innerHTML = (righe.length ? righe.map(svRigaAllegato).join('') : '<p class="note m0 mb10">Nessun allegato.</p>')
    + (svPuoDoc() ? '<button class="doc-add-btn" onclick="apriUploadDoc(' + sv.id + ',\'VISITA\')">+ Carica allegato</button>' : '');
  SV_CDC.forEach(c => {
    const all = document.getElementById('svAll_' + c.tipo);
    if (all) all.innerHTML = sv.docs.filter(d => d.tipo === c.tipo).map(svRigaDaDocumenti).map(svRigaAllegato).join('')
      + (svPuoDoc() ? '<button class="btn sm sv-allega" onclick="apriUploadDoc(' + sv.id + ',\'' + c.tipo + '\')">Allega documento</button>' : '');
  });
}

// -- SCHEDA FORMAZIONE --
// I corsi sono i campi già presenti in volontari; gli attestati sono righe di documenti
const SV_CORSI = [
  { id: 'f4Ore',        campo: 'quattro_ore',  label: 'Corso 4 ore',       tipo: '4_ORE',  storico: 'quattro_ore_att' },
  { id: 'f12Ore',       campo: 'dodici_ore',   label: 'Corso 12 ore',      tipo: '12_ORE', storico: 'dodici_ore_att' },
  { id: 'fCorsoCaposq', campo: 'corso_caposq', label: 'Corso Caposquadra', tipo: 'CAPOSQ', storico: 'caposq_att' },
  { id: 'fDae',         campo: 'dae',          label: 'DAE',               tipo: 'DAE',    scadenza: 'scad_dae' },
];

function svRenderFormazione() {
  const box = document.getElementById('svP_formazione');
  const v = sv.v;
  box.innerHTML = '<div class="grp">Registro corsi e abilitazioni</div><div id="svRegistro"><p class="note m0 mb10">Caricamento…</p></div>'
    + '<div class="grp sv-mt">Corsi obbligatori</div><div class="sv-corsi">' + SV_CORSI.map(c => {
    const puo = svPuoDati();
    const st = c.scadenza && v[c.campo] ? svStatoScadenza(v[c.scadenza]) : '';
    const pill = st ? svPillScadenza(st) : (v[c.campo] ? '<span class="pill p-blue">Svolto</span>' : '<span class="pill p-grey">Non svolto</span>');
    const titolo = puo
      ? '<label class="sv-corso-t"><input type="checkbox" id="' + c.id + '"' + (v[c.campo] ? ' checked' : '') + '> ' + c.label + '</label>'
      : '<b class="sv-corso-t">' + c.label + '</b>';
    let dett = '';
    if (c.scadenza) dett = svPuoDati()
      ? '<div class="vol-form-field sv-corso-sc"><label class="vol-form-lbl" for="fScadDae">Scadenza</label><input class="vol-form-inp" type="date" id="fScadDae" value="' + aggEsc(v[c.scadenza] || '') + '"></div>'
      : (v[c.scadenza] ? '<span class="sub">Scade il ' + svData(v[c.scadenza]) + '</span>' : '');
    if (c.storico && v[c.storico]) dett += '<span class="sub">Attestato in archivio: ' + aggEsc(v[c.storico]) + '</span>';
    return '<div class="sv-corso"><div class="sv-corso-h">' + titolo + pill + '</div>' + dett + '<div id="svAll_' + c.tipo + '"></div></div>';
  }).join('') + '</div>'
    + '<div class="grp sv-mt">Altri corsi e attestati</div><div id="svAltriCorsi"></div>';
  svRenderAllegatiFormazione();
  fzRenderScheda();
  svOsservaModifiche(box);
}

function svRenderAllegatiFormazione() {
  SV_CORSI.forEach(c => {
    const box = document.getElementById('svAll_' + c.tipo);
    if (!box) return;
    const righe = sv.docs.filter(d => d.tipo === c.tipo).map(svRigaDaDocumenti);
    box.innerHTML = righe.map(svRigaAllegato).join('')
      + (svPuoDoc() ? '<button class="btn sm sv-allega" onclick="apriUploadDoc(' + sv.id + ',\'' + c.tipo + '\')">Allega attestato</button>' : '');
  });
  const altri = document.getElementById('svAltriCorsi');
  if (!altri) return;
  const righe = svDocAgg().filter(d => AGG_TIPI_DOC_MULTIPLI.includes(d.tipo)).map(svRigaDaAgg)
    .concat(sv.docs.filter(d => ['ATTESTATO', 'EMERCOM'].includes(d.tipo)).map(svRigaDaDocumenti));
  let html = righe.length ? righe.map(svRigaAllegato).join('') : '<p class="note m0 mb10">Nessun altro corso registrato.</p>';
  if (svHaAgg() && sv.agg) html += '<div class="sv-az-row"><button class="doc-add-btn" onclick="svCaricaArchivio(\'ATTESTATO\')">+ Aggiungi corso</button><button class="doc-add-btn" onclick="svCaricaArchivio(\'ABILITAZIONE\')">+ Aggiungi abilitazione</button></div>';
  else if (svPuoDoc()) html += '<button class="doc-add-btn" onclick="apriUploadDoc(' + sv.id + ',\'ATTESTATO\')">+ Aggiungi corso</button>';
  altri.innerHTML = html;
}

// -- TAGLIE (scheda Dati) E DOTAZIONI --
function svDpiRighe() {
  if (!sv.agg) return null;
  return (sv.agg.dpi || []).map(d => ({ nome: d._nome || 'Capo', categoria: d._categoria, taglia: d.taglia, consegnato: d.consegnato, data: d.data_consegna }));
}

function svRenderTaglie() {
  const box = document.getElementById('svTaglie');
  if (!box) return;
  const righe = svDpiRighe();
  if (!righe) { box.innerHTML = ''; return; }
  const conTaglia = righe.filter(r => r.taglia);
  box.innerHTML = svSezione('Taglie DPI', (conTaglia.length ? conTaglia.map(r => svCampo(aggEsc(r.nome), r.taglia)).join('') : '<p class="note m0">Nessuna taglia registrata.</p>')
    + '<button class="btn sm sv-mt" onclick="svApriAggDati()">Modifica taglie</button>');
}

function svRenderDotazioni() {
  const box = document.getElementById('svP_dotazioni');
  if (!box) return;
  const righe = svDpiRighe();
  if (!righe) {
    box.innerHTML = '<div class="empty">' + (svHaAgg() ? 'Volontario non ancora presente in Aggiornamento dati.' : 'L\'elenco dei DPI assegnati richiede il permesso Aggiornamento dati.') + '</div>';
    return;
  }
  box.innerHTML = (righe.length ? righe.map(r => '<div class="lr"><div class="mid"><b>' + aggEsc(r.nome) + '</b><span class="sub">'
      + aggEsc([r.categoria, r.taglia ? 'Taglia ' + r.taglia : ''].filter(Boolean).join(' · ')) + '</span></div>'
      + (r.consegnato ? '<span class="pill p-blue">Consegnato' + (r.data ? ' il ' + svData(r.data) : '') + '</span>' : '<span class="pill p-sand">Da consegnare</span>') + '</div>').join('')
    : '<div class="empty">Nessun DPI assegnato.</div>')
    + '<button class="btn sm sv-mt" onclick="svApriAggDati()">Gestisci DPI</button>';
}

function svApriAggDati() {
  const id = sv.id;
  if (sv.dirty.size && !confirm('Chiudere senza salvare le modifiche?')) return;
  chiudiDettaglio();
  showPanel('aggDati', null);
  aggApriScheda(id);
}

// -- SCHEDA INTERVENTI --
async function svCaricaInterventi() {
  const box = document.getElementById('svP_interventi');
  if (!box) return;
  const token = svToken;
  sv.interventiOk = true;
  box.innerHTML = '<p class="note">Caricamento…</p>';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/interventi_con_stato?volontari_ids=cs.[' + sv.id + ']&select=id,evento,data,tipo_attivita,stato_calcolato&order=data.desc', { headers: H });
    const interventi = await res.json();
    if (token !== svToken) return;
    if (!interventi.length) { box.innerHTML = '<div class="empty">Nessun intervento registrato.</div>'; return; }
    box.innerHTML = interventi.map(i => {
      const onclick = 'chiudiDettaglio();showPanel(&quot;interventi&quot;,null);apriDettaglioIntervento(' + i.id + ')';
      return '<div class="lr clk" onclick="' + onclick + '"><div class="mid"><b>' + aggEsc(i.evento || '—') + '</b><span class="sub">'
        + aggEsc([svData(i.data) || '—', i.tipo_attivita].filter(Boolean).join(' · ')) + '</span></div><span class="go">→</span></div>';
    }).join('');
  } catch(e) { if (token === svToken) box.innerHTML = '<p class="bad">Errore nel caricamento.</p>'; }
}
