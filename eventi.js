// ============================================================
// STRUMENTI — pagina Eventi (esercitazioni ed emergenze), prefisso ev*, permesso eventi.
// ============================================================
// Tabelle: eventi, evento_volontari, evento_mezzi, evento_segnalazioni.
// Le foto stanno nel bucket privato eventi: in foto_path si salva "eventi/<evento>/<file>".
// I nomi arrivano da volontari_pubblici. Solo i presenti contano nei totali, nella stampa
// e nell'intervento creato a fine evento.
// ============================================================

const EV_TIPI = { EMERGENZA: 'Emergenza', ESERCITAZIONE: 'Esercitazione' };
const EV_STATI = { PIANIFICATO: ['Pianificato', 'p-sand'], 'IN CORSO': ['In corso', 'p-yellow'], CONCLUSO: ['Concluso', 'p-grey'] };
const EV_TAB = [['squadra', 'Squadra'], ['mezzi', 'Mezzi'], ['segnalazioni', 'Segnalazioni']];
const EV_FOTO_LATO = 1600, EV_FOTO_QUALITA = 0.8;

let evElenco = [];
let evFiltroTipo = '', evFiltroStato = '';
let evVolontari = [];      // volontari_pubblici, anche dimessi: servono i nomi degli eventi passati
let evCorrente = null;     // { e, squadra, mezzi, segn, tab, parco, parcoOk }
let evModificaId = null;

function evEl(id) { return document.getElementById(id); }
function evData(d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : ''; }
function evGiorno(d) { return d ? String(d).slice(0, 10) : ''; }
function evDate(e) { return evData(e.data_inizio) + (e.data_fine && evGiorno(e.data_fine) !== evGiorno(e.data_inizio) ? ' – ' + evData(e.data_fine) : ''); }
function evStatoPill(s) { const x = EV_STATI[s] || [s || '—', 'p-grey']; return '<span class="pill ' + x[1] + '">' + aggEsc(x[0]) + '</span>'; }
function evNomeVol(id) { const v = evVolontari.find(x => x.id === id); return v ? v.cognome + ' ' + v.nome : '—'; }
function evOre(r) { return Math.round(Number(r.ore) || 0); }
function evPresenti() { return evCorrente.squadra.filter(r => r.presente !== false); }
function evNonDisp() { return '<div class="empty">Non disponibile.</div>'; }

// Con le regole attive una scrittura negata può toccare 0 righe senza errore: si chiede la riga indietro
async function evScrivi(metodo, percorso, corpo) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/' + percorso, {
    method: metodo,
    headers: Object.assign({}, corpo === undefined ? H : HJ, { 'Prefer': 'return=representation' }),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const righe = res.ok ? await res.json() : [];
  if (!res.ok || !Array.isArray(righe) || !righe.length) { const e = new Error('Salvataggio non riuscito.'); e.status = res.status; throw e; }
  return righe;
}

async function evLeggi(percorso) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/' + percorso, { headers: H });
  sbOk(res);
  return res.json();
}

async function evCaricaVolontari() {
  if (!evVolontari.length) {
    try { evVolontari = await evLeggi('volontari_pubblici?select=id,cognome,nome,squadra,stato&order=cognome,nome'); } catch(e) { evVolontari = []; }
  }
}

// -- ELENCO --
async function caricaEventi() {
  const list = evEl('evList');
  if (!list) return;
  evEl('evBtnNuovo').hidden = false;
  list.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    evElenco = await evLeggi('eventi?select=*&order=data_inizio.desc,id.desc');
    evRenderChip();
    evRenderLista();
  } catch(e) {
    evEl('evBtnNuovo').hidden = true;
    evEl('evChips').innerHTML = '';
    evEl('evMostrati').textContent = '';
    list.innerHTML = evNonDisp();
  }
}

function evScegli(tipo, val) {
  if (tipo === 'tipo') evFiltroTipo = val; else evFiltroStato = val;
  evRenderChip();
  evRenderLista();
}

