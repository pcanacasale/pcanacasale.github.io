// ============================================================
// EDITOR PDF — voce di menu in Strumenti, permesso editor_pdf. Prefisso funzioni: ep*
// ============================================================
// Il PDF si modifica nel browser: sul server arrivano solo i modelli che l'utente
// sceglie di salvare e i PDF mandati in firma con link, sempre passando dalla
// Edge Function editor-pdf-firma (tabelle e bucket sono chiusi alla chiave anonima).
//
// Elementi: { id, tipo, pagina (da 1), x, y, larghezza, altezza, ... } in punti PDF, origine
// in alto a sinistra, sulla pagina COME SI VEDE. Tipi: testo, data, x, v, firma (png), campo_firma.
// ep.bytes è sempre il PDF originale: ogni export riparte da lì.
// ============================================================

const EP_URL = SUPA_URL + '/functions/v1/editor-pdf-firma';
const EP_MAX_MB = 20;
const EP_ERRORI = {
  non_autorizzato: 'Non hai il permesso oppure la sessione è scaduta: esci e rientra.',
  dati_mancanti: 'Mancano dei dati.',
  documento_non_trovato: 'Documento non trovato.',
  documento_chiuso: 'Il documento è già firmato o annullato.',
  pdf_mancante: 'Il PDF non è arrivato sul server: riprova.',
  campo_non_valido: 'Questo campo firma non esiste nel documento.',
  campo_gia_firmato: 'Questo campo è già stato firmato.',
  non_revocabile: 'Il link è già stato usato o revocato.',
  errore_interno: 'Errore del server: riprova tra qualche minuto.',
};
const EP_STATI = { in_firma: ['In firma', 'p-yellow'], firmato: ['Firmato', 'p-blue'], annullato: ['Annullato', 'p-grey'] };
const EP_MISURE = { testo: [180, 22], data: [90, 22], x: [18, 18], v: [18, 18], firma: [170, 64], campo_firma: [200, 64] };

let ep = null;         // PDF aperto nell'editor
let epTab = 'modelli';
let epPad = null;
let epDrag = null;     // trascinamento o ridimensionamento in corso
let epLibrerie = null;
let epDocs = [], epRichieste = [], epLinkCtx = null, epLinkUrl = null;

// -- SERVER --
async function epCall(azione, dati) {
  const username = sessionStorage.getItem('ar_user'), password = sessionStorage.getItem('ar_pass');
  let res;
  try {
    res = await fetch(EP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ azione, username, password }, dati || {})) });
  } catch(e) { throw new Error('Connessione assente: riprova.'); }
  let body = {};
  try { body = await res.json(); } catch(e) {}
  if (!res.ok) throw new Error(EP_ERRORI[body.errore] || 'Operazione non riuscita.');
  return body;
}
async function epCaricaFile(url, bytes) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  if (!res.ok) throw new Error('Caricamento del PDF non riuscito.');
}

function epScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Librerie PDF non raggiungibili: controlla la connessione.')); document.head.appendChild(s); });
}
function epCaricaLibrerie() {
  if (!epLibrerie) epLibrerie = Promise.all([
    epScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'),
    epScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'),
    epScript('https://cdn.jsdelivr.net/npm/signature_pad@4.2.0/dist/signature_pad.umd.min.js'),
  ]).then(() => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; })
    .catch(e => { epLibrerie = null; throw e; });
  return epLibrerie;
}

// -- PAGINA: MODELLI E FIRME --
// Base: compila i modelli e scarica. Completo (editor_pdf_completo): crea modelli e manda in firma.
// Stessa regola in editor-pdf-firma: qui nasconde soltanto i comandi.
function epCompleto() { return hasPerm('editor_pdf_completo'); }

function caricaEditorPdf() {
  document.body.classList.toggle('ep-base', !epCompleto());
  if (!epCompleto()) epTab = 'modelli';
  epMostraTab(epTab);
}

function epMostraTab(tab) {
  epTab = tab;
  document.querySelectorAll('#epTabs .chip').forEach(c => c.classList.toggle('on', c.dataset.tab === tab));
  if (tab === 'modelli') epCaricaModelli(); else epCaricaFirme();
}

