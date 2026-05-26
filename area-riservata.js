
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
  var editBtnHtml = '';
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
      fetch(SUPA_URL + '/rest/v1/pranzo_invitati_lista?select=*&order=settore_id,ordine&attivo=eq.true', { headers: H }),
      fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=inv_id,risposta,coperti', { headers: H })
    ]);
    const lista    = await listaRes.json();
    const risposte = await risposteRes.json();
    const rispMap  = {};
    risposte.forEach(r => { rispMap[r.inv_id] = r; });

    // Dividi per stato
    const confermati = [], declinati = [], attesa = [];
    lista.forEach(inv => {
      const saved = rispMap['i' + inv.id] || {};
      const obj   = { ente: inv.ente, nome: inv.nome || '', settore: inv.settore_label, coperti: saved.coperti || 1 };
      if (saved.risposta === 'si')  confermati.push(obj);
      else if (saved.risposta === 'si') declinati.push(obj);
      else if (saved.risposta === 'no') declinati.push(obj);
      else attesa.push(obj);
    });

    const totCoperti = confermati.reduce((s, i) => s + i.coperti, 0);
    const oggi       = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' });

    const makeTable = (items, title, color) => {
      if (!items.length) return '<p style="color:#888;font-style:italic;margin:0.3rem 0 1rem">Nessuno</p>';
      return '<table style="width:100%;border-collapse:collapse;margin-bottom:1.2rem;font-size:9pt">'
        + '<thead><tr style="background:' + color + ';color:white">'
        + '<th style="padding:6px 10px;text-align:left;font-weight:700">Ente / Ruolo</th>'
        + '<th style="padding:6px 10px;text-align:left;font-weight:700">Nome</th>'
        + '<th style="padding:6px 10px;text-align:left;font-weight:700">Settore</th>'
        + '<th style="padding:6px 10px;text-align:center;font-weight:700">Cop.</th>'
        + '</tr></thead><tbody>'
        + items.map((i, idx) => '<tr style="background:' + (idx%2===0?'#f9fafb':'white') + '">'
          + '<td style="padding:5px 10px;border-bottom:0.5px solid #e5e7eb">' + i.ente + '</td>'
          + '<td style="padding:5px 10px;border-bottom:0.5px solid #e5e7eb">' + (i.nome || '--') + '</td>'
          + '<td style="padding:5px 10px;border-bottom:0.5px solid #e5e7eb;font-size:8pt;color:#666">' + i.settore + '</td>'
          + '<td style="padding:5px 10px;border-bottom:0.5px solid #e5e7eb;text-align:center">' + (title==='Confermati' ? i.coperti : '--') + '</td>'
          + '</tr>').join('')
        + '</tbody></table>';
    };

    const win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
      + '<title>Riepilogo Pranzo 25° Anniversario PC ANA Casale</title>'
      + '<style>'
      + 'body{font-family:Georgia,serif;font-size:10pt;color:#111;margin:2cm}'
      + 'h1{font-size:16pt;font-weight:700;color:#1a7a4a;margin:0 0 0.2rem}'
      + 'h2{font-size:11pt;font-weight:700;margin:1.2rem 0 0.5rem;padding-bottom:0.3rem;border-bottom:2px solid currentColor}'
      + '.meta{font-size:9pt;color:#666;margin-bottom:1.5rem}'
      + '.stats{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap}'
      + '.stat{background:#f3f4f6;border-radius:8px;padding:0.6rem 1rem;text-align:center;min-width:80px}'
      + '.stat-num{font-size:1.4rem;font-weight:700;line-height:1}'
      + '.stat-label{font-size:8pt;color:#666;text-transform:uppercase;letter-spacing:0.4px}'
      + '@media print{body{margin:1.5cm}.stat{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
      + '</style></head><body>'
      + '<h1>Pranzo 25° Anniversario PC ANA Casale</h1>'
      + '<div class="meta">Tendone Alpini Mirabello &nbsp;|&nbsp; €25 ospiti / €10 volontari &nbsp;|&nbsp; Generato il ' + oggi + '</div>'
      + '<div class="stats">'
      + '<div class="stat"><div class="stat-num" style="color:#1a7a4a">' + confermati.length + '</div><div class="stat-label">Confermati</div></div>'
      + '<div class="stat"><div class="stat-num" style="color:#ef4444">' + declinati.length + '</div><div class="stat-label">Declinati</div></div>'
      + '<div class="stat"><div class="stat-num" style="color:#f59e0b">' + attesa.length + '</div><div class="stat-label">In attesa</div></div>'
      + '<div class="stat"><div class="stat-num" style="color:#1a7a4a">' + totCoperti + '</div><div class="stat-label">Coperti tot.</div></div>'
      + '</div>'
      + '<h2 style="color:#1a7a4a">Confermati (' + confermati.length + ' persone, ' + totCoperti + ' coperti)</h2>'
      + makeTable(confermati, 'Confermati', '#1a7a4a')
      + '<h2 style="color:#ef4444">Declinati (' + declinati.length + ')</h2>'
      + makeTable(declinati, 'Declinati', '#ef4444')
      + '<h2 style="color:#f59e0b">In attesa di risposta (' + attesa.length + ')</h2>'
      + makeTable(attesa, 'Attesa', '#f59e0b')
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
    setVal('fTelefono', v.telefono); setVal('fEmail', v.email);
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
    telefono: g('fTelefono'), email: g('fEmail'),
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
    // Mostra direttamente il form nuovo intervento inline
    const btn = document.createElement('button');
    btn.className = 'int-add-btn';
    btn.style.cssText = 'width:100%;padding:1rem;font-size:0.85rem;margin-top:0.5rem';
    btn.textContent = '+ Registra nuovo intervento';
    btn.onclick = () => apriFormIntervento(null);
    list.appendChild(btn);
    return;
  }

  // Master — mostra tutto
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
  if (!data.length) { list.innerHTML = '<div class="loading-msg">nessun intervento registrato.</div>'; return; }
  list.innerHTML = '';
  data.forEach(i => {
    const card = document.createElement('div');
    card.className = 'int-card';
    card.onclick = () => apriDettaglioIntervento(i.id);
    const dataFmt = i.data ? new Date(i.data).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
    const pills = [];
    if (i.tipo_attivita) pills.push('<span class="int-pill green">' + i.tipo_attivita + '</span>');
    if (i.luogo)         pills.push('<span class="int-pill">' + i.luogo + '</span>');
    if (i.n_volontari)   pills.push('<span class="int-pill blue">' + i.n_volontari + ' vol.</span>');
    if (i.n_ore)         pills.push('<span class="int-pill blue">' + i.n_ore + 'h</span>');
    if (i.utilizzo_radio) pills.push('<span class="int-pill green">📻 Radio</span>');
    if (i.vola)           pills.push('<span class="int-pill green">VolA' + (i.vola_numero ? ' ' + i.vola_numero : '') + '</span>');
    if (i.volter)         pills.push('<span class="int-pill green">VolTer</span>');
    card.innerHTML = '<div style="display:flex;align-items:flex-start;gap:0.7rem">'
      + getTipoAttivitaAvatar(i.tipo_attivita, 38)
      + '<div style="flex:1;min-width:0">'
      + '<div class="int-card-top">'
      + '<div class="int-card-evento">' + (i.evento || '—') + '</div>'
      + '<div class="int-card-data">' + dataFmt + '</div>'
      + '</div>'
      + '<div class="int-card-meta">' + pills.join('') + '</div>'
      + '</div></div>';
    list.appendChild(card);
  });
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
    document.getElementById('intDetailTitle').textContent = i.evento || '—';

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

    var _heroAvatar = getTipoAttivitaAvatar(i.tipo_attivita, 50);
    body.innerHTML = `
      <div class="vol-detail-hero">
        ${_heroAvatar}
        <div>
          <div class="vol-detail-name">${i.evento || '—'}</div>
          <div class="vol-detail-role">${i.tipo_attivita || 'Intervento'} . ${dataFmt}</div>
        </div>
      </div>
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
      ${i.note ? `<div class="vol-section">
        <div class="vol-section-head">Note</div>
        <div class="vol-section-body"><div style="font-size:0.75rem;color:var(--text-2);line-height:1.6">${i.note}</div></div>
      </div>` : ''}
      <button class="vol-delete-btn" onclick="eliminaIntervento()">elimina intervento</button>`;
  } catch(e) { body.innerHTML = '<div class="loading-msg">errore caricamento.</div>'; }
}

