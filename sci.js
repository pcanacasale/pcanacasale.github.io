// ============================================================
// S.C.I. — Sistema di Comunicazione Interattivo. Prefisso sci*.
// ============================================================
// Tutto il bot Telegram in una pagina: Cruscotto, Messaggi, Fotosegnalazioni, Richieste
// volontari, Mappa, Iscritti. Permessi: pannello con 'sci', 'eventi' o 'gestione_segnalazioni';
// Richieste volontari con 'sci' o 'gestione_segnalazioni', le altre schede con 'sci' o 'eventi'.
// Il server ricontrolla sempre: Edge Function bot-app (btChiama in bot-telegram.js, azioni
// iscritti, squadre, conta, invia, scollega, rispondi_richiesta) e regole RLS
// (supabase/sci_01_permessi.sql). Ogni testo che arriva dal database passa da aggEsc.
// ============================================================

const SCI_SCHEDE = [
  ['cruscotto', 'Cruscotto'], ['messaggi', 'Messaggi'], ['foto', 'Fotosegnalazioni'],
  ['richieste', 'Richieste volontari'], ['mappa', 'Mappa'], ['iscritti', 'Iscritti'],
];
const SCI_PERIODI = [['', 'Sempre'], ['7', 'Ultimi 7 giorni'], ['30', 'Ultimi 30 giorni'], ['90', 'Ultimi 90 giorni'], ['365', 'Ultimo anno']];
const SCI_LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const SCI_ND = '<div class="empty">Non disponibile.</div>';

let sci = {
  tab: 'cruscotto', pre: null,
  iscritti: null, foto: null, eventi: null, richieste: null,
  fStato: 'da', fEvento: '', fPeriodo: '', rStato: 'da', cerca: '',
  invio: null, mappa: null,
};

