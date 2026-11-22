// ============================================================
// FOGLIO FIRMA (registro presenze) di esercitazioni e corsi — prefisso ff*.
// ============================================================
// Si apre da un Evento (permesso eventi) o da un Intervento (permesso interventi).
// 1) Impostazioni: titolo, anno del progetto formativo, argomenti, convalide (ruolo + nome),
//    giorni, righe vuote, copertina. Si salvano in eventi.foglio_firma / interventi.foglio_firma.
// 2) PDF da stampare (pdf-lib, nel browser): un foglio per giorno con nomi, squadra e codice
//    fiscale già scritti. Il PDF con i codici fiscali non va mai sul server.
// 3) Scansioni firmate: bucket privato fogli-firma, tabella fogli_firma, sempre legate
//    all'intervento (e all'evento, se c'è). Quando l'evento crea l'intervento, evCreaIntervento
//    chiama ffPassaAIntervento. Eliminare una scansione: solo permesso DB (regole del database).
// SQL: supabase/fogli_firma.sql
// ============================================================

const FF_BUCKET = 'fogli-firma';
const FF_MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
const FF_GIORNI = ['DOMENICA', 'LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO'];
const FF_TIPI_FILE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const FF_MAX_FILE = 20 * 1024 * 1024;

let ff = null;   // { origine, id, rec, conf, persone, fogli, interventoId, eventoId }

function ffEl(id) { return document.getElementById(id); }
function ffEsc(s) { return aggEsc(s == null ? '' : String(s)); }
// Solo caratteri che i font standard del PDF sanno scrivere
function ffTxt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/[^ -~ -ÿ–—‘’“”…]/g, '?').trim(); }
function ffDataIt(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
function ffGiornoLungo(iso) {
  const [a, m, g] = String(iso).slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return FF_GIORNI[d.getUTCDay()] + ' ' + g + ' ' + FF_MESI[m - 1] + ' ' + a;
}
// Tutti i giorni da dal ad al (compresi), in UTC per non sbagliare col cambio d'ora
function ffGiorni(dal, al) {
  const out = [];
  if (!dal) return out;
  const fine = al && al >= dal ? al : dal;
  const d = new Date(dal + 'T00:00:00Z');
  for (let i = 0; i < 62; i++) {
    const iso = d.toISOString().slice(0, 10);
    out.push(iso);
    if (iso >= fine) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function ffLeggi(percorso) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/' + percorso, { headers: H });
  sbOk(res);
  return res.json();
}
async function ffScrivi(metodo, percorso, corpo) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/' + percorso, {
    method: metodo, headers: Object.assign({}, HJ, { 'Prefer': 'return=representation' }), body: JSON.stringify(corpo),
  });
  const righe = res.ok ? await res.json() : [];
  if (!res.ok || !Array.isArray(righe) || !righe.length) throw new Error('Salvataggio non riuscito.');
  return righe;
}

// Impostazioni di partenza: quelle salvate, altrimenti ricavate dal record
function ffConfBase(rec, salvata, corso) {
  const c = Object.assign({}, salvata || {});
  if (!c.intestazione) c.intestazione = corso ? 'REGISTRO DI FORMAZIONE' : 'REGISTRO PRESENZE';
  if (!c.titolo) c.titolo = rec.titolo || '';
  if (c.anno == null) c.anno = corso && rec.dal ? Number(rec.dal.slice(0, 4)) : '';
  if (c.argomenti == null) c.argomenti = '';
  if (!Array.isArray(c.convalide) || !c.convalide.length) c.convalide = [{ ruolo: 'Responsabile', nome: '' }, { ruolo: 'Tutor', nome: '' }];
  if (c.righe_vuote == null) c.righe_vuote = 10;
  if (c.copertina == null) c.copertina = !!corso;
  const tutti = ffGiorni(rec.dal, rec.al);
  c.giorni = Array.isArray(c.giorni) ? c.giorni.filter(g => tutti.includes(g)) : tutti.slice();
  if (!c.giorni.length) c.giorni = tutti.slice(0, 1);
  return c;
}

