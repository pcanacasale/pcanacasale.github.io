// ============================================================
// GENERATORE CONVOCAZIONI — voce di menu in Strumenti. Prefisso funzioni: cv*
// ============================================================
// Il PDF si crea nel browser con pdf-lib, l'anteprima con pdf.js (epCaricaLibrerie di
// editor-pdf.js) e non viene salvato: nello storico vanno solo i campi del form.
// Liste e storico passano dalla funzione SQL conv_api (supabase/convocazioni.sql), che
// ricontrolla le credenziali: permessi convocazioni (vede) e convocazioni_gestione.
// ============================================================

const CV_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const CV_GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const CV_PREDEFINITI = {
  oggetto: 'Convocazione Commissione di Unità',
  destinatari: 'Commissione di Unità', llss: true,
  ora: '21:15', durata: 2,
  luogo: 'Centro Operativo Comunale di Occimiano, Piazza Carlo Alberto 1',
  intro: 'Viene convocata presso il {luogo}, per il giorno',
  dopoData: 'la riunione della Commissione di Unità di Protezione Civile A.N.A. della Sezione di Casale Monferrato.',
  chiusura: 'Confidando nella tua presenza per il necessario confronto di idee e di proposte, invio cordiali saluti alpini.',
  firmatario: 'Federico Bechis', ruolo: 'Il Coordinatore Sezionale',
};
const CV_CAMPI = ['oggetto', 'dataLettera', 'destinatari', 'dataEvento', 'ora', 'durata', 'luogo', 'intro', 'dopoData', 'chiusura', 'firmatario', 'ruolo'];
const CV_INTESTAZIONE = [
  ['ASSOCIAZIONE NAZIONALE ALPINI – SEZIONE DI CASALE MONFERRATO', 14, true],
  ["MEDAGLIA D'ORO AL M.C. DELLA CITTÀ DI CASALE MONFERRATO", 10.5, true],
  ["UNITA' DI PROTEZIONE CIVILE ANA", 16.5, true],
  ['Via T. De Cristoforis 16 - 15033 - CASALE MONFERRATO', 12, false],
  ['Presidente: Gian Luigi Ravera Cell. 3394159256 email presidente.casale@ana.it', 11.5, false],
  ['Coordinatore: Federico Bechis Cell. 3382479991 email pc.casale@ana.it', 11.5, false],
];

let cvOdg = [];
let cvListe = [];
let cvRecenti = [];
let cvListaAperta = null;
let cvId = null;            // convocazione riaperta: il salvataggio la aggiorna
let cvUltimoSalvato = '';   // evita doppioni se si scarica e poi si apre il calendario
let cvTimer = null;
let cvGiro = 0;             // scarta le anteprime superate
let cvVolontari = [];
let cvIniziato = false;

function cvGestisce() { return hasPerm('convocazioni_gestione'); }
function cvEl(id) { return document.getElementById(id); }

async function cvApi(azione, dati) {
  const res = await fetch(SUPA_URL + '/rest/v1/rpc/conv_api', {
    method: 'POST', headers: HJ,
    body: JSON.stringify({ p_username: sessionStorage.getItem('ar_user'), p_password: sessionStorage.getItem('ar_pass'), p_azione: azione, p_dati: dati || {} }),
  });
  if (!res.ok) throw new Error('Archivio non disponibile. Se è la prima apertura, va eseguito supabase/convocazioni.sql.');
  const r = await res.json();
  if (r && r.errore) throw new Error(r.errore === 'non_autorizzato' ? 'Non hai il permesso per questa operazione.' : 'Operazione non riuscita.');
  return r;
}

// -- APERTURA --
function cvOggiIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function caricaConvocazioni() {
  if (!cvIniziato) { cvIniziato = true; cvNuova(); }
  cvEl('cvCampi').disabled = !cvGestisce();
  document.body.classList.toggle('cv-solo-vede', !cvGestisce());
  cvMostraTab('modulo');
  cvCaricaDati();
}

function cvMostraTab(tab) {
  document.querySelectorAll('#cvTabs .chip').forEach(c => c.classList.toggle('on', c.dataset.tab === tab));
  cvEl('cvModulo').hidden = tab !== 'modulo';
  cvEl('cvListe').hidden = tab !== 'liste';
  if (tab === 'liste') cvRenderListe();
}

