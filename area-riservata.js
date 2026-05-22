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

// ── LOGIN ──
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

function avviaDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  const p        = currentUser.permessi || {};
  const isMaster = currentUser.tipo_accesso === 'master';

  // Topbar
  document.getElementById('homeWelcome').textContent = currentUser.nome;
  document.getElementById('homeUnit').textContent    = currentUser.ruolo + ' · PC ANA Casale Monferrato';

  // Bottom nav visibilità
  if (isMaster || p.volontari)  showNav('navVolontari');
  if (isMaster || p.interventi) showNav('navInterventi');
  if (isMaster || p.mezzi)      showNav('navMezzi');

  // More menu visibilità
  if (isMaster || p.pranzo)    document.getElementById('morePranzo').style.display    = 'flex';
  if (isMaster || p.richieste) document.getElementById('moreRichieste').style.display = 'flex';
  if (isMaster)                document.getElementById('moreImpostazioni').style.display = 'flex';

  // Badge richieste
  if (isMaster || p.richieste) caricaBadgeRichieste();

  // Compleanno
  verificaCompleanni();

  // Home cards
  buildHomeCards(isMaster, p);

  // Pranzo se autorizzato
  if (isMaster || p.pranzo) initPranzo();
}

function showNav(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function logout() {
  logAttivita('ha effettuato il logout');
  currentUser = null;
  sessionStorage.removeItem('ar_user');
  sessionStorage.removeItem('ar_pass');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panelHome').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('navHome').classList.add('active');
}

// ── NAVIGAZIONE ──
function showPanel(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1));
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const nb = document.getElementById('nav' + name.charAt(0).toUpperCase() + name.slice(1));
    if (nb) nb.classList.add('active');
    else document.getElementById('navMore').classList.add('active');
  }
  if (name === 'richieste') caricaRichieste();
  if (name === 'volontari') caricaVolontari();
}

function toggleMore() {
  document.getElementById('moreMenu').classList.toggle('open');
  document.getElementById('moreOverlay').classList.toggle('open');
  document.getElementById('navMore').classList.add('active');
}
function closeMore() {
  document.getElementById('moreMenu').classList.remove('open');
  document.getElementById('moreOverlay').classList.remove('open');
}

// ── HOME CARDS ──
function buildHomeCards(isMaster, p) {
  const grid = document.getElementById('homeGrid');
  grid.innerHTML = '';
  const cards = [];
  if (isMaster || p.volontari)  cards.push({ icon: volontariIcon(), title:'Volontari', sub:'Database unità', panel:'volontari', featured:true });
  if (isMaster || p.interventi) cards.push({ icon: interventiIcon(), title:'Interventi', sub:'Registro operativo', panel:'interventi' });
  if (isMaster || p.mezzi)      cards.push({ icon: mezziIcon(), title:'Mezzi', sub:'Parco veicoli', panel:'mezzi' });
  cards.push({ icon: convocazioniIcon(), title:'Convocazioni', sub:'Genera e stampa', href:'generatore-convocazioni.html' });
  if (isMaster || p.pranzo)     cards.push({ icon:'🍽️', title:'Pranzo 25°', sub:'Tracker invitati', panel:'pranzo', span2:true });

  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'nav-card' + (c.featured ? ' featured' : '') + (c.span2 ? ' span2' : '');
    if (typeof c.icon === 'string' && c.icon.length <= 2) {
      div.innerHTML = '<span style="font-size:1.2rem">' + c.icon + '</span><div><div class="nav-card-title">' + c.title + '</div><div class="nav-card-sub">' + c.sub + '</div></div>';
    } else {
      div.innerHTML = c.icon + '<div><div class="nav-card-title">' + c.title + '</div><div class="nav-card-sub">' + c.sub + '</div></div>';
    }
    if (c.panel) div.onclick = () => showPanel(c.panel, null);
    else if (c.href) div.onclick = () => window.location.href = c.href;
    grid.appendChild(div);
  });
}

function volontariIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function interventiIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'; }
function mezziIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'; }
function convocazioniIcon() { return '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'; }

// ── COMPLEANNI ──
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

// ── LOG ATTIVITÀ ──
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

// ── PRANZO ──
let pranzoSaved = {};

