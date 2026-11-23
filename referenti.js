// ============================================================
// REFERENTI — prefisso ref*. Tabella referenti (supabase/referenti.sql).
// - Scheda personale: riquadro "I tuoi riferimenti" (funzione SQL miei_referenti: solo il
//   caposquadra della propria squadra, il coordinatore e la segreteria).
// - Impostazioni: riquadro "Referenti" (permesso 'referenti'). Le righe non si cancellano:
//   cambiare o togliere un referente mette attivo = false e la data "al" (storico).
// ============================================================

const REF_RUOLI = { CAPOSQUADRA: 'Caposquadra', COORDINATORE: 'Coordinatore', SEGRETERIA: 'Segreteria' };
let refDati = { righe: [], volontari: [] };

// Numero per WhatsApp: solo cifre, prefisso 39 se manca
function refWa(tel) {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.length === 9 || n.length === 10) n = '39' + n;
  return n;
}

// -- SCHEDA PERSONALE --
async function refRenderPersonale() {
  const box = document.getElementById('spReferenti');
  if (!box) return;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/rpc/miei_referenti', { method: 'POST', headers: HJ, body: '{}', silenzioso: true });
    if (!res.ok) throw new Error('errore');
    const righe = await res.json();
    if (!Array.isArray(righe) || !righe.length) return;
    box.innerHTML = '<h2>I tuoi riferimenti</h2>' + righe.map(r => {
      const ruolo = (REF_RUOLI[r.ruolo] || r.ruolo) + (r.ruolo === 'CAPOSQUADRA' && r.squadra ? ' · ' + r.squadra : '');
      const tel = String(r.telefono || '').trim();
      const mail = String(r.email || '').trim();
      const btn = [];
      if (tel) {
        btn.push('<a class="btn sm" href="tel:' + aggEsc(tel.replace(/[^\d+]/g, '')) + '">Chiama</a>');
        btn.push('<a class="btn sm" href="https://wa.me/' + refWa(tel) + '" target="_blank" rel="noopener">WhatsApp</a>');
      }
      if (mail) btn.push('<a class="btn sm" href="mailto:' + aggEsc(mail) + '">Email</a>');
      return '<div class="lr ref-riga"><div class="mid"><b>' + aggEsc(r.nome || '—') + '</b>'
        + '<span class="sub">' + aggEsc(ruolo) + (tel ? ' · ' + aggEsc(tel) : '') + '</span></div>'
        + '<div class="ref-azioni">' + btn.join('') + '</div></div>';
    }).join('');
    box.hidden = false;
  } catch(e) { /* riquadro non disponibile: la scheda resta com'era */ }
}

// -- IMPOSTAZIONI --
async function refCaricaImpostazioni() {
  const card = document.getElementById('refImpoBox');
  const box = document.getElementById('refImpo');
  if (!card || !box) return;
  card.hidden = !hasPerm('referenti');
  if (card.hidden) return;
  box.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const [r1, r2] = await Promise.all([
      sbFetch(SUPA_URL + '/rest/v1/referenti?attivo=is.true&select=id,ruolo,squadra,volontario_id,nome_libero,ordine&order=ordine,id', { headers: H }),
      sbFetch(SUPA_URL + '/rest/v1/volontari?stato=neq.DIMESSO&select=id,cognome,nome,squadra&order=cognome,nome', { headers: H }),
    ]);
    sbOk(r1); sbOk(r2);
    refDati = { righe: await r1.json(), volontari: await r2.json() };
    refRenderImpostazioni();
  } catch(e) { box.innerHTML = '<div class="loading-msg">Non disponibile.</div>'; }
}

function refNomeVol(id) {
  const v = refDati.volontari.find(x => x.id === id);
  return v ? (v.cognome + ' ' + v.nome) : '(volontario non trovato)';
}

function refSelect(idEl, scelto, vuota) {
  return '<select class="vol-form-inp" id="' + idEl + '"><option value="">' + vuota + '</option>'
    + refDati.volontari.map(v => '<option value="' + v.id + '"' + (v.id === scelto ? ' selected' : '') + '>'
      + aggEsc(v.cognome + ' ' + v.nome + (v.squadra ? ' (' + v.squadra + ')' : '')) + '</option>').join('')
    + '</select>';
}

