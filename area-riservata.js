
// -- SPLASH SCREEN --
function avviaSplash() {
  var logo   = document.getElementById('splashLogo');
  var title  = document.getElementById('splashTitle');
  var dots   = document.getElementById('splashDots');
  var dot1   = document.getElementById('dot1');
  var dot2   = document.getElementById('dot2');
  var dot3   = document.getElementById('dot3');
  var splash = document.getElementById('splashScreen');
  if (!logo || !splash) return;

  setTimeout(function(){ 
    if (logo) logo.classList.add('show'); 
    if (title) title.classList.add('show'); 
    if (dots) dots.classList.add('show'); 
  }, 150);
  setTimeout(function(){ if (dot1) dot1.classList.add('lit'); }, 900);
  setTimeout(function(){ if (dot2) dot2.classList.add('lit'); }, 1300);
  setTimeout(function(){ if (dot3) dot3.classList.add('lit'); }, 1700);
  setTimeout(function(){
    if (splash) { splash.classList.add('fade-out'); setTimeout(function(){ splash.style.display = 'none'; }, 500); }
  }, 3000);
}

// -- WELCOME SCREEN --
function mostraWelcome(utente) {
  var ws       = document.getElementById('welcomeScreen');
  var avatar   = document.getElementById('welcomeAvatar');
  var text     = document.getElementById('welcomeText');
  var initials = document.getElementById('welcomeInitials');
  var nome     = document.getElementById('welcomeName');
  var ruolo    = document.getElementById('welcomeRuolo');

  // Iniziali
  var parts = (utente.nome || '').split(' ');
  var ini   = parts.map(function(p){ return p[0] || ''; }).join('').substring(0,2).toUpperCase();
  initials.textContent = ini || '?';
  nome.textContent     = utente.nome || '—';
  ruolo.textContent    = utente.ruolo || '—';

  ws.classList.add('visible');
  setTimeout(function(){ avatar.classList.add('show'); text.classList.add('show'); }, 100);

  // Fade out dopo 2 secondi
  setTimeout(function(){
    ws.classList.add('fade-out');
    setTimeout(function(){
      ws.classList.remove('visible');
      ws.classList.remove('fade-out');
      avatar.classList.remove('show');
      text.classList.remove('show');
    }, 500);
  }, 2000);
}

// Avvia splash dopo caricamento DOM
function avviaSplashSafe() {
  var logo   = document.getElementById('splashLogo');
  var title  = document.getElementById('splashTitle');
  var dots   = document.getElementById('splashDots');
  var splash = document.getElementById('splashScreen');
  if (!logo || !splash) return; // sicurezza
  avviaSplash();
}
document.addEventListener('DOMContentLoaded', avviaSplashSafe);

const SUPA_URL = 'https://pggtmyarpuztfewqgwyc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZ3RteWFycHV6dGZld3Fnd3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDk4MjksImV4cCI6MjA4ODYyNTgyOX0.NqhNcmN-tqv5XWyeokSkjvOM6PxnmlDtZNcADeHRp9c';
let currentUser = null;
const H  = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY };
const HJ = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

// PWA
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

// Orologio
function updateClock() {
  const n = new Date();
  const t = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  const el = document.getElementById('topbarClock');
  if (el) el.textContent = t;
}
updateClock();
setInterval(updateClock, 15000);

// -- LOGIN --
async function doLogin() {
  const u   = document.getElementById('loginUser').value.trim();
  const p   = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');
  if (!u || !p) { err.textContent = 'Inserisci username e password.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'accesso...';
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/utenti?username=eq.' + encodeURIComponent(u) + '&password=eq.' + encodeURIComponent(p) + '&attivo=eq.true&select=id,nome,ruolo,tipo_accesso,permessi', { headers: H });
    const data = await res.json();
    if (data && data.length > 0) {
      currentUser = data[0];
      sessionStorage.setItem('ar_user', u);
      sessionStorage.setItem('ar_pass', p);
      await logAttivita('ha effettuato il login');
      avviaDashboard();
    } else {
      err.textContent = 'Credenziali non corrette.'; err.style.display = 'block';
    }
  } catch(e) {
    err.textContent = 'Errore di connessione.'; err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Accedi';
}

let isMasterUser = false;

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function navTo(panel, title, btn) {
  showPanel(panel, null);
  closeSidebar();
}

function avviaDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  mostraWelcome(currentUser);

  const p        = currentUser.permessi || {};
  const isMaster = currentUser.tipo_accesso === 'master';
  isMasterUser   = isMaster;

  // Topbar
  document.getElementById('homeWelcome').textContent = currentUser.nome;
  document.getElementById('homeUnit').textContent    = currentUser.ruolo;

  // Sidebar voci visibilita
  var showSi = function(id) { var el=document.getElementById(id); if(el) el.style.display='flex'; };
  if (isMaster || p.volontari)  { showSi('siVolontari'); showSi('siLabelOperativo'); }
  if (isMaster || p.interventi) { showSi('siInterventi'); showSi('siLabelOperativo'); }
  if (isMaster || p.mezzi)      { showSi('siMezzi'); showSi('siLabelOperativo'); }
  if (isMaster || p.documenti)  { showSi('siDocumenti'); showSi('siLabelOperativo'); }
  if (isMaster || p.pranzo)     showSi('siPranzo');
  if (isMaster || p.richieste)  showSi('siRichieste');
  if (isMaster || p.statistiche)  showSi('siStatistiche');
  if (isMaster || p.esercitazione) showSi('siEsercitazione');
  if (isMaster)                 showSi('siImpostazioni');
  if (isMaster || p.db)          showSi('siDb');
  // Nome utente in sidebar
  var su = document.getElementById('sidebarUser');
  if (su) su.textContent = currentUser.nome + ' · ' + currentUser.ruolo;

  // Badge richieste
  if (isMaster || p.richieste) caricaBadgeRichieste();

  // Compleanno
  verificaCompleanni();

  // Home cards
  buildHomeCards(isMaster, p);

  // Pranzo se autorizzato
  if (isMaster || p.pranzo) initPranzo();
}



function logout() {
  logAttivita('ha effettuato il logout');
  currentUser = null;
  sessionStorage.removeItem('ar_user');
  sessionStorage.removeItem('ar_pass');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  isMasterUser = false;
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panelHome').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('navHome').classList.add('active');
}

// -- NAVIGAZIONE --
function showPanel(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1));
  if (panel) panel.classList.add('active');
  // Aggiorna active sidebar
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  var siId = 'si' + name.charAt(0).toUpperCase() + name.slice(1);
  var si = document.getElementById(siId);
  if (si) si.classList.add('active');
  else { var siH = document.getElementById('siHome'); if(siH) siH.classList.add('active'); }
  if (name === 'richieste') caricaRichieste();
  if (name === 'volontari') caricaVolontari();
  if (name === 'interventi') caricaInterventi();
  if (name === 'documenti') caricaDocumenti();
  if (name === 'db') caricaDb();
  if (name === 'mezzi') caricaMezzi();
  if (name === 'esercitazione') { initEsercitazione(); }
  if (name === 'statistiche') {
    if (typeof Chart === 'undefined') {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = initStatistiche;
      document.head.appendChild(s);
    } else {
      initStatistiche();
    }
  }
}

function toggleMore(){} function closeMore(){}

// -- HOME CARDS --
function buildHomeCards(isMaster, p) {
  caricaHomeDashboard();
}

async function caricaHomeDashboard() {
  const grid = document.getElementById('homeGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="color:var(--testo-3);font-size:0.8rem;padding:0.5rem 0">caricamento...</div>';

  try {
    const oggi = new Date();
    const mm   = String(oggi.getMonth() + 1).padStart(2,'0');

    // Carica compleanni del mese e ultimi interventi in parallelo
    const [volRes, intRes] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome,data_nascita,squadra&attivo=eq.true&order=data_nascita', { headers: H }),
      fetch(SUPA_URL + '/rest/v1/interventi?select=id,evento,data,tipo_attivita,n_volontari,n_ore&order=data.desc&limit=5', { headers: H })
    ]);
    const volontari  = await volRes.json();
    const interventi = await intRes.json();

    // Filtra compleanni del mese
    const bdayMonth = (volontari || []).filter(v => {
      if (!v.data_nascita) return false;
      return v.data_nascita.slice(5,7) === mm;
    }).sort((a,b) => {
      return parseInt(a.data_nascita.slice(8,10)) - parseInt(b.data_nascita.slice(8,10));
    });

    let html = '';

    // -- COMPLEANNI DEL MESE --
    const mesiIt = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    html += '<div class="home-section">';
    html += '<div class="home-section-title">🎂 Compleanni di ' + mesiIt[oggi.getMonth()+1] + '</div>';
    if (!bdayMonth.length) {
      html += '<div class="home-empty">Nessun compleanno questo mese</div>';
    } else {
      html += '<div class="home-list">';
      bdayMonth.forEach(v => {
        const giorno  = v.data_nascita.slice(8,10);
        const isOggi  = v.data_nascita.slice(5,10) === (mm + '-' + String(oggi.getDate()).padStart(2,'0'));
        const anno    = v.data_nascita.slice(0,4);
        const eta     = oggi.getFullYear() - parseInt(anno);
        const [bg, fg] = avatarColor(v.cognome);
        const initials = ((v.cognome||'?')[0] + (v.nome||'?')[0]).toUpperCase();
        html += '<div class="home-list-row' + (isOggi ? ' home-list-row-today' : '') + '">'
          + '<div class="home-list-avatar" style="background:' + bg + ';color:' + fg + '">' + initials + '</div>'
          + '<div class="home-list-info">'
          + '<div class="home-list-name">' + v.cognome + ' ' + v.nome + (isOggi ? ' 🎉' : '') + '</div>'
          + '<div class="home-list-sub">' + giorno + ' ' + mesiIt[oggi.getMonth()+1] + ' · ' + eta + ' anni</div>'
          + '</div>'
  
          + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // -- REVISIONI DEL MESE --
    try {
      var mezziRes  = await fetch(SUPA_URL + '/rest/v1/mezzi?select=id,automezzo,targa,revisione,stato&order=revisione', { headers: H });
      var mezziAll  = await mezziRes.json();
      var oggi2     = new Date();
      var mmPad     = String(oggi2.getMonth()+1).padStart(2,'0');
      var yyStr     = String(oggi2.getFullYear());
      var revMese   = (mezziAll||[]).filter(function(m){
        if (!m.revisione) return false;
        return m.revisione.slice(0,7) === yyStr + '-' + mmPad;
      });
      var revScadute = (mezziAll||[]).filter(function(m){
        if (!m.revisione) return false;
        return new Date(m.revisione) < oggi2;
      });
      // Mostro revisioni scadute + del mese
      var revDaMostrare = [];
      revScadute.forEach(function(m){ if (!revDaMostrare.find(function(x){return x.id===m.id;})) revDaMostrare.push(m); });
      revMese.forEach(function(m){ if (!revDaMostrare.find(function(x){return x.id===m.id;})) revDaMostrare.push(m); });

      if (revDaMostrare.length) {
        html += '<div class="home-section">';
        html += '<div class="home-section-title">🔧 Revisioni in scadenza</div>';
        html += '<div class="home-list">';
        revDaMostrare.forEach(function(m) {
          var d    = new Date(m.revisione);
          var diff = (d - oggi2) / (1000*60*60*24);
          var cls  = diff < 0 ? 'var(--red)' : 'var(--amber)';
          var lbl  = diff < 0 ? 'Scaduta' : 'Scade il';
          html += '<div class="home-list-row" style="cursor:pointer" onclick="navTo(&quot;mezzi&quot;,&quot;Mezzi&quot;,document.getElementById(&quot;siMezzi&quot;))">'
            + '<div class="home-list-avatar" style="background:var(--bg-2);border-radius:9px">' + getMezzoIcon(m.automezzo).replace('<svg', '<svg style="width:20px;height:20px;stroke:var(--testo-3);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"') + '</div>'
            + '<div class="home-list-info">'
            + '<div class="home-list-name">' + m.automezzo + '</div>'
            + '<div class="home-list-sub" style="color:' + cls + '">' + lbl + ' ' + d.toLocaleDateString('it-IT') + '</div>'
            + '</div>'
            + '<div class="home-list-badge" style="background:var(--bg-2);color:' + cls + '">' + (m.targa||'—') + '</div>'
            + '</div>';
        });
        html += '</div></div>';
      }
    } catch(e) {}

    // -- ULTIMI INTERVENTI --
    html += '<div class="home-section">';
    html += '<div class="home-section-title">⚡ Ultimi interventi</div>';
    if (!interventi || !interventi.length) {
      html += '<div class="home-empty">Nessun intervento registrato</div>';
    } else {
      html += '<div class="home-list">';
      interventi.forEach(i => {
        const data = i.data ? new Date(i.data).toLocaleDateString('it-IT', {day:'2-digit',month:'short',year:'numeric'}) : '—';
        var onclickInt = 'navTo(&quot;interventi&quot;,&quot;Interventi&quot;,document.getElementById(&quot;siInterventi&quot;));apriDettaglioIntervento(' + i.id + ')';
        html += '<div class="home-list-row" style="cursor:pointer" onclick="' + onclickInt + '">'
          + getTipoAttivitaAvatar(i.tipo_attivita, 36)
          + '<div class="home-list-info">'
          + '<div class="home-list-name">' + (i.evento||'—') + '</div>'
          + '<div class="home-list-sub">' + data + (i.tipo_attivita ? ' · ' + i.tipo_attivita : '') + (i.n_ore ? ' · ' + i.n_ore + 'h' : '') + '</div>'
          + '</div>'
          + '<div class="home-list-badge" style="background:var(--green-pale);color:var(--green)">' + (i.n_volontari||0) + ' vol.</div>'
          + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    grid.innerHTML = html;

  } catch(e) {
    grid.innerHTML = '<div style="color:var(--testo-3);font-size:0.8rem;padding:0.5rem 0">Errore caricamento dashboard</div>';
  }
}

function volontariIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function interventiIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'; }
function mezziIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'; }
function convocazioniIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'; }

// -- COMPLEANNI --
async function verificaCompleanni() {
  try {
    const oggi = new Date();
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const res  = await fetch(SUPA_URL + '/rest/v1/volontari?attivo=eq.true&select=nome,cognome,data_nascita', { headers: H });
    const utenti = await res.json();
    const compleanni = (utenti || []).filter(u => {
      if (!u.data_nascita) return false;
      const parts = u.data_nascita.split('-');
      return parts[1] === mm && parts[2] === dd;
    });
    if (compleanni.length > 0) {
      const nomi   = compleanni.map(u => (u.cognome + ' ' + u.nome).trim()).join(', ');
      const banner = document.getElementById('bdayBanner');
      const text   = document.getElementById('bdayText');
      text.innerHTML = 'Oggi è il compleanno di <strong>' + nomi + '</strong> — ricordati di fargli gli auguri!';
      banner.style.display = 'flex';
    }
  } catch(e) {}
}

// -- LOG ATTIVITÀ --
async function logAttivita(azione) {
  if (!currentUser) return;
  try {
    await fetch(SUPA_URL + '/rest/v1/log_attivita', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ utente_nome: currentUser.nome, azione })
    });
  } catch(e) {}
}

// -- PRANZO --
let pranzoSaved = {};

const SETTORI = [
  {
    id: 'autorita_civili_e_mi',
    label: 'AUTORITA\' CIVILI E MILITARI - OSPITI CIVILI',
    color: '#1a4a9a',
    invitati: [
      {id:'i1', ente:'SINDACO DI CASALE M.TO', nome:'EMANUELE CAPRA'},
      {id:'i2', ente:'SINDACO DI MIRABELLO', nome:'MARCO RICALDONE'},
      {id:'i3', ente:'SINDACO DI OCCIMIANO', nome:'SANDRO DEAMBROSIS'},
      {id:'i4', ente:'SINDACO DI BORGO S.M.', nome:'FABIO ZAVATTARO'},
      {id:'i5', ente:'SINDACO DI GIAROLE', nome:'GIUSEPPE PAVESE'},
      {id:'i6', ente:'UNIONE / SINDACO DI ROSIGNANO', nome:'CESARE CHIESA'},
      {id:'i7', ente:'SINDACO DI CELLAMONTE', nome:'MAURIZIO DEEVASIS'},
      {id:'i8', ente:'SINDACO DI SAN GIORGIO M.TO', nome:'PAOLO MARCHISIO'},
      {id:'i9', ente:'ONOREVOLE', nome:'VINCENZO AMICH'},
      {id:'i10', ente:'PRESIDENTE REGIONE', nome:'ALBERTO CIRIO'},
      {id:'i11', ente:'PRESIDENTE PROVINCIA', nome:'LUIGI BENZI'},
      {id:'i12', ente:'PREFETTO DI ALESSANDRIA', nome:'ALESSANDRA VINCIGUERRA'},
      {id:'i13', ente:'ASSESSORE PC REGIONE', nome:'MARCO GABUSI'},
      {id:'i14', ente:'ASSESSORE REGIONE PIEMONTE', nome:'FEDERICO RIBOLDI'},
      {id:'i15', ente:'FUNZIONARIO PC PROVINCIALE', nome:'MATTEO ROBBIANO'},
      {id:'i16', ente:'ASSESSORE PC COMUNE DI CASALE', nome:'LUCA NOVELLI'},
      {id:'i17', ente:'FUNZIONARIO COMUNE DI CASALE', nome:'PIERO BO'},
      {id:'i18', ente:'COMANDANTE P. MUNICIPALE', nome:'VITTORIO PUGNO'},
      {id:'i19', ente:'COMANDANTE C.C. CASALE M.TO', nome:'VALERIO AZZONE'},
      {id:'i20', ente:'COMANDANTE C.C. OCCIMIANO', nome:'PAOLO MARUBBIO'},
      {id:'i21', ente:'COMANDANTE C.C. TICINETO', nome:'?'},
      {id:'i22', ente:'COMANDANTE C.C. ROSIGNANO', nome:'?'},
      {id:'i23', ente:'EX SINDACO OCCIMIANO', nome:'VALERIA OLIVIERI'},
      {id:'i24', ente:'EX SINDACO MIRANELLO', nome:'MAURO GIOANOLA'},
      {id:'i25', ente:'EX COMANDANTE C.C. OCCIMIANO', nome:'ANTONIO CAPUTO'},
      {id:'i26', ente:'EX FUNZIONARIO PC PROVINCIALE', nome:'DANTE FERRARIS'},
      {id:'i27', ente:'PRESIDENTE PRO LOCO OCCIMIANO', nome:'GIORGIO MAZZUCCO'},
    ]
  },
  {
    id: 'settore_ana',
    label: 'SETTORE ANA',
    color: '#1a7a4a',
    invitati: [
      {id:'i28', ente:'PRESIDENTE NAZIONALE ANA', nome:'SEBASTIANO FAVERO'},
      {id:'i29', ente:'COORD NAZ PC ANA', nome:'ANDREA DA BROI'},
      {id:'i30', ente:'PRESIDENTE CAP', nome:'ALESSANDRO TROVANT'},
      {id:'i31', ente:'COORDINATORE 1 RGPT', nome:'GIUSEPPE VENTURA'},
      {id:'i32', ente:'RESPONSABILE POLO 1 RGPT', nome:'FLAVIO NEGRO'},
      {id:'i33', ente:'SEZ. DI ACQUI TERME', nome:''},
      {id:'i34', ente:'SEZ. DI ALESSANDRIA', nome:''},
      {id:'i35', ente:'SEZ. DI AOSTA', nome:''},
      {id:'i36', ente:'SEZ. DI ASTI', nome:''},
      {id:'i37', ente:'SEZ. DI BIELLA', nome:''},
      {id:'i38', ente:'SEZ. DI CASALE MONFERRATO', nome:''},
      {id:'i39', ente:'SEZ. DI CEVA', nome:''},
      {id:'i40', ente:'SEZ. DI CUNEO', nome:''},
      {id:'i41', ente:'SEZ. DI DOMODOSSOLA', nome:''},
      {id:'i42', ente:'SEZ. DI GENOVA', nome:''},
      {id:'i43', ente:'SEZ. DI IMPERIA', nome:''},
      {id:'i44', ente:'SEZ. DI INTRA', nome:''},
      {id:'i45', ente:'SEZ. DI IVREA', nome:''},
      {id:'i46', ente:'SEZ. DI LA SPEZIA', nome:''},
      {id:'i47', ente:'SEZ. DI MONDOVI', nome:''},
      {id:'i48', ente:'SEZ. DI NOVARA', nome:''},
      {id:'i49', ente:'SEZ. DI OMEGNA', nome:''},
      {id:'i50', ente:'SEZ. DI PINEROLO', nome:''},
      {id:'i51', ente:'SEZ. DI SALUZZO', nome:''},
      {id:'i52', ente:'SEZ. DI SAVONA', nome:''},
      {id:'i53', ente:'SEZ. DI TORINO', nome:''},
      {id:'i54', ente:'SEZ. DI VALSESIANA', nome:''},
      {id:'i55', ente:'SEZ. DI VALSUSA', nome:''},
      {id:'i56', ente:'SEZ. DI VERCELLI', nome:''},
      {id:'i57', ente:'EX COORD 1 RGPT', nome:'PAOLO ROSSO'},
      {id:'i58', ente:'EX COORD 1 RGPT', nome:'BRUNO PAVESE'},
      {id:'i59', ente:'EX COORD 1 RGPT', nome:'GIANNI GONTERO'},
    ]
  },
  {
    id: 'settore_volontariato',
    label: 'SETTORE VOLONTARIATO',
    color: '#b45309',
    invitati: [
      {id:'i60', ente:'PRESIDENTE COORD. REGIONALE', nome:'ROBERTO BERTONE'},
      {id:'i61', ente:'PRESIDENTE COORD TERR AL', nome:'ANDREA MORCHIO'},
      {id:'i62', ente:'COORD BASSO MONFERRATO', nome:'FRANCO SCAGLIONE'},
      {id:'i63', ente:'RESPONSABILE SOR', nome:'ALISIA BATTEZZATI'},
      {id:'i64', ente:'COMMISSARIO PC CASALE', nome:'CLAUDIO CAPUTO'},
      {id:'i65', ente:'COORDINATORE PC CASALE', nome:'FRANCO POLATO'},
      {id:'i66', ente:'CRI COMITATO CASALE', nome:''},
      {id:'i67', ente:'CRI MILITARE', nome:'PAOLO ACCATINO'},
      {id:'i68', ente:'CROCE VERDE', nome:''},
      {id:'i69', ente:'ARI', nome:''},
      {id:'i70', ente:'CHINTANA', nome:''},
      {id:'i71', ente:'GRUPPO COMUNALE BALZOLA', nome:''},
      {id:'i72', ente:'AIB VALCERRINA', nome:''},
      {id:'i73', ente:'AIB CONIOLO', nome:''},
      {id:'i74', ente:'MISERICORDIA', nome:''},
      {id:'i75', ente:'GRUPPI COMUNALI COM 3', nome:'AGGIUNGERE MAN MANO'},
    ]
  },
  {
    id: 'settore_sezione',
    label: 'SETTORE SEZIONE',
    color: '#7c3aed',
    invitati: [
      {id:'i76', ente:'PRESIDENTE', nome:'GIAN LUIGI RAVERA'},
      {id:'i77', ente:'VICE PRESIDENTE VICARIO', nome:'MAURO BARBANO'},
      {id:'i78', ente:'VICE PRESIDENTE', nome:'PIER PAOLO PAROLA'},
      {id:'i79', ente:'TESORIERE', nome:'RENATO TRAVERSO'},
      {id:'i80', ente:'SEGRETARIO CONSIGLIO DIRETTIVO', nome:'SERGIO GIOANOLA'},
      {id:'i81', ente:'CONSIGLIERE SEZIONALE', nome:'UMBERTO ALBERI'},
      {id:'i82', ente:'CONSIGLIERE SEZIONALE', nome:'GIACOMINO ALCURI'},
      {id:'i83', ente:'CONSIGLIERE SEZIONALE', nome:'ROSSANO BELLAN'},
      {id:'i84', ente:'CONSIGLIERE SEZIONALE', nome:'ROBERTO CERIA'},
      {id:'i85', ente:'CONSIGLIERE SEZIONALE', nome:'ROBERTO DANNA'},
      {id:'i86', ente:'CONSIGLIERE SEZIONALE', nome:'PAOLO LAVAGNO'},
      {id:'i87', ente:'CONSIGLIERE SEZIONALE', nome:'MAURIZIO MENEGHETTI'},
      {id:'i88', ente:'CONSIGLIERE SEZIONALE', nome:'MARIO SARTORI'},
      {id:'i89', ente:'CONSIGLIERE SEZIONALE', nome:'JURI SCIANDRA'},
      {id:'i90', ente:'CONSIGLIERE SEZIONALE', nome:'GIANNI VIGATO'},
      {id:'i91', ente:'GRUPPO DI BORGO SAN MARTINO', nome:'RAFFAELE GIORA'},
      {id:'i92', ente:'GRUPPO DI CANTAVENNA', nome:'GIAN LUIGI ZANELLO'},
      {id:'i93', ente:'GRUPPO DI CASALE NORD', nome:'ROBERTO MORETTO'},
      {id:'i94', ente:'GRUPPO DI CASALE SUD', nome:'MARCO SOBRERO'},
      {id:'i95', ente:'GRUPPO DI CONIOLO', nome:'GIANLUIGI BOARINO'},
      {id:'i96', ente:'GRUPPO DI CONZANO', nome:'VITTORINO ANGELINO'},
      {id:'i97', ente:'GRUPPO DI FRASSINELLO', nome:'MICHELANGELO COSTANZO'},
      {id:'i98', ente:'GRUPPO DI FRASSINETO PO', nome:'ALBERTO MUZIO'},
      {id:'i99', ente:'GRUPPO DI GABIANO VILLAMIROGLIO', nome:'ALBERTO GENNARO'},
      {id:'i100', ente:'GRUPPO DI LAURIANO MONTEU', nome:'WALTER LANA'},
      {id:'i101', ente:'GRUPPO DI MIRABELLO CU CA LU', nome:'PIERO MANASSERO'},
      {id:'i102', ente:'GRUPPO DI MOMBELLO ZENEVRETO', nome:'PIERO ANTONIO MAGRO'},
      {id:'i103', ente:'GRUPPO DI OCCIMIANO', nome:'ERNESTO BERRA'},
      {id:'i104', ente:'GRUPPO DI OTTIGLIO', nome:'PIERO DEAMBROGIO'},
      {id:'i105', ente:'GRUPPO DI OZZANO', nome:'MAURIZIO MENEGHETTI'},
      {id:'i106', ente:'GRUPPO DI PONTESTURA', nome:'LUCIANO BROSIO'},
      {id:'i107', ente:'GRUPPO DI PONZANO', nome:'GIUSEPPE BIANCO'},
      {id:'i108', ente:'GRUPPO DI ROSIGNANO MONFERRATO', nome:'CARLO SALVANESCHI'},
      {id:'i109', ente:'GRUPPO DI SALA MONFERRATO', nome:'GIANNI MELOTTI'},
      {id:'i110', ente:'GRUPPO DI SAN GIORGIO MONFERRATO', nome:'GIORGIO RAINIERI'},
      {id:'i111', ente:'GRUPPO DI SAN MAURIZIO DI CONZANO', nome:'GIUSEPPE CATTANA'},
      {id:'i112', ente:'GRUPPO DI SERRALUNGA DI CREA', nome:'FRANCESCO FECAROTTA'},
      {id:'i113', ente:'GRUPPO DI VALLE CERRINA', nome:'GIANCARLO NEGRI'},
      {id:'i114', ente:'GRUPPO DI VIGNALE MONFERRATO', nome:'EMILIO RIZZETTO'},
      {id:'i115', ente:'GRUPPO DI VILLADEATI', nome:'CARLO ALBERTO ODDONE'},
      {id:'i116', ente:'GRUPPO DI VILLANOVA MONFERRATO', nome:'GERMANO DELMIGLIO'},
      {id:'i117', ente:'GRUPPO DI ZANCO MONFERRATO OVEST', nome:'DANIELE ABATE'},
    ]
  },
];

async function initPranzo() {
  // Carica risposte salvate
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=inv_id,risposta,coperti,costo,presenza,pranzo,extra', { headers: H });
    const rows = await res.json();
    pranzoSaved = {};
    if (Array.isArray(rows)) rows.forEach(r => { pranzoSaved[r.inv_id] = { risposta: r.risposta, coperti: r.coperti, costo: r.costo||'25', presenza: r.presenza||'attesa', pranzo: r.pranzo||false, extra: Array.isArray(r.extra) ? r.extra : [] }; });
  } catch(e) {}
  // Carica lista invitati da Supabase
  await caricaListaPranzo();
}

async function caricaListaPranzo() {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?select=*&order=settore_id,ordine&attivo=eq.true', { headers: H });
    const lista = await res.json();
    // Ricostruisce SETTORI da DB
    const settoriMap = {};
    lista.forEach(inv => {
      if (!settoriMap[inv.settore_id]) {
        settoriMap[inv.settore_id] = {
          id: inv.settore_id,
          label: inv.settore_label,
          color: inv.settore_color || '#1a7a4a',
          invitati: []
        };
      }
      settoriMap[inv.settore_id].invitati.push({
        id: 'i' + inv.id,
        dbId: inv.id,
        ente: inv.ente,
        nome: inv.nome || ''
      });
    });
    window.SETTORI_RUNTIME = Object.values(settoriMap);
  } catch(e) {
    window.SETTORI_RUNTIME = SETTORI; // fallback all'array statico
  }
  renderPranzo();
}

function renderPranzo() {
  const container = document.getElementById('pranzoSettori');
  container.innerHTML = '';
  const isMaster = isMasterUser;
  const settoriDaUsare = window.SETTORI_RUNTIME || SETTORI;
  settoriDaUsare.forEach(settore => {
    const block = document.createElement('div');
    block.className = 'settore-block';
    const head = document.createElement('div');
    head.className = 'settore-head';
    head.innerHTML = '<div class="sh-color" style="background:' + settore.color + '"></div><div class="sh-info"><div class="sh-title">' + settore.label + '</div><div class="sh-sub" id="sh-stat-' + settore.id + '">—</div></div><span class="sh-arrow">▶</span>';
    head.classList.add('collapsed');
    head.onclick = (e) => {
      // Toggle solo se il click è sull'header stesso, non su elementi dentro il body
      if (body.contains(e.target)) return;
      body.classList.toggle('hidden');
      head.classList.toggle('collapsed');
      const arr = head.querySelector('.sh-arrow');
      if (arr) arr.textContent = body.classList.contains('hidden') ? '▶' : '▼';
    };
    const body = document.createElement('div');
    body.className = 'settore-body hidden';
    settore.invitati.forEach(inv => {
      const saved    = pranzoSaved[inv.id] || { risposta:'attesa', coperti:1 };
      const risposta = saved.risposta || 'attesa';
      const coperti  = saved.coperti  || 1;
      const row = document.createElement('div');
      row.className = 'inv-row ' + risposta;
      row.id = 'inv-row-' + inv.id;
      const nomeHtml = inv.nome && inv.nome.trim() ? '<div class="inv-nome">' + inv.nome + '</div>' : '';
      const editBtnHtml = (isMaster && inv.dbId)
        ? '<button class="inv-edit-btn" onclick="apriModificaInvitato(' + inv.dbId + ',\'' + inv.ente.replace(/'/g,"\\''") + '\',\'' + (inv.nome||'').replace(/'/g,"\\''") + '\',event)">✏</button>'
        : '';
      const delBtnHtml = (isMaster && inv.dbId)
        ? '<button class="inv-del-btn" onclick="eliminaInvitato(' + inv.dbId + ',event)">×</button>'
        : '';
      const s          = pranzoSaved[inv.id] || {};
      const presenza   = s.presenza || 'attesa';
      const alPranzo   = s.pranzo || false;
      const costoVal   = s.costo || '25';
      const extra      = Array.isArray(s.extra) ? s.extra : [];
      const presenzaCls = presenza==='presente' ? 'presente' : presenza==='assente' ? 'assente' : 'attesa';

      // Selettore costo
      function mkCostoSel(val, onch) {
        return '<select class="risposta-sel" onchange="'+onch+'" style="font-size:0.8rem;padding:5px 7px">'
          + '<option value="25"'+(val==='25'?' selected':'')+'>€25</option>'
          + '<option value="10"'+(val==='10'?' selected':'')+'>€10</option>'
          + '<option value="offerto"'+(val==='offerto'?' selected':'')+'>🎁</option>'
          + '</select>';
      }

      // Riga extra per ogni accompagnatore
      var extraHtml = '';
      if (presenza==='presente' && alPranzo) {
        extra.forEach(function(ex, ei) {
          var eid = inv.id;
          extraHtml += '<div class="inv-extra-row">'
            + '<input class="inv-extra-nota" placeholder="es. moglie, collega..." value="'+(ex.nota||'')+'" onchange="setExtraNota(&quot;'+eid+'&quot;,'+ei+',this.value)" style="font-size:0.78rem;padding:4px 8px;border-radius:8px;border:0.5px solid var(--border);background:var(--bg-2);color:var(--testo);width:110px">'
            + mkCostoSel(ex.costo||'25', 'setExtraCosto(&quot;'+eid+'&quot;,'+ei+',this.value)')
            + '<button class="btn-sm btn-danger" onclick="rimuoviExtra(&quot;'+eid+'&quot;,'+ei+')" style="padding:3px 8px">✕</button>'
            + '</div>';
        });
        extraHtml += '<button onclick="aggiungiExtra(&quot;'+inv.id+'&quot;)" style="font-size:0.72rem;color:var(--green);background:none;border:none;cursor:pointer;padding:2px 0;margin-top:2px">+ accompagnatore</button>';
      }

      row.innerHTML = '<div class="inv-info"><div class="inv-ente">' + inv.ente + '</div>' + nomeHtml + '</div>'
        + '<div class="inv-controls">'
        + '<select class="risposta-sel ' + presenzaCls + '" onchange="setPresenza(&quot;'+inv.id+'&quot;,this)">'
        + '<option value="attesa"'+(presenza==='attesa'?' selected':'')+'>⏳</option>'
        + '<option value="presente"'+(presenza==='presente'?' selected':'')+'>✅ Pres.</option>'
        + '<option value="assente"'+(presenza==='assente'?' selected':'')+'>❌ Ass.</option>'
        + '</select>'
        + (presenza==='presente'
          ? '<label style="display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--testo-2);cursor:pointer">'
            + '<input type="checkbox" '+(alPranzo?'checked':'')+' onchange="setPranzo(&quot;'+inv.id+'&quot;,this)" style="accent-color:var(--green);width:15px;height:15px"> 🍽</label>'
          : '')
        + (presenza==='presente' && alPranzo ? mkCostoSel(costoVal, 'setCostoInv(&quot;'+inv.id+'&quot;,this)') : '')
        + editBtnHtml
        + delBtnHtml
        + '</div>'
        + (extraHtml ? '<div class="inv-extra-list">'+extraHtml+'</div>' : '');
      body.appendChild(row);
    });
    // Bottone aggiungi (solo master)
    if (isMaster) {
      const addRow = document.createElement('div');
      addRow.style.cssText = 'padding:0.5rem 1rem;border-top:0.5px solid var(--border);';
      const addBtn = document.createElement('button');
      addBtn.className = 'doc-add-btn';
      addBtn.textContent = '+ Aggiungi invitato';
      addBtn.onclick = () => apriFormInvitato(settore);
      addRow.appendChild(addBtn);
      block.appendChild(addRow);
    }
    block.appendChild(head); block.appendChild(body);
    container.appendChild(block);
  });
  aggiornaStatsPranzo();
}

function apriModificaInvitato(dbId, ente, nome, event) {
  if (event) event.stopPropagation();
  const overlay = document.getElementById('pranzoEditOverlay');
  document.getElementById('peiId').value = dbId;
  document.getElementById('peiEnte').value = ente;
  document.getElementById('peiNome').value = nome;
  document.getElementById('peiErr').style.display = 'none';
  overlay.classList.add('open');
}

function chiudiModificaInvitato() {
  document.getElementById('pranzoEditOverlay').classList.remove('open');
}

async function salvaModificaInvitato() {
  const id    = document.getElementById('peiId').value;
  const ente  = document.getElementById('peiEnte').value.trim();
  const nome  = document.getElementById('peiNome').value.trim();
  const errEl = document.getElementById('peiErr');
  if (!ente) { errEl.textContent = 'Il ruolo/ente è obbligatorio.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?id=eq.' + id, {
      method: 'PATCH', headers: HJ, body: JSON.stringify({ ente, nome })
    });
    if (!res.ok) throw new Error('Errore salvataggio');
    await logAttivita('ha modificato invitato pranzo: ' + ente);
    chiudiModificaInvitato();
    caricaListaPranzo();
  } catch(e) { errEl.textContent = 'Errore: ' + e.message; errEl.style.display = 'block'; }
}

async function eliminaInvitato(dbId, event) {
  if (event) event.stopPropagation();
  if (!confirm('Rimuovere questo invitato dalla lista?')) return;
  try {
    await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?id=eq.' + dbId, {
      method: 'PATCH', headers: HJ, body: JSON.stringify({ attivo: false })
    });
    await logAttivita('ha rimosso un invitato dal pranzo');
    caricaListaPranzo();
  } catch(e) { alert('Errore rimozione.'); }
}

