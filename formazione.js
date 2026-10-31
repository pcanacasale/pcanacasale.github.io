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
    const res = await fetch(SUPA_URL + '/rest/v1/volontari?select=*&or=(stato.is.null,stato.neq.DIMESSO)&order=cognome,nome', { headers: H });
    if (!res.ok) throw new Error('errore');
    visiteData = await res.json();
    renderDashboardVisite();
    filtraVisite();
  } catch(e) {
    list.innerHTML = '<div class="loading-msg bad">Errore nel caricamento.</div>';
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
    if (q && !((v.cognome || '') + ' ' + (v.nome || '') + ' ' + (v.codice_fiscale || '')).toLowerCase().includes(q)) return false;
    return !stato || (visitaStatoNorm(v) || 'VUOTO') === stato;
  }));
}

function renderVisite(data) {
  const list = document.getElementById('visiteList');
  if (!data.length) { list.innerHTML = '<div class="empty">Nessun volontario trovato.</div>'; return; }
  list.innerHTML = '<div class="card tbl db-wrap"><table class="db-table visite-tbl"><thead><tr>'
    + '<th>Cognome</th><th>Nome</th><th>Codice fiscale</th><th>Stato visita</th><th>Data visita</th><th>CDC 1°</th><th>CDC 2°</th>'
    + '</tr></thead><tbody>' + data.map(v => '<tr>'
      + '<td><b>' + aggEsc(v.cognome || '') + '</b></td><td>' + aggEsc(v.nome || '') + '</td><td>' + aggEsc(v.codice_fiscale || '—') + '</td>'
      + '<td><select aria-label="Stato visita" onchange="cambiaVisitaCampo(' + v.id + ',\'stato_visita\',this.value)">' + visitaOpzioniHtml(visitaStatoNorm(v)) + '</select></td>'
      + '<td><input type="date" aria-label="Data visita" value="' + aggEsc(v.data_visita || '') + '" onchange="cambiaVisitaCampo(' + v.id + ',\'data_visita\',this.value)"></td>'
      + '<td><input type="checkbox" aria-label="CDC 1° Step"' + (v.cdc_1_step ? ' checked' : '') + ' onchange="cambiaVisitaCampo(' + v.id + ',\'cdc_1_step\',this.checked)"></td>'
      + '<td><input type="checkbox" aria-label="CDC 2° Step"' + (v.cdc_2_step ? ' checked' : '') + ' onchange="cambiaVisitaCampo(' + v.id + ',\'cdc_2_step\',this.checked)"></td>'
      + '</tr>').join('') + '</tbody></table></div>';
}

async function cambiaVisitaCampo(volId, campo, valore) {
  const v = visiteData.find(x => x.id === volId);
  if (!v) return;
  if (valore === '') valore = null;
  const err = document.getElementById('visiteErr');
  err.hidden = true;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + volId, {
      method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ [campo]: valore }),
    });
    if (!res.ok) throw new Error('errore');
    v[campo] = valore;
    if (campo === 'stato_visita') renderDashboardVisite();
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
  ['SCADENZA',     'In scadenza',  r => !!svStatoScadenza(r.scadenza)],
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
  const res = await fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome,squadra,stato&order=cognome,nome', { headers: H });
  if (!res.ok) throw new Error('errore');
  fzVolontari = await res.json();
}

async function caricaFormazione() {
  const list = document.getElementById('fzList');
  if (!list) return;
  document.getElementById('fzBtnNuovo').hidden = !fzPuoScrivere();
  list.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const [res] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/formazione_registro?select=*&order=data_corso.desc.nullslast,id.desc', { headers: H }),
      fzCaricaVolontari(),
    ]);
    if (!res.ok) throw new Error('errore');
    fzRighe = await res.json();
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

function fzPillOrigine(r) {
  if (!r.origine) return '<span class="pill p-grey">Pregresso</span>';
  return r.origine === 'INTERNO' ? '<span class="pill p-blue">Interno</span>' : '<span class="pill p-sand">Esterno</span>';
}
function fzCellaScadenza(r) {
  const st = svStatoScadenza(r.scadenza);
  return st ? svPillScadenza(st) : (r.scadenza ? '<span class="sub">' + svData(r.scadenza) + '</span>' : '<span class="sub">—</span>');
}
function fzDettaglio(r) {
  return [r.tipo === 'ABILITAZIONE' ? 'Abilitazione' : '', r.ente, r.ore ? r.ore + ' h' : ''].filter(Boolean).map(aggEsc).join(' · ');
}

