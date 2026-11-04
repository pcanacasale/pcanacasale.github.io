// modulo-cartaceo.js — modulo cartaceo PDF "Aggiornamento dati volontario"
// (prefisso mc*, permesso aggiornamento_dati). Si stampa su carta intestata
// (margine alto 40 mm lasciato bianco), si compila a mano e si ricarica
// scansionato come documento MODULO_COMPILATO.
//
// Dati: agg-api 'get' (agg_volontari + agg_dpi_volontario + catalogo).
// Testo dell'informativa: informativa-testo.js (INFORMATIVA_PDF).
// Librerie: jsPDF + autotable (già caricati), JSZip solo per lo ZIP, su richiesta.
'use strict';

const MC_TOP = 40, MC_MARG = 15, MC_W = 210, MC_H = 297, MC_FOOT = 14;
const MC_CAMPI = ['cognome', 'nome', 'codice_fiscale', 'data_nascita', 'luogo_nascita', 'provincia_nascita',
  'indirizzo', 'civico', 'cap', 'citta', 'provincia', 'telefono', 'email',
  'titolo_studio', 'professione', 'patenti', 'tessera_ana'];
const MC_LABEL = {
  cognome: 'Cognome', nome: 'Nome', codice_fiscale: 'Codice fiscale', data_nascita: 'Data di nascita',
  luogo_nascita: 'Luogo di nascita', provincia_nascita: 'Prov. di nascita', indirizzo: 'Indirizzo',
  civico: 'Civico', cap: 'CAP', citta: 'Città', provincia: 'Provincia', telefono: 'Telefono', email: 'Email',
  titolo_studio: 'Titolo di studio', professione: 'Professione', patenti: 'Patenti', tessera_ana: 'Tessera ANA',
};

function mcData(iso) { if (!iso) return ''; const s = String(iso).slice(0, 10).split('-'); return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(iso); }
function mcNomeFile(v) {
  const p = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/'/g, '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  return p(v.cognome) + '_' + p(v.nome) + '_MODULO.pdf';
}
function mcCasella(doc, x, y, lato) { doc.setLineWidth(0.3); doc.rect(x, y, lato || 4.5, lato || 4.5); }

// Controlla che la pagina abbia ancora "serve" mm liberi, altrimenti ne apre una nuova.
function mcSpazio(doc, y, serve) {
  if (y + serve <= MC_H - MC_FOOT - 4) return y;
  doc.addPage();
  return MC_TOP;
}

// Testo a capo automatico; restituisce la nuova y (con cambio pagina se serve).
function mcParagrafo(doc, testo, y, opz) {
  opz = opz || {};
  doc.setFont('helvetica', opz.bold ? 'bold' : 'normal');
  doc.setFontSize(opz.size || 10);
  const righe = doc.splitTextToSize(testo, MC_W - 2 * MC_MARG);
  const h = (opz.size || 10) * 0.42;
  righe.forEach(r => { y = mcSpazio(doc, y, h); doc.text(r, MC_MARG, y + h * 0.8); y += h; });
  return y + (opz.dopo == null ? 2 : opz.dopo);
}