function apriFormInvitato(settore) {
  const overlay = document.getElementById('pranzoAddOverlay');
  document.getElementById('paiSettoreLabel').textContent = settore.label;
  document.getElementById('paiSettoreId').value = settore.id;
  document.getElementById('paiSettoreLabel2').value = settore.label;
  document.getElementById('paiSettoreColor').value = settore.color || '#1a7a4a';
  document.getElementById('paiEnte').value = '';
  document.getElementById('paiNome').value = '';
  document.getElementById('paiPresenza').value = 'attesa';
  document.getElementById('paiPranzo').checked = false;
  document.getElementById('paiCosto').value = '25';
  document.getElementById('paiCoperti').value = '1';
  document.getElementById('paiCostoBox').style.display = 'none';
  document.getElementById('paiErr').style.display = 'none';
  // Mostra/nascondi box pranzo quando cambia presenza
  document.getElementById('paiPresenza').onchange = function() {
    var vis = this.value === 'presente';
    document.getElementById('paiPranzoBox').style.display = vis ? 'block' : 'none';
    if (!vis) { document.getElementById('paiPranzo').checked = false; document.getElementById('paiCostoBox').style.display = 'none'; }
  };
  document.getElementById('paiPranzo').onchange = function() {
    document.getElementById('paiCostoBox').style.display = this.checked ? 'block' : 'none';
  };
  overlay.classList.add('open');
}

function chiudiFormInvitato() {
  document.getElementById('pranzoAddOverlay').classList.remove('open');
}

async function salvaInvitato() {
  const ente         = document.getElementById('paiEnte').value.trim();
  const nome         = document.getElementById('paiNome').value.trim();
  const sid          = document.getElementById('paiSettoreId').value;
  const slabel       = document.getElementById('paiSettoreLabel2').value;
  const scolor       = document.getElementById('paiSettoreColor').value;
  const presenza     = document.getElementById('paiPresenza') ? document.getElementById('paiPresenza').value : 'attesa';
  const pranzo       = document.getElementById('paiPranzo') ? document.getElementById('paiPranzo').checked : false;
  const costo        = document.getElementById('paiCosto') ? document.getElementById('paiCosto').value : '25';
  const coperti      = document.getElementById('paiCoperti') ? parseInt(document.getElementById('paiCoperti').value)||1 : 1;
  const errEl        = document.getElementById('paiErr');
  if (!ente) { errEl.textContent = 'Inserisci almeno il nome.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=representation' }),
      body: JSON.stringify({ settore_id: sid, settore_label: slabel, settore_color: scolor, ente, nome: nome||null, ordine: 999 })
    });
    if (!res.ok) throw new Error('Errore salvataggio');
    const data = await res.json();
    const newId = data[0] && data[0].id;
    if (newId && presenza !== 'attesa') {
      await fetch(SUPA_URL + '/rest/v1/pranzo_invitati', {
        method: 'POST',
        headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
        body: JSON.stringify({ inv_id: 'i'+newId, presenza, pranzo, costo, coperti, risposta: presenza==='presente'?'si':'no' })
      });
    }
    await logAttivita('ha aggiunto invitato: ' + ente);
    chiudiFormInvitato();
    caricaListaPranzo();
  } catch(e) { errEl.textContent = 'Errore: ' + e.message; errEl.style.display = 'block'; }
}

function aggiornaRigaInvitato(invId) {
  var row = document.getElementById('inv-row-' + invId);
  if (!row) return; // non ricostruire tutto
  var settori = window.SETTORI_RUNTIME || SETTORI;
  var inv = null;
  settori.forEach(function(s) { s.invitati.forEach(function(i) { if (i.id === invId) inv = i; }); });
  if (!inv) return;
  // Ricrea il contenuto della riga senza spostare scroll
  var s          = pranzoSaved[invId] || {};
  var presenza   = s.presenza || 'attesa';
  var alPranzo   = s.pranzo || false;
  var costoVal   = s.costo || '25';
  var extra      = Array.isArray(s.extra) ? s.extra : [];
  var presenzaCls = presenza==='presente' ? 'presente' : presenza==='assente' ? 'assente' : 'attesa';
  var nomeHtml   = inv.nome ? '<div class="inv-nome">' + inv.nome + '</div>' : '';
  var isMaster   = currentUser && currentUser.tipo_accesso === 'master';
  var _ente = (inv.ente||'').replace(/'/g,'');
  var _nome = (inv.nome||'').replace(/'/g,'');
  var editBtnHtml = (isMaster && inv.dbId)
    ? '<button class="inv-edit-btn" onclick="apriModificaInvitato('+inv.dbId+',\''+_ente+'\',\''+_nome+'\',event)">✏</button>'
    : '';
  var delBtnHtml  = (isMaster && inv.dbId) ? '<button class="inv-del-btn" onclick="eliminaInvitato('+inv.dbId+',event)">×</button>' : '';

  function mkCS(val, onch) {
    return '<select class="risposta-sel" onchange="'+onch+'" style="font-size:0.8rem;padding:5px 7px">'
      + '<option value="25"'+(val==='25'?' selected':'')+'>€25</option>'
      + '<option value="10"'+(val==='10'?' selected':'')+'>€10</option>'
      + '<option value="offerto"'+(val==='offerto'?' selected':'')+'>🎁</option>'
      + '</select>';
  }

  var extraHtml = '';
  if (presenza==='presente' && alPranzo) {
    extra.forEach(function(ex, ei) {
      extraHtml += '<div class="inv-extra-row">'
        + '<input class="inv-extra-nota" placeholder="es. moglie, collega..." value="'+(ex.nota||'')+'" onchange="setExtraNota(&quot;'+invId+'&quot;,'+ei+',this.value)" style="font-size:0.78rem;padding:4px 8px;border-radius:8px;border:0.5px solid var(--border);background:var(--bg-2);color:var(--testo);width:110px">'
        + mkCS(ex.costo||'25', 'setExtraCosto(&quot;'+invId+'&quot;,'+ei+',this.value)')
        + '<button class="btn-sm btn-danger" onclick="rimuoviExtra(&quot;'+invId+'&quot;,'+ei+')" style="padding:3px 8px">✕</button>'
        + '</div>';
    });
    extraHtml += '<button onclick="aggiungiExtra(&quot;'+invId+'&quot;)" style="font-size:0.72rem;color:var(--green);background:none;border:none;cursor:pointer;padding:2px 0;margin-top:2px">+ accompagnatore</button>';
  }

  row.innerHTML = '<div class="inv-info"><div class="inv-ente">'+inv.ente+'</div>'+nomeHtml+'</div>'
    + '<div class="inv-controls">'
    + '<select class="risposta-sel '+presenzaCls+'" onchange="setPresenza(&quot;'+invId+'&quot;,this)">'
    + '<option value="attesa"'+(presenza==='attesa'?' selected':'')+'>⏳</option>'
    + '<option value="presente"'+(presenza==='presente'?' selected':'')+'>✅ Pres.</option>'
    + '<option value="assente"'+(presenza==='assente'?' selected':'')+'>❌ Ass.</option>'
    + '</select>'
    + (presenza==='presente' ? '<label style="display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--testo-2);cursor:pointer"><input type="checkbox" '+(alPranzo?'checked':'')+' onchange="setPranzo(&quot;'+invId+'&quot;,this)" style="accent-color:var(--green);width:15px;height:15px"> 🍽</label>' : '')
    + (presenza==='presente' && alPranzo ? mkCS(costoVal, 'setCostoInv(&quot;'+invId+'&quot;,this)') : '')
    + editBtnHtml + delBtnHtml
    + '</div>'
    + (extraHtml ? '<div class="inv-extra-list">'+extraHtml+'</div>' : '');

  aggiornaStatsPranzo();
}

async function setPresenza(invId, sel) {
  var presenza = sel.value;
  if (!pranzoSaved[invId]) pranzoSaved[invId] = {};
  pranzoSaved[invId].presenza = presenza;
  // Se assente, rimuovi pranzo
  if (presenza === 'assente') pranzoSaved[invId].pranzo = false;
  await savePranzoInv(invId);
  aggiornaRigaInvitato(invId);
}

async function setPranzo(invId, cb) {
  if (!pranzoSaved[invId]) pranzoSaved[invId] = {};
  pranzoSaved[invId].pranzo = cb.checked;
  if (!cb.checked) { pranzoSaved[invId].coperti = 1; pranzoSaved[invId].extra_coperti = 0; }
  await savePranzoInv(invId);
  aggiornaRigaInvitato(invId);
}

async function setCostoInv(invId, sel) {
  if (!pranzoSaved[invId]) pranzoSaved[invId] = {};
  pranzoSaved[invId].costo = sel.value;
  await savePranzoInv(invId);
  aggiornaStatsPranzo();
}

async function setExtraCosto(invId, sel) {
  if (!pranzoSaved[invId]) pranzoSaved[invId] = {};
  pranzoSaved[invId].extra_costo = sel.value;
  await savePranzoInv(invId);
  aggiornaStatsPranzo();
}

async function savePranzoInv(invId) {
  var s = pranzoSaved[invId] || {};
  try {
    await fetch(SUPA_URL + '/rest/v1/pranzo_invitati', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({
        inv_id: invId,
        presenza: s.presenza || 'attesa',
        pranzo: s.pranzo || false,
        coperti: s.coperti || 1,
        costo: s.costo || '25',
        extra: s.extra || [],
        risposta: s.presenza === 'presente' ? 'si' : s.presenza === 'assente' ? 'no' : 'attesa'
      })
    });
  } catch(e) {}
}

async function aggiungiExtra(invId) {
  if (!pranzoSaved[invId]) pranzoSaved[invId] = {};
  if (!Array.isArray(pranzoSaved[invId].extra)) pranzoSaved[invId].extra = [];
  pranzoSaved[invId].extra.push({ nota: '', costo: '25' });
  await savePranzoInv(invId);
  aggiornaRigaInvitato(invId);
}

async function rimuoviExtra(invId, idx) {
  if (!pranzoSaved[invId] || !pranzoSaved[invId].extra) return;
  pranzoSaved[invId].extra.splice(idx, 1);
  await savePranzoInv(invId);
  aggiornaRigaInvitato(invId);
}

async function setExtraNota(invId, idx, val) {
  if (!pranzoSaved[invId] || !pranzoSaved[invId].extra) return;
  pranzoSaved[invId].extra[idx].nota = val;
  await savePranzoInv(invId);
  aggiornaStatsPranzo();
}

async function setExtraCosto(invId, idx, val) {
  if (!pranzoSaved[invId] || !pranzoSaved[invId].extra) return;
  pranzoSaved[invId].extra[idx].costo = val;
  await savePranzoInv(invId);
  aggiornaStatsPranzo();
}

async function setCosto(invId, sel) {
  const costo = sel.value;
  if (!pranzoSaved[invId]) pranzoSaved[invId] = { risposta:'si', coperti:1 };
  pranzoSaved[invId].costo = costo;
  // Salva su Supabase
  try {
    await fetch(SUPA_URL + '/rest/v1/pranzo_invitati', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ inv_id: invId, costo: costo })
    });
  } catch(e) {}
  aggiornaStatsPranzo();
  // Aggiorna colore select
  sel.className = 'risposta-sel ' + costo;
}

async function setRisposta(id, sel) {
  const val = sel.value;
  if (!pranzoSaved[id]) pranzoSaved[id] = { risposta:'attesa', coperti:1 };
  pranzoSaved[id].risposta = val;
  const row = document.getElementById('row-' + id);
  if (row) row.className = 'inv-row ' + val;
  sel.className = 'risposta-sel ' + val;
  const ctrl = document.getElementById('cop-ctrl-' + id);
  if (ctrl) ctrl.style.cssText = val === 'si' ? '' : 'opacity:0.3;pointer-events:none';
  await salvaPranzoRecord(id);
  aggiornaStatsPranzo();
  await logAttivita('ha aggiornato risposta pranzo: ' + id + ' → ' + val);
}

async function setCoperti(id, delta) {
  if (!pranzoSaved[id]) pranzoSaved[id] = { risposta:'attesa', coperti:1 };
  pranzoSaved[id].coperti = Math.max(1, (pranzoSaved[id].coperti || 1) + delta);
  const el = document.getElementById('cop-' + id);
  if (el) el.textContent = pranzoSaved[id].coperti;
  await salvaPranzoRecord(id);
  aggiornaStatsPranzo();
}

async function salvaPranzoRecord(id) {
  const rec = pranzoSaved[id];
  try { localStorage.setItem('pranzo_data', JSON.stringify(pranzoSaved)); } catch(e) {}
  try {
    await fetch(SUPA_URL + '/rest/v1/pranzo_invitati', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ inv_id: id, risposta: rec.risposta, coperti: rec.coperti })
    });
  } catch(e) {}
}

function aggiornaStatsPranzo() {
  var totInvitati=0, totConferme=0, totDecline=0, totCoperti=0, totIncasso=0, totCosto=0;
  var settoriDaUsare = window.SETTORI_RUNTIME || SETTORI;
  settoriDaUsare.forEach(function(settore) {
    var conf=0;
    settore.invitati.forEach(function(inv) {
      totInvitati++;
      var saved = pranzoSaved[inv.id] || {};
      if (saved.presenza==='presente') { conf++; totConferme++; }
      if (saved.presenza==='presente' && saved.pranzo) {
        var cop   = saved.coperti || 1;
        var costo = saved.costo || '25';
        totCoperti += cop;
        if (costo==='25')           { totIncasso += 25*cop; }
        else if (costo==='10')      { totIncasso += 10*cop; totCosto += 15*cop; }
        else if (costo==='offerto') { totCosto += 25*cop; }
        // Extra
        var extra = Array.isArray(saved.extra) ? saved.extra : [];
        extra.forEach(function(ex) {
          totCoperti++;
          var ec = ex.costo || '25';
          if (ec==='25')           { totIncasso += 25; }
          else if (ec==='10')      { totIncasso += 10; totCosto += 15; }
          else if (ec==='offerto') { totCosto += 25; }
        });
      }
    });
    var el = document.getElementById('sh-stat-' + settore.id);
    if (el) el.textContent = conf + ' conf. / ' + settore.invitati.length + ' tot.';
  });
  var els = {
    psInvitati: totInvitati, psConferme: totConferme,
    psDecline: totDecline, psCoperti: totCoperti,
    pranzoIncasso: '€' + totIncasso, pranzoCostoUnita: '€' + totCosto
  };
  Object.keys(els).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = els[id];
  });
}


function filtraPranzo(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('.inv-row').forEach(row => {
    row.classList.toggle('nascosta', term && !row.textContent.toLowerCase().includes(term));
  });
}


// -- EXPORT/IMPORT CSV PRANZO --

function csvEscape(val) {
  return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
}

function downloadCSV(rows, filename) {
  var csv  = rows.map(function(r){ return r.map(csvEscape).join(','); }).join('\r\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var a    = document.createElement('a');
  a.href   = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportPranzoCSV() {
  try {
    var listaRes    = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?select=*&order=settore_id,ordine&attivo=eq.true', { headers: H });
    var risposteRes = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=inv_id,risposta,coperti,costo', { headers: H });
    var lista       = await listaRes.json();
    var risposte    = await risposteRes.json();
    var rispMap     = {};
    risposte.forEach(function(r){ rispMap[r.inv_id] = r; });
    var rows = [['ID','SETTORE_ID','SETTORE_LABEL','ENTE','NOME','RISPOSTA','COPERTI']];
    lista.forEach(function(inv) {
      var saved = rispMap['i' + inv.id] || { risposta: 'attesa', coperti: 1 };
      rows.push([inv.id, inv.settore_id, inv.settore_label, inv.ente, inv.nome || '', saved.risposta || 'attesa', saved.risposta === 'si' ? (saved.coperti || 1) : 0]);
    });
    downloadCSV(rows, 'pranzo_25anni_' + new Date().toISOString().slice(0,10) + '.csv');
  } catch(e) { alert('Errore export: ' + e.message); }
}

async function importPranzoCSV(input) {
  var file = input.files[0];
  if (!file) return;
  var text  = await file.text();
  var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l; });
  var dataLines = lines.slice(1);
  if (!dataLines.length) { alert('File vuoto.'); return; }
  var aggiunti = 0, aggiornati = 0, errori = 0;
  var btn = document.getElementById('importCsvBtn');
  if (btn) { btn.textContent = 'importazione...'; btn.disabled = true; }
  for (var i = 0; i < dataLines.length; i++) {
    var line = dataLines[i];
    var cols = [], cur = '', inQ = false;
    for (var j = 0; j < line.length; j++) {
      var c = line[j];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
      else cur += c;
    }
    cols.push(cur);
    var id = (cols[0]||'').replace(/^"|"$/g,'').trim();
    var sid = (cols[1]||'').replace(/^"|"$/g,'').trim();
    var slabel = (cols[2]||'').replace(/^"|"$/g,'').trim();
    var ente = (cols[3]||'').replace(/^"|"$/g,'').trim();
    var nome = (cols[4]||'').replace(/^"|"$/g,'').trim();
    var risposta = (cols[5]||'').replace(/^"|"$/g,'').trim();
    var coperti = (cols[6]||'0').replace(/^"|"$/g,'').trim();
    if (!ente) continue;
    try {
      if (id && !isNaN(parseInt(id))) {
        await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?id=eq.' + parseInt(id), { method: 'PATCH', headers: HJ, body: JSON.stringify({ ente: ente, nome: nome, settore_id: sid, settore_label: slabel }) });
        aggiornati++;
      } else {
        await fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista', { method: 'POST', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ settore_id: sid, settore_label: slabel, ente: ente, nome: nome, ordine: 999 }) });
        aggiunti++;
      }
      if (risposta && risposta !== 'attesa' && id) {
        await fetch(SUPA_URL + '/rest/v1/pranzo_invitati', { method: 'POST', headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }), body: JSON.stringify({ inv_id: 'i' + id, risposta: risposta, coperti: parseInt(coperti)||1 }) });
      }
    } catch(e) { errori++; }
  }
  await logAttivita('ha importato CSV pranzo: +' + aggiunti + ' nuovi, ' + aggiornati + ' aggiornati');
  if (btn) { btn.textContent = 'importa CSV'; btn.disabled = false; }
  input.value = '';
  alert('Completato\n+ ' + aggiunti + ' nuovi\n~ ' + aggiornati + ' aggiornati' + (errori ? '\n! ' + errori + ' errori' : ''));
  caricaListaPranzo();
}

// -- PDF RIEPILOGO PRANZO --

async function stampaPDFPranzo() {
  const btn = document.getElementById('pdfPranzoBtn');
  if (btn) { btn.textContent = 'generazione...'; btn.disabled = true; }

  try {
    const [listaRes, risposteRes] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?select=*&order=settore_id,ordine', { headers: H }),
      fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=*', { headers: H })
    ]);
    const lista    = await listaRes.json();
    const risposte = await risposteRes.json();

    const rMap = {};
    risposte.forEach(r => { rMap[r.inv_id] = r; });

    const ora   = new Date().toLocaleString('it-IT');
    const today = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' });

    // Raggruppa per settore
    const settoriMap = {};
    lista.forEach(inv => {
      if (!settoriMap[inv.settore_id]) settoriMap[inv.settore_id] = { label: inv.settore_label, color: inv.settore_color, invitati: [] };
      settoriMap[inv.settore_id].invitati.push(inv);
    });

    // Dati confermati
    let totCoperti = 0, totIncasso = 0, totCosto = 0;
    let righeConfermate = []; // {settore, ente, nome, pranzo, coperti, costo, extra}
    let righeSoloCerimonia = [];

    Object.values(settoriMap).forEach(settore => {
      settore.invitati.forEach(inv => {
        const r = rMap['i' + inv.id] || rMap[String(inv.id)] || {};
        const presenza  = r.presenza || r.risposta || 'attesa';
        const confermato = presenza === 'presente' || presenza === 'si';
        if (!confermato) return;

        const alPranzo  = r.pranzo || false;
        const coperti   = r.coperti || 1;
        const costo     = r.costo || '25';
        const extra     = Array.isArray(r.extra) ? r.extra : [];
        const nomeDisplay = inv.nome && inv.nome.trim() ? inv.nome : '';

        if (alPranzo) {
          // Calcola incasso/costo
          if (costo==='25')           { totIncasso += 25*coperti; }
          else if (costo==='10')      { totIncasso += 10*coperti; totCosto += 15*coperti; }
          else if (costo==='offerto') { totCosto += 25*coperti; }
          totCoperti += coperti;
          extra.forEach(ex => {
            totCoperti++;
            if (ex.costo==='25')           { totIncasso += 25; }
            else if (ex.costo==='10')      { totIncasso += 10; totCosto += 15; }
            else if (ex.costo==='offerto') { totCosto += 25; }
          });
          righeConfermate.push({ settore: settore.label, color: settore.color, ente: inv.ente, nome: nomeDisplay, coperti, costo, extra });
        } else {
          righeSoloCerimonia.push({ settore: settore.label, color: settore.color, ente: inv.ente, nome: nomeDisplay });
        }
      });
    });

    const costoLabel = c => c==='25' ? '€25' : c==='10' ? '€10' : '🎁 Offerto';

    let htmlConfermate = '';
    let setCorr = '';
    righeConfermate.forEach((r, i) => {
      if (r.settore !== setCorr) {
        setCorr = r.settore;
        htmlConfermate += '<tr><td colspan="5" style="background:#1a7a4a;color:white;font-weight:700;padding:5px 8px">'+r.settore+'</td></tr>';
      }
      const extraStr = r.extra.length ? r.extra.map(e => (e.nota||'—')+' '+costoLabel(e.costo||'25')).join(', ') : '—';
      htmlConfermate += '<tr>'
        + '<td>'+(i+1)+'</td>'
        + '<td>'+(r.ente||'')+'</td>'
        + '<td>'+(r.nome||'')+'</td>'
        + '<td style="text-align:center">'+r.coperti+'</td>'
        + '<td>'+costoLabel(r.costo)+(r.extra.length ? '<br><small style="color:#666">+'+r.extra.length+' acc: '+extraStr+'</small>' : '')+'</td>'
        + '</tr>';
    });

    let htmlCerimonia = '';
    let setCorrC = '';
    righeSoloCerimonia.forEach((r, i) => {
      if (r.settore !== setCorrC) {
        setCorrC = r.settore;
        htmlCerimonia += '<tr><td colspan="3" style="background:#555;color:white;font-weight:700;padding:5px 8px">'+r.settore+'</td></tr>';
      }
      htmlCerimonia += '<tr><td>'+(i+1)+'</td><td>'+(r.ente||'')+'</td><td>'+(r.nome||'')+'</td></tr>';
    });

    const win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
      + '<title>Riepilogo Pranzo 25°</title>'
      + '<style>'
      + 'body{font-family:Arial,sans-serif;font-size:9.5pt;color:#111;margin:1.5cm;max-width:19cm}'
      + '.header{border-bottom:3px solid #1a7a4a;padding-bottom:0.7rem;margin-bottom:0.8rem}'
      + 'h1{font-size:14pt;color:#1a7a4a;margin:0 0 0.15rem}'
      + '.meta{font-size:8pt;color:#666}'
      + 'h2{font-size:10pt;font-weight:700;color:#1a7a4a;border-bottom:1.5px solid #1a7a4a;padding-bottom:3px;margin:0.8rem 0 0.4rem}'
      + 'h3{font-size:9pt;font-weight:700;color:#555;margin:0.7rem 0 0.3rem}'
      + 'table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:0.5rem}'
      + 'th{background:#1a7a4a;color:white;font-weight:700;padding:4px 7px;text-align:left}'
      + 'td{padding:4px 7px;border-bottom:0.5px solid #e5e7eb}'
      + 'tr:nth-child(even) td{background:#f9fafb}'
      + '.totali{display:flex;gap:1rem;margin:0.8rem 0}'
      + '.tot-card{flex:1;background:#f3f4f6;border-radius:6px;padding:0.5rem 0.8rem;text-align:center}'
      + '.tot-num{font-size:1.3rem;font-weight:700}'
      + '.tot-lbl{font-size:7.5pt;color:#666;text-transform:uppercase}'
      + '@media print{body{margin:1cm}th,.tot-card{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
      + '</style></head><body>'
      + '<div class="header"><h1>Riepilogo Pranzo — 25° Anniversario PC ANA</h1>'
      + '<div class="meta">Generato il '+ora+'</div></div>'

      + '<div class="totali">'
      + '<div class="tot-card"><div class="tot-num" style="color:#1a7a4a">'+totCoperti+'</div><div class="tot-lbl">Coperti</div></div>'
      + '<div class="tot-card"><div class="tot-num" style="color:#185fa5">€'+totIncasso+'</div><div class="tot-lbl">Incasso</div></div>'
      + '<div class="tot-card"><div class="tot-num" style="color:#c0392b">€'+totCosto+'</div><div class="tot-lbl">Costo unità</div></div>'
      + '<div class="tot-card"><div class="tot-num" style="color:#854f0b">'+righeConfermate.length+'</div><div class="tot-lbl">A pranzo</div></div>'
      + '<div class="tot-card"><div class="tot-num" style="color:#555">'+righeSoloCerimonia.length+'</div><div class="tot-lbl">Solo cerimonia</div></div>'
      + '</div>'

      + '<h2>🍽️ Presenti al pranzo ('+righeConfermate.length+')</h2>'
      + '<table><thead><tr><th>#</th><th>Ente / Ruolo</th><th>Nome</th><th style="text-align:center">Coperti</th><th>Costo</th></tr></thead><tbody>'
      + htmlConfermate
      + '</tbody></table>'

      + '<h2>🎖️ Solo cerimonia ('+righeSoloCerimonia.length+')</h2>'
      + '<table><thead><tr><th>#</th><th>Ente / Ruolo</th><th>Nome</th></tr></thead><tbody>'
      + htmlCerimonia
      + '</tbody></table>'

      + '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>'
      + '</body></html>');
    win.document.close();

  } catch(e) { alert('Errore generazione PDF: ' + e.message); }

  if (btn) { btn.textContent = 'scarica PDF'; btn.disabled = false; }
}



// -- RICHIESTE --
async function caricaBadgeRichieste() {
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?letta=eq.false&select=id', { headers: H });
    const data = await res.json();
    const badge = document.getElementById('siBadgeRichieste');
    if (data.length > 0) { badge.textContent = data.length; badge.classList.add('show'); }
    else badge.classList.remove('show');
  } catch(e) {}
}