async function epCaricaModelli() {
  const box = document.getElementById('epLista');
  box.innerHTML = '<p class="note">Caricamento…</p>';
  try {
    const { modelli } = await epCall('modelli_lista');
    window._epModelli = modelli;
    box.innerHTML = modelli.length ? '<div class="card">' + modelli.map(m => '<div class="lr"><div class="mid"><b>' + aggEsc(m.nome) + '</b>'
        + '<span class="sub">' + (m.elementi || []).length + ' elementi · ' + new Date(m.aggiornato_il).toLocaleDateString('it-IT') + '</span></div>'
        + '<button class="btn sm" onclick="epApriModello(\'' + m.id + '\')">Compila</button>'
        + '<button class="btn sm danger ep-completo" aria-label="Elimina modello" onclick="epEliminaModello(\'' + m.id + '\')">✕</button></div>').join('') + '</div>'
      : '<div class="empty">Nessun modello. Apri un PDF, prepara i campi e salvalo come modello.</div>';
  } catch(e) { box.innerHTML = '<p class="bad">' + aggEsc(e.message) + '</p>'; }
}

async function epEliminaModello(id) {
  const m = window._epModelli.find(x => x.id === id);
  if (!confirm('Eliminare il modello "' + m.nome + '"?')) return;
  try { await epCall('modello_elimina', { id }); epCaricaModelli(); } catch(e) { alert(e.message); }
}

async function epCaricaFirme() {
  const box = document.getElementById('epLista');
  box.innerHTML = '<p class="note">Caricamento…</p>';
  try {
    const r = await epCall('documenti_lista');
    epDocs = r.documenti; epRichieste = r.richieste;
    box.innerHTML = epDocs.length ? '<div class="ep-docs">' + epDocs.map(epCartaDoc).join('') + '</div>'
      : '<div class="empty">Nessun PDF in firma. Aggiungi un campo "Firma a distanza" nell\'editor e usa "Invia in firma".</div>';
  } catch(e) { box.innerHTML = '<p class="bad">' + aggEsc(e.message) + '</p>'; }
}

function epCartaDoc(d) {
  const st = EP_STATI[d.stato] || EP_STATI.in_firma;
  const fatti = d.firme_completate || [];
  const campi = (d.campi || []).map(c => {
    const firmato = fatti.includes(c.id);
    const attiva = epRichieste.find(r => r.documento_id === d.id && r.campo_id === c.id && !r.usato_il && !r.revocato_il && new Date(r.scade_il) > new Date());
    const usata = epRichieste.find(r => r.documento_id === d.id && r.campo_id === c.id && r.usato_il);
    let info = 'Da inviare', az = '';
    if (firmato) info = 'Firmato' + (usata ? ' da ' + usata.firmatario_nome : '');
    else if (attiva) info = 'Link a ' + attiva.firmatario_nome + ', scade il ' + new Date(attiva.scade_il).toLocaleDateString('it-IT') + (attiva.aperto_il ? ' (aperto)' : '');
    if (!firmato && d.stato === 'in_firma') {
      az = '<button class="btn sm" onclick="epApriLink(\'' + d.id + '\',\'' + aggEsc(c.id) + '\')">' + (attiva ? 'Nuovo link' : 'Crea link') + '</button>'
        + (attiva ? '<button class="btn sm" onclick="epRevoca(\'' + attiva.id + '\')">Revoca</button>' : '');
    }
    return '<div class="lr"><div class="mid"><b>' + aggEsc(c.nome) + '</b><span class="sub">' + aggEsc(info) + '</span></div>' + az + '</div>';
  }).join('');
  return '<div class="card"><div class="vc"><div class="mid"><b>' + aggEsc(d.titolo) + '</b><span class="sub">' + new Date(d.creato_il).toLocaleDateString('it-IT')
    + (d.creato_da_nome ? ' · ' + aggEsc(d.creato_da_nome) : '') + '</span></div><span class="pill ' + st[1] + '">' + st[0] + '</span></div>' + campi
    + '<div class="ep-doc-az"><button class="btn sm" onclick="epApriDoc(\'' + d.id + '\')">Apri</button><button class="btn sm" onclick="epApriDoc(\'' + d.id + '\',true)">Scarica</button>'
    + (d.stato === 'in_firma' ? '<button class="btn sm" onclick="epAnnullaDoc(\'' + d.id + '\')">Annulla</button>' : '')
    + '<button class="btn sm danger" onclick="epEliminaDoc(\'' + d.id + '\')">Elimina</button></div></div>';
}

