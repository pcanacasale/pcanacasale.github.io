const SUPA_URL = 'https://pggtmyarpuztfewqgwyc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZ3RteWFycHV6dGZld3Fnd3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDk4MjksImV4cCI6MjA4ODYyNTgyOX0.NqhNcmN-tqv5XWyeokSkjvOM6PxnmlDtZNcADeHRp9c';
let currentUser = null;
const H  = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY };
const HJ = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

// ── PWA Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── LOGIN ──
async function doLogin() {
  const u   = document.getElementById('loginUser').value.trim();
  const p   = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');
  if (!u || !p) { err.textContent = 'Inserisci username e password.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Accesso in corso...';
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/utenti?username=eq.' + encodeURIComponent(u) + '&password=eq.' + encodeURIComponent(p) + '&attivo=eq.true&select=id,nome,ruolo,tipo_accesso,permessi', { headers: H });
    const data = await res.json();
    if (data && data.length > 0) {
      currentUser = data[0];
      sessionStorage.setItem('ar_user', u);
      sessionStorage.setItem('ar_pass', p);
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
  document.getElementById('topbarUser').textContent = currentUser.nome;
  document.getElementById('homeWelcome').textContent = 'Ciao, ' + currentUser.nome.split(' ')[0] + ' 👋';

  const p        = currentUser.permessi || {};
  const isMaster = currentUser.tipo_accesso === 'master';

  // Bottom nav
  if (isMaster || p.pranzo)      { document.getElementById('navPranzo').style.display    = 'flex'; }
  if (isMaster || p.interventi)  { document.getElementById('navInterventi').style.display = 'flex'; }
  if (isMaster || p.volontari)   { document.getElementById('navVolontari').style.display  = 'flex'; }
  if (isMaster || p.richieste)   { document.getElementById('moreRichieste').style.display = 'flex'; }
  if (isMaster)                  { document.getElementById('moreUtenti').style.display    = 'flex'; }

  // Home cards
  buildHomeCards(isMaster, p);

  if (isMaster) caricaBadgeRichieste();

  // Carica pranzo se autorizzato
  if (isMaster || p.pranzo) initPranzo();
}

function buildHomeCards(isMaster, p) {
  const grid = document.getElementById('homeGrid');
  grid.innerHTML = '';
  const cards = [];
  if (isMaster || p.pranzo)     cards.push({ icon:'🍽️', title:'Pranzo 25°', sub:'Tracker risposte anniversario', panel:'pranzo', featured: true });
  if (isMaster || p.interventi) cards.push({ icon:'📋', title:'Interventi', sub:'Registro operativo', panel:'interventi' });
  if (isMaster || p.volontari)  cards.push({ icon:'👤', title:'Volontari', sub:'Elenco unità', panel:'volontari' });
  if (isMaster || p.richieste)  cards.push({ icon:'📬', title:'Richieste', sub:'Dal sito', panel:'richieste' });
  if (isMaster)                 cards.push({ icon:'👥', title:'Utenti', sub:'Gestione accessi', panel:'utenti' });
  cards.push({ icon:'📄', title:'Convocazioni', sub:'Genera e stampa', href:'generatore-convocazioni.html' });

  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'home-card' + (c.featured ? ' featured' : '');
    div.innerHTML = '<div class="hc-icon">' + c.icon + '</div><h3>' + c.title + '</h3><p>' + c.sub + '</p>';
    if (c.panel) div.onclick = () => showPanel(c.panel, null);
    else if (c.href) div.onclick = () => window.location.href = c.href;
    grid.appendChild(div);
  });
}

