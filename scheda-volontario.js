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
  if (tab === 'formazione') return hasPerm('documenti') || hasPerm('visite');
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

function svVociDaSistemare() {
  return [];
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
    box.innerHTML = volFormSezioniHtml(true);
    svOsservaModifiche(box);
    return;
  }
  box.innerHTML = svSezione('Anagrafica', svCampo('Codice Fiscale', v.codice_fiscale) + svCampo('Data nascita', svData(v.data_nascita))
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
  await salvaVolontario();
  btn.disabled = false;
  if (sv) { svMostraTab('dati'); document.getElementById('svBody').scrollTop = 0; }
}