async function epApriDoc(id, scarica) {
  const f = window.open('', '_blank');
  try { const { url } = await epCall('documento_url', { documento_id: id, scarica: !!scarica }); f.location = url; }
  catch(e) { f.close(); alert(e.message); }
}
async function epAnnullaDoc(id) {
  const motivo = prompt('Motivo dell\'annullamento (i link smettono di funzionare):');
  if (!motivo || !motivo.trim()) return;
  try { await epCall('documento_annulla', { documento_id: id, motivo }); epCaricaFirme(); } catch(e) { alert(e.message); }
}
async function epEliminaDoc(id) {
  const d = epDocs.find(x => x.id === id);
  let motivo = '';
  if (d.stato === 'firmato') {
    if (!confirm('Il documento è firmato: scarica prima una copia se ti serve.\n\nEliminarlo definitivamente? Restano solo le prove della firma.')) return;
    motivo = prompt('Motivo dell\'eliminazione (obbligatorio):') || '';
    if (!motivo.trim()) return;
  } else if (!confirm('Eliminare definitivamente "' + d.titolo + '"?')) return;
  try { await epCall('documento_elimina', { documento_id: id, motivo }); epCaricaFirme(); } catch(e) { alert(e.message); }
}
async function epRevoca(id) {
  if (!confirm('Revocare questo link?')) return;
  try { await epCall('revoca', { richiesta_id: id }); epCaricaFirme(); } catch(e) { alert(e.message); }
}

// -- LINK DI FIRMA --
function epApriLink(documentoId, campoId) {
  epLinkCtx = { documentoId, campoId };
  document.getElementById('epLinkNome').value = '';
  document.getElementById('epLinkContatto').value = '';
  document.getElementById('epLinkOre').value = '48';
  document.getElementById('epLinkErr').hidden = true;
  document.getElementById('epLinkForm').hidden = false;
  document.getElementById('epLinkFatto').hidden = true;
  document.getElementById('epLinkOverlay').classList.add('open');
}
function epChiudiLink() {
  document.getElementById('epLinkOverlay').classList.remove('open');
  epLinkUrl = null;
  if (epTab === 'firme') epCaricaFirme();
}
async function epCreaLink() {
  const nome = document.getElementById('epLinkNome').value.trim();
  const err = document.getElementById('epLinkErr');
  err.hidden = true;
  if (!nome) { err.textContent = 'Scrivi il nome di chi deve firmare.'; err.hidden = false; return; }
  try {
    const r = await epCall('crea', { documento_id: epLinkCtx.documentoId, campo_id: epLinkCtx.campoId, firmatario_nome: nome,
      firmatario_contatto: document.getElementById('epLinkContatto').value.trim() || null, ore_validita: Number(document.getElementById('epLinkOre').value) });
    const doc = epDocs.find(d => d.id === epLinkCtx.documentoId);
    const scade = new Date(r.scade_il);
    epLinkUrl = { url: r.link, nome, testo: 'Ciao ' + nome + ', ti chiediamo di firmare "' + (doc ? doc.titolo : 'un documento') + '". Apri il link entro il '
      + scade.toLocaleDateString('it-IT') + ' alle ' + scade.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ': ' + r.link };
    document.getElementById('epLinkUrl').value = r.link;
    document.getElementById('epLinkForm').hidden = true;
    document.getElementById('epLinkFatto').hidden = false;
  } catch(e) { err.textContent = e.message; err.hidden = false; }
}
async function epLinkCopia(btn) {
  try { await navigator.clipboard.writeText(epLinkUrl.url); btn.textContent = 'Copiato'; }
  catch(e) { document.getElementById('epLinkUrl').select(); }
}
function epLinkWhatsApp() { window.open('https://wa.me/?text=' + encodeURIComponent(epLinkUrl.testo), '_blank'); }
function epLinkEmail() { location.href = 'mailto:?subject=' + encodeURIComponent('Documento da firmare') + '&body=' + encodeURIComponent(epLinkUrl.testo); }
async function epLinkCondividi() {
  if (navigator.share) { try { await navigator.share({ text: epLinkUrl.testo }); } catch(e) {} }
  else epLinkCopia(document.getElementById('epLinkCopiaBtn'));
}

// -- APERTURA DEL PDF --
async function epFileScelto(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { alert('Scegli un file PDF.'); return; }
  if (file.size > EP_MAX_MB * 1024 * 1024) { alert('Il PDF supera i ' + EP_MAX_MB + ' MB.'); return; }
  await epApri(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.pdf$/i, ''), null);
}

async function epApriModello(id) {
  const m = window._epModelli.find(x => x.id === id);
  try {
    const { url } = await epCall('modello_url', { id });
    const res = await fetch(url);
    if (!res.ok) throw new Error('PDF del modello non trovato.');
    await epApri(new Uint8Array(await res.arrayBuffer()), m.nome, m);
  } catch(e) { alert(e.message); }
}