function logout() {
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
  else { // Attiva nav btn corrispondente se esiste
    const nb = document.getElementById('nav' + name.charAt(0).toUpperCase() + name.slice(1));
    if (nb) nb.classList.add('active');
    else document.getElementById('navMore').classList.add('active');
  }
  if (name === 'utenti')    caricaUtenti();
  if (name === 'richieste') caricaRichieste();
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

// ── TRACKER PRANZO ──
// Dati invitati (caricati/salvati su Supabase tabella pranzo_invitati)
let pranzoData = [];
let pranzoSaved = {}; // { id: {risposta, coperti} }

const SETTORI = [
  {
    id: 'autorita', label: '🏛️ Autorità Civili e Militari', color: '#1a3a5c',
    invitati: [
      { id:'a1',  ente:'Comune di Casale Monferrato', nome:'Sindaco' },
      { id:'a2',  ente:'Comune di Casale Monferrato', nome:'Vicesindaco' },
      { id:'a3',  ente:'Comune di Casale Monferrato', nome:'Assessore PC' },
      { id:'a4',  ente:'Prefettura AL', nome:'Prefetto' },
      { id:'a5',  ente:'Prefettura AL', nome:'Viceprefetto PC' },
      { id:'a6',  ente:'Provincia AL', nome:'Presidente Provincia' },
      { id:'a7',  ente:'Regione Piemonte', nome:'Assessore PC Regione' },
      { id:'a8',  ente:'Regione Piemonte', nome:'Direttore PC Regione' },
      { id:'a9',  ente:'Questura AL', nome:'Questore' },
      { id:'a10', ente:'Carabinieri', nome:'Comandante Provinciale' },
      { id:'a11', ente:'Guardia di Finanza', nome:'Comandante Provinciale' },
      { id:'a12', ente:'Vigili del Fuoco AL', nome:'Comandante Provinciale' },
      { id:'a13', ente:'AREU 118', nome:'Direttore' },
      { id:'a14', ente:'ASL AL', nome:'Direttore Generale' },
      { id:'a15', ente:'CRI Casale', nome:'Presidente' },
      { id:'a16', ente:'Comune di Mirabello M.to', nome:'Sindaco' },
      { id:'a17', ente:'Comune di Cuccaro M.to', nome:'Sindaco' },
      { id:'a18', ente:'Comune di Camagna M.to', nome:'Sindaco' },
      { id:'a19', ente:'Comune di Lu M.to', nome:'Sindaco' },
      { id:'a20', ente:'Consorzio Monferrato', nome:'Presidente' },
      { id:'a21', ente:'Dipartimento Naz. PC', nome:'Rappresentante' },
      { id:'a22', ente:'PC Regione Piemonte', nome:'Responsabile operativo' },
      { id:'a23', ente:'Colonna Mobile Naz. ANA', nome:'Responsabile' },
      { id:'a24', ente:'Esercito Italiano', nome:'Rappresentante' },
      { id:'a25', ente:'Polizia Municipale Casale', nome:'Comandante' },
      { id:'a26', ente:'ARPA Piemonte', nome:'Referente PC' },
      { id:'a27', ente:'Protezione Civile Comune', nome:'Responsabile Comunale' },
    ]
  },
  {
    id: 'ana', label: '🦅 Settore ANA', color: '#2d6a4f',
    invitati: [
      { id:'b1',  ente:'ANA Nazionale', nome:'Presidente Nazionale' },
      { id:'b2',  ente:'ANA Nazionale', nome:'Vice Presidente Vicario' },
      { id:'b3',  ente:'CAP ANA Piemonte', nome:'Presidente Trovant Alessandro' },
      { id:'b4',  ente:'CAP ANA Piemonte', nome:'Vicepresidente Ribotta Andrea' },
      { id:'b5',  ente:'CAP ANA Piemonte', nome:'Tesoriere Sacchetto Marco' },
      { id:'b6',  ente:'ANA Sez. Casale', nome:'Presidente Sezionale' },
      { id:'b7',  ente:'ANA Sez. Casale', nome:'Segretario Sezionale' },
      { id:'b8',  ente:'Sez. Torino', nome:'Referente PC' },
      { id:'b9',  ente:'Sez. Cuneo', nome:'Referente PC' },
      { id:'b10', ente:'Sez. Novara', nome:'Referente PC' },
      { id:'b11', ente:'Sez. Vercelli', nome:'Referente PC' },
      { id:'b12', ente:'Sez. Biella', nome:'Referente PC' },
      { id:'b13', ente:'Sez. Verbania', nome:'Referente PC' },
      { id:'b14', ente:'Sez. Asti', nome:'Referente PC' },
      { id:'b15', ente:'Sez. Alessandria', nome:'Referente PC' },
      { id:'b16', ente:'Sez. Acqui', nome:'Referente PC' },
      { id:'b17', ente:'Sez. Ovada', nome:'Referente PC' },
      { id:'b18', ente:'Sez. Genova', nome:'Referente PC' },
      { id:'b19', ente:'Sez. La Spezia', nome:'Referente PC' },
      { id:'b20', ente:'Sez. Savona', nome:'Referente PC' },
      { id:'b21', ente:'Sez. Imperia', nome:'Referente PC' },
      { id:'b22', ente:'Sez. Pinerolo', nome:'Referente PC' },
      { id:'b23', ente:'Sez. Saluzzo', nome:'Referente PC' },
      { id:'b24', ente:'Sez. Mondovì', nome:'Referente PC' },
      { id:'b25', ente:'Sez. Bra', nome:'Referente PC' },
      { id:'b26', ente:'Sez. Fossano', nome:'Referente PC' },
      { id:'b27', ente:'Sez. Alba', nome:'Referente PC' },
      { id:'b28', ente:'Sez. Ceva', nome:'Referente PC' },
      { id:'b29', ente:'Sez. Voghera', nome:'Referente PC' },
      { id:'b30', ente:'Sez. Pavia', nome:'Referente PC' },
      { id:'b31', ente:'Coord. ANA Piemonte', nome:'Presidente Coordinamento' },
      { id:'b32', ente:'Coord. ANA Piemonte', nome:'Segretario Coordinamento' },
    ]
  },
  {
    id: 'volontariato', label: '🤝 Volontariato e PC', color: '#c9a84c',
    invitati: [
      { id:'c1',  ente:'ANPAS Piemonte', nome:'Presidente' },
      { id:'c2',  ente:'Misericordie Piemonte', nome:'Presidente' },
      { id:'c3',  ente:'VVF Volontari AL', nome:'Responsabile' },
      { id:'c4',  ente:'PC Casale Monferrato', nome:'Responsabile Comunale' },
      { id:'c5',  ente:'Radio Club CB', nome:'Referente comunicazioni' },
      { id:'c6',  ente:'Antincendio Boschivo', nome:'Coordinatore AIB AL' },
      { id:'c7',  ente:'Soccorso Alpino', nome:'Delegato CNSAS' },
      { id:'c8',  ente:'Confcommercio Casale', nome:'Presidente' },
      { id:'c9',  ente:'Confartigianato AL', nome:'Referente' },
      { id:'c10', ente:'Fondazione Cassa Risparmio', nome:'Presidente' },
      { id:'c11', ente:'CSV Alessandria', nome:'Referente Volontariato' },
      { id:'c12', ente:'Coordinamento Vol. AL', nome:'Presidente' },
      { id:'c13', ente:'PC Arquata Scrivia', nome:'Responsabile' },
      { id:'c14', ente:'Gruppo Cinofili', nome:'Referente' },
      { id:'c15', ente:'CISOM', nome:'Referente regionale' },
      { id:'c16', ente:'Nucleo NBC', nome:'Responsabile' },
    ]
  },
  {
    id: 'sezionale', label: '🏔️ Sezione Casale Monferrato', color: '#0f1f35',
    invitati: [
      { id:'d1',  ente:'Consiglio Sezionale', nome:'Consigliere 1' },
      { id:'d2',  ente:'Consiglio Sezionale', nome:'Consigliere 2' },
      { id:'d3',  ente:'Consiglio Sezionale', nome:'Consigliere 3' },
      { id:'d4',  ente:'Consiglio Sezionale', nome:'Consigliere 4' },
      { id:'d5',  ente:'Consiglio Sezionale', nome:'Consigliere 5' },
      { id:'d6',  ente:'Consiglio Sezionale', nome:'Consigliere 6' },
      { id:'d7',  ente:'Consiglio Sezionale', nome:'Consigliere 7' },
      { id:'d8',  ente:'Consiglio Sezionale', nome:'Consigliere 8' },
      { id:'d9',  ente:'Consiglio Sezionale', nome:'Consigliere 9' },
      { id:'d10', ente:'Consiglio Sezionale', nome:'Consigliere 10' },
      { id:'d11', ente:'Consiglio Sezionale', nome:'Consigliere 11' },
      { id:'d12', ente:'Consiglio Sezionale', nome:'Consigliere 12' },
      { id:'d13', ente:'Consiglio Sezionale', nome:'Consigliere 13' },
      { id:'d14', ente:'Consiglio Sezionale', nome:'Consigliere 14' },
      { id:'d15', ente:'Consiglio Sezionale', nome:'Consigliere 15' },
      { id:'d16', ente:'Capogruppo', nome:'Casale Monferrato' },
      { id:'d17', ente:'Capogruppo', nome:'Mirabello M.to' },
      { id:'d18', ente:'Capogruppo', nome:'Cuccaro M.to' },
      { id:'d19', ente:'Capogruppo', nome:'Camagna M.to' },
      { id:'d20', ente:'Capogruppo', nome:'Lu M.to' },
      { id:'d21', ente:'Capogruppo', nome:'Frassinello M.to' },
      { id:'d22', ente:'Capogruppo', nome:'Occimiano' },
      { id:'d23', ente:'Capogruppo', nome:'Ticineto' },
      { id:'d24', ente:'Capogruppo', nome:'Pomaro M.to' },
      { id:'d25', ente:'Capogruppo', nome:'Villadeati' },
      { id:'d26', ente:'Capogruppo', nome:'Gabiano' },
      { id:'d27', ente:'Capogruppo', nome:'Solonghello' },
      { id:'d28', ente:'Capogruppo', nome:'Pontestura' },
      { id:'d29', ente:'Capogruppo', nome:'Balzola' },
      { id:'d30', ente:'Capogruppo', nome:'Morano P.o' },
      { id:'d31', ente:'Capogruppo', nome:'Valmacca' },
      { id:'d32', ente:'Capogruppo', nome:'Borgo S. Martino' },
      { id:'d33', ente:'Capogruppo', nome:'Cerrina M.to' },
      { id:'d34', ente:'Capogruppo', nome:'Trino Vercellese' },
      { id:'d35', ente:'Capogruppo', nome:'Rosignano M.to' },
      { id:'d36', ente:'Capogruppo', nome:'Sala M.to' },
      { id:'d37', ente:'Capogruppo', nome:'Terruggia' },
      { id:'d38', ente:'Capogruppo', nome:'Altavilla M.to' },
      { id:'d39', ente:'Capogruppo', nome:'Valenza' },
      { id:'d40', ente:'Capogruppo', nome:'Ottiglio' },
      { id:'d41', ente:'Capogruppo', nome:'Caresana' },
      { id:'d42', ente:'Capogruppo', nome:'Giarole' },
    ]
  }
];

async function initPranzo() {
  // Carica dati salvati da Supabase
  try {
    const res  = await fetch(SUPA_URL + '/rest/v1/pranzo_invitati?select=inv_id,risposta,coperti', { headers: H });
    const rows = await res.json();
    pranzoSaved = {};
    if (Array.isArray(rows)) {
      rows.forEach(r => { pranzoSaved[r.inv_id] = { risposta: r.risposta, coperti: r.coperti }; });
    }
  } catch(e) { console.warn('Supabase pranzo non disponibile, uso localStorage'); }

  // Fallback localStorage
  try {
    const stored = localStorage.getItem('pranzo_data');
    if (stored) {
      const local = JSON.parse(stored);
      Object.keys(local).forEach(k => { if (!pranzoSaved[k]) pranzoSaved[k] = local[k]; });
    }
  } catch(e) {}

  renderPranzo();
}

function renderPranzo() {
  const container = document.getElementById('pranzoSettori');
  container.innerHTML = '';

  let totInvitati = 0, totConferme = 0, totDecline = 0, totCoperti = 0;

  SETTORI.forEach(settore => {
    totInvitati += settore.invitati.length;
    let confSettore = 0;

    const block = document.createElement('div');
    block.className = 'settore-block';

    const head = document.createElement('div');
    head.className = 'settore-head';
    head.innerHTML = `<div class="sh-color" style="background:${settore.color}"></div>
      <div class="sh-info"><h4>${settore.label}</h4><span id="sh-stat-${settore.id}">Caricamento...</span></div>
      <span class="sh-arrow">▼</span>`;
    head.onclick = () => {
      body.classList.toggle('hidden');
      head.classList.toggle('collapsed');
    };

    const body = document.createElement('div');
    body.className = 'settore-body';

    settore.invitati.forEach(inv => {
      const saved    = pranzoSaved[inv.id] || { risposta: 'attesa', coperti: 1 };
      const risposta = saved.risposta || 'attesa';
      const coperti  = saved.coperti  || 1;

      if (risposta === 'si')  { confSettore++; totConferme++; totCoperti += coperti; }
      if (risposta === 'no')  { totDecline++; }

      const row = document.createElement('div');
      row.className = 'inv-row ' + risposta;
      row.id = 'row-' + inv.id;

      row.innerHTML = `
        <div class="inv-info">
          <div class="inv-ente">${inv.ente}</div>
          <div class="inv-nome">${inv.nome}</div>
        </div>
        <div class="inv-controls">
          <select class="risposta-sel ${risposta}" onchange="setRisposta('${inv.id}',this)">
            <option value="attesa" ${risposta==='attesa'?'selected':''}>⏳ Attesa</option>
            <option value="si"     ${risposta==='si'    ?'selected':''}>✅ Sì</option>
            <option value="no"     ${risposta==='no'    ?'selected':''}>❌ No</option>
          </select>
          <div class="coperti-ctrl" style="${risposta==='si'?'':'opacity:0.3;pointer-events:none'}" id="cop-ctrl-${inv.id}">
            <button onclick="setCoperti('${inv.id}',-1)">−</button>
            <span class="coperti-num" id="cop-${inv.id}">${coperti}</span>
            <button onclick="setCoperti('${inv.id}',+1)">+</button>
          </div>
        </div>`;
      body.appendChild(row);
    });

    // Stat settore
    document.addEventListener('DOMContentLoaded', () => {});
    setTimeout(() => {
      const el = document.getElementById('sh-stat-' + settore.id);
      if (el) el.textContent = confSettore + ' confermati su ' + settore.invitati.length;
    }, 0);

    block.appendChild(head);
    block.appendChild(body);
    container.appendChild(block);
  });

  // Aggiorna stat settori subito dopo render
  SETTORI.forEach(settore => {
    let conf = 0;
    settore.invitati.forEach(inv => {
      const saved = pranzoSaved[inv.id] || {};
      if (saved.risposta === 'si') conf++;
    });
    const el = document.getElementById('sh-stat-' + settore.id);
    if (el) el.textContent = conf + ' confermati su ' + settore.invitati.length;
  });

  document.getElementById('psInvitati').textContent  = totInvitati;
  document.getElementById('psConferme').textContent  = totConferme;
  document.getElementById('psDecline').textContent   = totDecline;
  document.getElementById('psCoperti').textContent   = totCoperti;
}

async function setRisposta(id, sel) {
  const val = sel.value;
  if (!pranzoSaved[id]) pranzoSaved[id] = { risposta: 'attesa', coperti: 1 };
  pranzoSaved[id].risposta = val;

  // Aggiorna UI riga
  const row = document.getElementById('row-' + id);
  if (row) { row.className = 'inv-row ' + val; }
  sel.className = 'risposta-sel ' + val;
  const ctrl = document.getElementById('cop-ctrl-' + id);
  if (ctrl) ctrl.style.cssText = val === 'si' ? '' : 'opacity:0.3;pointer-events:none';

  await salvaPranzoRecord(id);
  aggiornaStatsPranzo();
}

async function setCoperti(id, delta) {
  if (!pranzoSaved[id]) pranzoSaved[id] = { risposta: 'attesa', coperti: 1 };
  pranzoSaved[id].coperti = Math.max(1, (pranzoSaved[id].coperti || 1) + delta);
  const el = document.getElementById('cop-' + id);
  if (el) el.textContent = pranzoSaved[id].coperti;
  await salvaPranzoRecord(id);
  aggiornaStatsPranzo();
}

async function salvaPranzoRecord(id) {
  const rec = pranzoSaved[id];
  // Salva localStorage come backup immediato
  try { localStorage.setItem('pranzo_data', JSON.stringify(pranzoSaved)); } catch(e) {}
  // Salva su Supabase (upsert)
  try {
    await fetch(SUPA_URL + '/rest/v1/pranzo_invitati', {
      method: 'POST',
      headers: Object.assign({}, HJ, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ inv_id: id, risposta: rec.risposta, coperti: rec.coperti })
    });
  } catch(e) { console.warn('Supabase save failed, data in localStorage'); }
}