async function cvCaricaDati() {
  const avviso = cvEl('cvAvviso');
  avviso.hidden = true;
  try {
    const [l, c] = await Promise.all([cvApi('liste'), cvApi('convocazioni')]);
    cvListe = l.liste; cvRecenti = c.convocazioni;
    cvRenderSceltaLista();
    cvRenderRecenti();
    cvRenderListe();
  } catch(e) {
    avviso.textContent = e.message + ' Il PDF si può comunque creare e scaricare.';
    avviso.hidden = false;
    cvEl('cvRecenti').innerHTML = '';
  }
}

// -- MODULO --
function cvNuova() {
  cvScriviForm(Object.assign({}, CV_PREDEFINITI, { dataLettera: cvOggiIso(), dataEvento: '', odg: [''], listaId: '' }));
  cvId = null; cvUltimoSalvato = '';
}

function cvScriviForm(d) {
  CV_CAMPI.forEach(k => { cvEl('cv_' + k).value = d[k] != null ? d[k] : ''; });
  cvEl('cv_llss').checked = !!d.llss;
  cvEl('cvLista').value = d.listaId || '';
  cvOdg = (d.odg && d.odg.length ? d.odg : ['']).slice();
  cvRenderOdg();
  cvAggiorna();
}

function cvLeggiForm() {
  const d = {};
  CV_CAMPI.forEach(k => { d[k] = cvEl('cv_' + k).value; });
  d.llss = cvEl('cv_llss').checked;
  d.listaId = cvEl('cvLista').value;
  d.odg = cvOdg.map(v => v.trim()).filter(Boolean);
  return d;
}

function cvRenderOdg() {
  const scrive = cvGestisce();
  cvEl('cvOdg').innerHTML = cvOdg.map((v, i) => '<div class="cv-odg"><span class="cv-odg-n">' + (i + 1) + '.</span>'
    + '<input aria-label="Punto ' + (i + 1) + '" value="' + aggEsc(v) + '" oninput="cvOdg[' + i + ']=this.value;cvAggiorna()">'
    + (scrive ? '<button class="btn sm" aria-label="Sposta su"' + (i ? '' : ' disabled') + ' onclick="cvSpostaOdg(' + i + ',-1)">↑</button>'
      + '<button class="btn sm" aria-label="Sposta giù"' + (i < cvOdg.length - 1 ? '' : ' disabled') + ' onclick="cvSpostaOdg(' + i + ',1)">↓</button>'
      + '<button class="btn sm danger" aria-label="Rimuovi" onclick="cvTogliOdg(' + i + ')">✕</button>' : '') + '</div>').join('');
}
function cvAggiungiOdg() {
  cvOdg.push('');
  cvRenderOdg();
  cvEl('cvOdg').querySelector('.cv-odg:last-child input').focus();
}
function cvTogliOdg(i) { cvOdg.splice(i, 1); if (!cvOdg.length) cvOdg = ['']; cvRenderOdg(); cvAggiorna(); }
function cvSpostaOdg(i, passo) {
  const j = i + passo;
  [cvOdg[i], cvOdg[j]] = [cvOdg[j], cvOdg[i]];
  cvRenderOdg(); cvAggiorna();
}

function cvRenderSceltaLista() {
  const sel = cvEl('cvLista'), val = sel.value;
  sel.innerHTML = '<option value="">Nessuna lista</option>' + cvListe.map(l => '<option value="' + l.id + '">' + aggEsc(l.nome) + ' (' + l.membri.length + ')</option>').join('');
  sel.value = cvListe.some(l => String(l.id) === val) ? val : '';
  cvInfoInvitati();
}

function cvInvitati() {
  const l = cvListe.find(x => String(x.id) === cvEl('cvLista').value);
  return l ? l.membri : [];
}
function cvInfoInvitati() {
  const m = cvInvitati(), senza = m.filter(x => !x.email).length;
  cvEl('cvInvitatiInfo').textContent = !cvEl('cvLista').value ? '' : (m.length - senza) + ' invitati con email'
    + (senza ? ' · ' + senza + ' senza email: non riceveranno l\'invito' : '');
}