async function caricaRichieste() {
  const list = document.getElementById('richiesteList');
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res       = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?select=*&order=created_at.desc', { headers: H });
    const richieste = await res.json();
    const nonLette  = richieste.filter(r => !r.letta).length;
    const badge     = document.getElementById('siBadgeRichieste');
    if (nonLette > 0) { badge.textContent = nonLette; badge.classList.add('show'); }
    else badge.classList.remove('show');
    if (!richieste.length) { list.innerHTML = '<div class="loading-msg">nessuna richiesta.</div>'; return; }
    list.innerHTML = '';
    richieste.forEach(r => {
      const data = new Date(r.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
      const div  = document.createElement('div');
      div.className = 'richiesta-card ' + (r.letta ? 'letta' : 'nuova');
      const tag   = r.letta ? '' : '<span class="badge-nuova">NUOVA</span>';
      const socio = r.socio_ana ? '<div>Socio ANA: ' + r.socio_ana + (r.gruppo_ana ? ' — ' + r.gruppo_ana : '') + '</div>' : '';
      const msg   = r.messaggio ? '<div class="richiesta-msg">"' + r.messaggio + '"</div>' : '';
      const tel   = r.telefono  ? ' . ' + r.telefono : '';
      const btnL  = r.letta ? '<span style="font-size:0.65rem;color:var(--text-4)">✓ letta</span>' : '<button class="btn-sm btn-ok" onclick="segnaLetta(\'' + r.id + '\')">segna letta</button>';
      div.innerHTML = '<div class="richiesta-top"><div><span class="richiesta-nome">' + r.nome + '</span>' + tag + '</div><span class="richiesta-data">' + data + '</span></div>'
        + '<div class="richiesta-body"><div>' + r.email + tel + '</div>' + socio + msg + '</div>'
        + '<div class="richiesta-actions">' + btnL + '<button class="btn-sm btn-danger" onclick="eliminaRichiesta(\'' + r.id + '\')">elimina</button></div>';
      list.appendChild(div);
    });
  } catch(e) { list.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

async function segnaLetta(id) {
  await fetch(SUPA_URL + '/rest/v1/richieste_adesione?id=eq.' + id, { method:'PATCH', headers:HJ, body:JSON.stringify({ letta:true }) });
  await logAttivita('ha segnato una richiesta come letta');
  caricaRichieste();
}

async function eliminaRichiesta(id) {
  if (!confirm('Eliminare questa richiesta?')) return;
  await fetch(SUPA_URL + '/rest/v1/richieste_adesione?id=eq.' + id, { method:'DELETE', headers:H });
  await logAttivita('ha eliminato una richiesta adesione');
  caricaRichieste();
}

// -- IMPOSTAZIONI --
async function caricaImpostazioni() {
  caricaUtenti();
  caricaLog();
  renderSchemaList();
}

async function caricaUtenti() {
  const list = document.getElementById('utentiList');
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res    = await fetch(SUPA_URL + '/rest/v1/utenti?select=id,nome,username,ruolo,tipo_accesso,attivo,permessi&order=nome', { headers: H });
    const utenti = await res.json();
    _utentiList = utenti;
    list.innerHTML = '';
    utenti.forEach(u => {
      const row = document.createElement('div');
      row.className = 'impo-u-row' + (u.attivo ? '' : ' utente-disattivo');
      const initials = u.nome.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
      const bgColor  = u.tipo_accesso === 'master' ? '#1a3a1f' : '#1c2a3a';
      const fgColor  = u.tipo_accesso === 'master' ? '#3fb950' : '#58a6ff';
      const badgeClass = u.tipo_accesso === 'master' ? 'badge-master' : (u.attivo ? 'badge-std' : 'badge-off');
      const badgeText  = u.tipo_accesso === 'master' ? 'MASTER' : (u.attivo ? 'STD' : 'OFF');
      const p = u.permessi || {};
      const perms = u.tipo_accesso === 'master' ? '' :
        '<div style="margin-top:0.2rem;display:flex;flex-wrap:wrap;gap:2px">'
        + (p.volontari?'<span class="badge badge-std" style="font-size:0.5rem">Vol</span>':'')
        + (p.interventi?'<span class="badge badge-std" style="font-size:0.5rem">Int</span>':'')
        + (p.mezzi?'<span class="badge badge-std" style="font-size:0.5rem">Mez</span>':'')
        + (p.richieste?'<span class="badge badge-std" style="font-size:0.5rem">Ric</span>':'')
        + (p.pranzo?'<span class="badge badge-std" style="font-size:0.5rem">Pra</span>':'')
        + '</div>';
      row.innerHTML = '<div class="impo-u-avatar" style="background:' + bgColor + ';color:' + fgColor + '">' + initials + '</div>'
        + '<div class="impo-u-info"><div class="impo-u-name">' + u.nome + '</div><div class="impo-u-role">@' + u.username + ' . ' + u.ruolo + '</div>' + perms + '</div>'
        + '<div class="impo-u-actions">'
        + '<span class="badge ' + badgeClass + '">' + badgeText + '</span>'
        + '<button class="btn-sm btn-ok" onclick="apriModificaUtenteById(\'' + u.id + '\')">✏</button>'
        + '<button class="btn-sm ' + (u.attivo ? 'btn-warn' : 'btn-ok') + '" onclick="toggleAttivo(\'' + u.id + '\',' + u.attivo + ')">' + (u.attivo ? 'off' : 'on') + '</button>'
        + '<button class="btn-sm btn-danger" onclick="eliminaUtenteById(\'' + u.id + '\')">✕</button>'
        + '</div>';
      list.appendChild(row);
    });
  } catch(e) { list.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

async function salvaUtente() {
  const nome      = document.getElementById('nuovoNome').value.trim();
  const username  = document.getElementById('nuovoUsername').value.trim();
  const password  = document.getElementById('nuovaPassword').value.trim();
  const ruolo     = document.getElementById('nuovoRuolo').value.trim();
  const errEl     = document.getElementById('nuovoUtenteErr');
  if (!nome || !username || !password || !ruolo) { errEl.textContent = 'Compila tutti i campi.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  const permessi = {
    volontari:  document.getElementById('permVolontari').checked,
    interventi: document.getElementById('permInterventi').checked,
    mezzi:      document.getElementById('permMezzi').checked,
    richieste:  document.getElementById('permRichieste').checked,
    pranzo:       document.getElementById('permPranzo') ? document.getElementById('permPranzo').checked : false,
    documenti:    document.getElementById('permDocumenti') ? document.getElementById('permDocumenti').checked : false,
    db:           document.getElementById('permDb') ? document.getElementById('permDb').checked : false,
    impostazioni: document.getElementById('permImpostazioni') ? document.getElementById('permImpostazioni').checked : false,
    statistiche:  document.getElementById('permStatistiche') ? document.getElementById('permStatistiche').checked : false,
  };
  const res = await fetch(SUPA_URL + '/rest/v1/utenti', {
    method: 'POST',
    headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ nome, username, password, ruolo, tipo_accesso:'standard', permessi })
  });
  if (res.ok) {
    ['nuovoNome','nuovoUsername','nuovaPassword','nuovoRuolo'].forEach(id => document.getElementById(id).value = '');
    await logAttivita('ha aggiunto utente: ' + nome);
    caricaUtenti();
  } else { errEl.textContent = 'Errore. Username già esistente?'; errEl.style.display = 'block'; }
}

var _utentiList = [];

function apriModificaUtenteById(id) {
  var u = _utentiList.find(function(x){ return String(x.id) === String(id); });
  if (u) apriModificaUtente(u);
}

function eliminaUtenteById(id) {
  var u = _utentiList.find(function(x){ return String(x.id) === String(id); });
  if (u) eliminaUtente(u.id, u.nome);
}

function apriModificaUtente(u) {
  document.getElementById('modUtenteId').value      = u.id;
  document.getElementById('modNome').value          = u.nome || '';
  document.getElementById('modUsername').value      = u.username || '';
  document.getElementById('modPassword').value      = '';
  document.getElementById('modRuolo').value         = u.ruolo || '';
  var p = u.permessi || {};
  var permMap = {
    'Volontari':'volontari','Interventi':'interventi','Mezzi':'mezzi','Db':'db',
    'Documenti':'documenti','Pranzo':'pranzo','Richieste':'richieste',
    'Impostazioni':'impostazioni','Statistiche':'statistiche','Esercitazione':'esercitazione'
  };
  Object.keys(permMap).forEach(function(n) {
    var el = document.getElementById('modPerm' + n);
    if (el) el.checked = !!(p[permMap[n]]);
  });
  document.getElementById('modUtenteErr').style.display = 'none';
  document.getElementById('modUtenteOverlay').classList.add('open');
}

function chiudiModificaUtente() {
  document.getElementById('modUtenteOverlay').classList.remove('open');
}

async function salvaModificaUtente() {
  var id       = document.getElementById('modUtenteId').value;
  var nome     = document.getElementById('modNome').value.trim();
  var username = document.getElementById('modUsername').value.trim();
  var password = document.getElementById('modPassword').value.trim();
  var ruolo    = document.getElementById('modRuolo').value.trim();
  var errEl    = document.getElementById('modUtenteErr');
  if (!nome || !username || !ruolo) { errEl.textContent = 'Compila tutti i campi.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  var permessi = {
    volontari:    document.getElementById('modPermVolontari') ? document.getElementById('modPermVolontari').checked : false,
    interventi:   document.getElementById('modPermInterventi') ? document.getElementById('modPermInterventi').checked : false,
    mezzi:        document.getElementById('modPermMezzi') ? document.getElementById('modPermMezzi').checked : false,
    db:           document.getElementById('modPermDb') ? document.getElementById('modPermDb').checked : false,
    documenti:    document.getElementById('modPermDocumenti') ? document.getElementById('modPermDocumenti').checked : false,
    pranzo:       document.getElementById('modPermPranzo') ? document.getElementById('modPermPranzo').checked : false,
    richieste:    document.getElementById('modPermRichieste') ? document.getElementById('modPermRichieste').checked : false,
    impostazioni: document.getElementById('modPermImpostazioni') ? document.getElementById('modPermImpostazioni').checked : false,
    statistiche:    document.getElementById('modPermStatistiche') ? document.getElementById('modPermStatistiche').checked : false,
    esercitazione: document.getElementById('modPermEsercitazione') ? document.getElementById('modPermEsercitazione').checked : false,
  };
  var body = { nome: nome, username: username, ruolo: ruolo, permessi: permessi };
  if (password) body.password = password;
  try {
    var res = await fetch(SUPA_URL + '/rest/v1/utenti?id=eq.' + id, {
      method: 'PATCH', headers: HJ, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Errore salvataggio');
    await logAttivita('ha modificato utente: ' + nome);
    chiudiModificaUtente();
    caricaUtenti();
  } catch(e) { errEl.textContent = 'Errore: ' + e.message; errEl.style.display = 'block'; }
}

async function toggleAttivo(id, attivo) {
  await fetch(SUPA_URL + '/rest/v1/utenti?id=eq.' + id, { method:'PATCH', headers:HJ, body:JSON.stringify({ attivo: !attivo }) });
  await logAttivita('ha ' + (attivo ? 'disattivato' : 'riattivato') + ' un utente');
  caricaUtenti();
}

async function caricaLog() {
  const list = document.getElementById('logList');
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/log_attivita?select=*&order=created_at.desc&limit=30', { headers: H });
    const logs = await res.json();
    if (!logs.length) { list.innerHTML = '<div class="loading-msg">nessun log.</div>'; return; }
    list.innerHTML = '';
    logs.forEach(l => {
      const dt  = new Date(l.created_at);
      const now = new Date();
      const isOggi = dt.toDateString() === now.toDateString();
      const timeStr = isOggi
        ? dt.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })
        : dt.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' });
      const row = document.createElement('div');
      row.className = 'log-row';
      row.innerHTML = '<span class="log-time">' + timeStr + '</span>'
        + '<div class="log-text"><span class="log-user">' + (l.utente_nome||'?') + '</span> ' + (l.azione||'') + '</div>';
      list.appendChild(row);
    });
  } catch(e) { list.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}


// -- VOLONTARI --
let volontariData = [];
let volCorrenteId = null;

const AVATAR_COLORS = [
  ['#e8f5ee','#1a7a4a'], ['#e8f0fb','#1a4a9a'], ['#fef3e8','#b45309'],
  ['#f3e8ff','#7c3aed'], ['#fde8e8','#b91c1c'], ['#e8faf5','#0f766e']
];

function avatarColor(str) {
  let h = 0; for (let c of (str||'')) h = (h*31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

async function caricaVolontari() {
  const list = document.getElementById('volList');
  if (!list) return;
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  if (!visteCache.length) caricaViste();
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome,squadra,tipo_volontario,mansione,specializzazione,telefono,quattro_ore,dodici_ore,dae,pronto_impiego,stato_visita,attivo,foto_url&order=cognome', { headers: H });
    volontariData = await res.json();
    document.getElementById('volTot').textContent = volontariData.length;
    renderVolontari(volontariData);
  } catch(e) { list.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

function renderVolontari(data) {
  const list = document.getElementById('volList');
  if (!list) return;
  document.getElementById('volMostrati').textContent = data.length;
  if (!data.length) { list.innerHTML = '<div class="loading-msg">nessun risultato.</div>'; return; }
  list.innerHTML = '';
  data.forEach(v => {
    const initials = ((v.cognome||'?')[0] + (v.nome||'?')[0]).toUpperCase();
    const [bg, fg] = avatarColor(v.cognome);
    const card = document.createElement('div');
    card.className = 'vol-card';
    card.onclick = () => apriDettaglio(v.id);
    const badges = [];
    if (v.squadra) badges.push('<span class="vol-badge vb-squadra">' + v.squadra + '</span>');
    if (!v.attivo) badges.push('<span class="vol-badge vb-off">NON ATTIVO</span>');
    if (v.dae) badges.push('<span class="vol-badge vb-ok">DAE</span>');
    if (v.pronto_impiego) badges.push('<span class="vol-badge vb-ok">PI</span>');
    card.innerHTML = '<div class="vol-avatar" style="background:' + bg + ';color:' + fg + '">' + initials + '</div>'
      + '<div class="vol-card-info"><div class="vol-card-name">' + v.cognome + ' ' + v.nome + '</div>'
      + '<div class="vol-card-sub"><span>' + (v.tipo_volontario||'—') + '</span>' + (v.mansione ? '<span>. ' + v.mansione + '</span>' : '') + '</div></div>'
      + '<div class="vol-card-badges">' + badges.join('') + '</div>';
    list.appendChild(card);
  });
}

function filtraVolontari() {
  const q       = (document.getElementById('volSearch').value || '').toLowerCase().trim();
  const squadra = document.getElementById('filtroSquadra').value;
  const tipo    = document.getElementById('filtroTipo').value;
  const mansione = document.getElementById('filtroMansione').value;
  const attivo  = document.getElementById('filtroAttivo').value;
  const filtered = volontariData.filter(v => {
    const nome = (v.cognome + ' ' + v.nome + ' ' + (v.squadra||'')).toLowerCase();
    if (q && !nome.includes(q)) return false;
    if (squadra && v.squadra !== squadra) return false;
    if (tipo && v.tipo_volontario !== tipo) return false;
    if (mansione && v.mansione !== mansione) return false;
    if (attivo === 'true' && !v.attivo) return false;
    if (attivo === 'false' && v.attivo) return false;
    return true;
  });
  renderVolontari(filtered);
}

function toggleVolFiltri() {
  const el = document.getElementById('volFiltri');
  const btn = document.getElementById('volFilterBtn');
  el.classList.toggle('open');
  btn.classList.toggle('active');
}

async function apriDettaglio(id) {
  volCorrenteId = id;
  volInterventiLoaded = false;
  volDocLoaded = false;
  const detail = document.getElementById('volDetail');
  const body   = document.getElementById('volDetailBody');
  detail.classList.add('open');
  detail.scrollTop = 0;
  body.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + id + '&select=*', { headers: H });
    const data = await res.json();
    const v    = data[0];
    if (!v) { body.innerHTML = '<div class="loading-msg">volontario non trovato.</div>'; return; }
    document.getElementById('volDetailTitle').textContent = v.cognome + ' ' + v.nome;
    const [bg, fg] = avatarColor(v.cognome);
    const initials = ((v.cognome||'?')[0] + (v.nome||'?')[0]).toUpperCase();

    const fmt = (val) => val ? '<span class="vol-field-value">' + val + '</span>' : '<span class="vol-field-value null">—</span>';
    const fmtBool = (val) => val ? '<span class="vol-field-value vol-bool-yes">✓ Sì</span>' : '<span class="vol-field-value vol-bool-no">—</span>';
    const fmtDate = (val) => {
      if (!val) return '<span class="vol-field-value null">—</span>';
      const d = new Date(val); return '<span class="vol-field-value">' + d.toLocaleDateString('it-IT') + '</span>';
    };

    body.innerHTML = `
      <div class="vol-detail-hero">
        <div class="vol-detail-avatar" style="background:${bg};color:${fg}">${initials}</div>
        <div>
          <div class="vol-detail-name">${v.cognome} ${v.nome}</div>
          <div class="vol-detail-role">${v.tipo_volontario||'Volontario'} . ${v.squadra||'—'}</div>
        </div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head">Anagrafica</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">Codice Fiscale</span>${fmt(v.codice_fiscale)}</div>
          <div class="vol-field"><span class="vol-field-label">Data nascita</span>${fmtDate(v.data_nascita)}</div>
          <div class="vol-field"><span class="vol-field-label">Luogo nascita</span>${fmt(v.luogo_nascita)}</div>
          <div class="vol-field"><span class="vol-field-label">Indirizzo</span>${fmt(v.indirizzo ? v.indirizzo + (v.citta ? ', ' + v.citta : '') : null)}</div>
        </div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head">Unità</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">Squadra</span>${fmt(v.squadra)}</div>
          <div class="vol-field"><span class="vol-field-label">Tipo</span>${fmt(v.tipo_volontario)}</div>
          <div class="vol-field"><span class="vol-field-label">Mansione</span>${fmt(v.mansione)}</div>
          <div class="vol-field"><span class="vol-field-label">Specializzazione</span>${fmt(v.specializzazione)}</div>
          <div class="vol-field"><span class="vol-field-label">Gruppo Alpini</span>${fmt(v.gruppo_alpini)}</div>
          <div class="vol-field"><span class="vol-field-label">Professione</span>${fmt(v.professione)}</div>
          <div class="vol-field"><span class="vol-field-label">Patenti</span>${fmt(v.patenti)}</div>
        </div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head">Contatti</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">Telefono</span>${v.telefono ? '<a href="tel:' + v.telefono + '" style="color:var(--blue);text-decoration:none;font-size:0.72rem">' + v.telefono + '</a>' : '<span class="vol-field-value null">—</span>'}</div>
          <div class="vol-field"><span class="vol-field-label">Email</span>${v.email ? '<a href="mailto:' + v.email + '" style="color:var(--blue);text-decoration:none;font-size:0.72rem">' + v.email + '</a>' : '<span class="vol-field-value null">—</span>'}</div>
        </div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head">Abilitazioni</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">Comm. Unità</span>${fmtBool(v.comm_unita)}</div>
          <div class="vol-field"><span class="vol-field-label">Radio ANA</span>${fmtBool(v.radio_ana)}</div>
          <div class="vol-field"><span class="vol-field-label">EMERCOM</span>${fmtBool(v.emercom)}</div>
          <div class="vol-field"><span class="vol-field-label">Cod. EMERCOM</span>${fmt(v.cod_emercom)}</div>
          <div class="vol-field"><span class="vol-field-label">DAE</span>${fmtBool(v.dae)}</div>
          <div class="vol-field"><span class="vol-field-label">Scad. DAE</span>${fmtDate(v.scad_dae)}</div>
        </div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head">Formazione</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">4 Ore</span>${fmtBool(v.quattro_ore)}</div>
          <div class="vol-field"><span class="vol-field-label">12 Ore</span>${fmtBool(v.dodici_ore)}</div>
          <div class="vol-field"><span class="vol-field-label">Corso Caposq.</span>${fmtBool(v.corso_caposq)}</div>
          <div class="vol-field"><span class="vol-field-label">CDC 1° Step</span>${fmtBool(v.cdc_1_step)}</div>
          <div class="vol-field"><span class="vol-field-label">CDC 2° Step</span>${fmtBool(v.cdc_2_step)}</div>
          <div class="vol-field"><span class="vol-field-label">Data visita</span>${fmtDate(v.data_visita)}</div>
          <div class="vol-field"><span class="vol-field-label">Stato visita</span>${fmt(v.stato_visita)}</div>
        </div>
      </div>

      ${await renderCampiCustomDettaglio(v)}

      <div class="vol-section" id="volInterventiSection">
        <div class="vol-section-head" style="cursor:pointer" onclick="toggleVolInterventi(${v.id})">
          Interventi <span id="volInterventiCount" style="font-size:0.6rem;color:var(--green);margin-left:4px">caricamento...</span>
        </div>
        <div class="vol-section-body" id="volInterventiBody" style="display:none"></div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head" style="cursor:pointer" onclick="toggleVolDoc(${v.id})">
          Documenti <span id="volDocCount" style="font-size:0.6rem;color:var(--green);margin-left:4px"></span>
        </div>
        <div class="vol-section-body" id="volDocBody" style="display:none"></div>
      </div>

      <div class="vol-section">
        <div class="vol-section-head">Amministrativo</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">Iscrizione</span>${fmtBool(v.iscrizione)}</div>
          <div class="vol-field"><span class="vol-field-label">Tutela legale CAP</span>${fmtBool(v.tutela_legale_cap)}</div>
          <div class="vol-field"><span class="vol-field-label">Disponibilità</span>${fmt(v.dispon)}</div>
          <div class="vol-field"><span class="vol-field-label">Note dispon.</span>${fmt(v.note_dispon)}</div>
          <div class="vol-field"><span class="vol-field-label">Varchi</span>${fmt(v.varchi)}</div>
          <div class="vol-field"><span class="vol-field-label">Attivo</span>${fmtBool(v.attivo)}</div>
        </div>
      </div>`;
  } catch(e) { body.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

function chiudiDettaglio() {
  document.getElementById('volDetail').classList.remove('open');
  document.body.style.overflow = '';
  volCorrenteId = null;
}

let volDocLoaded = false;

function toggleVolDoc(volId) {
  const body = document.getElementById('volDocBody');
  if (!body) return;
  if (body.style.display !== 'none') { body.style.display = 'none'; return; }
  body.style.display = 'block';
  if (!volDocLoaded) { volDocLoaded = true; caricaDocVolontario(volId); }
}

let volInterventiLoaded = false;
async function toggleVolInterventi(volId) {
  const body  = document.getElementById('volInterventiBody');
  const count = document.getElementById('volInterventiCount');
  if (!body) return;

  // Toggle visibilità
  if (body.style.display !== 'none') {
    body.style.display = 'none';
    return;
  }
  body.style.display = 'block';

  if (volInterventiLoaded) return;
  volInterventiLoaded = true;

  try {
    // Cerca interventi dove volontari_ids contiene questo id
    const res = await fetch(
      SUPA_URL + '/rest/v1/interventi?volontari_ids=cs.[' + volId + ']&select=id,evento,data,tipo_attivita&order=data.desc',
      { headers: H }
    );
    const interventi = await res.json();
    if (count) count.textContent = '(' + interventi.length + ')';
    if (!interventi.length) {
      body.innerHTML = '<div style="font-size:0.72rem;color:var(--text-4);padding:0.3rem 0">Nessun intervento registrato.</div>';
      return;
    }
    body.innerHTML = interventi.map(i => {
      const dataFmt = i.data ? new Date(i.data).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
      const onclick = 'chiudiDettaglio();showPanel(&quot;interventi&quot;,null);apriDettaglioIntervento(' + i.id + ')';
      return '<div class="vol-field" style="cursor:pointer" onclick="' + onclick + '">'
        + '<span class="vol-field-label">' + dataFmt + '</span>'
        + '<span class="vol-field-value" style="color:var(--text-1)">' + (i.evento||'—') + (i.tipo_attivita ? ' <span style="color:var(--green);font-size:0.6rem">&middot; ' + i.tipo_attivita + '</span>' : '') + '</span>'
        + '</div>';
    }).join('');
  } catch(e) {
    body.innerHTML = '<div style="font-size:0.72rem;color:var(--red);padding:0.3rem 0">Errore caricamento.</div>';
  }
}

function apriFormVolontario(id) {
  volCorrenteId = id;
  const panel = document.getElementById('volFormPanel');
  const body  = document.getElementById('volFormBody');
  document.getElementById('volFormTitle').textContent = id ? 'Modifica volontario' : 'Nuovo volontario';
  panel.classList.add('open');
  panel.scrollTop = 0;

  // Campi del form
  body.innerHTML = `
    <div class="vol-form-err" id="volFormErr"></div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Anagrafica</div>
      <div class="vol-form-grid">
        <div class="vol-form-field"><label class="vol-form-lbl">Cognome *</label><input class="vol-form-inp" id="fCognome" placeholder="Rossi"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Nome *</label><input class="vol-form-inp" id="fNome" placeholder="Mario"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Codice Fiscale</label><input class="vol-form-inp" id="fCF" placeholder="RSSMRA..."></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Data Nascita</label><input class="vol-form-inp" type="date" id="fDataNascita"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Luogo Nascita</label><input class="vol-form-inp" id="fLuogoNascita"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Professione</label><input class="vol-form-inp" id="fProfessione"></div>
        <div class="vol-form-field full"><label class="vol-form-lbl">Indirizzo</label><input class="vol-form-inp" id="fIndirizzo"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">CAP</label><input class="vol-form-inp" id="fCap"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Città</label><input class="vol-form-inp" id="fCitta"></div>
      </div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Unità</div>
      <div class="vol-form-grid">
        <div class="vol-form-field"><label class="vol-form-lbl">Squadra</label>
          <select class="vol-form-inp" id="fSquadra">
            <option value="">—</option><option>ALFA</option><option>CASALE</option>
            <option>COLLINA</option><option>SEZIONE</option><option>TORINO</option>
          </select>
        </div>
        <div class="vol-form-field"><label class="vol-form-lbl">Tipo</label>
          <select class="vol-form-inp" id="fTipo">
            <option value="">—</option><option>VOLONTARIO</option>
            <option>CAPO SQUADRA</option><option>PRESIDENTE</option>
          </select>
        </div>
        <div class="vol-form-field"><label class="vol-form-lbl">Mansione</label>
          <select class="vol-form-inp" id="fMansione">
            <option value="">—</option><option>GENERICO</option>
            <option>LOGISTICA</option><option>MAGAZZINIERE</option>
          </select>
        </div>
        <div class="vol-form-field"><label class="vol-form-lbl">Specializzazione</label><input class="vol-form-inp" id="fSpecializzazione"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Gruppo Alpini</label><input class="vol-form-inp" id="fGruppo"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Patenti</label><input class="vol-form-inp" id="fPatenti" placeholder="B, C..."></div>
      </div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Contatti</div>
      <div class="vol-form-grid">
        <div class="vol-form-field"><label class="vol-form-lbl">Telefono</label><input class="vol-form-inp" type="tel" id="fTelefono"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Email</label><input class="vol-form-inp" type="email" id="fEmail"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Codice fiscale</label><input class="vol-form-inp" id="fCF" placeholder="RSSMRA80A01F205X" style="text-transform:uppercase"></div>
      </div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Abilitazioni e formazione</div>
      <div class="vol-form-checks">
        <label class="vol-form-check"><input type="checkbox" id="fCommUnita"> Comm. Unità</label>
        <label class="vol-form-check"><input type="checkbox" id="fRadioAna"> Radio ANA</label>
        <label class="vol-form-check"><input type="checkbox" id="fEmercom"> EMERCOM</label>
        <label class="vol-form-check"><input type="checkbox" id="fDae"> DAE</label>
        <label class="vol-form-check"><input type="checkbox" id="f4Ore"> 4 Ore</label>
        <label class="vol-form-check"><input type="checkbox" id="f12Ore"> 12 Ore</label>
        <label class="vol-form-check"><input type="checkbox" id="fCorsoCaposq"> Corso Caposq.</label>
        <label class="vol-form-check"><input type="checkbox" id="fCdc1"> CDC 1° Step</label>
        <label class="vol-form-check"><input type="checkbox" id="fCdc2"> CDC 2° Step</label>
        <label class="vol-form-check"><input type="checkbox" id="fIscrizione"> Iscrizione</label>
        <label class="vol-form-check"><input type="checkbox" id="fTutela"> Tutela legale</label>
        <label class="vol-form-check"><input type="checkbox" id="fAttivo" checked> Attivo</label>
      </div>
      <div class="vol-form-grid" style="margin-top:0.5rem">
        <div class="vol-form-field"><label class="vol-form-lbl">Scad. DAE</label><input class="vol-form-inp" type="date" id="fScadDae"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Data visita</label><input class="vol-form-inp" type="date" id="fDataVisita"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Stato visita</label>
          <select class="vol-form-inp" id="fStatoVisita">
            <option value="">—</option><option>DA FARE</option><option>SOLO ESAMI</option>
            <option>VERIFICA</option><option>COMPLETATA</option><option>ESONERO</option>
          </select>
        </div>
        <div class="vol-form-field"><label class="vol-form-lbl">Cod. EMERCOM</label><input class="vol-form-inp" id="fCodEmercom"></div>
      </div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Note</div>
      <div class="vol-form-grid">
        <div class="vol-form-field"><label class="vol-form-lbl">Disponibilità</label><input class="vol-form-inp" id="fDispon"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Varchi</label><input class="vol-form-inp" id="fVarchi"></div>
        <div class="vol-form-field full"><label class="vol-form-lbl">Note disponibilità</label><input class="vol-form-inp" id="fNoteDispon"></div>
      </div>
    </div>
    ${renderCampiCustomForm()}
    ${id ? '<button class="vol-delete-btn" onclick="eliminaVolontario()">elimina volontario</button>' : ''}`;

  // Se modifica, carica i dati
  // Precarica schema se vuoto
  if (!schemaCache.length) caricaSchema().then(() => { if (id) caricaDatiForm(id); });
  else if (id) caricaDatiForm(id);
}

async function caricaDatiForm(id) {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + id + '&select=*', { headers: H });
    const data = await res.json();
    const v = data[0]; if (!v) return;
    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    const setChk = (elId, val) => { const el = document.getElementById(elId); if (el) el.checked = !!val; };
    setVal('fCognome', v.cognome); setVal('fNome', v.nome); setVal('fCF', v.codice_fiscale);
    setVal('fDataNascita', v.data_nascita); setVal('fLuogoNascita', v.luogo_nascita);
    setVal('fProfessione', v.professione); setVal('fIndirizzo', v.indirizzo);
    setVal('fCap', v.cap); setVal('fCitta', v.citta);
    setVal('fSquadra', v.squadra); setVal('fTipo', v.tipo_volontario);
    setVal('fMansione', v.mansione); setVal('fSpecializzazione', v.specializzazione);
    setVal('fGruppo', v.gruppo_alpini); setVal('fPatenti', v.patenti);
    setVal('fTelefono', v.telefono); setVal('fEmail', v.email); setVal('fCF', v.codice_fiscale);
    setChk('fCommUnita', v.comm_unita); setChk('fRadioAna', v.radio_ana);
    setChk('fEmercom', v.emercom); setChk('fDae', v.dae);
    setChk('f4Ore', v.quattro_ore); setChk('f12Ore', v.dodici_ore);
    setChk('fCorsoCaposq', v.corso_caposq); setChk('fCdc1', v.cdc_1_step);
    setChk('fCdc2', v.cdc_2_step); setChk('fIscrizione', v.iscrizione);
    setChk('fTutela', v.tutela_legale_cap); setChk('fAttivo', v.attivo);
    setVal('fScadDae', v.scad_dae); setVal('fDataVisita', v.data_visita);
    setVal('fStatoVisita', v.stato_visita); setVal('fCodEmercom', v.cod_emercom);
    setVal('fDispon', v.dispon); setVal('fVarchi', v.varchi); setVal('fNoteDispon', v.note_dispon);
    // Campi custom
    const extra = v.campi_extra || {};
    schemaCache.forEach(c => {
      const el = document.getElementById('fc_' + c.campo_id);
      if (!el) return;
      if (c.tipo === 'boolean') el.checked = !!extra[c.campo_id];
      else el.value = extra[c.campo_id] || '';
    });
  } catch(e) {}
}

async function salvaVolontario() {
  const cognome = document.getElementById('fCognome').value.trim();
  const nome    = document.getElementById('fNome').value.trim();
  const errEl   = document.getElementById('volFormErr');
  if (!cognome || !nome) { errEl.textContent = 'Cognome e Nome sono obbligatori.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  const g = (id) => { const el = document.getElementById(id); return el ? el.value || null : null; };
  const b = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
  const d = (id) => { const el = document.getElementById(id); return el && el.value ? el.value : null; };

  // Raccogli campi custom
  const campi_extra = {};
  schemaCache.forEach(c => {
    const el = document.getElementById('fc_' + c.campo_id);
    if (!el) return;
    campi_extra[c.campo_id] = c.tipo === 'boolean' ? el.checked : (el.value || null);
  });

  const payload = {
    cognome, nome,
    codice_fiscale: g('fCF'), data_nascita: d('fDataNascita'),
    luogo_nascita: g('fLuogoNascita'), professione: g('fProfessione'),
    indirizzo: g('fIndirizzo'), cap: g('fCap'), citta: g('fCitta'),
    squadra: g('fSquadra'), tipo_volontario: g('fTipo'),
    mansione: g('fMansione'), specializzazione: g('fSpecializzazione'),
    gruppo_alpini: g('fGruppo'), patenti: g('fPatenti'),
    telefono: g('fTelefono'), email: g('fEmail'), codice_fiscale: (document.getElementById('fCF')?document.getElementById('fCF').value.trim().toUpperCase()||null:null),
    comm_unita: b('fCommUnita'), radio_ana: b('fRadioAna'),
    emercom: b('fEmercom'), dae: b('fDae'),
    quattro_ore: b('f4Ore'), dodici_ore: b('f12Ore'),
    corso_caposq: b('fCorsoCaposq'), cdc_1_step: b('fCdc1'), cdc_2_step: b('fCdc2'),
    iscrizione: b('fIscrizione'), tutela_legale_cap: b('fTutela'), attivo: b('fAttivo'),
    scad_dae: d('fScadDae'), data_visita: d('fDataVisita'),
    stato_visita: g('fStatoVisita'), cod_emercom: g('fCodEmercom'),
    dispon: g('fDispon'), varchi: g('fVarchi'), note_dispon: g('fNoteDispon'),
    campi_extra,
  };

  try {
    let res;
    if (volCorrenteId) {
      res = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + volCorrenteId, { method:'PATCH', headers: Object.assign({}, HJ, {'Prefer':'return=minimal'}), body: JSON.stringify(payload) });
      await logAttivita('ha modificato volontario: ' + cognome + ' ' + nome);
    } else {
      res = await fetch(SUPA_URL + '/rest/v1/volontari', { method:'POST', headers: Object.assign({}, HJ, {'Prefer':'return=minimal'}), body: JSON.stringify(payload) });
      await logAttivita('ha aggiunto volontario: ' + cognome + ' ' + nome);
    }
    if (res.ok) { chiudiForm(); chiudiDettaglio(); caricaVolontari(); }
    else { errEl.textContent = 'Errore salvataggio.'; errEl.style.display = 'block'; }
  } catch(e) { errEl.textContent = 'Errore di connessione.'; errEl.style.display = 'block'; }
}

async function eliminaVolontario() {
  if (!volCorrenteId) return;
  if (!confirm('Eliminare definitivamente questo volontario?')) return;
  await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + volCorrenteId, { method:'DELETE', headers: H });
  await logAttivita('ha eliminato un volontario');
  chiudiForm(); chiudiDettaglio(); caricaVolontari();
}

function chiudiForm() {
  document.getElementById('volFormPanel').classList.remove('open');
  document.body.style.overflow = '';
}

async function renderCampiCustomDettaglio(v) {
  if (!schemaCache.length) await caricaSchema();
  const campiVisibili = schemaCache.filter(c => c.visibile);
  if (!campiVisibili.length) return '';
  const extra = v.campi_extra || {};
  // Raggruppa per sezione
  const sezioni = {};
  campiVisibili.forEach(c => {
    if (!sezioni[c.sezione]) sezioni[c.sezione] = [];
    sezioni[c.sezione].push(c);
  });
  let html = '';
  Object.entries(sezioni).forEach(([sez, campi]) => {
    const fields = campi.map(c => {
      const val = extra[c.campo_id];
      let valHtml;
      if (c.tipo === 'boolean') {
        valHtml = val ? '<span class="vol-field-value vol-bool-yes">✓ Sì</span>' : '<span class="vol-field-value vol-bool-no">—</span>';
      } else if (c.tipo === 'date') {
        valHtml = val ? '<span class="vol-field-value">' + new Date(val).toLocaleDateString('it-IT') + '</span>' : '<span class="vol-field-value null">—</span>';
      } else {
        valHtml = val ? '<span class="vol-field-value">' + val + '</span>' : '<span class="vol-field-value null">—</span>';
      }
      return '<div class="vol-field"><span class="vol-field-label">' + c.etichetta + '</span>' + valHtml + '</div>';
    }).join('');
    html += '<div class="vol-section"><div class="vol-section-head">' + sez + ' (custom)</div><div class="vol-section-body">' + fields + '</div></div>';
  });
  return html;
}

function renderCampiCustomForm() {
  if (!schemaCache.length) return '';
  const campiVisibili = schemaCache.filter(c => c.visibile);
  if (!campiVisibili.length) return '';
  const sezioni = {};
  campiVisibili.forEach(c => {
    if (!sezioni[c.sezione]) sezioni[c.sezione] = [];
    sezioni[c.sezione].push(c);
  });
  let html = '';
  Object.entries(sezioni).forEach(([sez, campi]) => {
    html += '<div class="vol-form-section"><div class="vol-form-section-title">' + sez + ' (custom)</div><div class="vol-form-grid">';
    campi.forEach(c => {
      if (c.tipo === 'boolean') {
        html += '<label class="vol-form-check" style="grid-column:span 1"><input type="checkbox" id="fc_' + c.campo_id + '"> ' + c.etichetta + '</label>';
      } else {
        const inputType = c.tipo === 'date' ? 'date' : c.tipo === 'number' ? 'number' : 'text';
        html += '<div class="vol-form-field"><label class="vol-form-lbl">' + c.etichetta + '</label><input class="vol-form-inp" type="' + inputType + '" id="fc_' + c.campo_id + '"></div>';
      }
    });
    html += '</div></div>';
  });
  return html;
}


// -- SCHEMA CAMPI VOLONTARI --
let schemaCache = [];

async function caricaSchema() {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/schema_volontari?select=*&order=sezione,ordine', { headers: H });
    schemaCache = await res.json();
    return schemaCache;
  } catch(e) { return []; }
}

async function renderSchemaList() {
  const list = document.getElementById('schemaList');
  if (!list) return;
  const schema = await caricaSchema();
  if (!schema.length) {
    list.innerHTML = '<div class="loading-msg" style="font-size:0.68rem">Nessun campo custom. Aggiungine uno qui sotto.</div>';
    return;
  }
  list.innerHTML = '';
  // Raggruppa per sezione
  const sezioni = {};
  schema.forEach(c => {
    if (!sezioni[c.sezione]) sezioni[c.sezione] = [];
    sezioni[c.sezione].push(c);
  });
  Object.entries(sezioni).forEach(([sez, campi]) => {
    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.58rem;color:var(--text-4);text-transform:uppercase;letter-spacing:0.6px;padding:0.4rem 0 0.2rem;';
    label.textContent = sez;
    list.appendChild(label);
    campi.forEach(c => {
      const row = document.createElement('div');
      row.className = 'schema-row' + (c.visibile ? '' : ' nascosto');
      const tipoLabel = { text:'Testo', boolean:'Sì/No', date:'Data', number:'Numero' }[c.tipo] || c.tipo;
      row.innerHTML = '<div class="schema-row-info">'
        + '<div class="schema-row-label">' + c.etichetta + '</div>'
        + '<div class="schema-row-meta"><span class="schema-tipo-pill">' + tipoLabel + '</span></div>'
        + '</div>'
        + '<div class="schema-row-actions">'
        + '<button class="btn-sm ' + (c.visibile ? 'btn-warn' : 'btn-ok') + '" onclick="toggleCampo(' + JSON.stringify(c.id) + ',' + c.visibile + ')">' + (c.visibile ? 'nascondi' : 'mostra') + '</button>'
        + '<button class="btn-sm btn-danger" onclick="eliminaCampo(' + JSON.stringify(c.id) + ',' + JSON.stringify(c.etichetta) + ')">elimina</button>'
        + '</div>';
      list.appendChild(row);
    });
  });
}