// Un blocco per corso: quelli fissi per codice, gli altri per titolo. Si apre sui partecipanti.
function fzRaggruppa(righe) {
  const gruppi = new Map();
  righe.forEach(r => {
    const k = r.codice || r.titolo.trim().toLowerCase();
    if (!gruppi.has(k)) gruppi.set(k, { k, titolo: r.titolo, tipo: r.tipo, codice: r.codice, righe: [] });
    gruppi.get(k).righe.push(r);
  });
  const fissi = Object.keys(FZ_CORSI_FISSI);
  const pos = g => g.codice ? fissi.indexOf(g.codice) : fissi.length;
  return [...gruppi.values()].sort((a, b) => pos(a) - pos(b) || a.titolo.localeCompare(b.titolo, 'it'));
}

function fzGruppoHtml(g, i, aperto, scrive) {
  const date = g.righe.map(r => r.data_corso).filter(Boolean).sort();
  const scad = g.righe.filter(r => svStatoScadenza(r.scadenza)).length;
  const info = [g.tipo === 'ABILITAZIONE' ? 'Abilitazione' : 'Corso', g.righe.length + (g.righe.length === 1 ? ' volontario' : ' volontari'),
    date.length ? 'ultimo il ' + svData(date[date.length - 1]) : ''].filter(Boolean).join(' · ');
  const righe = g.righe.slice().sort((a, b) => (b.data_corso || '').localeCompare(a.data_corso || '') || fzNomeVol(a.volontario_id).localeCompare(fzNomeVol(b.volontario_id), 'it'));
  return '<div class="card fz-gruppo"><div class="fz-gruppo-h"><button class="fz-gruppo-t" aria-expanded="' + aperto + '" onclick="fzApriGruppo(' + i + ')">'
    + '<span class="pst-chev" aria-hidden="true">' + (aperto ? '▾' : '▸') + '</span><span class="mid"><b>' + aggEsc(g.titolo) + '</b><span class="sub">' + info + '</span></span>'
    + (scad ? '<span class="pill p-yellow">' + scad + ' in scadenza</span>' : '') + '</button>'
    + (scrive ? '<button class="btn sm" onclick="fzApriForm(null,null,' + i + ')">Aggiungi</button>' : '') + '</div>'
    + (aperto ? '<div class="fz-gruppo-b"><div class="fz-row ihead"><span>Data</span><span>Volontario</span><span>Ente o docente</span><span>Origine</span><span>Scadenza</span></div>'
      + righe.map(r => '<div class="fz-row' + (scrive ? ' clk" onclick="fzApriForm(' + r.id + ')' : '') + '">'
        + '<span>' + (svData(r.data_corso) || '—') + '</span>'
        + '<b>' + aggEsc(fzNomeVol(r.volontario_id)) + '</b>'
        + '<span class="sub minw0">' + aggEsc([r.ente, r.ore ? r.ore + ' h' : ''].filter(Boolean).join(' · ') || '—') + '</span>'
        + '<span>' + fzPillOrigine(r) + '</span>'
        + '<span>' + fzCellaScadenza(r) + '</span></div>').join('') + '</div>' : '') + '</div>';
}

