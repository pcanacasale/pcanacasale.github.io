const SUPA_URL = 'https://pggtmyarpuztfewqgwyc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZ3RteWFycHV6dGZld3Fnd3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDk4MjksImV4cCI6MjA4ODYyNTgyOX0.NqhNcmN-tqv5XWyeokSkjvOM6PxnmlDtZNcADeHRp9c';
let currentUser = null;
const H = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY };
const HJ = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

// ── LOGIN ──
async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');
  if (!u || !p) { err.textContent = 'Inserisci username e password.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Accesso in corso...';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/utenti?username=eq.' + encodeURIComponent(u) + '&password=eq.' + encodeURIComponent(p) + '&attivo=eq.true&select=id,nome,ruolo,tipo_accesso,permessi', { headers: H });
    const data = await res.json();
    if (data && data.length > 0) {
      currentUser = data[0];
      avviaDashboard();
    } else {
      err.textContent = 'Credenziali non corrette. Riprova.'; err.style.display = 'block';
    }
  } catch(e) {
    err.textContent = 'Errore di connessione. Riprova.'; err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Accedi';
}

function avviaDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('topbarWelcome').innerHTML = 'Ciao <strong>' + currentUser.nome + '</strong> &mdash; ' + currentUser.ruolo;
  document.getElementById('homeWelcome').textContent = 'Benvenuto, ' + currentUser.nome + '!';

  const p = currentUser.permessi || {};
  const isMaster = currentUser.tipo_accesso === 'master';

  // Sidebar voci
  document.getElementById('navInterventi').style.display = (isMaster || p.interventi) ? 'flex' : 'none';
  document.getElementById('navVolontari').style.display = (isMaster || p.volontari) ? 'flex' : 'none';
  document.getElementById('masterNav').style.display = isMaster ? 'block' : 'none';
  document.getElementById('navRichieste').style.display = (!isMaster && p.richieste) ? 'flex' : 'none';
  document.getElementById('navPianoAcquisti').style.display = (!isMaster && p.piano_acquisti) ? 'flex' : 'none';

  // Home cards
  document.getElementById('cardInterventi').style.display = (isMaster || p.interventi) ? 'block' : 'none';
  document.getElementById('cardVolontari').style.display = (isMaster || p.volontari) ? 'block' : 'none';
  document.getElementById('masterCards').style.display = isMaster ? 'block' : 'none';
  document.getElementById('cardRichieste').style.display = (!isMaster && p.richieste) ? 'block' : 'none';
  document.getElementById('cardPianoAcquisti').style.display = (!isMaster && p.piano_acquisti) ? 'block' : 'none';

  if (isMaster) caricaBadgeRichieste();
}

function logout() {
  currentUser = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  // Reset panels
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('panelHome').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
  document.querySelector('.nav-item').classList.add('active');
}

// ── NAVIGAZIONE ──
function showPanel(name, btn) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) btn.classList.add('active');
  // chiudi sidebar su mobile
  document.getElementById('sidebar').classList.remove('open');
  // carica dati se necessario
  if (name === 'utenti') caricaUtenti();
  if (name === 'richieste') caricaRichieste();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── GESTIONE UTENTI ──
async function caricaUtenti() {
  const list = document.getElementById('utentiList');
  list.innerHTML = '<p style="color:var(--testo-ch);padding:1rem 0">Caricamento...</p>';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/utenti?select=id,nome,username,ruolo,tipo_accesso,attivo,permessi&order=nome', { headers: H });
    const utenti = await res.json();
    list.innerHTML = '';
    utenti.forEach(function(u) {
      const div = document.createElement('div');
      div.className = 'utente-row' + (u.attivo ? '' : ' utente-disattivo');
      const tipoLabel = u.tipo_accesso === 'master' ? '&#x2B50; Master' : '&#x1F464; Standard';
      const p = u.permessi || {};
      const permBadges = u.tipo_accesso === 'master' ? '<span style="font-size:0.68rem;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px;font-weight:700">Accesso completo</span>' :
        [p.interventi?'<span class="perm-badge">Interventi</span>':'', p.volontari?'<span class="perm-badge">Volontari</span>':'', p.richieste?'<span class="perm-badge">Richieste</span>':'', p.piano_acquisti?'<span class="perm-badge">Piano acquisti</span>':''].filter(Boolean).join('') || '<span style="font-size:0.68rem;color:#aaa">nessun permesso</span>';
      div.innerHTML = '<div class="utente-info">'
        + '<strong>' + u.nome + '</strong>'
        + '<span class="utente-username">@' + u.username + '</span>'
        + '<span class="utente-ruolo">' + u.ruolo + '</span>'
        + '<span class="utente-tipo ' + u.tipo_accesso + '">' + tipoLabel + '</span>'
        + '<span style="font-size:0.72rem;margin-left:4px">' + permBadges + '</span>'
        + '</div>'
        + '<div class="utente-actions">'
        + '<button class="btn-sm ' + (u.attivo ? 'btn-warn' : 'btn-ok') + '" onclick="toggleAttivo(' + JSON.stringify(u.id) + ',' + JSON.stringify(u.attivo) + ')">' + (u.attivo ? 'Disattiva' : 'Attiva') + '</button>'
        + '<button class="btn-sm btn-danger" onclick="eliminaUtente(' + JSON.stringify(u.id) + ',' + JSON.stringify(u.nome) + ')">Elimina</button>'
        + '</div>';
      list.appendChild(div);
    });
  } catch(e) { list.innerHTML = '<p style="color:red">Errore caricamento utenti.</p>'; }
}