const SETTORI = [
  { id:'autorita', label:'Autorità Civili e Militari', color:'#1e3a5f',
    invitati:[
      {id:'a1',ente:'Comune di Casale M.to',nome:'Sindaco'},{id:'a2',ente:'Comune di Casale M.to',nome:'Vicesindaco'},{id:'a3',ente:'Comune di Casale M.to',nome:'Assessore PC'},{id:'a4',ente:'Prefettura AL',nome:'Prefetto'},{id:'a5',ente:'Prefettura AL',nome:'Viceprefetto PC'},{id:'a6',ente:'Provincia AL',nome:'Presidente Provincia'},{id:'a7',ente:'Regione Piemonte',nome:'Assessore PC'},{id:'a8',ente:'Regione Piemonte',nome:'Direttore PC'},{id:'a9',ente:'Questura AL',nome:'Questore'},{id:'a10',ente:'Carabinieri',nome:'Comandante Prov.'},{id:'a11',ente:'Guardia di Finanza',nome:'Comandante Prov.'},{id:'a12',ente:'VVF AL',nome:'Comandante Prov.'},{id:'a13',ente:'AREU 118',nome:'Direttore'},{id:'a14',ente:'ASL AL',nome:'Direttore Generale'},{id:'a15',ente:'CRI Casale',nome:'Presidente'},{id:'a16',ente:'Comune Mirabello',nome:'Sindaco'},{id:'a17',ente:'Comune Cuccaro',nome:'Sindaco'},{id:'a18',ente:'Comune Camagna',nome:'Sindaco'},{id:'a19',ente:'Comune Lu M.to',nome:'Sindaco'},{id:'a20',ente:'Consorzio Monferrato',nome:'Presidente'},{id:'a21',ente:'Dipartimento Naz. PC',nome:'Rappresentante'},{id:'a22',ente:'PC Regione Piemonte',nome:'Responsabile'},{id:'a23',ente:'Colonna Mobile ANA',nome:'Responsabile'},{id:'a24',ente:'Esercito Italiano',nome:'Rappresentante'},{id:'a25',ente:'Polizia Municipale',nome:'Comandante'},{id:'a26',ente:'ARPA Piemonte',nome:'Referente PC'},{id:'a27',ente:'PC Comunale',nome:'Responsabile'}
    ]
  },
  { id:'ana', label:'Settore ANA', color:'#1a4a2a',
    invitati:[
      {id:'b1',ente:'ANA Nazionale',nome:'Presidente Nazionale'},{id:'b2',ente:'ANA Nazionale',nome:'Vice Presidente Vicario'},{id:'b3',ente:'CAP ANA Piemonte',nome:'Presidente Trovant A.'},{id:'b4',ente:'CAP ANA Piemonte',nome:'Vicepresidente Ribotta A.'},{id:'b5',ente:'CAP ANA Piemonte',nome:'Tesoriere Sacchetto M.'},{id:'b6',ente:'ANA Sez. Casale',nome:'Presidente Sezionale'},{id:'b7',ente:'ANA Sez. Casale',nome:'Segretario Sezionale'},{id:'b8',ente:'Sez. Torino',nome:'Referente PC'},{id:'b9',ente:'Sez. Cuneo',nome:'Referente PC'},{id:'b10',ente:'Sez. Novara',nome:'Referente PC'},{id:'b11',ente:'Sez. Vercelli',nome:'Referente PC'},{id:'b12',ente:'Sez. Biella',nome:'Referente PC'},{id:'b13',ente:'Sez. Verbania',nome:'Referente PC'},{id:'b14',ente:'Sez. Asti',nome:'Referente PC'},{id:'b15',ente:'Sez. Alessandria',nome:'Referente PC'},{id:'b16',ente:'Sez. Acqui',nome:'Referente PC'},{id:'b17',ente:'Sez. Ovada',nome:'Referente PC'},{id:'b18',ente:'Sez. Genova',nome:'Referente PC'},{id:'b19',ente:'Sez. La Spezia',nome:'Referente PC'},{id:'b20',ente:'Sez. Savona',nome:'Referente PC'},{id:'b21',ente:'Sez. Imperia',nome:'Referente PC'},{id:'b22',ente:'Sez. Pinerolo',nome:'Referente PC'},{id:'b23',ente:'Sez. Saluzzo',nome:'Referente PC'},{id:'b24',ente:'Sez. Mondovì',nome:'Referente PC'},{id:'b25',ente:'Sez. Bra',nome:'Referente PC'},{id:'b26',ente:'Sez. Fossano',nome:'Referente PC'},{id:'b27',ente:'Sez. Alba',nome:'Referente PC'},{id:'b28',ente:'Sez. Ceva',nome:'Referente PC'},{id:'b29',ente:'Sez. Voghera',nome:'Referente PC'},{id:'b30',ente:'Sez. Pavia',nome:'Referente PC'},{id:'b31',ente:'Coord. ANA Piemonte',nome:'Presidente'},{id:'b32',ente:'Coord. ANA Piemonte',nome:'Segretario'}
    ]
  },
  { id:'volontariato', label:'Volontariato e PC', color:'#3a2a00',
    invitati:[
      {id:'c1',ente:'ANPAS Piemonte',nome:'Presidente'},{id:'c2',ente:'Misericordie Piemonte',nome:'Presidente'},{id:'c3',ente:'VVF Volontari AL',nome:'Responsabile'},{id:'c4',ente:'PC Casale M.to',nome:'Responsabile'},{id:'c5',ente:'Radio Club CB',nome:'Referente'},{id:'c6',ente:'AIB AL',nome:'Coordinatore'},{id:'c7',ente:'CNSAS',nome:'Delegato'},{id:'c8',ente:'Confcommercio Casale',nome:'Presidente'},{id:'c9',ente:'Confartigianato AL',nome:'Referente'},{id:'c10',ente:'Fondazione CR Casale',nome:'Presidente'},{id:'c11',ente:'CSV Alessandria',nome:'Referente'},{id:'c12',ente:'Coord. Vol. AL',nome:'Presidente'},{id:'c13',ente:'PC Arquata Scrivia',nome:'Responsabile'},{id:'c14',ente:'Gruppo Cinofili',nome:'Referente'},{id:'c15',ente:'CISOM',nome:'Referente regionale'},{id:'c16',ente:'Nucleo NBC',nome:'Responsabile'}
    ]
  },
  { id:'sezionale', label:'Sezione Casale Monferrato', color:'#2a1a3a',
    invitati:[
      {id:'d1',ente:'Consiglio Sezionale',nome:'Consigliere 1'},{id:'d2',ente:'Consiglio Sezionale',nome:'Consigliere 2'},{id:'d3',ente:'Consiglio Sezionale',nome:'Consigliere 3'},{id:'d4',ente:'Consiglio Sezionale',nome:'Consigliere 4'},{id:'d5',ente:'Consiglio Sezionale',nome:'Consigliere 5'},{id:'d6',ente:'Consiglio Sezionale',nome:'Consigliere 6'},{id:'d7',ente:'Consiglio Sezionale',nome:'Consigliere 7'},{id:'d8',ente:'Consiglio Sezionale',nome:'Consigliere 8'},{id:'d9',ente:'Consiglio Sezionale',nome:'Consigliere 9'},{id:'d10',ente:'Consiglio Sezionale',nome:'Consigliere 10'},{id:'d11',ente:'Consiglio Sezionale',nome:'Consigliere 11'},{id:'d12',ente:'Consiglio Sezionale',nome:'Consigliere 12'},{id:'d13',ente:'Consiglio Sezionale',nome:'Consigliere 13'},{id:'d14',ente:'Consiglio Sezionale',nome:'Consigliere 14'},{id:'d15',ente:'Consiglio Sezionale',nome:'Consigliere 15'},{id:'d16',ente:'Capogruppo',nome:'Casale M.to'},{id:'d17',ente:'Capogruppo',nome:'Mirabello M.to'},{id:'d18',ente:'Capogruppo',nome:'Cuccaro M.to'},{id:'d19',ente:'Capogruppo',nome:'Camagna M.to'},{id:'d20',ente:'Capogruppo',nome:'Lu M.to'},{id:'d21',ente:'Capogruppo',nome:'Frassinello M.to'},{id:'d22',ente:'Capogruppo',nome:'Occimiano'},{id:'d23',ente:'Capogruppo',nome:'Ticineto'},{id:'d24',ente:'Capogruppo',nome:'Pomaro M.to'},{id:'d25',ente:'Capogruppo',nome:'Villadeati'},{id:'d26',ente:'Capogruppo',nome:'Gabiano'},{id:'d27',ente:'Capogruppo',nome:'Solonghello'},{id:'d28',ente:'Capogruppo',nome:'Pontestura'},{id:'d29',ente:'Capogruppo',nome:'Balzola'},{id:'d30',ente:'Capogruppo',nome:'Morano P.o'},{id:'d31',ente:'Capogruppo',nome:'Valmacca'},{id:'d32',ente:'Capogruppo',nome:'Borgo S. Martino'},{id:'d33',ente:'Capogruppo',nome:'Cerrina M.to'},{id:'d34',ente:'Capogruppo',nome:'Trino Vercellese'},{id:'d35',ente:'Capogruppo',nome:'Rosignano M.to'},{id:'d36',ente:'Capogruppo',nome:'Sala M.to'},{id:'d37',ente:'Capogruppo',nome:'Terruggia'},{id:'d38',ente:'Capogruppo',nome:'Altavilla M.to'},{id:'d39',ente:'Capogruppo',nome:'Valenza'},{id:'d40',ente:'Capogruppo',nome:'Ottiglio'},{id:'d41',ente:'Capogruppo',nome:'Caresana'},{id:'d42',ente:'Capogruppo',nome:'Giarole'}
    ]
  }
];

