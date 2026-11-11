// ============================================================
// ARCHIVIO DOCUMENTI (Google Drive) — prefisso arc*
// ============================================================
// Attestati e documenti del volontario archiviati sul Drive condiviso, in sola lettura,
// tramite la Edge Function archivio-volontario (token della sessione, mai link diretti a Drive).
// I file si dividono così:
//   - attestati dei corsi obbligatori (4 ore, 12 ore, Caposquadra)  → scheda Formazione
//   - abilitazioni (file "Abilitazione - …", voci abilitazione del catalogo, DAE) → scheda Abilitazioni
//   - altri attestati (cartella Attestati)                          → scheda Attestati, divisi per anno
//   - cartella Documenti (adesione, privacy…)                       → scheda Documenti
// In evidenza solo gli attestati in vigore; precedenti, sostituiti e scaduti in un <details> chiuso.
// Staff: permesso volontari o documenti_volontari (master di default), in scheda-volontario.js.
// Volontario: card nella scheda personale (arcRenderPersonale), solo i propri file.
// ============================================================

const ARC_URL = SUPA_URL + '/functions/v1/archivio-volontario';
const ARC_GIORNI_AVVISO = 60;

// Corsi obbligatori: il tipo è quello di SV_CORSI; si riconoscono dal titolo del file
const ARC_CORSI = [
  { tipo: '4_ORE',  label: 'Corso 4 ore',       campo: 'quattro_ore',  re: /sensibilizzazione\s+(al\s+)?rischio|\b4\s*ore\b|quattro\s+ore/i },
  { tipo: '12_ORE', label: 'Corso 12 ore',      campo: 'dodici_ore',   re: /rischio\s+alto|\b12\s*ore\b|dodici\s+ore/i },
  { tipo: 'CAPOSQ', label: 'Corso Caposquadra', campo: 'corso_caposq', re: /capo\s*squadra/i },
];
// DAE: abilitazione (non più corso obbligatorio); campi volontari.dae e scad_dae
const ARC_DAE = { tipo: 'DAE', label: 'DAE', campo: 'dae', scadenza: 'scad_dae', re: /defibrillat|\bDAE\b|\bBLSD\b|\bAED\b/i };

let arcCache = {};          // volontario_id → { file } oppure { errore }
let arcVolPersonale = null; // volontario della scheda personale aperta

function arcPuoStaff() { return hasPerm('documenti_volontari') || hasPerm('volontari'); }

// sbFetch sostituisce il corpo delle letture negate: il messaggio si ricava dal codice
function arcErrore(status) {
  if (status === 401) return 'Sessione scaduta: esci e rientra.';
  if (status === 403) return 'Non autorizzato.';
  if (status === 404) return 'Non trovato.';
  return 'Archivio non disponibile, riprova tra poco.';
}