function evRenderChip() {
  const chip = (gruppo, val, lab, corrente) => '<button class="chip' + (corrente === val ? ' on' : '') + '" onclick="evScegli(\'' + gruppo + '\',\'' + val + '\')">' + lab + '</button>';
  evEl('evChips').innerHTML = chip('tipo', '', 'Tutti i tipi', evFiltroTipo)
    + Object.keys(EV_TIPI).map(k => chip('tipo', k, EV_TIPI[k], evFiltroTipo)).join('')
    + chip('stato', '', 'Tutti gli stati', evFiltroStato)
    + Object.keys(EV_STATI).map(k => chip('stato', k, EV_STATI[k][0], evFiltroStato)).join('');
}

function evRenderLista() {
  const q = (evEl('evSearch').value || '').toLowerCase().trim();
  const righe = evElenco.filter(e => (!evFiltroTipo || e.tipo === evFiltroTipo) && (!evFiltroStato || e.stato === evFiltroStato)
    && (!q || [e.titolo, e.luogo, e.note].some(t => (t || '').toLowerCase().includes(q))));
  evEl('evMostrati').textContent = righe.length + (righe.length === 1 ? ' evento' : ' eventi');
  evEl('evList').innerHTML = !righe.length ? '<div class="empty">Nessun evento.</div>'
    : '<div class="grid g3">' + righe.map(e => '<div class="card clk" onclick="evApri(' + e.id + ')">'
      + '<div class="int-pills m0">' + intTipoPill(e.tipo) + evStatoPill(e.stato) + '</div>'
      + '<h2 class="mt10">' + aggEsc(e.titolo) + '</h2>'
      + '<span class="sub">' + aggEsc([e.luogo, evDate(e)].filter(Boolean).join(' · ')) + '</span></div>').join('') + '</div>';
}

// -- NUOVO / MODIFICA --
function evApriForm(id) {
  const e = id ? evCorrente.e : null;
  evModificaId = id || null;
  const opz = (mappa, cor, lab) => Object.keys(mappa).map(k => '<option value="' + aggEsc(k) + '"' + (cor === k ? ' selected' : '') + '>' + aggEsc(lab(k)) + '</option>').join('');
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Evento"><div class="shead"><h2>' + (e ? 'Modifica evento' : 'Nuovo evento') + '</h2>'
    + '<button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="evErr"></div>'
    + '<div class="row2"><label>Tipo<select id="evTipo">' + opz(EV_TIPI, e ? e.tipo : 'ESERCITAZIONE', k => EV_TIPI[k]) + '</select></label>'
    + '<label>Stato<select id="evStato">' + opz(EV_STATI, e ? e.stato : 'PIANIFICATO', k => EV_STATI[k][0]) + '</select></label></div>'
    + '<label>Titolo<input id="evTitolo" value="' + aggEsc(e ? e.titolo : '') + '"></label>'
    + '<label>Luogo<input id="evLuogo" value="' + aggEsc(e ? e.luogo || '' : '') + '"></label>'
    + '<div class="row2"><label>Data inizio<input type="date" id="evInizio" value="' + aggEsc(e ? evGiorno(e.data_inizio) : '') + '"></label>'
    + '<label>Data fine<input type="date" id="evFine" value="' + aggEsc(e ? evGiorno(e.data_fine) : '') + '"></label></div>'
    + '<label>Note<textarea id="evNote" rows="2">' + aggEsc(e ? e.note || '' : '') + '</textarea></label>'
    + '<label>Link Google Maps (facoltativo)<input id="evMaps" placeholder="https://www.google.com/maps/…" oninput="evDaLink()"></label>'
    + '<div class="row2"><label>Latitudine<input type="number" step="any" id="evLat" value="' + aggEsc(e && e.lat != null ? e.lat : '') + '"></label>'
    + '<label>Longitudine<input type="number" step="any" id="evLon" value="' + aggEsc(e && e.lon != null ? e.lon : '') + '"></label></div>'
    + '<div class="actions"><button class="btn" onclick="evChiudiForm()">Annulla</button><button class="btn pri" id="evSalvaBtn" onclick="evSalva()">Salva</button></div></div></div>';
  ov.hidden = false;
}

function evChiudiForm() {
  const ov = evEl('evFormOv');
  ov.hidden = true; ov.innerHTML = ''; evModificaId = null;
}