function refRenderImpostazioni() {
  const box = document.getElementById('refImpo');
  const squadre = [...new Set(refDati.volontari.map(v => (v.squadra || '').trim().toUpperCase()).filter(Boolean)
    .concat(refDati.righe.filter(r => r.ruolo === 'CAPOSQUADRA').map(r => r.squadra.toUpperCase())))].sort();

  let html = '<div class="grp">Caposquadra referente (uno per squadra)</div>';
  html += squadre.map(sq => {
    const r = refDati.righe.find(x => x.ruolo === 'CAPOSQUADRA' && x.squadra.toUpperCase() === sq);
    return '<div class="ref-impo-riga"><span class="ref-sq">' + aggEsc(sq) + '</span>'
      + refSelect('refCapo_' + sq, r ? r.volontario_id : null, '— nessuno —')
      + '<button class="btn sm pri" onclick="refSalvaCapo(\'' + aggEsc(sq) + '\')">Salva</button></div>';
  }).join('');

  ['COORDINATORE', 'SEGRETERIA'].forEach(ruolo => {
    html += '<div class="grp">' + REF_RUOLI[ruolo] + '</div>';
    html += refDati.righe.filter(r => r.ruolo === ruolo).map(r => '<div class="ref-impo-riga"><span class="ref-nome">'
      + aggEsc(r.volontario_id ? refNomeVol(r.volontario_id) : (r.nome_libero || '—')) + '</span>'
      + '<button class="btn sm danger" onclick="refTogli(' + r.id + ')">Togli</button></div>').join('');
    html += '<div class="ref-impo-riga">' + refSelect('refNuovo_' + ruolo, null, '— aggiungi —')
      + '<button class="btn sm pri" onclick="refAggiungi(\'' + ruolo + '\')">Aggiungi</button></div>';
  });
  box.innerHTML = html;
}

async function refChiudi(id) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/referenti?id=eq.' + id, {
    method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ attivo: false, al: new Date().toISOString().slice(0, 10), aggiornato_il: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('non salvato');
}

async function refInserisci(riga) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/referenti', {
    method: 'POST', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify(riga),
  });
  if (!res.ok) throw new Error('non salvato');
}

async function refSalvaCapo(sq) {
  const sel = document.getElementById('refCapo_' + sq);
  const nuovo = sel && sel.value ? Number(sel.value) : null;
  const vecchio = refDati.righe.find(x => x.ruolo === 'CAPOSQUADRA' && x.squadra.toUpperCase() === sq);
  if ((vecchio ? vecchio.volontario_id : null) === nuovo) return;
  try {
    if (vecchio) await refChiudi(vecchio.id);
    if (nuovo) await refInserisci({ ruolo: 'CAPOSQUADRA', squadra: sq, volontario_id: nuovo });
    await logAttivita('ha impostato il caposquadra referente di ' + sq + ': ' + (nuovo ? refNomeVol(nuovo) : 'nessuno'));
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  refCaricaImpostazioni();
}

async function refAggiungi(ruolo) {
  const sel = document.getElementById('refNuovo_' + ruolo);
  const id = sel && sel.value ? Number(sel.value) : null;
  if (!id) return;
  if (refDati.righe.some(r => r.ruolo === ruolo && r.volontario_id === id)) { sbAvviso('È già presente.'); return; }
  try {
    const ordine = Math.max(0, ...refDati.righe.filter(r => r.ruolo === ruolo).map(r => r.ordine || 0)) + 1;
    await refInserisci({ ruolo: ruolo, volontario_id: id, ordine: ordine });
    await logAttivita('ha aggiunto ' + refNomeVol(id) + ' come ' + REF_RUOLI[ruolo]);
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  refCaricaImpostazioni();
}

async function refTogli(id) {
  const r = refDati.righe.find(x => x.id === id);
  if (!r) return;
  const nome = r.volontario_id ? refNomeVol(r.volontario_id) : (r.nome_libero || '');
  if (!confirm('Togliere ' + nome + ' da ' + REF_RUOLI[r.ruolo] + '?')) return;
  try {
    await refChiudi(id);
    await logAttivita('ha tolto ' + nome + ' da ' + REF_RUOLI[r.ruolo]);
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  refCaricaImpostazioni();
}