async function epApri(bytes, nome, modello) {
  try {
    await epCaricaLibrerie();
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    ep = { bytes, pdf, nome, modelloId: modello ? modello.id : null, el: [], pagine: [], indietro: [], avanti: [], sel: null, armato: null, modificato: false, chiesto: !!modello, zoom: 1 };
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      ep.pagine.push({ pg, rot: modello && modello.pagine && modello.pagine[i - 1] ? modello.pagine[i - 1].rotazione || 0 : 0 });
    }
    if (modello) ep.el = JSON.parse(JSON.stringify(modello.elementi || []));
  } catch(e) {
    alert(/password/i.test(e.name + e.message) ? 'Il PDF è protetto da password: non si può aprire.' : (e.message && e.message.includes('Librerie') ? e.message : 'Il file non è un PDF leggibile.'));
    return;
  }
  document.getElementById('epNome').textContent = nome;
  document.getElementById('epEditor').hidden = false;
  document.body.classList.add('sv-open');
  epDisegnaTutto();
  epAggiornaBarra();
}

function epChiudi() {
  if (ep && ep.modificato && !confirm('Chiudere senza scaricare le modifiche?')) return;
  document.getElementById('epEditor').hidden = true;
  document.body.classList.remove('sv-open');
  document.getElementById('epPagine').innerHTML = '';
  ep = null;
  caricaEditorPdf();
}

// -- DISEGNO DELLE PAGINE --
function epVista(p, scala) { return p.pg.getViewport({ scale: scala || 1, rotation: (p.pg.rotate + p.rot) % 360 }); }

function epDisegnaTutto() {
  const box = document.getElementById('epPagine');
  box.style.setProperty('--z', ep.zoom);
  box.innerHTML = ep.pagine.map((p, i) => '<section class="ep-pag"><div class="ep-pag-h"><span class="sub">Pagina ' + (i + 1) + ' di ' + ep.pagine.length + '</span>'
    + '<button class="btn sm" onclick="epGira(' + i + ')">Gira pagina</button></div>'
    + '<div class="ep-foglio" id="epFoglio' + i + '" data-i="' + i + '"><canvas></canvas><div class="ep-strato"></div></div></section>').join('');
  const ro = new ResizeObserver(voci => voci.forEach(v => epScala(v.target)));
  ep.pagine.forEach((p, i) => {
    const f = document.getElementById('epFoglio' + i);
    f.addEventListener('pointerdown', epPuntaFoglio);
    ro.observe(f);
    epDisegnaFondo(i);
  });
  epDisegnaElementi();
}

function epScala(f) {
  if (!ep) return;
  const v = epVista(ep.pagine[Number(f.dataset.i)]);
  f.style.setProperty('--s', f.clientWidth / v.width);
}

async function epDisegnaFondo(i) {
  const p = ep.pagine[i];
  const f = document.getElementById('epFoglio' + i);
  const v1 = epVista(p);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = epVista(p, Math.min(2.5, (Math.max(f.clientWidth, 600) * dpr) / v1.width));
  const cv = f.querySelector('canvas');
  cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
  f.style.aspectRatio = v1.width + ' / ' + v1.height;
  epScala(f);
  await p.pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
}

function epDataIt(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }

function epContenuto(o) {
  if (o.tipo === 'testo') return '<span class="ep-t">' + (aggEsc(o.valore) || '<i>Testo</i>') + '</span>';
  if (o.tipo === 'data') return '<span class="ep-t">' + (epDataIt(o.valore) || '<i>Data</i>') + '</span>';
  if (o.tipo === 'firma') return '<img src="' + o.png + '" alt="Firma">';
  if (o.tipo === 'campo_firma') return '<span class="ep-c">' + aggEsc(o.nome) + '</span>';
  return '<img src="' + epSegno(o.tipo) + '" alt="' + (o.tipo === 'x' ? 'X' : 'Spunta') + '">';
}

