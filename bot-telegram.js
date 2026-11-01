// ============================================================
// BOT TELEGRAM — link personali e messaggi massivi, prefisso bt*, permesso eventi.
// ============================================================
// Tutto passa dalla Edge Function bot-app, che ricontrolla il permesso sul server.
// Le segnalazioni con foto arrivano in evento_segnalazioni e si vedono nella scheda dell'evento.
// ============================================================

const BT_URL = SUPA_URL + '/functions/v1/bot-app';
const BT_NON_DISP = 'Non disponibile.';
let btInvio = null;   // { corpo, n, destinatari } in attesa di conferma

function btEl(id) { return document.getElementById(id); }

async function btChiama(azione, dati) {
  const res = await sbFetch(BT_URL, { method: 'POST', headers: HJ, silenzioso: true, body: JSON.stringify(Object.assign({ azione }, dati || {})) });
  let d = {};
  try { d = await res.json(); } catch(e) {}
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 503) throw new Error(BT_NON_DISP);
  if (!res.ok || !d.ok) throw new Error(d.error || BT_NON_DISP);
  return d;
}

function btApriFinestra(titolo, corpo) {
  const ov = btEl('btOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + aggEsc(titolo) + '"><div class="shead"><h2>' + aggEsc(titolo) + '</h2><button class="x" onclick="btChiudi()" aria-label="Chiudi">✕</button></div><div class="sbody form" id="btCorpo">' + corpo + '</div></div>';
  ov.hidden = false;
}

function btChiudi() {
  const ov = btEl('btOv');
  ov.hidden = true; ov.innerHTML = ''; btInvio = null;
}

function btErrore(t) { const e = btEl('btErr'); e.textContent = t; e.style.display = 'block'; }

// -- LINK PERSONALE --
let btVolontario = null;   // { id, nome }

async function btApriLink(id, nome) {
  btVolontario = { id, nome };
  btApriFinestra('Link bot - ' + nome, '<div class="loading-msg">Caricamento…</div>');
  try { btRenderLink(await btChiama('stato', { volontario_id: id })); }
  catch(e) { btEl('btCorpo').innerHTML = '<div class="empty">' + aggEsc(e.message) + '</div>'; }
}

function btRenderLink(s, link) {
  const quando = s.collegato_il ? new Date(s.collegato_il).toLocaleDateString('it-IT') : '';
  btEl('btCorpo').innerHTML = '<div class="form-err" id="btErr"></div>'
    + '<div class="kv"><span>Stato</span><b>' + (s.collegato ? 'Collegato dal ' + aggEsc(quando) : 'Non collegato') + '</b></div>'
    + (link ? '<label>Link personale, monouso, valido 7 giorni<input id="btLink" readonly value="' + aggEsc(link) + '"></label><p class="sub">Invialo solo a questo volontario: chi lo apre per primo viene collegato al suo nome.</p>'
      : '<p class="sub">Il link è personale, si usa una volta e scade dopo 7 giorni. Crearne uno nuovo annulla il precedente.</p>')
    + '<div class="actions">' + (s.collegato ? '<button class="btn danger" onclick="btScollega()">Scollega</button>' : '')
    + (link ? '<button class="btn" onclick="btCopia()">Copia</button>' : '') + '<button class="btn pri" id="btBtnLink" onclick="btCreaLink()">' + (link ? 'Crea un altro link' : 'Crea link') + '</button></div>';
}

async function btCreaLink() {
  const btn = btEl('btBtnLink');
  btn.disabled = true;
  try {
    const [s, l] = await Promise.all([btChiama('stato', { volontario_id: btVolontario.id }), btChiama('crea_link', { volontario_id: btVolontario.id })]);
    btRenderLink(s, l.link);
  } catch(e) { btn.disabled = false; btErrore(e.message); }
}

async function btCopia() {
  const campo = btEl('btLink');
  try { await navigator.clipboard.writeText(campo.value); sbAvviso('Link copiato.'); }
  catch(e) { campo.select(); sbAvviso('Copia il link selezionato.'); }
}

async function btScollega() {
  if (!confirm('Scollegare ' + btVolontario.nome + ' dal bot? Per ricollegarsi servirà un nuovo link.')) return;
  try {
    await btChiama('scollega', { volontario_id: btVolontario.id });
    btRenderLink({ collegato: false });
  } catch(e) { btErrore(e.message); }
}

// -- INVIA MESSAGGIO --
async function btApriInvio(eventoId) {
  btApriFinestra('Invia messaggio', '<div class="loading-msg">Caricamento…</div>');
  let dati, eventi = [];
  try {
    dati = await btChiama('squadre');
    const r = await sbFetch(SUPA_URL + '/rest/v1/eventi?select=id,titolo&order=data_inizio.desc&limit=30', { headers: H });
    if (r.ok) eventi = await r.json();
  } catch(e) { btEl('btCorpo').innerHTML = '<div class="empty">' + aggEsc(e.message) + '</div>'; return; }
  btEl('btCorpo').innerHTML = '<div class="form-err" id="btErr"></div>'
    + '<label>Testo<textarea id="btTesto" rows="5" maxlength="4000"></textarea></label>'
    + '<label>Destinatari<select id="btTipo" onchange="btAggiornaDest()"><option value="tutti">Tutti i collegati (' + dati.n + ')</option>'
    + (dati.squadre.length ? '<option value="squadra">Una squadra</option>' : '') + (eventi.length ? '<option value="evento"' + (eventoId ? ' selected' : '') + '>La squadra di un evento</option>' : '') + '</select></label>'
    + '<label id="btSquadraBox" hidden>Squadra<select id="btSquadra">' + dati.squadre.map(s => '<option>' + aggEsc(s) + '</option>').join('') + '</select></label>'
    + '<label id="btEventoBox" hidden>Evento<select id="btEvento">' + eventi.map(e => '<option value="' + e.id + '"' + (e.id === eventoId ? ' selected' : '') + '>' + aggEsc(e.titolo) + '</option>').join('') + '</select></label>'
    + '<label class="perm-check"><input type="checkbox" id="btArpa"> Allega il bollettino ARPA (livelli e link, solo se il dato è aggiornato)</label>'
    + '<div class="actions"><button class="btn" onclick="btChiudi()">Annulla</button><button class="btn pri" id="btBtnAnteprima" onclick="btAnteprima()">Anteprima</button></div>'
    + '<div class="grp mt14">Ultimi invii</div><div id="btStorico"><div class="loading-msg">Caricamento…</div></div>';
  btAggiornaDest();
  btCaricaStorico();
}

function btAggiornaDest() {
  const tipo = btEl('btTipo').value;
  btEl('btSquadraBox').hidden = tipo !== 'squadra';
  btEl('btEventoBox').hidden = tipo !== 'evento';
}

function btCorpoInvio() {
  const tipo = btEl('btTipo').value;
  return { testo: btEl('btTesto').value.trim(), tipo, squadra: tipo === 'squadra' ? btEl('btSquadra').value : undefined, evento_id: tipo === 'evento' ? Number(btEl('btEvento').value) : undefined, arpa: btEl('btArpa').checked };
}

async function btCaricaStorico() {
  const box = btEl('btStorico');
  const res = await sbFetch(SUPA_URL + '/rest/v1/bot_invii?select=creato_il,utente,testo,destinatari,n_destinatari,consegnati,falliti&order=creato_il.desc&limit=5', { headers: H });
  if (!box) return;
  if (!res.ok) { box.innerHTML = '<div class="empty">' + BT_NON_DISP + '</div>'; return; }
  const righe = await res.json();
  box.innerHTML = !righe.length ? '<p class="sub">Nessun invio.</p>' : righe.map(r => '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(r.testo.slice(0, 70)) + '</div>'
    + '<div class="doc-item-meta">' + aggEsc(new Date(r.creato_il).toLocaleString('it-IT') + ' · ' + r.utente + ' · ' + r.destinatari + ' · ' + r.consegnati + ' su ' + r.n_destinatari + ' consegnati') + '</div></div></div>').join('');
}

async function btAnteprima() {
  const corpo = btCorpoInvio(), btn = btEl('btBtnAnteprima');
  btEl('btErr').style.display = 'none';
  if (!corpo.testo) return btErrore('Scrivi il testo del messaggio.');
  btn.disabled = true;
  try {
    const d = await btChiama('conta', corpo);
    if (!d.n) { btn.disabled = false; return btErrore('Nessun destinatario collegato al bot.'); }
    btInvio = { corpo, n: d.n, destinatari: d.destinatari };
    btEl('btCorpo').innerHTML = '<div class="form-err" id="btErr"></div><div class="kv"><span>Destinatari</span><b>' + aggEsc(d.destinatari) + ' (' + d.n + ')</b></div>'
      + '<p class="em-desc">' + aggEsc(corpo.testo) + '</p>' + (corpo.arpa ? '<p class="sub mt10">Segue un secondo messaggio con il bollettino ARPA.</p>' : '')
      + '<div class="actions"><button class="btn" onclick="btChiudi()">Annulla</button><button class="btn pri" id="btBtnInvia" onclick="btConferma()">Invia a ' + d.n + (d.n === 1 ? ' persona' : ' persone') + '</button></div>';
  } catch(e) { btn.disabled = false; btErrore(e.message); }
}

async function btConferma() {
  const btn = btEl('btBtnInvia');
  btn.disabled = true; btn.textContent = 'Invio in corso…';
  try {
    const d = await btChiama('invia', btInvio.corpo);
    btEl('btCorpo').innerHTML = '<div class="kv"><span>Consegnati</span><b>' + d.consegnati + ' su ' + d.n + '</b></div>'
      + (d.falliti.length ? '<div class="grp">Non consegnati (' + d.falliti.length + ')</div>' + d.falliti.map(f => '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(f.nome) + '</div><div class="doc-item-meta">' + aggEsc(f.motivo) + '</div></div></div>').join('') : '')
      + '<div class="actions"><button class="btn pri" onclick="btChiudi()">Chiudi</button></div>';
  } catch(e) { btn.disabled = false; btn.textContent = 'Riprova'; btErrore(e.message + ' Controlla gli ultimi invii prima di riprovare.'); }
}