async function salvaNuovoCampo() {
  const etichetta = document.getElementById('ncEtichetta').value.trim();
  const tipo      = document.getElementById('ncTipo').value;
  const sezione   = document.getElementById('ncSezione').value;
  const errEl     = document.getElementById('nuovoCampoErr');
  if (!etichetta) { errEl.textContent = 'Inserisci un nome per il campo.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  // Genera campo_id da etichetta
  const campo_id = 'custom_' + etichetta.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  const ordine   = schemaCache.filter(c => c.sezione === sezione).length;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/schema_volontari', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ campo_id, etichetta, tipo, sezione, ordine, visibile: true })
    });
    if (res.ok) {
      document.getElementById('ncEtichetta').value = '';
      await logAttivita('ha aggiunto campo custom: ' + etichetta);
      renderSchemaList();
    } else {
      const err = await res.text();
      errEl.textContent = err.includes('unique') ? 'Campo già esistente con questo nome.' : 'Errore salvataggio.';
      errEl.style.display = 'block';
    }
  } catch(e) { errEl.textContent = 'Errore di connessione.'; errEl.style.display = 'block'; }
}

async function toggleCampo(id, visibile) {
  await fetch(SUPA_URL + '/rest/v1/schema_volontari?id=eq.' + id, {
    method: 'PATCH', headers: HJ, body: JSON.stringify({ visibile: !visibile })
  });
  renderSchemaList();
}

async function eliminaCampo(id, etichetta) {
  if (!confirm('Eliminare il campo "' + etichetta + '"? I dati inseriti per questo campo andranno persi.')) return;
  await fetch(SUPA_URL + '/rest/v1/schema_volontari?id=eq.' + id, { method: 'DELETE', headers: H });
  await logAttivita('ha eliminato campo custom: ' + etichetta);
  renderSchemaList();
}



// -- VISTE VOLONTARI --
let visteCache = [];
let vistaAttiva = null; // null = GENERALE

const VISTE_DEFAULT = [
  { nome: 'GENERALE',        filtri: {},                           ordine: 0 },
  { nome: 'SQUADRA',         filtri: { _group: 'squadra' },        ordine: 1 },
  { nome: 'VISITE MEDICHE',  filtri: { _group_bool: 'cdc_2_step' },  ordine: 2 },
  { nome: '4 ORE',           filtri: { _group_bool: 'quattro_ore' }, ordine: 3 },
  { nome: '12 ORE',          filtri: { _group_bool: 'dodici_ore' },  ordine: 4 },
  { nome: 'PRONTO IMPIEGO',  filtri: { _group_bool: 'pronto_impiego' }, ordine: 5 },
];

async function caricaViste() {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/viste_volontari?select=*&order=ordine', { headers: H });
    const data = await res.json();
    // Se non ci sono viste salvate, inserisco i default
    if (!data.length) {
      await seedVisteDefault();
      const res2 = await fetch(SUPA_URL + '/rest/v1/viste_volontari?select=*&order=ordine', { headers: H });
      visteCache = await res2.json();
    } else {
      visteCache = data;
    }
  } catch(e) { visteCache = []; }
  renderVisteBar();
}

async function seedVisteDefault() {
  for (const v of VISTE_DEFAULT) {
    await fetch(SUPA_URL + '/rest/v1/viste_volontari', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify(v)
    });
  }
}

function renderVisteBar() {
  const bar = document.getElementById('visteBar');
  if (!bar) return;
  bar.innerHTML = '';
  visteCache.forEach(v => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-flex;flex-shrink:0;';
    const btn = document.createElement('button');
    btn.className = 'vista-btn' + (vistaAttiva === v.id ? ' active' : '');
    btn.textContent = v.nome;
    btn.onclick = () => applicaVista(v);
    wrap.appendChild(btn);
    // Tasto elimina/modifica (solo master)
    const isMasterForBtn = currentUser && currentUser.tipo_accesso === 'master';
    if (isMasterForBtn && v.nome !== 'GENERALE') {
      const editBtn = document.createElement('button');
      editBtn.className = 'vista-edit-btn';
      editBtn.textContent = '✕';
      editBtn.title = 'Elimina vista';
      editBtn.onclick = (e) => { e.stopPropagation(); eliminaVista(v.id, v.nome); };
      wrap.appendChild(editBtn);
    }
    bar.appendChild(wrap);
  });
  // Bottone nuova vista (solo master)
  const isMaster = currentUser && currentUser.tipo_accesso === 'master';
  if (isMaster) {
    const addBtn = document.createElement('button');
    addBtn.className = 'vista-btn vista-add';
    addBtn.textContent = '+ vista';
    addBtn.onclick = () => apriFormVista();
    bar.appendChild(addBtn);
  }
}

function applicaVista(v) {
  vistaAttiva = v.id;
  renderVisteBar();
  const filtri = v.filtri || {};

  // Resetta filtri manuali
  document.getElementById('volSearch').value = '';
  document.getElementById('filtroSquadra').value = '';
  document.getElementById('filtroTipo').value = '';
  document.getElementById('filtroMansione').value = '';
  document.getElementById('filtroAttivo').value = '';

  if (filtri._group === 'squadra') {
    renderVolontariGrouped('squadra', null, null);
    return;
  }
  if (filtri._group_bool) {
    const label = filtri._bool_label || 'Con spunta';
    renderVolontariGrouped('_boolean', filtri._group_bool, label);
    return;
  }
  if (filtri._group_field) {
    renderVolontariGrouped('_field', filtri._group_field, null);
    return;
  }
  if (filtri._group === 'mansione' || filtri._group === 'tipo_volontario') {
    renderVolontariGrouped('_field', filtri._group, null);
    return;
  }

  // Applica filtri
  let dati = [...volontariData];
  if (filtri.quattro_ore)    dati = dati.filter(v => v.quattro_ore);
  if (filtri.dodici_ore)     dati = dati.filter(v => v.dodici_ore);
  if (filtri.pronto_impiego) dati = dati.filter(v => v.pronto_impiego);
  if (filtri.attivo !== undefined) dati = dati.filter(v => v.attivo === filtri.attivo);
  if (filtri.stato_visita_not) dati = dati.filter(v => v.stato_visita !== filtri.stato_visita_not);
  // Filtri custom da jsonb (campi extra)
  Object.keys(filtri).forEach(k => {
    if (k.startsWith('_') || ['quattro_ore','dodici_ore','pronto_impiego','attivo','stato_visita_not'].includes(k)) return;
    dati = dati.filter(v => v[k] === filtri[k]);
  });

  renderVolontari(dati);
}

// Colori per stato visita
const STATO_VISITA_COLORS = {
  'COMPLETATA':  ['#e8f5ee','#1a7a4a'],
  'DA FARE':     ['#fde8e8','#b91c1c'],
  'SOLO ESAMI':  ['#fef3e8','#b45309'],
  'VERIFICA':    ['#e8f0fb','#1a4a9a'],
  'ESONERO':     ['#f2f2f7','#6b7280'],
};

function renderVolontariGrouped(tipo, campo, boolLabel) {
  const list = document.getElementById('volList');
  if (!list) return;
  list.innerHTML = '';

  let gruppi = {};
  let chiavi = [];

  if (tipo === 'squadra') {
    // Raggruppa per squadra
    volontariData.forEach(v => {
      const g = v.squadra || '—';
      if (!gruppi[g]) gruppi[g] = [];
      gruppi[g].push(v);
    });
    chiavi = Object.keys(gruppi).sort();

  } else if (tipo === '_boolean') {
    // Due gruppi: completato / non completato
    gruppi['si']  = volontariData.filter(v => !!v[campo]);
    gruppi['no']  = volontariData.filter(v => !v[campo]);
    chiavi = ['si', 'no'];

  } else if (tipo === '_field') {
    // Raggruppa per valore del campo (es. stato_visita)
    // Ordine fisso per stato_visita
    const ordine = ['ESONERO','DA FARE','VERIFICA','SOLO ESAMI','COMPLETATA'];
    volontariData.forEach(v => {
      const g = v[campo] || '—';
      if (!gruppi[g]) gruppi[g] = [];
      gruppi[g].push(v);
    });
    // Prima i valori in ordine fisso, poi eventuali altri
    chiavi = ordine.filter(k => gruppi[k]);
    Object.keys(gruppi).forEach(k => { if (!chiavi.includes(k)) chiavi.push(k); });
  }

  chiavi.forEach((chiave, idx) => {
    const items = gruppi[chiave] || [];

    // Determina etichetta e colore header
    let headerLabel, headerBg, headerFg;
    if (tipo === 'squadra') {
      headerLabel = chiave;
      headerBg = '#1c2a3a'; headerFg = '#58a6ff';
    } else if (tipo === '_boolean') {
      if (chiave === 'si') {
        headerLabel = '✓ ' + (boolLabel || 'Completato');
        headerBg = '#0d2014'; headerFg = '#3fb950';
      } else {
        headerLabel = '— Non ' + (boolLabel ? boolLabel.toLowerCase() : 'completato');
        headerBg = '#21262d'; headerFg = '#8b949e';
      }
    } else if (tipo === '_field') {
      headerLabel = chiave;
      const colors = STATO_VISITA_COLORS[chiave] || ['#1c2a3a','#58a6ff'];
      headerBg = colors[0]; headerFg = colors[1];
    }

    // Collassa di default i gruppi "negativi"
    const isCollapsed = (tipo === '_boolean' && chiave === 'no')
      || (tipo === '_field' && ['DA FARE','VERIFICA'].includes(chiave));

    const header = document.createElement('div');
    header.className = 'vol-group-header' + (isCollapsed ? ' collapsed' : '');
    header.style.cssText = 'background:' + headerBg + ';border-color:' + headerFg + '30;';
    header.innerHTML = '<span class="vgh-label" style="color:' + headerFg + '">' + headerLabel + '</span>'
      + '<span class="vgh-count" style="background:' + headerBg + ';color:' + headerFg + ';border:1px solid ' + headerFg + '50">' + items.length + '</span>'
      + '<span class="vgh-arrow" style="color:' + headerFg + '">' + (isCollapsed ? '▶' : '▼') + '</span>';

    const bodyId = 'gb' + idx;
    header.onclick = () => {
      header.classList.toggle('collapsed');
      const arrow = header.querySelector('.vgh-arrow');
      const body  = document.getElementById(bodyId);
      const col   = isCollapsed ? headerFg : headerFg;
      if (header.classList.contains('collapsed')) {
        arrow.textContent = '▶';
        if (body) body.style.display = 'none';
      } else {
        arrow.textContent = '▼';
        if (body) body.style.display = 'flex';
      }
    };
    list.appendChild(header);

    const body = document.createElement('div');
    body.className = 'vol-group-body';
    body.id = bodyId;
    if (isCollapsed) body.style.display = 'none';

    items.forEach(v => {
      const initials = ((v.cognome||'?')[0] + (v.nome||'?')[0]).toUpperCase();
      const [bg, fg] = avatarColor(v.cognome);
      const card = document.createElement('div');
      card.className = 'vol-card';
      card.onclick = () => apriDettaglio(v.id);
      const badges = [];
      if (!v.attivo) badges.push('<span class="vol-badge vb-off">NON ATTIVO</span>');
      if (v.dae)     badges.push('<span class="vol-badge vb-ok">DAE</span>');
      var avatarEl = v.foto_url
        ? '<img src="' + v.foto_url + '" class="vol-avatar" style="object-fit:cover">'
        : '<div class="vol-avatar" style="background:' + bg + ';color:' + fg + '">' + initials + '</div>';
      card.innerHTML = avatarEl
        + '<div class="vol-card-info">'
        + '<div class="vol-card-name">' + v.cognome + ' ' + v.nome + '</div>'
        + '<div class="vol-card-sub"><span>' + (v.tipo_volontario||'—') + '</span>'
        + (v.mansione ? '<span>. ' + v.mansione + '</span>' : '') + '</div>'
        + '</div>'
        + '<div class="vol-card-badges">' + badges.join('') + '</div>';
      body.appendChild(card);
    });

    list.appendChild(body);
  });

  document.getElementById('volMostrati').textContent = volontariData.length;
}

// Form nuova vista
let vistaEditId = null;
function apriFormVista(vista) {
  vistaEditId = vista ? vista.id : null;
  const overlay = document.getElementById('vistaFormOverlay');
  overlay.classList.add('open');
  document.getElementById('vfNome').value = vista ? vista.nome : '';
  // Reset
  ['vfQ4','vfQ12','vfPI','vfAttivo','vfVisitaNonCompl','vfDae'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = false;
  });
  const selGruppo = document.getElementById('vfTipoGruppo');
  if (selGruppo) selGruppo.value = '';
  const box = document.getElementById('vfFiltriBox');
  if (box) box.style.display = 'block';

  if (vista && vista.filtri) {
    const f = vista.filtri;
    if (f._group === 'squadra' && selGruppo) { selGruppo.value = 'squadra'; if (box) box.style.display = 'none'; }
    else if (f._group_bool && selGruppo)     { selGruppo.value = f._group_bool; if (box) box.style.display = 'none'; }
    else {
      if (f.quattro_ore)     document.getElementById('vfQ4').checked = true;
      if (f.dodici_ore)      document.getElementById('vfQ12').checked = true;
      if (f.pronto_impiego)  document.getElementById('vfPI').checked = true;
      if (f.attivo === true) document.getElementById('vfAttivo').checked = true;
      if (f.stato_visita_not) document.getElementById('vfVisitaNonCompl').checked = true;
      if (f.dae)             document.getElementById('vfDae').checked = true;
    }
  }
}

function chiudiFormVista() {
  document.getElementById('vistaFormOverlay').classList.remove('open');
}

function aggiornaFormVista() {
  const tipo = document.getElementById('vfTipoGruppo').value;
  const box  = document.getElementById('vfFiltriBox');
  if (box) box.style.display = tipo ? 'none' : 'block';
}

async function salvaVista() {
  const nome = document.getElementById('vfNome').value.trim();
  if (!nome) return;
  const tipoGruppo = document.getElementById('vfTipoGruppo').value;
  const filtri = {};

  const campiField = ['stato_visita','mansione','tipo_volontario'];
  if (tipoGruppo === 'squadra') {
    filtri._group = 'squadra';
  } else if (tipoGruppo && campiField.includes(tipoGruppo)) {
    filtri._group_field = tipoGruppo;
  } else if (tipoGruppo) {
    filtri._group_bool = tipoGruppo;
    filtri._bool_label = 'Corso completato';
  } else {
    // Filtri manuali
    if (document.getElementById('vfQ4').checked)             filtri.quattro_ore = true;
    if (document.getElementById('vfQ12').checked)            filtri.dodici_ore = true;
    if (document.getElementById('vfPI').checked)             filtri.pronto_impiego = true;
    if (document.getElementById('vfAttivo').checked)         filtri.attivo = true;
    if (document.getElementById('vfVisitaNonCompl').checked) filtri.stato_visita_not = 'COMPLETATA';
    if (document.getElementById('vfDae').checked)            filtri.dae = true;
  }

  if (vistaEditId) {
    await fetch(SUPA_URL + '/rest/v1/viste_volontari?id=eq.' + vistaEditId, {
      method: 'PATCH', headers: HJ, body: JSON.stringify({ nome, filtri })
    });
  } else {
    await fetch(SUPA_URL + '/rest/v1/viste_volontari', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ nome, filtri, ordine: visteCache.length })
    });
  }
  await logAttivita('ha ' + (vistaEditId ? 'modificato' : 'creato') + ' vista: ' + nome);
  chiudiFormVista();
  await caricaViste();
  await caricaVolontari();
}

async function eliminaVista(id, nome) {
  if (!confirm('Eliminare la vista "' + nome + '"?')) return;
  await fetch(SUPA_URL + '/rest/v1/viste_volontari?id=eq.' + id, { method: 'DELETE', headers: H });
  await logAttivita('ha eliminato vista: ' + nome);
  vistaAttiva = null;
  await caricaViste();
  renderVolontari(volontariData);
}


// -- INTERVENTI --
let interventiData = [];
let intCorrenteId = null;

const TIPO_ATTIVITA = [
  'EMERGENZA', 'ESERCITAZIONE', 'CORSI', 'PREVENZIONE INFORTUNI',
  'RAPPRESENTANZA', 'ASSEMBLEE E RIUNIONI', 'CONTROLLO TERRITORIO',
  'SEGRETERIA', 'MAGAZZINO'
];

async function caricaInterventi() {
  const list    = document.getElementById('intList');
  const toolbar = document.getElementById('intToolbar');
  const stats   = document.getElementById('intStatsBox');
  if (!list) return;

  const isMaster = currentUser && currentUser.tipo_accesso === 'master';

  // Utente standard — mostra solo form nuovo intervento
  if (!isMaster) {
    if (stats)   stats.style.display = 'none';
    if (toolbar) toolbar.style.display = 'none';
    list.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'int-add-btn';
    btn.style.cssText = 'width:100%;padding:1rem;font-size:0.85rem;margin-top:0.5rem';
    btn.textContent = '+ Registra nuovo intervento';
    btn.onclick = () => apriFormIntervento(null);
    list.appendChild(btn);
    return;
  }

  // Master — carica tutti gli interventi
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/interventi?select=*&order=data.desc', { headers: H });
    interventiData = await res.json();
    aggiornaStatsInterventi();
    renderInterventi(interventiData);
  } catch(e) { list.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

function aggiornaStatsInterventi() {
  const tot     = interventiData.length;
  const volTot  = interventiData.reduce((s, i) => s + (i.n_volontari || 0), 0);
  const oreTot  = interventiData.reduce((s, i) => s + parseFloat(i.n_ore || 0), 0);
  document.getElementById('intTot').textContent     = tot;
  document.getElementById('intVolTot').textContent  = volTot;
  document.getElementById('intOreTot').textContent  = Math.round(oreTot * 10) / 10;
}

function renderInterventi(data) {
  const list = document.getElementById('intList');
  if (!list) return;

  // Macro = interventi con is_macro=true
  // Figli = interventi con macro_id valorizzato
  // Orfani = interventi normali senza macro_id e senza is_macro
  const macro  = data.filter(i => i.is_macro);
  const figli  = data.filter(i => i.macro_id);
  const orfani = data.filter(i => !i.is_macro && !i.macro_id);

  if (!data.length) {
    list.innerHTML = '<div class="loading-msg">nessun intervento registrato.</div>';
    return;
  }
  list.innerHTML = '';

  // Prima le macro (con i figli annidati)
  macro.forEach(m => {
    const figliMacro = figli.filter(i => i.macro_id === m.id);
    list.appendChild(_renderMacroCard(m, figliMacro));
  });

  // Poi gli interventi singoli
  orfani.forEach(i => list.appendChild(_renderIntCard(i, false)));
}

function _renderIntCard(i, isChild) {
  const card = document.createElement('div');
  card.className = 'int-card' + (isChild ? ' int-card-child' : '');
  card.onclick = () => apriDettaglioIntervento(i.id);
  const dataFmt = i.data ? new Date(i.data).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
  const pills = [];
  if (i.tipo_attivita)  pills.push('<span class="int-pill green">' + i.tipo_attivita + '</span>');
  if (i.luogo)          pills.push('<span class="int-pill">' + i.luogo + '</span>');
  if (i.n_volontari)    pills.push('<span class="int-pill blue">' + i.n_volontari + ' vol.</span>');
  if (i.n_ore)          pills.push('<span class="int-pill blue">' + i.n_ore + 'h</span>');
  if (i.utilizzo_radio) pills.push('<span class="int-pill green">📻 Radio</span>');
  if (i.vola)           pills.push('<span class="int-pill green">VolA' + (i.vola_numero ? ' ' + i.vola_numero : '') + '</span>');
  if (i.volter)         pills.push('<span class="int-pill green">VolTer</span>');
  const childArrow = isChild ? '<span style="color:var(--testo-3);margin-right:0.2rem;flex-shrink:0;font-size:0.8rem">↳</span>' : '';
  card.innerHTML = '<div style="display:flex;align-items:flex-start;gap:0.5rem">'
    + childArrow
    + getTipoAttivitaAvatar(i.tipo_attivita, isChild ? 30 : 38)
    + '<div style="flex:1;min-width:0">'
    + '<div class="int-card-top">'
    + '<div class="int-card-evento" style="' + (isChild ? 'font-size:0.82rem' : '') + '">' + (i.evento || '—') + '</div>'
    + '<div class="int-card-data" style="' + (isChild ? 'font-size:0.72rem' : '') + '">' + dataFmt + '</div>'
    + '</div>'
    + '<div class="int-card-meta">' + pills.join('') + '</div>'
    + '</div></div>';
  return card;
}

function _renderMacroCard(m, figliMacro) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:0.5rem';
  const dataInizio = m.data ? new Date(m.data).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}) : null;
  const dataFine   = m.data_fine ? new Date(m.data_fine).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}) : null;
  const dateRange  = dataInizio ? (dataFine && dataFine !== dataInizio ? dataInizio + ' → ' + dataFine : dataInizio) : '—';
  const nVol = figliMacro.reduce((s, i) => s + (i.n_volontari || 0), 0);
  const nOre = figliMacro.reduce((s, i) => s + parseFloat(i.n_ore || 0), 0) + parseFloat(m.n_ore || 0);

  const header = document.createElement('div');
  header.className = 'int-card int-macro-header';
  header.style.cssText = 'cursor:pointer;border-left:3px solid var(--green);background:var(--bg-2)';
  header.innerHTML = '<div style="display:flex;align-items:flex-start;gap:0.7rem">'
    + '<div style="font-size:1.2rem;flex-shrink:0;line-height:1.2">📦</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div class="int-card-top">'
    + '<div class="int-card-evento" style="font-size:0.9rem;font-weight:700">' + (m.evento || '—') + '</div>'
    + '<div style="display:flex;align-items:center;gap:0.4rem">'
    + (figliMacro.length ? '<span class="int-pill green" style="font-size:0.65rem">' + figliMacro.length + ' int.</span>' : '<span class="int-pill" style="font-size:0.65rem">vuota</span>')
    + '<span id="macro-arrow-' + m.id + '" style="font-size:0.7rem;color:var(--testo-3);transition:transform 0.2s">▶</span>'
    + '</div></div>'
    + '<div class="int-card-meta">'
    + (m.tipo_attivita ? '<span class="int-pill green">' + m.tipo_attivita + '</span>' : '')
    + (m.luogo ? '<span class="int-pill">' + m.luogo + '</span>' : '')
    + '<span class="int-pill">' + dateRange + '</span>'
    + (nVol ? '<span class="int-pill blue">' + nVol + ' vol. tot.</span>' : '')
    + (nOre ? '<span class="int-pill blue">' + Math.round(nOre*10)/10 + 'h tot.</span>' : '')
    + '</div></div>'
    + '<button class="btn-sm" style="flex-shrink:0;font-size:0.7rem;padding:3px 8px;margin-left:0.3rem;align-self:flex-start" onclick="event.stopPropagation();apriDettaglioIntervento(' + m.id + ')">✏️</button>'
    + '</div>';

  const childrenWrap = document.createElement('div');
  childrenWrap.id = 'macro-children-' + m.id;
  childrenWrap.style.cssText = 'display:none;padding:0 0 0 0.5rem;border-left:2px solid var(--green);margin-left:0.5rem';
  figliMacro.forEach(i => childrenWrap.appendChild(_renderIntCard(i, true)));

  const addBtn = document.createElement('button');
  addBtn.className = 'int-add-btn';
  addBtn.style.cssText = 'width:100%;padding:0.5rem;font-size:0.78rem;margin:0.3rem 0';
  addBtn.textContent = '+ Aggiungi intervento a questa macro';
  addBtn.onclick = () => apriFormIntervento(null, m.id);
  childrenWrap.appendChild(addBtn);

  header.onclick = (e) => {
    if (e.target.closest('button')) return;
    const isOpen = childrenWrap.style.display !== 'none';
    childrenWrap.style.display = isOpen ? 'none' : 'block';
    const arrow = document.getElementById('macro-arrow-' + m.id);
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  };

  wrap.appendChild(header);
  wrap.appendChild(childrenWrap);
  return wrap;
}

function filtraInterventi() {
  const q = (document.getElementById('intSearch').value || '').toLowerCase().trim();
  if (!q) { renderInterventi(interventiData); return; }
  const filtered = interventiData.filter(i =>
    (i.evento||'').toLowerCase().includes(q) ||
    (i.luogo||'').toLowerCase().includes(q) ||
    (i.tipo_attivita||'').toLowerCase().includes(q) ||
    (i.note||'').toLowerCase().includes(q)
  );
  renderInterventi(filtered);
}

async function apriDettaglioIntervento(id) {
  intCorrenteId = id;
  const detail = document.getElementById('intDetail');
  const body   = document.getElementById('intDetailBody');
  detail.classList.add('open');
  detail.scrollTop = 0;
  body.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + id + '&select=*', { headers: H });
    const data = await res.json();
    const i = data[0];
    if (!i) { body.innerHTML = '<div class="loading-msg">intervento non trovato.</div>'; return; }
    document.getElementById('intDetailTitle').textContent = (i.is_macro ? '📦 ' : '') + (i.evento || '—');

    const dataFmt = i.data ? new Date(i.data).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
    const fmt = (v) => v ? '<span class="vol-field-value">' + v + '</span>' : '<span class="vol-field-value null">—</span>';
    const fmtBool = (v) => v ? '<span class="vol-field-value vol-bool-yes">✓ Sì</span>' : '<span class="vol-field-value vol-bool-no">—</span>';

    // Carica nomi volontari se ci sono
    let volNomi = '—';
    if (i.volontari_ids && i.volontari_ids.length > 0) {
      try {
        const ids = i.volontari_ids.join(',');
        const vRes = await fetch(SUPA_URL + '/rest/v1/volontari?id=in.(' + ids + ')&select=id,cognome,nome', { headers: H });
        const vols = await vRes.json();
        volNomi = vols.map(v => v.cognome + ' ' + v.nome).join(', ') || '—';
      } catch(e) {}
    }

    // Se è una macro, carica i figli
    let macroSection = '';
    if (i.is_macro) {
      const figliMacro = interventiData.filter(f => f.macro_id === i.id);
      const nVol = figliMacro.reduce((s, f) => s + (f.n_volontari || 0), 0);
      const nOre = figliMacro.reduce((s, f) => s + parseFloat(f.n_ore || 0), 0) + parseFloat(i.n_ore || 0);
      let figliHtml = figliMacro.map(f => {
        const fd = f.data ? new Date(f.data).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
        return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:0.5px solid var(--border);cursor:pointer" onclick="chiudiDettaglioIntervento();apriDettaglioIntervento(' + f.id + ')">'
          + getTipoAttivitaAvatar(f.tipo_attivita, 26)
          + '<div style="flex:1;font-size:0.8rem;color:var(--testo)">' + (f.evento||'—') + '</div>'
          + '<div style="font-size:0.7rem;color:var(--testo-3)">' + fd + '</div>'
          + '</div>';
      }).join('');
      macroSection = `<div class="vol-section">
        <div class="vol-section-head" style="display:flex;align-items:center;justify-content:space-between">
          Interventi inclusi
          <button class="btn-sm" style="font-size:0.7rem;padding:2px 8px" onclick="chiudiDettaglioIntervento();apriFormIntervento(null,${i.id})">+ Aggiungi</button>
        </div>
        <div class="vol-section-body">
          <div style="font-size:0.72rem;color:var(--testo-3);margin-bottom:0.5rem">${figliMacro.length} interventi · ${nVol} vol. tot. · ${Math.round(nOre*10)/10}h tot.</div>
          ${figliHtml || '<div style="font-size:0.78rem;color:var(--testo-3)">Nessun intervento associato.</div>'}
        </div>
      </div>`;
    }

    // Se è un figlio, mostra il riferimento alla macro padre
    let macroParentSection = '';
    if (i.macro_id) {
      const padre = interventiData.find(f => f.id === i.macro_id);
      macroParentSection = `<div class="vol-section">
        <div class="vol-section-head">Parte di macro-attività</div>
        <div class="vol-section-body">
          <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer" onclick="chiudiDettaglioIntervento();apriDettaglioIntervento(${i.macro_id})">
            <span style="font-size:1rem">📦</span>
            <span style="font-size:0.82rem;color:var(--green);font-weight:500">${padre ? (padre.evento || '—') : 'Macro #' + i.macro_id}</span>
          </div>
        </div>
      </div>`;
    }

    var _heroAvatar = getTipoAttivitaAvatar(i.tipo_attivita, 50);
    body.innerHTML = `
      <div class="vol-detail-hero">
        ${_heroAvatar}
        <div>
          <div class="vol-detail-name">${(i.is_macro ? '📦 ' : '') + (i.evento || '—')}</div>
          <div class="vol-detail-role">${i.tipo_attivita || 'Intervento'} · ${dataFmt}</div>
        </div>
      </div>
      ${macroParentSection}
      <div class="vol-section">
        <div class="vol-section-head">Dettagli</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">Data inizio</span>${fmt(dataFmt)}</div>
          <div class="vol-field"><span class="vol-field-label">Data fine</span>${i.data_fine ? fmt(new Date(i.data_fine).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'})) : fmt(null)}</div>
          <div class="vol-field"><span class="vol-field-label">Tipo attività</span>${fmt(i.tipo_attivita)}</div>
          <div class="vol-field"><span class="vol-field-label">Luogo</span>${fmt(i.luogo)}</div>
          <div class="vol-field"><span class="vol-field-label">Utente</span>${fmt(i.utente)}</div>
        </div>
      </div>
      <div class="vol-section">
        <div class="vol-section-head">Numeri</div>
        <div class="vol-section-body">
          <div class="vol-field"><span class="vol-field-label">N° volontari</span>${fmt(i.n_volontari)}</div>
          <div class="vol-field"><span class="vol-field-label">N° ore</span>${fmt(i.n_ore)}</div>
          <div class="vol-field"><span class="vol-field-label">Utilizzo radio</span>${fmtBool(i.utilizzo_radio)}</div>
        </div>
      </div>
      <div class="vol-section">
        <div class="vol-section-head">Volontari intervenuti</div>
        <div class="vol-section-body">
          <div style="font-size:0.75rem;color:var(--text-2);line-height:1.6">${volNomi}</div>
        </div>
      </div>
      ${macroSection}
      ${i.note ? `<div class="vol-section">
        <div class="vol-section-head">Note</div>
        <div class="vol-section-body"><div style="font-size:0.75rem;color:var(--text-2);line-height:1.6">${i.note}</div></div>
      </div>` : ''}
      <button class="btn-primary" style="width:100%;margin-top:0.8rem" onclick="apriFormIntervento(${i.id})">✏️ Modifica</button>
      <button class="vol-delete-btn" onclick="eliminaIntervento()">elimina intervento</button>
      <button class="btn-primary" style="width:100%;margin-top:0.5rem" onclick="stampaIntervento(${i.id})">📄 Esporta con CF</button>
      <button class="btn-primary" style="width:100%;margin-top:0.5rem;background:var(--green)" onclick="apriGeneratoreAttestati(${i.id})">📜 Genera attestati</button>`;
  } catch(e) { body.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

function chiudiDettaglioIntervento() {
  document.getElementById('intDetail').classList.remove('open');
  intCorrenteId = null;
}

function apriFormIntervento(id, macroIdPreset) {
  intCorrenteId = id;
  const panel = document.getElementById('intFormPanel');
  const body  = document.getElementById('intFormBody');
  document.getElementById('intFormTitle').textContent = id ? 'Modifica intervento' : 'Nuovo intervento';

  const tipoOpts = TIPO_ATTIVITA.map(t => '<option value="' + t + '">' + t + '</option>').join('');

  // Macro disponibili = interventi con is_macro=true
  const macroDisponibili = interventiData.filter(i => i.is_macro);
  const macroOpts = macroDisponibili.map(m =>
    '<option value="' + m.id + '">' + (m.evento || '—') + (m.data ? ' (' + new Date(m.data).getFullYear() + ')' : '') + '</option>'
  ).join('');

  body.innerHTML = `
    <div class="vol-form-err" id="intFormErr"></div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Intervento</div>
      <div class="vol-form-grid">
        <div class="vol-form-field full"><label class="vol-form-lbl">Evento *</label><input class="vol-form-inp" id="ifEvento" placeholder="es. Alluvione Mirabello"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Data inizio *</label><input class="vol-form-inp" type="date" id="ifData"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Data fine</label><input class="vol-form-inp" type="date" id="ifDataFine"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">Tipo attività</label><select class="vol-form-inp" id="ifTipo"><option value="">—</option>${tipoOpts}</select></div>
        <div class="vol-form-field full"><label class="vol-form-lbl">Luogo</label><input class="vol-form-inp" id="ifLuogo" placeholder="es. Via Roma, Casale M.to"></div>
        <div class="vol-form-field full"><label class="vol-form-lbl">Registrato da</label><input class="vol-form-inp" id="ifUtente" placeholder="Chi registra"></div>
      </div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Numeri</div>
      <div class="vol-form-grid">
        <div class="vol-form-field"><label class="vol-form-lbl">N° volontari</label><input class="vol-form-inp" type="number" id="ifNVol" placeholder="0" min="0"></div>
        <div class="vol-form-field"><label class="vol-form-lbl">N° ore</label><input class="vol-form-inp" type="number" id="ifNOre" placeholder="0" min="0" step="0.5"></div>
        <div class="vol-form-field full"><label class="vol-form-check" style="margin-top:0.3rem"><input type="checkbox" id="ifRadio"> Utilizzo radio</label></div>
        <div class="vol-form-field" style="grid-column:span 2;display:flex;align-items:center;gap:0.7rem;margin-top:0.2rem">
          <label class="vol-form-check" style="flex-shrink:0"><input type="checkbox" id="ifVola"> VolA</label>
          <input class="vol-form-inp" id="ifVolaNum" placeholder="Numero VolA" style="flex:1">
        </div>
        <div class="vol-form-field full"><label class="vol-form-check"><input type="checkbox" id="ifVolter"> VolTer</label></div>
      </div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Volontari intervenuti</div>
      <input class="vol-picker-search" id="volPickerSearch" placeholder="cerca volontario..." oninput="filtraVolPicker(this.value)">
      <div class="vol-picker" id="volPicker"><div class="loading-msg" style="padding:0.5rem">caricamento volontari...</div></div>
    </div>
    <div class="vol-form-section">
      <div class="vol-form-section-title">Note</div>
      <textarea class="vol-form-inp" id="ifNote" rows="3" placeholder="Note aggiuntive..." style="resize:vertical"></textarea>
    </div>
    <div class="vol-form-section" style="border:1px solid var(--border);border-radius:10px;padding:0.8rem">
      <div style="font-size:0.72rem;font-weight:700;color:var(--testo-3);text-transform:uppercase;margin-bottom:0.7rem">Raggruppamento</div>
      <label class="vol-form-check" style="margin-bottom:0.7rem;display:flex;align-items:center;gap:0.5rem">
        <input type="checkbox" id="ifIsMacro" onchange="toggleMacroMode()">
        <span style="font-size:0.85rem;font-weight:500">📦 Questo è una macro-attività</span>
      </label>
      <div id="ifMacroParentWrap">
        <label class="vol-form-lbl">Associa a macro esistente</label>
        <select class="vol-form-inp" id="ifMacroId" style="margin-top:0.3rem">
          <option value="">— Nessuna (intervento singolo) —</option>
          ${macroOpts}
        </select>
      </div>
    </div>
    ${id ? '<button class="vol-delete-btn" onclick="eliminaIntervento()">elimina intervento</button>' : ''}`;

  panel.classList.add('open');
  panel.scrollTop = 0;
  var ifUtente = document.getElementById('ifUtente');
  if (ifUtente && !id && currentUser) ifUtente.value = currentUser.nome || '';
  if (macroIdPreset) {
    var selMacro = document.getElementById('ifMacroId');
    if (selMacro) { selMacro.value = macroIdPreset; }
  }
  caricaVolPicker();
  if (id) caricaDatiFormIntervento(id);
}

function toggleMacroMode() {
  var isMacro = document.getElementById('ifIsMacro').checked;
  var parentWrap = document.getElementById('ifMacroParentWrap');
  var selMacro   = document.getElementById('ifMacroId');
  if (isMacro) {
    // È una macro: nasconde il select padre e lo svuota
    parentWrap.style.opacity = '0.4';
    parentWrap.style.pointerEvents = 'none';
    selMacro.value = '';
  } else {
    parentWrap.style.opacity = '';
    parentWrap.style.pointerEvents = '';
  }
}


async function caricaVolPicker() {
  const picker = document.getElementById('volPicker');
  if (!picker) return;
  // Usa i dati già in cache se disponibili
  const vols = volontariData.length ? volontariData : await (async () => {
    try {
      const res = await fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome&order=cognome&attivo=eq.true', { headers: H });
      return await res.json();
    } catch(e) { return []; }
  })();
  renderVolPicker(vols);
}

function renderVolPicker(vols) {
  const picker = document.getElementById('volPicker');
  if (!picker) return;
  picker.innerHTML = '';
  vols.forEach(v => {
    const item = document.createElement('div');
    item.className = 'vol-picker-item';
    item.innerHTML = '<input type="checkbox" id="vp_' + v.id + '" value="' + v.id + '" onchange="aggiornaConteggioVolontari()">'
      + '<label for="vp_' + v.id + '">' + v.cognome + ' ' + v.nome + '</label>';
    picker.appendChild(item);
  });
}

function filtraVolPicker(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('.vol-picker-item').forEach(item => {
    item.style.display = !term || item.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
}

function aggiornaConteggioVolontari() {
  var count = document.querySelectorAll('.vol-picker-item input:checked').length;
  var el = document.getElementById('ifNVol');
  if (el) el.value = count;
}

async function caricaDatiFormIntervento(id) {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + id + '&select=*', { headers: H });
    const data = await res.json();
    const i = data[0]; if (!i) return;
    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    setVal('ifEvento', i.evento); setVal('ifData', i.data); setVal('ifDataFine', i.data_fine);
    setVal('ifTipo', i.tipo_attivita); setVal('ifLuogo', i.luogo);
    setVal('ifUtente', i.utente); setVal('ifNVol', i.n_volontari);
    setVal('ifNOre', i.n_ore); setVal('ifNote', i.note);
    const radio = document.getElementById('ifRadio');
    if (radio) radio.checked = !!i.utilizzo_radio;
    const vola = document.getElementById('ifVola');
    if (vola) vola.checked = !!i.vola;
    const volaNum = document.getElementById('ifVolaNum');
    if (volaNum) volaNum.value = i.vola_numero || '';
    const volter = document.getElementById('ifVolter');
    if (volter) volter.checked = !!i.volter;
    // Ripristina macro
    var cbMacro = document.getElementById('ifIsMacro');
    if (cbMacro) { cbMacro.checked = !!i.is_macro; toggleMacroMode(); }
    var selMacro = document.getElementById('ifMacroId');
    if (selMacro && i.macro_id) selMacro.value = i.macro_id;
    // Spunta volontari
    if (i.volontari_ids && i.volontari_ids.length) {
      i.volontari_ids.forEach(vid => {
        const cb = document.getElementById('vp_' + vid);
        if (cb) cb.checked = true;
      });
      aggiornaConteggioVolontari();
    }
  } catch(e) {}
}

async function salvaIntervento() {
  const evento = document.getElementById('ifEvento').value.trim();
  const data   = document.getElementById('ifData').value;
  const errEl  = document.getElementById('intFormErr');
  if (!evento || !data) { errEl.textContent = 'Evento e data sono obbligatori.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  // Raccogli volontari selezionati
  const volontari_ids = Array.from(document.querySelectorAll('.vol-picker-item input:checked')).map(cb => parseInt(cb.value));

  const payload = {
    evento,
    data,
    data_fine:     document.getElementById('ifDataFine') ? (document.getElementById('ifDataFine').value || null) : null,
    tipo_attivita: document.getElementById('ifTipo').value || null,
    luogo:         document.getElementById('ifLuogo').value.trim() || null,
    utente:        document.getElementById('ifUtente').value.trim() || currentUser.nome,
    n_volontari:   parseInt(document.getElementById('ifNVol').value) || 0,
    n_ore:         parseFloat(document.getElementById('ifNOre').value) || 0,
    utilizzo_radio: document.getElementById('ifRadio').checked,
    volontari_ids,
    note:          document.getElementById('ifNote').value.trim() || null,
    vola:          document.getElementById('ifVola') ? document.getElementById('ifVola').checked : false,
    vola_numero:   document.getElementById('ifVolaNum') ? document.getElementById('ifVolaNum').value.trim() || null : null,
    volter:        document.getElementById('ifVolter') ? document.getElementById('ifVolter').checked : false,
    is_macro:      document.getElementById('ifIsMacro') ? document.getElementById('ifIsMacro').checked : false,
    macro_id:      (document.getElementById('ifIsMacro') && document.getElementById('ifIsMacro').checked) ? null
                   : (document.getElementById('ifMacroId') && document.getElementById('ifMacroId').value ? parseInt(document.getElementById('ifMacroId').value) : null),
  };

  try {
    let res;
    if (intCorrenteId) {
      res = await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + intCorrenteId, { method:'PATCH', headers: Object.assign({}, HJ, {'Prefer':'return=minimal'}), body: JSON.stringify(payload) });
    } else {
      res = await fetch(SUPA_URL + '/rest/v1/interventi', { method:'POST', headers: Object.assign({}, HJ, {'Prefer':'return=minimal'}), body: JSON.stringify(payload) });
    }
    if (res.ok) {
      await logAttivita((intCorrenteId ? 'ha modificato' : 'ha registrato') + ' intervento: ' + evento);
      chiudiFormIntervento();
      chiudiDettaglioIntervento();
      caricaInterventi();
    } else { errEl.textContent = 'Errore salvataggio.'; errEl.style.display = 'block'; }
  } catch(e) { errEl.textContent = 'Errore di connessione.'; errEl.style.display = 'block'; }
}

async function eliminaIntervento() {
  if (!intCorrenteId) return;
  if (!confirm('Eliminare questo intervento?')) return;
  await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + intCorrenteId, { method:'DELETE', headers: H });
  await logAttivita('ha eliminato un intervento');
  chiudiFormIntervento();
  chiudiDettaglioIntervento();
  caricaInterventi();
}

