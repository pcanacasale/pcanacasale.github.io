// ============================================================
// ARCHIVIO DOCUMENTI (Google Drive) — prefisso arc*
// ============================================================
// Attestati e documenti del volontario archiviati sul Drive condiviso, in sola lettura,
// tramite la Edge Function archivio-volontario (token della sessione, mai link diretti a Drive).
// I file si dividono così:
//   - attestati dei corsi fissi (4 ore, 12 ore, Caposquadra, DAE) → scheda Formazione
//   - altri attestati (cartella Attestati)                          → scheda Attestati
//   - cartella Documenti (adesione, privacy…)                       → scheda Documenti
// Staff: permesso volontari o documenti_volontari (master di default), in scheda-volontario.js.
// Volontario: card nella scheda personale (arcRenderPersonale), solo i propri file.
// ============================================================

const ARC_URL = SUPA_URL + '/functions/v1/archivio-volontario';
const ARC_GIORNI_AVVISO = 60;

// Corsi fissi: il tipo è quello di SV_CORSI; si riconoscono dal titolo del file
const ARC_CORSI = [
  { tipo: '4_ORE',  label: 'Corso 4 ore',       campo: 'quattro_ore',  re: /sensibilizzazione\s+(al\s+)?rischio|\b4\s*ore\b|quattro\s+ore/i },
  { tipo: '12_ORE', label: 'Corso 12 ore',      campo: 'dodici_ore',   re: /rischio\s+alto|\b12\s*ore\b|dodici\s+ore/i },
  { tipo: 'CAPOSQ', label: 'Corso Caposquadra', campo: 'corso_caposq', re: /capo\s*squadra/i },
  { tipo: 'DAE',    label: 'DAE',               campo: 'dae',          re: /defibrillat|\bDAE\b|\bBLSD\b|\bAED\b/i },
];

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

// Elenco dei file: { file: [...] } oppure { errore: '...' }. ricarica = true ignora la copia in memoria
async function arcCarica(volId, ricarica) {
  if (!ricarica && arcCache[volId] && arcCache[volId].file) return arcCache[volId];
  let esito;
  try {
    const res = await sbFetch(ARC_URL + '?azione=lista&volontario_id=' + encodeURIComponent(volId), { headers: {} });
    const d = await res.json().catch(() => ({}));
    esito = res.ok && d.ok ? { file: d.file || [] } : { errore: arcErrore(res.status) };
  } catch(e) { esito = { errore: arcErrore(0) }; }
  arcCache[volId] = esito;
  return esito;
}

function arcCorsoDi(f) {
  if (f.categoria !== 'Attestati') return null;
  const testo = (f.titolo || '') + ' ' + (f.nome_file || '');
  const c = ARC_CORSI.find(x => x.re.test(testo));
  return c ? c.tipo : null;
}

// { corsi: { '4_ORE': [...] … }, attestati: [...], documenti: [...] }
function arcDividi(file) {
  const out = { corsi: {}, attestati: [], documenti: [] };
  ARC_CORSI.forEach(c => { out.corsi[c.tipo] = []; });
  (file || []).forEach(f => {
    if (f.categoria === 'Documenti') { out.documenti.push(f); return; }
    const corso = arcCorsoDi(f);
    if (corso) out.corsi[corso].push(f); else out.attestati.push(f);
  });
  return out;
}

function arcRiga(volId, f) {
  const sc = arcScadenza(f.scadenza);
  const pill = sc === 'scaduto' ? '<span class="pill p-red">Scaduto</span>' : sc === 'scadenza' ? '<span class="pill p-yellow">In scadenza</span>' : '';
  const meta = [f.tipo, arcData(f.data), f.scadenza ? 'scade il ' + arcData(f.scadenza) : ''].filter(Boolean).join(' · ');
  const apri = 'arcApri(' + Number(volId) + ',\'' + aggEsc(f.id) + '\')';
  return '<div class="doc-item"><div class="doc-item-info" style="cursor:pointer" onclick="' + apri + '">'
    + '<div class="doc-item-name">' + aggEsc(f.titolo || f.nome_file) + '</div>'
    + '<div class="doc-item-meta">' + aggEsc(meta) + '</div></div>'
    + pill + '<div class="doc-item-actions"><button class="btn sm" onclick="' + apri + '">Apri</button></div></div>';
}

function arcRighe(volId, elenco, vuoto) {
  return elenco.length ? elenco.map(f => arcRiga(volId, f)).join('') : (vuoto ? '<p class="note m0 mb10">' + vuoto + '</p>' : '');
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
// Tre card: Corsi obbligatori (con i loro attestati), Attestati, Documenti archiviati
const ARC_CARD_PERS = { spArcCorsi: 'Corsi obbligatori', spArcAttestati: 'Attestati', spArcDocumenti: 'Documenti archiviati' };

async function arcRenderPersonale(v, ricarica) {
  const box = id => document.getElementById(id);
  if (!box('spArcCorsi')) return;
  arcVolPersonale = v;
  Object.keys(ARC_CARD_PERS).forEach(id => { box(id).innerHTML = '<h2>' + ARC_CARD_PERS[id] + '</h2>' + arcStatoHtml(null); box(id).hidden = false; });
  const esito = await arcCarica(v.id, ricarica);
  if (!box('spArcCorsi') || arcVolPersonale !== v) return;
  if (esito.errore) {
    box('spArcCorsi').innerHTML = '<h2>Archivio documenti</h2>' + arcStatoHtml(esito, 'arcRiprovaPersonale()');
    box('spArcAttestati').hidden = true;
    box('spArcDocumenti').hidden = true;
    return;
  }
  const d = arcDividi(esito.file);
  box('spArcCorsi').innerHTML = '<h2>Corsi obbligatori</h2>' + ARC_CORSI.map(c => {
    const svolto = !!v[c.campo] || d.corsi[c.tipo].length > 0;
    return '<div class="sv-corso"><div class="sv-corso-h"><b class="sv-corso-t">' + c.label + '</b>'
      + (svolto ? '<span class="pill p-blue">Svolto</span>' : '<span class="pill p-grey">Non svolto</span>') + '</div>'
      + arcRighe(v.id, d.corsi[c.tipo]) + '</div>';
  }).join('');
  box('spArcAttestati').innerHTML = '<h2>Attestati (' + d.attestati.length + ')</h2>' + arcRighe(v.id, d.attestati, 'Nessun attestato archiviato.');
  box('spArcDocumenti').innerHTML = '<h2>Documenti archiviati</h2>' + arcRighe(v.id, d.documenti, 'Nessun documento archiviato.');
}
function arcRiprovaPersonale() { if (arcVolPersonale) arcRenderPersonale(arcVolPersonale, true); }