// -- ANTEPRIMA --
function cvAggiorna() {
  clearTimeout(cvTimer);
  cvTimer = setTimeout(cvRenderAnteprima, 350);
}

async function cvRenderAnteprima() {
  const giro = ++cvGiro, box = cvEl('cvAnteprima');
  try {
    const bytes = await cvCreaPdf(cvLeggiForm());
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    const fogli = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pag = await pdf.getPage(n);
      const vp = pag.getViewport({ scale: 1.6 });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height; cv.setAttribute('aria-label', 'Anteprima pagina ' + n);
      await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      fogli.push(cv);
    }
    if (giro !== cvGiro) return;
    box.replaceChildren(...fogli);
  } catch(e) {
    if (giro === cvGiro) box.innerHTML = '<p class="bad">' + aggEsc(e.message || 'Anteprima non disponibile.') + '</p>';
  }
}

// -- PDF --
// Helvetica copre Latin-1: il resto diventa "?". Virgolette e trattini tipografici restano,
// perché arrivano spesso da Word e il font li ha.
function cvPulisci(s) {
  return String(s || '').replace(/\t/g, ' ').replace(/[^\n\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g, '?');
}
function cvDataLunga(iso) {
  if (!iso) return '';
  const [a, m, g] = iso.split('-').map(Number);
  return g + ' ' + CV_MESI[m - 1] + ' ' + a;
}
function cvDataGrande(iso) {
  if (!iso) return '';
  const [a, m, g] = iso.split('-').map(Number);
  return (CV_GIORNI[new Date(a, m - 1, g).getDay()] + ' ' + g + ' ' + CV_MESI[m - 1] + ' ' + a).toUpperCase();
}
function cvAndaCapo(testo, font, size, larg) {
  const righe = [];
  cvPulisci(testo).split('\n').forEach(par => {
    let riga = '';
    par.split(/ +/).forEach(p => {
      while (font.widthOfTextAtSize(p, size) > larg) { // parola più lunga della riga
        let n = p.length - 1;
        while (n > 1 && font.widthOfTextAtSize(p.slice(0, n), size) > larg) n--;
        if (riga) { righe.push({ t: riga }); riga = ''; }
        righe.push({ t: p.slice(0, n) });
        p = p.slice(n);
      }
      const prova = riga ? riga + ' ' + p : p;
      if (font.widthOfTextAtSize(prova, size) <= larg) riga = prova;
      else { righe.push({ t: riga, piena: true }); riga = p; }
    });
    righe.push({ t: riga });
  });
  return righe;
}

async function cvCreaPdf(d) {
  await epCaricaLibrerie();
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(cvPulisci(d.oggetto) || 'Convocazione');
  const nor = await doc.embedFont(StandardFonts.Helvetica);
  const gra = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 595.28, H = 841.89, M = 43, LARG = L - M * 2, NERO = rgb(0, 0, 0);
  let pag = doc.addPage([L, H]), y = H - 30;

  const spazio = alt => { if (y - alt < 40) { pag = doc.addPage([L, H]); y = H - 45; } };
  const scrivi = (t, x, sz, f) => pag.drawText(t, { x, y, size: sz, font: f, color: NERO });
  const centrato = (t, sz, f) => {
    while (f.widthOfTextAtSize(t, sz) > LARG && sz > 6) sz -= 0.25;
    spazio(sz);
    scrivi(t, (L - f.widthOfTextAtSize(t, sz)) / 2, sz, f);
  };
  const destra = (t, sz, f) => { spazio(sz); scrivi(t, L - M - f.widthOfTextAtSize(t, sz), sz, f); };
  const paragrafo = (t, sz, f, inter) => {
    cvAndaCapo(t, f, sz, LARG).forEach(r => {
      spazio(sz); y -= sz;
      const parole = r.t.split(' ');
      if (r.piena && parole.length > 1) { // giustificato come il modello, tranne l'ultima riga
        const extra = (LARG - f.widthOfTextAtSize(r.t, sz)) / (parole.length - 1);
        const sp = f.widthOfTextAtSize(' ', sz);
        let x = M;
        parole.forEach(p => { scrivi(p, x, sz, f); x += f.widthOfTextAtSize(p, sz) + sp + extra; });
      } else if (r.t) scrivi(r.t, M, sz, f);
      y -= inter - sz;
    });
  };

  // intestazione
  const loghi = await Promise.all(['conv-logo-ana', 'conv-logo-25anni', 'conv-logo-volontariato'].map(async n => {
    const res = await fetch('images/' + n + '.png');
    if (!res.ok) throw new Error('Logo non trovato.');
    return doc.embedPng(await res.arrayBuffer());
  }));
  const LATO = 68;
  [M, (L - LATO) / 2, L - M - LATO].forEach((x, i) => pag.drawImage(loghi[i], { x, y: y - LATO, width: LATO, height: LATO }));
  y -= LATO + 6;
  CV_INTESTAZIONE.forEach(([t, sz, bold]) => { y -= sz + 1.5; centrato(t, sz, bold ? gra : nor); });
  y -= 11;
  pag.drawLine({ start: { x: M + 18, y }, end: { x: L - M - 18, y }, thickness: 0.6, color: NERO });

  y -= 27;
  scrivi('Casale Monferrato, ' + cvDataLunga(d.dataLettera), M, 11, nor);
  y -= 32;
  const dest = cvPulisci(d.destinatari);
  const larDest = nor.widthOfTextAtSize(dest, 11);
  scrivi(dest, L - M - larDest, 11, nor);
  scrivi('A:', L - M - larDest - 7 - gra.widthOfTextAtSize('A:', 11), 11, gra);
  if (d.llss) { y -= 18; destra('LL.SS.', 11, gra); }
  y -= 22;
  paragrafo('Oggetto: ' + d.oggetto + (/[.!?]$/.test(d.oggetto.trim()) ? '' : '.'), 11, gra, 14);
  y -= 11;
  paragrafo(String(d.intro || '').split('{luogo}').join(d.luogo || ''), 11, nor, 18);
  y -= 22;
  const gr = cvPulisci(cvDataGrande(d.dataEvento));
  if (gr) { y -= 22; centrato(gr, 28, gra); y -= 19; }
  if (d.ora) { y -= 16; centrato('ORE ' + cvPulisci(d.ora), 16, gra); y -= 9; }
  y -= 10;
  paragrafo(d.dopoData, 11, nor, 14);
  y -= 16;
  if (d.odg.length) {
    paragrafo('ORDINE DEL GIORNO:', 11, gra, 14);
    y -= 7;
    d.odg.forEach((v, i) => {
      const num = (i + 1) + '. ', rientro = M + 4 + nor.widthOfTextAtSize('00. ', 11);
      cvAndaCapo(v, nor, 11, L - M - rientro).forEach((r, k) => {
        spazio(11); y -= 11;
        if (!k) scrivi(num, rientro - nor.widthOfTextAtSize(num, 11), 11, nor);
        scrivi(r.t, rientro, 11, nor);
        y -= 9;
      });
    });
    y -= 7;
  }
  paragrafo(d.chiusura, 11, nor, 18);
  y -= 22;
  spazio(100); // ruolo, nome e spazio firma restano insieme
  y -= 11;
  destra(cvPulisci(d.ruolo).toUpperCase(), 11, gra);
  y -= 16;
  destra(cvPulisci(d.firmatario), 11, nor);
  return doc.save();
}

function cvNomeFile(est) {
  const base = (cvLeggiForm().oggetto || 'Convocazione').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/ +/g, ' ');
  const data = cvEl('cv_dataEvento').value;
  return (base || 'Convocazione') + (data ? ' ' + data : '') + '.' + est;
}
function cvScaricaFile(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function cvEsito(msg, errore) {
  const el = cvEl('cvEsito');
  el.textContent = msg; el.className = errore ? 'bad' : 'note';
}
function cvControlla(serveData) {
  if (serveData && !cvEl('cv_dataEvento').value) { cvEsito('Indica la data dell\'evento.', true); return false; }
  cvEsito('');
  return true;
}

async function cvScaricaPdf() {
  if (!cvControlla(true)) return;
  const btn = cvEl('cvBtnPdf');
  btn.disabled = true;
  try {
    cvScaricaFile(new Blob([await cvCreaPdf(cvLeggiForm())], { type: 'application/pdf' }), cvNomeFile('pdf'));
    await cvSalvaStorico();
  } catch(e) { cvEsito(e.message || 'PDF non creato.', true); }
  btn.disabled = false;
}

// Il salvataggio non deve mai bloccare PDF o calendario
async function cvSalvaStorico() {
  if (!cvGestisce()) return;
  const dati = cvLeggiForm(), firma = JSON.stringify(dati);
  if (firma === cvUltimoSalvato) return;
  try {
    const r = await cvApi('conv_salva', { id: cvId, dati, lista_id: dati.listaId || null });
    cvId = r.id; cvUltimoSalvato = firma;
    cvEsito('Salvata in Convocazioni recenti.');
    const c = await cvApi('convocazioni');
    cvRecenti = c.convocazioni;
    cvRenderRecenti();
  } catch(e) { cvEsito('Non salvata nello storico: ' + e.message, true); }
}

// -- CALENDARIO --
// L'ora scritta è quella italiana: i calcoli restano in UTC per non dipendere dal fuso del browser
function cvOrari(d) {
  const [a, m, g] = d.dataEvento.split('-').map(Number);
  const [h, mi] = (d.ora || '09:00').split(':').map(Number);
  const ini = Date.UTC(a, m - 1, g, h, mi || 0);
  const fine = ini + (parseFloat(d.durata) || 2) * 3600000;
  const fmt = t => new Date(t).toISOString().slice(0, 19).replace(/[-:]/g, '');
  return { ini: fmt(ini), fine: fmt(fine) };
}
function cvTitolo(d) { return d.oggetto.trim() || 'Convocazione'; }
function cvDescrizione(d) {
  return (d.odg.length ? 'Ordine del giorno:\n' + d.odg.map((v, i) => (i + 1) + '. ' + v).join('\n') : '');
}

async function cvGoogleCalendar() {
  if (!cvControlla(true)) return;
  const d = cvLeggiForm(), o = cvOrari(d);
  const email = cvInvitati().map(m => m.email).filter(Boolean);
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(cvTitolo(d))
    + '&dates=' + o.ini + '/' + o.fine + '&ctz=Europe/Rome'
    + '&location=' + encodeURIComponent(d.luogo)
    + '&details=' + encodeURIComponent(cvDescrizione(d))
    + (email.length ? '&add=' + encodeURIComponent(email.join(',')) : '');
  window.open(url, '_blank', 'noopener');
  await cvSalvaStorico();
}

function cvIcsTesto(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function cvIcsRiga(riga) { // righe massimo 75 byte
  const cod = new TextEncoder(), out = [];
  let cur = '', byte = 0;
  for (const c of riga) {
    const n = cod.encode(c).length;
    if (byte + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; byte = 0; }
    cur += c; byte += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function cvCreaIcs(d, invitati) {
  const o = cvOrari(d);
  const adesso = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PC ANA Casale//Convocazioni//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE', 'BEGIN:VEVENT',
    'UID:' + o.ini + '-' + Math.random().toString(36).slice(2) + '@pcanacasale.com', 'DTSTAMP:' + adesso,
    'DTSTART;TZID=Europe/Rome:' + o.ini, 'DTEND;TZID=Europe/Rome:' + o.fine,
    'SUMMARY:' + cvIcsTesto(cvTitolo(d)), 'LOCATION:' + cvIcsTesto(d.luogo), 'DESCRIPTION:' + cvIcsTesto(cvDescrizione(d)),
  ].concat(invitati.filter(m => m.email).map(m => 'ATTENDEE;CN="' + String(m.nome || m.email).replace(/["\\;,:]/g, ' ') + '":mailto:' + m.email),
    ['END:VEVENT', 'END:VCALENDAR']).map(cvIcsRiga).join('\r\n') + '\r\n';
}
async function cvScaricaIcs() {
  if (!cvControlla(true)) return;
  cvScaricaFile(new Blob([cvCreaIcs(cvLeggiForm(), cvInvitati())], { type: 'text/calendar;charset=utf-8' }), cvNomeFile('ics'));
  await cvSalvaStorico();
}

// -- CONVOCAZIONI RECENTI --
function cvRenderRecenti() {
  const box = cvEl('cvRecenti');
  if (!cvRecenti.length) { box.innerHTML = '<p class="note m0">Nessuna convocazione salvata.</p>'; return; }
  const scrive = cvGestisce();
  box.innerHTML = cvRecenti.map(c => '<div class="lr"><div class="mid"><b>' + aggEsc(c.dati.oggetto || 'Convocazione') + '</b>'
    + '<span class="sub">' + [c.dati.dataEvento ? svData(c.dati.dataEvento) : '', c.creata_da ? 'di ' + c.creata_da : ''].filter(Boolean).map(aggEsc).join(' · ') + '</span></div>'
    + '<button class="btn sm" onclick="cvRiapri(' + c.id + ')">Riapri</button>'
    + (scrive ? '<button class="btn sm" onclick="cvDuplica(' + c.id + ')">Duplica</button><button class="btn sm danger" aria-label="Elimina" onclick="cvEliminaConv(' + c.id + ')">✕</button>' : '') + '</div>').join('');
}
function cvApri(id, copia) {
  const c = cvRecenti.find(x => x.id === id);
  if (!c) return;
  cvScriviForm(Object.assign({}, CV_PREDEFINITI, c.dati));
  cvId = copia ? null : c.id;
  cvUltimoSalvato = copia ? '' : JSON.stringify(cvLeggiForm());
  cvInfoInvitati();
  cvEsito(copia ? 'Copia pronta: verrà salvata come nuova convocazione.' : '');
  window.scrollTo(0, 0);
}
function cvRiapri(id) { cvApri(id, false); }
function cvDuplica(id) { cvApri(id, true); }
async function cvEliminaConv(id) {
  if (!confirm('Eliminare questa convocazione dallo storico?')) return;
  try {
    await cvApi('conv_elimina', { id });
    if (cvId === id) { cvId = null; cvUltimoSalvato = ''; }
    cvRecenti = cvRecenti.filter(c => c.id !== id);
    cvRenderRecenti();
  } catch(e) { alert(e.message); }
}

// -- LISTE DESTINATARI --
function cvRenderListe() {
  const box = cvEl('cvListeBox');
  const scrive = cvGestisce();
  cvEl('cvBtnNuovaLista').hidden = !scrive;
  if (!cvListe.length) { box.innerHTML = '<div class="empty">Nessuna lista.</div>'; return; }
  box.innerHTML = cvListe.map(l => {
    const aperta = cvListaAperta === l.id;
    return '<div class="card fz-gruppo"><div class="fz-gruppo-h"><button class="fz-gruppo-t" aria-expanded="' + aperta + '" onclick="cvApriLista(' + l.id + ')">'
      + '<span class="pst-chev" aria-hidden="true">' + (aperta ? '▾' : '▸') + '</span><span class="mid"><b>' + aggEsc(l.nome) + '</b><span class="sub">' + l.membri.length + ' membri</span></span></button>'
      + (scrive ? '<button class="btn sm" onclick="cvRinominaLista(' + l.id + ')">Rinomina</button><button class="btn sm danger" onclick="cvEliminaLista(' + l.id + ')">Elimina</button>' : '') + '</div>'
      + (aperta ? '<div class="fz-gruppo-b cv-membri">' + (l.membri.map(m => '<div class="lr"><div class="mid"><b>' + aggEsc(m.nome || '—') + '</b><span class="sub">'
          + aggEsc(m.email || 'Senza email') + (m.volontario_id ? '' : ' · Esterno') + '</span></div>'
          + (scrive ? '<button class="btn sm danger" aria-label="Togli" onclick="cvTogliMembro(' + m.id + ')">✕</button>' : '') + '</div>').join('') || '<p class="note m0">Nessun membro.</p>')
        + (scrive ? '<div class="cv-agg"><label>Aggiungi volontario<input type="search" id="cvCercaVol" placeholder="Cerca per cognome o squadra" autocomplete="off" oninput="cvRenderCercaVol()"></label><div class="fz-picker" id="cvVolRisultati" hidden></div>'
          + '<div class="row2"><label>Esterno: nome<input id="cvEstNome"></label><label>Email<input type="email" id="cvEstEmail"></label></div>'
          + '<div class="actions"><button class="btn sm" onclick="cvAggiungiEsterno()">Aggiungi esterno</button></div></div>' : '') + '</div>' : '') + '</div>';
  }).join('');
}

async function cvApriLista(id) {
  cvListaAperta = cvListaAperta === id ? null : id;
  if (cvListaAperta && cvGestisce() && !cvVolontari.length) {
    try {
      const res = await fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome,squadra,email,stato&order=cognome,nome', { headers: H });
      if (res.ok) cvVolontari = (await res.json()).filter(v => v.stato !== 'DIMESSO');
    } catch(e) {}
  }
  cvRenderListe();
}

function cvRenderCercaVol() {
  const q = cvEl('cvCercaVol').value.toLowerCase().trim(), box = cvEl('cvVolRisultati');
  const l = cvListe.find(x => x.id === cvListaAperta);
  box.hidden = !q;
  if (!q) return;
  const gia = new Set(l.membri.map(m => m.volontario_id));
  const trovati = cvVolontari.filter(v => !gia.has(v.id) && (v.cognome + ' ' + v.nome + ' ' + (v.squadra || '')).toLowerCase().includes(q)).slice(0, 30);
  box.innerHTML = trovati.map(v => '<button class="cv-vol" onclick="cvAggiungiVol(' + v.id + ')"><b>' + aggEsc(v.cognome + ' ' + v.nome) + '</b><span class="sub inl">' + aggEsc(v.email || 'Senza email') + '</span></button>').join('')
    || '<p class="note m0">Nessun volontario trovato.</p>';
}

async function cvListaOp(azione, dati) {
  try {
    await cvApi(azione, dati);
    const l = await cvApi('liste');
    cvListe = l.liste;
    cvRenderSceltaLista();
    cvRenderListe();
  } catch(e) { alert(e.message); }
}
function cvNuovaLista() {
  const nome = prompt('Nome della nuova lista:');
  if (nome && nome.trim()) cvListaOp('lista_salva', { nome });
}
function cvRinominaLista(id) {
  const l = cvListe.find(x => x.id === id);
  const nome = prompt('Nuovo nome della lista:', l.nome);
  if (nome && nome.trim()) cvListaOp('lista_salva', { id, nome });
}
function cvEliminaLista(id) {
  const l = cvListe.find(x => x.id === id);
  if (!confirm('Eliminare la lista "' + l.nome + '"? Le convocazioni già salvate restano.')) return;
  if (cvListaAperta === id) cvListaAperta = null;
  cvListaOp('lista_elimina', { id });
}
function cvAggiungiVol(id) { cvListaOp('membro_aggiungi', { lista_id: cvListaAperta, volontario_id: id }); }
function cvTogliMembro(id) { cvListaOp('membro_togli', { id }); }
function cvAggiungiEsterno() {
  const nome = cvEl('cvEstNome').value.trim(), email = cvEl('cvEstEmail').value.trim();
  if (!nome) { alert('Indica il nome.'); return; }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Email non valida.'); return; }
  cvListaOp('membro_aggiungi', { lista_id: cvListaAperta, nome, email });
}

// -- LISTE IN "LA MIA SCHEDA" (sola lettura) --
async function cvRenderPersonale() {
  const box = cvEl('spListe');
  const cf = sessionStorage.getItem('ar_vol_cf'), data = sessionStorage.getItem('ar_vol_data');
  if (!box || !cf || !data) return;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/rpc/conv_mie_liste', { method: 'POST', headers: HJ, body: JSON.stringify({ p_cf: cf, p_data_nascita: data }) });
    if (!res.ok) throw new Error('errore');
    const r = await res.json();
    if (!r.liste || !r.liste.length) return;
    box.innerHTML = '<h2>Liste di convocazione</h2>' + r.liste.map(l => '<div class="lr"><div class="mid"><b>' + aggEsc(l.nome) + '</b>'
      + '<span class="sub">' + (l.membri || []).map(aggEsc).join(', ') + '</span></div></div>').join('');
    box.hidden = false;
  } catch(e) { /* liste non ancora attive: la scheda resta com'era */ }
}