// data = risposta di agg-api 'get'. Restituisce il documento jsPDF.
function mcCreaPdf(data) {
  const v = data.volontario || {};
  const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const nome = ((v.cognome || '') + ' ' + (v.nome || '')).trim();
  const oggi = new Date().toLocaleDateString('it-IT');

  // ---------- Pagina 1: anagrafica ----------
  let y = MC_TOP;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Aggiornamento dati volontario – PC ANA Casale', MC_MARG, y + 5);
  doc.setFontSize(12); doc.text(nome || '—', MC_MARG, y + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Modulo generato il ' + oggi, MC_W - MC_MARG, y + 12, { align: 'right' });
  y = mcParagrafo(doc, 'Controlla i dati. Se un dato è giusto barra la casella "Invariato"; se è sbagliato o manca scrivi quello corretto in "Nuovo valore", in stampatello.', y + 18, { dopo: 1 });

  doc.autoTable({
    startY: y, margin: { left: MC_MARG, right: MC_MARG, top: MC_TOP, bottom: MC_FOOT + 4 },
    head: [['Campo', 'Dato attuale', 'Nuovo valore', 'Invariato']],
    body: MC_CAMPI.map(k => [MC_LABEL[k], k === 'data_nascita' ? mcData(v[k]) : (v[k] == null ? '' : String(v[k])), '', '']),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2, minCellHeight: 11.5, valign: 'middle', lineColor: [120, 120, 120], lineWidth: 0.2, textColor: [20, 20, 20] },
    headStyles: { fillColor: [230, 234, 240], textColor: [20, 20, 20], fontStyle: 'bold', minCellHeight: 8 },
    columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' }, 1: { cellWidth: 56 }, 2: { cellWidth: 66 }, 3: { cellWidth: 22, halign: 'center' } },
    didDrawCell: d => { if (d.section === 'body' && d.column.index === 3) mcCasella(doc, d.cell.x + d.cell.width / 2 - 2.5, d.cell.y + d.cell.height / 2 - 2.5, 5); },
  });

  // ---------- Pagina 2: taglie DPI, foto, documenti ----------
  doc.addPage(); y = MC_TOP;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Taglie e DPI', MC_MARG, y + 5);
  y = mcParagrafo(doc, 'Per ogni capo indica se ce l\'hai e, se la taglia è cambiata, scrivi quella nuova.', y + 10, { dopo: 1 });
  const suggerite = new Set(data.categorie_suggerite || ['GENERICO']);
  const dpiAtt = {};
  (data.dpi || []).forEach(d => { dpiAtt[d.dpi_id] = d; });
  const capi = (data.catalogo || [])
    .filter(c => c.attivo !== false && (suggerite.has(c.categoria) || dpiAtt[c.id]))
    .sort((a, b) => String(a.categoria).localeCompare(String(b.categoria)) || (a.ordine || 0) - (b.ordine || 0));
  const righeDpi = capi.map(c => [c.nome + (c.categoria && c.categoria !== 'GENERICO' ? '\n' + c.categoria : ''),
    dpiAtt[c.id] ? (dpiAtt[c.id].taglia || 'sì, senza taglia') : '—', '', c.tipo_taglia === 'UNICA' ? 'taglia unica' : '']);
  righeDpi.push(['Altro capo:', '', '', ''], ['Altro capo:', '', '', '']);
  doc.autoTable({
    startY: y, margin: { left: MC_MARG, right: MC_MARG, top: MC_TOP, bottom: MC_FOOT + 4 },
    head: [['Capo', 'Taglia attuale', 'Ha il capo', 'Nuova taglia']],
    body: righeDpi, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2, minCellHeight: 10, valign: 'middle', lineColor: [120, 120, 120], lineWidth: 0.2, textColor: [20, 20, 20] },
    headStyles: { fillColor: [230, 234, 240], textColor: [20, 20, 20], fontStyle: 'bold', minCellHeight: 8 },
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 34 }, 2: { cellWidth: 40 }, 3: { cellWidth: 44 } },
    didDrawCell: d => {
      if (d.section !== 'body' || d.column.index !== 2) return;
      const cy = d.cell.y + d.cell.height / 2;
      doc.setFontSize(10);
      mcCasella(doc, d.cell.x + 3, cy - 2.25); doc.text('sì', d.cell.x + 9, cy + 1.3);
      mcCasella(doc, d.cell.x + 19, cy - 2.25); doc.text('no', d.cell.x + 25, cy + 1.3);
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  y = mcSpazio(doc, y, 62);
  doc.setLineDashPattern([2, 1.5], 0); doc.setLineWidth(0.4);
  doc.rect(MC_MARG, y, 35, 45);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(['Incollare qui', 'foto tessera', '(35 × 45 mm)'], MC_MARG + 17.5, y + 19, { align: 'center' });
  const xd = MC_MARG + 45;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Documenti da allegare in copia', xd, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const docs = ['Carta d\'identità (fronte e retro)', 'Codice fiscale / tessera sanitaria (fronte e retro)'];
  if (v.patenti && String(v.patenti).trim()) docs.push('Patente di guida (fronte e retro)');
  docs.push('Attestati di corsi e abilitazioni (se nuovi)');
  docs.forEach((t, i) => { mcCasella(doc, xd, y + 10 + i * 8); doc.text(t, xd + 7, y + 13.6 + i * 8); });
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize('Foto recente, a colori, viso e spalle su sfondo chiaro. Barra i documenti che alleghi.', MC_W - MC_MARG - xd), xd, y + 14 + docs.length * 8);

  // ---------- Pagina 3: informativa, dichiarazione, consenso, firma ----------
  doc.addPage(); y = MC_TOP;
  y = mcParagrafo(doc, INFORMATIVA_PDF.titolo, y, { bold: true, size: 12, dopo: 3 });
  INFORMATIVA_PDF.sezioni.forEach(s => {
    y = mcParagrafo(doc, s.titolo, y, { bold: true, dopo: 0.5 });
    y = mcParagrafo(doc, s.testo, y, { dopo: 2.5 });
  });
  y = mcSpazio(doc, y + 2, 70);
  y = mcParagrafo(doc, 'Dichiarazione', y, { bold: true, size: 11, dopo: 1 });
  y = mcParagrafo(doc, INFORMATIVA_PDF.dichiarazione, y, { dopo: 4 });
  y = mcParagrafo(doc, INFORMATIVA_PDF.consenso_immagini.titolo, y, { bold: true, size: 11, dopo: 1 });
  y = mcParagrafo(doc, INFORMATIVA_PDF.consenso_immagini.testo, y, { dopo: 2 });
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  mcCasella(doc, MC_MARG, y, 5); doc.text('Acconsento', MC_MARG + 8, y + 4);
  mcCasella(doc, MC_MARG + 50, y, 5); doc.text('Non acconsento', MC_MARG + 58, y + 4);
  y += 16;
  doc.setLineWidth(0.3);
  doc.text('Luogo e data', MC_MARG, y); doc.line(MC_MARG + 25, y + 1, MC_MARG + 85, y + 1);
  doc.text('Firma', MC_MARG + 95, y); doc.line(MC_MARG + 108, y + 1, MC_W - MC_MARG, y + 1);

  // ---------- Piè di pagina su tutte le pagine ----------
  const tot = doc.getNumberOfPages();
  const idTesto = 'ID ' + (v.volontario_id || v.id) + (v.volontario_id ? ' / A' + v.id : '');
  for (let i = 1; i <= tot; i++) {
    doc.setPage(i);
    doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(MC_MARG, MC_H - MC_FOOT, MC_W - MC_MARG, MC_H - MC_FOOT);
    doc.setDrawColor(0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
    doc.text(nome, MC_MARG, MC_H - MC_FOOT + 5);
    doc.text('Pag. ' + i + '/' + tot, MC_W / 2, MC_H - MC_FOOT + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.text(idTesto, MC_W - MC_MARG, MC_H - MC_FOOT + 5, { align: 'right' });
    if (!INFORMATIVA_DEFINITIVA) {
      doc.setTextColor(180, 0, 0); doc.setFontSize(8);
      doc.text('BOZZA – informativa in attesa del testo definitivo', MC_W / 2, MC_H - MC_FOOT + 9.5, { align: 'center' });
    }
    doc.setTextColor(0);
  }
  return doc;
}

// Dati di un volontario partendo da volontari.id (RPC) o dall'id agg già noto.
async function mcDatiDaVolontario(volontarioId) {
  const { data: aggId, error } = await auClient.rpc('agg_id_da_volontario', { p_volontario_id: volontarioId });
  if (error || !aggId) throw new Error('Questo volontario non è ancora in Aggiornamento dati: usa "Sincronizza nuovi volontari".');
  return aggCall('get', { id: aggId });
}

function mcSalva(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Un solo modulo: dati già caricati (data) oppure da volontari.id.
async function mcScaricaModulo(data, volontarioId) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Libreria PDF non caricata: ricarica la pagina.');
    if (!data) data = await mcDatiDaVolontario(volontarioId);
    const doc = mcCreaPdf(data);
    mcSalva(doc.output('blob'), mcNomeFile(data.volontario));
  } catch (e) { alert('Errore: ' + e.message); }
}