function chiudiFormIntervento() {
  document.getElementById('intFormPanel').classList.remove('open');
}


// -- ATTESTATI --

var attestatiIntCorrenteId = null;
var attestatiVolontari = [];

async function apriGeneratoreAttestati(interventoId) {
  attestatiIntCorrenteId = interventoId;

  // Crea overlay se non esiste
  var overlay = document.getElementById('attestatiOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'attestatiOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--overlay);z-index:500;display:flex;align-items:flex-end;justify-content:center';
    overlay.innerHTML =
      '<div style="background:var(--bg);width:100%;max-width:480px;max-height:90vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:1.2rem 1rem 2rem">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
      + '<div style="font-size:1rem;font-weight:700;color:var(--testo)">📜 Genera attestati</div>'
      + '<button class="btn-sm" onclick="chiudiGeneratoreAttestati()">✕</button>'
      + '</div>'
      + '<div id="attestatiBody"><div class="loading-msg">caricamento...</div></div>'
      + '</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  document.getElementById('attestatiBody').innerHTML = '<div class="loading-msg">caricamento...</div>';

  try {
    // Carica dati intervento
    var intRes  = await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + interventoId + '&select=*', { headers: H });
    var intData = await intRes.json();
    var intv    = intData[0];
    if (!intv) { document.getElementById('attestatiBody').innerHTML = '<div class="loading-msg">Intervento non trovato.</div>'; return; }

    // Carica volontari partecipanti
    attestatiVolontari = [];
    if (intv.volontari_ids && intv.volontari_ids.length) {
      var vRes  = await fetch(SUPA_URL + '/rest/v1/volontari?id=in.(' + intv.volontari_ids.join(',') + ')&select=id,cognome,nome,codice_fiscale&order=cognome', { headers: H });
      attestatiVolontari = await vRes.json();
    }

    renderGeneratoreAttestati(intv);
  } catch(e) {
    document.getElementById('attestatiBody').innerHTML = '<div style="color:var(--red);font-size:0.8rem">Errore: ' + e.message + '</div>';
  }
}

function renderGeneratoreAttestati(intv) {
  var dataInizio = intv.data      ? new Date(intv.data).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}) : '—';
  var dataFine   = intv.data_fine ? new Date(intv.data_fine).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}) : dataInizio;

  var volHtml = '';
  if (!attestatiVolontari.length) {
    volHtml = '<div style="font-size:0.8rem;color:var(--testo-3);padding:0.5rem 0">Nessun volontario associato a questo intervento.<br>Modifica l\'intervento e seleziona i volontari partecipanti.</div>';
  } else {
    volHtml = '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">'
      + '<label style="font-size:0.78rem;color:var(--testo-3);cursor:pointer;display:flex;align-items:center;gap:0.4rem">'
      + '<input type="checkbox" id="attestatiSelAll" onchange="toggleSelAll(this)" checked> Seleziona tutti</label>'
      + '</div>';
    volHtml += '<div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
    attestatiVolontari.forEach(function(v, idx) {
      volHtml += '<div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.8rem;border-bottom:0.5px solid var(--border)' + (idx === attestatiVolontari.length-1 ? ';border-bottom:none' : '') + '">'
        + '<input type="checkbox" class="attestato-cb" data-id="' + v.id + '" checked style="accent-color:var(--green);width:16px;height:16px;flex-shrink:0">'
        + '<div style="flex:1;font-size:0.85rem;font-weight:500;color:var(--testo)">' + v.cognome + ' ' + v.nome + '</div>'
        + (v.codice_fiscale ? '<div style="font-size:0.7rem;color:var(--testo-3)">' + v.codice_fiscale + '</div>' : '<div style="font-size:0.7rem;color:var(--amber)">CF mancante</div>')
        + '</div>';
    });
    volHtml += '</div>';
  }

  document.getElementById('attestatiBody').innerHTML =
    '<div style="background:var(--bg-2);border-radius:8px;padding:0.7rem 0.9rem;margin-bottom:1rem;font-size:0.82rem">'
    + '<div style="font-weight:700;color:var(--testo);margin-bottom:0.2rem">' + (intv.evento || '—') + '</div>'
    + '<div style="color:var(--testo-3)">' + dataInizio + (dataFine !== dataInizio ? ' → ' + dataFine : '') + (intv.luogo ? ' · ' + intv.luogo : '') + '</div>'
    + '</div>'
    + '<div style="font-size:0.72rem;font-weight:700;color:var(--testo-3);text-transform:uppercase;margin-bottom:0.5rem">Volontari (' + attestatiVolontari.length + ')</div>'
    + volHtml
    + (attestatiVolontari.length ? '<div id="attestatiStatus" style="font-size:0.75rem;color:var(--testo-3);margin:0.8rem 0 0;min-height:1.2rem"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.8rem">'
      + '<button class="btn-primary" style="padding:0.6rem;font-size:0.82rem" onclick="generaAttestatiSelezionati(' + intv.id + ')">📜 Genera attestati</button>'
      + '<button class="btn-primary" style="padding:0.6rem;font-size:0.82rem;background:var(--bg-3);color:var(--testo)" onclick="generaAttestatiSelezionati(' + intv.id + ',true)">📄 PDF unico (stampa)</button>'
      + '</div>'
      + '<div id="attestatiRisultati" style="margin-top:0.8rem"></div>' : '');
}

function toggleSelAll(cb) {
  document.querySelectorAll('.attestato-cb').forEach(function(el){ el.checked = cb.checked; });
}

async function generaAttestatiSelezionati(interventoId, unico) {
  var selezionati = Array.from(document.querySelectorAll('.attestato-cb:checked')).map(function(el){ return parseInt(el.dataset.id); });
  if (!selezionati.length) { alert('Seleziona almeno un volontario.'); return; }

  var status     = document.getElementById('attestatiStatus');
  var risultati  = document.getElementById('attestatiRisultati');
  status.textContent = 'Caricamento librerie...';
  if (risultati) risultati.innerHTML = '';

  await _caricaLibreriaAttestati();

  var intRes  = await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + interventoId + '&select=*', { headers: H });
  var intData = await intRes.json();
  var intv    = intData[0];
  var vols    = attestatiVolontari.filter(function(v){ return selezionati.includes(v.id); });

  if (unico) {
    status.textContent = 'Apertura finestra di stampa...';
    _stampaPDFUnico(intv, vols);
    status.textContent = '✓ Finestra di stampa aperta.';
    return;
  }

  // Genera PDF per ciascun volontario e mostra i pulsanti risultato
  status.textContent = 'Generazione in corso...';
  var righe = [];

  for (var idx = 0; idx < vols.length; idx++) {
    var v = vols[idx];
    status.textContent = 'Generazione ' + (idx+1) + '/' + vols.length + ': ' + v.cognome + ' ' + v.nome + '...';
    try {
      var pdfBlob  = await _generaPDFBlob(intv, v);
      var nomeFile = 'ATTESTATO_' + (intv.evento || 'intervento').replace(/[^a-zA-Z0-9]/g,'_').toUpperCase()
        + '_' + v.cognome.toUpperCase() + '_' + v.nome.toUpperCase() + '.pdf';
      righe.push({ v: v, blob: pdfBlob, nome: nomeFile, archiviato: false });
    } catch(e) {
      righe.push({ v: v, blob: null, errore: e.message });
    }
  }

  status.textContent = '✓ ' + righe.filter(function(r){ return r.blob; }).length + '/' + vols.length + ' attestati generati.';

  // Mostra risultati con azioni per ognuno
  if (risultati) {
    risultati.innerHTML = '<div style="font-size:0.72rem;font-weight:700;color:var(--testo-3);text-transform:uppercase;margin-bottom:0.5rem">Risultati</div>';
    righe.forEach(function(r, i) {
      var riga = document.createElement('div');
      riga.id  = 'att-riga-' + i;
      riga.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0;border-bottom:0.5px solid var(--border)';
      if (r.blob) {
        riga.innerHTML = '<div style="flex:1;font-size:0.82rem;font-weight:500;color:var(--testo)">' + r.v.cognome + ' ' + r.v.nome + '</div>'
          + '<button class="btn-sm" style="font-size:0.72rem;padding:3px 8px;flex-shrink:0" onclick="scaricaAttestato(' + i + ')">⬇️ Scarica</button>'
          + '<button class="btn-sm" style="font-size:0.72rem;padding:3px 8px;flex-shrink:0" id="att-archivia-' + i + '" onclick="archiviaAttestato(' + i + ',' + intv.id + ')">📁 Archivia</button>';
      } else {
        riga.innerHTML = '<div style="flex:1;font-size:0.82rem;color:var(--red)">' + r.v.cognome + ' ' + r.v.nome + ' — errore: ' + r.errore + '</div>';
      }
      risultati.appendChild(riga);
    });
    // Salva righe in variabile globale per accesso dai pulsanti
    window._attestatiRighe = righe;
  }
}

function scaricaAttestato(idx) {
  var r = window._attestatiRighe && window._attestatiRighe[idx];
  if (!r || !r.blob) return;
  var a = document.createElement('a');
  a.href = URL.createObjectURL(r.blob);
  a.download = r.nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function archiviaAttestato(idx, interventoId) {
  var r = window._attestatiRighe && window._attestatiRighe[idx];
  if (!r || !r.blob) return;
  var btn = document.getElementById('att-archivia-' + idx);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    var path = r.v.id + '/ATTESTATO_' + interventoId + '_' + Date.now() + '.pdf';
    var uploadRes = await fetch(SUPA_URL + '/storage/v1/object/attestati/' + path, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/pdf' },
      body: r.blob
    });
    if (!uploadRes.ok) throw new Error('Errore upload');

    var url = SUPA_URL + '/storage/v1/object/public/attestati/' + path;
    await fetch(SUPA_URL + '/rest/v1/documenti', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ volontario_id: r.v.id, tipo: 'ATTESTATO', nome_file: r.nome, url, data_carico: new Date().toISOString() })
    });
    await logAttivita('ha archiviato attestato per ' + r.v.cognome + ' ' + r.v.nome);
    if (btn) { btn.textContent = '✓ Archiviato'; btn.style.color = 'var(--green)'; }
    r.archiviato = true;
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '📁 Archivia'; }
    alert('Errore archiviazione: ' + e.message);
  }
}

async function _generaPDFBlob(intv, v) {
  var container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;z-index:-1';
  container.innerHTML = _buildAttestatiHTML(intv, [v], false);
  document.body.appendChild(container);
  try {
    var canvas = await html2canvas(container.querySelector('.page'), {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794
    });
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var pdf     = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

function _caricaLibreriaAttestati() {
  return new Promise(function(resolve) {
    if (window.jspdf && window.html2canvas) { resolve(); return; }
    var loaded = 0;
    var check  = function(){ if (++loaded === 2) resolve(); };
    if (!window.html2canvas) {
      var s1 = document.createElement('script');
      s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s1.onload = check; document.head.appendChild(s1);
    } else { check(); }
    if (!window.jspdf) {
      var s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s2.onload = check; document.head.appendChild(s2);
    } else { check(); }
  });
}

function _buildAttestatiHTML(intv, vols, perStampa) {
  var LOGO_SEZ  = 'data:image/png;base64,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';
  var LOGO_VOL  = 'data:image/png;base64,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';
  var FIRMA_B64 = 'data:image/png;base64,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';

  var dataInizio = intv.data      ? new Date(intv.data).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}) : '—';
  var dataFine   = intv.data_fine ? new Date(intv.data_fine).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}) : dataInizio;
  var oggi       = new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});

  var css = '* { margin:0;padding:0;box-sizing:border-box; }'
    + 'body { background:white;font-family:\'Times New Roman\',serif;color:#111; }'
    + '.page { width:210mm;min-height:297mm;padding:15mm 18mm 14mm;box-sizing:border-box;display:flex;flex-direction:column; }'
    + '.header { display:flex;align-items:center;justify-content:space-between;margin-bottom:10mm; }'
    + '.logo { width:28mm;height:auto;object-fit:contain;mix-blend-mode:multiply; }'
    + '.header-center { flex:1;text-align:center;border:2px solid #1a7a4a;margin:0 10mm;padding:5mm 4mm; }'
    + '.l1 { font-size:12pt;font-weight:700;color:#1a7a4a;letter-spacing:0.3px; }'
    + '.l2 { font-size:10pt;font-weight:700;color:#1a7a4a;margin-top:2px; }'
    + '.l3 { font-size:8.5pt;color:#1a7a4a;font-style:italic;margin-top:3px; }'
    + '.l4 { font-size:10pt;font-weight:700;color:#1a7a4a;margin-top:2px; }'
    + '.titolo { text-align:center;margin:8mm 0 6mm;font-size:26pt;font-weight:700;text-decoration:underline;letter-spacing:0.5px; }'
    + '.si-attesta { text-align:center;font-size:13pt;margin-bottom:5mm; }'
    + '.nome { text-align:center;font-size:26pt;font-weight:700;letter-spacing:1.5px;margin:6mm 0 3mm; }'
    + '.ruolo { text-align:center;font-size:12pt;font-style:italic;color:#222;margin-bottom:8mm; }'
    + '.ha-part { font-size:13pt;margin-bottom:4mm; }'
    + '.evento { text-align:center;font-size:18pt;font-weight:700;margin:5mm 0; }'
    + '.date { display:flex;gap:50mm;margin:10mm 0 0;font-size:13pt; }'
    + '.firma-row { display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:14mm; }'
    + '.data-gen { font-size:12pt;font-style:italic; }'
    + '.firma-label { font-size:12pt;font-style:italic;margin-bottom:2mm;text-align:center; }'
    + '.firma-img { width:55mm;height:auto;display:block;margin:0 auto;mix-blend-mode:multiply; }'
    + '.firma-line { border-top:1px solid #333;width:65mm;margin:2mm auto 0; }'
    + (perStampa ? '@media print { .page { page-break-after:always; } .page:last-child { page-break-after:avoid; } } @page { size:A4;margin:0; }' : '');

  var pagine = vols.map(function(v) {
    return '<div class="page">'
      + '<div class="header">'
      + '<img class="logo" src="' + LOGO_SEZ + '">'
      + '<div class="header-center">'
      + '<div class="l1">ASSOCIAZIONE NAZIONALE ALPINI</div>'
      + '<div class="l2">SEZIONE DI CASALE MONFERRATO</div>'
      + '<div class="l3">Medaglia d\'Oro al M.C. della Città di Casale Monferrato</div>'
      + '<div class="l4">UNITÀ DI PROTEZIONE CIVILE ANA</div>'
      + '</div>'
      + '<img class="logo" src="' + LOGO_VOL + '">'
      + '</div>'
      + '<div class="titolo">ATTESTATO DI PARTECIPAZIONE</div>'
      + '<div class="si-attesta">si attesta che il Volontario</div>'
      + '<div class="nome">' + v.cognome.toUpperCase() + ' ' + v.nome.toUpperCase() + '</div>'
      + '<div class="ruolo">Volontario dell\'Unità PC ANA Casale Monferrato</div>'
      + '<div class="ha-part">ha partecipato alle attività connesse a:</div>'
      + '<div class="evento">' + (intv.evento || '').toUpperCase() + '</div>'
      + '<div class="date"><div>dal ' + dataInizio + '</div><div>al ' + dataFine + '</div></div>'
      + '<div class="firma-row">'
      + '<div class="data-gen">' + oggi + '</div>'
      + '<div><div class="firma-label">Il Presidente</div>'
      + '<img class="firma-img" src="' + FIRMA_B64 + '">'
      + '<div class="firma-line"></div></div>'
      + '</div>'
      + '</div>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + css + '</style></head><body>'
    + pagine
    + (perStampa ? '<script>window.onload=function(){setTimeout(function(){window.print();},600);}<\/script>' : '')
    + '</body></html>';
}

function _stampaPDFUnico(intv, vols) {
  var html = _buildAttestatiHTML(intv, vols, true);
  var win  = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

function chiudiGeneratoreAttestati() {
  var overlay = document.getElementById('attestatiOverlay');
  if (overlay) overlay.style.display = 'none';
}


// -- DOCUMENTI --
let docVolontariCache = [];
let docUploadVolId = null;
let docUploadFile  = null;

const DOC_TIPO_LABEL = {
  'FOTO':'📷 Foto profilo', '4_ORE':'📋 Attestato 4 Ore', '12_ORE':'📋 Attestato 12 Ore',
  'CAPOSQ':'📋 Caposquadra', 'DAE':'🏥 DAE', 'CDC_1':'🏥 CDC 1° Step',
  'CDC_2':'🏥 CDC 2° Step', 'VISITA':'🩺 Visita medica', 'EMERCOM':'📡 EMERCOM',
  'ATTESTATO':'📜 Attestato intervento', 'ALTRO':'📄 Altro'
};

async function caricaDocumenti() {
  const list = document.getElementById('docVolList');
  if (!list) return;
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    // Carica volontari con count documenti
    const [vRes, dRes] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome&order=cognome&attivo=eq.true', { headers: H }),
      fetch(SUPA_URL + '/rest/v1/documenti?select=id,volontario_id,tipo,nome_file,url,data_carico', { headers: H })
    ]);
    const vols = await vRes.json();
    const docs = await dRes.json();
    docVolontariCache = vols;

    // Raggruppa documenti per volontario
    const docsPerVol = {};
    docs.forEach(d => {
      if (!docsPerVol[d.volontario_id]) docsPerVol[d.volontario_id] = [];
      docsPerVol[d.volontario_id].push(d);
    });

    renderDocVolontari(vols, docsPerVol);
    window._docsPerVol = docsPerVol;
  } catch(e) { list.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

function renderDocVolontari(vols, docsPerVol) {
  const list = document.getElementById('docVolList');
  if (!list) return;
  list.innerHTML = '';
  vols.forEach(v => {
    const docs = docsPerVol[v.id] || [];
    const [bg, fg] = avatarColor(v.cognome);
    const initials = ((v.cognome||'?')[0] + (v.nome||'?')[0]).toUpperCase();
    const card = document.createElement('div');
    card.className = 'doc-vol-card';
    card.id = 'docCard_' + v.id;
    card.innerHTML = '<div class="doc-vol-head" onclick="toggleDocVol(' + v.id + ')">'
      + '<div class="doc-vol-avatar" style="background:' + bg + ';color:' + fg + '">' + initials + '</div>'
      + '<span class="doc-vol-name">' + v.cognome + ' ' + v.nome + '</span>'
      + '<span class="doc-vol-count">' + (docs.length ? docs.length + ' doc.' : 'nessun doc.') + '</span>'
      + '<span class="doc-vol-arrow">▼</span>'
      + '</div>'
      + '<div class="doc-vol-body" id="docBody_' + v.id + '">'
      + renderDocListHTML(v.id, docs)
      + '</div>';
    list.appendChild(card);
  });
}

function renderDocListHTML(volId, docs) {
  let html = '<div class="doc-list">';
  if (docs.length) {
    docs.forEach(d => {
      const data = d.data_carico ? new Date(d.data_carico).toLocaleDateString('it-IT') : '—';
      const label = DOC_TIPO_LABEL[d.tipo] || d.tipo;
      const nome  = d.nome_file || label;
      html += '<div class="doc-item">'
        + '<span class="doc-item-icon">' + (label.split(' ')[0]) + '</span>'
        + '<div class="doc-item-info">'
        + '<div class="doc-item-name">' + nome + '</div>'
        + '<div class="doc-item-meta">' + label + ' . ' + data + '</div>'
        + '</div>'
        + '<div class="doc-item-actions">'
        + '<a href="' + d.url + '" target="_blank" class="btn-sm btn-ok">apri</a>'
        + '<button class="btn-sm btn-danger" onclick="eliminaDoc(' + d.id + ',' + volId + ')">✕</button>'
        + '</div>'
        + '</div>';
    });
  }
  html += '</div>';
  html += '<button class="doc-add-btn" onclick="apriUploadDoc(' + volId + ')">+ aggiungi documento</button>';
  return html;
}

function toggleDocVol(volId) {
  const card = document.getElementById('docCard_' + volId);
  if (card) card.classList.toggle('open');
}

function filtraDocVolontari() {
  const q = (document.getElementById('docSearch').value || '').toLowerCase().trim();
  document.querySelectorAll('.doc-vol-card').forEach(card => {
    const nome = card.querySelector('.doc-vol-name').textContent.toLowerCase();
    card.style.display = !q || nome.includes(q) ? '' : 'none';
  });
}

function apriUploadDoc(volId) {
  docUploadVolId = volId;
  docUploadFile  = null;
  const v = docVolontariCache.find(v => v.id === volId);
  document.getElementById('docUploadTitle').textContent = 'Carica documento — ' + (v ? v.cognome + ' ' + v.nome : '');
  document.getElementById('docUploadErr').style.display = 'none';
  document.getElementById('docDropText').innerHTML = '📎 Tocca per selezionare il file<br><span style="font-size:0.62rem;opacity:0.6">PDF, JPG, PNG — max 10MB</span>';
  document.getElementById('docNome').value = '';
  document.getElementById('docProgress').style.display = 'none';
  document.getElementById('docProgressBar').style.width = '0%';
  document.getElementById('docFileInput').value = '';
  document.getElementById('docUploadOverlay').classList.add('open');
}

function chiudiUploadDoc() {
  document.getElementById('docUploadOverlay').classList.remove('open');
  docUploadVolId = null;
  docUploadFile  = null;
}

function docFileSelected(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    document.getElementById('docUploadErr').textContent = 'File troppo grande (max 10MB).';
    document.getElementById('docUploadErr').style.display = 'block';
    return;
  }
  docUploadFile = file;
  var txt = document.getElementById('docDropText');
  if (txt) txt.textContent = '✓ ' + file.name + ' (' + (file.size/1024).toFixed(0) + ' KB)';
}

async function eseguiUploadDoc() {
  if (!docUploadFile || !docUploadVolId) {
    document.getElementById('docUploadErr').textContent = 'Seleziona un file.';
    document.getElementById('docUploadErr').style.display = 'block';
    return;
  }
  const tipo    = document.getElementById('docTipo').value;
  const nomeDoc = document.getElementById('docNome').value.trim() || docUploadFile.name;
  const bucket  = tipo === 'FOTO' ? 'foto-volontari' : 'attestati';
  const path    = docUploadVolId + '/' + tipo + '_' + Date.now() + '_' + docUploadFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const errEl   = document.getElementById('docUploadErr');
  const btn     = document.getElementById('docUploadBtn');
  const progress = document.getElementById('docProgress');
  const bar      = document.getElementById('docProgressBar');

  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'caricamento...';
  progress.style.display = 'block';

  try {
    // Upload su Supabase Storage
    bar.style.width = '30%';
    const uploadRes = await fetch(
      SUPA_URL + '/storage/v1/object/' + bucket + '/' + path,
      { method: 'POST', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': docUploadFile.type }, body: docUploadFile }
    );
    bar.style.width = '70%';
    if (!uploadRes.ok) throw new Error('Errore upload storage');

    // URL pubblico
    const url = SUPA_URL + '/storage/v1/object/public/' + bucket + '/' + path;

    // Salva record in documenti
    const docRes = await fetch(SUPA_URL + '/rest/v1/documenti', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ volontario_id: docUploadVolId, tipo, nome_file: nomeDoc, url })
    });
    bar.style.width = '100%';
    if (!docRes.ok) throw new Error('Errore salvataggio record');

    // Se è foto, aggiorna avatar volontario
    if (tipo === 'FOTO') {
      await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + docUploadVolId, {
        method: 'PATCH', headers: HJ, body: JSON.stringify({ foto_url: url })
      });
    }

    await logAttivita('ha caricato documento: ' + nomeDoc + ' per volontario ' + docUploadVolId);
    chiudiUploadDoc();
    caricaDocumenti();
  } catch(e) {
    errEl.textContent = 'Errore: ' + e.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'carica';
}

async function eliminaDoc(docId, volId) {
  if (!confirm('Eliminare questo documento?')) return;
  await fetch(SUPA_URL + '/rest/v1/documenti?id=eq.' + docId, { method: 'DELETE', headers: H });
  await logAttivita('ha eliminato un documento');
  caricaDocumenti();
}