function epDisegnaElementi() {
  ep.pagine.forEach((p, i) => {
    const f = document.getElementById('epFoglio' + i);
    const v = epVista(p);
    f.querySelector('.ep-strato').innerHTML = ep.el.filter(o => o.pagina === i + 1).map(o =>
      '<div class="ep-el ep-' + o.tipo + (ep.sel === o.id ? ' on' : '') + '" data-id="' + o.id + '" style="left:' + (o.x / v.width * 100) + '%;top:' + (o.y / v.height * 100) + '%;width:' + (o.larghezza / v.width * 100) + '%;height:' + (o.altezza / v.height * 100) + '%;--d:' + (o.dimensione || 12) + '">'
      + epContenuto(o) + (ep.sel === o.id ? '<span class="ep-h" aria-hidden="true"></span>' : '') + '</div>').join('');
  });
}

// -- STRUMENTI --
function epArma(tipo, extra) {
  if (ep.armato && ep.armato.tipo === tipo && !extra) ep.armato = null;
  else ep.armato = Object.assign({ tipo }, extra || {});
  epSeleziona(null);
  epAggiornaBarra();
}
function epNuovoId() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function epPuntaFoglio(ev) {
  const f = ev.currentTarget, i = Number(f.dataset.i);
  const rect = f.getBoundingClientRect();
  const v = epVista(ep.pagine[i]);
  const s = rect.width / v.width;
  const elem = ev.target.closest('.ep-el');
  if (!ep.armato) {
    if (!elem) { epSeleziona(null); return; }
    const o = ep.el.find(x => x.id === elem.dataset.id);
    if (ep.sel !== o.id) epSeleziona(o.id);
    ev.preventDefault();
    const quale = document.querySelector('.ep-el[data-id="' + o.id + '"]');
    quale.setPointerCapture(ev.pointerId);
    epDrag = { o, f, v, s, x0: ev.clientX, y0: ev.clientY, ox: o.x, oy: o.y, ow: o.larghezza, oh: o.altezza, ridim: ev.target.classList.contains('ep-h'), mosso: false, foto: epFoto() };
    quale.addEventListener('pointermove', epMuovi);
    quale.addEventListener('pointerup', epFine);
    quale.addEventListener('pointercancel', epFine);
    return;
  }
  ev.preventDefault();
  const a = ep.armato;
  const m = a.misure || EP_MISURE[a.tipo];
  const px = (ev.clientX - rect.left) / s, py = (ev.clientY - rect.top) / s;
  epRegistra();
  const o = { id: epNuovoId(), tipo: a.tipo, pagina: i + 1, larghezza: m[0], altezza: m[1],
    x: Math.max(0, Math.min(v.width - m[0], px - m[0] / 2)), y: Math.max(0, Math.min(v.height - m[1], py - m[1] / 2)) };
  if (a.tipo === 'testo') { o.valore = ''; o.dimensione = 12; }
  if (a.tipo === 'data') { o.valore = new Date().toISOString().slice(0, 10); o.dimensione = 12; }
  if (a.tipo === 'firma') o.png = a.png;
  if (a.tipo === 'campo_firma') o.nome = 'Firma ' + (ep.el.filter(x => x.tipo === 'campo_firma').length + 1);
  ep.el.push(o);
  ep.armato = null;
  epModificato();
  epSeleziona(o.id);
  const campo = document.getElementById('epValore');
  if (campo && !campo.hidden) campo.focus();
}

function epMuovi(ev) {
  const d = epDrag;
  if (!d) return;
  const dx = (ev.clientX - d.x0) / d.s, dy = (ev.clientY - d.y0) / d.s;
  if (Math.abs(dx) + Math.abs(dy) > 1) d.mosso = true;
  if (d.ridim) {
    d.o.larghezza = Math.max(10, Math.min(d.v.width - d.o.x, d.ow + dx));
    d.o.altezza = Math.max(10, Math.min(d.v.height - d.o.y, d.oh + dy));
  } else {
    d.o.x = Math.max(0, Math.min(d.v.width - d.o.larghezza, d.ox + dx));
    d.o.y = Math.max(0, Math.min(d.v.height - d.o.altezza, d.oy + dy));
  }
  const n = ev.currentTarget;
  n.style.left = (d.o.x / d.v.width * 100) + '%'; n.style.top = (d.o.y / d.v.height * 100) + '%';
  n.style.width = (d.o.larghezza / d.v.width * 100) + '%'; n.style.height = (d.o.altezza / d.v.height * 100) + '%';
}
function epFine() {
  const d = epDrag;
  epDrag = null;
  if (d && d.mosso) { ep.indietro.push(d.foto); ep.avanti = []; epModificato(); }
  epDisegnaElementi();
}