function sciEl(id) { return document.getElementById(id); }
function sciPuoBot() { return hasPerm('sci') || hasPerm('eventi'); }
function sciPuoRich() { return hasPerm('sci') || hasPerm('gestione_segnalazioni'); }
function sciPuo(tab) { return tab === 'cruscotto' ? sciPuoBot() || sciPuoRich() : tab === 'richieste' ? sciPuoRich() : sciPuoBot(); }
function sciData(d, ora) {
  return d ? new Date(d).toLocaleString('it-IT', ora ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
function sciMappaLink(r) { return 'https://www.google.com/maps?q=' + encodeURIComponent(r.lat + ',' + r.lon); }
function sciChip(attivo, testo, onclick, n) {
  return '<button class="chip' + (attivo ? ' on' : '') + '" onclick="' + onclick + '">' + testo + (n != null ? ' <span class="n">' + n + '</span>' : '') + '</button>';
}

// Conta le righe senza scaricarle (null se non si può leggere)
async function sciConta(percorso) {
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/' + percorso, { headers: Object.assign({}, H, { 'Prefer': 'count=exact', 'Range': '0-0' }), silenzioso: true });
    if (!res.ok) return null;
    return parseInt((res.headers.get('Content-Range') || '').split('/')[1] || '0', 10) || 0;
  } catch(e) { return null; }
}

// -- APERTURA E SCHEDE --
// Da altre pagine: sciApri('messaggi', { evento: 12 }), sciApri('foto', { evento: 'generiche' })
function sciApri(tab, pre) {
  sci.tab = tab || 'cruscotto';
  sci.pre = pre || null;
  if (sci.pre && sci.pre.evento && tab === 'foto') { sci.fEvento = String(sci.pre.evento); sci.fStato = 'da'; }
  navTo('sci', 'S.C.I.', null);
}

async function caricaSci() {
  if (!sciPuo(sci.tab)) sci.tab = SCI_SCHEDE.map(t => t[0]).find(sciPuo) || 'cruscotto';
  sci.iscritti = sci.foto = sci.richieste = sci.eventi = null;
  sciRenderSchede();
  await sciMostra(sci.tab);
}

function sciRenderSchede() {
  sciEl('sciTabs').innerHTML = SCI_SCHEDE.filter(t => sciPuo(t[0])).map(t =>
    '<button class="chip' + (sci.tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (sci.tab === t[0]) + '" onclick="sciMostra(\'' + t[0] + '\')">' + t[1] + '</button>').join('');
}

async function sciMostra(tab) {
  if (!sciPuo(tab)) return;
  if (sci.mappa && tab !== 'mappa') { sci.mappa.map.remove(); sci.mappa = null; }
  sci.tab = tab;
  sciRenderSchede();
  const corpo = sciEl('sciCorpo');
  corpo.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    await ({ cruscotto: sciCruscotto, messaggi: sciMessaggi, foto: sciFoto, richieste: sciRichieste, mappa: sciMappa, iscritti: sciIscritti })[tab]();
  } catch(e) { if (sci.tab === tab) corpo.innerHTML = SCI_ND; }
  sci.pre = null;
}

// -- DATI CONDIVISI --
async function sciCaricaIscritti() {
  if (!sci.iscritti) sci.iscritti = await btChiama('iscritti');
  return sci.iscritti;
}
async function sciCaricaEventi() {
  if (!sci.eventi) {
    const res = await sbFetch(SUPA_URL + '/rest/v1/eventi?select=id,titolo,tipo,stato,data_inizio&order=data_inizio.desc,id.desc&limit=200', { headers: H });
    sbOk(res);
    sci.eventi = await res.json();
  }
  return sci.eventi;
}
async function sciCaricaFoto() {
  if (!sci.foto) {
    const [res] = await Promise.all([
      sbFetch(SUPA_URL + '/rest/v1/evento_segnalazioni?select=id,evento_id,descrizione,foto_path,gestita,lat,lon,volontario_id,creato_il&order=creato_il.desc&limit=500', { headers: H }),
      sciCaricaEventi(), evCaricaVolontari(),
    ]);
    sbOk(res);
    const righe = await res.json();
    await sbFirmaRighe(righe, 'foto_path');
    sci.foto = righe;
  }
  return sci.foto;
}
function sciTitoloEvento(id) {
  if (!id) return 'Generica';
  const e = (sci.eventi || []).find(x => x.id === id);
  return e ? e.titolo : 'Evento n. ' + id;
}
function sciOpzEventi(sel, conGeneriche) {
  return '<option value="">Tutti gli eventi</option>' + (conGeneriche ? '<option value="generiche"' + (sel === 'generiche' ? ' selected' : '') + '>Solo generiche</option>' : '')
    + (sci.eventi || []).map(e => '<option value="' + e.id + '"' + (String(e.id) === sel ? ' selected' : '') + '>' + aggEsc(e.titolo) + '</option>').join('');
}
// Filtri evento e periodo, comuni a Fotosegnalazioni e Mappa
function sciFiltraFoto(conStato) {
  const da = sci.fPeriodo ? Date.now() - Number(sci.fPeriodo) * 86400000 : 0;
  return (sci.foto || []).filter(s =>
    (!conStato || sci.fStato === 'tutte' || (sci.fStato === 'da' ? !s.gestita : s.gestita))
    && (!sci.fEvento || (sci.fEvento === 'generiche' ? !s.evento_id : String(s.evento_id) === sci.fEvento))
    && (!da || new Date(s.creato_il).getTime() >= da));
}
function sciFiltriEventoPeriodo(onchange) {
  return '<label class="sci-sel">Evento<select id="sciFEv" onchange="sci.fEvento=this.value;' + onchange + '">' + sciOpzEventi(sci.fEvento, true) + '</select></label>'
    + '<label class="sci-sel">Periodo<select id="sciFPer" onchange="sci.fPeriodo=this.value;' + onchange + '">'
    + SCI_PERIODI.map(p => '<option value="' + p[0] + '"' + (p[0] === sci.fPeriodo ? ' selected' : '') + '>' + p[1] + '</option>').join('') + '</select></label>';
}

// -- BADGE DEL MENU (fotosegnalazioni + richieste da gestire) --
async function sciAggiornaBadge() {
  const b = sciEl('siBadgeSci');
  if (!b) return;
  const [foto, rich] = await Promise.all([
    sciPuoBot() ? sciConta('evento_segnalazioni?gestita=eq.false&select=id') : 0,
    sciPuoRich() ? sciConta('segnalazioni?gestita=eq.false&select=id') : 0,
  ]);
  const tot = (foto || 0) + (rich || 0);
  b.textContent = tot ? String(tot) : '';
  b.classList.toggle('show', tot > 0);
}

// -- CRUSCOTTO --
async function sciCruscotto() {
  const [isc, foto, rich, allerta] = await Promise.all([
    sciPuoBot() ? sciCaricaIscritti().catch(() => null) : null,
    sciPuoBot() ? sciConta('evento_segnalazioni?gestita=eq.false&select=id') : null,
    sciPuoRich() ? sciConta('segnalazioni?gestita=eq.false&select=id') : null,
    alLeggi(),
  ]);
  if (sci.tab !== 'cruscotto') return;
  const tile = (onclick, titolo, valore, sotto, cls) => '<button class="card sci-tile' + (cls ? ' ' + cls : '') + '" onclick="' + onclick + '"><span class="sci-tile-t">' + titolo + '</span><b>' + valore + '</b>' + (sotto ? '<span class="sci-tile-s">' + sotto + '</span>' : '') + '</button>';
  let h = '';
  if (sciPuoBot()) {
    h += isc ? tile("sciMostra('iscritti')", 'Iscritti al bot', isc.collegati.length + ' su ' + (isc.collegati.length + isc.mancanti.length), 'volontari attivi e sospesi collegati')
             : tile("sciMostra('iscritti')", 'Iscritti al bot', '—', 'Non disponibile');
    h += tile("sci.fStato='da';sci.fEvento='';sciMostra('foto')", 'Fotosegnalazioni', foto == null ? '—' : foto, 'da gestire', foto ? 'sci-attenzione' : '');
  }
  if (sciPuoRich()) h += tile("sci.rStato='da';sciMostra('richieste')", 'Richieste volontari', rich == null ? '—' : rich, 'da gestire', rich ? 'sci-attenzione' : '');
  h += sciTileAllerta(allerta.stato, allerta.errore);
  sciEl('sciCorpo').innerHTML = '<div class="sci-cruscotto">' + h + '</div>';
}

// Stessa regola della card in Home (alSintesi): dato vecchio o scaduto = grigio, mai verde finto
function sciTileAllerta(s, errore) {
  const x = alSintesi(s, errore);
  let titolo = x.livello.titolo, sotto = 'Zona ' + AL_ZONA_NOME, cls = x.livello.cls;
  if (x.nessunDato) { titolo = 'Dato non disponibile'; sotto = 'Controlla il bollettino ufficiale'; }
  else if (x.nonAggiornato) {
    cls = 'al-nd';
    titolo = x.scaduto ? 'Bollettino scaduto' : 'Dato non aggiornato';
    sotto = 'Ultimo aggiornamento ' + alOra(s.aggiornato_il) + ' del ' + alGiornoBreve(s.aggiornato_il) + (x.scaduto ? '' : ' · ' + x.livello.titolo.toLowerCase());
  }
  return '<button class="card sci-tile sci-allerta ' + cls + '" onclick="navTo(\'home\',\'Home\',null)"><span class="sci-tile-t">Allerta ARPA</span><b>' + aggEsc(titolo) + '</b><span class="sci-tile-s">' + aggEsc(sotto) + '</span></button>';
}

// -- MESSAGGI --
async function sciMessaggi() {
  const [sq, isc] = await Promise.all([btChiama('squadre'), sciCaricaIscritti(), sciCaricaEventi()]);
  if (sci.tab !== 'messaggi') return;
  const preEv = sci.pre && sci.pre.evento ? Number(sci.pre.evento) : 0;
  const eventi = sci.eventi || [];
  sci.invio = null;
  sciEl('sciCorpo').innerHTML = '<div class="sci-due"><div class="card form" id="sciInvio">'
    + '<h2>Nuovo messaggio</h2><div class="form-err" id="sciErr"></div>'
    + '<label>Testo<textarea id="sciTesto" rows="5" maxlength="4000"></textarea></label>'
    + '<label>Destinatari<select id="sciTipo" onchange="sciAggiornaDest()"><option value="tutti">Tutti i collegati (' + sq.n + ')</option>'
    + (sq.squadre.length ? '<option value="squadra">Una squadra</option>' : '')
    + (eventi.length ? '<option value="evento"' + (preEv ? ' selected' : '') + '>La squadra di un evento</option>' : '')
    + (isc.collegati.length ? '<option value="scelti">Volontari scelti</option>' : '') + '</select></label>'
    + '<label id="sciSquadraBox" hidden>Squadra<select id="sciSquadra">' + sq.squadre.map(s => '<option>' + aggEsc(s) + '</option>').join('') + '</select></label>'
    + '<label id="sciEventoBox" hidden>Evento<select id="sciEvento">' + eventi.map(e => '<option value="' + e.id + '"' + (e.id === preEv ? ' selected' : '') + '>' + aggEsc(e.titolo) + '</option>').join('') + '</select></label>'
    + '<div id="sciSceltiBox" hidden><label class="search sci-cerca"><input type="search" id="sciSceltiCerca" placeholder="Cerca tra i collegati" oninput="sciFiltraScelti()"></label>'
    + '<div class="sci-scelti" id="sciScelti">' + isc.collegati.map(v => '<label class="perm-check" data-nome="' + aggEsc((v.cognome + ' ' + v.nome + ' ' + v.squadra).toLowerCase()) + '"><input type="checkbox" value="' + v.volontario_id + '" onchange="sciContaScelti()"> '
      + aggEsc(v.cognome + ' ' + v.nome) + (v.squadra ? ' <span class="sub inl">' + aggEsc(v.squadra) + '</span>' : '') + '</label>').join('') + '</div>'
    + '<p class="sub" id="sciSceltiN">Nessuno scelto.</p></div>'
    + '<label class="perm-check"><input type="checkbox" id="sciArpa"> Allega il bollettino ARPA (livelli e link, solo se il dato è aggiornato)</label>'
    + '<div class="actions"><button class="btn pri" id="sciBtnAnteprima" onclick="sciAnteprima()">Anteprima</button></div></div>'
    + '<div class="card"><h2>Ultimi invii</h2><div id="sciStorico"><div class="loading-msg">Caricamento…</div></div></div></div>';
  sciAggiornaDest();
  sciCaricaStorico();
}

function sciAggiornaDest() {
  const tipo = sciEl('sciTipo').value;
  sciEl('sciSquadraBox').hidden = tipo !== 'squadra';
  sciEl('sciEventoBox').hidden = tipo !== 'evento';
  sciEl('sciSceltiBox').hidden = tipo !== 'scelti';
}
function sciFiltraScelti() {
  const q = sciEl('sciSceltiCerca').value.trim().toLowerCase();
  document.querySelectorAll('#sciScelti label').forEach(l => { l.hidden = q && !l.dataset.nome.includes(q); });
}
function sciIdScelti() { return [...document.querySelectorAll('#sciScelti input:checked')].map(i => Number(i.value)); }
function sciContaScelti() {
  const n = sciIdScelti().length;
  sciEl('sciSceltiN').textContent = n ? n + (n === 1 ? ' volontario scelto.' : ' volontari scelti.') : 'Nessuno scelto.';
}
function sciErrore(t) { const e = sciEl('sciErr'); if (!e) return sbAvviso(t); e.textContent = t; e.style.display = 'block'; }

function sciCorpoInvio() {
  const tipo = sciEl('sciTipo').value;
  return {
    testo: sciEl('sciTesto').value.trim(), tipo, arpa: sciEl('sciArpa').checked,
    squadra: tipo === 'squadra' ? sciEl('sciSquadra').value : undefined,
    evento_id: tipo === 'evento' ? Number(sciEl('sciEvento').value) : undefined,
    volontari: tipo === 'scelti' ? sciIdScelti() : undefined,
  };
}

async function sciAnteprima() {
  const corpo = sciCorpoInvio(), btn = sciEl('sciBtnAnteprima');
  sciEl('sciErr').style.display = 'none';
  if (!corpo.testo) return sciErrore('Scrivi il testo del messaggio.');
  if (corpo.tipo === 'scelti' && !corpo.volontari.length) return sciErrore('Scegli almeno un volontario.');
  btn.disabled = true;
  try {
    const d = await btChiama('conta', corpo);
    btn.disabled = false;
    if (!d.n) return sciErrore('Nessun destinatario collegato al bot.');
    sci.invio = { corpo, n: d.n };
    sciEl('sciInvio').innerHTML = '<h2>Conferma invio</h2><div class="form-err" id="sciErr"></div>'
      + '<div class="kv"><span>Destinatari</span><b>' + aggEsc(d.destinatari) + ' (' + d.n + ')</b></div>'
      + '<p class="em-desc">' + aggEsc(corpo.testo) + '</p>' + (corpo.arpa ? '<p class="sub mt10">Segue un secondo messaggio con il bollettino ARPA.</p>' : '')
      + '<div class="actions"><button class="btn" onclick="sciMostra(\'messaggi\')">Annulla</button><button class="btn pri" id="sciBtnInvia" onclick="sciConferma()">Invia a ' + d.n + (d.n === 1 ? ' persona' : ' persone') + '</button></div>';
  } catch(e) { btn.disabled = false; sciErrore(e.message); }
}

async function sciConferma() {
  const btn = sciEl('sciBtnInvia');
  btn.disabled = true; btn.textContent = 'Invio in corso…';
  try {
    const d = await btChiama('invia', sci.invio.corpo);
    sci.invio = null;
    sciEl('sciInvio').innerHTML = '<h2>Messaggio inviato</h2><div class="kv"><span>Consegnati</span><b>' + d.consegnati + ' su ' + d.n + '</b></div>'
      + (d.falliti.length ? '<div class="grp">Non consegnati (' + d.falliti.length + ')</div>' + d.falliti.map(f => '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(f.nome) + '</div><div class="doc-item-meta">' + aggEsc(f.motivo) + '</div></div></div>').join('') : '')
      + '<div class="actions"><button class="btn pri" onclick="sciMostra(\'messaggi\')">Nuovo messaggio</button></div>';
    sciCaricaStorico();
  } catch(e) { btn.disabled = false; btn.textContent = 'Riprova'; sciErrore(e.message + ' Controlla gli ultimi invii prima di riprovare.'); }
}

async function sciCaricaStorico() {
  const box = sciEl('sciStorico');
  let righe;
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/bot_invii?select=creato_il,utente,testo,destinatari,n_destinatari,consegnati,falliti,con_arpa&order=creato_il.desc&limit=20', { headers: H });
    sbOk(res);
    righe = await res.json();
  } catch(e) { if (box) box.innerHTML = SCI_ND; return; }
  if (!sciEl('sciStorico')) return;
  sciEl('sciStorico').innerHTML = !righe.length ? '<p class="sub">Nessun invio.</p>' : righe.map(r => '<details class="doc-item sci-invio"><summary><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(r.testo.slice(0, 80)) + (r.testo.length > 80 ? '…' : '') + '</div>'
    + '<div class="doc-item-meta">' + aggEsc(sciData(r.creato_il, true) + ' · ' + r.utente + ' · ' + r.destinatari + ' · ' + (r.consegnati == null ? 'in corso' : r.consegnati + ' su ' + r.n_destinatari + ' consegnati')) + (r.con_arpa ? ' · con bollettino ARPA' : '') + '</div></div></summary>'
    + '<p class="seg-text">' + aggEsc(r.testo) + '</p></details>').join('');
}

// -- FOTOSEGNALAZIONI --
async function sciFoto() {
  await sciCaricaFoto();
  if (sci.tab === 'foto') sciRenderFoto();
}

function sciRenderFoto() {
  const tutte = sci.foto || [];
  const base = sciFiltraFoto(false), lista = sciFiltraFoto(true);
  const n = k => base.filter(s => k === 'tutte' || (k === 'da' ? !s.gestita : s.gestita)).length;
  sciEl('sciCorpo').innerHTML = '<div class="bar sci-filtri"><div class="chips">'
    + [['da', 'Da gestire'], ['gestite', 'Gestite'], ['tutte', 'Tutte']].map(f => sciChip(sci.fStato === f[0], f[1], "sci.fStato='" + f[0] + "';sciRenderFoto()", n(f[0]))).join('') + '</div>'
    + sciFiltriEventoPeriodo('sciRenderFoto()') + '</div>'
    + (!tutte.length ? '<div class="empty">Nessuna fotosegnalazione.</div>'
      : !lista.length ? '<div class="empty">Nessuna fotosegnalazione con questi filtri.</div>'
      : '<div class="grid g3">' + lista.map(sciCardFoto).join('') + '</div>');
}

function sciCardFoto(s) {
  const stato = s.gestita ? '<span class="pill p-grey">Gestita</span>' : '<span class="pill p-yellow">Da gestire</span>';
  const foto = !s.foto_path ? ''
    : s._file ? '<a class="thumb em-foto" href="' + aggEsc(s._file) + '" target="_blank" rel="noopener" data-sb-file="' + aggEsc(s.foto_path) + '" data-sb-t="' + Date.now() + '"><img src="' + aggEsc(s._file) + '" alt="" loading="lazy" onerror="this.remove()"></a>'
    : '<p class="sub mt10">Foto non disponibile</p>';
  const assegna = s.evento_id ? '' : '<div class="sci-assegna"><select id="sciAss' + s.id + '" aria-label="Evento"><option value="">Assegna a evento…</option>'
    + (sci.eventi || []).map(e => '<option value="' + e.id + '">' + aggEsc((EV_TIPI[e.tipo] || e.tipo || '') + ': ' + e.titolo) + '</option>').join('') + '</select>'
    + '<button class="btn sm pri" onclick="sciAssegna(' + s.id + ')">Assegna</button></div>';
  return '<div class="card em-card"><div class="vc"><div class="mid"><b>' + aggEsc(s.volontario_id ? evNomeVol(s.volontario_id) : 'Segnalazione') + '</b>'
    + '<span class="sub">' + aggEsc(sciData(s.creato_il, true)) + ' · ' + aggEsc(sciTitoloEvento(s.evento_id)) + '</span></div>' + stato + '</div>'
    + foto + (s.descrizione ? '<p class="em-desc">' + aggEsc(s.descrizione) + '</p>' : '') + assegna
    + '<div class="em-azioni">' + (s.lat != null && s.lon != null ? '<a href="' + sciMappaLink(s) + '" target="_blank" rel="noopener" class="btn sm">Google Maps</a>' : '')
    + (s.gestita ? '<button class="btn sm" onclick="sciStatoFoto(' + s.id + ',false)">Riapri</button>'
                 : '<button class="btn sm pri" onclick="sciStatoFoto(' + s.id + ',true)">Gestita</button>') + '</div></div>';
}

async function sciStatoFoto(id, gestita) {
  try {
    const [riga] = await evScrivi('PATCH', 'evento_segnalazioni?id=eq.' + id, { gestita });
    const s = sci.foto.find(x => x.id === id);
    if (s) s.gestita = riga.gestita;
    await logAttivita((gestita ? 'ha gestito' : 'ha riaperto') + ' una fotosegnalazione (' + sciTitoloEvento(s && s.evento_id) + ')');
    sciRenderFoto();
    sciAggiornaBadge();
  } catch(e) { sbAvviso('Modifica non salvata.'); }
}

async function sciAssegna(id) {
  const sel = sciEl('sciAss' + id), eventoId = sel && Number(sel.value);
  if (!eventoId) { sbAvviso('Scegli un evento.'); return; }
  try {
    await evAssegnaSegnalazione(id, eventoId, sciTitoloEvento(eventoId));
    const s = sci.foto.find(x => x.id === id);
    if (s) s.evento_id = eventoId;
    sbAvviso('Assegnata a: ' + sciTitoloEvento(eventoId));
    sciRenderFoto();
  } catch(e) { sbAvviso('Assegnazione non riuscita.'); }
}

// -- RICHIESTE VOLONTARI (tabella segnalazioni: correzioni chieste dai volontari) --
async function sciRichieste() {
  const [res, isc] = await Promise.all([
    sbFetch(SUPA_URL + '/rest/v1/segnalazioni?select=*,volontario:volontario_id(id,cognome,nome,codice_fiscale)&order=gestita.asc,data_creazione.desc', { headers: H }),
    sciPuoBot() ? sciCaricaIscritti().catch(() => null) : null,
  ]);
  sbOk(res);
  sci.richieste = await res.json();
  if (sci.tab === 'richieste') sciRenderRichieste();
}

function sciRenderRichieste() {
  const tutte = sci.richieste || [];
  const collegati = new Set(sci.iscritti ? sci.iscritti.collegati.map(c => c.volontario_id) : []);
  const filtro = k => s => k === 'tutte' || (k === 'da' ? !s.gestita : s.gestita);
  const lista = tutte.filter(filtro(sci.rStato));
  sciEl('sciCorpo').innerHTML = '<div class="bar"><div class="chips">'
    + [['da', 'Da gestire'], ['risolte', 'Risolte'], ['tutte', 'Tutte']].map(f => sciChip(sci.rStato === f[0], f[1], "sci.rStato='" + f[0] + "';sciRenderRichieste()", tutte.filter(filtro(f[0])).length)).join('')
    + '</div></div>'
    + (!lista.length ? '<div class="empty">Nessuna richiesta.</div>' : '<div class="grid g3">' + lista.map(s => {
      const v = s.volontario || {};
      const ini = ((v.cognome || '?')[0] + (v.nome || ' ')[0]).toUpperCase();
      const stato = s.gestita ? '<span class="pill p-blue">Risolta</span>' : '<span class="pill p-yellow">Da gestire</span>';
      const bot = collegati.has(s.volontario_id);
      return '<div class="card">'
        + '<div class="vc"><span class="av">' + aggEsc(ini) + '</span><div class="mid"><b>' + aggEsc((v.cognome || '?') + ' ' + (v.nome || '')) + '</b><span class="sub">' + aggEsc(sciData(s.data_creazione, true)) + ' · CF ' + aggEsc(v.codice_fiscale || '—') + '</span></div>' + stato + '</div>'
        + '<p class="seg-text">' + aggEsc(s.testo || '') + '</p>'
        + '<label class="seg-nota">Risposta al volontario<textarea id="sciRisp' + s.id + '" rows="2" placeholder="Facoltativa">' + aggEsc(s.note_admin || '') + '</textarea></label>'
        + (bot ? '<label class="perm-check sci-avvisa"><input type="checkbox" id="sciAvv' + s.id + '" checked> Avvisa su Telegram</label>' : '')
        + '<div class="em-azioni">'
        + (s.gestita ? '<button class="btn sm" onclick="sciStatoRichiesta(' + s.id + ',false)">Riapri</button>'
                     : '<button class="btn sm pri" onclick="sciStatoRichiesta(' + s.id + ',true)">Segna come risolta</button>')
        + '<button class="btn sm" id="sciSalva' + s.id + '" onclick="sciSalvaRisposta(' + s.id + ')">Salva risposta</button></div></div>';
    }).join('') + '</div>');
}

async function sciSalvaRisposta(id) {
  const testo = sciEl('sciRisp' + id).value.trim(), avv = sciEl('sciAvv' + id), btn = sciEl('sciSalva' + id);
  btn.disabled = true;
  try {
    const d = await btChiama('rispondi_richiesta', { id, risposta: testo, avvisa: !!(avv && avv.checked) });
    const s = sci.richieste.find(x => x.id === id);
    if (s) s.note_admin = testo || null;
    sbAvviso(d.inviato ? 'Risposta salvata e inviata su Telegram' : 'Risposta salvata');
  } catch(e) { sbAvviso(e.message || 'Risposta non salvata.'); }
  btn.disabled = false;
}

async function sciStatoRichiesta(id, gestita) {
  try {
    const body = { gestita };
    if (gestita) body.data_gestione = new Date().toISOString();
    const res = await sbFetch(SUPA_URL + '/rest/v1/segnalazioni?id=eq.' + id, { method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=representation' }), body: JSON.stringify(body) });
    const righe = res.ok ? await res.json() : [];
    if (!righe.length) throw new Error();
    const s = sci.richieste.find(x => x.id === id);
    if (s) s.gestita = gestita;
    sciRenderRichieste();
    sciAggiornaBadge();
  } catch(e) { sbAvviso('Modifica non salvata.'); }
}

// -- MAPPA (Leaflet + OpenStreetMap) --
// Livelli: fotosegnalazioni; "posizioni in diretta" è pronto ma vuoto (fase 2).
function sciCaricaLeaflet() {
  if (window.L) return Promise.resolve();
  if (sci.leaflet) return sci.leaflet;
  sci.leaflet = new Promise((ok, ko) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = SCI_LEAFLET + 'leaflet.min.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = SCI_LEAFLET + 'leaflet.min.js';
    s.onload = ok; s.onerror = () => { sci.leaflet = null; ko(new Error('Mappa non disponibile.')); };
    document.head.appendChild(s);
  });
  return sci.leaflet;
}

async function sciMappa() {
  await Promise.all([sciCaricaFoto(), sciCaricaLeaflet()]);
  if (sci.tab !== 'mappa') return;
  sciEl('sciCorpo').innerHTML = '<div class="bar sci-filtri">' + sciFiltriEventoPeriodo('sciDisegnaPunti()') + '<span class="sub" id="sciMappaN"></span></div>'
    + '<div class="card sci-mappa-box"><div id="sciMappa" class="sci-mappa" role="region" aria-label="Mappa delle fotosegnalazioni"></div></div>'
    + '<p class="sub mt10">Punti rossi: da gestire · grigi: gestite. Mappa © OpenStreetMap.</p>';
  if (sci.mappa) sci.mappa.map.remove();
  const map = L.map('sciMappa', { scrollWheelZoom: false }).setView([45.135, 8.45], 11);   // Casale Monferrato
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
  const foto = L.layerGroup().addTo(map);
  const diretta = L.layerGroup();   // fase 2: posizioni in diretta dei volontari
  L.control.layers(null, { 'Fotosegnalazioni': foto, 'Posizioni in diretta (in arrivo)': diretta }, { collapsed: true }).addTo(map);
  sci.mappa = { map, foto, diretta };
  sciDisegnaPunti();
  setTimeout(() => sci.mappa && sci.mappa.map.invalidateSize(), 200);
}

function sciDisegnaPunti() {
  if (!sci.mappa) return;
  const { map, foto } = sci.mappa;
  foto.clearLayers();
  const punti = sciFiltraFoto(false).filter(s => s.lat != null && s.lon != null);
  punti.forEach(s => {
    const popup = '<div class="sci-popup">' + (s._file ? '<img src="' + aggEsc(s._file) + '" alt="">' : '')
      + '<b>' + aggEsc(s.volontario_id ? evNomeVol(s.volontario_id) : 'Segnalazione') + '</b><br>' + aggEsc(sciData(s.creato_il, true)) + '<br>' + aggEsc(sciTitoloEvento(s.evento_id))
      + (s.descrizione ? '<br><i>' + aggEsc(s.descrizione.slice(0, 140)) + '</i>' : '')
      + '<br><a href="' + sciMappaLink(s) + '" target="_blank" rel="noopener">Google Maps</a></div>';
    L.circleMarker([s.lat, s.lon], { radius: 9, weight: 2, color: '#fff', fillOpacity: .9, fillColor: s.gestita ? '#7a869a' : '#d93025' }).bindPopup(popup, { maxWidth: 240 }).addTo(foto);
  });
  const n = sciEl('sciMappaN');
  if (n) n.textContent = punti.length + (punti.length === 1 ? ' punto' : ' punti');
  if (punti.length) map.fitBounds(L.latLngBounds(punti.map(s => [s.lat, s.lon])), { padding: [30, 30], maxZoom: 15 });
}

// -- ISCRITTI --
async function sciIscritti() {
  await sciCaricaIscritti();
  if (sci.tab === 'iscritti') sciRenderIscritti();
}

function sciRenderIscritti() {
  const isc = sci.iscritti, q = sci.cerca.trim().toLowerCase();
  const filtra = v => !q || (v.cognome + ' ' + v.nome + ' ' + v.squadra + ' ' + (v.telefono || '')).toLowerCase().includes(q);
  const col = isc.collegati.filter(filtra), man = isc.mancanti.filter(filtra);
  const nomeJs = v => aggEsc(JSON.stringify(v.cognome + ' ' + v.nome));
  const tot = isc.collegati.length + isc.mancanti.length;
  const vecchia = sciEl('sciCerca'), aveva = vecchia && document.activeElement === vecchia;
  sciEl('sciCorpo').innerHTML = '<div class="bar"><b class="sci-totale">Collegati ' + isc.collegati.length + ' su ' + tot + '</b><span class="grow"></span>'
    + '<label class="search" for="sciCerca"><input type="search" id="sciCerca" placeholder="Cerca volontario" autocomplete="off" value="' + aggEsc(sci.cerca) + '" oninput="sci.cerca=this.value;sciRenderIscritti()"></label>'
    + '<button class="btn sm" onclick="sci.iscritti=null;sciMostra(\'iscritti\')">Aggiorna</button></div>'
    + '<div class="sci-due">'
    + '<div class="card"><h2>Collegati (' + col.length + ')</h2>' + (!col.length ? '<p class="sub">Nessuno.</p>' : '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Volontario</th><th class="sx sci-sq">Squadra</th><th class="sx">Collegato dal</th><th></th></tr></thead><tbody>'
      + col.map(v => '<tr><td class="sx">' + aggEsc(v.cognome + ' ' + v.nome) + (v.squadra ? '<span class="sub sci-sq-m">' + aggEsc(v.squadra) + '</span>' : '') + '</td><td class="sx sci-sq">' + aggEsc(v.squadra || '—') + '</td><td class="sx">' + aggEsc(sciData(v.collegato_il)) + '</td>'
        + '<td class="ev-az"><button class="btn sm" onclick="btApriLink(' + v.volontario_id + ',' + nomeJs(v) + ')">Link bot</button><button class="btn sm danger" onclick="btScollega(' + v.volontario_id + ',' + nomeJs(v) + ',sciDopoScollega)">Scollega</button></td></tr>').join('')
      + '</tbody></table></div>') + '</div>'
    + '<div class="card"><h2>Non collegati (' + man.length + ')</h2>' + (!man.length ? '<p class="sub">Nessuno.</p>' : '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Volontario</th><th class="sx sci-sq">Squadra</th><th class="sx">Telefono</th><th></th></tr></thead><tbody>'
      + man.map(v => '<tr><td class="sx">' + aggEsc(v.cognome + ' ' + v.nome) + (v.squadra ? '<span class="sub sci-sq-m">' + aggEsc(v.squadra) + '</span>' : '') + '</td><td class="sx sci-sq">' + aggEsc(v.squadra || '—') + '</td><td class="sx">' + aggEsc(v.telefono || '—') + '</td>'
        + '<td class="ev-az"><button class="btn sm pri" onclick="btApriLink(' + v.volontario_id + ',' + nomeJs(v) + ')">Crea link</button></td></tr>').join('')
      + '</tbody></table></div>') + '</div></div>';
  if (aveva) { const c = sciEl('sciCerca'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
}

function sciDopoScollega() {
  sbAvviso('Volontario scollegato.');
  sci.iscritti = null;
  sciMostra('iscritti');
}