// Mostra documenti nella scheda volontario
async function caricaDocVolontario(volId) {
  const section = document.getElementById('volDocSection');
  const body    = document.getElementById('volDocBody');
  if (!section || !body) return;
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/documenti?volontario_id=eq.' + volId + '&select=*&order=data_carico.desc', { headers: H });
    const docs = await res.json();
    const count = document.getElementById('volDocCount');
    if (count) count.textContent = '(' + docs.length + ')';

    if (!docs.length) {
      body.innerHTML = '<div style="font-size:0.72rem;color:var(--text-4);padding:0.3rem 0">Nessun documento.</div>'
        + '<button class="doc-add-btn" style="margin-top:0.3rem" onclick="apriDocDaScheda(' + volId + ')">+ carica documento</button>';
      return;
    }

    const attestati = docs.filter(d => d.tipo === 'ATTESTATO');
    const altri     = docs.filter(d => d.tipo !== 'ATTESTATO');

    let html = '';

    // Sezione attestati
    if (attestati.length) {
      html += '<div style="font-size:0.68rem;font-weight:700;color:var(--testo-3);text-transform:uppercase;margin:0.3rem 0 0.4rem">📜 Attestati (' + attestati.length + ')</div>';
      html += attestati.map(d => {
        const data = d.data_carico ? new Date(d.data_carico).toLocaleDateString('it-IT') : '—';
        const nome = d.nome_file ? d.nome_file.replace(/^ATTESTATO_/,'').replace(/_/g,' ').replace(/\.pdf$/i,'') : 'Attestato';
        return '<div class="vol-field" style="background:var(--bg-2);border-radius:6px;padding:0.4rem 0.6rem;margin-bottom:0.3rem">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:0.78rem;font-weight:500;color:var(--testo);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + nome + '</div>'
          + '<div style="font-size:0.65rem;color:var(--testo-3)">' + data + '</div>'
          + '</div>'
          + '<a href="' + d.url + '" target="_blank" style="color:var(--green);font-size:0.75rem;font-weight:600;text-decoration:none;flex-shrink:0">⬇️ Apri</a>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    // Sezione altri documenti
    if (altri.length) {
      if (attestati.length) html += '<div style="font-size:0.68rem;font-weight:700;color:var(--testo-3);text-transform:uppercase;margin:0.6rem 0 0.4rem">📄 Documenti</div>';
      html += altri.map(d => {
        const label = DOC_TIPO_LABEL[d.tipo] || d.tipo;
        const data  = d.data_carico ? new Date(d.data_carico).toLocaleDateString('it-IT') : '—';
        return '<div class="vol-field">'
          + '<span class="vol-field-label">' + label.replace(/^[^ ]+ /,'') + '</span>'
          + '<a href="' + d.url + '" target="_blank" style="color:var(--blue);font-size:0.72rem;text-decoration:none">'
          + (d.nome_file || label) + ' ↗</a>'
          + '</div>';
      }).join('');
    }

    html += '<button class="doc-add-btn" style="margin-top:0.4rem" onclick="apriDocDaScheda(' + volId + ')">+ aggiungi documento</button>';
    body.innerHTML = html;
  } catch(e) {}
}

function apriDocDaScheda(volId) {
  chiudiDettaglio();
  showPanel('documenti', null);
  setTimeout(() => apriUploadDoc(volId), 400);
}


function getTipoAttivitaIcon(tipo, size, color) {
  size = size || 20;
  var icons = {
    'EMERGENZA': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    'ESERCITAZIONE': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/></svg>',
    'CORSI': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    'PREVENZIONE INFORTUNI': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'RAPPRESENTANZA': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"/><path d="M12 11v3"/><path d="M8 21l1-4h6l1 4"/><path d="M5 21h14"/></svg>',
    'ASSEMBLEE E RIUNIONI': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'CONTROLLO TERRITORIO': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="4"/><circle cx="18" cy="12" r="4"/><path d="M2 12h4"/><path d="M20 12h2"/><path d="M10 12h4"/><path d="M6 8v-1a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
    'SEGRETERIA': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 8h2"/><path d="M7 12h2"/><path d="M11 8h6"/><path d="M11 12h6"/></svg>',
    'MAGAZZINO': '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  };
  return icons[tipo] || '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
}

var TIPO_ATTIVITA_COLORS = {
  'EMERGENZA':            { bg:'#fde8e8', stroke:'#c0392b' },
  'ESERCITAZIONE':        { bg:'#e8f0fb', stroke:'#185fa5' },
  'CORSI':                { bg:'#eaf3de', stroke:'#3b6d11' },
  'PREVENZIONE INFORTUNI':{ bg:'#faeeda', stroke:'#854f0b' },
  'RAPPRESENTANZA':       { bg:'#eeedfe', stroke:'#534ab7' },
  'ASSEMBLEE E RIUNIONI': { bg:'#e1f5ee', stroke:'#0f6e56' },
  'CONTROLLO TERRITORIO': { bg:'#e6f1fb', stroke:'#185fa5' },
  'SEGRETERIA':           { bg:'#f1efe8', stroke:'#5f5e5a' },
  'MAGAZZINO':            { bg:'#faeeda', stroke:'#854f0b' },
};

function getTipoAttivitaAvatar(tipo, size) {
  size = size || 36;
  var c = TIPO_ATTIVITA_COLORS[tipo] || { bg:'var(--green-pale)', stroke:'var(--green)' };
  return '<div style="width:'+size+'px;height:'+size+'px;border-radius:9px;background:'+c.bg+';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + getTipoAttivitaIcon(tipo, Math.round(size*0.55), c.stroke)
    + '</div>';
}

function toggleNuovoUtente() {
  var form = document.getElementById('nuovoUtenteForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function toggleNuovoCampo() {
  var form = document.getElementById('nuovoCampoForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// -- KEYBOARD --
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});


// -- DB AVANZATO (Supabase) --

const DB_ALL_COLS = [
  { key:'cognome',        label:'Cognome',         type:'text',   full:false },
  { key:'nome',           label:'Nome',            type:'text',   full:false },
  { key:'squadra',        label:'Squadra',         type:'text',   full:false },
  { key:'tipo_volontario',label:'Tipo',            type:'text',   full:false },
  { key:'mansione',       label:'Mansione',        type:'text',   full:false },
  { key:'specializzazione',label:'Specializ.',     type:'text',   full:false },
  { key:'telefono',       label:'Telefono',        type:'text',   full:false },
  { key:'email',          label:'Email',           type:'text',   full:false },
  { key:'codice_fiscale', label:'Cod. Fiscale',    type:'text',   full:false },
  { key:'data_nascita',   label:'Data Nascita',    type:'date',   full:false },
  { key:'luogo_nascita',  label:'Luogo Nascita',   type:'text',   full:false },
  { key:'indirizzo',      label:'Indirizzo',       type:'text',   full:true  },
  { key:'cap',            label:'CAP',             type:'text',   full:false },
  { key:'citta',          label:'Città',           type:'text',   full:false },
  { key:'gruppo_alpini',  label:'Gruppo Alpini',   type:'text',   full:false },
  { key:'professione',    label:'Professione',     type:'text',   full:false },
  { key:'patenti',        label:'Patenti',         type:'text',   full:false },
  { key:'comm_unita',     label:'Comm. Unità',     type:'bool',   full:false },
  { key:'radio_ana',      label:'Radio ANA',       type:'bool',   full:false },
  { key:'emercom',        label:'EMERCOM',         type:'bool',   full:false },
  { key:'cod_emercom',    label:'Cod. EMERCOM',    type:'text',   full:false },
  { key:'quattro_ore',    label:'4 Ore',           type:'bool',   full:false },
  { key:'dodici_ore',     label:'12 Ore',          type:'bool',   full:false },
  { key:'corso_caposq',   label:'Corso Caposq.',   type:'bool',   full:false },
  { key:'caposq_att',     label:'Caposq. Att.',    type:'bool',   full:false },
  { key:'dae',            label:'DAE',             type:'bool',   full:false },
  { key:'scad_dae',       label:'Scad. DAE',       type:'date',   full:false },
  { key:'cdc_1_step',     label:'CDC 1',           type:'bool',   full:false },
  { key:'cdc_2_step',     label:'CDC 2',           type:'bool',   full:false },
  { key:'data_visita',    label:'Data Visita',     type:'date',   full:false },
  { key:'stato_visita',   label:'Stato Visita',    type:'select', full:false,
    options:['ESONERO','DA FARE','VERIFICA','SOLO ESAMI','COMPLETATA'] },
  { key:'iscrizione',     label:'Iscrizione',      type:'bool',   full:false },
  { key:'tutela_legale_cap',label:'Tutela CAP',    type:'bool',   full:false },
  { key:'no_2026',        label:'No 2026',         type:'bool',   full:false },
  { key:'dispon',         label:'Disponibile',     type:'bool',   full:false },
  { key:'note_dispon',    label:'Note Dispon.',    type:'text',   full:true  },
  { key:'varchi',         label:'Varchi',          type:'text',   full:false },
  { key:'pronto_impiego', label:'Pronto Impiego',  type:'bool',   full:false },
  { key:'attivo',         label:'Attivo',          type:'bool',   full:false },
];

var DB_VISIBLE_COLS = JSON.parse(localStorage.getItem('db_cols_supa') || 'null') ||
  DB_ALL_COLS.map(function(c){ return c.key; });

var dbRecords   = [];
var dbTotal     = 0;
var dbPage      = 0;
var dbPageSize  = 1000;
var dbSearchTerm= '';
var dbSortKey   = 'cognome';
var dbSortAsc   = true;
var dbEditId    = null;

async function caricaDb() {
  // Se non c'è preferenza salvata, mostra tutto
  if (!localStorage.getItem('db_cols_supa')) {
    DB_VISIBLE_COLS = DB_ALL_COLS.map(function(c){ return c.key; });
  }
  var tbody = document.getElementById('dbTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="99" class="db-loading">caricamento...</td></tr>';
  dbRenderHead();
  try {
    var visKeys = DB_VISIBLE_COLS.concat(['id']);
    var select  = visKeys.join(',');
    var order   = dbSortKey + '.' + (dbSortAsc ? 'asc' : 'desc') + '.nullslast';
    var url     = SUPA_URL + '/rest/v1/volontari?select=' + select + '&order=' + order
                + '&limit=1000';
    if (dbSearchTerm) {
      url += '&or=(cognome.ilike.*' + encodeURIComponent(dbSearchTerm) + '*,nome.ilike.*' + encodeURIComponent(dbSearchTerm) + '*,squadra.ilike.*' + encodeURIComponent(dbSearchTerm) + '*)';
    }
    var res  = await fetch(url, { headers: Object.assign({}, H, { 'Prefer': 'count=exact' }) });
    var total = parseInt(res.headers.get('Content-Range')?.split('/')[1] || '0');
    dbTotal   = total;
    dbRecords = await res.json();
    dbRenderBody();
    dbRenderPag();
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="99" class="db-loading" style="color:var(--red)">Errore: ' + e.message + '</td></tr>';
  }
}

function dbRenderHead() {
  var thead = document.getElementById('dbThead');
  if (!thead) return;
  var cols = DB_ALL_COLS.filter(function(c){ return DB_VISIBLE_COLS.includes(c.key); });
  thead.innerHTML = '<tr><th style="width:32px;text-align:center">#</th>'
    + cols.map(function(c){
        var arrow = dbSortKey === c.key ? (dbSortAsc ? ' ↑' : ' ↓') : '';
        return '<th class="sortable" onclick="dbSort(\'' + c.key + '\')">' + c.label + arrow + '</th>';
      }).join('')
    + '<th style="width:52px"></th></tr>';
}

function dbRenderBody() {
  var tbody = document.getElementById('dbTbody');
  if (!tbody) return;
  var cols = DB_ALL_COLS.filter(function(c){ return DB_VISIBLE_COLS.includes(c.key); });
  if (!dbRecords.length) {
    tbody.innerHTML = '<tr><td colspan="99" class="db-loading">Nessun record.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  dbRecords.forEach(function(rec, idx) {
    var tr  = document.createElement('tr');
    var tds = '<td style="color:var(--testo-3);font-size:0.65rem;text-align:center">' + (dbPage * dbPageSize + idx + 1) + '</td>';
    cols.forEach(function(c) {
      var val = rec[c.key];
      var cell;
      if (c.type === 'bool') {
        cell = val ? '<span class="db-check">✓</span>' : '<span class="db-empty">—</span>';
      } else if (c.type === 'date') {
        cell = val ? new Date(val).toLocaleDateString('it-IT') : '<span class="db-empty">—</span>';
      } else if (c.type === 'select') {
        var colors = { 'COMPLETATA':'var(--green)','DA FARE':'var(--red)','SOLO ESAMI':'var(--amber)','VERIFICA':'var(--blue)','ESONERO':'var(--testo-3)' };
        cell = val ? '<span style="font-size:0.68rem;padding:2px 8px;border-radius:10px;background:var(--bg-2);color:' + (colors[val]||'var(--testo-2)') + '">' + val + '</span>' : '<span class="db-empty">—</span>';
      } else {
        cell = val ? '<span title="' + String(val).replace(/"/g,'') + '">' + String(val).substring(0,30) + (String(val).length > 30 ? '…' : '') + '</span>' : '<span class="db-empty">—</span>';
      }
      tds += '<td>' + cell + '</td>';
    });
    tds += '<td><button class="db-btn" style="padding:2px 7px;font-size:0.62rem" onclick="dbApriModifica(' + JSON.stringify(rec.id) + ')">✏</button></td>';
    tr.innerHTML = tds;
    tbody.appendChild(tr);
  });
}

function dbRenderPag() {
  var info = document.getElementById('dbPagInfo');
  if (info) info.textContent = dbRecords.length + ' volontari';
}

function dbPagina(dir) {}

function dbFiltra(q) {
  dbSearchTerm = q;
  dbPage = 0;
  clearTimeout(window._dbTimer);
  window._dbTimer = setTimeout(caricaDb, 400);
}

function dbSort(key) {
  if (dbSortKey === key) dbSortAsc = !dbSortAsc;
  else { dbSortKey = key; dbSortAsc = true; }
  dbPage = 0;
  caricaDb();
}

function dbToggleCols() {
  var grid = document.getElementById('dbColsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  DB_ALL_COLS.forEach(function(c) {
    var item = document.createElement('div');
    item.className = 'db-col-item';
    var id  = 'dbc_' + c.key;
    var chk = DB_VISIBLE_COLS.includes(c.key) ? 'checked' : '';
    item.innerHTML = '<input type="checkbox" id="' + id + '" value="' + c.key + '" ' + chk + '>'
      + '<label for="' + id + '">' + c.label + '</label>';
    grid.appendChild(item);
  });
  document.getElementById('dbColsOverlay').classList.add('open');
}

function dbSalvaColonne() {
  DB_VISIBLE_COLS = [];
  DB_ALL_COLS.forEach(function(c) {
    var el = document.getElementById('dbc_' + c.key);
    if (el && el.checked) DB_VISIBLE_COLS.push(c.key);
  });
  if (!DB_VISIBLE_COLS.length) DB_VISIBLE_COLS = DB_ALL_COLS.map(function(c){ return c.key; });
  localStorage.setItem('db_cols_supa', JSON.stringify(DB_VISIBLE_COLS));
  document.getElementById('dbColsOverlay').classList.remove('open');
  caricaDb();
}

function dbNuovoRecord() {
  dbEditId = null;
  document.getElementById('dbRecordTitle').textContent = 'Nuovo volontario';
  document.getElementById('dbRecordErr').style.display = 'none';
  dbBuildForm({});
  document.getElementById('dbRecordOverlay').classList.add('open');
  var delBtn = document.getElementById('dbDelBtn'); if (delBtn) delBtn.style.display = 'none';
}

async function dbApriModifica(id) {
  dbEditId = id;
  document.getElementById('dbRecordTitle').textContent = 'Modifica volontario';
  document.getElementById('dbRecordErr').style.display = 'none';
  try {
    var res  = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + id + '&select=*', { headers: H });
    var data = await res.json();
    dbBuildForm(data[0] || {});
    document.getElementById('dbRecordOverlay').classList.add('open');
  var delBtn = document.getElementById('dbDelBtn'); if (delBtn) delBtn.style.display = 'block';
  } catch(e) { alert('Errore caricamento: ' + e.message); }
}

function dbBuildForm(rec) {
  var form = document.getElementById('dbRecordForm');
  if (!form) return;
  form.innerHTML = '';
  DB_ALL_COLS.forEach(function(c) {
    var div = document.createElement('div');
    div.className = 'db-record-field' + (c.full ? ' full' : '');
    var val = rec[c.key];
    if (c.type === 'bool') {
      div.innerHTML = '<label class="db-record-check"><input type="checkbox" id="dbf_' + c.key + '" ' + (val ? 'checked' : '') + '> ' + c.label + '</label>';
    } else if (c.type === 'select') {
      var opts = '<option value="">—</option>' + c.options.map(function(o){
        return '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>';
      }).join('');
      div.innerHTML = '<label class="db-record-lbl">' + c.label + '</label><select class="db-record-inp" id="dbf_' + c.key + '">' + opts + '</select>';
    } else if (c.type === 'date') {
      var dv = val ? val.slice(0,10) : '';
      div.innerHTML = '<label class="db-record-lbl">' + c.label + '</label><input type="date" class="db-record-inp" id="dbf_' + c.key + '" value="' + dv + '">';
    } else {
      div.innerHTML = '<label class="db-record-lbl">' + c.label + '</label><input class="db-record-inp" id="dbf_' + c.key + '" value="' + (val || '') + '">';
    }
    form.appendChild(div);
  });
}

async function dbSalvaRecord() {
  var errEl   = document.getElementById('dbRecordErr');
  var payload = {};
  DB_ALL_COLS.forEach(function(c) {
    var el = document.getElementById('dbf_' + c.key);
    if (!el) return;
    if (c.type === 'bool')        payload[c.key] = el.checked;
    else if (c.type === 'date')   payload[c.key] = el.value || null;
    else                          payload[c.key] = el.value.trim() || null;
  });
  try {
    var res;
    if (dbEditId) {
      res = await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + dbEditId, {
        method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(SUPA_URL + '/rest/v1/volontari', {
        method: 'POST', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(payload)
      });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await logAttivita(dbEditId ? 'ha modificato volontario (DB)' : 'ha aggiunto volontario (DB)');
    document.getElementById('dbRecordOverlay').classList.remove('open');
    caricaDb();
    caricaVolontari(); // aggiorna anche la vista normale
  } catch(e) { errEl.textContent = 'Errore: ' + e.message; errEl.style.display = 'block'; }
}

async function dbEliminaRecord() {
  if (!dbEditId) return;
  if (!confirm('Eliminare definitivamente questo volontario?')) return;
  await fetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + dbEditId, { method: 'DELETE', headers: H });
  await logAttivita('ha eliminato un volontario (DB)');
  document.getElementById('dbRecordOverlay').classList.remove('open');
  caricaDb();
  caricaVolontari();
}

// -- MEZZI --
var mezziData = [];
var mezzoCorrenteId = null;

var MEZZO_STATO_OPTIONS = ['OPERATIVO', 'IN MANUTENZIONE', 'FERMO'];

function getMezzoIcon(tipo) {
  var t = (tipo || '').toUpperCase();
  if (t.includes('FURGON') || t.includes('AUTOCARRO'))
    return '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
  if (t.includes('IDROVORA') || t.includes('POMPA'))
    return '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 22V12"/><path d="M8 12h8"/></svg>';
  if (t.includes('FARO') || t.includes('TORRE'))
    return '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  if (t.includes('CARRELLO') || t.includes('RIMORCHIO'))
    return '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><line x1="16" y1="9" x2="23" y2="9"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
  return '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
}

function getRevisioneStatus(dataStr) {
  if (!dataStr) return { cls:'', label:'—' };
  var d    = new Date(dataStr);
  var oggi = new Date();
  var diff = (d - oggi) / (1000 * 60 * 60 * 24);
  if (diff < 0)   return { cls:'scaduta', label:'Scaduta il ' + d.toLocaleDateString('it-IT') };
  if (diff < 60)  return { cls:'vicina',  label:'Scade il ' + d.toLocaleDateString('it-IT') };
  return { cls:'', label:'Revisione: ' + d.toLocaleDateString('it-IT') };
}

async function caricaMezzi() {
  var list = document.getElementById('mezziList');
  if (!list) return;
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    var res  = await fetch(SUPA_URL + '/rest/v1/mezzi?select=*&order=automezzo', { headers: H });
    mezziData = await res.json();
    renderMezzi();
  } catch(e) { list.innerHTML = '<div class="loading-msg">Errore caricamento.</div>'; }
}

function renderMezzi() {
  var list = document.getElementById('mezziList');
  if (!list) return;
  if (!mezziData.length) { list.innerHTML = '<div class="loading-msg">Nessun mezzo registrato.</div>'; return; }

  var html = '<div class="mezzi-grid">';
  mezziData.forEach(function(m) {
    var rev   = getRevisioneStatus(m.revisione);
    var revCls = rev.cls === 'scaduta' ? 'scad' : rev.cls === 'vicina' ? 'warn' : 'ok';
    var revLabel = m.revisione ? new Date(m.revisione).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    var sbCls  = m.stato === 'OPERATIVO' ? 'msb-ok' : m.stato === 'IN MANUTENZIONE' ? 'msb-warn' : 'msb-off';

    var fotoHtml = m.foto_url
      ? '<img src="' + m.foto_url + '" alt="' + m.automezzo + '">'
      : '<div class="mezzo-tile-placeholder">' + getMezzoIcon(m.automezzo).replace('viewBox', 'style="width:48px;height:48px;stroke:var(--testo-4);stroke-width:1.2;fill:none;stroke-linecap:round;stroke-linejoin:round" viewBox') + '</div>';

    html += '<div class="mezzo-tile" onclick="apriDettaglioMezzo(' + m.id + ')">'
      + '<div class="mezzo-tile-foto">'
      + fotoHtml
      + '<span class="mezzo-tile-stato ' + sbCls + '">' + (m.stato||'OPERATIVO') + '</span>'
      + '</div>'
      + '<div class="mezzo-tile-body">'
      + '<div class="mezzo-tile-nome">' + m.automezzo + '</div>'
      + '<div class="mezzo-tile-targa">' + (m.targa||'—') + '</div>'
      + (m.revisione ? '<div class="mezzo-tile-rev ' + revCls + '">Rev. ' + revLabel + '</div>' : '')
      + '</div>'
      + '</div>';
  });
  html += '</div>';
  list.innerHTML = html;
}

function apriDettaglioMezzo(id) {
  mezzoCorrenteId = id;
  var m    = mezziData.find(function(x){ return x.id === id; });
  if (!m) return;
  var detail = document.getElementById('mezzoDetail');
  var body   = document.getElementById('mezzoDetailBody');
  document.getElementById('mezzoDetailTitle').textContent = m.automezzo;
  detail.classList.add('open');
  detail.scrollTop = 0;

  var fmt = function(v) { return v ? '<span class="vol-field-value">' + v + '</span>' : '<span class="vol-field-value null">—</span>'; };
  var fmtDate = function(v) { return v ? fmt(new Date(v).toLocaleDateString('it-IT')) : fmt(null); };
  var rev = getRevisioneStatus(m.revisione);
  var sbCls = m.stato === 'OPERATIVO' ? 'msb-ok' : m.stato === 'IN MANUTENZIONE' ? 'msb-warn' : 'msb-off';

  var _fotoHtml = m.foto_url
    ? '<img src="' + m.foto_url + '" style="width:50px;height:50px;border-radius:12px;object-fit:cover;flex-shrink:0">'
    : '<div class="mezzo-icon" style="width:50px;height:50px;border-radius:12px">' + getMezzoIcon(m.automezzo) + '</div>';

  body.innerHTML = '<div class="vol-detail-hero">'
    + _fotoHtml
    + '<div><div class="vol-detail-name">' + m.automezzo + '</div>'
    + '<div class="vol-detail-role"><span class="mezzo-stato-badge ' + sbCls + '">' + (m.stato||'OPERATIVO') + '</span></div></div>'
    + '</div>'
    + '<div class="vol-section"><div class="vol-section-head">Identificazione</div><div class="vol-section-body">'
    + '<div class="vol-field"><span class="vol-field-label">Targa</span>' + fmt(m.targa) + '</div>'
    + '<div class="vol-field"><span class="vol-field-label">Marca</span>' + fmt(m.marca) + '</div>'
    + '<div class="vol-field"><span class="vol-field-label">Modello</span>' + fmt(m.modello) + '</div>'
    + '<div class="vol-field"><span class="vol-field-label">Immatricolazione</span>' + fmtDate(m.immatricolazione) + '</div>'
    + '</div></div>'
    + '<div class="vol-section"><div class="vol-section-head">Scadenze</div><div class="vol-section-body">'
    + '<div class="vol-field"><span class="vol-field-label">Revisione</span><span class="vol-field-value ' + rev.cls + '">' + (m.revisione ? new Date(m.revisione).toLocaleDateString('it-IT') : '—') + '</span></div>'
    + '<div class="vol-field"><span class="vol-field-label">Assicurazione</span>' + fmtDate(m.assicurazione) + '</div>'
    + '</div></div>'
    + (m.note ? '<div class="vol-section"><div class="vol-section-head">Note</div><div class="vol-section-body"><div class="vol-field"><span class="vol-field-value" style="text-align:left">' + m.note + '</span></div></div></div>' : '')
    + '<div class="vol-section">'
    + '<div class="vol-section-head" style="cursor:pointer" onclick="toggleMezzoDoc(' + m.id + ')">'
    + 'Documenti <span id="mezzoDocCount" style="font-size:0.6rem;color:var(--green);margin-left:4px"></span>'
    + '</div>'
    + '<div class="vol-section-body" id="mezzoDocBody"></div>'
    + '</div>'
    + '<button class="vol-delete-btn" onclick="eliminaMezzo()">elimina mezzo</button>';

  caricaDocMezzo(m.id);
}

function chiudiDettaglioMezzo() {
  document.getElementById('mezzoDetail').classList.remove('open');
  mezzoCorrenteId = null;
}

function apriFormMezzo(id) {
  mezzoCorrenteId = id;
  var panel = document.getElementById('mezzoFormPanel');
  var body  = document.getElementById('mezzoFormBody');
  document.getElementById('mezzoFormTitle').textContent = id ? 'Modifica mezzo' : 'Nuovo mezzo';

  var m = id ? (mezziData.find(function(x){ return x.id === id; }) || {}) : {};
  var statoOpts = MEZZO_STATO_OPTIONS.map(function(s){
    return '<option value="' + s + '"' + (m.stato === s ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  body.innerHTML = '<div class="form-err" id="mezzoFormErr"></div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Identificazione</div>'
    + '<div class="vol-form-grid">'
    + '<div class="vol-form-field full"><label class="vol-form-lbl">Nome mezzo *</label><input class="vol-form-inp" id="mfNome" value="' + (m.automezzo||'') + '" placeholder="es. FURGONE BIANCO"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Targa</label><input class="vol-form-inp" id="mfTarga" value="' + (m.targa||'') + '" style="text-transform:uppercase"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Stato</label><select class="vol-form-inp" id="mfStato">' + statoOpts + '</select></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Marca</label><input class="vol-form-inp" id="mfMarca" value="' + (m.marca||'') + '"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Modello</label><input class="vol-form-inp" id="mfModello" value="' + (m.modello||'') + '"></div>'
    + '</div></div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Scadenze</div>'
    + '<div class="vol-form-grid">'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Immatricolazione</label><input type="date" class="vol-form-inp" id="mfImm" value="' + (m.immatricolazione||'') + '"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Revisione</label><input type="date" class="vol-form-inp" id="mfRev" value="' + (m.revisione||'') + '"></div>'
    + '<div class="vol-form-field full"><label class="vol-form-lbl">Assicurazione</label><input type="date" class="vol-form-inp" id="mfAss" value="' + (m.assicurazione||'') + '"></div>'
    + '</div></div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Note</div>'
    + '<textarea class="vol-form-inp" id="mfNote" rows="3" style="resize:vertical">' + (m.note||'') + '</textarea>'
    + '</div>'
    + (id ? '<button class="vol-delete-btn" onclick="eliminaMezzo()">elimina mezzo</button>' : '');

  panel.classList.add('open');
  panel.scrollTop = 0;
}

function chiudiFormMezzo() {
  document.getElementById('mezzoFormPanel').classList.remove('open');
}

async function salvaMezzo() {
  var nome  = document.getElementById('mfNome').value.trim();
  var errEl = document.getElementById('mezzoFormErr');
  if (!nome) { errEl.textContent = 'Il nome del mezzo è obbligatorio.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  var payload = {
    automezzo:       nome,
    targa:           document.getElementById('mfTarga').value.trim().toUpperCase() || null,
    stato:           document.getElementById('mfStato').value,
    marca:           document.getElementById('mfMarca').value.trim() || null,
    modello:         document.getElementById('mfModello').value.trim() || null,
    immatricolazione:document.getElementById('mfImm').value || null,
    revisione:       document.getElementById('mfRev').value || null,
    assicurazione:   document.getElementById('mfAss').value || null,
    note:            document.getElementById('mfNote').value.trim() || null,
  };
  try {
    var res;
    if (mezzoCorrenteId) {
      res = await fetch(SUPA_URL + '/rest/v1/mezzi?id=eq.' + mezzoCorrenteId, { method:'PATCH', headers: Object.assign({},HJ,{'Prefer':'return=minimal'}), body: JSON.stringify(payload) });
    } else {
      res = await fetch(SUPA_URL + '/rest/v1/mezzi', { method:'POST', headers: Object.assign({},HJ,{'Prefer':'return=minimal'}), body: JSON.stringify(payload) });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await logAttivita((mezzoCorrenteId ? 'ha modificato' : 'ha aggiunto') + ' mezzo: ' + nome);
    chiudiFormMezzo();
    chiudiDettaglioMezzo();
    caricaMezzi();
  } catch(e) { errEl.textContent = 'Errore: ' + e.message; errEl.style.display = 'block'; }
}

async function eliminaMezzo() {
  if (!mezzoCorrenteId || !confirm('Eliminare questo mezzo?')) return;
  await fetch(SUPA_URL + '/rest/v1/mezzi?id=eq.' + mezzoCorrenteId, { method:'DELETE', headers: H });
  await logAttivita('ha eliminato un mezzo');
  chiudiFormMezzo();
  chiudiDettaglioMezzo();
  caricaMezzi();
}

// -- DOCUMENTI MEZZI --
var mezzoDocLoaded = false;

function toggleMezzoDoc(mezzoId) {
  var body = document.getElementById('mezzoDocBody');
  if (!body) return;
  if (body.style.display !== 'none') { body.style.display = 'none'; return; }
  body.style.display = 'block';
  caricaDocMezzo(mezzoId);
}

async function caricaDocMezzo(mezzoId) {
  var body  = document.getElementById('mezzoDocBody');
  var count = document.getElementById('mezzoDocCount');
  if (!body) return;
  body.style.display = 'block';
  try {
    var res  = await fetch(SUPA_URL + '/rest/v1/documenti_mezzi?mezzo_id=eq.' + mezzoId + '&select=*&order=data_carico.desc', { headers: H });
    var docs = await res.json();
    if (count) count.textContent = '(' + docs.length + ')';

    var DOC_MEZZO_LABEL = {
      'FOTO':'📷 Foto', 'LIBRETTO':'📋 Libretto', 'ASSICURAZIONE':'📄 Assicurazione',
      'REVISIONE':'🔧 Revisione', 'COLLAUDO':'📋 Collaudo', 'ALTRO':'📄 Altro'
    };

    var html = '';
    if (docs.length) {
      html += '<div class="doc-list">';
      docs.forEach(function(d) {
        var label = DOC_MEZZO_LABEL[d.tipo] || d.tipo;
        var data  = d.data_carico ? new Date(d.data_carico).toLocaleDateString('it-IT') : '—';
        html += '<div class="doc-item">'
          + '<span class="doc-item-icon">' + label.split(' ')[0] + '</span>'
          + '<div class="doc-item-info">'
          + '<div class="doc-item-name">' + d.nome_file + '</div>'
          + '<div class="doc-item-meta">' + label.replace(/^[^ ]+ /,'') + ' · ' + data + '</div>'
          + '</div>'
          + '<div class="doc-item-actions">'
          + '<a href="' + d.url + '" target="_blank" class="btn-sm btn-ok">apri</a>'
          + '<button class="btn-sm btn-danger" onclick="eliminaDocMezzo(' + d.id + ',' + mezzoId + ')">✕</button>'
          + '</div></div>';
      });
      html += '</div>';
    }
    html += '<button class="doc-add-btn" onclick="apriUploadDocMezzo(' + mezzoId + ')">+ aggiungi documento</button>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div style="font-size:0.72rem;color:var(--red);padding:0.3rem 0">Errore caricamento.</div>';
  }
}

async function eliminaDocMezzo(docId, mezzoId) {
  if (!confirm('Eliminare questo documento?')) return;
  await fetch(SUPA_URL + '/rest/v1/documenti_mezzi?id=eq.' + docId, { method:'DELETE', headers: H });
  await logAttivita('ha eliminato documento mezzo');
  caricaDocMezzo(mezzoId);
}

var mezzoUploadId = null;
var mezzoUploadFile = null;

function apriUploadDocMezzo(mezzoId) {
  mezzoUploadId   = mezzoId;
  mezzoUploadFile = null;
  var m = mezziData.find(function(x){ return x.id === mezzoId; });
  document.getElementById('mezzoUploadTitle').textContent = 'Carica documento — ' + (m ? m.automezzo : '');
  document.getElementById('mezzoUploadErr').style.display = 'none';
  document.getElementById('mezzoDropText').innerHTML = '📎 Tocca per selezionare il file<br><span style="font-size:0.62rem;opacity:0.6">PDF, JPG, PNG — max 10MB</span>';
  document.getElementById('mezzoFileInput').value = '';
  document.getElementById('mezzoUploadOverlay').classList.add('open');
}

function chiudiUploadDocMezzo() {
  document.getElementById('mezzoUploadOverlay').classList.remove('open');
}

function mezzoFileSelected(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 10*1024*1024) {
    document.getElementById('mezzoUploadErr').textContent = 'File troppo grande (max 10MB).';
    document.getElementById('mezzoUploadErr').style.display = 'block';
    return;
  }
  mezzoUploadFile = file;
  var txt = document.getElementById('mezzoDropText');
  if (txt) txt.textContent = '✓ ' + file.name + ' (' + (file.size/1024).toFixed(0) + ' KB)';
}

async function eseguiUploadDocMezzo() {
  if (!mezzoUploadFile || !mezzoUploadId) {
    document.getElementById('mezzoUploadErr').textContent = 'Seleziona un file.';
    document.getElementById('mezzoUploadErr').style.display = 'block';
    return;
  }
  var tipo    = document.getElementById('mezzoDocTipo').value;
  var nomeDoc = document.getElementById('mezzoDocNome').value.trim() || mezzoUploadFile.name;
  var path    = mezzoUploadId + '/' + tipo + '_' + Date.now() + '_' + mezzoUploadFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  var errEl   = document.getElementById('mezzoUploadErr');
  var btn     = document.getElementById('mezzoUploadBtn');
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'caricamento...';
  try {
    var uploadRes = await fetch(SUPA_URL + '/storage/v1/object/documenti-mezzi/' + path, {
      method:'POST', headers:{ 'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':mezzoUploadFile.type }, body:mezzoUploadFile
    });
    if (!uploadRes.ok) throw new Error('Errore upload storage');
    var url = SUPA_URL + '/storage/v1/object/public/documenti-mezzi/' + path;

    // Se è foto, aggiorna foto_url nel mezzo
    if (tipo === 'FOTO') {
      await fetch(SUPA_URL + '/rest/v1/mezzi?id=eq.' + mezzoUploadId, {
        method:'PATCH', headers:HJ, body:JSON.stringify({ foto_url: url })
      });
    }

    await fetch(SUPA_URL + '/rest/v1/documenti_mezzi', {
      method:'POST', headers:Object.assign({},HJ,{'Prefer':'return=minimal'}),
      body:JSON.stringify({ mezzo_id:mezzoUploadId, tipo:tipo, nome_file:nomeDoc, url:url })
    });
    await logAttivita('ha caricato documento mezzo: ' + nomeDoc);
    chiudiUploadDocMezzo();
    caricaDocMezzo(mezzoUploadId);
    caricaMezzi(); // aggiorna galleria con eventuale nuova foto
  } catch(e) { errEl.textContent = 'Errore: ' + e.message; errEl.style.display = 'block'; }
  btn.disabled = false; btn.textContent = 'carica';
}

// -- STATISTICHE --
var statsInterventi = [];
var statsChartTipo  = null;
var statsChartMesi  = null;

var TIPO_COLORS = {
  'EMERGENZA':'#c0392b','ESERCITAZIONE':'#185fa5','CORSI':'#3b6d11',
  'PREVENZIONE INFORTUNI':'#854f0b','RAPPRESENTANZA':'#534ab7',
  'ASSEMBLEE E RIUNIONI':'#0f6e56','CONTROLLO TERRITORIO':'#185fa5',
  'SEGRETERIA':'#5f5e5a','MAGAZZINO':'#854f0b'
};

async function caricaStatistiche() {
  var anno = document.getElementById('statsAnno').value;
  var url  = SUPA_URL + '/rest/v1/interventi?select=*&order=data';
  if (anno) url += '&data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31';
  var res = await fetch(url, { headers: H });
  statsInterventi = await res.json();
  renderStatCards();
  renderChartTipo();
  renderChartMesi(anno);
  renderOreTable();
}

async function initStatistiche() {
  // Popola anni disponibili
  var res   = await fetch(SUPA_URL + '/rest/v1/interventi?select=data&order=data', { headers: H });
  var dati  = await res.json();
  var anni  = [...new Set((dati||[]).map(function(d){ return d.data ? d.data.slice(0,4) : null; }).filter(Boolean))].sort().reverse();
  var sel   = document.getElementById('statsAnno');
  if (!sel) return;
  sel.innerHTML = anni.map(function(a){ return '<option value="'+a+'">'+a+'</option>'; }).join('');
  if (!anni.length) sel.innerHTML = '<option value="">Tutti</option>';
  await caricaStatistiche();
}

function renderStatCards() {
  var el = document.getElementById('statsCards');
  if (!el) return;
  var totInt  = statsInterventi.length;
  var totOre  = statsInterventi.reduce(function(s,i){ return s + parseFloat(i.n_ore||0); }, 0);
  var totVol  = statsInterventi.reduce(function(s,i){ return s + (i.n_volontari||0); }, 0);
  el.innerHTML = [
    ['Interventi', totInt, '#1a7a4a'],
    ['Ore totali', Math.round(totOre*10)/10, '#185fa5'],
    ['Presenze', totVol, '#854f0b']
  ].map(function(c){
    return '<div style="background:var(--bg-2);border-radius:var(--r);padding:0.7rem 0.8rem">'
      + '<div style="font-size:0.65rem;color:var(--testo-3);margin-bottom:2px">'+c[0]+'</div>'
      + '<div style="font-size:1.3rem;font-weight:600;color:'+c[2]+'">'+c[1]+'</div></div>';
  }).join('');
}

function renderChartTipo() {
  var ctx = document.getElementById('chartStatsTipo');
  if (!ctx) return;
  var contegg = {};
  statsInterventi.forEach(function(i){
    var t = i.tipo_attivita || 'ALTRO';
    contegg[t] = (contegg[t]||0) + 1;
  });
  var labels = Object.keys(contegg);
  var data   = labels.map(function(l){ return contegg[l]; });
  var colors = labels.map(function(l){ return TIPO_COLORS[l] || '#888'; });

  // Legenda
  var leg = document.getElementById('statsLegendaTipo');
  if (leg) leg.innerHTML = labels.map(function(l,i){
    return '<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:'+colors[i]+'"></span>'+l+' '+data[i]+'</span>';
  }).join('');

  if (statsChartTipo) statsChartTipo.destroy();
  statsChartTipo = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }
  });
}

function renderChartMesi(anno) {
  var ctx = document.getElementById('chartStatsMesi');
  if (!ctx) return;
  var mesi   = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  var counts = new Array(12).fill(0);
  statsInterventi.forEach(function(i){
    if (!i.data) return;
    var m = parseInt(i.data.slice(5,7)) - 1;
    if (m >= 0 && m < 12) counts[m]++;
  });
  var isDark = matchMedia('(prefers-color-scheme: dark)').matches;
  var grid   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  var txt    = isDark ? '#aaa' : '#666';
  if (statsChartMesi) statsChartMesi.destroy();
  statsChartMesi = new Chart(ctx, {
    type: 'bar',
    data: { labels: mesi, datasets: [{ data: counts, backgroundColor: '#1a7a4a', borderRadius: 4, label: 'Interventi' }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales: {
        x:{ ticks:{ color:txt, autoSkip:false, font:{size:10} }, grid:{ color:grid } },
        y:{ ticks:{ color:txt, font:{size:10} }, grid:{ color:grid }, beginAtZero:true }
      }
    }
  });
}

function renderOreTable() {
  var el = document.getElementById('statsOreTable');
  if (!el) return;
  // Raccogli ore per volontario dagli ID
  var volMap = {};
  statsInterventi.forEach(function(i){
    var oreT = parseFloat(i.n_ore||0);
    var nVol = (i.volontari_ids||[]).length || i.n_volontari || 1;
    var oreInd = nVol > 0 ? oreT / nVol : oreT;
    (i.volontari_ids||[]).forEach(function(vid){
      if (!volMap[vid]) volMap[vid] = { ore:0, count:0 };
      volMap[vid].ore   += oreInd;
      volMap[vid].count += 1;
    });
  });
  // Carica nomi volontari
  var ids = Object.keys(volMap);
  if (!ids.length) { el.innerHTML = '<div style="font-size:0.75rem;color:var(--testo-3)">Nessun dato.</div>'; return; }
  fetch(SUPA_URL + '/rest/v1/volontari?id=in.(' + ids.join(',') + ')&select=id,cognome,nome,codice_fiscale', { headers: H })
    .then(function(r){ return r.json(); })
    .then(function(vols){
      var rows = vols.map(function(v){
        var s = volMap[v.id] || { ore:0, count:0 };
        return { nome: v.cognome + ' ' + v.nome, ore: Math.round(s.ore*10)/10, count: s.count };
      }).sort(function(a,b){ return b.ore - a.ore; });

      var html = '<table style="width:100%;border-collapse:collapse;font-size:0.78rem">'
        + '<thead><tr style="border-bottom:0.5px solid var(--border)">'
        + '<th style="text-align:left;padding:5px 4px;color:var(--testo-3);font-weight:500">Volontario</th>'
        + '<th style="text-align:right;padding:5px 4px;color:var(--testo-3);font-weight:500">Interventi</th>'
        + '<th style="text-align:right;padding:5px 4px;color:var(--testo-3);font-weight:500">Ore</th>'
        + '</tr></thead><tbody>';
      rows.forEach(function(r, i){
        html += '<tr style="border-bottom:0.5px solid var(--border)">'
          + '<td style="padding:5px 4px;color:var(--testo)">' + (i+1) + '. ' + r.nome + '</td>'
          + '<td style="padding:5px 4px;text-align:right;color:var(--testo-2)">' + r.count + '</td>'
          + '<td style="padding:5px 4px;text-align:right;font-weight:500;color:var(--green)">' + r.ore + 'h</td>'
          + '</tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    });
}

async function stampaPDFStatistiche() {
  var anno  = document.getElementById('statsAnno').value || 'tutti gli anni';
  var oggi  = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' });
  var totInt = statsInterventi.length;
  var totOre = Math.round(statsInterventi.reduce(function(s,i){ return s+parseFloat(i.n_ore||0); },0)*10)/10;
  var totVol = statsInterventi.reduce(function(s,i){ return s+(i.n_volontari||0); },0);

  // Ore per volontario
  var volMap = {};
  statsInterventi.forEach(function(i){
    var oreT = parseFloat(i.n_ore||0);
    var nVol = (i.volontari_ids||[]).length || i.n_volontari || 1;
    var oreInd = nVol > 0 ? oreT / nVol : oreT;
    (i.volontari_ids||[]).forEach(function(vid){
      if (!volMap[vid]) volMap[vid] = { ore:0, count:0 };
      volMap[vid].ore += oreInd; volMap[vid].count++;
    });
  });
  var ids = Object.keys(volMap);
  var vols = ids.length ? await fetch(SUPA_URL+'/rest/v1/volontari?id=in.('+ids.join(',')+')&select=id,cognome,nome',{headers:H}).then(function(r){return r.json();}) : [];
  var rows = vols.map(function(v){
    var s = volMap[v.id]||{ore:0,count:0};
    return { nome:v.cognome+' '+v.nome, ore:Math.round(s.ore*10)/10, count:s.count };
  }).sort(function(a,b){ return b.ore-a.ore; });

  // Tipi
  var contegg = {};
  statsInterventi.forEach(function(i){ var t=i.tipo_attivita||'ALTRO'; contegg[t]=(contegg[t]||0)+1; });

  var win = window.open('','_blank');
  win.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<title>Statistiche Interventi ' + anno + '</title>'
    + '<style>body{font-family:Georgia,serif;font-size:10pt;color:#111;margin:2cm}'
    + 'h1{font-size:16pt;font-weight:700;color:#1a7a4a;margin:0 0 0.2rem}'
    + 'h2{font-size:11pt;font-weight:700;margin:1.2rem 0 0.5rem;padding-bottom:0.3rem;border-bottom:2px solid #1a7a4a;color:#1a7a4a}'
    + '.meta{font-size:9pt;color:#666;margin-bottom:1.2rem}'
    + '.stats{display:flex;gap:1rem;margin-bottom:1.2rem}'
    + '.stat{background:#f3f4f6;border-radius:8px;padding:0.6rem 1rem;text-align:center;flex:1}'
    + '.stat-num{font-size:1.4rem;font-weight:700;line-height:1}'
    + '.stat-lbl{font-size:8pt;color:#666;text-transform:uppercase}'
    + 'table{width:100%;border-collapse:collapse;font-size:9pt}'
    + 'th{text-align:left;padding:5px 8px;background:#1a7a4a;color:white;font-weight:700}'
    + 'td{padding:5px 8px;border-bottom:0.5px solid #e5e7eb}'
    + 'tr:nth-child(even) td{background:#f9fafb}'
    + '@media print{body{margin:1.5cm}.stat{-webkit-print-color-adjust:exact;print-color-adjust:exact}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '</style></head><body>'
    + '<h1>Statistiche Interventi — PC ANA Casale</h1>'
    + '<div class="meta">Anno: ' + anno + ' &nbsp;|&nbsp; Generato il ' + oggi + '</div>'
    + '<div class="stats">'
    + '<div class="stat"><div class="stat-num" style="color:#1a7a4a">'+totInt+'</div><div class="stat-lbl">Interventi</div></div>'
    + '<div class="stat"><div class="stat-num" style="color:#185fa5">'+totOre+'h</div><div class="stat-lbl">Ore totali</div></div>'
    + '<div class="stat"><div class="stat-num" style="color:#854f0b">'+totVol+'</div><div class="stat-lbl">Presenze</div></div>'
    + '</div>'
    + '<h2>Interventi per tipo</h2>'
    + '<table><thead><tr><th>Tipo attività</th><th style="text-align:right">N° interventi</th></tr></thead><tbody>'
    + Object.entries(contegg).sort(function(a,b){return b[1]-a[1];}).map(function(e,i){
        return '<tr><td>'+(i+1)+'. '+e[0]+'</td><td style="text-align:right">'+e[1]+'</td></tr>';
      }).join('')
    + '</tbody></table>'
    + '<h2>Ore per volontario</h2>'
    + '<table><thead><tr><th>Volontario</th><th style="text-align:right">Interventi</th><th style="text-align:right">Ore totali</th></tr></thead><tbody>'
    + rows.map(function(r,i){
        return '<tr><td>'+(i+1)+'. '+r.nome+'</td><td style="text-align:right">'+r.count+'</td><td style="text-align:right;font-weight:700;color:#1a7a4a">'+r.ore+'h</td></tr>';
      }).join('')
    + '</tbody></table>'
    + '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>'
    + '</body></html>');
  win.document.close();
}

// -- ESERCITAZIONE --
var esercGiorno = 'sabato';
var esercTurno  = 'mattino';
var esercScenarioCorrenteId = null;
var esercScenariData = [];
var esercVolontari = [];
var esercMezzi = [];
var esercPresenzeCache = {};
var esercEsterni = [];
var esercMezziCache = {};

var ESERC_TURNI = {
  sabato:   ['mattino','pomeriggio','sera'],
  domenica: ['mattino','pomeriggio']
};

async function initEsercitazione() {
  // Carica volontari e mezzi
  var [rV, rM] = await Promise.all([
    fetch(SUPA_URL + '/rest/v1/volontari?attivo=eq.true&select=id,cognome,nome&order=cognome', { headers: H }),
    fetch(SUPA_URL + '/rest/v1/mezzi?select=id,automezzo,targa,stato&order=automezzo', { headers: H })
  ]);
  esercVolontari = await rV.json();
  esercMezzi     = await rM.json();
  setGiornoEserc('sabato');
}

async function setGiornoEserc(giorno) {
  esercGiorno = giorno;
  esercTurno  = ESERC_TURNI[giorno][0];
  document.getElementById('tabSab').classList.toggle('active', giorno === 'sabato');
  document.getElementById('tabDom').classList.toggle('active', giorno === 'domenica');
  await caricaEsercDati();
}

async function caricaEsercDati() {
  // Presenze + esterni
  var [rP, rE] = await Promise.all([
    fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?giorno=eq.' + esercGiorno + '&select=*', { headers: H }),
    fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?giorno=eq.' + esercGiorno + '&tipo_partecipante=neq.volontario_pcana&select=*&order=cognome_esterno', { headers: H })
  ]);
  var presenze = await rP.json();
  var esterni  = await rE.json();
  esercPresenzeCache = {};
  presenze.forEach(function(p) {
    var key = p.volontario_id ? 'v'+p.volontario_id : 'e'+p.id;
    if (!esercPresenzeCache[key]) esercPresenzeCache[key] = {};
    esercPresenzeCache[key][p.turno] = p.presente;
  });
  // Deduplica esterni (solo le righe senza volontario_id)
  var visti = {};
  esercEsterni = [];
  esterni.forEach(function(p) {
    if (!p.volontario_id && !visti[p.id]) {
      visti[p.id] = true;
      esercEsterni.push(p);
    }
  });

  // Mezzi
  var rM2 = await fetch(SUPA_URL + '/rest/v1/esercitazione_mezzi?giorno=eq.' + esercGiorno + '&select=*', { headers: H });
  var mezziS = await rM2.json();
  esercMezziCache = {};
  mezziS.forEach(function(m) { esercMezziCache[m.mezzo_id] = m.stato; });

  // Scenari
  var rS = await fetch(SUPA_URL + '/rest/v1/esercitazione_scenari?giorno=eq.' + esercGiorno + '&select=*&order=created_at.desc', { headers: H });
  esercScenariData = await rS.json();

  renderEsercDashboard();
  renderEsercTurni();
  renderEsercPresenze();
  renderEsercMezzi();
  renderEsercScenari();
}

function renderEsercDashboard() {
  var el = document.getElementById('esercDashboard');
  if (!el) return;
  // Conta presenti nel turno corrente
  var presenti = esercVolontari.filter(function(v) {
    return esercPresenzeCache['v'+v.id] && esercPresenzeCache['v'+v.id][esercTurno];
  }).length;
  var mezziOp = esercMezzi.filter(function(m) {
    return (esercMezziCache[m.id] || 'disponibile') === 'disponibile';
  }).length;
  var scenariAttivi = esercScenariData.filter(function(s) { return s.stato === 'attivo'; }).length;

  el.innerHTML = [
    [presenti, 'Presenti', '#1a7a4a'],
    [mezziOp,  'Mezzi op.', '#185fa5'],
    [scenariAttivi, 'Interventi', '#854f0b']
  ].map(function(c) {
    return '<div class="eserc-dash-card"><div class="eserc-dash-num" style="color:'+c[2]+'">'+c[0]+'</div><div class="eserc-dash-lbl">'+c[1]+'</div></div>';
  }).join('');
}

function renderEsercTurni() {
  var el = document.getElementById('esercTurni');
  if (!el) return;
  var turni = ESERC_TURNI[esercGiorno];
  var tidx  = turni.indexOf(esercTurno);
  var html  = turni.map(function(t) {
    return '<button class="eserc-turno-btn'+(t===esercTurno?' active':'')+'" onclick="setTurnoEserc(\''+t+'\')">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>';
  }).join('');
  if (tidx > 0) {
    var prev = turni[tidx-1];
    html += '<button class="eserc-turno-btn" style="background:var(--bg-2);color:var(--testo-3);border-style:dashed;font-size:0.68rem" onclick="copiaTurnoPrecedente(\''+prev+'\')">↩ Da '+prev+'</button>';
  }
  el.innerHTML = html;
}

async function copiaTurnoPrecedente(turnoSrc) {
  var count = 0;
  var promises = [];

  // Copia volontari PC ANA
  esercVolontari.forEach(function(v) {
    var cacheKey = 'v'+v.id;
    var eraPresente = esercPresenzeCache[cacheKey] && esercPresenzeCache[cacheKey][turnoSrc];
    if (eraPresente) {
      if (!esercPresenzeCache[cacheKey]) esercPresenzeCache[cacheKey] = {};
      esercPresenzeCache[cacheKey][esercTurno] = true;
      count++;
      promises.push(
        fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?volontario_id=eq.'+v.id+'&giorno=eq.'+esercGiorno+'&turno=eq.'+esercTurno+'&select=id', { headers: H })
          .then(function(r){ return r.json(); })
          .then(function(existing) {
            if (existing.length) {
              return fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?id=eq.'+existing[0].id, {
                method: 'PATCH', headers: Object.assign({},HJ,{'Prefer':'return=minimal'}),
                body: JSON.stringify({ presente: true })
              });
            } else {
              return fetch(SUPA_URL + '/rest/v1/esercitazione_presenze', {
                method: 'POST', headers: Object.assign({},HJ,{'Prefer':'return=minimal'}),
                body: JSON.stringify({ volontario_id: v.id, giorno: esercGiorno, turno: esercTurno, presente: true, tipo_partecipante: 'volontario_pcana' })
              });
            }
          })
      );
    }
  });

  // Copia esterni
  esercEsterni.forEach(function(e) {
    var cacheKey = 'e'+e.id;
    var eraPresente = esercPresenzeCache[cacheKey] && esercPresenzeCache[cacheKey][turnoSrc];
    if (eraPresente) {
      if (!esercPresenzeCache[cacheKey]) esercPresenzeCache[cacheKey] = {};
      esercPresenzeCache[cacheKey][esercTurno] = true;
      count++;
      promises.push(
        fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?id=eq.'+e.id, {
          method: 'PATCH', headers: Object.assign({},HJ,{'Prefer':'return=minimal'}),
          body: JSON.stringify({ presente: true })
        })
      );
    }
  });

  await Promise.all(promises);
  renderEsercDashboard();
  renderEsercPresenze();
  if (count) alert(count + ' presenti copiati da ' + turnoSrc + ' a ' + esercTurno + '.');
}

function setTurnoEserc(turno) {
  esercTurno = turno;
  renderEsercTurni();
  renderEsercPresenze();
  renderEsercDashboard();
}

function renderEsercPresenze() {
  var el = document.getElementById('esercPresenzeList');
  if (!el) return;
  var html = '';

  // Volontari PC ANA
  esercVolontari.forEach(function(v) {
    var presente = !!(esercPresenzeCache['v'+v.id] && esercPresenzeCache['v'+v.id][esercTurno]);
    var ini = ((v.cognome||'')[0]||'?').toUpperCase();
    html += '<div class="eserc-vol-row">'
      + '<div class="eserc-vol-avatar" style="background:'+(presente?'var(--green)':'var(--bg-2)')+';color:'+(presente?'#fff':'var(--testo-3)')+'">'+ini+'</div>'
      + '<div style="flex:1;min-width:0"><div class="eserc-vol-nome">'+v.cognome+' '+v.nome+'</div><div style="font-size:0.62rem;color:var(--green)">PC ANA</div></div>'
      + '<input type="checkbox" class="eserc-vol-check" '+(presente?'checked':'')+' onchange="setPresenzaEserc(&quot;v'+v.id+'&quot;,this.checked,'+v.id+',null)">'
      + '</div>';
  });

  // Esterni e ospiti
  esercEsterni.forEach(function(e) {
    var presente = !!(esercPresenzeCache['e'+e.id] && esercPresenzeCache['e'+e.id][esercTurno]);
    var ini = ((e.cognome_esterno||'')[0]||'?').toUpperCase();
    var tipoLabel = e.tipo_partecipante === 'ospite' ? 'Ospite' : 'Esterno';
    var tipoColor = e.tipo_partecipante === 'ospite' ? '#854f0b' : '#185fa5';
    html += '<div class="eserc-vol-row">'
      + '<div class="eserc-vol-avatar" style="background:'+(presente?tipoColor:'var(--bg-2)')+';color:'+(presente?'#fff':'var(--testo-3)')+'">'+ini+'</div>'
      + '<div style="flex:1;min-width:0"><div class="eserc-vol-nome">'+(e.cognome_esterno||'')+' '+(e.nome_esterno||'')+'</div><div style="font-size:0.62rem;color:'+tipoColor+'">'+tipoLabel+'</div></div>'
      + '<button class="btn-sm btn-danger" onclick="eliminaEsterno('+e.id+')" style="padding:2px 7px;font-size:0.65rem">✕</button>'
      + '<input type="checkbox" class="eserc-vol-check" '+(presente?'checked':'')+' onchange="setPresenzaEserc(&quot;e'+e.id+'&quot;,this.checked,null,'+e.id+')">'
      + '</div>';
  });

  html += '<button onclick="apriFormEsterno()" style="width:100%;margin-top:0.6rem;padding:0.6rem;background:var(--bg-2);border:0.5px dashed var(--border);border-radius:var(--r);color:var(--testo-3);font-size:0.78rem;cursor:pointer;font-family:var(--font)">+ Aggiungi esterno / ospite</button>';

  el.innerHTML = html || '<div class="loading-msg">Nessun volontario.</div>';
}

async function setPresenzaEserc(key, presente, volId, esternoId) {
  if (!esercPresenzeCache[key]) esercPresenzeCache[key] = {};
  esercPresenzeCache[key][esercTurno] = presente;
  try {
    if (volId) {
      // Controlla se esiste già una riga
      var checkRes = await fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?volontario_id=eq.'+volId+'&giorno=eq.'+esercGiorno+'&turno=eq.'+esercTurno+'&select=id', { headers: H });
      var existing = await checkRes.json();
      if (existing.length) {
        // Aggiorna riga esistente
        await fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?id=eq.'+existing[0].id, {
          method: 'PATCH',
          headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
          body: JSON.stringify({ presente: presente })
        });
      } else {
        // Inserisci nuova riga
        await fetch(SUPA_URL + '/rest/v1/esercitazione_presenze', {
          method: 'POST',
          headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
          body: JSON.stringify({ volontario_id: volId, giorno: esercGiorno, turno: esercTurno, presente: presente, tipo_partecipante: 'volontario_pcana' })
        });
      }
    } else if (esternoId) {
      // PATCH per aggiornare presente su riga esistente
      await fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?id=eq.' + esternoId, {
        method: 'PATCH',
        headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ presente: presente })
      });
    }
  } catch(e) {}
  renderEsercDashboard();
  renderEsercPresenze();
}