function aggiornaStatsPranzo() {
  let totInvitati = 0, totConferme = 0, totDecline = 0, totCoperti = 0;
  SETTORI.forEach(settore => {
    totInvitati += settore.invitati.length;
    let conf = 0;
    settore.invitati.forEach(inv => {
      const saved = pranzoSaved[inv.id] || {};
      if (saved.risposta === 'si')  { conf++; totConferme++; totCoperti += (saved.coperti || 1); }
      if (saved.risposta === 'no')  { totDecline++; }
    });
    const el = document.getElementById('sh-stat-' + settore.id);
    if (el) el.textContent = conf + ' confermati su ' + settore.invitati.length;
  });
  document.getElementById('psInvitati').textContent = totInvitati;
  document.getElementById('psConferme').textContent = totConferme;
  document.getElementById('psDecline').textContent  = totDecline;
  document.getElementById('psCoperti').textContent  = totCoperti;
}

function filtraPranzo(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('.inv-row').forEach(row => {
    if (!term) { row.classList.remove('nascosta'); return; }
    const txt = row.textContent.toLowerCase();
    row.classList.toggle('nascosta', !txt.includes(term));
  });
}

function exportPranzoCSV() {
  const rows = [['Settore','Ente','Nome/Ruolo','Risposta','Coperti']];
  SETTORI.forEach(settore => {
    settore.invitati.forEach(inv => {
      const saved = pranzoSaved[inv.id] || { risposta: 'attesa', coperti: 1 };
      rows.push([settore.label.replace(/[🏛️🦅🤝🏔️]/g,'').trim(), inv.ente, inv.nome, saved.risposta, saved.risposta === 'si' ? saved.coperti : 0]);
    });
  });
  const csv  = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'pranzo_25anni_pcana.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── GESTIONE UTENTI ──
async function caricaUtenti() {
  const list = document.getElementById('utentiList');
  list.innerHTML = '<div class="loading-msg">Caricamento...</div>';
  try {
    const res    = await fetch(SUPA_URL + '/rest/v1/utenti?select=id,nome,username,ruolo,tipo_accesso,attivo,permessi&order=nome', { headers: H });
    const utenti = await res.json();
    list.innerHTML = '';
    utenti.forEach(u => {
      const div     = document.createElement('div');
      div.className = 'utente-row' + (u.attivo ? '' : ' utente-disattivo');
      const p       = u.permessi || {};
      const badges  = u.tipo_accesso === 'master'
        ? '<span class="utente-tipo master">★ Master</span>'
        : '<span class="utente-tipo standard">Standard</span>';
      const perms   = u.tipo_accesso === 'master'
        ? '<span class="perm-badge">Tutto</span>'
        : [p.interventi?'<span class="perm-badge">Interventi</span>':'', p.volontari?'<span class="perm-badge">Volontari</span>':'', p.richieste?'<span class="perm-badge">Richieste</span>':'', p.pranzo?'<span class="perm-badge">Pranzo</span>':''].filter(Boolean).join('') || '<span style="font-size:0.65rem;color:#aaa">nessun permesso</span>';
      div.innerHTML = '<div class="utente-info"><strong>' + u.nome + '</strong><span class="utente-username">@' + u.username + '</span><span class="utente-ruolo">' + u.ruolo + '</span>' + badges + '<div style="margin-top:0.3rem">' + perms + '</div></div>'
        + '<div class="utente-actions"><button class="btn-sm ' + (u.attivo ? 'btn-warn' : 'btn-ok') + '" onclick="toggleAttivo(' + JSON.stringify(u.id) + ',' + JSON.stringify(u.attivo) + ')">' + (u.attivo ? 'Disattiva' : 'Attiva') + '</button>'
        + '<button class="btn-sm btn-danger" onclick="eliminaUtente(' + JSON.stringify(u.id) + ',' + JSON.stringify(u.nome) + ')">Elimina</button></div>';
      list.appendChild(div);
    });
  } catch(e) { list.innerHTML = '<div class="loading-msg">Errore caricamento.</div>'; }
}

async function salvaUtente() {
  const nome      = document.getElementById('nuovoNome').value.trim();
  const username  = document.getElementById('nuovoUsername').value.trim();
  const password  = document.getElementById('nuovaPassword').value.trim();
  const ruolo     = document.getElementById('nuovoRuolo').value.trim();
  const errEl     = document.getElementById('nuovoUtenteErr');
  if (!nome || !username || !password || !ruolo) { errEl.textContent = 'Compila tutti i campi.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  const permessi  = {
    interventi: document.getElementById('permInterventi').checked,
    volontari:  document.getElementById('permVolontari').checked,
    richieste:  document.getElementById('permRichieste').checked,
    pranzo:     document.getElementById('permPranzo').checked,
  };
  const res = await fetch(SUPA_URL + '/rest/v1/utenti', {
    method: 'POST',
    headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ nome, username, password, ruolo, tipo_accesso: 'standard', permessi })
  });
  if (res.ok) {
    ['nuovoNome','nuovoUsername','nuovaPassword','nuovoRuolo'].forEach(id => document.getElementById(id).value = '');
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
    const res  = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?letta=eq.false&select=id', { headers: H });
    const data = await res.json();
    const badge = document.getElementById('badgeMore');
    if (data.length > 0) { badge.textContent = data.length; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
  } catch(e) {}
}