function epSeleziona(id) {
  ep.sel = id;
  epDisegnaElementi();
  const o = ep.el.find(x => x.id === id);
  const bar = document.getElementById('epProp');
  bar.hidden = !o;
  if (!o) return;
  const scritto = o.tipo === 'testo' || o.tipo === 'campo_firma';
  const val = document.getElementById('epValore'), dat = document.getElementById('epValoreData');
  val.hidden = !scritto; dat.hidden = o.tipo !== 'data';
  document.getElementById('epDimensioni').hidden = !(o.tipo === 'testo' || o.tipo === 'data');
  if (scritto) { val.value = o.tipo === 'testo' ? o.valore : o.nome; val.placeholder = o.tipo === 'testo' ? 'Scrivi il testo (vuoto = da compilare)' : 'Nome di chi firma, es. Ricevente'; }
  if (o.tipo === 'data') dat.value = o.valore || '';
}
function epSelezionato() { return ep.el.find(x => x.id === ep.sel); }

function epCambiaValore(v) {
  const o = epSelezionato();
  if (!o) return;
  if (o.tipo === 'campo_firma') o.nome = v; else o.valore = v;
  epModificato();
  document.querySelector('.ep-el[data-id="' + o.id + '"]').innerHTML = epContenuto(o) + '<span class="ep-h" aria-hidden="true"></span>';
}
function epDimensione(delta) {
  const o = epSelezionato();
  if (!o) return;
  epRegistra();
  o.dimensione = Math.max(6, Math.min(48, (o.dimensione || 12) + delta));
  epModificato(); epDisegnaElementi();
}
function epDuplica() {
  const o = epSelezionato();
  if (!o) return;
  epRegistra();
  const c = Object.assign({}, o, { id: epNuovoId(), x: o.x + 12, y: o.y + 12 });
  ep.el.push(c);
  epModificato(); epSeleziona(c.id);
}
function epElimina() {
  const o = epSelezionato();
  if (!o) return;
  epRegistra();
  ep.el = ep.el.filter(x => x !== o);
  epModificato(); epSeleziona(null);
}

// Gli elementi seguono la pagina: il centro ruota di 90° in senso orario, le misure restano
function epGira(i) {
  const p = ep.pagine[i];
  const v = epVista(p);
  epRegistra();
  ep.el.filter(o => o.pagina === i + 1).forEach(o => {
    const cx = o.x + o.larghezza / 2, cy = o.y + o.altezza / 2;
    o.x = Math.max(0, Math.min(v.height - o.larghezza, v.height - cy - o.larghezza / 2));
    o.y = Math.max(0, Math.min(v.width - o.altezza, cx - o.altezza / 2));
  });
  p.rot = (p.rot + 90) % 360;
  epModificato();
  epDisegnaFondo(i).then(epDisegnaElementi);
  epDisegnaElementi();
}

function epZoom(delta) {
  ep.zoom = Math.max(0.6, Math.min(2.5, ep.zoom + delta));
  document.getElementById('epPagine').style.setProperty('--z', ep.zoom);
}

// -- ANNULLA / RIPETI --
function epFoto() { return JSON.stringify({ el: ep.el, rot: ep.pagine.map(p => p.rot) }); }
function epRegistra() { ep.indietro.push(epFoto()); ep.avanti = []; }
function epRipristina(foto) {
  const f = JSON.parse(foto);
  ep.el = f.el;
  f.rot.forEach((r, i) => { if (ep.pagine[i].rot !== r) { ep.pagine[i].rot = r; epDisegnaFondo(i); } });
  epSeleziona(null);
  epAggiornaBarra();
}
function epAnnulla() { if (ep.indietro.length) { ep.avanti.push(epFoto()); epRipristina(ep.indietro.pop()); } }
function epRipeti() { if (ep.avanti.length) { ep.indietro.push(epFoto()); epRipristina(ep.avanti.pop()); } }
function epModificato() { ep.modificato = true; epAggiornaBarra(); }

function epAggiornaBarra() {
  document.querySelectorAll('#epTools .chip').forEach(c => c.classList.toggle('on', !!ep.armato && ep.armato.tipo === c.dataset.tipo));
  document.getElementById('epAvviso').hidden = !ep.armato;
  document.getElementById('epBtnAnnulla').disabled = !ep.indietro.length;
  document.getElementById('epBtnRipeti').disabled = !ep.avanti.length;
  document.getElementById('epBtnInvia').disabled = !ep.el.some(o => o.tipo === 'campo_firma');
}

// -- FIRMA E SEGNI --
function epInchiostro() { return getComputedStyle(document.documentElement).getPropertyValue('--inchiostro').trim(); }