async function eliminaEsterno(id) {
  if (!confirm('Rimuovere questo partecipante?')) return;
  await fetch(SUPA_URL+'/rest/v1/esercitazione_presenze?id=eq.'+id, { method:'DELETE', headers:H });
  await caricaEsercDati();
}

function apriFormEsterno() {
  document.getElementById('esercEsternoOverlay').classList.add('open');
  document.getElementById('eeNome').value = '';
  document.getElementById('eeCognome').value = '';
  document.getElementById('eeTipo').value = 'volontario_esterno';
  document.getElementById('eeErr').style.display = 'none';
}

function chiudiFormEsterno() {
  document.getElementById('esercEsternoOverlay').classList.remove('open');
}

async function salvaEsterno() {
  var nome    = document.getElementById('eeNome').value.trim();
  var cognome = document.getElementById('eeCognome').value.trim();
  var tipo    = document.getElementById('eeTipo').value;
  var errEl   = document.getElementById('eeErr');
  if (!nome || !cognome) { errEl.textContent='Nome e cognome obbligatori.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  try {
    await fetch(SUPA_URL+'/rest/v1/esercitazione_presenze', {
      method:'POST', headers:Object.assign({},HJ,{'Prefer':'return=minimal'}),
      body: JSON.stringify({ nome_esterno:nome, cognome_esterno:cognome, tipo_partecipante:tipo, giorno:esercGiorno, turno:esercTurno, presente:true })
    });
    chiudiFormEsterno();
    await caricaEsercDati();
  } catch(e) { errEl.textContent='Errore: '+e.message; errEl.style.display='block'; }
}

function renderEsercMezzi() {
  var el = document.getElementById('esercMezziList');
  if (!el) return;
  var html = '';
  var STATI = ['disponibile','impegnato','fermo'];
  var STATI_COLORS = { disponibile:'var(--green)', impegnato:'var(--amber)', fermo:'var(--red)' };
  esercMezzi.forEach(function(m) {
    var stato = esercMezziCache[m.id] || 'disponibile';
    var opts = STATI.map(function(s) {
      return '<option value="'+s+'"'+(s===stato?' selected':'')+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>';
    }).join('');
    html += '<div class="eserc-mezzo-row">'
      + '<div style="width:10px;height:10px;border-radius:50%;background:'+STATI_COLORS[stato]+';flex-shrink:0"></div>'
      + '<div style="flex:1;font-size:0.82rem;font-weight:500;color:var(--testo)">'+m.automezzo+'</div>'
      + '<div style="font-size:0.65rem;color:var(--testo-3)">'+m.targa+'</div>'
      + '<select style="font-size:0.72rem;padding:3px 6px;border-radius:8px;border:0.5px solid var(--border);background:var(--bg-2);color:var(--testo);font-family:var(--font)" onchange="setStatoMezzoEserc('+m.id+',this.value)">'+opts+'</select>'
      + '</div>';
  });
  el.innerHTML = html;
}

async function setStatoMezzoEserc(mezzoId, stato) {
  esercMezziCache[mezzoId] = stato;
  try {
    await fetch(SUPA_URL + '/rest/v1/esercitazione_mezzi', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ mezzo_id: mezzoId, giorno: esercGiorno, stato: stato })
    });
  } catch(e) {}
  renderEsercDashboard();
}

function renderEsercScenari() {
  var el = document.getElementById('esercScenariList');
  if (!el) return;
  if (!esercScenariData.length) { el.innerHTML = '<div class="loading-msg">Nessuno scenario.</div>'; return; }
  el.innerHTML = esercScenariData.map(function(s) {
    var badgeCls = 'esb-' + s.stato;
    return '<div class="eserc-scenario-card" onclick="apriDettaglioScenario('+s.id+')">'
      + '<div class="eserc-scenario-nome">'+s.nome+'</div>'
      + '<div class="eserc-scenario-meta">'+(s.turno||'—')+' · '+(s.orario||'—')+'</div>'
      + '<span class="eserc-stato-badge '+badgeCls+'">'+s.stato.charAt(0).toUpperCase()+s.stato.slice(1)+'</span>'
      + '</div>';
  }).join('');
}

function toggleEsercSection(id) {
  // Carica pasti al primo apertura
  if (id === 'esercPastiBody' && !esercPastiData.length) caricaPasti();
  var body  = document.getElementById(id);
  var arrow = document.getElementById('arrow' + id.charAt(0).toUpperCase() + id.slice(1));
  if (!body) return;
  body.classList.toggle('hidden');
  if (arrow) arrow.textContent = body.classList.contains('hidden') ? '▶' : '▼';
}

// -- FORM SCENARIO --
var esercScenarioEditId = null;

function apriFormScenario(id) {
  esercScenarioEditId = id || null;
  var panel = document.getElementById('esercScenarioForm');
  var body  = document.getElementById('esercFormBody');
  document.getElementById('esercFormTitle').textContent = id ? 'Modifica scenario' : 'Nuovo scenario';

  var s = id ? (esercScenariData.find(function(x){ return x.id === id; }) || {}) : {};
  var turni = ESERC_TURNI[esercGiorno];
  var turnoOpts = turni.map(function(t) {
    return '<option value="'+t+'"'+(s.turno===t?' selected':'')+'>'+t.charAt(0).toUpperCase()+t.slice(1)+'</option>';
  }).join('');
  var statoOpts = ['preparazione','attivo','concluso'].map(function(st) {
    return '<option value="'+st+'"'+((s.stato||'preparazione')===st?' selected':'')+'>'+st.charAt(0).toUpperCase()+st.slice(1)+'</option>';
  }).join('');

  // Lista presenti in qualsiasi turno del giorno
  var presenti = esercVolontari.filter(function(v) {
    var cache = esercPresenzeCache['v'+v.id] || {};
    return Object.values(cache).some(function(p){ return p; });
  });
  var volHtml = presenti.length
    ? presenti.map(function(v) {
        return '<label style="display:flex;align-items:center;gap:0.5rem;padding:4px 0;font-size:0.78rem;cursor:pointer">'
          + '<input type="checkbox" class="eserc-vol-scenario-cb" value="'+v.id+'" style="accent-color:var(--green)"> '
          + v.cognome + ' ' + v.nome + '</label>';
      }).join('')
    : '<div style="font-size:0.72rem;color:var(--testo-3)">Nessun volontario presente in questo turno.</div>';

  var mezziDisp = esercMezzi.filter(function(m) {
    return (esercMezziCache[m.id] || 'disponibile') === 'disponibile';
  });
  var mezziHtml = mezziDisp.length
    ? mezziDisp.map(function(m) {
        return '<label style="display:flex;align-items:center;gap:0.5rem;padding:4px 0;font-size:0.78rem;cursor:pointer">'
          + '<input type="checkbox" class="eserc-mezzo-scenario-cb" value="'+m.id+'" style="accent-color:var(--green)"> '
          + m.automezzo + ' · ' + m.targa + '</label>';
      }).join('')
    : '<div style="font-size:0.72rem;color:var(--testo-3)">Nessun mezzo disponibile.</div>';

  body.innerHTML = '<div class="form-err" id="esercFormErr"></div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Scenario</div><div class="vol-form-grid">'
    + '<div class="vol-form-field full"><label class="vol-form-lbl">Nome *</label><input class="vol-form-inp" id="esfNome" value="'+(s.nome||'')+'"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Turno</label><select class="vol-form-inp" id="esfTurno">'+turnoOpts+'</select></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Orario</label><input class="vol-form-inp" id="esfOrario" value="'+(s.orario||'')+'" placeholder="es. 09:00"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Stato</label><select class="vol-form-inp" id="esfStato">'+statoOpts+'</select></div>'
    + '</div></div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Localizzazione</div><div class="vol-form-grid">'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Latitudine</label><input class="vol-form-inp" id="esfLat" value="'+(s.lat||'')+'" placeholder="es. 45.1234"></div>'
    + '<div class="vol-form-field"><label class="vol-form-lbl">Longitudine</label><input class="vol-form-inp" id="esfLng" value="'+(s.lng||'')+'" placeholder="es. 8.5678"></div>'
    + '</div></div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Descrizione e attività</div>'
    + '<textarea class="vol-form-inp" id="esfDesc" rows="3" style="resize:vertical;margin-bottom:0.5rem" placeholder="Descrizione scenario...">'+(s.descrizione||'')+'</textarea>'
    + '<textarea class="vol-form-inp" id="esfAttivita" rows="3" style="resize:vertical" placeholder="Attività da svolgere...">'+(s.attivita||'')+'</textarea>'
    + '</div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Volontari assegnati</div>'+volHtml+'</div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Mezzi assegnati</div>'+mezziHtml+'</div>'
    + '<div class="vol-form-section"><div class="vol-form-section-title">Note</div>'
    + '<textarea class="vol-form-inp" id="esfNote" rows="2" style="resize:vertical">'+(s.note||'')+'</textarea>'
    + '</div>'
    + (id ? '<button class="vol-delete-btn" onclick="eliminaScenario('+id+')">elimina scenario</button>' : '');

  panel.classList.add('open');
  panel.scrollTop = 0;

  // Se modifica, precarica volontari e mezzi selezionati
  if (id) precaricaScenarioSel(id);
}

async function precaricaScenarioSel(id) {
  var [rV, rM] = await Promise.all([
    fetch(SUPA_URL + '/rest/v1/esercitazione_scenari_vol?scenario_id=eq.'+id+'&select=volontario_id', { headers: H }),
    fetch(SUPA_URL + '/rest/v1/esercitazione_scenari_mezzi?scenario_id=eq.'+id+'&select=mezzo_id', { headers: H })
  ]);
  var vols  = await rV.json();
  var mezzi = await rM.json();
  var volIds  = vols.map(function(v){ return String(v.volontario_id); });
  var mezIds  = mezzi.map(function(m){ return String(m.mezzo_id); });
  document.querySelectorAll('.eserc-vol-scenario-cb').forEach(function(cb) {
    cb.checked = volIds.includes(cb.value);
  });
  document.querySelectorAll('.eserc-mezzo-scenario-cb').forEach(function(cb) {
    cb.checked = mezIds.includes(cb.value);
  });
}

function chiudiFormScenario() {
  document.getElementById('esercScenarioForm').classList.remove('open');
}

async function salvaScenario() {
  var nome = document.getElementById('esfNome').value.trim();
  var errEl = document.getElementById('esercFormErr');
  if (!nome) { errEl.textContent = 'Il nome è obbligatorio.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  var payload = {
    nome, giorno: esercGiorno,
    turno:       document.getElementById('esfTurno').value,
    orario:      document.getElementById('esfOrario').value.trim() || null,
    stato:       document.getElementById('esfStato').value,
    lat:         document.getElementById('esfLat').value.trim() || null,
    lng:         document.getElementById('esfLng').value.trim() || null,
    descrizione: document.getElementById('esfDesc').value.trim() || null,
    attivita:    document.getElementById('esfAttivita').value.trim() || null,
    note:        document.getElementById('esfNote').value.trim() || null,
  };

  var volIds  = [...document.querySelectorAll('.eserc-vol-scenario-cb:checked')].map(function(cb){ return parseInt(cb.value); });
  var mezIds  = [...document.querySelectorAll('.eserc-mezzo-scenario-cb:checked')].map(function(cb){ return parseInt(cb.value); });

  try {
    var sid;
    if (esercScenarioEditId) {
      await fetch(SUPA_URL + '/rest/v1/esercitazione_scenari?id=eq.'+esercScenarioEditId, {
        method:'PATCH', headers:Object.assign({},HJ,{'Prefer':'return=minimal'}), body:JSON.stringify(payload)
      });
      sid = esercScenarioEditId;
      // Cancella e reinserisce assegnazioni
      await Promise.all([
        fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_vol?scenario_id=eq.'+sid, { method:'DELETE', headers:H }),
        fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_mezzi?scenario_id=eq.'+sid, { method:'DELETE', headers:H })
      ]);
    } else {
      var res = await fetch(SUPA_URL + '/rest/v1/esercitazione_scenari', {
        method:'POST', headers:Object.assign({},HJ,{'Prefer':'return=representation'}), body:JSON.stringify(payload)
      });
      var data = await res.json();
      sid = data[0].id;
    }
    // Inserisce volontari e mezzi
    if (volIds.length) await fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_vol', {
      method:'POST', headers:HJ, body:JSON.stringify(volIds.map(function(v){ return {scenario_id:sid, volontario_id:v}; }))
    });
    if (mezIds.length) await fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_mezzi', {
      method:'POST', headers:HJ, body:JSON.stringify(mezIds.map(function(m){ return {scenario_id:sid, mezzo_id:m}; }))
    });
    await logAttivita('ha salvato scenario: ' + nome);
    chiudiFormScenario();
    await caricaEsercDati();
  } catch(e) { errEl.textContent = 'Errore: '+e.message; errEl.style.display='block'; }
}

async function eliminaScenario(id) {
  if (!confirm('Eliminare questo scenario?')) return;
  await fetch(SUPA_URL+'/rest/v1/esercitazione_scenari?id=eq.'+id, { method:'DELETE', headers:H });
  chiudiFormScenario();
  chiudiDettaglioScenario();
  await caricaEsercDati();
}

