// ============================================================
// AMMINISTRAZIONE — pagina Gestione accessi, prefisso ga*, solo master.
// ============================================================
// Ogni persona è un volontario. Con volontari.email si entra da volontario; con una mail in
// email_accesso si entra con il ruolo della riga in staff. Gli utenti di login nascono al primo
// accesso. Qui il controllo master è solo d'interfaccia: la sicurezza sta nelle regole di
// staff ed email_accesso, e il database rifiuta da sé la rimozione dell'ultimo master.
// ============================================================

// Tutte le chiavi usate da menu, hasPerm e ho_permesso, raggruppate come il menu.
// scheda_personale e segnalazioni non ci sono: valgono solo per i volontari.
const GA_GRUPPI = [
  ['Principali', [['volontari', 'Volontari'], ['modifica_volontari', 'Modifica volontari'], ['documenti', 'Documenti volontari'], ['documenti_volontari', 'Vedere archivio documenti volontari'], ['interventi', 'Interventi']]],
  ['Logistica', [['mezzi', 'Mezzi'], ['dotazioni', 'Dotazioni'], ['pianicarico', 'Piani di carico'], ['tlc', 'TLC']]],
  ['Strumenti', [['postazioni', 'Postazioni'], ['galleria', 'Galleria'], ['editor_pdf', 'Editor PDF base'], ['editor_pdf_completo', 'Editor PDF completo'], ['convocazioni', 'Convocazioni (vede)'], ['convocazioni_gestione', 'Convocazioni: crea e gestisce liste'], ['eventi', 'Eventi'], ['sci', 'S.C.I. (Sistema di Comunicazione Interattivo)']]],
  ['Amministrazione', [['visite', 'Visite mediche'], ['formazione', 'Formazione'], ['aggiornamento_dati', 'Aggiornamento dati'], ['statistiche', 'Statistiche'], ['elenchi', 'Elenchi'], ['gestione_segnalazioni', 'Gestione segnalazioni'], ['richieste', 'Richieste'], ['db', 'DB avanzato'], ['accessi', 'Registro accessi'], ['impostazioni', 'Impostazioni'], ['referenti', 'Referenti (caposquadra, coordinatore, segreteria)']]],
  ['Bot Telegram', [['bot_segnalazioni', 'Riceve le segnalazioni del bot'], ['bot_avvisi_tecnici', 'Riceve gli avvisi tecnici'], ['bot_interventi', 'Registra interventi dal bot (serve anche Interventi)']]],
];
const GA_PERMESSI = GA_GRUPPI.flatMap(g => g[1]);
// Una riga di spiegazione per la finestra Permessi (una chiave nuova va aggiunta anche qui)
const GA_DESCR = {
  volontari: 'Vede l\'elenco e le schede dei volontari',
  modifica_volontari: 'Modifica anagrafica, stato e dati dei volontari',
  documenti: 'Documenti dei volontari nella scheda: li vede e li carica',
  documenti_volontari: 'Apre attestati e documenti archiviati su Drive',
  interventi: 'Registro interventi: crea, modifica, fogli firma',
  mezzi: 'Mezzi con documenti e scadenze',
  dotazioni: 'Magazzino e dotazioni',
  pianicarico: 'Piani di carico dei mezzi',
  tlc: 'Radio e apparati TLC',
  postazioni: 'Postazioni e mappe dei servizi',
  galleria: 'Galleria foto',
  editor_pdf: 'Compila e firma PDF nel browser',
  editor_pdf_completo: 'Anche modelli e firme a distanza',
  convocazioni: 'Vede il generatore di convocazioni e lo storico',
  convocazioni_gestione: 'Crea convocazioni e gestisce le liste dei destinatari',
  eventi: 'Esercitazioni, corsi ed emergenze, con foglio firma',
  sci: 'Bot Telegram: messaggi, fotosegnalazioni, mappa, iscritti',
  visite: 'Visite mediche',
  formazione: 'Registro dei corsi e catalogo',
  aggiornamento_dati: 'Approva gli aggiornamenti dei volontari e la verifica piattaforme',
  statistiche: 'Statistiche',
  elenchi: 'Elenchi di volontari, mezzi e dotazioni (Excel, PDF)',
  gestione_segnalazioni: 'Risponde alle richieste di correzione dei volontari',
  richieste: 'Richieste di adesione dal sito',
  db: 'Database avanzato; può anche eliminare i fogli firma',
  accessi: 'Registro degli accessi (solo lettura)',
  impostazioni: 'Impostazioni e liste dell\'app',
  referenti: 'Sceglie caposquadra referenti, coordinatore e segreteria',
  bot_segnalazioni: 'Riceve su Telegram le foto segnalate dai volontari',
  bot_avvisi_tecnici: 'Riceve su Telegram gli avvisi tecnici (allerta ferma, backup…)',
  bot_interventi: 'Nel bot trova il pulsante Registra intervento',
};
// Permessi che da soli non funzionano: accendere il primo accende il secondo, spegnere il secondo spegne il primo
const GA_DIPENDE = { modifica_volontari: 'volontari', editor_pdf_completo: 'editor_pdf', convocazioni_gestione: 'convocazioni', bot_interventi: 'interventi', referenti: 'impostazioni' };
const GA_TIPI = { master: 'Master', standard: 'Standard' };
const GA_ND = 'Non disponibile.';