async function initPranzo() {
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=inv_id,risposta,coperti', { headers: H });
    const rows = await res.json();
    pranzoSaved = {};
    if (Array.isArray(rows)) rows.forEach(r => { pranzoSaved[r.inv_id] = { risposta: r.risposta, coperti: r.coperti }; });
  } catch(e) {}
  try {
    const stored = localStorage.getItem('pranzo_data');
    if (stored) { const local = JSON.parse(stored); Object.keys(local).forEach(k => { if (!pranzoSaved[k]) pranzoSaved[k] = local[k]; }); }
  } catch(e) {}
  renderPranzo();
}

function renderPranzo() {
  const container = document.getElementById('pranzoSettori');
  container.innerHTML = '';
  SETTORI.forEach(settore => {
    const block = document.createElement('div');
    block.className = 'settore-block';
    const head = document.createElement('div');
    head.className = 'settore-head';
    head.innerHTML = '<div class="sh-color" style="background:' + settore.color + '"></div><div class="sh-info"><div class="sh-title">' + settore.label + '</div><div class="sh-sub" id="sh-stat-' + settore.id + '">—</div></div><span class="sh-arrow">▼</span>';
    head.onclick = () => { body.classList.toggle('hidden'); head.classList.toggle('collapsed'); };
    const body = document.createElement('div');
    body.className = 'settore-body';
    settore.invitati.forEach(inv => {
      const saved    = pranzoSaved[inv.id] || { risposta:'attesa', coperti:1 };
      const risposta = saved.risposta || 'attesa';
      const coperti  = saved.coperti  || 1;
      const row = document.createElement('div');
      row.className = 'inv-row ' + risposta;
      row.id = 'row-' + inv.id;
      row.innerHTML = '<div class="inv-info"><div class="inv-ente">' + inv.ente + '</div><div class="inv-nome">' + inv.nome + '</div></div>'
        + '<div class="inv-controls">'
        + '<select class="risposta-sel ' + risposta + '" onchange="setRisposta(\'' + inv.id + '\',this)">'
        + '<option value="attesa"' + (risposta==='attesa'?' selected':'') + '>⏳</option>'
        + '<option value="si"'    + (risposta==='si'    ?' selected':'') + '>✅</option>'
        + '<option value="no"'    + (risposta==='no'    ?' selected':'') + '>❌</option>'
        + '</select>'
        + '<div class="coperti-ctrl" id="cop-ctrl-' + inv.id + '" style="' + (risposta==='si'?'':'opacity:0.3;pointer-events:none') + '">'
        + '<button onclick="setCoperti(\'' + inv.id + '\',-1)">−</button>'
        + '<span class="coperti-num" id="cop-' + inv.id + '">' + coperti + '</span>'
        + '<button onclick="setCoperti(\'' + inv.id + '\',+1)">+</button>'
        + '</div></div>';
      body.appendChild(row);
    });
    block.appendChild(head); block.appendChild(body);
    container.appendChild(block);
  });
  aggiornaStatsPranzo();
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
  let totInvitati=0, totConferme=0, totDecline=0, totCoperti=0;
  SETTORI.forEach(settore => {
    let conf=0;
    settore.invitati.forEach(inv => {
      totInvitati++;
      const saved = pranzoSaved[inv.id] || {};
      if (saved.risposta==='si')  { conf++; totConferme++; totCoperti += (saved.coperti||1); }
      if (saved.risposta==='no')  { totDecline++; }
    });
    const el = document.getElementById('sh-stat-' + settore.id);
    if (el) el.textContent = conf + ' conf. / ' + settore.invitati.length + ' tot.';
  });
  document.getElementById('psInvitati').textContent = totInvitati;
  document.getElementById('psConferme').textContent = totConferme;
  document.getElementById('psDecline').textContent  = totDecline;
  document.getElementById('psCoperti').textContent  = totCoperti;
}

