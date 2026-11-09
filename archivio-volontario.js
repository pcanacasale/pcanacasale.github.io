// ============================================================
// ARCHIVIO DOCUMENTI (Google Drive) — prefisso arc*
// ============================================================
// Attestati e documenti del volontario archiviati sul Drive condiviso, in sola lettura,
// tramite la Edge Function archivio-volontario (token della sessione, mai link diretti a Drive).
// Staff: scheda "Archivio" della scheda volontario, permesso documenti_volontari oppure volontari (master di default).
// Volontario: card nella scheda personale, solo i propri file (lo ricontrolla la funzione).
// ============================================================

const ARC_URL = SUPA_URL + '/functions/v1/archivio-volontario';
const ARC_CATEGORIE = ['Attestati', 'Documenti'];
const ARC_GIORNI_AVVISO = 60;

let arcStato = {};   // id del box → { volId, file, cat, giro }

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

// Disegna l'archivio dentro il box indicato e carica l'elenco
async function arcMostra(boxId, volId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const giro = ((arcStato[boxId] && arcStato[boxId].giro) || 0) + 1;
  arcStato[boxId] = { volId, file: [], cat: 'Attestati', giro };
  box.innerHTML = '<h2>Archivio documenti</h2><p class="note m0">Caricamento…</p>';
  try {
    const res = await sbFetch(ARC_URL + '?azione=lista&volontario_id=' + encodeURIComponent(volId), { headers: {} });
    const d = await res.json().catch(() => ({}));
    if (!arcStato[boxId] || arcStato[boxId].giro !== giro) return;
    if (!res.ok || !d.ok) throw new Error(arcErrore(res.status));
    arcStato[boxId].file = d.file || [];
    if (!arcStato[boxId].file.some(f => f.categoria === 'Attestati') && arcStato[boxId].file.length) arcStato[boxId].cat = 'Documenti';
    arcRender(boxId);
  } catch(e) {
    if (!arcStato[boxId] || arcStato[boxId].giro !== giro) return;
    box.innerHTML = '<h2>Archivio documenti</h2><p class="note m0 bad">' + aggEsc(e.message || 'Archivio non disponibile.') + '</p>'
      + '<button class="btn sm mt10" onclick="arcMostra(\'' + boxId + '\',' + Number(volId) + ')">Riprova</button>';
  }
}

function arcScegli(boxId, cat) {
  if (!arcStato[boxId]) return;
  arcStato[boxId].cat = cat;
  arcRender(boxId);
}

function arcRender(boxId) {
  const box = document.getElementById(boxId);
  const st = arcStato[boxId];
  if (!box || !st) return;
  const chips = ARC_CATEGORIE.map(c =>
    '<button class="chip' + (c === st.cat ? ' on' : '') + '" role="tab" aria-selected="' + (c === st.cat) + '" onclick="arcScegli(\'' + boxId + '\',\'' + c + '\')">'
    + c + ' <span class="n">' + st.file.filter(f => f.categoria === c).length + '</span></button>').join('');
  const righe = st.file.filter(f => f.categoria === st.cat);
  box.innerHTML = '<h2>Archivio documenti</h2><div class="chips mb6" role="tablist">' + chips + '</div>'
    + (righe.length ? righe.map(f => arcRiga(boxId, f)).join('') : '<div class="empty">Nessun documento archiviato.</div>');
}

function arcRiga(boxId, f) {
  const sc = arcScadenza(f.scadenza);
  const pill = sc === 'scaduto' ? '<span class="pill p-red">Scaduto</span>' : sc === 'scadenza' ? '<span class="pill p-yellow">In scadenza</span>' : '';
  const meta = [f.tipo, arcData(f.data), f.scadenza ? 'scade il ' + arcData(f.scadenza) : ''].filter(Boolean).join(' · ');
  const apri = 'arcApri(\'' + boxId + '\',\'' + aggEsc(f.id) + '\')';
  return '<div class="doc-item"><div class="doc-item-info" style="cursor:pointer" onclick="' + apri + '">'
    + '<div class="doc-item-name">' + aggEsc(f.titolo || f.nome_file) + '</div>'
    + '<div class="doc-item-meta">' + aggEsc(meta) + '</div></div>'
    + pill + '<div class="doc-item-actions"><button class="btn sm" onclick="' + apri + '">Apri</button></div></div>';
}

// Apre il file in una nuova scheda: la scheda si apre subito (altrimenti il telefono la blocca),
// poi riceve il file scaricato con il token della sessione.
async function arcApri(boxId, fileId) {
  const st = arcStato[boxId];
  if (!st) return;
  const f = st.file.find(x => x.id === fileId);
  const finestra = window.open('', '_blank');
  if (finestra) { try { finestra.document.title = 'Apertura…'; finestra.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">Apertura del documento…</p>'; } catch(e) {} }
  try {
    const res = await sbFetch(ARC_URL + '?azione=file&volontario_id=' + encodeURIComponent(st.volId) + '&file_id=' + encodeURIComponent(fileId), { headers: {} });
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