let gaStaff = [], gaMail = [], gaVolontari = [];
let gaFiltro = '';           // '', 'attivi', 'disattivati'
let gaForm = null;           // { id, volontario_id, mail: [] } della finestra aperta
let gaMailSessione = '';

function gaEl(id) { return document.getElementById(id); }
function gaIo() { return currentUser ? currentUser.volontario_id : null; }
function gaSonoIo(id) { return gaIo() != null && Number(id) === Number(gaIo()); }
function gaVol(id) { return gaVolontari.find(v => v.id === id) || null; }
function gaNome(id) { const v = gaVol(id); return v ? (v.cognome + ' ' + v.nome).trim() : 'Volontario ' + id; }
function gaMailDi(id) { return gaMail.filter(e => e.volontario_id === id); }
function gaAttivoAnagrafica(v) { return (v.stato || 'ATTIVO') !== 'DIMESSO'; }
function gaNorm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

// Scrittura con la riga indietro: 0 righe vuol dire negata dalle regole. Il messaggio del database,
// per esempio sull'ultimo master, si mostra così com'è; un permesso negato diventa "Non disponibile."
async function gaScrivi(metodo, percorso, corpo) {
  const res = await sbFetch(SUPA_URL + '/rest/v1/' + percorso, {
    method: metodo, silenzioso: true,
    headers: Object.assign({}, corpo === undefined ? H : HJ, { 'Prefer': 'return=representation' }),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let dati = null;
  try { dati = await res.json(); } catch(e) {}
  if (res.ok) {
    if (!Array.isArray(dati) || !dati.length) throw new Error(GA_ND);
    return dati;
  }
  const msg = dati && dati.message ? String(dati.message) : '';
  if (dati && dati.code === '23505') throw new Error('Questa mail è già presente.');
  if (res.status === 401 || res.status === 403 || res.status === 503 || !msg || /row-level security|permission denied/i.test(msg)) throw new Error(GA_ND);
  throw new Error(msg);
}

// -- CARICAMENTO --
async function caricaGestioneAccessi() {
  const box = gaEl('gaContenuto');
  if (!box) return;
  gaEl('gaBtnNuovo').hidden = true;
  box.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const leggi = async p => { const r = await sbFetch(SUPA_URL + '/rest/v1/' + p, { headers: H }); sbOk(r); return r.json(); };
    [gaStaff, gaMail, gaVolontari] = await Promise.all([
      leggi('staff?select=volontario_id,tipo_accesso,attivo,permessi'),
      leggi('email_accesso?select=id,volontario_id,email&order=email'),
      leggi('volontari?select=id,cognome,nome,stato,email&order=cognome,nome'),
    ]);
    const { data } = await auClient.auth.getSession();
    gaMailSessione = gaNorm(data.session && data.session.user && data.session.user.email);
  } catch(e) { box.innerHTML = '<div class="empty">' + GA_ND + '</div>'; return; }
  gaEl('gaBtnNuovo').hidden = false;
  box.innerHTML = '<div class="bar"><div id="gaChips" class="chips"></div><span class="grow"></span>'
    + '<label class="search" for="gaCerca"><input type="search" id="gaCerca" placeholder="Cerca per nome o mail" autocomplete="off" oninput="gaRenderElenco()"></label></div>'
    + '<div id="gaElenco"></div>'
    + '<div class="grp mt14" id="gaSenzaTitolo"></div><p class="sub mb10">Senza la mail sulla scheda questi volontari non possono entrare.</p><div id="gaSenzaMail"></div>'
    + '<details class="ga-matrice mt14"><summary class="grp">Matrice permessi (confronto veloce: ogni clic salva subito)</summary><div class="card tbl mp-wrap"><table id="matricePermessi"></table></div></details>';
  gaRenderChip();
  gaRenderElenco();
  gaRenderSenzaMail();
  gaRenderMatrice();
}

function gaFiltra(val) { gaFiltro = val; gaRenderChip(); gaRenderElenco(); }

function gaRenderChip() {
  const conta = { '': gaStaff.length, attivi: gaStaff.filter(s => s.attivo !== false).length, disattivati: gaStaff.filter(s => s.attivo === false).length };
  gaEl('gaChips').innerHTML = [['', 'Tutti'], ['attivi', 'Attivi'], ['disattivati', 'Disattivati']].map(c =>
    '<button class="chip' + (gaFiltro === c[0] ? ' on' : '') + '" onclick="gaFiltra(\'' + c[0] + '\')">' + c[1] + ' <span class="n">' + conta[c[0]] + '</span></button>').join('');
}

// -- ELENCO --
function gaRiepilogoPermessi(s) {
  const p = s.permessi || {};
  if (s.tipo_accesso === 'master') {
    const tolti = GA_PERMESSI.filter(x => p[x[0]] === false);
    return tolti.length ? 'Tutti tranne ' + tolti.map(x => x[1]).join(', ') : 'Tutti i permessi';
  }
  const dati = GA_PERMESSI.filter(x => p[x[0]] === true).map(x => x[1]);
  if (!dati.length) return 'Nessun permesso';
  return dati.slice(0, 4).join(', ') + (dati.length > 4 ? ' e altri ' + (dati.length - 4) : '');
}

function gaRenderElenco() {
  const q = gaEl('gaCerca').value.toLowerCase().trim();
  const righe = gaStaff.filter(s => (!gaFiltro || (gaFiltro === 'attivi') === (s.attivo !== false))
    && (!q || (gaNome(s.volontario_id) + ' ' + gaMailDi(s.volontario_id).map(e => e.email).join(' ')).toLowerCase().includes(q)))
    .sort((a, b) => gaNome(a.volontario_id).localeCompare(gaNome(b.volontario_id)));
  gaEl('gaMostrati').textContent = righe.length + (righe.length === 1 ? ' persona' : ' persone');
  gaEl('gaElenco').innerHTML = !righe.length ? '<div class="empty">Nessuno staff trovato.</div>'
    : '<div class="grid g3">' + righe.map(s => {
      const id = s.volontario_id, io = gaSonoIo(id), mail = gaMailDi(id);
      return '<div class="card ga-card"><div class="mid"><b>' + aggEsc(gaNome(id)) + (io ? ' <span class="sub">(tu)</span>' : '') + '</b></div>'
        + '<div class="int-pills"><span class="pill ' + (s.tipo_accesso === 'master' ? 'p-yellow' : 'p-sand') + '">' + aggEsc(GA_TIPI[s.tipo_accesso] || s.tipo_accesso) + '</span>'
        + '<span class="pill ' + (s.attivo !== false ? 'p-blue' : 'p-grey') + '">' + (s.attivo !== false ? 'Attivo' : 'Disattivato') + '</span></div>'
        + '<p class="sub ga-mail">' + (mail.length ? mail.map(e => aggEsc(e.email)).join('<br>') : '<span class="bad">Nessuna mail di accesso</span>') + '</p>'
        + '<p class="sub">' + aggEsc(gaRiepilogoPermessi(s)) + '</p>'
        + '<div class="em-azioni"><button class="btn sm pri" onclick="gaApriPermessi(' + id + ')">Permessi</button><button class="btn sm" onclick="gaApri(' + id + ')">Tipo e mail</button>'
        + (hasPerm('eventi') ? '<button class="btn sm" onclick="gaLinkBot(' + id + ')">Link bot</button>' : '')
        + (io ? '' : '<button class="btn sm" onclick="gaCambiaAttivo(' + id + ')">' + (s.attivo !== false ? 'Disattiva' : 'Riattiva') + '</button>'
          + '<button class="btn sm danger" onclick="gaRimuovi(' + id + ')">Rimuovi dallo staff</button>') + '</div></div>';
    }).join('') + '</div>';
}

function gaLinkBot(id) { btApriLink(id, gaNome(id)); }

// -- MAIL --
// Restituisce la mail pulita oppure lancia il motivo del rifiuto. altre = mail già scelte nella form.
function gaControllaMail(testo, volId, altre) {
  const mail = gaNorm(testo);
  if (!mail) throw new Error('Inserisci una mail.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(mail)) throw new Error('Formato della mail non valido.');
  if ((altre || []).includes(mail)) throw new Error('Questa mail è già nell\'elenco.');
  const acc = gaMail.find(e => gaNorm(e.email) === mail);
  if (acc) throw new Error(acc.volontario_id === volId ? 'Questa mail è già tra le mail di accesso di questo volontario.' : 'Questa mail è già usata come mail di accesso da ' + gaNome(acc.volontario_id) + '.');
  const sch = gaVolontari.find(v => v.id !== volId && gaNorm(v.email) === mail);
  if (sch) throw new Error('Questa mail è già sulla scheda di ' + gaNome(sch.id) + '.');
  return mail;
}

function gaRenderSenzaMail() {
  const righe = gaVolontari.filter(v => gaAttivoAnagrafica(v) && !gaNorm(v.email));
  gaEl('gaSenzaTitolo').textContent = 'Volontari senza mail (' + righe.length + ')';
  gaEl('gaSenzaMail').innerHTML = !righe.length ? '<div class="empty">Tutti i volontari hanno la mail.</div>'
    : '<div class="card">' + righe.map(v => '<div class="ga-riga"><b>' + aggEsc(gaNome(v.id)) + '</b>'
      + '<input type="email" id="gaSm_' + v.id + '" aria-label="Mail di ' + aggEsc(gaNome(v.id)) + '" placeholder="nome@esempio.it">'
      + '<button class="btn sm pri" onclick="gaSalvaMailScheda(' + v.id + ')">Salva</button></div>').join('') + '</div>';
}

async function gaSalvaMailScheda(id) {
  try {
    const mail = gaControllaMail(gaEl('gaSm_' + id).value, id);
    await gaScrivi('PATCH', 'volontari?id=eq.' + id, { email: mail });
    gaVol(id).email = mail;
    await logAttivita('ha aggiunto la mail ' + mail + ' sulla scheda di ' + gaNome(id));
    gaRenderSenzaMail();
    sbAvviso('Mail salvata.');
  } catch(e) { sbAvviso(e.message); }
}

// -- PERMESSI (finestra per account) --
// Regola della matrice e di ho_permesso: un master ha un permesso finché non è false, uno standard solo se è true.
// Nella finestra si lavora sul valore effettivo (sì/no) e si salva solo con Salva, dopo il riepilogo.
let gaPerm = null;   // { id, orig: {chiave: bool}, cur: {chiave: bool}, aperti: Set(gruppi) }

function gaPermEffettivo(s, chiave) { const p = s.permessi || {}; return s.tipo_accesso === 'master' ? p[chiave] !== false : p[chiave] === true; }
function gaPermDiStaff(s) { return Object.fromEntries(GA_PERMESSI.map(x => [x[0], gaPermEffettivo(s, x[0])])); }

function gaApriPermessi(id) {
  const s = gaStaff.find(x => x.volontario_id === id);
  if (!s) return;
  const orig = gaPermDiStaff(s);
  gaPerm = { id, orig, cur: Object.assign({}, orig), aperti: new Set(GA_GRUPPI.map(g => g[0])) };
  gaEl('gaOv').hidden = false;
  gaRenderPermessi();
}

function gaRenderPermessi() {
  const s = gaStaff.find(x => x.volontario_id === gaPerm.id), c = gaPerm.cur;
  const attivi = GA_PERMESSI.filter(x => c[x[0]]).length;
  const altri = gaStaff.filter(x => x.volontario_id !== gaPerm.id).sort((a, b) => gaNome(a.volontario_id).localeCompare(gaNome(b.volontario_id)));
  const vecchia = document.querySelector('#gaOv .sheet .sbody'), scorri = vecchia ? vecchia.parentElement.scrollTop : 0;
  gaEl('gaOv').innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Permessi"><div class="shead"><h2>Permessi di ' + aggEsc(gaNome(gaPerm.id)) + '</h2><button class="x" onclick="gaChiudiPermessi()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="int-pills m0"><span class="pill ' + (s.tipo_accesso === 'master' ? 'p-yellow' : 'p-sand') + '">' + aggEsc(GA_TIPI[s.tipo_accesso] || s.tipo_accesso) + '</span>'
    + '<span class="pill p-blue">' + attivi + ' permessi attivi su ' + GA_PERMESSI.length + '</span></div>'
    + (s.tipo_accesso === 'master' ? '<p class="sub">Un master ha tutti i permessi, tranne quelli che togli qui. Anche i permessi nuovi aggiunti in futuro gli arrivano accesi.</p>'
      : '<p class="sub">Uno standard ha solo i permessi accesi qui. Chi non ha il permesso di una pagina non la vede nemmeno nel menu.</p>')
    + '<div class="ga-riga"><select id="gaPermCopia" aria-label="Copia permessi da"><option value="">Copia permessi da…</option>'
    + altri.map(x => '<option value="' + x.volontario_id + '">' + aggEsc(gaNome(x.volontario_id)) + (x.tipo_accesso === 'master' ? ' (master)' : '') + '</option>').join('')
    + '</select><button type="button" class="btn sm" onclick="gaPermCopia()">Copia</button><button type="button" class="btn sm" onclick="gaPermTutti(null,true)">Tutti</button><button type="button" class="btn sm" onclick="gaPermTutti(null,false)">Nessuno</button></div>'
    + GA_GRUPPI.map((g, gi) => {
      const n = g[1].filter(x => c[x[0]]).length;
      return '<details class="ga-gruppo"' + (gaPerm.aperti.has(g[0]) ? ' open' : '') + ' ontoggle="gaPermToggle(' + gi + ',this.open)"><summary><b>' + aggEsc(g[0]) + '</b><span class="sub">' + n + ' su ' + g[1].length + '</span>'
        + '<span class="grow"></span><button type="button" class="btn sm" onclick="event.preventDefault();gaPermTutti(' + gi + ',true)">Tutti</button><button type="button" class="btn sm" onclick="event.preventDefault();gaPermTutti(' + gi + ',false)">Nessuno</button></summary>'
        + '<div class="ga-perm-grid">' + g[1].map(x => {
          const cambiato = c[x[0]] !== gaPerm.orig[x[0]];
          return '<label class="ga-perm' + (c[x[0]] ? ' on' : '') + (cambiato ? ' cambiato' : '') + '"><input type="checkbox"' + (c[x[0]] ? ' checked' : '') + ' onchange="gaPermCambia(\'' + x[0] + '\',this.checked)">'
            + '<span><b>' + aggEsc(x[1]) + '</b><small>' + aggEsc(GA_DESCR[x[0]] || '') + (GA_DIPENDE[x[0]] ? ' · serve anche ' + aggEsc((GA_PERMESSI.find(y => y[0] === GA_DIPENDE[x[0]]) || [, ''])[1]) : '') + '</small></span></label>';
        }).join('') + '</div></details>';
    }).join('')
    + '<div class="form-err" id="gaPermErr"></div>'
    + '<div class="actions"><button class="btn" onclick="gaChiudiPermessi()">Annulla</button><button class="btn pri" id="gaPermSalvaBtn" onclick="gaSalvaPermessi()">Salva</button></div></div></div>';
  const sheet = document.querySelector('#gaOv .sheet');
  if (sheet) sheet.scrollTop = scorri;
}

function gaPermToggle(gi, aperto) { const g = GA_GRUPPI[gi][0]; if (aperto) gaPerm.aperti.add(g); else gaPerm.aperti.delete(g); }

// Accende/spegne un permesso tenendo coerenti i collegamenti (GA_DIPENDE)
function gaPermImposta(chiave, si) {
  gaPerm.cur[chiave] = si;
  if (si && GA_DIPENDE[chiave]) gaPermImposta(GA_DIPENDE[chiave], true);
  if (!si) Object.keys(GA_DIPENDE).filter(k => GA_DIPENDE[k] === chiave).forEach(k => gaPermImposta(k, false));
}
function gaPermCambia(chiave, si) { gaPermImposta(chiave, si); gaRenderPermessi(); }
function gaPermTutti(gi, si) { (gi === null ? GA_PERMESSI : GA_GRUPPI[gi][1]).forEach(x => gaPermImposta(x[0], si)); gaRenderPermessi(); }

function gaPermCopia() {
  const id = Number(gaEl('gaPermCopia').value);
  const da = gaStaff.find(x => x.volontario_id === id);
  if (!da) return;
  gaPerm.cur = gaPermDiStaff(da);
  gaRenderPermessi();
  sbAvviso('Permessi copiati da ' + gaNome(id) + ': controlla e premi Salva.');
}

function gaChiudiPermessi(forza) {
  if (!forza && gaPerm && GA_PERMESSI.some(x => gaPerm.cur[x[0]] !== gaPerm.orig[x[0]]) && !confirm('Chiudere senza salvare le modifiche ai permessi?')) return;
  gaPerm = null;
  gaChiudi();
}

async function gaSalvaPermessi() {
  const s = gaStaff.find(x => x.volontario_id === gaPerm.id);
  const piu = GA_PERMESSI.filter(x => gaPerm.cur[x[0]] && !gaPerm.orig[x[0]]).map(x => x[1]);
  const meno = GA_PERMESSI.filter(x => !gaPerm.cur[x[0]] && gaPerm.orig[x[0]]).map(x => x[1]);
  if (!piu.length && !meno.length) { gaChiudiPermessi(true); return; }
  if (!confirm('Salvare i permessi di ' + gaNome(gaPerm.id) + '?\n\n' + (piu.length ? 'Aggiunti: ' + piu.join(', ') + '\n' : '') + (meno.length ? 'Tolti: ' + meno.join(', ') : ''))) return;
  const btn = gaEl('gaPermSalvaBtn');
  btn.disabled = true;
  // Le chiavi non in elenco restano com'erano; quelle in elenco si scrivono sempre esplicite
  const permessi = Object.assign({}, s.permessi || {}, Object.fromEntries(GA_PERMESSI.map(x => [x[0], !!gaPerm.cur[x[0]]])));
  try {
    const [riga] = await gaScrivi('PATCH', 'staff?volontario_id=eq.' + gaPerm.id, { permessi });
    Object.assign(s, riga);
    await logAttivita('ha modificato i permessi di ' + gaNome(gaPerm.id) + (piu.length ? ' (+ ' + piu.join(', ') + ')' : '') + (meno.length ? ' (- ' + meno.join(', ') + ')' : ''));
    gaChiudiPermessi(true);
    gaAggiornaElenchi();
    sbAvviso('Permessi salvati.');
  } catch(e) {
    btn.disabled = false;
    const el = gaEl('gaPermErr'); el.textContent = e.message; el.style.display = 'block';
  }
}

// -- AGGIUNGI / MODIFICA (tipo e mail; i permessi stanno nella finestra Permessi) --
function gaApri(id) {
  const s = id ? gaStaff.find(x => x.volontario_id === id) : null;
  if (id && !s) return;
  gaForm = { id: id || null, volontario_id: id || null, mail: [] };
  const io = s && gaSonoIo(id);
  const ov = gaEl('gaOv');
  ov.innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Staff"><div class="shead"><h2>' + (s ? aggEsc(gaNome(id)) : 'Aggiungi staff') + '</h2><button class="x" onclick="gaChiudi()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="gaErr"></div>'
    + (s ? '' : '<label>Volontario<input type="search" id="gaVolCerca" placeholder="Cerca per cognome" autocomplete="off" oninput="gaCercaVol()"></label><div id="gaVolRisultati"></div>')
    + '<label>Tipo<select id="gaTipo"' + (io ? ' disabled' : '') + '>' + Object.keys(GA_TIPI).map(k => '<option value="' + k + '"' + ((s ? s.tipo_accesso : 'standard') === k ? ' selected' : '') + '>' + GA_TIPI[k] + '</option>').join('') + '</select></label>'
    + (io ? '<p class="sub">Non puoi cambiare il tuo tipo di accesso.</p>' : '')
    + '<div class="grp">Mail di accesso</div><div id="gaMailLista"></div>'
    + '<div class="ga-riga"><input type="email" id="gaMailNuova" aria-label="Nuova mail di accesso" placeholder="nome@pcanacasale.com" onkeydown="if(event.key===\'Enter\')gaAggiungiMail()"><button type="button" class="btn sm" onclick="gaAggiungiMail()">Aggiungi mail</button></div>'
    + '<p class="sub mt10">' + (s ? 'I permessi si cambiano con il pulsante Permessi sulla card.' : 'Dopo il salvataggio si apre la finestra Permessi per scegliere cosa può fare.') + '</p>'
    + '<div class="actions"><button class="btn" onclick="gaChiudi()">Annulla</button><button class="btn pri" id="gaSalvaBtn" onclick="gaSalva()">Salva</button></div></div></div>';
  ov.hidden = false;
  gaRenderMailForm();
}

function gaChiudi() {
  const ov = gaEl('gaOv');
  ov.hidden = true; ov.innerHTML = ''; gaForm = null;
}

function gaErrore(t) { const e = gaEl('gaErr'); e.textContent = t; e.style.display = 'block'; e.scrollIntoView({ block: 'nearest' }); }

function gaCercaVol() {
  const q = gaEl('gaVolCerca').value.toLowerCase().trim(), box = gaEl('gaVolRisultati');
  gaForm.volontario_id = null;
  if (!q) { box.innerHTML = ''; return; }
  const presi = new Set(gaStaff.map(s => s.volontario_id));
  const trovati = gaVolontari.filter(v => gaAttivoAnagrafica(v) && !presi.has(v.id) && gaNome(v.id).toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = trovati.length ? trovati.map(v => '<div class="lr clk" onclick="gaSceltoVol(' + v.id + ')"><div class="mid"><b>' + aggEsc(gaNome(v.id)) + '</b><span class="sub">' + aggEsc(v.stato || 'ATTIVO') + '</span></div></div>').join('')
    : '<p class="note">Nessun volontario trovato.</p>';
}

function gaSceltoVol(id) {
  gaForm.volontario_id = id;
  gaEl('gaVolCerca').value = gaNome(id);
  gaEl('gaVolRisultati').innerHTML = '';
}

function gaRenderMailForm() {
  const salvate = gaForm.id ? gaMailDi(gaForm.id) : [];
  const riga = (testo, azione) => '<div class="ga-riga"><span class="ga-valore">' + aggEsc(testo) + '</span>' + azione + '</div>';
  gaEl('gaMailLista').innerHTML = salvate.map(e => riga(e.email, '<button type="button" class="btn sm danger" onclick="gaTogliMail(' + e.id + ')">Togli</button>')).join('')
    + gaForm.mail.map((m, i) => riga(m, '<button type="button" class="btn sm danger" onclick="gaTogliMailNuova(' + i + ')">Togli</button>')).join('')
    || '<p class="sub">Nessuna mail di accesso.</p>';
}

async function gaAggiungiMail() {
  const campo = gaEl('gaMailNuova');
  gaEl('gaErr').style.display = 'none';
  try {
    const mail = gaControllaMail(campo.value, gaForm.volontario_id, gaForm.mail);
    if (gaForm.id) {
      const [riga] = await gaScrivi('POST', 'email_accesso', { volontario_id: gaForm.id, email: mail });
      gaMail.push(riga);
      await logAttivita('ha aggiunto la mail di accesso ' + mail + ' a ' + gaNome(gaForm.id));
      gaAggiornaElenchi();
    } else gaForm.mail.push(mail);
    campo.value = '';
    gaRenderMailForm();
  } catch(e) { gaErrore(e.message); }
}

function gaTogliMailNuova(i) { gaForm.mail.splice(i, 1); gaRenderMailForm(); }

async function gaTogliMail(id) {
  const e = gaMail.find(x => x.id === id);
  if (!e) return;
  gaEl('gaErr').style.display = 'none';
  if (gaSonoIo(e.volontario_id) && gaNorm(e.email) === gaMailSessione) return gaErrore('Non puoi togliere la mail con cui sei entrato.');
  const ultima = gaMailDi(e.volontario_id).length === 1;
  if (!confirm('Togliere la mail ' + e.email + '?' + (ultima ? ' È l\'ultima: ' + gaNome(e.volontario_id) + ' non potrà più entrare come staff.' : ''))) return;
  try {
    await gaScrivi('DELETE', 'email_accesso?id=eq.' + id);
    gaMail = gaMail.filter(x => x.id !== id);
    await logAttivita('ha tolto la mail di accesso ' + e.email + ' a ' + gaNome(e.volontario_id));
    gaAggiornaElenchi();
    gaRenderMailForm();
  } catch(x) { gaErrore(x.message); }
}

async function gaSalva() {
  const btn = gaEl('gaSalvaBtn'), id = gaForm.id;
  gaEl('gaErr').style.display = 'none';
  if (!id && !gaForm.volontario_id) return gaErrore('Scegli un volontario dall\'elenco.');
  if (!id && !gaForm.mail.length) return gaErrore('Inserisci almeno una mail di accesso e premi Aggiungi mail.');
  const tipo = gaEl('gaTipo').value;
  btn.disabled = true;
  try {
    if (id) {
      const s = gaStaff.find(x => x.volontario_id === id);
      if (gaSonoIo(id) && tipo !== s.tipo_accesso) throw new Error('Non puoi cambiare il tuo tipo di accesso.');
      if (tipo !== s.tipo_accesso) {
        const [riga] = await gaScrivi('PATCH', 'staff?volontario_id=eq.' + id, { tipo_accesso: tipo });
        Object.assign(s, riga);
        await logAttivita('ha cambiato il tipo di accesso di ' + gaNome(id) + ' in ' + (GA_TIPI[tipo] || tipo));
      }
    } else {
      const volId = gaForm.volontario_id;
      // Nuovo staff senza permessi (un master li ha comunque tutti): si scelgono subito dopo nella finestra Permessi
      const [riga] = await gaScrivi('POST', 'staff', { volontario_id: volId, tipo_accesso: tipo, attivo: true, permessi: {} });
      try {
        const nuove = await gaScrivi('POST', 'email_accesso', gaForm.mail.map(email => ({ volontario_id: volId, email })));
        gaMail.push(...nuove);
      } catch(e) {   // niente staff senza mail: si annulla la riga appena creata
        await sbFetch(SUPA_URL + '/rest/v1/staff?volontario_id=eq.' + volId, { method: 'DELETE', headers: H, silenzioso: true });
        throw e;
      }
      gaStaff.push(riga);
      await logAttivita('ha aggiunto allo staff: ' + gaNome(volId) + ' (' + gaForm.mail.join(', ') + ')');
      gaChiudi();
      gaAggiornaElenchi();
      gaApriPermessi(volId);
      return;
    }
    gaChiudi();
    gaAggiornaElenchi();
  } catch(e) { btn.disabled = false; gaErrore(e.message); }
}

function gaAggiornaElenchi() {
  gaRenderChip();
  gaRenderElenco();
  gaRenderMatrice();
}

// -- DISATTIVA / RIMUOVI --
async function gaCambiaAttivo(id) {
  const s = gaStaff.find(x => x.volontario_id === id);
  if (!s || gaSonoIo(id)) return;
  const attivo = s.attivo === false;
  if (!confirm((attivo ? 'Riattivare ' : 'Disattivare ') + gaNome(id) + '?')) return;
  try {
    const [riga] = await gaScrivi('PATCH', 'staff?volontario_id=eq.' + id, { attivo });
    Object.assign(s, riga);
    await logAttivita((attivo ? 'ha riattivato' : 'ha disattivato') + ' lo staff: ' + gaNome(id));
    gaAggiornaElenchi();
  } catch(e) { sbAvviso(e.message); }
}

async function gaRimuovi(id) {
  if (gaSonoIo(id)) return;
  if (!confirm('Rimuovere ' + gaNome(id) + ' dallo staff? Verranno eliminate anche le sue mail di accesso. Il volontario resta in anagrafica.')) return;
  try {
    // Prima staff: se il database rifiuta l'ultimo master, le sue mail restano intatte
    await gaScrivi('DELETE', 'staff?volontario_id=eq.' + id);
    gaStaff = gaStaff.filter(s => s.volontario_id !== id);
    await logAttivita('ha rimosso dallo staff: ' + gaNome(id));
    if (gaMailDi(id).length) {
      await gaScrivi('DELETE', 'email_accesso?volontario_id=eq.' + id);
      gaMail = gaMail.filter(e => e.volontario_id !== id);
    }
    gaAggiornaElenchi();
  } catch(e) { gaAggiornaElenchi(); sbAvviso(e.message); }
}

// -- MATRICE PERMESSI --
function gaRenderMatrice() {
  const tbl = gaEl('matricePermessi');
  if (!tbl) return;
  const righe = gaStaff.slice().sort((a, b) => gaNome(a.volontario_id).localeCompare(gaNome(b.volontario_id)));
  if (!righe.length) { tbl.innerHTML = ''; return; }
  tbl.innerHTML = '<thead><tr><th></th>' + righe.map(u => '<th>' + aggEsc(gaNome(u.volontario_id)) + (u.tipo_accesso === 'master' ? ' · master' : '') + '</th>').join('') + '</tr></thead><tbody>'
    + GA_PERMESSI.map(x => '<tr><td>' + aggEsc(x[1]) + '</td>' + righe.map(u => {
      const p = u.permessi || {}, si = u.tipo_accesso === 'master' ? p[x[0]] !== false : p[x[0]] === true;
      return '<td id="mp-' + u.volontario_id + '-' + x[0] + '"><input type="checkbox" aria-label="' + aggEsc(x[1] + ' ' + gaNome(u.volontario_id)) + '"' + (si ? ' checked' : '') + ' onchange="gaPermessoMatrice(' + u.volontario_id + ',\'' + x[0] + '\',this)"></td>';
    }).join('') + '</tr>').join('') + '</tbody>';
}

async function gaPermessoMatrice(id, chiave, box) {
  const s = gaStaff.find(x => x.volontario_id === id), cella = gaEl('mp-' + id + '-' + chiave);
  try {
    const [riga] = await gaScrivi('PATCH', 'staff?volontario_id=eq.' + id, { permessi: Object.assign({}, s.permessi, { [chiave]: box.checked }) });
    Object.assign(s, riga);
    await logAttivita('ha modificato i permessi di ' + gaNome(id));
    gaRenderElenco();
    cella.classList.remove('mp-flash');
    void cella.offsetWidth;   // riavvia l'animazione anche su clic ravvicinati
    cella.classList.add('mp-flash');
  } catch(e) { box.checked = !box.checked; sbAvviso(e.message); }
}