function arcData(iso) { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT') : ''; }

// '' | 'scaduto' | 'scadenza' (entro 60 giorni)
function arcScadenza(iso) {
  if (!iso) return '';
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const giorni = (new Date(iso + 'T00:00:00') - oggi) / 86400000;
  if (giorni < 0) return 'scaduto';
  return giorni <= ARC_GIORNI_AVVISO ? 'scadenza' : '';
}

// -- CATALOGO CORSI (formazione_catalogo): stesse regole di formazione_voce() nel database --
let arcCatalogo = null;   // null = non ancora letto; [] = non disponibile
async function arcCaricaCatalogo() {
  if (arcCatalogo) return arcCatalogo;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/formazione_catalogo?attivo=eq.true&select=id,tipo,codice,titolo,parole_chiave,ordine&order=ordine,id', { headers: H });
    arcCatalogo = res.ok ? await res.json() : [];
  } catch(e) { arcCatalogo = []; }
  return arcCatalogo;
}
function arcNorm(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function arcHaParola(c, titolo) {
  const t = ' ' + arcNorm(titolo) + ' ';
  return (c.parole_chiave || []).some(k => arcNorm(k) && t.includes(' ' + arcNorm(k)));
}
// Voce del catalogo per tipo e titolo: la prima (per ordine) con una parola chiave a inizio parola
function arcVoce(tipo, titolo) {
  if (!arcCatalogo || !arcCatalogo.length) return null;
  return arcCatalogo.find(c => c.tipo === tipo && arcHaParola(c, titolo))
    || (tipo === 'ABILITAZIONE' ? arcCatalogo.find(c => c.codice === 'DA_VERIFICARE') || null : null);
}
// DAE: parole chiave della voce DAE del catalogo (qualunque tipo abbia), altrimenti l'espressione di ARC_DAE
function arcEDae(f) {
  const testo = (f.titolo || '') + ' ' + (f.nome_file || '');
  const voce = arcCatalogo && arcCatalogo.find(c => c.codice === 'DAE');
  return voce ? arcHaParola(voce, testo) : ARC_DAE.re.test(testo);
}
// Voce di un'abilitazione (il DAE ha sempre la sua)
function arcVoceAbil(f) {
  if (arcEDae(f)) return (arcCatalogo && arcCatalogo.find(c => c.codice === 'DAE')) || { id: 'DAE', codice: 'DAE', titolo: 'DAE', ordine: 19 };
  return arcVoce('ABILITAZIONE', f.titolo || '');
}

// Elenco dei file: { file: [...] } oppure { errore: '...' }. ricarica = true ignora la copia in memoria
async function arcCarica(volId, ricarica) {
  if (!ricarica && arcCache[volId] && arcCache[volId].file) return arcCache[volId];
  const catalogo = arcCaricaCatalogo();   // in parallelo: serve a dividere le abilitazioni per voce
  let esito;
  try {
    const res = await sbFetch(ARC_URL + '?azione=lista&volontario_id=' + encodeURIComponent(volId), { headers: {} });
    const d = await res.json().catch(() => ({}));
    esito = res.ok && d.ok ? { file: d.file || [] } : { errore: arcErrore(res.status) };
  } catch(e) { esito = { errore: arcErrore(0) }; }
  await catalogo;
  arcCache[volId] = esito;
  return esito;
}

// Corso obbligatorio dal catalogo (parole chiave); senza catalogo valgono le espressioni di ARC_CORSI
function arcCorsoDi(f) {
  if (f.categoria !== 'Attestati' || arcEDae(f)) return null;
  const testo = (f.titolo || '') + ' ' + (f.nome_file || '');
  if (arcCatalogo && arcCatalogo.length) {
    const v = arcVoce('CORSO', testo);
    return v && ARC_CORSI.some(x => x.tipo === v.codice) ? v.codice : null;
  }
  const c = ARC_CORSI.find(x => x.re.test(testo));
  return c ? c.tipo : null;
}

// Abilitazione: nome "Abilitazione - …", DAE, oppure titolo riconosciuto da una voce abilitazione
// del catalogo ("Da verificare" esclusa), come nell'import della Edge Function
function arcEAbilitazione(f) {
  if (/^abilitazion/i.test(f.tipo || '') || arcEDae(f)) return true;
  const v = arcVoce('ABILITAZIONE', f.titolo || '');
  return !!v && v.codice !== 'DA_VERIFICARE';
}

// { corsi: { '4_ORE': [...] … }, dae: [...], abilitazioni: [...] (DAE compreso), attestati: [...], documenti: [...] }
function arcDividi(file) {
  const out = { corsi: {}, dae: [], abilitazioni: [], attestati: [], documenti: [] };
  ARC_CORSI.forEach(c => { out.corsi[c.tipo] = []; });
  (file || []).forEach(f => {
    if (f.categoria === 'Documenti') { out.documenti.push(f); return; }
    const corso = arcCorsoDi(f);
    if (corso) out.corsi[corso].push(f);
    else if (arcEAbilitazione(f)) { out.abilitazioni.push(f); if (arcEDae(f)) out.dae.push(f); }
    else out.attestati.push(f);
  });
  return out;
}

// Stato di un corso o abilitazione da più fonti: date e scadenze di file Drive, righe di registro, campi del volontario.
// date/scadenze: elenchi di 'AAAA-MM-GG' (anche null). Vale la data più recente e la scadenza più lontana.
function arcInfoCorso(svolto, date, scadenze) {
  const ultima = l => l.filter(Boolean).sort().pop() || null;
  const data = ultima(date), scadenza = ultima(scadenze);
  const sc = svolto ? arcScadenza(scadenza) : '';
  const pill = !svolto ? '<span class="pill p-grey">Non svolto</span>'
    : sc === 'scaduto' ? '<span class="pill p-red">Scaduto</span>'
    : sc === 'scadenza' ? '<span class="pill p-yellow">In scadenza</span>'
    : '<span class="pill p-blue">Svolto</span>';
  const testo = [data ? 'Svolto il ' + arcData(data) : '', scadenza ? (sc === 'scaduto' ? 'scaduto il ' : 'valido fino al ') + arcData(scadenza) : ''].filter(Boolean).join(' · ');
  return { data, scadenza, pill, testo };
}

function arcRiga(volId, f, rinnovato) {
  const sc = rinnovato ? 'rinnovato' : arcScadenza(f.scadenza);
  const pill = sc === 'scaduto' ? '<span class="pill p-red">Scaduto</span>' : sc === 'scadenza' ? '<span class="pill p-yellow">In scadenza</span>'
    : sc === 'rinnovato' ? '<span class="pill p-grey">Rinnovato</span>' : '';
  const meta = [f.tipo, arcData(f.data), f.scadenza ? 'scade il ' + arcData(f.scadenza) : ''].filter(Boolean).join(' · ');
  const apri = 'arcApri(' + Number(volId) + ',\'' + aggEsc(f.id) + '\')';
  return '<div class="doc-item"><div class="doc-item-info" style="cursor:pointer" onclick="' + apri + '">'
    + '<div class="doc-item-name">' + aggEsc(f.titolo || f.nome_file) + '</div>'
    + '<div class="doc-item-meta">' + aggEsc(meta) + '</div></div>'
    + pill + '<div class="doc-item-actions"><button class="btn sm" onclick="' + apri + '">Apri</button></div></div>';
}

// Elenco semplice (documenti)
function arcRighe(volId, elenco, vuoto) {
  if (!elenco.length) return vuoto ? '<p class="note m0 mb10">' + vuoto + '</p>' : '';
  return elenco.map(f => arcRiga(volId, f, false)).join('');
}

// -- IN VIGORE E STORICO --
// Menu chiuso per lo storico (attestati precedenti, sostituiti o scaduti; anni passati)
function arcDettagli(titolo, html) {
  return html ? '<details class="arc-storico"><summary>' + aggEsc(titolo) + '</summary>' + html + '</details>' : '';
}
// Ordine "più recente": data, poi scadenza (vale per file Drive e righe di registro)
function arcChiave(x) { return (x.data || x.data_corso || '') + '|' + (x.scadenza || ''); }
function arcPiuRecentiPrima(l) { return l.slice().sort((a, b) => arcChiave(b).localeCompare(arcChiave(a))); }

// Divide in { validi, storico }: per ogni gruppo (stesso corso o abilitazione) è valido solo il più
// recente, e solo se non è scaduto (sempreUltimo: il più recente resta valido anche se scaduto).
// Elementi dello storico: { x, scaduto } (scaduto = è l'ultimo ma scaduto; altrimenti è stato sostituito).
function arcValidiStorico(elenco, gruppoDi, sempreUltimo) {
  const gruppi = new Map();
  elenco.forEach(x => { const k = gruppoDi(x); if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(x); });
  const validi = [], storico = [];
  gruppi.forEach(l => {
    const [u, ...altri] = arcPiuRecentiPrima(l);
    if (sempreUltimo || arcScadenza(u.scadenza) !== 'scaduto') validi.push(u);
    else storico.push({ x: u, scaduto: true });
    altri.forEach(x => storico.push({ x, scaduto: false }));
  });
  return { validi, storico };
}

// Attestati dello stesso corso obbligatorio: in evidenza il più recente (anche se scaduto, con pill rossa)
function arcRigheCorso(volId, elenco) {
  if (!elenco.length) return '';
  const { validi, storico } = arcValidiStorico(elenco, () => 1, true);
  return validi.map(f => arcRiga(volId, f, false)).join('')
    + arcDettagli('Storico attestati (' + storico.length + ')', storico.map(s => arcRiga(volId, s.x, !!s.x.scadenza)).join(''));
}

// Abilitazioni divise per voce di catalogo: sopra le valide, sotto (menu chiuso) scadute o sostituite
function arcRigheVoci(volId, elenco, vuoto) {
  if (!elenco.length) return vuoto ? '<p class="note m0 mb10">' + vuoto + '</p>' : '';
  const voce = f => arcVoceAbil(f) || { id: 0, titolo: 'Altro', ordine: 1000 };
  const { validi, storico } = arcValidiStorico(elenco, f => { const v = voce(f); return v.codice === 'DA_VERIFICARE' || !v.id ? 'f:' + f.id : v.id; });
  const gruppi = new Map();
  validi.forEach(f => { const v = voce(f); const k = v.id || 'altro'; if (!gruppi.has(k)) gruppi.set(k, { v, file: [] }); gruppi.get(k).file.push(f); });
  const sopra = [...gruppi.values()].sort((a, b) => a.v.ordine - b.v.ordine)
    .map(g => '<div class="sub mt10"><b>' + aggEsc(g.v.titolo) + '</b></div>' + arcPiuRecentiPrima(g.file).map(f => arcRiga(volId, f, false)).join('')).join('');
  return (sopra || '<p class="note m0 mb10">Nessuna abilitazione in corso di validità.</p>')
    + arcDettagli('Storico attestati (' + storico.length + ')', arcPiuRecentiPrima(storico.map(s => s.x))
        .map(f => arcRiga(volId, f, !storico.find(s => s.x === f).scaduto && !!f.scadenza)).join(''));
}

// -- PER ANNO --
// Anno di un attestato o intervento: dalla data, altrimenti un anno scritto nel titolo o nel nome del file
function arcAnnoDi(x, dataDi) {
  const d = dataDi ? dataDi(x) : x.data;
  if (d) return String(d).slice(0, 4);
  const m = ((x.titolo || '') + ' ' + (x.nome_file || '')).match(/\b(19[5-9]\d|20\d\d)\b/);
  return m ? m[1] : null;
}
// { corrente: [...], anni: [['2025', [...]], …] dal più recente, senza: [...] }
function arcDividiPerAnno(elenco, dataDi) {
  const oggi = String(new Date().getFullYear());
  const out = { corrente: [], anni: [], senza: [] };
  const mappa = new Map();
  elenco.forEach(x => {
    const a = arcAnnoDi(x, dataDi);
    if (!a) out.senza.push(x);
    else if (a === oggi) out.corrente.push(x);
    else { if (!mappa.has(a)) mappa.set(a, []); mappa.get(a).push(x); }
  });
  out.anni = [...mappa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  return out;
}
// Righe divise per anno: sopra l'anno in corso, sotto un menu chiuso per ogni anno precedente e "Senza data"
function arcRigheAnni(elenco, riga, vuoto, dataDi) {
  if (!elenco.length) return vuoto ? '<p class="note m0 mb10">' + vuoto + '</p>' : '';
  const ord = l => l.slice().sort((a, b) => String((dataDi ? dataDi(b) : b.data) || '').localeCompare(String((dataDi ? dataDi(a) : a.data) || '')));
  const p = arcDividiPerAnno(elenco, dataDi);
  return (p.corrente.length ? ord(p.corrente).map(riga).join('') : '<p class="note m0 mb10">Niente nel ' + new Date().getFullYear() + '.</p>')
    + p.anni.map(([a, l]) => arcDettagli(a + ' (' + l.length + ')', ord(l).map(riga).join(''))).join('')
    + arcDettagli('Senza data (' + p.senza.length + ')', p.senza.map(riga).join(''));
}
function arcRigheAttestati(volId, elenco, vuoto) {
  return arcRigheAnni(elenco, f => arcRiga(volId, f, false), vuoto);
}

// Caricamento, oppure errore con Riprova
function arcStatoHtml(esito, riprova) {
  if (!esito) return '<p class="note m0 mb10">Caricamento archivio…</p>';
  return '<p class="note m0 mb10 bad">' + aggEsc(esito.errore) + '</p>'
    + (riprova ? '<button class="btn sm mb10" onclick="' + riprova + '">Riprova</button>' : '');
}

// Apre il file in una nuova scheda: la scheda si apre subito (altrimenti il telefono la blocca),
// poi riceve il file scaricato con il token della sessione.
async function arcApri(volId, fileId) {
  const c = arcCache[volId];
  const f = c && c.file ? c.file.find(x => x.id === fileId) : null;
  const finestra = window.open('', '_blank');
  if (finestra) { try { finestra.document.title = 'Apertura…'; finestra.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">Apertura del documento…</p>'; } catch(e) {} }
  try {
    const res = await sbFetch(ARC_URL + '?azione=file&volontario_id=' + encodeURIComponent(volId) + '&file_id=' + encodeURIComponent(fileId), { headers: {} });
    if (!res.ok) throw new Error(arcErrore(res.status));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (finestra && !finestra.closed) finestra.location.href = url;
    else {
      // finestra bloccata: si scarica il file
      const a = document.createElement('a');
      a.href = url; a.download = (f && f.nome_file) || 'documento.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch(e) {
    if (finestra) finestra.close();
    alert('Errore: ' + e.message);
  }
}

// -- SCHEDA PERSONALE DEL VOLONTARIO --
// Card: Corsi obbligatori (con i loro attestati), Abilitazioni (DAE compreso), Attestati per anno, Documenti
const ARC_CARD_PERS = { spArcCorsi: 'Corsi obbligatori', spArcAbilitazioni: 'Abilitazioni', spArcAttestati: 'Attestati', spArcDocumenti: 'Documenti archiviati' };

async function arcRenderPersonale(v, ricarica) {
  const box = id => document.getElementById(id);
  if (!box('spArcCorsi')) return;
  arcVolPersonale = v;
  Object.keys(ARC_CARD_PERS).forEach(id => { box(id).innerHTML = '<h2>' + ARC_CARD_PERS[id] + '</h2>' + arcStatoHtml(null); box(id).hidden = false; });
  const esito = await arcCarica(v.id, ricarica);
  if (!box('spArcCorsi') || arcVolPersonale !== v) return;
  if (esito.errore) {
    box('spArcCorsi').innerHTML = '<h2>Archivio documenti</h2>' + arcStatoHtml(esito, 'arcRiprovaPersonale()');
    ['spArcAbilitazioni', 'spArcAttestati', 'spArcDocumenti'].forEach(id => { box(id).hidden = true; });
    return;
  }
  const d = arcDividi(esito.file);
  box('spArcCorsi').innerHTML = '<h2>Corsi obbligatori</h2>' + ARC_CORSI.map(c => {
    const file = d.corsi[c.tipo];
    const info = arcInfoCorso(!!v[c.campo] || file.length > 0, file.map(f => f.data), file.map(f => f.scadenza));
    return '<div class="sv-corso"><div class="sv-corso-h"><b class="sv-corso-t">' + c.label + '</b>' + info.pill + '</div>'
      + (info.testo ? '<span class="sub">' + info.testo + '</span>' : '')
      + arcRigheCorso(v.id, file) + '</div>';
  }).join('');
  // DAE: stato dai file e dai campi del volontario, poi le abilitazioni per voce (attestati del DAE compresi)
  const dae = (v.dae || d.dae.length)
    ? (() => { const i = arcInfoCorso(true, d.dae.map(f => f.data), d.dae.map(f => f.scadenza).concat([v.scad_dae]));
        return '<div class="sv-corso"><div class="sv-corso-h"><b class="sv-corso-t">DAE</b>' + i.pill + '</div>' + (i.testo ? '<span class="sub">' + i.testo + '</span>' : '') + '</div>'; })()
    : '';
  box('spArcAbilitazioni').innerHTML = '<h2>Abilitazioni</h2>' + dae + arcRigheVoci(v.id, d.abilitazioni, dae ? '' : 'Nessuna abilitazione archiviata.');
  box('spArcAttestati').innerHTML = '<h2>Attestati</h2>' + arcRigheAttestati(v.id, d.attestati, 'Nessun attestato archiviato.');
  box('spArcDocumenti').innerHTML = '<h2>Documenti archiviati</h2>' + arcRighe(v.id, d.documenti, 'Nessun documento archiviato.');
}
function arcRiprovaPersonale() { if (arcVolPersonale) arcRenderPersonale(arcVolPersonale, true); }