async function caricaRichieste() {
  const list = document.getElementById('richiesteList');
  list.innerHTML = '<div class="loading-msg">Caricamento...</div>';
  try {
    const res      = await fetch(SUPA_URL + '/rest/v1/richieste_adesione?select=*&order=created_at.desc', { headers: H });
    const richieste = await res.json();
    const nonLette  = richieste.filter(r => !r.letta).length;
    const badge     = document.getElementById('badgeMore');
    if (nonLette > 0) { badge.textContent = nonLette; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
    if (!richieste.length) { list.innerHTML = '<div class="loading-msg">Nessuna richiesta ricevuta.</div>'; return; }
    list.innerHTML = '';
    richieste.forEach(r => {
      const data = new Date(r.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
      const div  = document.createElement('div');
      div.className = 'richiesta-card ' + (r.letta ? 'letta' : 'nuova');
      const tag    = r.letta ? '' : '<span class="badge-nuova">NUOVA</span>';
      const socio  = r.socio_ana ? '<div>Socio ANA: ' + r.socio_ana + (r.gruppo_ana ? ' — ' + r.gruppo_ana : '') + '</div>' : '';
      const msg    = r.messaggio ? '<div class="richiesta-msg">"' + r.messaggio + '"</div>' : '';
      const tel    = r.telefono ? ' · ' + r.telefono : '';
      const btnL   = r.letta ? '<span style="font-size:0.72rem;color:#aaa">✓ Letta</span>' : '<button class="btn-sm btn-ok" onclick="segnaLetta(' + JSON.stringify(r.id) + ')">Segna letta</button>';
      div.innerHTML = '<div class="richiesta-top"><div><span class="richiesta-nome">' + r.nome + '</span>' + tag + '</div><span class="richiesta-data">' + data + '</span></div>'
        + '<div class="richiesta-body"><div>' + r.email + tel + '</div>' + socio + msg + '</div>'
        + '<div class="richiesta-actions">' + btnL + '<button class="btn-sm btn-danger" onclick="eliminaRichiesta(' + JSON.stringify(r.id) + ')">Elimina</button></div>';
      list.appendChild(div);
    });
  } catch(e) { list.innerHTML = '<div class="loading-msg">Errore caricamento.</div>'; }
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
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});