function fzRenderLista() {
  const list = document.getElementById('fzList');
  const q = document.getElementById('fzSearch').value.toLowerCase().trim();
  const filtro = FZ_FILTRI.find(f => f[0] === fzFiltro)[2];
  const righe = fzRighe.filter(r => filtro(r) && (!q || (fzNomeVol(r.volontario_id) + ' ' + r.titolo + ' ' + (r.ente || '')).toLowerCase().includes(q)));
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
function fzCatalogoHtml(codice) {
  return Object.keys(FZ_CORSI_FISSI).map(k => '<option value="' + k + '"' + (codice === k ? ' selected' : '') + '>' + FZ_CORSI_FISSI[k].titolo + '</option>').join('')
    + '<option value=""' + (codice ? '' : ' selected') + '>Altro corso o abilitazione</option>';
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
  fzForm = { id: id || null, volFisso: r ? r.volontario_id : (volFisso || null), scelti: new Set() };
  const titoli = [...new Set(fzRighe.filter(x => !x.codice).map(x => x.titolo))];
  const opz = (val, lab, cor) => '<option value="' + val + '"' + (cor === val ? ' selected' : '') + '>' + lab + '</option>';
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Registro formazione"><div class="shead"><h2>' + (id ? 'Modifica registrazione' : 'Registra corso') + '</h2>'
    + '<button class="x" onclick="fzChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="fzErr"></div>'
    + (fzForm.volFisso ? '<div class="kv"><span>Volontario</span><b>' + aggEsc(fzNomeVol(fzForm.volFisso)) + '</b></div>'
      : '<label>Volontari<input type="search" id="fzVolCerca" placeholder="Cerca per cognome o squadra" autocomplete="off" oninput="fzRenderPicker()"></label>'
        + '<div class="fz-picker" id="fzPicker"></div><span class="sub" id="fzSceltiN"></span>')
    + '<label>Corso<select id="fzCodice" onchange="fzAggiornaCatalogo()">' + fzCatalogoHtml(base ? base.codice : '') + '</select></label>'
    + '<div id="fzLibero"><div class="row2"><label>Titolo<input id="fzTitolo" list="fzTitoli" value="' + aggEsc(base && !base.codice ? base.titolo : '') + '"><datalist id="fzTitoli">' + titoli.map(t => '<option value="' + aggEsc(t) + '">').join('') + '</datalist></label>'
    + '<label>Tipo<select id="fzTipo">' + opz('CORSO', 'Corso', base ? base.tipo : 'CORSO') + opz('ABILITAZIONE', 'Abilitazione', base ? base.tipo : '') + '</select></label></div></div>'
    + '<div class="row2"><label>Origine<select id="fzOrigine">' + opz('INTERNO', 'Interno (nostro)', r ? r.origine : 'INTERNO') + opz('ESTERNO', 'Esterno', r ? r.origine : '') + '</select></label>'
    + '<label>Ente o docente<input id="fzEnte" value="' + aggEsc(r ? r.ente || '' : '') + '"></label></div>'
    + '<div class="row2"><label>Data<input type="date" id="fzData" value="' + aggEsc(r ? r.data_corso || '' : '') + '"></label>'
    + '<label>Scadenza (se prevista)<input type="date" id="fzScadenza" value="' + aggEsc(r ? r.scadenza || '' : '') + '"></label></div>'
    + '<label>Ore<input type="number" id="fzOre" min="0" step="0.5" value="' + aggEsc(r && r.ore != null ? r.ore : '') + '"></label>'
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
  const codice = val('fzCodice');
  const vol = fzForm.volFisso ? [fzForm.volFisso] : [...fzForm.scelti];
  const titolo = codice ? FZ_CORSI_FISSI[codice].titolo : val('fzTitolo');
  const dati = {
    codice, titolo, tipo: codice ? 'CORSO' : val('fzTipo'), origine: val('fzOrigine'), ente: val('fzEnte'),
    data_corso: val('fzData'), scadenza: val('fzScadenza'), ore: val('fzOre'), note: val('fzNote'),
  };
  if (!vol.length) return fzErrore('Scegli almeno un volontario.');
  if (!titolo) return fzErrore('Indica il titolo del corso.');
  if (!dati.data_corso) return fzErrore('Indica la data.');
  if (dati.scadenza && dati.scadenza < dati.data_corso) return fzErrore('La scadenza non può essere prima della data.');
  const btn = document.getElementById('fzSalvaBtn');
  btn.disabled = true;
  const prima = fzForm.id ? fzRighe.find(x => x.id === fzForm.id) : null;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/formazione_registro' + (prima ? '?id=eq.' + prima.id : ''), {
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

async function fzElimina() {
  const r = fzRighe.find(x => x.id === fzForm.id);
  if (!r || !confirm('Eliminare "' + r.titolo + '" di ' + fzNomeVol(r.volontario_id) + '?')) return;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/formazione_registro?id=eq.' + r.id, { method: 'DELETE', headers: H });
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
  const res = await fetch(SUPA_URL + '/rest/v1/formazione_registro?select=volontario_id,codice,scadenza&volontario_id=in.(' + vol.join(',') + ')&codice=in.(' + codici.map(c => '"' + c + '"').join(',') + ')', { headers: H });
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
    const r = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + id, {
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
    const res = await fetch(SUPA_URL + '/rest/v1/formazione_registro?select=*&volontario_id=eq.' + id + '&order=data_corso.desc.nullslast,id.desc', { headers: H });
    if (!res.ok) throw new Error('errore');
    righe = await res.json();
  } catch(e) { box.innerHTML = '<p class="note m0 mb10">Registro non disponibile.</p>'; return; }
  if (!sv || sv.id !== id) return;
  righe.forEach(r => { if (!fzRighe.some(x => x.id === r.id)) fzRighe.push(r); else fzRighe[fzRighe.findIndex(x => x.id === r.id)] = r; });
  const scrive = fzPuoScrivere();
  box.innerHTML = (fzRigheHtml(righe, scrive) || '<p class="note m0 mb10">Nessun corso registrato.</p>')
    + (scrive ? '<button class="doc-add-btn" onclick="fzApriForm(null,' + id + ')">+ Registra corso o abilitazione</button>' : '');
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
    const res = await fetch(SUPA_URL + '/rest/v1/formazione_registro?select=*&volontario_id=eq.' + volId + '&order=data_corso.desc.nullslast,id.desc', { headers: H });
    if (!res.ok) throw new Error('errore');
    const righe = await res.json();
    box.innerHTML = '<h2>Corsi e abilitazioni</h2>' + (fzRigheHtml(righe, false) || '<p class="note">Nessun corso registrato.</p>');
    box.hidden = false;
  } catch(e) { /* registro non ancora attivo: la scheda resta com'era */ }
}