function chiudiDettaglioIntervento() {
  document.getElementById('intDetail').classList.remove('open');
  intCorrenteId = null;
}

function apriFormIntervento(id) {
  intCorrenteId = id;
  const panel = document.getElementById('intFormPanel');
  const body  = document.getElementById('intFormBody');
  document.getElementById('intFormTitle').textContent = id ? 'Modifica intervento' : 'Nuovo intervento';

  const tipoOpts = TIPO_ATTIVITA.map(t => '<option value="' + t + '">' + t + '</option>').join('');

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
    ${id ? '<button class="vol-delete-btn" onclick="eliminaIntervento()">elimina intervento</button>' : ''}`;

  panel.classList.add('open');
  panel.scrollTop = 0;
  // Precompila utente con nome utente corrente
  var ifUtente = document.getElementById('ifUtente');
  if (ifUtente && !id && currentUser) ifUtente.value = currentUser.nome || '';
  caricaVolPicker();
  if (id) caricaDatiFormIntervento(id);
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


// -- DOCUMENTI --
let docVolontariCache = [];
let docUploadVolId = null;
let docUploadFile  = null;

const DOC_TIPO_LABEL = {
  'FOTO':'📷 Foto profilo', '4_ORE':'📋 Attestato 4 Ore', '12_ORE':'📋 Attestato 12 Ore',
  'CAPOSQ':'📋 Caposquadra', 'DAE':'🏥 DAE', 'CDC_1':'🏥 CDC 1° Step',
  'CDC_2':'🏥 CDC 2° Step', 'VISITA':'🩺 Visita medica', 'EMERCOM':'📡 EMERCOM', 'ALTRO':'📄 Altro'
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
    body.innerHTML = docs.map(d => {
      const label = DOC_TIPO_LABEL[d.tipo] || d.tipo;
      const data  = d.data_carico ? new Date(d.data_carico).toLocaleDateString('it-IT') : '—';
      return '<div class="vol-field">'
        + '<span class="vol-field-label">' + label.replace(/^[^ ]+ /,'') + '</span>'
        + '<a href="' + d.url + '" target="_blank" style="color:var(--blue);font-size:0.72rem;text-decoration:none">'
        + (d.nome_file || label) + ' ↗</a>'
        + '</div>';
    }).join('')
    + '<button class="doc-add-btn" style="margin-top:0.4rem" onclick="apriDocDaScheda(' + volId + ')">+ aggiungi</button>';
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
  fetch(SUPA_URL + '/rest/v1/volontari?id=in.(' + ids.join(',') + ')&select=id,cognome,nome', { headers: H })
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
  // Presenze
  var rP = await fetch(SUPA_URL + '/rest/v1/esercitazione_presenze?giorno=eq.' + esercGiorno + '&select=*', { headers: H });
  var presenze = await rP.json();
  esercPresenzeCache = {};
  presenze.forEach(function(p) {
    if (!esercPresenzeCache[p.volontario_id]) esercPresenzeCache[p.volontario_id] = {};
    esercPresenzeCache[p.volontario_id][p.turno] = p.presente;
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
    return esercPresenzeCache[v.id] && esercPresenzeCache[v.id][esercTurno];
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
  el.innerHTML = ESERC_TURNI[esercGiorno].map(function(t) {
    return '<button class="eserc-turno-btn'+(t===esercTurno?' active':'')+'" onclick="setTurnoEserc(\''+t+'\')">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>';
  }).join('');
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
  esercVolontari.forEach(function(v) {
    var presente = !!(esercPresenzeCache[v.id] && esercPresenzeCache[v.id][esercTurno]);
    var ini = ((v.cognome||'')[0]||(v.nome||'')[0]||'?').toUpperCase();
    html += '<div class="eserc-vol-row">'
      + '<div class="eserc-vol-avatar" style="background:'+(presente?'var(--green)':'var(--bg-2)')+';color:'+(presente?'#fff':'var(--testo-3)')+'">'+ini+'</div>'
      + '<div class="eserc-vol-nome">'+v.cognome+' '+v.nome+'</div>'
      + '<input type="checkbox" class="eserc-vol-check" '+(presente?'checked':'')+' onchange="setPresenzaEserc('+v.id+',this.checked)">'
      + '</div>';
  });
  el.innerHTML = html || '<div class="loading-msg">Nessun volontario.</div>';
}

async function setPresenzaEserc(volId, presente) {
  if (!esercPresenzeCache[volId]) esercPresenzeCache[volId] = {};
  esercPresenzeCache[volId][esercTurno] = presente;
  try {
    await fetch(SUPA_URL + '/rest/v1/esercitazione_presenze', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ volontario_id: volId, giorno: esercGiorno, turno: esercTurno, presente: presente })
    });
  } catch(e) {}
  renderEsercDashboard();
  renderEsercPresenze();
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

  // Lista presenti nel turno selezionato
  var presenti = esercVolontari.filter(function(v) {
    return esercPresenzeCache[v.id] && esercPresenzeCache[v.id][esercTurno];
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