// -- APERTURA --
// origine 'evento' (usa evCorrente già caricato) oppure 'intervento'
async function ffApri(origine, id) {
  let ov = ffEl('ffOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ffOv'; ov.className = 'ov'; ov.style.zIndex = '780'; ov.hidden = true;
    ov.addEventListener('click', e => { if (e.target === ov) ffChiudi(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<div class="sheet ff-sheet" role="dialog" aria-modal="true" aria-label="Foglio firma"><div class="shead"><h2>Foglio firma</h2>'
    + '<button class="x" onclick="ffChiudi()" aria-label="Chiudi">✕</button></div><div class="sbody"><div class="loading-msg">Caricamento…</div></div></div>';
  ov.hidden = false;
  ff = null;
  try {
    let rec, volIds, salvata, interventoId = null, eventoId = null, corso = false;
    if (origine === 'evento') {
      const c = evCorrente;
      if (!c || c.e.id !== id) throw new Error('Evento non aperto.');
      const e = c.e;
      rec = { titolo: e.titolo, luogo: e.luogo, dal: evGiorno(e.data_inizio), al: evGiorno(e.data_fine || e.fine_finestra) || evGiorno(e.data_inizio), tipo: EV_TIPI[e.tipo] || e.tipo };
      volIds = c.squadra.map(r => r.volontario_id);
      salvata = e.foglio_firma; eventoId = e.id; interventoId = e.intervento_id || null; corso = e.tipo === 'CORSO';
    } else {
      const [i] = await ffLeggi('interventi?id=eq.' + id + '&select=id,evento,data,data_fine,luogo,tipo_attivita,volontari_ids,is_macro,foglio_firma');
      if (!i) throw new Error('Intervento non trovato.');
      rec = { titolo: i.evento, luogo: i.luogo, dal: i.data, al: i.data_fine || i.data, tipo: i.tipo_attivita };
      volIds = (i.volontari_ids || []).slice();
      // macro-attività: anche i volontari degli interventi inclusi
      if (i.is_macro) (typeof interventiData !== 'undefined' ? interventiData : []).filter(f => f.macro_id === i.id).forEach(f => (f.volontari_ids || []).forEach(v => volIds.push(v)));
      salvata = i.foglio_firma; interventoId = i.id; corso = /CORS/i.test(i.tipo_attivita || '');
      const [ev] = await ffLeggi('eventi?intervento_id=eq.' + i.id + '&select=id').catch(() => []);
      if (ev) eventoId = ev.id;
    }
    volIds = [...new Set(volIds.filter(Boolean))];
    let persone = [];
    if (volIds.length) {
      persone = await ffLeggi('volontari?id=in.(' + volIds.join(',') + ')&select=id,cognome,nome,squadra,codice_fiscale,stato');
      persone.sort((a, b) => (a.cognome + ' ' + a.nome).localeCompare(b.cognome + ' ' + b.nome, 'it'));
    }
    ff = { origine, id, rec, conf: ffConfBase(rec, salvata, corso), persone, fogli: [], interventoId, eventoId, corso };
    await ffCaricaFogli();
    ffRender();
  } catch(e) {
    ov.querySelector('.sbody').innerHTML = '<div class="empty">Non disponibile.' + (e && e.message && e.message !== 'Non disponibile.' ? ' ' + ffEsc(e.message) : '') + '</div>';
  }
}

function ffChiudi() {
  const ov = ffEl('ffOv');
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
  ff = null;
}

async function ffCaricaFogli() {
  const filtri = [];
  if (ff.interventoId) filtri.push('intervento_id.eq.' + ff.interventoId);
  if (ff.eventoId) filtri.push('evento_id.eq.' + ff.eventoId);
  ff.fogli = !filtri.length ? [] : await ffLeggi('fogli_firma?or=(' + filtri.join(',') + ')&select=*&order=giorno,caricato_il');
  await sbFirmaRighe(ff.fogli, 'file');
}

// -- FINESTRA --
function ffRender() {
  const c = ff.conf, r = ff.rec;
  const tutti = ffGiorni(r.dal, r.al);
  const giorni = tutti.map(g => '<label class="chk"><input type="checkbox" class="ff-giorno" value="' + g + '"' + (c.giorni.includes(g) ? ' checked' : '') + '> ' + ffEsc(ffDataIt(g)) + '</label>').join('');
  const conv = c.convalide.map((v, i) => '<div class="row2 ff-conv"><label>Ruolo<input class="ff-conv-ruolo" value="' + ffEsc(v.ruolo) + '" placeholder="es. Responsabile del corso"></label>'
    + '<label>Nome<span class="ff-riga"><input class="ff-conv-nome" value="' + ffEsc(v.nome) + '" placeholder="es. Rossi Mario">'
    + '<button class="btn sm" onclick="ffTogliConvalida(' + i + ')" aria-label="Togli convalida">✕</button></span></label></div>').join('');
  const senzaCf = ff.persone.filter(p => !p.codice_fiscale).length;
  ffEl('ffOv').innerHTML = '<div class="sheet ff-sheet" role="dialog" aria-modal="true" aria-label="Foglio firma">'
    + '<div class="shead"><h2>Foglio firma</h2><button class="x" onclick="ffChiudi()" aria-label="Chiudi">✕</button></div>'
    + '<div class="sbody form">'
    + '<p class="sub">' + ffEsc([r.titolo, r.tipo, r.luogo, ffDataIt(r.dal) + (r.al && r.al !== r.dal ? ' – ' + ffDataIt(r.al) : '')].filter(Boolean).join(' · ')) + '</p>'
    + '<div class="form-err" id="ffErr"></div>'
    + '<div class="grp">Intestazione</div>'
    + '<div class="row2"><label>Tipo di registro<input id="ffIntestazione" value="' + ffEsc(c.intestazione) + '"></label>'
    + '<label>Anno del progetto formativo (vuoto: non si stampa)<input type="number" id="ffAnno" min="2000" max="2100" value="' + ffEsc(c.anno) + '"></label></div>'
    + '<label>Titolo del corso o dell\'attività<input id="ffTitolo" value="' + ffEsc(c.titolo) + '"></label>'
    + '<label>Argomenti trattati<textarea id="ffArgomenti" rows="3">' + ffEsc(c.argomenti) + '</textarea></label>'
    + '<div class="grp">Convalide</div><p class="sub">Chi firma per convalidare il foglio: compare nell\'intestazione e con una riga per la firma in fondo a ogni giorno.</p>'
    + '<div id="ffConvalide">' + conv + '</div>'
    + '<div class="actions ff-sx"><button class="btn sm" onclick="ffAggiungiConvalida()">+ Aggiungi convalida</button></div>'
    + '<div class="grp">Fogli da stampare</div>'
    + '<div class="ff-giorni">' + giorni + '</div>'
    + (tutti.length > 1 ? '<div class="actions ff-sx"><button class="btn sm" onclick="ffTuttiGiorni(true)">Tutti</button><button class="btn sm" onclick="ffTuttiGiorni(false)">Nessuno</button></div>' : '')
    + '<div class="row2"><label>Righe vuote in fondo (per chi non è in elenco)<input type="number" id="ffRigheVuote" min="0" max="80" value="' + ffEsc(c.righe_vuote) + '"></label>'
    + '<label class="chk"><input type="checkbox" id="ffCopertina"' + (c.copertina ? ' checked' : '') + '> Pagina di copertina</label></div>'
    + '<p class="sub">Nomi già stampati: <b>' + ff.persone.length + '</b>' + (ff.origine === 'evento' ? ' (la squadra dell\'evento)' : ' (i volontari dell\'intervento)')
    + (senzaCf ? ' · <span class="bad">' + senzaCf + ' senza codice fiscale in anagrafica</span>' : '') + '</p>'
    + '<div class="actions"><button class="btn" id="ffSalvaBtn" onclick="ffSalva()">Salva impostazioni</button><button class="btn pri" id="ffPdfBtn" onclick="ffGeneraPdf()">Genera PDF da stampare</button></div>'
    + '<div class="grp mt14">Fogli firmati (scansioni)</div>'
    + ffRenderFogli()
    + ffRenderCarica(tutti)
    + '</div></div>';
}

function ffRenderFogli() {
  if (!ff.fogli.length) return '<div class="empty">Nessun foglio firmato caricato.</div>';
  return '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Giorno</th><th class="sx">File</th><th class="sx">Caricato</th><th></th></tr></thead><tbody>'
    + ff.fogli.map(f => '<tr><td class="sx">' + ffEsc(ffDataIt(f.giorno)) + '</td><td class="sx">' + ffEsc(f.nome_file || 'Foglio firma') + (f.note ? '<div class="sub">' + ffEsc(f.note) + '</div>' : '') + '</td>'
      + '<td class="sx"><span class="sub">' + ffEsc(ffDataIt(f.caricato_il)) + (f.caricato_da ? ' · ' + ffEsc(f.caricato_da) : '') + '</span></td>'
      + '<td>' + sbLinkFile(f.file, f._file) + '</td></tr>').join('')
    + '</tbody></table></div>';
}

function ffRenderCarica(tutti) {
  const opz = tutti.map(g => '<option value="' + g + '">' + ffEsc(ffDataIt(g)) + '</option>').join('');
  return '<div class="card form mt14"><h2>Carica foglio firmato</h2><div class="form-err" id="ffCaricaErr"></div>'
    + '<div class="row2"><label>Giorno<select id="ffCaricaGiorno">' + opz + '<option value="altro">Altro giorno…</option></select></label>'
    + '<label id="ffCaricaAltroBox" hidden>Data<input type="date" id="ffCaricaAltro"></label></div>'
    + '<label>Scansione (PDF o foto, massimo 20 MB)<input type="file" id="ffCaricaFile" accept="application/pdf,image/jpeg,image/png,image/webp"></label>'
    + '<label>Note (facoltative)<input id="ffCaricaNote" placeholder="es. pagine 1-3, manca la convalida"></label>'
    + '<div class="actions"><button class="btn pri" id="ffCaricaBtn" onclick="ffCarica()">Carica</button></div></div>';
}

document.addEventListener('change', e => {
  if (e.target && e.target.id === 'ffCaricaGiorno') ffEl('ffCaricaAltroBox').hidden = e.target.value !== 'altro';
});

// Legge il modulo in ff.conf (anche prima di generare il PDF, senza salvare)
function ffLeggiModulo() {
  const c = ff.conf;
  c.intestazione = ffEl('ffIntestazione').value.trim() || (ff.corso ? 'REGISTRO DI FORMAZIONE' : 'REGISTRO PRESENZE');
  c.titolo = ffEl('ffTitolo').value.trim();
  const anno = ffEl('ffAnno').value.trim();
  c.anno = anno ? Number(anno) : '';
  c.argomenti = ffEl('ffArgomenti').value.trim();
  const ruoli = [...document.querySelectorAll('.ff-conv-ruolo')], nomi = [...document.querySelectorAll('.ff-conv-nome')];
  c.convalide = ruoli.map((x, i) => ({ ruolo: x.value.trim(), nome: nomi[i].value.trim() })).filter(v => v.ruolo || v.nome);
  c.giorni = [...document.querySelectorAll('.ff-giorno:checked')].map(x => x.value);
  c.righe_vuote = Math.max(0, Math.min(80, Number(ffEl('ffRigheVuote').value) || 0));
  c.copertina = ffEl('ffCopertina').checked;
  return c;
}

function ffAggiungiConvalida() { ffLeggiModulo(); ff.conf.convalide.push({ ruolo: '', nome: '' }); ffRender(); }
function ffTogliConvalida(i) { ffLeggiModulo(); ff.conf.convalide.splice(i, 1); ffRender(); }
function ffTuttiGiorni(si) { document.querySelectorAll('.ff-giorno').forEach(x => { x.checked = si; }); }

function ffErrore(t, id) { const el = ffEl(id || 'ffErr'); if (el) { el.textContent = t; el.style.display = t ? 'block' : 'none'; } }

async function ffSalvaConf() {
  const c = ff.conf;
  const corpo = { foglio_firma: { intestazione: c.intestazione, titolo: c.titolo, anno: c.anno, argomenti: c.argomenti, convalide: c.convalide, giorni: c.giorni, righe_vuote: c.righe_vuote, copertina: c.copertina } };
  if (ff.origine === 'evento') {
    const [riga] = await ffScrivi('PATCH', 'eventi?id=eq.' + ff.id, corpo);
    if (evCorrente && evCorrente.e.id === ff.id) evCorrente.e.foglio_firma = riga.foglio_firma;
  } else {
    await ffScrivi('PATCH', 'interventi?id=eq.' + ff.id, corpo);
  }
}

async function ffSalva() {
  ffLeggiModulo();
  const btn = ffEl('ffSalvaBtn');
  btn.disabled = true;
  try { await ffSalvaConf(); ffErrore(''); sbAvviso('Impostazioni del foglio firma salvate.'); }
  catch(e) { ffErrore('Impostazioni non salvate: riprova.'); }
  btn.disabled = false;
}

// -- PDF DA STAMPARE --
async function ffGeneraPdf() {
  const c = ffLeggiModulo();
  if (!c.giorni.length) return ffErrore('Scegli almeno un giorno da stampare.');
  if (!c.titolo) return ffErrore('Indica il titolo del corso o dell\'attività.');
  if (!ff.persone.length && !c.righe_vuote) return ffErrore('Nessun nome in elenco: aggiungi qualche riga vuota.');
  ffErrore('');
  const btn = ffEl('ffPdfBtn');
  btn.disabled = true; btn.textContent = 'Preparo il PDF…';
  try {
    try { await ffSalvaConf(); } catch(e) { /* il PDF si genera comunque */ }
    const bytes = await ffCreaPdf(c);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Foglio firma - ' + ffTxt(c.titolo).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    logAttivita('ha generato il foglio firma: ' + c.titolo);
  } catch(e) {
    ffErrore('PDF non creato: ' + (e && e.message ? e.message : 'riprova.'));
  }
  btn.disabled = false; btn.textContent = 'Genera PDF da stampare';
}

async function ffCreaPdf(c) {
  await epCaricaLibrerie();
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle('Foglio firma - ' + ffTxt(c.titolo));
  const nor = await doc.embedFont(StandardFonts.Helvetica);
  const gra = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 841.89, A = 595.28, M = 34, NERO = rgb(0, 0, 0), GRIGIO = rgb(0.35, 0.35, 0.35), FONDO = rgb(0.92, 0.92, 0.92);
  const logo = async n => { const res = await fetch('images/' + n + '.png'); if (!res.ok) throw new Error('logo non trovato'); return doc.embedPng(await res.arrayBuffer()); };
  const [logoVol, logoAna] = await Promise.all([logo('conv-logo-volontariato'), logo('conv-logo-ana')]);

  const largo = (t, f, sz) => f.widthOfTextAtSize(t, sz);
  const adatta = (t, f, sz, max) => { while (largo(t, f, sz) > max && sz > 5) sz -= 0.25; return sz; };
  const taglia = (t, f, sz, max) => { if (largo(t, f, sz) <= max) return t; while (t.length > 1 && largo(t + '…', f, sz) > max) t = t.slice(0, -1); return t + '…'; };
  const aCapo = (t, f, sz, max) => {
    const righe = []; let r = '';
    ffTxt(t).split(' ').forEach(p => { const prova = r ? r + ' ' + p : p; if (largo(prova, f, sz) > max && r) { righe.push(r); r = p; } else r = prova; });
    if (r) righe.push(r);
    return righe;
  };
  const centro = (pag, t, y, sz, f, sotto) => {
    t = ffTxt(t); sz = adatta(t, f, sz, L - 2 * M);
    const w = largo(t, f, sz), x = (L - w) / 2;
    pag.drawText(t, { x, y, size: sz, font: f, color: NERO });
    if (sotto) pag.drawLine({ start: { x, y: y - 2 }, end: { x: x + w, y: y - 2 }, thickness: 0.7, color: NERO });
  };
  const testata = (pag, y) => {
    pag.drawImage(logoAna, { x: M, y: y - 46, width: 46, height: 46 });
    pag.drawImage(logoVol, { x: L - M - 46, y: y - 46, width: 46, height: 46 });
    centro(pag, 'COORDINAMENTO DELLE SEZIONI PIEMONTESI', y - 12, 12, gra, true);
    centro(pag, "DELL'ASSOCIAZIONE NAZIONALE ALPINI", y - 27, 12, gra, true);
    centro(pag, 'SEZIONE DI CASALE MONFERRATO - UNITA\' DI PROTEZIONE CIVILE ANA', y - 44, 11, gra, true);
    return y - 60;
  };

  // colonne: N°, volontario, squadra, codice fiscale, firma entrata, firma uscita
  const COL = [['N°', 26], ['VOLONTARIO (cognome e nome)', 196], ['SQUADRA', 92], ['CODICE FISCALE', 132], ['FIRMA DI ENTRATA', 164], ['FIRMA DI USCITA', 164]];
  const LT = COL.reduce((t, x) => t + x[1], 0), X0 = (L - LT) / 2, RIGA = 25, TESTA = 22;
  const righe = ff.persone.map(p => [((p.cognome || '') + ' ' + (p.nome || '')).toUpperCase(), (p.squadra || '').toUpperCase(), (p.codice_fiscale || '').toUpperCase()])
    .concat(Array.from({ length: c.righe_vuote }, () => ['', '', '']));
  const convalide = c.convalide.filter(v => v.ruolo || v.nome);
  const tutteLePagine = [];

  const intestaTabella = (pag, y) => {
    let x = X0;
    pag.drawRectangle({ x: X0, y: y - TESTA, width: LT, height: TESTA, color: FONDO, borderColor: NERO, borderWidth: 0.8 });
    COL.forEach(([t, w]) => {
      const sz = adatta(t, gra, 7.5, w - 6);
      pag.drawText(t, { x: x + (w - largo(t, gra, sz)) / 2, y: y - TESTA + (TESTA - sz) / 2 + 1.5, size: sz, font: gra, color: NERO });
      if (x > X0) pag.drawLine({ start: { x, y }, end: { x, y: y - TESTA }, thickness: 0.8, color: NERO });
      x += w;
    });
    return y - TESTA;
  };
  const rigaTabella = (pag, y, n, dati) => {
    pag.drawRectangle({ x: X0, y: y - RIGA, width: LT, height: RIGA, borderColor: NERO, borderWidth: 0.6 });
    let x = X0;
    const valori = [String(n), dati[0], dati[1], dati[2], '', ''];
    COL.forEach(([, w], k) => {
      if (k) pag.drawLine({ start: { x, y }, end: { x, y: y - RIGA }, thickness: 0.6, color: NERO });
      const t = ffTxt(valori[k]);
      if (t) {
        const f = k === 1 ? gra : nor, sz = k === 0 ? 8 : 9;
        const s = taglia(t, f, sz, w - 8);
        pag.drawText(s, { x: k === 0 ? x + (w - largo(s, f, sz)) / 2 : x + 4, y: y - RIGA + 8.5, size: sz, font: f, color: k === 0 ? GRIGIO : NERO });
      }
      x += w;
    });
    return y - RIGA;
  };

  // copertina
  if (c.copertina) {
    const pag = doc.addPage([L, A]); tutteLePagine.push({ pag });
    let y = testata(pag, A - 34);
    const lato = 170;
    pag.drawImage(logoVol, { x: (L - lato) / 2, y: y - 20 - lato, width: lato, height: lato });
    y -= 20 + lato + 40;
    centro(pag, c.intestazione.toUpperCase(), y, 24, nor);
    y -= 30;
    aCapo(c.titolo.toUpperCase(), nor, 22, L - 2 * M - 40).slice(0, 3).forEach(r => { centro(pag, r, y, 22, nor); y -= 27; });
    if (ff.rec.luogo) {
      const t = 'Luogo: ' + ffTxt(ff.rec.luogo).toUpperCase();
      pag.drawText(t, { x: L - M - largo(t, nor, 12), y: 60, size: 12, font: nor, color: NERO });
    }
  }

  c.giorni.slice().sort().forEach(giorno => {
    let pag = doc.addPage([L, A]); tutteLePagine.push({ pag, giorno });
    let y = testata(pag, A - 26);
    // intestazione del giorno
    y -= 6;
    const titolo = (ff.corso ? 'Corso: ' : 'Attività: ') + ffTxt(c.titolo);
    centro(pag, titolo, y - 14, 15, gra);
    y -= 34;
    const info = [];
    if (c.anno) info.push(['Progetto formativo anno ', String(c.anno)]);
    info.push(['Foglio presenze del giorno: ', ffGiornoLungo(giorno)]);
    if (ff.rec.luogo) info.push(['Luogo: ', ffTxt(ff.rec.luogo).toUpperCase()]);
    let x = M;
    info.forEach(([e, v]) => { pag.drawText(e, { x, y, size: 9.5, font: nor, color: NERO }); x += largo(e, nor, 9.5); pag.drawText(ffTxt(v), { x, y, size: 9.5, font: gra, color: NERO }); x += largo(ffTxt(v), gra, 9.5) + 22; });
    y -= 14;
    if (convalide.length) {
      x = M;
      convalide.forEach(v => {
        const e = ffTxt(v.ruolo || 'Convalida') + ': ', n = ffTxt(v.nome);
        if (x + largo(e + n, gra, 9.5) > L - M) { x = M; y -= 13; }
        pag.drawText(e, { x, y, size: 9.5, font: nor, color: NERO }); x += largo(e, nor, 9.5);
        pag.drawText(n || '________________', { x, y, size: 9.5, font: gra, color: NERO }); x += largo(n || '________________', gra, 9.5) + 22;
      });
      y -= 14;
    }
    if (c.argomenti) {
      const righeArg = aCapo('Argomenti trattati: ' + c.argomenti, nor, 9, L - 2 * M).slice(0, 4);
      righeArg.forEach(r => { pag.drawText(r, { x: M, y, size: 9, font: nor, color: NERO }); y -= 11.5; });
    }
    y -= 6;
    y = intestaTabella(pag, y);
    const spazioConvalide = 14 + convalide.length * 22 + 10;
    righe.forEach((dati, i) => {
      if (y - RIGA < 34) {
        pag = doc.addPage([L, A]); tutteLePagine.push({ pag, giorno });
        y = A - 34;
        pag.drawText(ffTxt(c.titolo) + ' - ' + ffGiornoLungo(giorno), { x: M, y: y - 4, size: 9, font: gra, color: GRIGIO });
        y = intestaTabella(pag, y - 14);
      }
      y = rigaTabella(pag, y, i + 1, dati);
    });
    // convalide in fondo
    if (y - spazioConvalide < 34) {
      pag = doc.addPage([L, A]); tutteLePagine.push({ pag, giorno });
      y = A - 50;
    }
    y -= 26;
    (convalide.length ? convalide : [{ ruolo: 'Convalida del responsabile del corso o del tutor', nome: '' }]).forEach(v => {
      const e = 'Convalida ' + (v.ruolo ? ffTxt(v.ruolo).toLowerCase() : '') + (v.nome ? ' (' + ffTxt(v.nome) + ')' : '');
      const xLinea = L - M - 210;
      pag.drawText(e, { x: xLinea - 14 - largo(e, nor, 10), y, size: 10, font: nor, color: NERO });
      pag.drawLine({ start: { x: xLinea, y: y - 2 }, end: { x: L - M, y: y - 2 }, thickness: 0.7, color: NERO });
      y -= 24;
    });
  });

  // numeri di pagina
  const tot = tutteLePagine.length;
  tutteLePagine.forEach((p, i) => {
    const t = 'Pagina ' + (i + 1) + ' di ' + tot;
    p.pag.drawText(t, { x: (L - largo(t, nor, 8)) / 2, y: 16, size: 8, font: nor, color: GRIGIO });
  });
  return doc.save();
}

// -- SCANSIONI FIRMATE --
async function ffCarica() {
  const file = ffEl('ffCaricaFile').files[0];
  let giorno = ffEl('ffCaricaGiorno').value;
  if (giorno === 'altro') giorno = ffEl('ffCaricaAltro').value;
  if (!giorno) return ffErrore('Indica il giorno del foglio.', 'ffCaricaErr');
  if (!file) return ffErrore('Scegli il file della scansione.', 'ffCaricaErr');
  if (!FF_TIPI_FILE.includes(file.type)) return ffErrore('Formato non accettato: usa PDF, JPG o PNG.', 'ffCaricaErr');
  if (file.size > FF_MAX_FILE) return ffErrore('File troppo grande (massimo 20 MB).', 'ffCaricaErr');
  ffErrore('', 'ffCaricaErr');
  const btn = ffEl('ffCaricaBtn');
  btn.disabled = true; btn.textContent = 'Caricamento…';
  const est = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const cartella = ff.interventoId ? 'intervento-' + ff.interventoId : 'evento-' + ff.eventoId;
  const path = cartella + '/' + giorno + '_' + Date.now() + '.' + est;
  let caricato = false;
  try {
    const res = await sbFetch(SUPA_URL + '/storage/v1/object/' + FF_BUCKET + '/' + path, { method: 'POST', headers: { 'apikey': SUPA_KEY, 'Content-Type': file.type }, body: file });
    if (!res.ok) throw new Error('File non caricato.');
    caricato = true;
    await ffScrivi('POST', 'fogli_firma', {
      intervento_id: ff.interventoId, evento_id: ff.eventoId, giorno,
      file: FF_BUCKET + '/' + path, nome_file: ffTxt(file.name).slice(0, 120) || null,
      note: ffEl('ffCaricaNote').value.trim() || null, caricato_da: (currentUser && currentUser.nome) || null,
    });
    await logAttivita('ha caricato il foglio firma del ' + ffDataIt(giorno) + ': ' + (ff.rec.titolo || ''));
    await ffCaricaFogli();
    ffLeggiModulo();
    ffRender();
    sbAvviso('Foglio firmato caricato.');
    if (ff.origine === 'intervento') ffRenderSezioneIntervento(ff.id);
  } catch(e) {
    // file caricato ma riga non salvata: niente file orfani
    if (caricato) await sbEliminaFile(FF_BUCKET + '/' + path);
    btn.disabled = false; btn.textContent = 'Carica';
    ffErrore('Foglio non caricato: ' + (e && e.message ? e.message : 'riprova.'), 'ffCaricaErr');
  }
}

// Riquadro "Fogli firma" nella scheda dell'intervento (area-riservata.js, apriDettaglioIntervento)
async function ffRenderSezioneIntervento(intId) {
  const box = ffEl('intFogliFirma');
  if (!box) return;
  try {
    const fogli = await ffLeggi('fogli_firma?intervento_id=eq.' + intId + '&select=id,giorno,file,nome_file,note&order=giorno,caricato_il');
    await sbFirmaRighe(fogli, 'file');
    if (ffEl('intFogliFirma') !== box) return;
    box.innerHTML = (fogli.length
      ? fogli.map(f => '<div class="lr"><div class="mid"><b>' + ffEsc(ffDataIt(f.giorno)) + '</b><span class="sub">' + ffEsc(f.nome_file || 'Foglio firma') + (f.note ? ' · ' + ffEsc(f.note) : '') + '</span></div>' + sbLinkFile(f.file, f._file) + '</div>').join('')
      : '<p class="note">Nessun foglio firmato caricato.</p>')
      + '<div class="bar mt6"><button class="btn sm" onclick="ffApri(\'intervento\',' + intId + ')">Foglio firma: stampa o carica</button></div>';
  } catch(e) {
    box.innerHTML = '<p class="note">Non disponibile.</p>';
  }
}

// Quando l'evento crea il suo intervento: scansioni e impostazioni passano all'intervento
async function ffPassaAIntervento(eventoId, intId, conf) {
  try {
    await sbFetch(SUPA_URL + '/rest/v1/fogli_firma?evento_id=eq.' + eventoId + '&intervento_id=is.null', {
      method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ intervento_id: intId }), silenzioso: true,
    });
    if (conf && Object.keys(conf).length) {
      await sbFetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + intId, {
        method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ foglio_firma: conf }), silenzioso: true,
      });
    }
  } catch(e) { /* l'intervento è creato comunque; i fogli restano visibili dall'evento */ }
}