const epSegniPng = {};
function epSegno(tipo) {
  if (epSegniPng[tipo]) return epSegniPng[tipo];
  const c = document.createElement('canvas'); c.width = c.height = 120;
  const x = c.getContext('2d');
  x.strokeStyle = epInchiostro(); x.lineWidth = 14; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath();
  if (tipo === 'x') { x.moveTo(18, 18); x.lineTo(102, 102); x.moveTo(102, 18); x.lineTo(18, 102); }
  else { x.moveTo(14, 66); x.lineTo(46, 100); x.lineTo(106, 22); }
  x.stroke();
  return epSegniPng[tipo] = c.toDataURL('image/png');
}

function epApriFirma() {
  document.getElementById('epFirmaOverlay').classList.add('open');
  document.getElementById('epFirmaErr').hidden = true;
  const cv = document.getElementById('epPad');
  if (!epPad) epPad = new SignaturePad(cv, { penColor: epInchiostro(), minWidth: 0.8, maxWidth: 2.6 });
  const r = Math.max(window.devicePixelRatio || 1, 1);
  cv.width = cv.offsetWidth * r; cv.height = cv.offsetHeight * r; cv.getContext('2d').scale(r, r);
  epPad.clear();
}
function epChiudiFirma() { document.getElementById('epFirmaOverlay').classList.remove('open'); }
function epPadCancella() { epPad.clear(); }

// Taglia i bordi vuoti; restituisce PNG e proporzioni
function epRitaglia(cv) {
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return { png: o.toDataURL('image/png'), r: o.width / o.height };
}
function epUsaFirma(f) {
  epChiudiFirma();
  const larg = Math.min(200, Math.max(70, 64 * f.r));
  epArma('firma', { png: f.png, misure: [larg, larg / f.r] });
}
function epConfermaFirma() {
  const f = epPad.isEmpty() ? null : epRitaglia(document.getElementById('epPad'));
  if (!f) { const e = document.getElementById('epFirmaErr'); e.textContent = 'Firma nel riquadro oppure carica un\'immagine.'; e.hidden = false; return; }
  epUsaFirma(f);
}
function epFirmaImmagine(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0; // sfondo bianco trasparente
    x.putImageData(id, 0, 0);
    URL.revokeObjectURL(img.src);
    const f = epRitaglia(c);
    if (f) epUsaFirma(f);
  };
  img.onerror = () => alert('Immagine non leggibile.');
  img.src = URL.createObjectURL(file);
}

// -- GENERAZIONE DEL PDF --
// Stessa conversione della Edge Function (firma-pdf.ts): dalla pagina vista allo spazio pdf-lib
function epPunto(dx, dy, l, a, rotazione) {
  const r = ((rotazione % 360) + 360) % 360;
  if (r === 90) return { x: dy, y: dx, angolo: 90 };
  if (r === 180) return { x: l - dx, y: dy, angolo: 180 };
  if (r === 270) return { x: l - dy, y: a - dx, angolo: 270 };
  return { x: dx, y: a - dy, angolo: 0 };
}
function epTestoSicuro(s) { return String(s).replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'); }

function epRighe(testo, font, dim, larg) {
  const righe = [];
  String(testo).split('\n').forEach(par => {
    let riga = '';
    epTestoSicuro(par).split(' ').forEach(p => {
      const prova = riga ? riga + ' ' + p : p;
      if (riga && font.widthOfTextAtSize(prova, dim) > larg) { righe.push(riga); riga = p; } else riga = prova;
    });
    righe.push(riga);
  });
  return righe;
}

async function epGenera() {
  const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib;
  const doc = await PDFDocument.load(ep.bytes.slice(), { ignoreEncryption: true });
  try { doc.getForm().flatten(); } catch(e) {}
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pagine = doc.getPages();
  for (let i = 0; i < pagine.length; i++) {
    const pag = pagine[i];
    const rot = (pag.getRotation().angle + ep.pagine[i].rot) % 360;
    pag.setRotation(degrees(rot));
    const { width: l, height: a } = pag.getSize();
    for (const o of ep.el.filter(x => x.pagina === i + 1)) {
      if (o.tipo === 'campo_firma') continue; // resta vuoto: lo riempie la firma a distanza
      if (o.tipo === 'testo' || o.tipo === 'data') {
        const testo = o.tipo === 'data' ? epDataIt(o.valore) : o.valore;
        if (!testo) continue;
        const dim = o.dimensione || 12;
        epRighe(testo, font, dim, o.larghezza).forEach((r, n) => {
          const p = epPunto(o.x, o.y + dim * (n + 1) * 1.15 - dim * 0.15, l, a, rot);
          pag.drawText(r, { x: p.x, y: p.y, size: dim, font, color: rgb(0, 0, 0), rotate: degrees(p.angolo) });
        });
        continue;
      }
      const img = await doc.embedPng(o.tipo === 'firma' ? o.png : epSegno(o.tipo));
      const k = Math.min(o.larghezza / img.width, o.altezza / img.height);
      const w = img.width * k, h = img.height * k;
      const p = epPunto(o.x + (o.larghezza - w) / 2, o.y + o.altezza - (o.altezza - h) / 2, l, a, rot);
      pag.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(p.angolo) });
    }
  }
  return await doc.save();
}