async function salvaUtente() {
  const nome = document.getElementById('nuovoNome').value.trim();
  const username = document.getElementById('nuovoUsername').value.trim();
  const password = document.getElementById('nuovaPassword').value.trim();
  const ruolo = document.getElementById('nuovoRuolo').value.trim();
  const tipo_accesso = document.getElementById('nuovoTipo').value;
  const errEl = document.getElementById('nuovoUtenteErr');
  if (!nome || !username || !password || !ruolo) { errEl.textContent = 'Compila tutti i campi.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  const permessi = {
    interventi: document.getElementById('permInterventi').checked,
    volontari: document.getElementById('permVolontari').checked,
    richieste: document.getElementById('permRichieste').checked,
    piano_acquisti: document.getElementById('permPianoAcquisti').checked
  };
  const res = await fetch(SUPA_URL + '/rest/v1/utenti', {
    method: 'POST',
    headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ nome: nome, username: username, password: password, ruolo: ruolo, tipo_accesso: tipo_accesso, permessi: permessi })
  });
  if (res.ok) {
    document.getElementById('nuovoNome').value = '';
    document.getElementById('nuovoUsername').value = '';
    document.getElementById('nuovaPassword').value = '';
    document.getElementById('nuovoRuolo').value = '';
    document.getElementById('permInterventi').checked = true;
    document.getElementById('permVolontari').checked = true;
    document.getElementById('permRichieste').checked = false;
    document.getElementById('permPianoAcquisti').checked = false;
    caricaUtenti();
  } else { errEl.textContent = 'Errore. Username già esistente?'; errEl.style.display = 'block'; }
}

async function toggleAttivo(id, attivo) {
  await fetch(SUPA_URL + '/rest/v1/utenti?id=eq.' + id, { method: 'PATCH', headers: HJ, body: JSON.stringify({ attivo: !attivo }) });
  caricaUtenti();
}

async function eliminaUtente(id, nome) {
  if (!confirm('Eliminare definitivamente ' + nome + '?')) return;
  await fetch(SUPA_URL + '/rest/v1/utenti?id=eq.' + id, { method: 'DELETE', headers: H });
  caricaUtenti();
}

// ── RICHIESTE ──
async function caricaBadgeRichieste() {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?letta=eq.false&select=id', { headers: H });
    const data = await res.json();
    const badge = document.getElementById('badgeRichieste');
    if (data.length > 0) { badge.textContent = data.length; badge.style.display = 'inline'; }
    else { badge.style.display = 'none'; }
  } catch(e) {}
}

async function caricaRichieste() {
  const list = document.getElementById('richiesteList');
  list.innerHTML = '<p style="color:var(--testo-ch);padding:1rem 0">Caricamento...</p>';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?select=*&order=created_at.desc', { headers: H });
    const richieste = await res.json();
    const nonLette = richieste.filter(function(r) { return !r.letta; }).length;
    const badge = document.getElementById('badgeRichieste');
    if (nonLette > 0) { badge.textContent = nonLette; badge.style.display = 'inline'; }
    else { badge.style.display = 'none'; }
    if (!richieste.length) { list.innerHTML = '<p style="color:var(--testo-ch);padding:1rem 0">Nessuna richiesta ricevuta.</p>'; return; }
    list.innerHTML = '';
    richieste.forEach(function(r) {
      const data = new Date(r.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const div = document.createElement('div');
      div.className = 'richiesta-card ' + (r.letta ? 'letta' : 'nuova');
      const tag = r.letta ? '' : '<span class="badge-nuova">NUOVA</span>';
      const socio = r.socio_ana ? '<div>Socio ANA: ' + r.socio_ana + (r.gruppo_ana ? ' — ' + r.gruppo_ana : '') + '</div>' : '';
      const msg = r.messaggio ? '<div class="richiesta-msg">"' + r.messaggio + '"</div>' : '';
      const tel = r.telefono ? ' &middot; ' + r.telefono : '';
      const btnL = r.letta
        ? '<span style="font-size:0.75rem;color:#aaa">&#10003; Letta</span>'
        : '<button class="btn-sm btn-ok" onclick="segnaLetta(' + JSON.stringify(r.id) + ')">Segna come letta</button>';
      const btnE = '<button class="btn-sm btn-danger" onclick="eliminaRichiesta(' + JSON.stringify(r.id) + ')">Elimina</button>';
      div.innerHTML = '<div class="richiesta-top">'
        + '<div><span class="richiesta-nome">' + r.nome + '</span>' + tag + '</div>'
        + '<span class="richiesta-data">' + data + '</span></div>'
        + '<div class="richiesta-body"><div>' + r.email + tel + '</div>' + socio + msg + '</div>'
        + '<div class="richiesta-actions">' + btnL + btnE + '</div>';
      list.appendChild(div);
    });
  } catch(e) { list.innerHTML = '<p style="color:red">Errore caricamento.</p>'; }
}

async function segnaLetta(id) {
  await fetch(SUPA_URL + '/rest/v1/richieste_adesione?id=eq.' + id, { method: 'PATCH', headers: HJ, body: JSON.stringify({ letta: true }) });
  caricaRichieste();
}

async function eliminaRichiesta(id) {
  if (!confirm('Eliminare questa richiesta?')) return;
  await fetch(SUPA_URL + '/rest/v1/richieste_adesione?id=eq.' + id, { method: 'DELETE', headers: H });
  caricaRichieste();
}

// ── KEYBOARD ──
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});