// -- DETTAGLIO SCENARIO --
async function apriDettaglioScenario(id) {
  esercScenarioCorrenteId = id;
  var s = esercScenariData.find(function(x){ return x.id === id; });
  if (!s) return;
  var detail = document.getElementById('esercScenarioDetail');
  document.getElementById('esercDetailTitle').textContent = s.nome;
  detail.classList.add('open');
  detail.scrollTop = 0;

  var [rV, rM] = await Promise.all([
    fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_vol?scenario_id=eq.'+id+'&select=volontario_id', { headers:H }),
    fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_mezzi?scenario_id=eq.'+id+'&select=mezzo_id', { headers:H })
  ]);
  var volIds  = (await rV.json()).map(function(v){ return v.volontario_id; });
  var mezIds  = (await rM.json()).map(function(m){ return m.mezzo_id; });
  var volNomi = esercVolontari.filter(function(v){ return volIds.includes(v.id); });
  var mezNomi = esercMezzi.filter(function(m){ return mezIds.includes(m.id); });
  var badgeCls = 'esb-' + s.stato;

  var body = document.getElementById('esercDetailBody');
  var mapsUrl = (s.lat && s.lng) ? 'https://maps.google.com/?q='+s.lat+','+s.lng : null;

  body.innerHTML = '<div class="vol-section"><div class="vol-section-body">'
    + '<div class="vol-field"><span class="vol-field-label">Stato</span><span class="eserc-stato-badge '+badgeCls+'">'+s.stato+'</span></div>'
    + '<div class="vol-field"><span class="vol-field-label">Giorno</span><span class="vol-field-value">'+s.giorno.charAt(0).toUpperCase()+s.giorno.slice(1)+'</span></div>'
    + '<div class="vol-field"><span class="vol-field-label">Turno</span><span class="vol-field-value">'+(s.turno||'—')+'</span></div>'
    + '<div class="vol-field"><span class="vol-field-label">Orario</span><span class="vol-field-value">'+(s.orario||'—')+'</span></div>'
    + (mapsUrl ? '<div class="vol-field"><span class="vol-field-label">Coordinate</span><a href="'+mapsUrl+'" target="_blank" style="color:var(--green);font-size:0.78rem">📍 Apri su Maps</a></div>' : '')
    + (s.descrizione ? '<div class="vol-field" style="flex-direction:column;align-items:flex-start"><span class="vol-field-label">Descrizione</span><span class="vol-field-value" style="margin-top:4px">'+s.descrizione+'</span></div>' : '')
    + (s.attivita ? '<div class="vol-field" style="flex-direction:column;align-items:flex-start"><span class="vol-field-label">Attività</span><span class="vol-field-value" style="margin-top:4px">'+s.attivita+'</span></div>' : '')
    + '</div></div>'
    + '<div class="vol-section"><div class="vol-section-head">Volontari ('+volNomi.length+')</div><div class="vol-section-body">'
    + (volNomi.length ? volNomi.map(function(v){ return '<div class="vol-field"><span class="vol-field-value">'+v.cognome+' '+v.nome+'</span></div>'; }).join('') : '<div style="font-size:0.72rem;color:var(--testo-3)">Nessuno assegnato.</div>')
    + '</div></div>'
    + '<div class="vol-section"><div class="vol-section-head">Mezzi ('+mezNomi.length+')</div><div class="vol-section-body">'
    + (mezNomi.length ? mezNomi.map(function(m){ return '<div class="vol-field"><span class="vol-field-value">'+m.automezzo+' · '+m.targa+'</span></div>'; }).join('') : '<div style="font-size:0.72rem;color:var(--testo-3)">Nessuno assegnato.</div>')
    + '</div></div>'
    + (s.note ? '<div class="vol-section"><div class="vol-section-head">Note</div><div class="vol-section-body"><div class="vol-field"><span class="vol-field-value">'+s.note+'</span></div></div></div>' : '')
    + '<button class="btn-primary" style="width:100%;margin-top:0.5rem" onclick="stampaSchedaIntervento('+id+')">📄 Stampa scheda</button>'
    + '<button class="vol-delete-btn" onclick="eliminaScenario('+id+')">elimina scenario</button>';
}

function chiudiDettaglioScenario() {
  document.getElementById('esercScenarioDetail').classList.remove('open');
  esercScenarioCorrenteId = null;
}

async function stampaSchedaIntervento(id) {
  var s = esercScenariData.find(function(x){ return x.id === id; });
  if (!s) return;
  var [rV, rM] = await Promise.all([
    fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_vol?scenario_id=eq.'+id+'&select=volontario_id', { headers:H }),
    fetch(SUPA_URL+'/rest/v1/esercitazione_scenari_mezzi?scenario_id=eq.'+id+'&select=mezzo_id', { headers:H })
  ]);
  var volIds = (await rV.json()).map(function(v){ return v.volontario_id; });
  var mezIds = (await rM.json()).map(function(m){ return m.mezzo_id; });
  var volNomi = esercVolontari.filter(function(v){ return volIds.includes(v.id); });
  var mezNomi = esercMezzi.filter(function(m){ return mezIds.includes(m.id); });
  var ora    = new Date().toLocaleString('it-IT');
  var giorno = s.giorno.charAt(0).toUpperCase()+s.giorno.slice(1);
  var mapsUrl = (s.lat && s.lng) ? 'https://maps.google.com/?q='+s.lat+','+s.lng : null;

  var win = window.open('','_blank');
  win.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<title>Scheda Intervento — '+s.nome+'</title>'
    + '<style>'
    + 'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;margin:1.5cm;max-width:18cm}'
    + '.header{display:flex;align-items:center;gap:1rem;border-bottom:3px solid #1a7a4a;padding-bottom:0.8rem;margin-bottom:1rem}'
    + '.header-title{flex:1}'
    + 'h1{font-size:14pt;color:#1a7a4a;margin:0 0 0.2rem}'
    + '.meta{font-size:8pt;color:#666}'
    + '.badge{display:inline-block;padding:3px 10px;border-radius:10px;font-size:8pt;font-weight:700;background:#eaf3de;color:#3b6d11}'
    + 'h2{font-size:10pt;font-weight:700;color:#1a7a4a;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:1rem 0 0.5rem}'
    + 'table{width:100%;border-collapse:collapse;font-size:9pt}'
    + 'td{padding:4px 8px;border:0.5px solid #e5e7eb}'
    + 'td:first-child{font-weight:600;color:#555;width:35%}'
    + '.vol-list{list-style:none;padding:0;margin:0}'
    + '.vol-list li{padding:4px 0;border-bottom:0.5px solid #f3f4f6;font-size:9pt}'
    + '.firma-box{margin-top:2rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem}'
    + '.firma-line{border-top:0.5px solid #111;padding-top:4px;font-size:8pt;color:#666;text-align:center;margin-top:2rem}'
    + '@media print{body{margin:1cm}}'
    + '</style></head><body>'
    + '<div class="header">'
    + '<div class="header-title">'
    + '<h1>Scheda Intervento — Esercitazione 2025</h1>'
    + '<div class="meta">PC ANA Casale Monferrato &nbsp;·&nbsp; Stampata il '+ora+'</div>'
    + '</div>'
    + '<span class="badge">'+s.stato.toUpperCase()+'</span>'
    + '</div>'
    + '<h2>Dati scenario</h2>'
    + '<table><tbody>'
    + '<tr><td>Nome</td><td>'+s.nome+'</td></tr>'
    + '<tr><td>Giorno</td><td>'+giorno+' 6-7 Giugno 2025</td></tr>'
    + '<tr><td>Turno</td><td>'+(s.turno||'—')+'</td></tr>'
    + '<tr><td>Orario</td><td>'+(s.orario||'—')+'</td></tr>'
    + (mapsUrl ? '<tr><td>Coordinate</td><td>Lat: '+s.lat+' · Lng: '+s.lng+'<br><small>'+mapsUrl+'</small></td></tr>' : '')
    + '</tbody></table>'
    + (s.descrizione ? '<h2>Descrizione</h2><p style="font-size:9pt">'+s.descrizione+'</p>' : '')
    + (s.attivita ? '<h2>Attività da svolgere</h2><p style="font-size:9pt">'+s.attivita+'</p>' : '')
    + '<h2>Volontari assegnati ('+volNomi.length+')</h2>'
    + '<ul class="vol-list">'+(volNomi.length ? volNomi.map(function(v,i){ return '<li>'+(i+1)+'. '+v.cognome+' '+v.nome+'</li>'; }).join('') : '<li>Nessuno</li>')+'</ul>'
    + '<h2>Mezzi assegnati ('+mezNomi.length+')</h2>'
    + '<ul class="vol-list">'+(mezNomi.length ? mezNomi.map(function(m,i){ return '<li>'+(i+1)+'. '+m.automezzo+' · '+m.targa+'</li>'; }).join('') : '<li>Nessuno</li>')+'</ul>'
    + (s.note ? '<h2>Note</h2><p style="font-size:9pt">'+s.note+'</p>' : '')
    + '<div class="firma-box">'
    + '<div><div class="firma-line">Responsabile scenario</div></div>'
    + '<div><div class="firma-line">Coordinatore esercitazione</div></div>'
    + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>'
    + '</body></html>');
  win.document.close();
}

// -- PASTI ESERCITAZIONE --
var esercPastiData = [];
var esercPastiFiltro = 'tutti';

async function caricaPasti() {
  var res = await fetch(SUPA_URL + '/rest/v1/esercitazione_pasti?select=*&order=cognome', { headers: H });
  esercPastiData = await res.json();
  renderPastiStats();
  renderPastiList();
}

function renderPastiStats() {
  var el = document.getElementById('esercPastiStats');
  if (!el) return;
  var pranzo = esercPastiData.filter(function(p){ return p.sabato_pranzo; }).length;
  var cena   = esercPastiData.filter(function(p){ return p.sabato_cena; }).length;
  var tot    = esercPastiData.length;
  el.innerHTML = [
    [tot,    'Totale',  '#1a7a4a'],
    [pranzo, 'Pranzo',  '#185fa5'],
    [cena,   'Cena',    '#854f0b']
  ].map(function(c) {
    return '<div class="eserc-dash-card"><div class="eserc-dash-num" style="color:'+c[2]+'">'+c[0]+'</div><div class="eserc-dash-lbl">'+c[1]+'</div></div>';
  }).join('');
}

function filtraPasti(filtro) {
  esercPastiFiltro = filtro;
  ['Tutti','Esterni','Ospiti'].forEach(function(f) {
    var btn = document.getElementById('pastiFiltro'+f);
    if (btn) btn.classList.toggle('active', filtro === f.toLowerCase());
  });
  renderPastiList();
}

function renderPastiList() {
  var el = document.getElementById('esercPastiList');
  if (!el) return;
  var dati = esercPastiData;
  if (esercPastiFiltro === 'esterni') dati = dati.filter(function(p){ return p.tipo === 'volontario_esterno'; });
  if (esercPastiFiltro === 'ospiti')  dati = dati.filter(function(p){ return p.tipo === 'ospite'; });

  if (!dati.length) { el.innerHTML = '<div class="loading-msg">Nessun partecipante.</div>'; return; }

  var TIPO_LABEL = { volontario_pcana:'PC ANA', volontario_esterno:'Esterno', ospite:'Ospite' };
  var TIPO_COLOR = { volontario_pcana:'var(--green)', volontario_esterno:'#185fa5', ospite:'#854f0b' };

  el.innerHTML = dati.map(function(p) {
    return '<div class="eserc-pasto-row">'
      + '<div class="eserc-pasto-info">'
      + '<div class="eserc-pasto-nome">'+p.cognome+' '+p.nome+'</div>'
      + '<div class="eserc-pasto-tipo" style="color:'+TIPO_COLOR[p.tipo]+'">'+TIPO_LABEL[p.tipo]+'</div>'
      + '</div>'
      + '<div class="eserc-pasto-checks">'
      + '<div class="eserc-pasto-check"><span style="font-size:1rem">'+(p.sabato_pranzo?'🍽️':'○')+'</span><span>Pranzo</span></div>'
      + '<div class="eserc-pasto-check"><span style="font-size:1rem">'+(p.sabato_cena?'🌙':'○')+'</span><span>Cena</span></div>'
      + '</div>'
      + '<button class="btn-sm btn-ok" onclick="apriFormPasto('+p.id+')" style="padding:3px 8px">✏</button>'
      + '<button class="btn-sm btn-danger" onclick="eliminaPartecipante('+p.id+')" style="padding:3px 8px">✕</button>'
      + '</div>';
  }).join('');
}

function apriFormPasto(id) {
  var p = id ? esercPastiData.find(function(x){ return x.id === id; }) : {};
  document.getElementById('esercPastoTitle').textContent = id ? 'Modifica partecipante' : 'Aggiungi partecipante';
  document.getElementById('esercPastoId').value = id || '';
  document.getElementById('ppCognome').value = p.cognome || '';
  document.getElementById('ppNome').value    = p.nome    || '';
  document.getElementById('ppTipo').value    = p.tipo    || 'volontario_pcana';
  document.getElementById('ppCF').value      = p.codice_fiscale || '';
  document.getElementById('ppPranzo').checked = p.sabato_pranzo || false;
  document.getElementById('ppCena').checked   = p.sabato_cena   || false;
  document.getElementById('ppNote').value    = p.note    || '';
  document.getElementById('esercPastoErr').style.display = 'none';
  document.getElementById('esercPastoOverlay').classList.add('open');
}

function chiudiFormPasto() {
  document.getElementById('esercPastoOverlay').classList.remove('open');
}

async function salvaPartecipantePasto() {
  var cognome = document.getElementById('ppCognome').value.trim();
  var nome    = document.getElementById('ppNome').value.trim();
  var errEl   = document.getElementById('esercPastoErr');
  if (!cognome || !nome) { errEl.textContent = 'Cognome e nome obbligatori.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  var payload = {
    cognome, nome,
    tipo:           document.getElementById('ppTipo').value,
    codice_fiscale: document.getElementById('ppCF').value.trim().toUpperCase() || null,
    sabato_pranzo:  document.getElementById('ppPranzo').checked,
    sabato_cena:    document.getElementById('ppCena').checked,
    note:           document.getElementById('ppNote').value.trim() || null,
  };
  var id = document.getElementById('esercPastoId').value;
  try {
    if (id) {
      await fetch(SUPA_URL+'/rest/v1/esercitazione_pasti?id=eq.'+id, { method:'PATCH', headers:HJ, body:JSON.stringify(payload) });
    } else {
      await fetch(SUPA_URL+'/rest/v1/esercitazione_pasti', { method:'POST', headers:HJ, body:JSON.stringify(payload) });
    }
    chiudiFormPasto();
    await caricaPasti();
  } catch(e) { errEl.textContent='Errore: '+e.message; errEl.style.display='block'; }
}

async function eliminaPartecipante(id) {
  if (!confirm('Eliminare questo partecipante?')) return;
  await fetch(SUPA_URL+'/rest/v1/esercitazione_pasti?id=eq.'+id, { method:'DELETE', headers:H });
  await caricaPasti();
}

// Parser codice fiscale italiano
function parseCF(cf) {
  cf = (cf||'').toUpperCase().trim();
  if (cf.length !== 16) return null;
  var cognomeChars = cf.slice(0,3).replace(/[^A-Z]/g,'');
  var nomeChars    = cf.slice(3,6).replace(/[^A-Z]/g,'');
  return { cognomeRaw: cognomeChars, nomeRaw: nomeChars, cf: cf };
}

function parseCFLive(val) {
  if (val.length === 16) {
    var parsed = parseCF(val);
    if (parsed) {
      // Suggerisce solo se i campi sono vuoti
      if (!document.getElementById('ppCognome').value)
        document.getElementById('ppCognome').value = parsed.cognomeRaw;
      if (!document.getElementById('ppNome').value)
        document.getElementById('ppNome').value = parsed.nomeRaw;
    }
  }
}

// -- SCANNER CF --
var cfStream = null;

async function apriScannerCF() {
  document.getElementById('esercScannerOverlay').classList.add('open');
  document.getElementById('cfScanResult').textContent = '';
  try {
    cfStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } });
    document.getElementById('cfVideo').srcObject = cfStream;
  } catch(e) {
    document.getElementById('cfScanResult').textContent = 'Fotocamera non disponibile.';
  }
}

function chiudiScanner() {
  if (cfStream) { cfStream.getTracks().forEach(function(t){ t.stop(); }); cfStream = null; }
  document.getElementById('esercScannerOverlay').classList.remove('open');
}

function scattaFoto() {
  var video  = document.getElementById('cfVideo');
  var canvas = document.getElementById('cfCanvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Usa Tesseract.js se disponibile, altrimenti chiede CF manuale
  var imgData = canvas.toDataURL('image/png');
  document.getElementById('cfScanResult').textContent = 'Elaborazione...';

  // Carica Tesseract se non presente
  if (typeof Tesseract === 'undefined') {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js';
    s.onload = function(){ riconosciCF(imgData); };
    document.head.appendChild(s);
  } else {
    riconosciCF(imgData);
  }
}

async function riconosciCF(imgData) {
  try {
    var result = await Tesseract.recognize(imgData, 'eng', { logger: function(){} });
    var testo  = result.data.text.toUpperCase().replace(/\s/g,'');
    // Cerca pattern CF: 6 lettere, 2 cifre, 1 lettera, 2 cifre, 1 lettera, 3 cifre/lettere, 1 lettera
    var match  = testo.match(/[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9A-Z]{3}[A-Z]/);
    if (match) {
      var cf     = match[0];
      var parsed = parseCF(cf);
      document.getElementById('cfScanResult').textContent = '✓ Trovato: ' + cf;
      chiudiScanner();
      apriFormPasto(null);
      document.getElementById('ppCF').value      = cf;
      document.getElementById('ppCognome').value = parsed ? parsed.cognomeRaw : '';
      document.getElementById('ppNome').value    = parsed ? parsed.nomeRaw    : '';
    } else {
      document.getElementById('cfScanResult').textContent = 'CF non trovato. Riprova o inserisci manualmente.';
    }
  } catch(e) {
    document.getElementById('cfScanResult').textContent = 'Errore riconoscimento. Inserisci il CF manualmente.';
  }
}

// -- EXPORT INTERVENTO CON CF --
async function stampaIntervento(id) {
  // Carica i dati dell'intervento
  var res = await fetch(SUPA_URL + '/rest/v1/interventi?id=eq.' + id + '&select=*', { headers: H });
  var dati = await res.json();
  if (!dati.length) return;
  var i = dati[0];

  // Carica volontari con CF
  var volIds = i.volontari_ids || [];
  var vols = [];
  if (volIds.length) {
    var rv = await fetch(SUPA_URL + '/rest/v1/volontari?id=in.(' + volIds.join(',') + ')&select=id,cognome,nome,codice_fiscale&order=cognome', { headers: H });
    vols = await rv.json();
  }

  var ora    = new Date().toLocaleString('it-IT');
  var data   = i.data ? new Date(i.data).toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' }) : '—';
  var dataF  = i.data_fine ? new Date(i.data_fine).toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' }) : null;

  var win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<title>Intervento — ' + (i.evento||'—') + '</title>'
    + '<style>'
    + 'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;margin:1.5cm;max-width:18cm}'
    + '.header{border-bottom:3px solid #1a7a4a;padding-bottom:0.8rem;margin-bottom:1rem}'
    + 'h1{font-size:14pt;color:#1a7a4a;margin:0 0 0.2rem}'
    + '.meta{font-size:8pt;color:#666}'
    + 'h2{font-size:10pt;font-weight:700;color:#1a7a4a;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:1rem 0 0.5rem}'
    + 'table{width:100%;border-collapse:collapse;font-size:9pt}'
    + 'td,th{padding:5px 8px;border:0.5px solid #e5e7eb;text-align:left}'
    + 'th{background:#1a7a4a;color:white;font-weight:700}'
    + 'tr:nth-child(even) td{background:#f9fafb}'
    + '.info-table td:first-child{font-weight:600;color:#555;width:35%;background:#f9fafb}'
    + '.no-cf{color:#999;font-style:italic}'
    + '@media print{body{margin:1cm}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '</style></head><body>'
    + '<div class="header">'
    + '<h1>Intervento — ' + (i.evento||'—') + '</h1>'
    + '<div class="meta">PC ANA Casale Monferrato &nbsp;·&nbsp; Generato il ' + ora + '</div>'
    + '</div>'
    + '<h2>Dati intervento</h2>'
    + '<table class="info-table"><tbody>'
    + '<tr><td>Evento</td><td>' + (i.evento||'—') + '</td></tr>'
    + '<tr><td>Tipo attività</td><td>' + (i.tipo_attivita||'—') + '</td></tr>'
    + '<tr><td>Data inizio</td><td>' + data + '</td></tr>'
    + (dataF ? '<tr><td>Data fine</td><td>' + dataF + '</td></tr>' : '')
    + '<tr><td>Ore</td><td>' + (i.n_ore||'—') + '</td></tr>'
    + '<tr><td>N° volontari</td><td>' + (i.n_volontari||vols.length) + '</td></tr>'
    + '<tr><td>Registrato da</td><td>' + (i.utente||'—') + '</td></tr>'
    + (i.note ? '<tr><td>Note</td><td>' + i.note + '</td></tr>' : '')
    + '</tbody></table>'
    + '<h2>Volontari partecipanti (' + vols.length + ')</h2>'
    + '<table><thead><tr><th>#</th><th>Cognome e Nome</th><th>Codice Fiscale</th></tr></thead><tbody>'
    + vols.map(function(v, idx) {
        var cf = v.codice_fiscale ? v.codice_fiscale : '<span class="no-cf">non inserito</span>';
        return '<tr><td>' + (idx+1) + '</td><td>' + v.cognome + ' ' + v.nome + '</td><td>' + cf + '</td></tr>';
      }).join('')
    + '</tbody></table>'
    + '<div style="margin-top:2rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem">'
    + '<div style="border-top:0.5px solid #111;padding-top:4px;font-size:8pt;color:#666;text-align:center;margin-top:2rem">Responsabile intervento</div>'
    + '<div style="border-top:0.5px solid #111;padding-top:4px;font-size:8pt;color:#666;text-align:center;margin-top:2rem">Coordinatore PC ANA Casale</div>'
    + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>'
    + '</body></html>');
  win.document.close();
}

// -- EXPORT PRESENTI PDF --
async function esportaPresentiPDF() {
  var ora    = new Date().toLocaleString('it-IT');
  var giorno = esercGiorno.charAt(0).toUpperCase() + esercGiorno.slice(1);
  var turni  = ESERC_TURNI[esercGiorno];

  // Raggruppa per turno
  var perTurno = {};
  turni.forEach(function(t) { perTurno[t] = []; });

  // Volontari PC ANA
  esercVolontari.forEach(function(v) {
    var cache = esercPresenzeCache['v'+v.id] || {};
    turni.forEach(function(t) {
      if (cache[t]) perTurno[t].push({ cognome: v.cognome, nome: v.nome, tipo: 'PC ANA' });
    });
  });

  // Esterni e ospiti
  esercEsterni.forEach(function(e) {
    var cache = esercPresenzeCache['e'+e.id] || {};
    var tipoLabel = e.tipo_partecipante === 'ospite' ? 'Ospite' : 'Esterno';
    turni.forEach(function(t) {
      if (cache[t]) perTurno[t].push({ cognome: e.cognome_esterno||'', nome: e.nome_esterno||'', tipo: tipoLabel });
    });
  });

  var totale = new Set();
  Object.values(perTurno).forEach(function(lista) {
    lista.forEach(function(p) { totale.add(p.cognome + ' ' + p.nome); });
  });

  var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<title>Presenti ' + giorno + ' — Esercitazione 2025</title>'
    + '<style>'
    + 'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;margin:1.5cm;max-width:18cm}'
    + '.header{border-bottom:3px solid #1a7a4a;padding-bottom:0.8rem;margin-bottom:1rem}'
    + 'h1{font-size:14pt;color:#1a7a4a;margin:0 0 0.2rem}'
    + '.meta{font-size:8pt;color:#666}'
    + 'h2{font-size:10pt;font-weight:700;color:#1a7a4a;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:1rem 0 0.5rem}'
    + 'table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:1rem}'
    + 'th{background:#1a7a4a;color:white;font-weight:700;padding:5px 8px;text-align:left}'
    + 'td{padding:5px 8px;border-bottom:0.5px solid #e5e7eb}'
    + 'tr:nth-child(even) td{background:#f9fafb}'
    + '.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:8pt;font-weight:700}'
    + '.b-pcana{background:#eaf3de;color:#3b6d11}'
    + '.b-esterno{background:#e8f0fb;color:#185fa5}'
    + '.b-ospite{background:#faeeda;color:#854f0b}'
    + '@media print{body{margin:1cm}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '</style></head><body>'
    + '<div class="header">'
    + '<h1>Presenti — ' + giorno + ' · Esercitazione 2025</h1>'
    + '<div class="meta">PC ANA Casale Monferrato &nbsp;·&nbsp; Generato il ' + ora + ' &nbsp;·&nbsp; Totale presenti: ' + totale.size + '</div>'
    + '</div>';

  turni.forEach(function(turno) {
    var lista = perTurno[turno].sort(function(a,b){ return a.cognome.localeCompare(b.cognome); });
    html += '<h2>' + turno.charAt(0).toUpperCase() + turno.slice(1) + ' (' + lista.length + ' presenti)</h2>';
    if (!lista.length) {
      html += '<p style="font-size:9pt;color:#999">Nessun presente.</p>';
      return;
    }
    html += '<table><thead><tr><th>#</th><th>Cognome e Nome</th><th>Tipo</th></tr></thead><tbody>';
    lista.forEach(function(p, i) {
      var cls = p.tipo === 'PC ANA' ? 'b-pcana' : p.tipo === 'Ospite' ? 'b-ospite' : 'b-esterno';
      html += '<tr><td>' + (i+1) + '</td><td>' + p.cognome + ' ' + p.nome + '</td><td><span class="badge ' + cls + '">' + p.tipo + '</span></td></tr>';
    });
    html += '</tbody></table>';
  });

  html += '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script></body></html>';

  var win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// -- ALERT WHATSAPP --
async function apriAlertWhatsApp() {
  // Recupera volontari presenti nel turno corrente con telefono
  var presentiIds = esercVolontari
    .filter(function(v) { return esercPresenzeCache['v'+v.id] && esercPresenzeCache['v'+v.id][esercTurno]; })
    .map(function(v) { return v.id; });

  var giorno = esercGiorno.charAt(0).toUpperCase() + esercGiorno.slice(1);
  document.getElementById('waMessaggio').value =
    'Esercitazione PC ANA Casale Monferrato\n' +
    giorno + ' 6-7 Giugno 2025 — turno: ' + esercTurno + '\n\n' +
    'Sei registrato come presente. Confermi la tua partecipazione?';

  var listEl = document.getElementById('waLinkList');
  listEl.innerHTML = '<div class="loading-msg">Caricamento numeri...</div>';
  document.getElementById('waAlertOverlay').classList.add('open');

  if (!presentiIds.length) {
    listEl.innerHTML = '<div class="loading-msg">Nessun volontario presente in questo turno.</div>';
    return;
  }

  var res  = await fetch(SUPA_URL + '/rest/v1/volontari?id=in.(' + presentiIds.join(',') + ')&select=id,cognome,nome,telefono&order=cognome', { headers: H });
  var vols = await res.json();

  var html = '<div style="font-size:0.72rem;font-weight:600;color:var(--testo-3);margin-bottom:0.5rem">'
    + presentiIds.length + ' presenti · ' + vols.filter(function(v){ return v.telefono; }).length + ' con numero</div>';

  vols.forEach(function(v) {
    var tel = (v.telefono||'').replace(/\s|-|\./g,'').replace(/^0/, '+39');
    if (!tel.startsWith('+')) tel = '+39' + tel.replace(/^0039/,'');
    var nome = v.cognome + ' ' + v.nome;

    if (v.telefono) {
      html += '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:0.5px solid var(--border)">'
        + '<div style="flex:1;font-size:0.82rem;font-weight:500;color:var(--testo)">' + nome + '</div>'
        + '<div style="font-size:0.65rem;color:var(--testo-3)">' + v.telefono + '</div>'
        + '<a id="walink-'+v.id+'" href="#" onclick="apriWA(\''+tel+'\',event)" style="background:#25d366;color:white;padding:4px 10px;border-radius:8px;font-size:0.72rem;text-decoration:none;flex-shrink:0">Invia</a>'
        + '</div>';
    } else {
      html += '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:0.5px solid var(--border)">'
        + '<div style="flex:1;font-size:0.82rem;color:var(--testo-3)">' + nome + '</div>'
        + '<div style="font-size:0.65rem;color:var(--red)">nessun numero</div>'
        + '</div>';
    }
  });

  listEl.innerHTML = html;
}

function apriWA(tel, event) {
  event.preventDefault();
  var msg = encodeURIComponent(document.getElementById('waMessaggio').value);
  window.open('https://wa.me/' + tel.replace('+','') + '?text=' + msg, '_blank');
}

function chiudiAlertWA() {
  document.getElementById('waAlertOverlay').classList.remove('open');
}

// -- ELENCO INTERVENUTI --
var intervenutiData = [];

async function apriElencoIntervenuti() {
  document.getElementById('intervenutiOverlay').classList.add('open');
  document.getElementById('intervenutiList').innerHTML = '<div class="loading-msg">caricamento...</div>';

  try {
    const [listaRes, risposteRes] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?select=*&order=settore_id,ordine', { headers: H }),
      fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=*', { headers: H })
    ]);
    const lista    = await listaRes.json();
    const risposte = await risposteRes.json();
    const rMap     = {};
    risposte.forEach(r => { rMap['i'+r.inv_id] = r; rMap[String(r.inv_id)] = r; });

    // Filtra solo presenti
    intervenutiData = [];
    lista.forEach(inv => {
      const r        = rMap['i'+inv.id] || rMap[String(inv.id)] || {};
      const presenza = r.presenza || r.risposta || 'attesa';
      if (presenza === 'presente' || presenza === 'si') {
        intervenutiData.push({ id: inv.id, ente: inv.ente || '', nome: inv.nome || '', settore: inv.settore_label, manuale: false });
      }
    });

    renderIntervenutiList();
  } catch(e) {
    document.getElementById('intervenutiList').innerHTML = '<div style="color:var(--red);font-size:0.8rem">Errore: '+e.message+'</div>';
  }
}

function renderIntervenutiList() {
  const el = document.getElementById('intervenutiList');
  if (!el) return;

  let settoreCorr = '';
  let html = '';
  intervenutiData.forEach((p, i) => {
    if (p.settore !== settoreCorr) {
      settoreCorr = p.settore;
      html += '<div style="font-size:0.65rem;font-weight:700;color:var(--testo-3);text-transform:uppercase;padding:0.5rem 0 0.2rem;border-bottom:0.5px solid var(--border);margin-bottom:0.3rem">'+p.settore+'</div>';
    }
    html += '<div style="display:flex;align-items:center;gap:0.4rem;padding:0.3rem 0;border-bottom:0.5px solid var(--border)">'
      + '<input class="form-inp" value="'+htmlEsc(p.ente)+'" placeholder="Ente/Ruolo" oninput="aggiornaIntervenuto('+i+',\'ente\',this.value)" style="flex:1;font-size:0.78rem;padding:4px 8px">'
      + '<input class="form-inp" value="'+htmlEsc(p.nome)+'" placeholder="Nome" oninput="aggiornaIntervenuto('+i+',\'nome\',this.value)" style="flex:1;font-size:0.78rem;padding:4px 8px">'
      + '<button class="btn-sm btn-danger" onclick="rimuoviIntervenuto('+i+')" style="padding:3px 8px;flex-shrink:0">✕</button>'
      + '</div>';
  });
  el.innerHTML = html || '<div class="loading-msg">Nessun intervenuto.</div>';
}

function htmlEsc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function aggiornaIntervenuto(idx, campo, val) {
  if (intervenutiData[idx]) intervenutiData[idx][campo] = val;
}

function rimuoviIntervenuto(idx) {
  intervenutiData.splice(idx, 1);
  renderIntervenutiList();
}

function aggiungiIntervenuto() {
  intervenutiData.push({ id: null, ente: '', nome: '', settore: 'Aggiunti', manuale: true });
  renderIntervenutiList();
  // Scrolla in fondo
  const el = document.getElementById('intervenutiList');
  if (el) el.scrollTop = el.scrollHeight;
}

function chiudiElencoIntervenuti() {
  document.getElementById('intervenutiOverlay').classList.remove('open');
}

function stampaElencoIntervenuti() {
  const ora   = new Date().toLocaleString('it-IT');
  let html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<title>Elenco Intervenuti — 25° PC ANA</title>'
    + '<style>'
    + 'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;margin:1.5cm;max-width:18cm}'
    + '.header{border-bottom:3px solid #1a7a4a;padding-bottom:0.7rem;margin-bottom:0.8rem}'
    + 'h1{font-size:14pt;color:#1a7a4a;margin:0 0 0.15rem}'
    + '.meta{font-size:8pt;color:#666}'
    + 'h2{font-size:9pt;font-weight:700;color:#1a7a4a;border-bottom:1px solid #e5e7eb;padding-bottom:3px;margin:0.8rem 0 0.3rem;text-transform:uppercase;letter-spacing:0.5px}'
    + 'table{width:100%;border-collapse:collapse;font-size:9pt}'
    + 'th{background:#1a7a4a;color:white;font-weight:700;padding:4px 8px;text-align:left}'
    + 'td{padding:5px 8px;border-bottom:0.5px solid #e5e7eb}'
    + 'tr:nth-child(even) td{background:#f9fafb}'
    + '@media print{body{margin:1cm}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '</style></head><body>'
    + '<div class="header"><h1>Elenco Intervenuti — 25° Anniversario PC ANA Casale</h1>'
    + '<div class="meta">Generato il '+ora+' &nbsp;·&nbsp; Totale: '+intervenutiData.length+' intervenuti</div></div>';

  // Raggruppa per settore
  const settoriMap = {};
  intervenutiData.forEach(p => {
    const s = p.settore || 'Altro';
    if (!settoriMap[s]) settoriMap[s] = [];
    settoriMap[s].push(p);
  });

  Object.entries(settoriMap).forEach(([settore, persone]) => {
    html += '<h2>'+settore+'</h2>'
      + '<table><thead><tr><th>#</th><th>Ente / Ruolo</th><th>Nome</th></tr></thead><tbody>'
      + persone.map((p, i) => '<tr><td>'+(i+1)+'</td><td>'+(p.ente||'—')+'</td><td>'+(p.nome||'—')+'</td></tr>').join('')
      + '</tbody></table>';
  });

  html += '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\\/script></body></html>';

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