function mcCaricaJSZip() {
  if (window.JSZip) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare JSZip.'));
    document.head.appendChild(s);
  });
}

// ZIP con un PDF per volontario. lista = righe di agg-api 'list' (id = agg_volontari.id).
async function mcScaricaZip(lista) {
  if (!lista.length) { alert('Nessun volontario attivo o sospeso nell\'elenco.'); return; }
  if (!confirm('Generare ' + lista.length + ' moduli cartacei in un file ZIP?')) return;
  const ov = document.createElement('div');
  ov.className = 'doc-upload-overlay open';
  ov.innerHTML = '<div class="doc-upload-card sheet-narrow"><div class="shead sheet-h"><h2>Moduli cartacei</h2></div>'
    + '<p class="note m0 mb10" id="mcZipTesto">Preparazione…</p><div class="progbar"><i id="mcZipBar" style="width:0%"></i></div>'
    + '<div class="actions agg-mt"><button class="btn" id="mcZipStop">Annulla</button></div></div>';
  document.body.appendChild(ov);
  let stop = false;
  ov.querySelector('#mcZipStop').onclick = () => { stop = true; };
  const testo = ov.querySelector('#mcZipTesto'), bar = ov.querySelector('#mcZipBar');
  const errori = [];
  try {
    await mcCaricaJSZip();
    const zip = new window.JSZip();
    const usati = {};
    for (let i = 0; i < lista.length && !stop; i++) {
      const c = lista[i];
      testo.textContent = (i + 1) + ' di ' + lista.length + ' — ' + c.cognome + ' ' + c.nome;
      try {
        const data = await aggCall('get', { id: c.id });
        let nome = mcNomeFile(data.volontario);
        if (usati[nome]) nome = nome.replace(/\.pdf$/, '_' + (++usati[nome]) + '.pdf'); else usati[nome] = 1;
        zip.file(nome, mcCreaPdf(data).output('arraybuffer'));
      } catch (e) { errori.push(c.cognome + ' ' + c.nome + ': ' + e.message); }
      bar.style.width = Math.round(((i + 1) / lista.length) * 100) + '%';
    }
    if (!stop) {
      testo.textContent = 'Creazione dello ZIP…';
      const blob = await zip.generateAsync({ type: 'blob' });
      mcSalva(blob, 'MODULI_CARTACEI_' + new Date().toISOString().slice(0, 10) + '.zip');
    }
  } catch (e) { errori.push(e.message); }
  ov.remove();
  if (errori.length) alert('Alcuni moduli non sono stati creati:\n' + errori.slice(0, 10).join('\n'));
}