// Riconosce @lat,lon  ?q=lat,lon  !3dlat!4dlon; i link brevi non contengono le coordinate
function evCoordDaLink(testo) {
  const t = decodeURIComponent(String(testo || ''));
  const m = t.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/) || t.match(/[?&](?:q|ll|query)=(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/) || t.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

function evDaLink() {
  const c = evCoordDaLink(evEl('evMaps').value);
  if (c) { evEl('evLat').value = c.lat; evEl('evLon').value = c.lon; }
}

function evCoordValide(lat, lon) {
  if (lat === '' && lon === '') return true;
  const a = Number(lat), o = Number(lon);
  return lat !== '' && lon !== '' && a >= -90 && a <= 90 && o >= -180 && o <= 180;
}

async function evSalva() {
  const err = evEl('evErr'), btn = evEl('evSalvaBtn');
  const titolo = evEl('evTitolo').value.trim(), inizio = evEl('evInizio').value, fine = evEl('evFine').value;
  const lat = evEl('evLat').value, lon = evEl('evLon').value, link = evEl('evMaps').value.trim();
  const errore = t => { err.textContent = t; err.style.display = 'block'; };
  if (!titolo || !inizio) return errore('Titolo e data di inizio sono obbligatori.');
  if (fine && fine < inizio) return errore('La data di fine è precedente all\'inizio.');
  if (link && !evCoordDaLink(link) && lat === '') return errore('Da questo link non si leggono le coordinate: inserisci latitudine e longitudine.');
  if (!evCoordValide(lat, lon)) return errore('Latitudine e longitudine non valide.');
  err.style.display = 'none';
  const corpo = {
    tipo: evEl('evTipo').value, stato: evEl('evStato').value, titolo,
    luogo: evEl('evLuogo').value.trim() || null, data_inizio: inizio, data_fine: fine || null,
    note: evEl('evNote').value.trim() || null,
    lat: lat === '' ? null : Number(lat), lon: lon === '' ? null : Number(lon),
  };
  const id = evModificaId;
  btn.disabled = true;
  try {
    const [riga] = id ? await evScrivi('PATCH', 'eventi?id=eq.' + id, corpo) : await evScrivi('POST', 'eventi', corpo);
    await logAttivita((id ? 'ha modificato' : 'ha creato') + ' evento: ' + titolo);
    evChiudiForm();
    await caricaEventi();
    if (id) { evCorrente.e = riga; evRender(); } else evApri(riga.id);
  } catch(e) { btn.disabled = false; errore(e.message); }
}

async function evElimina() {
  const e = evCorrente.e;
  const extra = e.intervento_id ? ' L\'intervento già creato resta.' : '';
  if (!confirm('Eliminare l\'evento "' + e.titolo + '" con squadra, mezzi e segnalazioni? L\'operazione non si può annullare.' + extra)) return;
  const foto = evCorrente.segn.map(s => s.foto_path).filter(Boolean);
  try {
    await evEliminaRighe(e.id);
    await Promise.all(foto.map(sbEliminaFile));
    await logAttivita('ha eliminato evento: ' + e.titolo);
    evChiudi();
    caricaEventi();
  } catch(x) { sbAvviso('Eliminazione non riuscita.'); }
}

// Se le tabelle collegate non si cancellano da sole, il vincolo blocca (409): si tolgono prima loro
async function evEliminaRighe(id) {
  try { await evScrivi('DELETE', 'eventi?id=eq.' + id); }
  catch(e) {
    if (e.status !== 409) throw e;
    for (const t of ['evento_volontari', 'evento_mezzi', 'evento_segnalazioni']) {
      await sbFetch(SUPA_URL + '/rest/v1/' + t + '?evento_id=eq.' + id, { method: 'DELETE', headers: H });
    }
    await evScrivi('DELETE', 'eventi?id=eq.' + id);
  }
}

// -- DETTAGLIO --
async function evApri(id) {
  const ov = evEl('evOv');
  ov.innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Evento"><div class="shead"><h2>Evento</h2><button class="x" onclick="evChiudi()" aria-label="Chiudi">✕</button></div>'
    + '<div class="sbody"><div class="loading-msg">Caricamento…</div></div></div>';
  ov.hidden = false;
  evCorrente = null;
  try {
    const [righe, squadra, mezzi, segn] = await Promise.all([
      evLeggi('eventi?id=eq.' + id + '&select=*'),
      evLeggi('evento_volontari?evento_id=eq.' + id + '&select=*&order=id'),
      evLeggi('evento_mezzi?evento_id=eq.' + id + '&select=*&order=id'),
      evLeggi('evento_segnalazioni?evento_id=eq.' + id + '&select=*&order=creato_il.desc'),
      evCaricaVolontari(),
    ]);
    if (!righe[0]) throw new Error('Non disponibile.');
    await sbFirmaRighe(segn, 'foto_path');
    evCorrente = { e: righe[0], squadra, mezzi, segn, tab: 'squadra', parco: [], parcoOk: false };
    await evCaricaParco();
    evRender();
  } catch(e) {
    ov.querySelector('.sbody').innerHTML = evNonDisp();
  }
}

function evChiudi() {
  const ov = evEl('evOv');
  ov.hidden = true; ov.innerHTML = ''; evCorrente = null;
}

// Parco mezzi: se la lettura è negata la scheda mostra "Non disponibile", il resto funziona
async function evCaricaParco() {
  try { evCorrente.parco = await evLeggi('mezzi?select=id,automezzo,targa&order=automezzo'); evCorrente.parcoOk = true; }
  catch(e) { evCorrente.parco = []; evCorrente.parcoOk = false; }
}

function evRender() {
  const c = evCorrente, e = c.e;
  const mappa = e.lat != null && e.lon != null ? '<a class="btn sm" href="' + evLinkMappa(e) + '" target="_blank" rel="noopener">Vedi posizione</a>' : '';
  evEl('evOv').innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="' + aggEsc(e.titolo) + '">'
    + '<div class="shead"><h2>' + aggEsc(e.titolo) + '</h2><button class="x" onclick="evChiudi()" aria-label="Chiudi">✕</button></div>'
    + '<div class="sbody"><div class="int-pills m0">' + intTipoPill(e.tipo) + evStatoPill(e.stato) + '</div>'
    + '<p class="sub mt10">' + aggEsc([e.luogo, evDate(e)].filter(Boolean).join(' · ')) + '</p>'
    + (e.note ? '<p class="em-desc">' + aggEsc(e.note) + '</p>' : '')
    + '<div class="em-azioni">' + mappa
    + '<button class="btn sm" onclick="evApriForm(' + e.id + ')">Modifica</button>'
    + '<button class="btn sm" onclick="evStampa()">Stampa squadra</button>'
    + evAzioneIntervento()
    + '<button class="btn sm danger" onclick="evElimina()">Elimina</button></div>'
    + '<div class="chips mt14" role="tablist">' + EV_TAB.map(t => '<button class="chip' + (c.tab === t[0] ? ' on' : '') + '" role="tab" onclick="evScheda(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>'
    + '<div class="mt14" id="evScheda"></div></div></div>';
  evRenderScheda();
}

function evLinkMappa(r) { return 'https://www.google.com/maps?q=' + encodeURIComponent(r.lat + ',' + r.lon); }
function evScheda(tab) { evCorrente.tab = tab; evRender(); }
function evRenderScheda() {
  ({ squadra: evRenderSquadra, mezzi: evRenderMezzi, segnalazioni: evRenderSegnalazioni })[evCorrente.tab]();
}

// -- SQUADRA --
function evRenderSquadra() {
  const s = evCorrente.squadra, presenti = evPresenti();
  const ore = presenti.reduce((t, r) => t + evOre(r), 0);
  evEl('evScheda').innerHTML = '<label class="search" for="evVolCerca"><input type="search" id="evVolCerca" placeholder="Aggiungi volontario: cerca per cognome o squadra" autocomplete="off" oninput="evRenderCercaVol()"></label>'
    + '<div id="evVolRisultati" class="mt6"></div>'
    + '<p class="sub mt10">' + presenti.length + ' presenti su ' + s.length + ' volontari · ' + ore + ' ore</p>'
    + (!s.length ? '<div class="empty">Nessun volontario in squadra.</div>' : s.map(r => '<div class="doc-item">'
      + '<div class="doc-item-info"><div class="doc-item-name">' + aggEsc(evNomeVol(r.volontario_id)) + '</div></div>'
      + '<input class="ev-ruolo" aria-label="Ruolo" placeholder="Ruolo" value="' + aggEsc(r.ruolo || '') + '" onchange="evAggiornaVol(' + r.id + ',{ruolo:this.value.trim()||null})">'
      + '<input class="ev-ore" type="number" min="0" step="1" aria-label="Ore" placeholder="Ore" value="' + aggEsc(r.ore != null ? evOre(r) : '') + '" onchange="evAggiornaVol(' + r.id + ',{ore:this.value===\'\'?null:Math.max(0,Math.round(Number(this.value)))})">'
      + '<label class="perm-check"><input type="checkbox"' + (r.presente !== false ? ' checked' : '') + ' onchange="evAggiornaVol(' + r.id + ',{presente:this.checked})"> Presente</label>'
      + '<button class="btn sm danger" aria-label="Togli" onclick="evTogliVol(' + r.id + ')">✕</button></div>').join(''));
}

function evRenderCercaVol() {
  const q = evEl('evVolCerca').value.toLowerCase().trim(), box = evEl('evVolRisultati');
  if (!q) { box.innerHTML = ''; return; }
  const presi = new Set(evCorrente.squadra.map(r => r.volontario_id));
  const trovati = evVolontari.filter(v => v.stato !== 'DIMESSO' && !presi.has(v.id) && (v.cognome + ' ' + v.nome + ' ' + (v.squadra || '')).toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = trovati.length ? trovati.map(v => '<div class="lr clk" onclick="evAggiungiVol(' + v.id + ')"><div class="mid"><b>' + aggEsc(v.cognome + ' ' + v.nome) + '</b><span class="sub">' + aggEsc(v.squadra || '') + '</span></div></div>').join('')
    : '<p class="note">Nessun volontario trovato.</p>';
}

async function evAggiungiVol(volId) {
  try {
    const [riga] = await evScrivi('POST', 'evento_volontari', { evento_id: evCorrente.e.id, volontario_id: volId, presente: true });
    evCorrente.squadra.push(riga);
    await logAttivita('ha aggiunto ' + evNomeVol(volId) + ' alla squadra dell\'evento: ' + evCorrente.e.titolo);
    evRenderSquadra();
  } catch(e) { sbAvviso('Volontario non aggiunto.'); }
}

async function evAggiornaVol(id, campi) {
  try {
    const [riga] = await evScrivi('PATCH', 'evento_volontari?id=eq.' + id, campi);
    const i = evCorrente.squadra.findIndex(r => r.id === id);
    if (i >= 0) evCorrente.squadra[i] = riga;
    await logAttivita('ha modificato la squadra dell\'evento: ' + evCorrente.e.titolo);
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  evRenderSquadra();
}

async function evTogliVol(id) {
  try {
    await evScrivi('DELETE', 'evento_volontari?id=eq.' + id);
    evCorrente.squadra = evCorrente.squadra.filter(r => r.id !== id);
    await logAttivita('ha tolto un volontario dalla squadra dell\'evento: ' + evCorrente.e.titolo);
    evRenderSquadra();
  } catch(e) { sbAvviso('Volontario non tolto.'); }
}

// -- MEZZI --
function evNomeMezzo(id) {
  const m = evCorrente.parco.find(x => x.id === id);
  return m ? m.automezzo + (m.targa ? ' · ' + m.targa : '') : 'Mezzo ' + id;
}

function evRenderMezzi() {
  const c = evCorrente;
  if (!c.parcoOk) { evEl('evScheda').innerHTML = evNonDisp(); return; }
  const presi = new Set(c.mezzi.map(r => r.mezzo_id));
  const liberi = c.parco.filter(m => !presi.has(m.id));
  evEl('evScheda').innerHTML = '<div class="bar"><select id="evMezzoSel" aria-label="Mezzo"><option value="">— scegli un mezzo —</option>'
    + liberi.map(m => '<option value="' + m.id + '">' + aggEsc(m.automezzo + (m.targa ? ' · ' + m.targa : '')) + '</option>').join('') + '</select>'
    + '<button class="btn pri" onclick="evAggiungiMezzo()">Aggiungi</button></div>'
    + (!c.mezzi.length ? '<div class="empty">Nessun mezzo assegnato.</div>' : c.mezzi.map(r => '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(evNomeMezzo(r.mezzo_id)) + '</div></div>'
      + '<button class="btn sm danger" aria-label="Togli" onclick="evTogliMezzo(' + r.id + ')">✕</button></div>').join(''));
}

async function evAggiungiMezzo() {
  const id = Number(evEl('evMezzoSel').value);
  if (!id) return;
  try {
    const [riga] = await evScrivi('POST', 'evento_mezzi', { evento_id: evCorrente.e.id, mezzo_id: id });
    evCorrente.mezzi.push(riga);
    await logAttivita('ha aggiunto ' + evNomeMezzo(id) + ' all\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
  } catch(e) { sbAvviso('Mezzo non aggiunto.'); }
}

async function evTogliMezzo(id) {
  try {
    await evScrivi('DELETE', 'evento_mezzi?id=eq.' + id);
    evCorrente.mezzi = evCorrente.mezzi.filter(r => r.id !== id);
    await logAttivita('ha tolto un mezzo dall\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
  } catch(e) { sbAvviso('Mezzo non tolto.'); }
}

// -- SEGNALAZIONI --
function evRenderSegnalazioni() {
  const opzVol = evVolontari.filter(v => v.stato !== 'DIMESSO').map(v => '<option value="' + v.id + '">' + aggEsc(v.cognome + ' ' + v.nome) + '</option>').join('');
  evEl('evScheda').innerHTML = '<div class="card form mb18"><h2>Nuova segnalazione</h2><div class="form-err" id="evSegErr"></div>'
    + '<label>Descrizione<textarea id="evSegTesto" rows="3"></textarea></label>'
    + '<label>Foto<input type="file" id="evSegFoto" accept="image/*"></label>'
    + '<div class="row2"><label>Latitudine<input type="number" step="any" id="evSegLat"></label><label>Longitudine<input type="number" step="any" id="evSegLon"></label></div>'
    + '<label>Volontario<select id="evSegVol"><option value="">— nessuno —</option>' + opzVol + '</select></label>'
    + '<div class="actions"><button class="btn pri" id="evSegBtn" onclick="evAggiungiSegnalazione()">Aggiungi</button></div></div>'
    + (!evCorrente.segn.length ? '<div class="empty">Nessuna segnalazione.</div>' : '<div class="grid g3">' + evCorrente.segn.map(evCardSegnalazione).join('') + '</div>');
}

function evCardSegnalazione(s) {
  const data = new Date(s.creato_il).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const stato = s.gestita ? '<span class="pill p-grey">Gestita</span>' : '<span class="pill p-yellow">Da gestire</span>';
  const foto = !s.foto_path ? ''
    : s._file ? '<a class="thumb em-foto" href="' + escapeHtmlNav(s._file) + '" target="_blank" rel="noopener" data-sb-file="' + escapeHtmlNav(s.foto_path) + '" data-sb-t="' + Date.now() + '"><img src="' + escapeHtmlNav(s._file) + '" alt="" onerror="this.remove()"></a>'
    : '<p class="sub mt10">File non disponibile</p>';
  return '<div class="card em-card"><div class="vc"><div class="mid"><b>' + aggEsc(s.volontario_id ? evNomeVol(s.volontario_id) : 'Segnalazione') + '</b><span class="sub">' + aggEsc(data) + '</span></div>' + stato + '</div>'
    + foto + (s.descrizione ? '<p class="em-desc">' + aggEsc(s.descrizione) + '</p>' : '')
    + '<div class="em-azioni">' + (s.lat != null && s.lon != null ? '<a href="' + evLinkMappa(s) + '" target="_blank" rel="noopener" class="btn sm">Vedi posizione</a>' : '')
    + (s.gestita ? '<button class="btn sm" onclick="evStatoSegnalazione(' + s.id + ',false)">Riapri</button>'
                 : '<button class="btn sm pri" onclick="evStatoSegnalazione(' + s.id + ',true)">Segna come gestita</button>')
    + '<button class="btn sm danger" onclick="evEliminaSegnalazione(' + s.id + ')">Elimina</button></div></div>';
}

// Max 1600 px sul lato lungo, JPEG 0.8. Se il browser non sa leggere il formato si ferma qui.
function evRiduciFoto(file) {
  return new Promise((risolvi, rifiuta) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scala = Math.min(1, EV_FOTO_LATO / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * scala);
      cv.height = Math.round(img.naturalHeight * scala);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => b ? risolvi(b) : rifiuta(new Error('Foto non leggibile.')), 'image/jpeg', EV_FOTO_QUALITA);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rifiuta(new Error('Foto non leggibile: usa un file JPEG o PNG.')); };
    img.src = url;
  });
}

async function evCaricaFoto(eventoId, file) {
  const blob = await evRiduciFoto(file);
  const path = eventoId + '/' + Date.now() + '.jpg';
  const res = await sbFetch(SUPA_URL + '/storage/v1/object/eventi/' + path, { method: 'POST', headers: { 'apikey': SUPA_KEY, 'Content-Type': 'image/jpeg' }, body: blob });
  if (!res.ok) throw new Error('Foto non caricata.');
  return sbPercorso('eventi', path);
}

async function evAggiungiSegnalazione() {
  const err = evEl('evSegErr'), btn = evEl('evSegBtn');
  const testo = evEl('evSegTesto').value.trim(), file = evEl('evSegFoto').files[0];
  const lat = evEl('evSegLat').value, lon = evEl('evSegLon').value, vol = evEl('evSegVol').value;
  const errore = t => { err.textContent = t; err.style.display = 'block'; };
  if (!testo && !file) return errore('Inserisci una descrizione o una foto.');
  if (!evCoordValide(lat, lon)) return errore('Latitudine e longitudine non valide.');
  err.style.display = 'none';
  btn.disabled = true;
  let foto = null;
  try {
    if (file) foto = await evCaricaFoto(evCorrente.e.id, file);
    const [riga] = await evScrivi('POST', 'evento_segnalazioni', {
      evento_id: evCorrente.e.id, descrizione: testo || null, foto_path: foto,
      lat: lat === '' ? null : Number(lat), lon: lon === '' ? null : Number(lon), volontario_id: vol ? Number(vol) : null,
    });
    await sbFirmaRighe([riga], 'foto_path');
    evCorrente.segn.unshift(riga);
    await logAttivita('ha aggiunto una segnalazione all\'evento: ' + evCorrente.e.titolo);
    evRenderSegnalazioni();
  } catch(e) {
    if (foto) sbEliminaFile(foto);   // niente file orfani se la riga non si salva
    btn.disabled = false;
    errore(e.message);
  }
}

async function evStatoSegnalazione(id, gestita) {
  try {
    const [riga] = await evScrivi('PATCH', 'evento_segnalazioni?id=eq.' + id, { gestita });
    const s = evCorrente.segn.find(x => x.id === id);
    if (s) s.gestita = riga.gestita;
    await logAttivita((gestita ? 'ha gestito' : 'ha riaperto') + ' una segnalazione dell\'evento: ' + evCorrente.e.titolo);
    evRenderSegnalazioni();
  } catch(e) { sbAvviso('Modifica non salvata.'); }
}

async function evEliminaSegnalazione(id) {
  if (!confirm('Eliminare questa segnalazione?')) return;
  const s = evCorrente.segn.find(x => x.id === id);
  try {
    await evScrivi('DELETE', 'evento_segnalazioni?id=eq.' + id);
    if (s && s.foto_path) await sbEliminaFile(s.foto_path);
    evCorrente.segn = evCorrente.segn.filter(x => x.id !== id);
    await logAttivita('ha eliminato una segnalazione dell\'evento: ' + evCorrente.e.titolo);
    evRenderSegnalazioni();
  } catch(e) { sbAvviso('Eliminazione non riuscita.'); }
}

// -- STAMPA --
function evStampa() {
  const e = evCorrente.e, righe = evPresenti();
  const finestra = window.open('', '_blank');
  if (!finestra) { sbAvviso('Il browser ha bloccato la finestra di stampa.'); return; }
  const totale = righe.reduce((t, r) => t + evOre(r), 0);
  finestra.document.write('<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Squadra - ' + aggEsc(e.titolo) + '</title><style>'
    + 'body{font:14px Arial,sans-serif;color:#000;margin:24px}h1{font-size:20px;margin:0 0 4px}p{margin:2px 0}'
    + 'table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #000;padding:6px 8px;text-align:left}th:last-child,td:last-child{text-align:right;width:70px}'
    + '</style></head><body><p>Protezione Civile ANA Casale Monferrato</p><h1>' + aggEsc(e.titolo) + '</h1>'
    + '<p>' + aggEsc([EV_TIPI[e.tipo] || e.tipo, e.luogo, evDate(e)].filter(Boolean).join(' · ')) + '</p>'
    + '<table><thead><tr><th>Nome</th><th>Ruolo</th><th>Ore</th></tr></thead><tbody>'
    + righe.map(r => '<tr><td>' + aggEsc(evNomeVol(r.volontario_id)) + '</td><td>' + aggEsc(r.ruolo || '') + '</td><td>' + evOre(r) + '</td></tr>').join('')
    + '</tbody><tfoot><tr><th colspan="2">Totale: ' + righe.length + ' volontari</th><th>' + totale + '</th></tr></tfoot></table></body></html>');
  finestra.document.close();
  finestra.focus();
  finestra.print();
}

// -- FINE EVENTO --
function evAzioneIntervento() {
  const e = evCorrente.e;
  if (e.intervento_id) {
    return hasPerm('interventi') ? '<button class="btn sm" onclick="evVaiIntervento(' + e.intervento_id + ')">Vai all\'intervento</button>' : '<span class="sub">Intervento creato</span>';
  }
  return e.stato === 'CONCLUSO' ? '<button class="btn sm pri" id="evBtnIntervento" onclick="evCreaIntervento()">Crea intervento</button>' : '';
}

function evVaiIntervento(id) {
  evChiudi();
  showPanel('interventi', null);
  apriDettaglioIntervento(id);
}

async function evCreaIntervento() {
  const e = evCorrente.e, righe = evPresenti();
  const nOre = righe.reduce((t, r) => t + evOre(r), 0);
  if (!confirm('Creare l\'intervento?\n\n' + e.titolo + '\n' + (EV_TIPI[e.tipo] || e.tipo) + ' · ' + evDate(e) + (e.luogo ? ' · ' + e.luogo : '')
    + '\nVolontari presenti: ' + righe.length + '\nOre totali: ' + nOre
    + '\n\nGli assenti non vengono inseriti. Dopo la creazione non si può ripetere.')) return;
  const btn = evEl('evBtnIntervento');
  btn.disabled = true;
  let intId = null;
  try {
    // Un altro utente può averlo appena creato
    const [ora] = await evLeggi('eventi?id=eq.' + e.id + '&select=intervento_id');
    if (!ora) throw new Error('Non disponibile.');
    if (ora.intervento_id) { e.intervento_id = ora.intervento_id; evRender(); return; }
    const [creato] = await evScrivi('POST', 'interventi', {
      evento: e.titolo, data: evGiorno(e.data_inizio), data_fine: evGiorno(e.data_fine) || null,
      tipo_attivita: e.tipo, luogo: e.luogo, n_volontari: righe.length, n_ore: nOre,
      volontari_ids: righe.map(r => r.volontario_id), utente: currentUser.nome,
    });
    intId = creato.id;
    if (righe.length) {
      await evScrivi('POST', 'intervento_volontari', righe.map(r => ({ intervento_id: intId, volontario_id: r.volontario_id, ore: evOre(r) || null })));
    }
    const [agg] = await evScrivi('PATCH', 'eventi?id=eq.' + e.id, { intervento_id: intId });
    evCorrente.e = agg;
    await logAttivita('ha creato l\'intervento dall\'evento: ' + e.titolo);
    evRender();
    caricaEventi();
  } catch(x) {
    if (intId) {   // niente interventi a metà: si annulla quanto già scritto
      await sbFetch(SUPA_URL + '/rest/v1/intervento_volontari?intervento_id=eq.' + intId, { method: 'DELETE', headers: H, silenzioso: true });
      await sbFetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + intId, { method: 'DELETE', headers: H, silenzioso: true });
    }
    btn.disabled = false;
    sbAvviso('Intervento non creato.');
  }
}