async function epBlob() {
  return new Blob([await epGenera()], { type: 'application/pdf' });
}
async function epScarica() {
  try {
    const url = URL.createObjectURL(await epBlob());
    const a = document.createElement('a');
    a.href = url; a.download = ep.nome + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    ep.modificato = false;
    epChiediModello();
  } catch(e) { alert('PDF non generato: ' + e.message); }
}
async function epStampa() {
  try { window.open(URL.createObjectURL(await epBlob()), '_blank'); epChiediModello(); }
  catch(e) { alert('PDF non generato: ' + e.message); }
}

// -- "SALVARE COME MODELLO?" --
function epChiediModello() { if (!ep.chiesto) epApriModelloDialogo(); }
function epApriModelloDialogo() {
  ep.chiesto = true;
  document.getElementById('epModelloNome').value = ep.nome;
  document.getElementById('epModelloErr').hidden = true;
  document.getElementById('epModelloTitolo').textContent = ep.modelloId ? 'Aggiornare il modello?' : 'Salvare come modello?';
  document.getElementById('epModelloOverlay').classList.add('open');
}
function epChiudiModello() {
  document.getElementById('epModelloOverlay').classList.remove('open');
  const dopo = ep.dopoModello;
  ep.dopoModello = null;
  if (dopo) dopo();
}

// Le firme disegnate sono di una persona: nel modello non si salvano
async function epSalvaModello() {
  const nome = document.getElementById('epModelloNome').value.trim();
  const err = document.getElementById('epModelloErr');
  if (!nome) { err.textContent = 'Scrivi un nome.'; err.hidden = false; return; }
  const btn = document.getElementById('epModelloSalva');
  btn.disabled = true;
  err.hidden = true;
  const elementi = ep.el.filter(o => o.tipo !== 'firma');
  const pagine = ep.pagine.map(p => { const v = epVista(p); return { larghezza: v.width, altezza: v.height, rotazione: p.rot }; });
  try {
    if (ep.modelloId) await epCall('modello_salva', { id: ep.modelloId, nome, pagine, elementi });
    else {
      const r = await epCall('modello_nuovo', { nome, pagine, elementi });
      try { await epCaricaFile(r.upload_url, ep.bytes); }
      catch(e) { await epCall('modello_elimina', { id: r.id }).catch(() => {}); throw e; }
      ep.modelloId = r.id;
    }
    ep.nome = nome;
    document.getElementById('epNome').textContent = nome;
    epChiudiModello();
  } catch(e) { err.textContent = e.message; err.hidden = false; }
  btn.disabled = false;
}

// -- INVIA IN FIRMA --
async function epInvia() {
  const campi = ep.el.filter(o => o.tipo === 'campo_firma');
  if (!campi.length) return;
  const btn = document.getElementById('epBtnInvia');
  btn.disabled = true;
  try {
    const r = await epCall('documento_nuovo', { titolo: ep.nome, campi: campi.map(c => ({ id: c.id, nome: c.nome, pagina: c.pagina, x: c.x, y: c.y, larghezza: c.larghezza, altezza: c.altezza })) });
    await epCaricaFile(r.upload_url, await epGenera());
    await epCall('documento_conferma', { documento_id: r.documento_id });
    ep.modificato = false;
    const vai = () => {
      const titolo = ep.nome;
      epTab = 'firme';
      epChiudi();
      epDocs = [{ id: r.documento_id, titolo }];
      epApriLink(r.documento_id, campi[0].id);
    };
    if (ep.chiesto) vai();
    else { ep.dopoModello = vai; epApriModelloDialogo(); }
  } catch(e) { alert(e.message); btn.disabled = false; }
}