function filtraPranzo(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('.inv-row').forEach(row => {
    row.classList.toggle('nascosta', term && !row.textContent.toLowerCase().includes(term));
  });
}

function exportPranzoCSV() {
  const rows = [['Settore','Ente','Nome/Ruolo','Risposta','Coperti']];
  SETTORI.forEach(s => s.invitati.forEach(inv => {
    const saved = pranzoSaved[inv.id] || { risposta:'attesa', coperti:1 };
    rows.push([s.label, inv.ente, inv.nome, saved.risposta, saved.risposta==='si'?saved.coperti:0]);
  }));
  const csv  = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'pranzo_25anni_pcana.csv'; a.click();
  URL.revokeObjectURL(a.href);
}

// ── RICHIESTE ──
async function caricaBadgeRichieste() {
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?letta=eq.false&select=id', { headers: H });
    const data = await res.json();
    const badge = document.getElementById('badgeMore');
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
    const badge     = document.getElementById('badgeMore');
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
      const tel   = r.telefono  ? ' · ' + r.telefono : '';
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

// ── IMPOSTAZIONI ──
async function caricaImpostazioni() {
  caricaUtenti();
  caricaLog();
}

async function caricaUtenti() {
  const list = document.getElementById('utentiList');
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res    = await fetch(SUPA_URL + '/rest/v1/utenti?select=id,nome,username,ruolo,tipo_accesso,attivo,permessi&order=nome', { headers: H });
    const utenti = await res.json();
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
        + '<div class="impo-u-info"><div class="impo-u-name">' + u.nome + '</div><div class="impo-u-role">@' + u.username + ' · ' + u.ruolo + '</div>' + perms + '</div>'
        + '<div class="impo-u-actions">'
        + '<span class="badge ' + badgeClass + '">' + badgeText + '</span>'
        + '<button class="btn-sm ' + (u.attivo ? 'btn-warn' : 'btn-ok') + '" onclick="toggleAttivo(\'' + u.id + '\',' + u.attivo + ')">' + (u.attivo ? 'off' : 'on') + '</button>'
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
    pranzo:     document.getElementById('permPranzo').checked,
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


// ── VOLONTARI ──
let volontariData = [];
let volCorrenteId = null;

const AVATAR_COLORS = [
  ['#1a3a1f','#3fb950'], ['#1c2a3a','#58a6ff'], ['#3a2a00','#d29922'],
  ['#2a1a3a','#a78bfa'], ['#3a1a1a','#f87171'], ['#0a2a2a','#34d399']
];

function avatarColor(str) {
  let h = 0; for (let c of (str||'')) h = (h*31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

async function caricaVolontari() {
  const list = document.getElementById('volList');
  if (!list) return;
  list.innerHTML = '<div class="loading-msg">caricamento...</div>';
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/volontari?select=id,cognome,nome,squadra,tipo_volontario,mansione,specializzazione,telefono,quattro_ore,dodici_ore,dae,attivo&order=cognome', { headers: H });
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
    else if (v.quattro_ore) badges.push('<span class="vol-badge vb-ok">4H</span>');
    if (v.dae) badges.push('<span class="vol-badge vb-ok">DAE</span>');
    card.innerHTML = '<div class="vol-avatar" style="background:' + bg + ';color:' + fg + '">' + initials + '</div>'
      + '<div class="vol-card-info"><div class="vol-card-name">' + v.cognome + ' ' + v.nome + '</div>'
      + '<div class="vol-card-sub"><span>' + (v.tipo_volontario||'—') + '</span>' + (v.mansione ? '<span>· ' + v.mansione + '</span>' : '') + '</div></div>'
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
  const detail = document.getElementById('volDetail');
  const body   = document.getElementById('volDetailBody');
  detail.classList.add('open');
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
          <div class="vol-detail-role">${v.tipo_volontario||'Volontario'} · ${v.squadra||'—'}</div>
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
        <div class="vol-section-head">Dotazioni</div>
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
  volCorrenteId = null;
}

function apriFormVolontario(id) {
  volCorrenteId = id;
  const panel = document.getElementById('volFormPanel');
  const body  = document.getElementById('volFormBody');
  document.getElementById('volFormTitle').textContent = id ? 'Modifica volontario' : 'Nuovo volontario';
  panel.classList.add('open');

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
      <div class="vol-form-section-title">Dotazioni e formazione</div>
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
    ${id ? '<button class="vol-delete-btn" onclick="eliminaVolontario()">elimina volontario</button>' : ''}`;

  // Se modifica, carica i dati
  if (id) caricaDatiForm(id);
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
}

// ── KEYBOARD ──
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});
