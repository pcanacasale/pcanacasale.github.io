// ============================================================
// VERIFICA PIATTAFORME — Amministrazione, permesso "aggiornamento_dati".
// Controllo annuale delle anagrafiche: Portale (agg_volontari) / PIA / Volter.
// Prefisso funzioni: vp*
// ============================================================
// - I file di PIA e Volter si leggono SOLO nel browser: non vengono inviati a nessun server.
// - Il confronto lo fa verifica-piattaforme-core.js (VerificaCore, funzioni pure: non toccarne la logica).
// - Sul server si salvano solo le decisioni, una riga per persona e anno, tramite la
//   Edge Function vp-api (tabella verifica_piattaforme, RLS senza policy). Il permesso è ricontrollato lì.
// - "Applica al portale" usa agg-api update_anagrafica (che registra il log) e, per i dimessi,
//   anche volontari.stato = DIMESSO (mai cancellare).
// ============================================================
(function () {
  'use strict';

  const VP_API_URL = SUPA_URL + '/functions/v1/vp-api';
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const SRC = [['portale', 'Portale'], ['pia', 'PIA'], ['volter', 'Volter']];
  const FILT = [['decidere', 'Da decidere'], ['chiedere', 'Da chiedere'], ['deciso', 'Decise'], ['verificato', 'Verificate'],
    ['concorde', 'Senza differenze'], ['assenti', 'Mancano in una fonte'], ['tutte', 'Tutte']];
  const SL = { decidere: ['p-yellow', 'Da decidere'], deciso: ['p-grey', 'Deciso, da confermare'], verificato: ['p-blue', 'Verificato'],
    chiedere: ['p-sand', 'Da chiedere al volontario'], concorde: ['p-grey', 'Dati concordi'] };
  const ANNO_CORRENTE = new Date().getFullYear();

  // -- Stato --
  let inizializzato = false;
  let S = null;
  function statoVuoto() {
    return {
      anno: ANNO_CORRENTE, anni: [ANNO_CORRENTE], salvate: [],     // salvate = righe di vp_leggi (sola lettura per gli anni passati)
      file: { pia: null, report: null, rubrica: null },          // { nome, data }
      dati: { pia: null, report: null, rubrica: null },          // contenuto letto (solo in memoria)
      DATA: [], dec: {}, view: { f: 'decidere', q: '', sel: null, tab: 'persone' }, edit: {},
      timers: {}, inVolo: {}, ancora: {}, saveErr: '', msg: '', errore: '', caricamento: false,
    };
  }
  const sola = () => S.anno !== ANNO_CORRENTE;
  const $ = id => document.getElementById(id);
  const vpCall = (action, payload) => aggCall(action, payload, VP_API_URL);

  // ============================================================
  // AGGANCIO ALL'APP (come aggiornamento-dati.js)
  // ============================================================
  const _avvia = window.avviaDashboard;
  window.avviaDashboard = function () { _avvia.apply(this, arguments); vpVisibilita(); };
  const _logout = window.logout;
  window.logout = function () {
    _logout.apply(this, arguments);
    const si = $('siVerificaPiattaforme'); if (si) si.style.display = 'none';
    inizializzato = false; S = null;                               // niente dati del precedente utente in memoria
    const r = $('vpRoot'); if (r) r.innerHTML = '';
  };
  const _show = window.showPanel;
  window.showPanel = function (name) { _show.apply(this, arguments); if (name === 'verificaPiattaforme') vpApri(); };
  window.addEventListener('beforeunload', e => {
    if (S && (Object.keys(S.timers).length || Object.values(S.inVolo).some(Boolean))) { e.preventDefault(); e.returnValue = ''; }
  });

  function vpVisibilita() {
    const si = $('siVerificaPiattaforme');
    if (si) si.style.display = aggHaAccesso() ? 'flex' : 'none';
  }

  async function vpApri() {
    const root = $('vpRoot');
    if (!root) return;
    if (!aggHaAccesso()) { root.innerHTML = '<div class="loading-msg">Non hai il permesso per accedere a questa pagina.</div>'; return; }
    if (inizializzato) return;                                    // si torna sulla pagina: resta tutto com'era
    inizializzato = true;
    S = statoVuoto();
    vpCss();
    root.innerHTML = '<div class="loading-msg">Caricamento…</div>';
    try {
      await vpLeggiAnno(ANNO_CORRENTE);
    } catch (e) {
      inizializzato = false;
      root.innerHTML = '<div class="loading-msg bad">' + aggEsc(vpMsgErrore(e)) + '</div>';
      return;
    }
    vpStruttura();
    vpRenderTutto();
  }

  function vpMsgErrore(e) {
    const m = (e && e.message) || 'errore';
    return /autorizzat|permess|forbidden|401|403/i.test(m) ? 'Non autorizzato: serve il permesso Aggiornamento dati.' : 'Non disponibile: ' + m;
  }

  // Legge le decisioni salvate di un anno (lavora su copie: gli oggetti ricevuti non si toccano)
  async function vpLeggiAnno(anno) {
    const r = await vpCall('vp_leggi', { anno });
    S.anno = anno;
    S.anni = Array.from(new Set([ANNO_CORRENTE, anno].concat((r.anni || []).map(Number)))).sort((a, b) => b - a);
    S.salvate = (r.decisioni || []).map(x => ({ chiave: x.chiave, dati: JSON.parse(JSON.stringify(x.dati || {})), aggiornato_il: x.aggiornato_il, aggiornato_da: x.aggiornato_da }));
    S.dec = {};
    if (anno === ANNO_CORRENTE) S.salvate.forEach(x => { S.dec[x.chiave] = vpNormDec(x.dati); });
  }
  function vpNormDec(v) {
    v = v || {};
    return { sc: Object.assign({}, v.sc), val: Object.assign({}, v.val), pres: Object.assign({}, v.pres), vs: v.vs || '', nota: v.nota || '',
      stato: v.stato || '', fatto: JSON.parse(JSON.stringify(v.fatto || {})) };
  }

  // ============================================================
  // CSS (solo ciò che i componenti del portale non coprono già)
  // ============================================================
  function vpCss() {
    if ($('vpCss')) return;
    const st = document.createElement('style');
    st.id = 'vpCss';
    st.textContent = `
#vpRoot{display:flex;flex-direction:column;gap:14px;--vp-mono:ui-monospace,'Cascadia Mono',Menlo,Consolas,monospace;--vp-warn:#C4881A}
#vpRoot .vp-top{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-end;justify-content:space-between}
#vpRoot .vp-top p{margin:2px 0 0;color:var(--muted);max-width:70ch}
#vpRoot .vp-anno{display:flex;gap:8px;align-items:center}
#vpRoot .vp-anno select{font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--line2);border-radius:12px;padding:8px 10px}
#vpRoot .vp-stats{display:flex;flex-wrap:wrap;gap:8px}
#vpRoot .vp-stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:6px 12px;min-width:96px}
#vpRoot .vp-stat b{display:block;font:600 18px var(--vp-mono);font-variant-numeric:tabular-nums}
#vpRoot .vp-stat span{font-size:12px;color:var(--muted)}
#vpRoot .vp-file{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
#vpRoot .vp-fbox{border:1px dashed var(--line2);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}
#vpRoot .vp-fbox.ok{border-style:solid;border-color:var(--accent);background:var(--soft)}
#vpRoot .vp-fbox b{font-weight:600}
#vpRoot .vp-fbox small{color:var(--muted);overflow-wrap:anywhere}
#vpRoot .vp-script textarea{width:100%;min-height:110px;font:12px/1.4 var(--vp-mono);color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:8px}
#vpRoot .vp-script ol{margin:6px 0 10px;padding-left:20px}
#vpRoot .vp-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}
#vpRoot .vp-tab{background:none;border:0;border-bottom:3px solid transparent;padding:8px 14px;color:var(--muted);font:600 14px var(--font);cursor:pointer}
#vpRoot .vp-tab[aria-selected="true"]{color:var(--fg);border-bottom-color:var(--accent)}
#vpRoot .vp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#vpRoot .vp-bar input[type=search]{font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--line2);border-radius:12px;padding:8px 12px;min-width:0;width:auto;flex:1 1 200px;max-width:320px}
#vpRoot td.fin .btn{font-family:var(--font)}
#vpRoot .vp-banner{background:var(--yellow-soft);color:var(--fg);border-radius:12px;padding:8px 12px}
#vpRoot .vp-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:860px){#vpRoot .vp-grid{grid-template-columns:minmax(0,1fr)}}
#vpRoot .vp-list{background:var(--surface);border:1px solid var(--line);border-radius:16px;max-height:calc(100vh - 220px);min-height:200px;overflow:auto}
@media (max-width:860px){#vpRoot .vp-list{max-height:280px}}
#vpRoot .vp-item{display:flex;width:100%;gap:10px;align-items:center;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:9px 12px;color:inherit;font:inherit;cursor:pointer}
#vpRoot .vp-item[aria-current="true"]{background:var(--soft)}
#vpRoot .vp-item .nm{flex:1;min-width:0;font-weight:600;overflow-wrap:anywhere}
#vpRoot .vp-item .nm small{display:block;font-weight:400;color:var(--muted);font-size:12px}
#vpRoot .vp-dot{width:10px;height:10px;border-radius:50%;flex:none;border:2px solid var(--muted)}
#vpRoot .vp-dot.decidere{border-color:var(--vp-warn);background:var(--vp-warn)}
#vpRoot .vp-dot.deciso{border-color:var(--vp-warn);background:transparent}
#vpRoot .vp-dot.verificato{border-color:var(--accent);background:var(--accent)}
#vpRoot .vp-dot.chiedere{border-color:#3b6fb0;background:#3b6fb0}
#vpRoot .vp-dot.concorde{border-color:var(--line2)}
#vpRoot .vp-n{font:600 12px var(--vp-mono);color:var(--muted)}
#vpRoot .vp-card{display:flex;flex-direction:column;gap:14px;min-width:0}
#vpRoot .vp-head{display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:space-between;align-items:flex-start}
#vpRoot .vp-head h2{margin:0}
#vpRoot .vp-tags{display:flex;flex-wrap:wrap;gap:6px}
#vpRoot .vp-scroll{overflow-x:auto}
#vpRoot table.vp-t{border-collapse:collapse;width:100%;min-width:720px}
#vpRoot .vp-t th{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
#vpRoot .vp-t td{padding:4px;border-bottom:1px solid var(--line);vertical-align:top}
#vpRoot .vp-t td.lab{padding:10px 8px;color:var(--muted);width:120px;font-size:13px}
#vpRoot .vp-t tr.diff td.lab{color:var(--fg);font-weight:600;box-shadow:inset 3px 0 0 var(--vp-warn)}
#vpRoot .vp-cell{width:100%;min-height:40px;text-align:left;background:none;border:1px solid transparent;border-radius:10px;padding:8px;font:13px/1.35 var(--vp-mono);color:inherit;overflow-wrap:anywhere;display:block;cursor:pointer}
#vpRoot tr.diff .vp-cell:not(:disabled):hover{border-color:var(--accent)}
#vpRoot .vp-cell:disabled{cursor:default;color:var(--muted)}
#vpRoot .vp-cell.sel{background:var(--soft);border-color:var(--accent)}
#vpRoot .vp-cell.sugg:not(.sel){border:1px dashed var(--accent)}
#vpRoot .vp-cell .sm{display:block;font:11px var(--font);color:var(--accent);margin-top:2px}
#vpRoot .vp-cell .bd{display:inline-block;font:11px var(--font);background:var(--red-soft);color:var(--red);border-radius:4px;padding:0 5px;margin-top:3px}
#vpRoot td.fin{width:220px;padding:6px 8px;font:13px/1.35 var(--vp-mono)}
#vpRoot td.fin input{width:100%;font:13px var(--vp-mono);margin-top:4px;padding:6px 8px;color:var(--fg);background:var(--surface);border:1px solid var(--line2);border-radius:10px}
#vpRoot .vp-pend{color:var(--vp-warn);font:600 12px var(--font)}
#vpRoot .vp-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#vpRoot .vp-muted{color:var(--muted)} #vpRoot .vp-small{font-size:12px}
#vpRoot textarea.vp-nota{width:100%;resize:vertical;min-height:60px;font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--line2);border-radius:12px;padding:8px 10px}
#vpRoot .vp-prows{display:flex;flex-direction:column;gap:6px;margin-top:6px}
#vpRoot .vp-prow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#vpRoot .vp-prow .pill{min-width:150px}
#vpRoot .vp-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
#vpRoot .vp-sum ul,#vpRoot ul.vp-ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
#vpRoot .vp-sum li,#vpRoot ul.vp-ul li{border-bottom:1px solid var(--line);padding-bottom:6px;overflow-wrap:anywhere}
#vpRoot .vp-arrow{font:12px var(--vp-mono)}
#vpRoot .vp-del{text-decoration:line-through;color:var(--muted)}
#vpRoot .vp-ov-box{background:var(--surface);color:var(--fg);border-radius:20px;padding:20px;max-width:720px;width:calc(100% - 32px);max-height:85vh;overflow:auto;display:flex;flex-direction:column;gap:12px}
`;
    document.head.appendChild(st);
  }

  // Costruttore DOM (i testi passano sempre come nodi di testo: niente HTML iniettato)
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k in e && k !== 'list') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
    return e;
  }

  // ============================================================
  // STRUTTURA DELLA PAGINA
  // ============================================================
  function vpStruttura() {
    $('vpRoot').replaceChildren(
      h('div', { class: 'vp-top' },
        h('div', null, h('p', null, 'Controllo annuale: carica i file di PIA e Volter, la pagina li confronta con il portale. Per ogni differenza scegli il valore giusto: le scelte si salvano da sole. I file restano sul tuo computer, sul server vanno solo le decisioni.')),
        h('div', { class: 'vp-anno' }, h('label', { for: 'vpAnno', class: 'vp-small vp-muted' }, 'Anno'), h('select', { id: 'vpAnno', onchange: e => vpCambiaAnno(+e.target.value) }))),
      h('div', { id: 'vpStats', class: 'vp-stats' }),
      h('div', { id: 'vpFile' }),
      h('div', { id: 'vpBanner', class: 'vp-banner', hidden: true }),
      h('div', { id: 'vpCorpo' }));
  }

  function vpRenderTutto() {
    const sel = $('vpAnno');
    if (!sel) return;
    sel.replaceChildren(...S.anni.map(a => h('option', { value: String(a), selected: a === S.anno }, String(a) + (a === ANNO_CORRENTE ? '' : ' (sola lettura)'))));
    vpRenderFile();
    vpBanner();
    if (sola()) { $('vpStats').replaceChildren(); vpRenderStorico(); return; }
    if (!S.DATA.length) {
      $('vpStats').replaceChildren();
      $('vpCorpo').replaceChildren(h('div', { class: 'card' }, h('p', { class: 'vp-muted', style: 'margin:0' },
        S.caricamento ? 'Confronto in corso…' : (S.salvate.length ? S.salvate.length + ' persone con decisioni già salvate per il ' + S.anno + '. ' : '')
          + (S.caricamento ? '' : 'Carica il file di PIA e il report di Volter per vedere il confronto.'))));
      return;
    }
    if (!$('vpTabPersone')) vpStrutturaConfronto();
    vpStats(); vpBarra(); vpRenderLista();
    const a = document.activeElement;
    if (!(a && a.closest && a.closest('#vpDetail') && /INPUT|TEXTAREA/.test(a.tagName))) vpRenderScheda();
    if (S.view.tab === 'riepilogo') vpRenderRiepilogo();
  }

  function vpBanner() {
    const b = $('vpBanner'); if (!b) return;
    const m = S.saveErr || S.errore || S.msg;
    b.hidden = !m; b.textContent = m;
  }

  async function vpCambiaAnno(anno) {
    if (anno === S.anno) return;
    if (Object.keys(S.timers).length) Object.keys(S.timers).forEach(k => vpPersist(k, true));
    $('vpCorpo').replaceChildren(h('div', { class: 'loading-msg' }, 'Caricamento…'));
    try { await vpLeggiAnno(anno); } catch (e) { S.errore = vpMsgErrore(e); vpBanner(); return; }
    S.errore = '';
    if (!sola() && S.dati.pia && S.dati.report) { await vpConfronta(); return; }
    S.DATA = []; $('vpCorpo').replaceChildren();
    vpRenderTutto();
  }

  // ============================================================
  // CARICAMENTO FILE (tutto nel browser)
  // ============================================================
  function vpRenderFile() {
    const el = $('vpFile'); if (!el) return;
    if (sola()) { el.replaceChildren(); return; }
    const box = (k, titolo, testo, accept) => {
      const f = S.file[k];
      return h('div', { class: 'vp-fbox' + (f ? ' ok' : '') },
        h('b', null, titolo), h('small', null, f ? f.nome + ' · ' + f.data : testo),
        h('label', { class: 'btn sm', style: 'align-self:flex-start' }, f ? 'Cambia file' : 'Scegli file',
          h('input', { type: 'file', accept, hidden: true, onchange: e => { const x = e.target.files[0]; e.target.value = ''; if (x) vpCaricaFile(k, x); } })));
    };
    el.replaceChildren(h('div', { class: 'card' },
      h('h2', null, 'File da confrontare'),
      h('div', { class: 'vp-file' },
        box('pia', 'PIA', 'pia_volontari.json, creato con lo script qui sotto', '.json,application/json'),
        box('report', 'Volter — report volontari', 'File .xls, .xlsx o .csv', '.xls,.xlsx,.csv'),
        box('rubrica', 'Volter — rubrica (facoltativa)', 'File .csv, per telefoni ed email', '.csv,.xls,.xlsx')),
      h('details', { class: 'vp-script', style: 'margin-top:12px' },
        h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Come scaricare il file da PIA'),
        h('ol', null,
          h('li', null, 'Entra in PIA e apri VolA → Schede Volontari.'),
          h('li', null, 'Premi F12, apri la scheda Console, incolla lo script e premi Invio.'),
          h('li', null, 'Dopo circa 2 minuti scarica pia_volontari.json: caricalo qui sopra.')),
        h('div', { class: 'vp-foot', style: 'margin-bottom:8px' }, h('button', { class: 'btn sm pri', onclick: e => vpCopiaScript(e.target) }, 'Copia script')),
        h('textarea', { id: 'vpScript', readOnly: true, 'aria-label': 'Script per PIA', value: 'Caricamento…' }))));
    vpCaricaScript();
  }

  let vpScriptTesto = null;
  async function vpCaricaScript() {
    const t = $('vpScript'); if (!t) return;
    if (vpScriptTesto == null) {
      try { const r = await fetch('estrai-pia.js?v=1'); if (!r.ok) throw 0; vpScriptTesto = await r.text(); }
      catch (e) { t.value = 'Script non disponibile: ricarica la pagina.'; return; }
    }
    t.value = vpScriptTesto;
  }
  function vpCopiaScript(btn) { if (vpScriptTesto) vpCopia(vpScriptTesto, btn); }

  function vpDataFile(f) {
    const d = new Date(f.lastModified || Date.now());
    return 'del ' + d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  async function vpCaricaFile(k, file) {
    S.errore = '';
    try {
      if (k === 'pia') {
        const arr = JSON.parse(await file.text());
        if (!Array.isArray(arr) || !arr.some(r => r && r.cf != null)) throw new Error('non è il file pia_volontari.json creato dallo script');
        S.dati.pia = arr;
      } else {
        const righe = await vpLeggiTabella(file, k === 'report' ? 'COD_FISCALE' : 'ID_PERSONA');
        S.dati[k] = righe;
      }
      S.file[k] = { nome: file.name, data: vpDataFile(file) };
    } catch (e) {
      S.errore = 'File "' + file.name + '" non letto: ' + (e.message || e);
      vpRenderTutto();
      return;
    }
    if (S.dati.pia && S.dati.report) await vpConfronta();
    else vpRenderTutto();
  }

  function vpCaricaXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = XLSX_URL; s.onload = () => ok(); s.onerror = () => ko(new Error('libreria per Excel non caricata (controlla la connessione)'));
      document.head.appendChild(s);
    });
  }

  // Righe di un foglio (xls/xlsx/csv) come oggetti; l'intestazione è la prima riga che contiene "chiave"
  async function vpLeggiTabella(file, chiave) {
    await vpCaricaXlsx();
    let wb;
    if (/\.csv$/i.test(file.name)) {
      const buf = await file.arrayBuffer();
      let txt = new TextDecoder('utf-8').decode(buf);
      if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
      wb = XLSX.read(txt, { type: 'string', raw: true });
    } else {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const righe = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const pulito = x => (x == null ? '' : String(x)).replace(/\u0000/g, '').trim();
    const iH = righe.findIndex(r => r.some(c => pulito(c).toUpperCase() === chiave));
    if (iH < 0) throw new Error('manca la colonna ' + chiave + ': controlla di aver scelto il file giusto');
    const testa = righe[iH].map(c => pulito(c).toUpperCase());
    return righe.slice(iH + 1).filter(r => r.some(c => pulito(c))).map(r => {
      const o = {};
      testa.forEach((t, i) => { if (t) o[t] = vpValoreCella(r[i]); });
      return o;
    });
  }
  function vpValoreCella(v) {
    if (v instanceof Date) {                                   // date Excel: +12 ore per non cambiare giorno col fuso
      const d = new Date(v.getTime() + 12 * 3600e3);
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }
    return v == null ? '' : String(v);
  }

  async function vpConfronta() {
    S.caricamento = true; vpRenderTutto();
    try {
      const r = await vpCall('vp_dati', {});
      const portale = VerificaCore.leggiPortale(r.volontari || []);
      const pia = VerificaCore.leggiPia(S.dati.pia);
      const volter = VerificaCore.leggiVolter(S.dati.report, S.dati.rubrica || []);
      S.DATA = VerificaCore.confronta(portale, pia, volter);
      S.errore = '';
    } catch (e) {
      S.errore = vpMsgErrore(e);
    }
    S.caricamento = false;
    vpRenderTutto();
  }

  // ============================================================
  // LOGICA DECISIONI (come riferimento-ui.html)
  // ============================================================
  const P = k => S.DATA.find(p => p.key === k);
  function fv(p, f) {
    const d = S.dec[p.key]; const c = p.campi.find(x => x.f === f);
    if (d && d.sc && d.sc[f]) { const s = d.sc[f]; return s === 'altro' ? ((d.val && d.val[f]) || '') : (c.v[s] || ''); }
    if (c.st === 'ok') return c.v.portale || c.v.pia || c.v.volter || '';
    return null;
  }
  function assenti(p) { return SRC.filter(([s]) => !p.presenza[s]).map(([, l]) => l); }
  function pend(p) { const d = S.dec[p.key]; return SRC.filter(([s]) => !p.presenza[s] && !(d && d.pres && d.pres[s])).map(([, l]) => l); }
  function pst(p) {
    const d = S.dec[p.key] || {};
    if (d.stato === 'verificato') return 'verificato';
    if (d.stato === 'da_chiedere') return 'chiedere';
    const df = p.campi.filter(c => c.st === 'diff');
    if (!df.length && !assenti(p).length) return 'concorde';
    return (df.some(c => !(d.sc && d.sc[c.f])) || SRC.some(([s]) => !p.presenza[s] && !(d.pres && d.pres[s]))) ? 'decidere' : 'deciso';
  }
  function matchF(p, f) { if (f === 'tutte') return true; if (f === 'assenti') return pend(p).length > 0; return pst(p) === f; }
  function ensure(k) { return S.dec[k] || (S.dec[k] = vpNormDec({})); }
  const daDecidere = p => p.campi.filter(c => c.st === 'diff' && !(S.dec[p.key] && S.dec[p.key].sc && S.dec[p.key].sc[c.f])).length;

  // Salvataggio: ritardo di 500 ms, una sola scrittura alla volta per persona
  function vpPersist(k, subito) {
    if (sola()) return;
    clearTimeout(S.timers[k]);
    S.timers[k] = setTimeout(() => { delete S.timers[k]; vpInvia(k); }, subito ? 0 : 500);
  }
  function vpDatiDaSalvare(k) {
    const d = S.dec[k] || vpNormDec({}); const p = P(k);
    const fin = {};
    if (p) p.campi.forEach(c => { if (d.sc[c.f]) fin[c.f] = fv(p, c.f) || ''; });
    return JSON.parse(JSON.stringify({ sc: d.sc, val: d.val, pres: d.pres, vs: d.vs, nota: d.nota, stato: d.stato,
      fatto: d.fatto, nome: p ? (p.cog + ' ' + p.nom).trim() : undefined, fin }));
  }
  function vpInvia(k) {
    if (S.inVolo[k]) { S.ancora[k] = true; return; }
    S.inVolo[k] = true;
    const anno = S.anno, mio = S;
    vpCall('vp_salva', { anno, chiave: k, dati: vpDatiDaSalvare(k) })
      .then(() => { if (mio.saveErr) { mio.saveErr = ''; vpBanner(); } })
      .catch(e => { mio.saveErr = 'Salvataggio non riuscito (' + vpMsgErrore(e) + '). Le scelte restano su questa pagina finché non la chiudi: riprova a modificare.'; vpBanner(); })
      .finally(() => { mio.inVolo[k] = false; if (mio.ancora[k]) { mio.ancora[k] = false; vpInvia(k); } });
  }

  function choose(k, f, s) { const d = ensure(k); d.sc[f] = s; if (s !== 'altro') delete d.val[f]; vpPersist(k, true); vpRenderTutto(); }
  function clearChoice(k, f) { const d = ensure(k); delete d.sc[f]; delete d.val[f]; delete S.edit[k + f]; vpPersist(k, true); vpRenderTutto(); }
  function setPres(k, s, v) { const d = ensure(k); d.pres[s] = d.pres[s] === v ? '' : v; if (!d.pres[s]) delete d.pres[s]; vpPersist(k, true); vpRenderTutto(); }
  function setVs(k, v) { const d = ensure(k); d.vs = d.vs === v ? '' : v; vpPersist(k, true); vpRenderTutto(); }
  function applicaSugg(p) {
    let ch = false;
    p.campi.forEach(c => { if (c.st === 'diff' && c.sugg && !(S.dec[p.key] && S.dec[p.key].sc && S.dec[p.key].sc[c.f])) { ensure(p.key).sc[c.f] = c.sugg; ch = true; } });
    return ch;
  }
  function applyAll() {
    const ks = S.DATA.filter(applicaSugg).map(p => p.key);
    if (!ks.length) { alert('Nessun suggerimento da applicare.'); return; }
    ks.forEach(k => vpPersist(k, true)); vpRenderTutto();
  }

  // ============================================================
  // VISTA CONFRONTO: barra, elenco, scheda
  // ============================================================
  function vpStrutturaConfronto() {
    $('vpCorpo').replaceChildren(
      h('div', { class: 'vp-tabs', role: 'tablist' },
        h('button', { class: 'vp-tab', role: 'tab', id: 'vpTabPersone', 'aria-selected': 'true', onclick: () => vpTab('persone') }, 'Persone'),
        h('button', { class: 'vp-tab', role: 'tab', id: 'vpTabRiepilogo', 'aria-selected': 'false', onclick: () => vpTab('riepilogo') }, 'Riepilogo delle modifiche')),
      h('div', { id: 'vpVPersone', style: 'margin-top:12px' },
        h('div', { class: 'vp-bar', id: 'vpBar' }),
        h('div', { class: 'vp-grid', style: 'margin-top:12px' }, h('div', { class: 'vp-list', id: 'vpList', 'aria-label': 'Elenco persone' }), h('div', { id: 'vpDetail' }))),
      h('div', { id: 'vpVRiepilogo', hidden: true, style: 'margin-top:12px' }));
    vpTab(S.view.tab);
  }
  function vpTab(t) {
    S.view.tab = t;
    $('vpVPersone').hidden = t !== 'persone'; $('vpVRiepilogo').hidden = t !== 'riepilogo';
    $('vpTabPersone').setAttribute('aria-selected', String(t === 'persone')); $('vpTabRiepilogo').setAttribute('aria-selected', String(t === 'riepilogo'));
    if (t === 'riepilogo') vpRenderRiepilogo();
  }

  function vpStats() {
    const c = { decidere: 0, chiedere: 0, deciso: 0, verificato: 0, concorde: 0 };
    S.DATA.forEach(p => c[pst(p)]++);
    const nd = S.DATA.reduce((a, p) => a + p.campi.filter(x => x.st === 'diff').length, 0);
    const nr = S.DATA.reduce((a, p) => a + daDecidere(p), 0);
    $('vpStats').replaceChildren(...[[S.DATA.length, 'persone'], [S.DATA.filter(p => p.ndiff).length, 'con differenze'], [nr + ' / ' + nd, 'campi da decidere'], [c.verificato, 'verificate']]
      .map(([n, l]) => h('div', { class: 'vp-stat' }, h('b', null, String(n)), h('span', null, l))));
  }
  function vpBarra() {
    const cnt = {}; FILT.forEach(([f]) => { cnt[f] = S.DATA.filter(p => matchF(p, f)).length; });
    $('vpBar').replaceChildren(
      ...FILT.map(([f, l]) => h('button', { class: 'chip' + (S.view.f === f ? ' on' : ''), 'aria-pressed': String(S.view.f === f), onclick: () => { S.view.f = f; vpRenderTutto(); } }, l + ' ', h('span', { class: 'n' }, String(cnt[f])))),
      h('input', { type: 'search', id: 'vpQ', placeholder: 'Cerca per cognome', value: S.view.q, 'aria-label': 'Cerca per cognome', oninput: e => { S.view.q = e.target.value; vpRenderLista(); } }),
      h('button', { class: 'btn sm', onclick: applyAll, title: 'Per i campi ancora da decidere sceglie il valore suggerito' }, 'Applica i suggerimenti'));
  }
  function listed() {
    const q = S.view.q.trim().toUpperCase();
    return S.DATA.filter(p => (p.key === S.view.sel || matchF(p, S.view.f)) && (!q || (p.cog + ' ' + p.nom).toUpperCase().includes(q)));
  }
  function vpRenderLista() {
    const L = listed(); const el = $('vpList');
    if (!L.length) { el.replaceChildren(h('div', { class: 'empty' }, 'Nessuna persona in questo elenco.')); S.view.sel = null; vpRenderScheda(); return; }
    if (!L.some(p => p.key === S.view.sel)) { S.view.sel = L[0].key; vpRenderScheda(); }
    el.replaceChildren(...L.map(p => {
      const s = pst(p), nd = daDecidere(p), a = pend(p);
      return h('button', { class: 'vp-item', 'aria-current': String(p.key === S.view.sel),
        onclick: () => { S.view.sel = p.key; vpRenderLista(); vpRenderScheda(); if (innerWidth <= 860) $('vpDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
        h('span', { class: 'vp-dot ' + s, title: SL[s][1] }),
        h('span', { class: 'nm' }, p.cog + ' ' + p.nom, h('small', null, a.length ? 'Manca in ' + a.join(', ') : (nd ? nd + (nd === 1 ? ' differenza da decidere' : ' differenze da decidere') : (s === 'verificato' ? 'Verificato' : 'Tutto deciso')))),
        nd ? h('span', { class: 'vp-n' }, String(nd)) : null);
    }));
  }

  function vpRenderScheda() {
    const el = $('vpDetail'); if (!el) return;
    const p = P(S.view.sel);
    if (!p) { el.replaceChildren(); return; }
    const d = S.dec[p.key] || vpNormDec({}); const s = pst(p);
    const vagg = p.volter_agg ? 'agg. ' + p.volter_agg.split('-').reverse().join('/') : '';
    const pres = SRC.map(([k, l]) => h('span', { class: 'pill ' + (p.presenza[k] ? 'p-grey' : 'p-red') },
      p.presenza[k] ? (l + (k === 'portale' && p.stato ? ' · ' + p.stato.toLowerCase() : '') + (k === 'volter' && vagg ? ' · ' + vagg : '')) : 'Manca in ' + l));
    const rows = p.campi.map(c => {
      const chosen = d.sc && d.sc[c.f]; const fin = fv(p, c.f); const diff = c.st === 'diff'; const ed = S.edit[p.key + c.f];
      const tds = SRC.map(([k]) => {
        const val = c.v[k]; const sel = chosen === k; const bad = c.f === 'cf' && p.cfcheck && p.cfcheck[k] === 'non valido';
        return h('td', null, h('button', { class: 'vp-cell' + (sel ? ' sel' : '') + (c.sugg === k && !sel && diff ? ' sugg' : ''), disabled: !val || !diff,
          'aria-pressed': diff ? String(sel) : null, onclick: () => choose(p.key, c.f, k) },
          val || '—', diff && c.sugg === k && !sel ? h('span', { class: 'sm' }, 'suggerito') : null,
          bad ? h('span', { class: 'bd' }, 'codice non coerente') : null, sel ? h('span', { class: 'sm' }, 'scelto') : null));
      });
      const inp = () => h('input', { type: 'text', 'aria-label': 'Altro valore per ' + c.lab, placeholder: 'Altro valore', value: (d.val && d.val[c.f]) || '',
        oninput: e => { const dd = ensure(p.key); dd.sc[c.f] = 'altro'; dd.val[c.f] = e.target.value; vpPersist(p.key); },
        onchange: () => vpRenderTutto() });
      const annulla = chosen ? h('div', null, h('button', { class: 'btn sm', style: 'margin-top:4px', onclick: () => clearChoice(p.key, c.f) }, 'Annulla')) : null;
      let finCell;
      if (diff) finCell = h('td', { class: 'fin' }, fin == null ? h('span', { class: 'vp-pend' }, 'Da decidere') : (fin || h('span', { class: 'vp-muted' }, '(vuoto)')), annulla, inp());
      else finCell = h('td', { class: 'fin' }, fin || h('span', { class: 'vp-muted' }, '—'),
        fin && !ed && chosen !== 'altro' ? h('div', null, h('button', { class: 'btn sm', style: 'margin-top:4px', onclick: () => { S.edit[p.key + c.f] = 1; vpRenderScheda(); } }, 'Modifica')) : null,
        chosen === 'altro' ? annulla : null, ed || chosen === 'altro' ? inp() : null);
      return h('tr', { class: diff ? 'diff' : '' }, h('td', { class: 'lab' }, c.lab, c.why && diff ? h('div', { class: 'vp-small vp-muted', style: 'font-weight:400' }, c.why) : null), ...tds, finCell);
    });
    el.replaceChildren(h('div', { class: 'card vp-card' },
      h('div', { class: 'vp-head' }, h('div', null, h('h2', null, p.cog + ' ' + p.nom), h('div', { class: 'vp-tags', style: 'margin-top:6px' }, pres)), h('span', { class: 'pill ' + SL[s][0] }, SL[s][1])),
      h('div', { class: 'vp-scroll' }, h('table', { class: 'vp-t' },
        h('thead', null, h('tr', null, h('th', null, 'Campo'), ...SRC.map(([, l]) => h('th', null, l)), h('th', null, 'Valore da usare'))), h('tbody', null, rows))),
      vpBloccoPresenza(p, d),
      h('div', null, h('label', { for: 'vpNota', class: 'vp-small vp-muted' }, 'Nota'),
        h('textarea', { id: 'vpNota', class: 'vp-nota', placeholder: 'Per esempio: chiamato il volontario, conferma il civico 16.', value: d.nota || '',
          oninput: e => { ensure(p.key).nota = e.target.value; vpPersist(p.key); } })),
      h('div', { class: 'vp-foot' },
        h('button', { class: 'btn pri', onclick: () => { const dd = ensure(p.key); dd.stato = dd.stato === 'verificato' ? '' : 'verificato'; vpPersist(p.key, true); vpRenderTutto(); } }, d.stato === 'verificato' ? 'Togli verificato' : 'Segna come verificato'),
        h('button', { class: 'btn', onclick: () => { const dd = ensure(p.key); dd.stato = dd.stato === 'da_chiedere' ? '' : 'da_chiedere'; vpPersist(p.key, true); vpRenderTutto(); } }, d.stato === 'da_chiedere' ? 'Non serve chiedere' : 'Da chiedere al volontario'),
        h('button', { class: 'btn', onclick: () => { if (applicaSugg(p)) { vpPersist(p.key, true); vpRenderTutto(); } } }, 'Applica i suggerimenti di questa persona'))));
  }

  function vpBloccoPresenza(p, d) {
    const btn = (on, t, fn) => h('button', { class: 'btn sm' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: fn }, t);
    const rows = SRC.map(([s, l]) => {
      const pr = p.presenza[s]; const cur = d.pres && d.pres[s];
      return h('div', { class: 'vp-prow' }, h('span', { class: 'pill ' + (pr ? 'p-grey' : 'p-red') }, pr ? l + ': presente' : l + ': manca'),
        pr ? [btn(cur === 'ok', 'Corretto', () => setPres(p.key, s, 'ok')), btn(cur === 'togliere', 'Da togliere', () => setPres(p.key, s, 'togliere'))]
           : [btn(cur === 'ok', 'Corretto che manchi', () => setPres(p.key, s, 'ok')), btn(cur === 'aggiungere', 'Da aggiungere', () => setPres(p.key, s, 'aggiungere'))]);
    });
    const vs = [['attivo', 'Attivo'], ['sospeso', 'Sospeso'], ['dimesso', 'Dimesso']];
    return h('div', null,
      h('div', { class: 'vp-small vp-muted' }, 'Presenza nelle fonti'), h('div', { class: 'vp-prows' }, rows),
      h('div', { class: 'vp-small vp-muted', style: 'margin-top:12px' }, 'Stato del volontario' + (p.stato ? ' (nel portale: ' + p.stato.toLowerCase() + ')' : '')),
      h('div', { class: 'vp-prow', style: 'margin-top:6px' }, vs.map(([v, t]) => btn(d.vs === v, t, () => setVs(p.key, v)))));
  }

  // ============================================================
  // RIEPILOGO
  // ============================================================
  const nomeP = p => (p.cog + ' ' + p.nom).trim();
  // Stesso valore a meno del formato (date gg/mm/aaaa o ISO, maiuscole, spazi)
  function vpUguale(f, a, b) {
    const n = x => String(x || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (f === 'dn') return vpDataIso(a) === vpDataIso(b);
    return n(a) === n(b);
  }
  // Modifiche da fare in ogni fonte: campi con una scelta il cui valore finale è diverso da quello della fonte
  function changes() {
    const out = { portale: [], pia: [], volter: [] };
    S.DATA.forEach(p => {
      const d = S.dec[p.key]; if (!d || !d.sc) return;
      p.campi.forEach(c => {
        if (!d.sc[c.f]) return;
        const f = fv(p, c.f) || '';
        SRC.forEach(([k]) => {
          if (!p.presenza[k]) return;
          const cur = c.v[k] || '';
          if (!vpUguale(c.f, cur, f)) out[k].push({ p, c, from: cur, to: f });
        });
      });
    });
    return out;
  }
  function vpListaStato() {
    const L = [];
    S.DATA.forEach(p => {
      const d = S.dec[p.key] || {};
      SRC.forEach(([s, l]) => { const v = d.pres && d.pres[s]; if (v === 'aggiungere') L.push([p, 'Aggiungere in ' + l]); if (v === 'togliere') L.push([p, 'Togliere da ' + l]); });
      if (d.vs === 'dimesso') L.push([p, 'Dimesso: segnare come dimesso in tutte le fonti' + (p.stato === 'DIMESSO' ? ' (nel portale già fatto)' : '')]);
      else if (d.vs && p.stato && d.vs.toUpperCase() !== p.stato) L.push([p, 'Stato da ' + p.stato.toLowerCase() + ' a ' + d.vs]);
      else if (d.vs && !p.stato) L.push([p, 'Stato: ' + d.vs]);
    });
    return L;
  }
  function vpCardElenco(titolo, righe, testo, extra) {
    return h('div', { class: 'card' },
      h('div', { class: 'vp-head' }, h('h2', null, titolo + ' (' + righe.length + ')'),
        h('div', { class: 'vp-foot' }, extra || null, h('button', { class: 'btn sm', disabled: !righe.length, onclick: e => vpCopia(testo, e.target) }, 'Copia elenco'))),
      righe.length ? h('ul', { class: 'vp-ul', style: 'margin-top:10px' }, righe) : h('p', { class: 'vp-muted' }, 'Nessuna voce finora.'));
  }
  function vpRenderRiepilogo() {
    const el = $('vpVRiepilogo'); if (!el) return;
    const ch = changes();
    const T = { portale: 'Da scrivere nel portale', pia: 'Da correggere in PIA', volter: 'Da correggere in Volter' };
    const nApp = vpOperazioniPortale().length;
    const blocchi = SRC.map(([k]) => {
      const L = ch[k];
      const txt = L.map(x => nomeP(x.p) + ' – ' + x.c.lab + ': ' + (x.from || '(vuoto)') + ' → ' + (x.to || '(vuoto)')).join('\n');
      const extra = k === 'portale' ? h('button', { class: 'btn sm pri', disabled: !nApp, onclick: vpAnteprimaApplica }, 'Applica al portale') : null;
      return vpCardElenco(T[k], L.map(x => h('li', null, h('b', null, nomeP(x.p)), ' · ' + x.c.lab,
        h('div', { class: 'vp-arrow' }, h('span', { class: 'vp-del' }, x.from || '(vuoto)'), ' → ', x.to || '(vuoto)'))), txt, extra);
    });
    const LS = vpListaStato();
    const stato = vpCardElenco('Presenza e stato', LS.map(([p, t]) => h('li', null, h('b', null, nomeP(p)), ' · ' + t)), LS.map(([p, t]) => nomeP(p) + ' – ' + t).join('\n'));
    const miss = [['portale', 'Non presenti nel portale'], ['pia', 'Non presenti in PIA'], ['volter', 'Non presenti in Volter']].map(([k, t]) => {
      const L = S.DATA.filter(p => !p.presenza[k]);
      const dove = p => ' · presenti in ' + SRC.filter(([s]) => p.presenza[s]).map(([, l]) => l).join(' e ');
      return vpCardElenco(t, L.map(p => h('li', null, h('b', null, nomeP(p)), h('span', { class: 'vp-muted' }, dove(p)))), L.map(p => nomeP(p) + dove(p)).join('\n'));
    });
    const note = S.DATA.filter(p => S.dec[p.key] && S.dec[p.key].nota);
    el.replaceChildren(
      h('div', { class: 'vp-foot', style: 'margin-bottom:12px' }, h('button', { class: 'btn', onclick: vpResocontoPdf }, 'Resoconto PDF')),
      h('div', { class: 'vp-sum' }, blocchi), h('div', { style: 'margin-top:16px' }, stato),
      h('h2', { style: 'margin:20px 0 10px' }, 'Chi manca in una fonte'), h('div', { class: 'vp-sum' }, miss),
      h('h2', { style: 'margin:20px 0 10px' }, 'Note'),
      vpCardElenco('Note', note.map(p => h('li', null, h('b', null, nomeP(p)), ': ' + S.dec[p.key].nota)), note.map(p => nomeP(p) + ': ' + S.dec[p.key].nota).join('\n')));
  }

  function vpCopia(t, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = 'Copiato'; setTimeout(() => { btn.textContent = o; }, 1400); };
    const fallback = () => { const a = h('textarea', { value: t }); document.body.append(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { /* niente */ } a.remove(); };
    try { navigator.clipboard.writeText(t).then(done, fallback); } catch (e) { fallback(); }
  }

  // ============================================================
  // APPLICA AL PORTALE
  // ============================================================
  // Valore deciso → campi di agg_volontari
  function vpSeparaCivico(s) {
    s = String(s || '').trim();
    const m = s.match(/^(.*?\D)[\s,]+(\d+\s?[A-Za-z]?(?:\s?\/\s?\w+)?)$/);
    return m ? [m[1].replace(/[\s,]+$/, ''), m[2].replace(/\s+/g, '')] : [s, ''];
  }
  function vpDataIso(s) {
    s = String(s || '').trim(); const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : s.slice(0, 10);
  }
  function vpPrimo(s, cell) {
    const L = String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    return (cell && L.find(x => x[0] === '3')) || L[0] || '';
  }
  function vpCampiPortale(f, val) {
    switch (f) {
      case 'cf': return { codice_fiscale: String(val).trim().toUpperCase() };
      case 'dn': return { data_nascita: vpDataIso(val) || null };
      case 'ln': return { luogo_nascita: val };
      case 'ind': { const [i, c] = vpSeparaCivico(val); return { indirizzo: i, civico: c || null }; }
      case 'cap': return { cap: val };
      case 'com': return { citta: val };
      case 'tel': return { telefono: vpPrimo(val, true) };
      case 'em': return { email: vpPrimo(val).toLowerCase() };
    }
    return {};
  }
  // Operazioni per persona: campi decisi diversi dal portale + dimissione
  function vpOperazioniPortale() {
    const ops = [];
    S.DATA.forEach(p => {
      if (!p.presenza.portale || !p.aid) return;
      const d = S.dec[p.key]; if (!d) return;
      const campi = {}, righe = [];
      p.campi.forEach(c => {
        if (!d.sc[c.f]) return;
        const to = fv(p, c.f) || ''; const from = c.v.portale || '';
        if (vpUguale(c.f, from, to)) return;
        Object.assign(campi, vpCampiPortale(c.f, to)); righe.push({ f: c.f, lab: c.lab, from, to });
      });
      const dimetti = d.vs === 'dimesso' && p.stato !== 'DIMESSO';
      if (dimetti) { campi.stato = 'DIMESSO'; righe.push({ f: 'stato', lab: 'Stato', from: (p.stato || '').toLowerCase(), to: 'dimesso' }); }
      if (righe.length) ops.push({ p, campi, righe, dimetti });
    });
    return ops;
  }

  function vpOverlay(contenuto) {
    const ov = h('div', { class: 'ov', style: 'display:flex;align-items:center;justify-content:center;z-index:2000' }, h('div', { class: 'vp-ov-box' }, contenuto));
    document.body.append(ov);
    return ov;
  }

  function vpAnteprimaApplica() {
    const ops = vpOperazioniPortale();
    if (!ops.length) return;
    const n = ops.reduce((a, o) => a + o.righe.length, 0);
    let ov;
    const elenco = h('ul', { class: 'vp-ul' }, ops.map(o => h('li', null, h('b', null, nomeP(o.p)),
      o.righe.map(r => h('div', { class: 'vp-arrow' }, r.lab + ': ', h('span', { class: 'vp-del' }, r.from || '(vuoto)'), ' → ', r.to || '(vuoto)')))));
    ov = vpOverlay([
      h('h2', { style: 'margin:0' }, 'Applica al portale'),
      h('p', { style: 'margin:0' }, n + ' modifiche per ' + ops.length + ' volontari. I dimessi vengono segnati come DIMESSO anche nell\'elenco Volontari: nessun dato viene cancellato.'),
      h('div', { style: 'max-height:50vh;overflow:auto' }, elenco),
      h('div', { class: 'vp-foot', id: 'vpAppFoot' },
        h('button', { class: 'btn pri', onclick: () => vpApplica(ops, ov) }, 'Conferma e applica'),
        h('button', { class: 'btn', onclick: () => ov.remove() }, 'Annulla'))]);
  }

  async function vpApplica(ops, ov) {
    const foot = ov.querySelector('#vpAppFoot');
    const msg = t => foot.replaceChildren(h('span', { class: 'vp-muted' }, t));
    const errori = []; let fatti = 0;
    const ora = new Date().toISOString();
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      msg('Applico ' + (i + 1) + ' di ' + ops.length + '…');
      try {
        await aggCall('update_anagrafica', { id: o.p.aid, campi: o.campi });
        if (o.dimetti) {
          const g = await aggCall('get', { id: o.p.aid });
          const vid = g.volontario && g.volontario.volontario_id;
          if (vid) {
            const r = await sbFetch(SUPA_URL + '/rest/v1/volontari?id=eq.' + vid, {
              method: 'PATCH', headers: Object.assign({}, HJ, { Prefer: 'return=minimal' }), body: JSON.stringify({ stato: 'DIMESSO', attivo: false }) });
            if (!r.ok) errori.push(nomeP(o.p) + ': stato DIMESSO non scritto in Volontari');
            else await logAttivita('ha cambiato stato di ' + nomeP(o.p) + ' a DIMESSO (verifica piattaforme)');
          }
        }
        const d = ensure(o.p.key);
        o.righe.forEach(r => { d.fatto[r.f] = { da: r.from, a: r.to, il: ora }; });
        vpPersist(o.p.key, true);
        fatti++;
      } catch (e) {
        errori.push(nomeP(o.p) + ': ' + (e.message || 'errore'));
      }
    }
    await logAttivita('ha applicato al portale la verifica piattaforme ' + S.anno + ' (' + fatti + ' volontari)');
    foot.replaceChildren(
      h('span', null, 'Fatto per ' + fatti + ' volontari.' + (errori.length ? ' Non riuscito: ' + errori.join('; ') : '')),
      h('button', { class: 'btn pri', onclick: () => ov.remove() }, 'Chiudi'));
    await vpConfronta();                                          // ricarica i dati del portale aggiornati
  }

  // ============================================================
  // RESOCONTO PDF (jsPDF + autotable, già caricati nel portale)
  // ============================================================
  function vpResocontoPdf() {
    if (!window.jspdf) { alert('Libreria PDF non disponibile: ricarica la pagina.'); return; }
    const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const data = new Date().toLocaleDateString('it-IT');
    let y = 18;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Verifica piattaforme ' + S.anno + ' — Resoconto', 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    doc.text('PC ANA Casale Monferrato · ' + data + ' · file: ' + ['pia', 'report', 'rubrica'].map(k => S.file[k] && S.file[k].nome).filter(Boolean).join(', '), 14, y + 6);
    doc.setTextColor(0); y += 14;
    const titolo = t => { if (y > 260) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(t, 14, y); y += 3; };
    const vuoto = () => { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.text('Niente da segnalare.', 14, y + 4); y += 10; };
    // Tabella Persona | Campo | Attuale (barrato) | Nuovo
    const tabella = righe => {
      if (!righe.length) { vuoto(); return; }
      doc.autoTable({
        startY: y, head: [['Persona', 'Campo', 'Attuale', 'Nuovo']], body: righe, theme: 'grid', margin: { left: 14, right: 14 },
        styles: { fontSize: 8.5, cellPadding: 1.6, overflow: 'linebreak' }, headStyles: { fillColor: [10, 76, 158] },
        columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 28 }, 2: { cellWidth: 56, textColor: 110 }, 3: { cellWidth: 56 } },
        didDrawCell: c => {
          if (c.section !== 'body' || c.column.index !== 2 || !c.cell.raw || c.cell.raw === '(vuoto)') return;
          const t = c.cell.text, fs = c.cell.styles.fontSize / doc.internal.scaleFactor, lh = fs * doc.getLineHeightFactor();
          doc.setDrawColor(110); doc.setLineWidth(0.2);
          t.forEach((riga, i) => { const w = doc.getTextWidth(riga); const yy = c.cell.y + c.cell.padding('top') + lh * i + fs * 0.62; doc.line(c.cell.x + c.cell.padding('left'), yy, c.cell.x + c.cell.padding('left') + w, yy); });
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    };
    // FATTO: decisioni già applicate al portale
    const fatto = [];
    S.DATA.forEach(p => { const d = S.dec[p.key]; if (!d || !d.fatto) return;
      Object.keys(d.fatto).forEach(f => { const x = d.fatto[f]; const c = p.campi.find(z => z.f === f); fatto.push([nomeP(p), c ? c.lab : 'Stato', x.da || '(vuoto)', x.a || '(vuoto)']); }); });
    titolo('Fatto — applicato al portale'); tabella(fatto);
    // ANCORA DA FARE: PIA e Volter
    const ch = changes();
    const LS = vpListaStato();
    [['portale', 'portale'], ['pia', 'PIA'], ['volter', 'Volter']].forEach(([k, l]) => {
      if (k !== 'portale') titolo('Ancora da fare — ' + l);
      const righe = ch[k].map(x => [nomeP(x.p), x.c.lab, x.from || '(vuoto)', x.to || '(vuoto)']);
      LS.forEach(([p, t]) => {
        if (t === 'Togliere da ' + l) righe.push([nomeP(p), 'Presenza', 'presente', 'da togliere']);
        if (t.startsWith('Dimesso')) righe.push([nomeP(p), 'Stato', '', 'dimesso']);
      });
      if (k !== 'portale') tabella(righe);
      // Da inserire: tutti i dati della persona
      const nuovi = S.DATA.filter(p => S.dec[p.key] && S.dec[p.key].pres && S.dec[p.key].pres[k] === 'aggiungere');
      titolo('Da inserire ' + (k === 'portale' ? 'nel portale' : 'in ' + l) + ' (' + nuovi.length + ')');
      if (!nuovi.length) { vuoto(); return; }
      doc.autoTable({
        startY: y, theme: 'grid', margin: { left: 14, right: 14 }, styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: [10, 76, 158] },
        head: [['Persona'].concat(VerificaCore.CAMPI.map(c => c[1]))],
        body: nuovi.map(p => [nomeP(p)].concat(VerificaCore.CAMPI.map(([f]) => fv(p, f) || ''))),
      });
      y = doc.lastAutoTable.finalY + 8;
    });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text('Pag. ' + i + '/' + n, 196, 290, { align: 'right' }); }
    doc.save('verifica_piattaforme_' + S.anno + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
  }

  // ============================================================
  // ANNI PRECEDENTI: sola lettura delle decisioni salvate
  // ============================================================
  function vpRenderStorico() {
    const L = S.salvate.slice().sort((a, b) => String((a.dati && a.dati.nome) || a.chiave).localeCompare(String((b.dati && b.dati.nome) || b.chiave), 'it'));
    const ST = { verificato: 'Verificato', da_chiedere: 'Da chiedere' };
    const PR = { ok: 'corretto', aggiungere: 'da aggiungere', togliere: 'da togliere' };
    const LAB = {}; VerificaCore.CAMPI.forEach(([f, l]) => { LAB[f] = l; });
    $('vpCorpo').replaceChildren(h('div', { class: 'card' },
      h('h2', null, 'Decisioni del ' + S.anno + ' (' + L.length + ')'),
      h('p', { class: 'vp-muted' }, 'Anno chiuso: si consulta soltanto. Per il controllo di quest\'anno scegli ' + ANNO_CORRENTE + '.'),
      L.length ? h('ul', { class: 'vp-ul' }, L.map(x => {
        const d = x.dati || {};
        const parti = [];
        Object.keys(d.fin || {}).forEach(f => parti.push((LAB[f] || f) + ': ' + (d.fin[f] || '(vuoto)')));
        Object.keys(d.pres || {}).forEach(s => { if (d.pres[s]) parti.push(s.toUpperCase() + ' ' + (PR[d.pres[s]] || d.pres[s])); });
        if (d.vs) parti.push('stato ' + d.vs);
        return h('li', null, h('b', null, d.nome || x.chiave), d.stato ? ' · ' + (ST[d.stato] || d.stato) : '',
          parti.length ? h('div', { class: 'vp-arrow' }, parti.join(' · ')) : null,
          d.fatto && Object.keys(d.fatto).length ? h('div', { class: 'vp-small vp-muted' }, 'Applicato al portale: ' + Object.keys(d.fatto).map(f => LAB[f] || f).join(', ')) : null,
          d.nota ? h('div', { class: 'vp-small' }, 'Nota: ' + d.nota) : null,
          h('div', { class: 'vp-small vp-muted' }, 'Ultima modifica ' + (x.aggiornato_il ? new Date(x.aggiornato_il).toLocaleString('it-IT') : '') + (x.aggiornato_da ? ' · ' + x.aggiornato_da : '')));
      })) : h('p', { class: 'vp-muted' }, 'Nessuna decisione salvata.')));
  }

  // Solo per le prove automatiche
  window.__vp = { stato: () => S, vpSeparaCivico, vpOperazioniPortale, changes };
})();
