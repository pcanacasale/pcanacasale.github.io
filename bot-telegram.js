// ============================================================
// BOT TELEGRAM — link personali e promemoria di collegamento, prefisso bt*, permesso eventi o sci.
// ============================================================
// Tutto passa dalla Edge Function bot-app, che ricontrolla il permesso sul server (btChiama,
// usata anche da sci.js). Messaggi, iscritti e fotosegnalazioni stanno nella pagina S.C.I. (sci.js).
// ============================================================

const BT_URL = SUPA_URL + '/functions/v1/bot-app';
const BT_NON_DISP = 'Non disponibile.';

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
  ov.hidden = true; ov.innerHTML = '';
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

// Dalla finestra del link (senza argomenti) o da un elenco, ad esempio S.C.I. -> Iscritti (con id, nome e cosa fare dopo)
async function btScollega(id, nome, dopo) {
  if (id) btVolontario = { id, nome };
  if (!confirm('Scollegare ' + btVolontario.nome + ' dal bot? Per ricollegarsi servirà un nuovo link.')) return;
  try {
    await btChiama('scollega', { volontario_id: btVolontario.id });
    if (dopo) dopo(); else btRenderLink({ collegato: false });
  } catch(e) { if (dopo) sbAvviso(e.message); else btErrore(e.message); }
}

// -- INVIA MESSAGGIO --
// Il modulo sta in S.C.I. -> Messaggi; con eventoId sceglie già la squadra di quell'evento.
function btApriInvio(eventoId) { sciApri('messaggi', eventoId ? { evento: eventoId } : null); }

// -- PROMEMORIA PER CHI NON È COLLEGATO --
// Una volta per sessione, solo a chi ha una scheda e non ha ancora collegato il bot.
// "Più tardi" lo rimanda di 3 giorni; sparisce solo collegandosi.
const BT_BOT_LINK = 'https://t.me/PCANACasale_bot';
const BT_RIMANDA_MS = 3 * 86400000;

async function btPromemoria() {
  try {
    if (sessionStorage.getItem('bt_promemoria')) return;
    sessionStorage.setItem('bt_promemoria', '1');
    let fino = 0;
    try { fino = Number(localStorage.getItem('bt_rimanda_fino')) || 0; } catch(e) {}
    if (Date.now() < fino) return;
    const res = await sbFetch(SUPA_URL + '/rest/v1/rpc/mio_bot_collegato', { method: 'POST', headers: HJ, silenzioso: true, body: '{}' });
    if (!res.ok || (await res.json()) !== false) return;   // collegato, senza scheda o non verificabile: nessun avviso
    setTimeout(() => {
      if (!btEl('btOv') || !btEl('btOv').hidden) return;
      btApriFinestra('Collega il bot Telegram',
        '<p>Il bot di PC ANA Casale ti avvisa delle allerte meteo e permette di inviare foto geolocalizzate durante emergenze ed esercitazioni.</p>'
        + '<ol class="sub"><li>Apri il bot e premi <b>Avvia</b></li><li>Premi <b>📱 Invia il mio numero</b></li></ol>'
        + '<p class="sub">Ti riconosce dal numero di telefono che hai in scheda. Se non ti riconosce, scrivi in segreteria.</p>'
        + '<div class="actions"><button class="btn" onclick="btRimanda()">Più tardi</button><a class="btn pri" href="' + BT_BOT_LINK + '" target="_blank" rel="noopener" onclick="btChiudi()">Apri il bot</a></div>');
    }, 2000);
  } catch(e) { /* il promemoria non deve mai disturbare */ }
}

function btRimanda() {
  try { localStorage.setItem('bt_rimanda_fino', String(Date.now() + BT_RIMANDA_MS)); } catch(e) {}
  btChiudi();
}
