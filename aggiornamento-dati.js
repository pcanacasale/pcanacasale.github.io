// ============================================================
// AGGIORNAMENTO DATI — tab riservata a chi ha il permesso "aggiornamento_dati" (vedi SPEC_aggiornamento_dati.md)
// ============================================================
// File nuovo e autonomo: non modifica nessuna funzione esistente di
// area-riservata.js, si limita ad "agganciarsi" (wrapping) a showPanel /
// avviaDashboard / logout per integrarsi nella navigazione esistente.
// Tutta la UI del pannello è generata qui dentro (area-riservata.html
// contiene solo la voce di sidebar e un <div id="aggRoot"> vuoto).
//
// Dati: agg_volontari, agg_dpi_catalogo, agg_dpi_volontario, agg_documenti
// (RLS attiva senza policy: l'anon key non le legge). Ogni accesso passa
// dalla Edge Function agg-api (service role), che riverifica server-side
// che l'utente abbia il permesso — qui ci limitiamo a non mostrare la voce di
// menu, ma la vera porta è lì.
//
// Prefisso funzioni: agg*
// ============================================================

const AGG_API_URL = SUPA_URL + '/functions/v1/agg-api';

// Campi anagrafica "obbligatori" ai fini della barra di completezza (vedi
// stessa lista lato server in supabase/functions/agg-api/index.ts — tenerle
// allineate se si cambia una delle due).
const AGG_CAMPI_OBBLIGATORI = [
  'cognome', 'nome', 'codice_fiscale', 'data_nascita', 'luogo_nascita', 'provincia_nascita',
  'squadra', 'tipo_volontario', 'indirizzo', 'civico', 'cap', 'citta', 'provincia', 'telefono',
];

const AGG_TIPI_DOC_SINGOLI = ['CARTA_IDENTITA', 'CODICE_FISCALE', 'PATENTE'];
const AGG_TIPI_DOC_MULTIPLI = ['ATTESTATO', 'ABILITAZIONE'];
const AGG_DOC_LABEL = {
  CARTA_IDENTITA: '🪪 Carta d\'identità', CODICE_FISCALE: '📄 Codice fiscale', PATENTE: '🚗 Patente',
  ATTESTATO: '📜 Attestato', ABILITAZIONE: '✅ Abilitazione', FOTO: '📷 Foto', FIRMA: '✍️ Firma consenso privacy',
};
const AGG_TAGLIE = {
  ABITO:  ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'],
  SCARPA: Array.from({ length: 14 }, (_, i) => String(35 + i)), // 35..48
  GUANTO: ['S', 'M', 'L', 'XL', 'XXL'],
  UNICA:  [],
};
const AGG_STATI_VERIFICA = ['DA_FARE', 'IN_CORSO', 'VERIFICATO'];

// -- Stato in memoria --
let aggVolontari     = [];   // cards riassuntive dall'ultima 'list'
let aggContatori      = {};
let aggCorrente       = null; // { volontario, dpi, documenti, catalogo, categorie_suggerite, completezza }
let aggFotoSignedUrl  = null;
let aggFiltri         = { search: '', squadra: '', stato: '', missing: '' };
let aggInizializzato  = false;
let aggCatalogoCache  = [];
// Fase 2 — link personale e proposte dei volontari
let aggProposteAperte = {};   // volontario_id → { id, inviata_il }
let aggPropCorrente   = null; // risposta di 'proposta_dettaglio' per la scheda aperta { link, proposta }
let aggLinkCorrente   = null; // { url, scade_il, telefono, nome, cognome } — solo subito dopo 'link_genera'

const AGG_CAMPI_LABEL = {
  cognome: 'Cognome', nome: 'Nome', codice_fiscale: 'Codice fiscale', data_nascita: 'Data nascita',
  luogo_nascita: 'Luogo nascita', provincia_nascita: 'Provincia nascita', indirizzo: 'Indirizzo',
  civico: 'Civico', cap: 'CAP', citta: 'Città', provincia: 'Provincia', telefono: 'Telefono', email: 'Email',
  titolo_studio: 'Titolo di studio', professione: 'Professione', patenti: 'Patenti', tessera_ana: 'Tessera ANA',
};

// ============================================================
// AGGANCIO ALL'APP ESISTENTE (nessuna funzione esistente viene modificata)
// ============================================================
(function aggHookApp() {
  const _origAvvia = window.avviaDashboard;
  window.avviaDashboard = function () {
    _origAvvia.apply(this, arguments);
    aggAggiornaVisibilitaSidebar();
  };
  const _origLogout = window.logout;
  window.logout = function () {
    _origLogout.apply(this, arguments);
    const si = document.getElementById('siAggDati');
    if (si) si.style.display = 'none';
    aggInizializzato = false; // forza reinizializzazione se un altro utente effettua il login
  };
  const _origShowPanel = window.showPanel;
  window.showPanel = function (name, btn) {
    _origShowPanel.apply(this, arguments);
    if (name === 'aggDati') aggApri();
  };
})();

function aggAggiornaVisibilitaSidebar() {
  const si = document.getElementById('siAggDati');
  if (!si) return;
  si.style.display = aggHaAccesso() ? 'flex' : 'none';
}

// Accesso alla pagina e a tutte le sue funzioni: permesso 'aggiornamento_dati'
// (Matrice permessi / form utenti). Master di default sì, salvo permesso tolto;
// standard solo se concesso; mai i volontari. La stessa regola è verificata
// lato server in agg-api: questa serve solo a mostrare/nascondere l'interfaccia.
function aggHaAccesso() {
  return !!currentUser && currentUser.tipo_accesso !== 'volontario' && hasPerm('aggiornamento_dati');
}

// ============================================================
// CHIAMATA ALLA EDGE FUNCTION
// ============================================================
async function aggCall(action, payload) {
  const u = sessionStorage.getItem('ar_user');
  const p = sessionStorage.getItem('ar_pass');
  if (!u || !p) throw new Error('sessione non valida, effettua di nuovo il login');
  const res = await fetch(AGG_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPA_KEY, 'apikey': SUPA_KEY },
    body: JSON.stringify({ username: u, password: p, action, payload: payload || {} }),
  });
  let data;
  try { data = await res.json(); } catch (e) { throw new Error('risposta non valida dal server'); }
  if (!res.ok || !data.ok) throw new Error(data.error || 'errore nella richiesta');
  return data;
}

// ============================================================
// APERTURA PANNELLO
// ============================================================
function aggApri() {
  if (!aggHaAccesso()) {
    const root = document.getElementById('aggRoot');
    if (root) root.innerHTML = '<div class="loading-msg">Non hai il permesso per accedere a questa pagina.</div>';
    return;
  }
  if (!aggInizializzato) { aggInitUI(); aggInizializzato = true; }
  aggCaricaLista();
}

// ============================================================
// CSS (iniettato una sola volta — solo ciò che non è già coperto dai
// componenti condivisi di area-riservata.html: card, pill, chip, progbar,
// vol-detail / vol-section / vol-field, doc-upload-overlay ecc.).
// ============================================================
function aggIniettaCSS() {
  if (document.getElementById('aggStyle')) return;
  const style = document.createElement('style');
  style.id = 'aggStyle';
  style.textContent = `
.agg-prog{margin-bottom:18px}
.agg-prog b{display:block;font-size:17px}
.agg-prog .progbar{margin-top:12px}
.agg-chips .chip .n{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--bg);color:var(--fg);font-size:12px;font-weight:700}
.agg-chips .chip.on .n{background:rgba(255,255,255,.2);color:inherit}
.agg-filtri{display:none;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.agg-filtri.open{display:grid}
.agg-filtri label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--muted)}
.agg-row{display:grid;grid-template-columns:minmax(200px,1.4fr) minmax(0,1.6fr) 110px 150px;gap:14px;align-items:center;padding:12px 18px;border-top:1px solid var(--line);cursor:pointer}
.agg-row:first-child{border-top:0}
.agg-row:hover{background:var(--bg)}
.agg-row .vol-n b{display:block}
.agg-row .pills{display:flex;gap:6px;flex-wrap:wrap}
.agg-comp{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.agg-comp .progbar{flex:1}
@media (max-width:860px){.agg-row{grid-template-columns:1fr 1fr;gap:10px}.agg-row .vol-n,.agg-row .pills{grid-column:1 / -1}}
.agg-field-missing{border-color:var(--red)!important;background:var(--red-soft)!important}
.agg-orig-hint{font-size:12px;color:var(--muted);font-style:italic;margin-top:4px;text-align:right}
.agg-cf-msg{font-size:13px;font-weight:600;padding:8px 12px;border-radius:12px;margin-top:6px}
.agg-cf-msg.ok{background:var(--soft);color:var(--accent)}
.agg-cf-msg.err{background:var(--red-soft);color:var(--red)}
.agg-cf-msg.info{background:var(--bg);color:var(--muted)}
.agg-doc-row{display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 0;border-top:1px solid var(--line)}
.agg-doc-row:first-child{border-top:0}
.agg-doc-row-info{flex:1;min-width:0}
.agg-doc-row-name{font-weight:700;font-size:15px}
.agg-doc-row-meta{font-size:13px;color:var(--muted)}
.agg-dpi-cat{margin-bottom:14px}
.agg-dpi-cat-head{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin:4px 0 8px}
.agg-dpi-row{display:grid;grid-template-columns:1.2fr .9fr .9fr;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.agg-dpi-row label{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.agg-dpi-row.off select,.agg-dpi-row.off input{opacity:.35;pointer-events:none}
.agg-dpi-consegnato{display:flex;align-items:center;gap:6px;font-size:13px}
.agg-photo-box{display:flex;align-items:center;gap:16px}
.agg-photo-preview{width:98px;height:118px;border-radius:14px;object-fit:cover;background:var(--bg);flex-shrink:0;border:1px solid var(--line)}
.agg-photo-preview.sm{width:49px;height:59px;border-radius:8px}
.agg-firma{width:105px;height:35px;background:#fff;border-radius:6px;border:1px solid var(--line);object-fit:contain}
.agg-photo-placeholder{width:98px;height:118px;border-radius:14px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--muted);flex-shrink:0}
.agg-crop-wrap{position:relative;width:245px;height:295px;margin:12px auto;border-radius:14px;overflow:hidden;background:#000;touch-action:none}
.agg-crop-canvas{width:100%;height:100%;display:block;cursor:grab}
.agg-crop-guide{position:absolute;inset:0;pointer-events:none}
.agg-crop-guide svg{width:100%;height:100%}
.agg-crop-controls{display:flex;align-items:center;gap:10px;margin:8px 0}
.agg-crop-controls input[type=range]{flex:1;accent-color:var(--accent-bg)}
.agg-crop-info{text-align:center;font-size:13px;color:var(--muted);margin-bottom:10px}
.agg-crop-info.ok{color:var(--accent);font-weight:700}
.agg-crop-info.err{color:var(--red);font-weight:700}
.agg-cat-list-row{display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 0;border-top:1px solid var(--line)}
.agg-cat-list-row.inattivo{opacity:.5}
.agg-cat-head{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin:12px 0 4px}
.agg-prop-box{border:1px solid var(--line);border-radius:16px;padding:14px;margin:4px 0 12px;background:var(--bg)}
.agg-prop-title{font-weight:800;font-size:16px;margin-bottom:2px}
.agg-prop-meta{font-size:13px;color:var(--muted);margin-bottom:10px}
.agg-prop-sub{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin:12px 0 6px}
.agg-prop-table{width:100%;border-collapse:collapse;font-size:14px}
.agg-prop-table th{text-align:left;font-size:12px;color:var(--muted);font-weight:700;padding:6px;border-bottom:1px solid var(--line)}
.agg-prop-table td{padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top;word-break:break-word}
.agg-prop-table td.att{color:var(--muted);text-decoration:line-through}
.agg-prop-table td.prop{font-weight:700}
.agg-prop-actions{display:flex;gap:10px;margin-top:12px}
.agg-prop-actions button{flex:1}
.agg-link-url{width:100%;font-family:monospace;font-size:13px}
.agg-mt{margin-top:12px}
.agg-row2{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.agg-row2>*{flex:1}
`;
  document.head.appendChild(style);
}

// ============================================================
// COSTRUZIONE UI (una volta sola)
// ============================================================
function aggInitUI() {
  aggIniettaCSS();

  const root = document.getElementById('aggRoot');
  if (!root) return;
  root.innerHTML = `
    <div class="card agg-prog" id="aggProg"></div>

    <div class="bar">
      <label class="search" for="aggSearch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4"/></svg><input type="search" id="aggSearch" placeholder="Cerca volontario" autocomplete="off" oninput="aggImpostaSearch(this.value)"></label>
      <button class="chip" id="aggFilterBtn" onclick="aggToggleFiltri()">Filtri</button>
      <span style="flex:1"></span>
      <button class="btn sm" onclick="aggApriCatalogo()">Catalogo DPI</button>
      <button class="btn sm" onclick="aggEsportaCSV()">Esporta CSV</button>
      <button class="btn sm" id="aggSyncBtn" onclick="aggSincronizzaNuovi()">Sincronizza nuovi volontari</button>
    </div>

    <div class="card agg-filtri" id="aggFiltriBox">
      <label>Squadra<select id="aggFiltroSquadra" onchange="aggFiltri.squadra=this.value;aggApplicaFiltri()"><option value="">Tutte le squadre</option></select></label>
      <label>Stato
        <select id="aggFiltroStato" onchange="aggFiltri.stato=this.value;aggApplicaFiltri()">
          <option value="">Tutti gli stati</option>
          <option value="ATTIVO">Attivo</option>
          <option value="SOSPESO">Sospeso</option>
          <option value="DIMESSO">Dimesso</option>
        </select>
      </label>
    </div>

    <div class="chips agg-chips" style="margin-bottom:18px">
      <button class="chip agg-counter" id="aggCntTot" onclick="aggImpostaMissing('')">Tutti <span class="n" id="aggCTot">0</span></button>
      <button class="chip agg-counter" id="aggCntFoto" onclick="aggImpostaMissing('foto')">Senza foto <span class="n" id="aggCFoto">0</span></button>
      <button class="chip agg-counter" id="aggCntDpi" onclick="aggImpostaMissing('dpi')">DPI da fare <span class="n" id="aggCDpi">0</span></button>
      <button class="chip agg-counter" id="aggCntDoc" onclick="aggImpostaMissing('doc')">Documenti mancanti <span class="n" id="aggCDoc">0</span></button>
      <button class="chip agg-counter" id="aggCntVer" onclick="aggImpostaMissing('verifica')">Da verificare <span class="n" id="aggCVer">0</span></button>
      <button class="chip agg-counter" id="aggCntProp" onclick="aggImpostaMissing('proposte')">Proposte <span class="n" id="aggCProp">0</span></button>
    </div>

    <p class="sub" style="margin:-8px 0 10px"><span id="aggMostrati">0</span> risultati</p>

    <div id="aggGrid" class="card tbl"><div class="loading-msg">Caricamento…</div></div>
  `;

  aggCostruisciOverlay();
}

// Overlay: scheda a scomparsa, catalogo DPI, editor foto, upload documento.
// Sono div "fratelli" del panel (come vol-detail/vol-form per Volontari/Mezzi),
// appesi a document.body una sola volta.
function aggCostruisciOverlay() {
  if (document.getElementById('aggDetail')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="vol-detail" id="aggDetail">
      <div class="vol-detail-top">
        <h2 class="vol-detail-title" id="aggDetailTitle">—</h2>
        <button class="x" onclick="aggChiudiScheda()" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="vol-detail-body" id="aggDetailBody"></div>
    </div>

    <div class="doc-upload-overlay" id="aggCatalogoOverlay">
      <div class="doc-upload-card">
        <div class="shead" style="padding:0 0 10px"><h2>Catalogo DPI</h2><button class="x" onclick="aggChiudiCatalogo()" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div id="aggCatalogoList"></div>
        <div class="vol-form-section" style="margin-top:14px">
          <div class="vol-form-section-title">Nuovo capo</div>
          <div class="vol-form-grid">
            <div class="vol-form-field"><span class="vol-form-lbl">Categoria</span><input class="vol-form-inp" id="aggCatNuovaCategoria" list="aggCatCategorieList" placeholder="es. GENERICO"></div>
            <div class="vol-form-field"><span class="vol-form-lbl">Nome capo</span><input class="vol-form-inp" id="aggCatNuovoNome" placeholder="es. Giacca softshell"></div>
            <div class="vol-form-field"><span class="vol-form-lbl">Tipo taglia</span>
              <select class="vol-form-inp" id="aggCatNuovoTipoTaglia">
                <option value="ABITO">Abito</option><option value="SCARPA">Scarpa</option>
                <option value="GUANTO">Guanto</option><option value="UNICA">Unica</option>
              </select>
            </div>
            <div class="vol-form-field"><span class="vol-form-lbl">Ordine</span><input class="vol-form-inp" id="aggCatNuovoOrdine" type="number" value="0"></div>
          </div>
          <datalist id="aggCatCategorieList"></datalist>
          <button class="btn pri full agg-mt" onclick="aggCatalogoSalva()">Aggiungi al catalogo</button>
        </div>
      </div>
    </div>

    <div class="doc-upload-overlay" id="aggFotoOverlay">
      <div class="doc-upload-card" style="width:min(400px,100%)">
        <div class="shead" style="padding:0 0 10px"><h2>Foto tessera PIA</h2><button class="x" onclick="aggChiudiEditorFoto()" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <p class="note" style="margin:0 0 10px">Formato 196×236 px, JPG, &lt; 50 KB. Inquadra viso e spalle: il viso deve occupare il 70–80% della foto.</p>
        <input type="file" accept="image/*" id="aggFotoInput" onchange="aggFotoFileSelezionato(this)" style="width:100%;margin-bottom:10px">
        <div id="aggCropArea" style="display:none">
          <div class="agg-crop-wrap">
            <canvas class="agg-crop-canvas" id="aggCropCanvas" width="196" height="236"></canvas>
            <div class="agg-crop-guide"><svg viewBox="0 0 196 236" preserveAspectRatio="none"><ellipse cx="98" cy="100" rx="56" ry="68" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.5" stroke-dasharray="4 3"/></svg></div>
          </div>
          <div class="agg-crop-controls">
            <span class="sub">Zoom</span>
            <input type="range" id="aggCropZoom" min="100" max="400" value="100" oninput="aggFotoZoomCambiato(this.value)">
          </div>
          <div class="agg-crop-info" id="aggCropInfo">trascina per spostare, usa lo zoom per ingrandire</div>
          <button class="btn pri full" onclick="aggFotoConferma()">Usa questa foto</button>
        </div>
      </div>
    </div>

    <div class="doc-upload-overlay" id="aggLinkOverlay">
      <div class="doc-upload-card" style="width:min(460px,100%)">
        <div class="shead" style="padding:0 0 10px"><h2>Link personale</h2><button class="x" onclick="aggChiudiLinkOverlay()" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <p class="note" style="margin:0 0 10px" id="aggLinkInfo"></p>
        <input class="agg-link-url" id="aggLinkUrl" readonly onclick="this.select()">
        <p class="bad" style="margin:10px 0 12px">Il link si vede solo adesso: copialo o invialo prima di chiudere. Se lo perdi, generane uno nuovo (il precedente smette di funzionare).</p>
        <div class="agg-row2">
          <button class="btn" id="aggLinkCopiaBtn" onclick="aggLinkCopia()">Copia</button>
          <button class="btn pri" onclick="aggLinkWhatsApp()">Invia su WhatsApp</button>
        </div>
        <div class="agg-row2">
          <button class="btn sm" onclick="aggLinkEmail()">Email</button>
          <button class="btn sm" onclick="aggLinkSms()">SMS</button>
          <button class="btn sm" id="aggLinkShareBtn" onclick="aggLinkCondividi()">Condividi</button>
        </div>
      </div>
    </div>

    <div class="doc-upload-overlay" id="aggDocOverlay">
      <div class="doc-upload-card" style="width:min(460px,100%)">
        <div class="shead" style="padding:0 0 10px"><h2 id="aggDocOverlayTitle">Carica documento</h2><button class="x" onclick="aggChiudiUploadDoc()" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="form">
          <label>Descrizione<input id="aggDocDescrizione" placeholder="es. Attestato corso antincendio"></label>
          <label>Scadenza (facoltativa)<input id="aggDocScadenza" type="date"></label>
          <input type="file" accept="application/pdf,image/*" id="aggDocFileInput" onchange="aggDocFileSelezionato(this)">
          <p class="note" id="aggDocFileLabel" style="margin:0">PDF o JPG, max 10MB</p>
          <p class="bad" id="aggDocUploadErr" style="display:none;margin:0"></p>
          <div class="actions"><button class="btn" onclick="aggChiudiUploadDoc()">Annulla</button><button class="btn pri" id="aggDocUploadBtn" onclick="aggEseguiUploadDoc()">Carica</button></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
}

// ============================================================
// LISTA / FILTRI / CONTATORI
// ============================================================
async function aggCaricaLista() {
  const grid = document.getElementById('aggGrid');
  if (grid) grid.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const [data, prop] = await Promise.all([aggCall('list', {}), aggCall('proposte_lista', {}).catch(aggErroreFase2)]);
    aggProposteAperte = {};
    (prop.proposte || []).forEach(p => { if (!aggProposteAperte[p.volontario_id]) aggProposteAperte[p.volontario_id] = p; });
    aggVolontari = (data.cards || []).map(c => Object.assign(c, { proposta_aperta: !!aggProposteAperte[c.id] }));
    aggContatori = data.contatori || {};
    aggContatori.proposte = aggVolontari.filter(c => c.proposta_aperta).length;
    aggRenderContatori();
    aggPopolaFiltroSquadre();
    aggApplicaFiltri();
  } catch (e) {
    if (grid) grid.innerHTML = '<div class="loading-msg bad">Errore: ' + e.message + '</div>';
  }
}

function aggRenderContatori() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || 0; };
  set('aggCTot', aggContatori.totale);
  set('aggCFoto', aggContatori.foto_mancante);
  set('aggCDpi', aggContatori.dpi_mancanti);
  set('aggCDoc', aggContatori.documenti_mancanti);
  set('aggCVer', aggContatori.da_verificare);
  set('aggCProp', aggContatori.proposte);
  const box = document.getElementById('aggProg');
  if (box) {
    const tot = aggVolontari.length;
    const ok  = aggVolontari.filter(v => v.completezza >= 100).length;
    box.innerHTML = '<b>Schede complete: ' + ok + ' su ' + tot + '</b>'
      + '<span class="sub">Anagrafica, foto, documenti e DPI</span>'
      + '<div class="progbar"><i style="width:' + Math.round(ok / Math.max(1, tot) * 100) + '%"></i></div>';
  }
  const t = document.getElementById('aggCntTot');
  if (t && !aggFiltri.missing) t.classList.add('active');
}

function aggPopolaFiltroSquadre() {
  const sel = document.getElementById('aggFiltroSquadra');
  if (!sel) return;
  const squadre = Array.from(new Set(aggVolontari.map(v => v.squadra).filter(Boolean))).sort();
  const corrente = sel.value;
  sel.innerHTML = '<option value="">Tutte le squadre</option>' + squadre.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  sel.value = corrente;
}

function aggToggleFiltri() {
  document.getElementById('aggFiltriBox').classList.toggle('open');
  document.getElementById('aggFilterBtn').classList.toggle('active');
}

function aggImpostaSearch(v) { aggFiltri.search = v; aggApplicaFiltri(); }

function aggImpostaMissing(m) {
  aggFiltri.missing = (aggFiltri.missing === m) ? '' : m;
  document.querySelectorAll('.agg-counter').forEach(c => c.classList.remove('active'));
  const map = { '': 'aggCntTot', foto: 'aggCntFoto', dpi: 'aggCntDpi', doc: 'aggCntDoc', verifica: 'aggCntVer', proposte: 'aggCntProp' };
  const el = document.getElementById(map[aggFiltri.missing] || 'aggCntTot');
  if (el) el.classList.add('active');
  aggApplicaFiltri();
}

function aggDocManca(v) {
  return !v.blocchi.carta_identita || !v.blocchi.codice_fiscale || v.blocchi.patente === false;
}

function aggApplicaFiltri() {
  const f = aggFiltri;
  const q = (f.search || '').toLowerCase().trim();
  const filtrati = aggVolontari.filter(v => {
    if (q) {
      const nome = ((v.cognome || '') + ' ' + (v.nome || '') + ' ' + (v.squadra || '')).toLowerCase();
      if (!nome.includes(q)) return false;
    }
    if (f.squadra && v.squadra !== f.squadra) return false;
    if (f.stato && v.stato !== f.stato) return false;
    if (f.missing === 'foto' && v.blocchi.foto) return false;
    if (f.missing === 'dpi' && v.blocchi.dpi_valutati) return false;
    if (f.missing === 'doc' && !aggDocManca(v)) return false;
    if (f.missing === 'verifica' && v.stato_verifica === 'VERIFICATO') return false;
    if (f.missing === 'proposte' && !v.proposta_aperta) return false;
    return true;
  });
  aggRenderGriglia(filtrati);
}

function aggRenderGriglia(list) {
  const grid = document.getElementById('aggGrid');
  if (!grid) return;
  const m = document.getElementById('aggMostrati'); if (m) m.textContent = list.length;
  if (!list.length) { grid.innerHTML = '<div class="loading-msg">Nessun volontario in questo elenco.</div>'; return; }
  grid.innerHTML = '';
  list.forEach(v => grid.appendChild(aggCardEl(v)));
}

function aggCardEl(v) {
  const initials = ((v.cognome || '?')[0] + (v.nome || '?')[0]).toUpperCase();
  const row = document.createElement('div');
  row.className = 'agg-row';
  row.onclick = () => aggApriScheda(v.id);
  const ver = v.stato_verifica || 'DA_FARE';
  const verCls = ver === 'VERIFICATO' ? 'p-blue' : (ver === 'IN_CORSO' ? 'p-yellow' : 'p-grey');
  const docManca = aggDocManca(v);

  row.innerHTML = '<div class="vol-n"><span class="av s40">' + initials + '</span><div><b>' + v.cognome + ' ' + v.nome + '</b>'
    + '<span class="sub">' + (v.squadra || '—') + ' · PIA ' + (v.pia_matricola || '—') + '</span></div></div>'
    + '<div class="pills">'
    + (v.proposta_aperta ? '<span class="pill p-yellow">Proposta da approvare</span>' : '')
    + '<span class="pill ' + (v.blocchi.foto ? 'p-blue' : 'p-red') + '">' + (v.blocchi.foto ? 'Foto' : 'Senza foto') + '</span>'
    + (docManca ? '<span class="pill p-sand">Documenti mancanti</span>' : '')
    + (!v.blocchi.dpi_valutati ? '<span class="pill p-sand">DPI da fare</span>' : '')
    + '</div>'
    + '<span><span class="pill ' + verCls + '">' + ver.replace('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) + '</span></span>'
    + '<div class="agg-comp"><div class="progbar"><i style="width:' + v.completezza + '%"></i></div>' + v.completezza + '%</div>';
  return row;
}

// ============================================================
// SINCRONIZZA NUOVI VOLONTARI (da volontari → agg_volontari, solo inserimenti)
// ============================================================
async function aggSincronizzaNuovi() {
  if (!aggHaAccesso()) return;
  if (!confirm('Aggiungere ad "Aggiornamento dati" i volontari non dimessi che non sono ancora presenti?\n\nLe schede già esistenti non vengono modificate.')) return;
  const btn = document.getElementById('aggSyncBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sincronizzazione…'; }
  try {
    const data = await aggCall('sincronizza_nuovi', {});
    const aggiunti = data.aggiunti || [];
    alert(aggiunti.length
      ? 'Aggiunti ' + aggiunti.length + (aggiunti.length === 1 ? ' volontario: ' : ' volontari: ')
        + aggiunti.map(a => ((a.cognome || '') + ' ' + (a.nome || '')).trim().toUpperCase()).join(', ')
      : 'Nessun nuovo volontario');
    await aggCaricaLista();
  } catch (e) { alert('Errore sincronizzazione: ' + e.message); }
  if (btn) { btn.disabled = false; btn.textContent = 'Sincronizza nuovi volontari'; }
}

// ============================================================
// EXPORT CSV (placeholder — formato definitivo per i gestionali da definire)
// ============================================================
function aggEsportaCSV() {
  if (!aggVolontari.length) { alert('Nessun dato da esportare.'); return; }
  const cols = ['id', 'cognome', 'nome', 'squadra', 'tipo_volontario', 'stato', 'stato_verifica', 'pia_matricola', 'completezza'];
  const righe = [cols.join(';')].concat(aggVolontari.map(v => cols.map(c => '"' + String(v[c] == null ? '' : v[c]).replace(/"/g, '""') + '"').join(';')));
  const blob = new Blob(['﻿' + righe.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aggiornamento_dati_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ============================================================
// SCHEDA A SCOMPARSA
// ============================================================
async function aggApriScheda(id) {
  const detail = document.getElementById('aggDetail');
  const body = document.getElementById('aggDetailBody');
  detail.classList.add('open');
  detail.scrollTop = 0;
  body.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  aggFotoSignedUrl = null;
  aggPropCorrente = null;
  try {
    const [data, prop] = await Promise.all([aggCall('get', { id }), aggCall('proposta_dettaglio', { volontario_id: id }).catch(aggErroreFase2)]);
    aggCorrente = data;
    aggPropCorrente = prop;
    document.getElementById('aggDetailTitle').textContent = data.volontario.cognome + ' ' + data.volontario.nome;
    aggRenderScheda();
  } catch (e) {
    body.innerHTML = '<div class="loading-msg bad">Errore: ' + e.message + '</div>';
  }
}

function aggChiudiScheda() {
  document.getElementById('aggDetail').classList.remove('open');
  aggCorrente = null;
  aggPropCorrente = null;
  // Riallinea le card (percentuali/badge potrebbero essere cambiati)
  aggCaricaLista();
}

function aggFmtVal(v) { return (v === null || v === undefined || v === '') ? null : v; }

function aggRenderScheda() {
  const body = document.getElementById('aggDetailBody');
  if (!body || !aggCorrente) return;
  const v = aggCorrente.volontario;
  const comp = aggCorrente.completezza;

  body.innerHTML = '<div class="agg-comp" style="margin:4px 0 14px"><span>Completezza</span><div class="progbar"><i style="width:' + comp.percentuale + '%"></i></div>' + comp.percentuale + '%</div>'
    + aggBloccoProposta(v)
    + aggBloccoLink(v)
    + aggBloccoAnagrafica(v)
    + aggBloccoFoto(v)
    + aggBloccoDocumenti(v)
    + aggBloccoDpi(v)
    + aggBloccoVerifica(v);

  aggCaricaFotoAnteprima();
  aggVerificaCF();
}

// ============================================================
// FASE 2 — LINK PERSONALE E PROPOSTE DEI VOLONTARI
// ============================================================
// I valori delle proposte arrivano da una pagina pubblica: sempre escapati.
function aggEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function aggFmtDataOra(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// Le funzioni della fase 2 non devono mai impedire l'uso della fase 1
// (es. agg-api non ancora aggiornata sul server): in caso di errore
// lista e scheda si aprono comunque, senza proposte.
function aggErroreFase2(e) {
  console.warn('Aggiornamento dati — funzioni link/proposte non disponibili:', e.message);
  return { proposte: [], link: null, proposta: null };
}

async function aggRicaricaScheda(id) {
  const [data, prop] = await Promise.all([aggCall('get', { id }), aggCall('proposta_dettaglio', { volontario_id: id }).catch(aggErroreFase2)]);
  aggCorrente = data;
  aggPropCorrente = prop;
  aggRenderScheda();
}

// -- BLOCCO LINK --
function aggBloccoLink(v) {
  const l = aggPropCorrente && aggPropCorrente.link;
  let stato = '<span class="pill p-grey">Nessun link generato</span>';
  if (l) {
    if (l.attivo) stato = '<span class="pill p-blue">Attivo</span> fino al ' + new Date(l.scade_il).toLocaleDateString('it-IT');
    else if (l.bloccato && !l.revocato) stato = '<span class="pill p-red">Bloccato</span> (troppi tentativi errati)';
    else if (l.revocato) stato = '<span class="pill p-grey">Revocato / chiuso</span>';
    else stato = '<span class="pill p-sand">Scaduto</span> il ' + new Date(l.scade_il).toLocaleDateString('it-IT');
  }
  return '<div class="vol-section">'
    + '<div class="vol-section-head" onclick="toggleVolSection(this)">Link per il volontario</div>'
    + '<div class="vol-section-body">'
    + '<div class="vol-field"><span class="vol-field-label">Stato</span><span class="vol-field-value">' + stato + '</span></div>'
    + (l ? '<div class="vol-field"><span class="vol-field-label">Generato</span><span class="vol-field-value">' + aggFmtDataOra(l.creato_il) + (l.creato_da ? ' — ' + aggEsc(l.creato_da) : '') + '</span></div>'
         + '<div class="vol-field"><span class="vol-field-label">Ultimo accesso</span><span class="vol-field-value">' + aggFmtDataOra(l.ultimo_accesso) + ' (' + (l.usi || 0) + ' utilizzi)</span></div>'
         + (l.tentativi_falliti ? '<div class="vol-field"><span class="vol-field-label">Tentativi errati</span><span class="vol-field-value">' + l.tentativi_falliti + ' / 5</span></div>' : '')
       : '')
    + (!v.data_nascita ? '<div class="agg-cf-msg err">Per generare il link serve la data di nascita in anagrafica.</div>' : '')
    + '<div class="agg-row2">'
    + '<button class="btn sm pri" onclick="aggLinkGenera(' + v.id + ')">' + (l ? 'Genera nuovo link' : 'Genera link') + '</button>'
    + (l && l.attivo ? '<button class="btn sm danger" style="flex:none" onclick="aggLinkRevoca(' + v.id + ')">Revoca</button>' : '')
    + '</div></div></div>';
}

async function aggLinkGenera(id) {
  const l = aggPropCorrente && aggPropCorrente.link;
  if (l && l.attivo && !confirm('Esiste già un link attivo: generandone uno nuovo il precedente smette di funzionare. Continuare?')) return;
  try {
    aggLinkCorrente = await aggCall('link_genera', { volontario_id: id });
    document.getElementById('aggLinkUrl').value = aggLinkCorrente.url;
    document.getElementById('aggLinkInfo').textContent = 'Per ' + aggLinkCorrente.cognome + ' ' + aggLinkCorrente.nome
      + ' — valido fino al ' + new Date(aggLinkCorrente.scade_il).toLocaleDateString('it-IT') + '.';
    document.getElementById('aggLinkCopiaBtn').textContent = '📋 Copia';
    document.getElementById('aggLinkOverlay').classList.add('open');
    const prop = await aggCall('proposta_dettaglio', { volontario_id: id });
    aggPropCorrente = prop;
    aggRenderScheda();
  } catch (e) { alert('Errore: ' + e.message); }
}

function aggChiudiLinkOverlay() {
  document.getElementById('aggLinkOverlay').classList.remove('open');
  document.getElementById('aggLinkUrl').value = '';
  aggLinkCorrente = null; // il token in chiaro non resta in memoria
}

async function aggLinkCopia() {
  const inp = document.getElementById('aggLinkUrl');
  try { await navigator.clipboard.writeText(inp.value); }
  catch (e) { inp.select(); document.execCommand('copy'); }
  document.getElementById('aggLinkCopiaBtn').textContent = '✓ Copiato';
}

function aggLinkMessaggio(l) {
  return 'Ciao ' + (l.nome || '') + ', ti chiediamo di controllare e aggiornare i tuoi dati di volontario della Protezione Civile ANA Casale Monferrato (anagrafica, taglie, foto e documenti).\n\n'
    + 'Apri il tuo link personale:\n' + l.url + '\n\n'
    + 'Ti verrà chiesta la tua data di nascita. Il link è valido fino al ' + new Date(l.scade_il).toLocaleDateString('it-IT') + '. Non inoltrarlo ad altri.\nGrazie!';
}

// Numero in formato internazionale senza "+" (es. 393331234567), '' se non utilizzabile
function aggLinkNumero() {
  let num = String((aggLinkCorrente && aggLinkCorrente.telefono) || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (/^3\d{8,9}$/.test(num)) num = '39' + num; // cellulare italiano senza prefisso
  return num.length >= 10 ? num : '';
}

function aggLinkWhatsApp() {
  if (!aggLinkCorrente) return;
  const testo = encodeURIComponent(aggLinkMessaggio(aggLinkCorrente));
  window.open('https://wa.me/' + aggLinkNumero() + '?text=' + testo, '_blank');
}

function aggLinkEmail() {
  if (!aggLinkCorrente) return;
  const a = (aggLinkCorrente.email || '').trim();
  const oggetto = encodeURIComponent('Aggiornamento dati volontario — Protezione Civile ANA Casale Monferrato');
  const corpo = encodeURIComponent(aggLinkMessaggio(aggLinkCorrente));
  if (!a) alert('Nel profilo non c\'è un\'email: scrivi tu il destinatario.');
  window.location.href = 'mailto:' + encodeURIComponent(a).replace(/%40/g, '@') + '?subject=' + oggetto + '&body=' + corpo;
}

function aggLinkSms() {
  if (!aggLinkCorrente) return;
  const num = aggLinkNumero();
  if (!num) alert('Nel profilo non c\'è un numero di cellulare valido: scegli tu il destinatario.');
  // "?body=" funziona su Android e sulle versioni recenti di iOS
  window.location.href = 'sms:' + (num ? '+' + num : '') + '?body=' + encodeURIComponent(aggLinkMessaggio(aggLinkCorrente));
}

async function aggLinkCondividi() {
  if (!aggLinkCorrente) return;
  if (!navigator.share) {
    try { await navigator.clipboard.writeText(aggLinkMessaggio(aggLinkCorrente)); } catch (e) { await aggLinkCopia(); }
    alert('Condivisione non disponibile su questo dispositivo: il messaggio è stato copiato, incollalo dove vuoi.'); return; }
  try { await navigator.share({ title: 'Aggiornamento dati', text: aggLinkMessaggio(aggLinkCorrente) }); }
  catch (e) { /* condivisione annullata */ }
}

async function aggLinkRevoca(id) {
  if (!confirm('Revocare il link? Il volontario non potrà più usarlo.')) return;
  try {
    await aggCall('link_revoca', { volontario_id: id });
    aggPropCorrente = await aggCall('proposta_dettaglio', { volontario_id: id });
    aggRenderScheda();
  } catch (e) { alert('Errore: ' + e.message); }
}

// -- BLOCCO PROPOSTA --
function aggFmtValProp(campo, val) {
  if (val === null || val === undefined || String(val).trim() === '') return '<span class="sub" style="display:inline">—</span>';
  if (campo === 'data_nascita' && /^\d{4}-\d{2}-\d{2}/.test(String(val))) return new Date(String(val).slice(0, 10) + 'T00:00:00').toLocaleDateString('it-IT');
  return aggEsc(val);
}
function aggFmtDpi(x) { return x.ha ? ('sì' + (x.taglia ? ' — ' + aggEsc(x.taglia) : '')) : 'no'; }

function aggBloccoProposta(v) {
  const p = aggPropCorrente && aggPropCorrente.proposta;
  if (!p) return '';
  let html = '<div class="agg-prop-box">'
    + '<div class="agg-prop-title">📝 Proposta da approvare</div>'
    + '<div class="agg-prop-meta">Inviata dal volontario il ' + aggFmtDataOra(p.inviata_il)
    + (p.privacy_accettata_il ? ' — informativa privacy accettata' : '') + '. I dati attuali non cambiano finché non approvi.</div>';

  html += '<div class="agg-prop-sub">Anagrafica</div>';
  if (!p.campi.length) html += '<div class="note">nessuna modifica</div>';
  else {
    html += '<table class="agg-prop-table"><tr><th></th><th>Campo</th><th>Attuale</th><th>Proposto</th></tr>';
    p.campi.forEach(c => {
      html += '<tr><td><input type="checkbox" class="aggPropCampo" value="' + aggEsc(c.campo) + '" checked></td>'
        + '<td>' + aggEsc(AGG_CAMPI_LABEL[c.campo] || c.campo) + '</td>'
        + '<td class="att">' + aggFmtValProp(c.campo, c.attuale) + '</td>'
        + '<td class="prop">' + aggFmtValProp(c.campo, c.proposto) + '</td></tr>';
    });
    html += '</table>';
  }

  html += '<div class="agg-prop-sub">Taglie e DPI</div>';
  if (!p.dpi.length) html += '<div class="note">nessuna modifica</div>';
  else {
    html += '<table class="agg-prop-table"><tr><th></th><th>Capo</th><th>Attuale</th><th>Proposto</th></tr>';
    p.dpi.forEach(d => {
      html += '<tr><td><input type="checkbox" class="aggPropDpi" value="' + Number(d.dpi_id) + '" checked></td>'
        + '<td>' + aggEsc(d.nome) + '<div class="note">' + aggEsc(d.categoria) + '</div></td>'
        + '<td class="att">' + aggFmtDpi(d.attuale) + '</td>'
        + '<td class="prop">' + aggFmtDpi(d.proposto) + '</td></tr>';
    });
    html += '</table>';
  }

  html += '<div class="agg-prop-sub">Foto e documenti in attesa</div>';
  const docs = p.documenti || [];
  if (!docs.length) html += '<div class="note">nessun file caricato</div>';
  docs.forEach(d => {
    const scad = d.scadenza ? ' — scade ' + new Date(d.scadenza).toLocaleDateString('it-IT') : '';
    html += '<div class="agg-doc-row">'
      + '<input type="checkbox" class="aggPropDoc" value="' + Number(d.id) + '" checked>'
      + (d.tipo === 'FOTO' ? '<img id="aggPropFoto_' + Number(d.id) + '" class="agg-photo-preview sm" alt="">' : '')
      + (d.tipo === 'FIRMA' ? '<img id="aggPropFoto_' + Number(d.id) + '" class="agg-firma" alt="">' : '')
      + '<div class="agg-doc-row-info"><div class="agg-doc-row-name">' + aggEsc(AGG_DOC_LABEL[d.tipo] || d.tipo) + '</div>'
      + '<div class="agg-doc-row-meta">' + (d.descrizione ? aggEsc(d.descrizione) + ' — ' : '') + aggEsc(d.nome_file || '') + scad + '</div></div>'
      + '<button class="btn-sm" onclick="aggApriDocumento(' + Number(d.id) + ')">apri</button></div>';
  });

  html += '<div class="note">Le righe non spuntate vengono scartate (i file non accettati sono eliminati). Dopo l\'approvazione il link del volontario viene chiuso.</div>'
    + '<div class="agg-prop-actions">'
    + '<button class="vol-form-save" onclick="aggPropostaApprova(' + Number(p.id) + ')">✓ Approva selezionati</button>'
    + '<button class="btn-sm btn-danger" onclick="aggPropostaRifiuta(' + Number(p.id) + ')">Rifiuta</button>'
    + '</div></div>';

  setTimeout(aggCaricaFotoProposta, 0);
  return html;
}

async function aggCaricaFotoProposta() {
  const p = aggPropCorrente && aggPropCorrente.proposta;
  if (!p) return;
  for (const d of (p.documenti || []).filter(x => x.tipo === 'FOTO' || x.tipo === 'FIRMA')) {
    const img = document.getElementById('aggPropFoto_' + d.id);
    if (!img) continue;
    try { img.src = (await aggCall('doc_signed_url', { id: d.id })).url; } catch (e) { /* anteprima non disponibile */ }
  }
}

function aggValoriSpuntati(cls) {
  return Array.from(document.querySelectorAll('.' + cls)).filter(c => c.checked).map(c => c.value);
}

async function aggPropostaApprova(id) {
  const campi = aggValoriSpuntati('aggPropCampo');
  const dpi = aggValoriSpuntati('aggPropDpi').map(Number);
  const documenti = aggValoriSpuntati('aggPropDoc').map(Number);
  if (!confirm('Approvare la proposta?\n\n' + campi.length + ' campi, ' + dpi.length + ' DPI e ' + documenti.length + ' file verranno applicati; il resto verrà scartato.')) return;
  const volId = aggCorrente.volontario.id;
  try {
    await aggCall('proposta_approva', { id, campi, dpi, documenti });
  } catch (e) { alert('Errore: ' + e.message); }
  try { await aggRicaricaScheda(volId); } catch (e) { alert('Errore: ' + e.message); }
}

async function aggPropostaRifiuta(id) {
  const motivo = prompt('Rifiutare la proposta? I file caricati dal volontario verranno eliminati.\n\nMotivo (facoltativo):', '');
  if (motivo === null) return;
  const volId = aggCorrente.volontario.id;
  try {
    await aggCall('proposta_rifiuta', { id, note: motivo.trim() || null });
  } catch (e) { alert('Errore: ' + e.message); }
  try { await aggRicaricaScheda(volId); } catch (e) { alert('Errore: ' + e.message); }
}

// -- BLOCCO 1: ANAGRAFICA --
function aggCampoHtml(key, label, v, tipo) {
  tipo = tipo || 'text';
  const val = v[key] == null ? '' : v[key];
  const obbligatorio = AGG_CAMPI_OBBLIGATORI.includes(key);
  const vuoto = obbligatorio && String(val).trim() === '';
  const origine = v.origine || {};
  const origVal = origine[key];
  const diverso = origVal !== undefined && origVal !== null && String(origVal) !== String(val) && String(origVal).trim() !== '';
  const onchange = "oninput=\"aggAnagraficaCambiata('" + key + "',this.value)\"";
  let input;
  if (tipo === 'select-stato') {
    input = '<select class="vol-form-inp' + (vuoto ? ' agg-field-missing' : '') + '" id="aggF_' + key + '" ' + onchange.replace('oninput', 'onchange') + '>'
      + ['', 'ATTIVO', 'SOSPESO', 'DIMESSO'].map(o => '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + (o || '—') + '</option>').join('')
      + '</select>';
  } else {
    input = '<input class="vol-form-inp' + (vuoto ? ' agg-field-missing' : '') + '" id="aggF_' + key + '" type="' + tipo + '" value="' + String(val).replace(/"/g, '&quot;') + '" ' + onchange + '>';
  }
  return '<div class="vol-form-field" style="margin-bottom:12px">'
    + '<span class="vol-form-lbl">' + label + (obbligatorio ? ' *' : '') + '</span>'
    + input
    + (diverso ? '<div class="agg-orig-hint">originale: ' + origVal + '</div>' : '')
    + '</div>';
}

function aggBloccoAnagrafica(v) {
  return '<div class="vol-section">'
    + '<div class="vol-section-head" onclick="toggleVolSection(this)">Anagrafica</div>'
    + '<div class="vol-section-body">'
    + '<div class="vol-form-grid">'
    + aggCampoHtml('cognome', 'Cognome', v)
    + aggCampoHtml('nome', 'Nome', v)
    + aggCampoHtml('codice_fiscale', 'Codice fiscale', v)
    + aggCampoHtml('data_nascita', 'Data nascita', v, 'date')
    + aggCampoHtml('luogo_nascita', 'Luogo nascita', v)
    + aggCampoHtml('provincia_nascita', 'Provincia nascita', v)
    + aggCampoHtml('squadra', 'Squadra', v)
    + aggCampoHtml('tipo_volontario', 'Tipo volontario', v)
    + aggCampoHtml('stato', 'Stato', v, 'select-stato')
    + aggCampoHtml('indirizzo', 'Indirizzo', v)
    + aggCampoHtml('civico', 'Civico', v)
    + aggCampoHtml('cap', 'CAP', v)
    + aggCampoHtml('citta', 'Città', v)
    + aggCampoHtml('provincia', 'Provincia', v)
    + aggCampoHtml('telefono', 'Telefono', v)
    + aggCampoHtml('email', 'Email', v)
    + aggCampoHtml('gruppo_alpini', 'Gruppo Alpini', v)
    + aggCampoHtml('titolo_studio', 'Titolo di studio', v)
    + aggCampoHtml('professione', 'Professione', v)
    + aggCampoHtml('patenti', 'Patenti', v)
    + aggCampoHtml('tessera_ana', 'Tessera ANA', v)
    + aggCampoHtml('pia_matricola', 'Matricola PIA', v)
    + '</div>'
    + '<div id="aggCFCheck"></div>'
    + '<div class="vol-form-field" style="margin-top:12px"><span class="vol-form-lbl">Note</span>'
    + '<textarea class="vol-form-inp" id="aggF_note" rows="2" oninput="aggAnagraficaCambiata(\'note\',this.value)">' + (v.note || '') + '</textarea></div>'
    + '<label class="vol-form-check"><input type="checkbox" id="aggF_pia_badge" ' + (v.pia_badge ? 'checked' : '') + ' onchange="aggAnagraficaCambiata(\'pia_badge\',this.checked)"> Badge PIA consegnato</label>'
    + '<button class="btn pri full agg-mt" onclick="aggSalvaAnagrafica()">salva anagrafica</button>'
    + '</div></div>';
}

let aggAnagraficaDirty = {};
function aggAnagraficaCambiata(key, val) { aggAnagraficaDirty[key] = val; if (['codice_fiscale', 'data_nascita', 'luogo_nascita'].includes(key)) aggVerificaCF(); }

function aggVerificaCF() {
  const el = document.getElementById('aggCFCheck');
  if (!el) return;
  const cf = (document.getElementById('aggF_codice_fiscale') || {}).value || '';
  const dataNascita = (document.getElementById('aggF_data_nascita') || {}).value || '';
  const luogoNascita = (document.getElementById('aggF_luogo_nascita') || {}).value || '';
  if (!cf) { el.innerHTML = ''; return; }
  if (typeof validaCodiceFiscale !== 'function') { el.innerHTML = ''; return; }
  const check = validaCodiceFiscale(cf);
  if (!check.ok) { el.innerHTML = '<div class="agg-cf-msg err">' + check.msg + '</div>'; return; }
  let html = '<div class="agg-cf-msg ok">✓ Codice fiscale formalmente corretto</div>';
  if (typeof verificaCoerenzaCF === 'function' && (dataNascita || luogoNascita)) {
    const discrepanze = verificaCoerenzaCF(cf, dataNascita, luogoNascita);
    discrepanze.forEach(d => { html += '<div class="agg-cf-msg ' + (d.tipo === 'errore' ? 'err' : 'info') + '">' + d.msg + '</div>'; });
  }
  el.innerHTML = html;
}

async function aggSalvaAnagrafica() {
  if (!aggCorrente) return;
  if (!Object.keys(aggAnagraficaDirty).length) { alert('Nessuna modifica da salvare.'); return; }
  try {
    const data = await aggCall('update_anagrafica', { id: aggCorrente.volontario.id, campi: aggAnagraficaDirty });
    aggCorrente.volontario = data.volontario;
    aggAnagraficaDirty = {};
    aggRenderScheda();
    // Nota: niente logAttivita() qui — ogni scrittura è già registrata server-side
    // dentro agg-api (verificata sull'utente reale, non su currentUser.nome).
  } catch (e) { alert('Errore salvataggio: ' + e.message); }
}

// -- BLOCCO 2: FOTO --
function aggBloccoFoto(v) {
  return '<div class="vol-section">'
    + '<div class="vol-section-head" onclick="toggleVolSection(this)">Foto</div>'
    + '<div class="vol-section-body">'
    + '<div class="agg-photo-box">'
    + '<div id="aggFotoPreviewBox"><div class="agg-photo-placeholder">📷</div></div>'
    + '<div><button class="btn-sm btn-ok" onclick="aggApriEditorFoto(' + v.id + ')">' + (v.pia_foto ? 'sostituisci foto' : '+ carica foto') + '</button>'
    + '<div class="note">JPG 196×236, &lt; 50KB</div></div>'
    + '</div></div></div>';
}

async function aggCaricaFotoAnteprima() {
  const box = document.getElementById('aggFotoPreviewBox');
  if (!box || !aggCorrente) return;
  const fotoDoc = (aggCorrente.documenti || []).find(d => d.tipo === 'FOTO');
  if (!fotoDoc) { box.innerHTML = '<div class="agg-photo-placeholder">📷</div>'; return; }
  try {
    const data = await aggCall('doc_signed_url', { id: fotoDoc.id });
    aggFotoSignedUrl = data.url;
    box.innerHTML = '<img src="' + data.url + '" class="agg-photo-preview">';
  } catch (e) { box.innerHTML = '<div class="agg-photo-placeholder">⚠️</div>'; }
}

// -- BLOCCO 3: DOCUMENTI --
function aggBloccoDocumenti(v) {
  const docs = aggCorrente.documenti || [];
  let html = '<div class="vol-section"><div class="vol-section-head" onclick="toggleVolSection(this)">Documenti</div><div class="vol-section-body">';

  AGG_TIPI_DOC_SINGOLI.forEach(tipo => {
    if (tipo === 'PATENTE' && !v.patenti) return; // solo se patenti valorizzato
    // Più file per tipo possibili (es. fronte/retro caricati dal volontario col link)
    const docsTipo = docs.filter(d => d.tipo === tipo);
    if (!docsTipo.length) html += aggDocRigaHtml(tipo, null);
    docsTipo.forEach(doc => { html += aggDocRigaHtml(tipo, doc); });
  });
  // Firma per il consenso privacy (raccolta col link del volontario, non caricabile da qui)
  docs.filter(d => d.tipo === 'FIRMA').forEach(d => { html += aggDocRigaHtml('FIRMA', d); });
  html += '<div class="agg-prop-sub">Attestati e abilitazioni</div>';
  const multipli = docs.filter(d => AGG_TIPI_DOC_MULTIPLI.includes(d.tipo));
  if (!multipli.length) html += '<div class="note">nessuno</div>';
  multipli.forEach(d => { html += aggDocRigaHtml(d.tipo, d); });

  html += '<div class="agg-row2">'
    + '<button class="btn-sm" onclick="aggApriUploadDoc(' + v.id + ',\'ATTESTATO\')">+ attestato</button>'
    + '<button class="btn-sm" onclick="aggApriUploadDoc(' + v.id + ',\'ABILITAZIONE\')">+ abilitazione</button>'
    + '</div>';
  html += '</div></div>';
  return html;
}

function aggDocRigaHtml(tipo, doc) {
  const label = AGG_DOC_LABEL[tipo] || tipo;
  if (!doc) {
    return '<div class="agg-doc-row"><div class="agg-doc-row-info"><div class="agg-doc-row-name">' + label + '</div>'
      + '<div class="agg-doc-row-meta">non caricato</div></div>'
      + '<button class="btn-sm btn-ok" onclick="aggApriUploadDoc(' + aggCorrente.volontario.id + ',\'' + tipo + '\')">+ carica</button></div>';
  }
  const scad = doc.scadenza ? (' — scade ' + new Date(doc.scadenza).toLocaleDateString('it-IT')) : '';
  const descr = doc.descrizione ? (doc.descrizione + ' — ') : '';
  return '<div class="agg-doc-row"><div class="agg-doc-row-info"><div class="agg-doc-row-name">' + (AGG_TIPI_DOC_MULTIPLI.includes(tipo) ? label : label) + '</div>'
    + '<div class="agg-doc-row-meta">' + descr + (doc.nome_file || '') + scad + '</div></div>'
    + '<button class="btn-sm" onclick="aggApriDocumento(' + doc.id + ')">apri</button>'
    + '<button class="btn-sm btn-danger" onclick="aggEliminaDocumento(' + doc.id + ')">✕</button></div>';
}

async function aggApriDocumento(id) {
  try {
    const data = await aggCall('doc_signed_url', { id });
    window.open(data.url, '_blank');
  } catch (e) { alert('Errore: ' + e.message); }
}

async function aggEliminaDocumento(id) {
  if (!confirm('Eliminare questo documento?')) return;
  try {
    await aggCall('doc_delete', { id });
    const data = await aggCall('get', { id: aggCorrente.volontario.id });
    aggCorrente = data;
    aggRenderScheda();
  } catch (e) { alert('Errore: ' + e.message); }
}

let aggDocUploadCtx = null; // { volontarioId, tipo }
function aggApriUploadDoc(volontarioId, tipo) {
  aggDocUploadCtx = { volontarioId, tipo, file: null };
  document.getElementById('aggDocOverlayTitle').textContent = 'Carica — ' + (AGG_DOC_LABEL[tipo] || tipo);
  document.getElementById('aggDocDescrizione').value = '';
  document.getElementById('aggDocScadenza').value = '';
  document.getElementById('aggDocFileInput').value = '';
  document.getElementById('aggDocFileLabel').textContent = 'PDF o JPG, max 10MB';
  document.getElementById('aggDocUploadErr').style.display = 'none';
  document.getElementById('aggDocOverlay').classList.add('open');
}
function aggChiudiUploadDoc() { document.getElementById('aggDocOverlay').classList.remove('open'); aggDocUploadCtx = null; }

function aggDocFileSelezionato(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    document.getElementById('aggDocUploadErr').textContent = 'File troppo grande (max 10MB).';
    document.getElementById('aggDocUploadErr').style.display = 'block';
    return;
  }
  aggDocUploadCtx.file = file;
  document.getElementById('aggDocFileLabel').textContent = '✓ ' + file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
}

async function aggEseguiUploadDoc() {
  const errEl = document.getElementById('aggDocUploadErr');
  errEl.style.display = 'none';
  if (!aggDocUploadCtx || !aggDocUploadCtx.file) { errEl.textContent = 'Seleziona un file.'; errEl.style.display = 'block'; return; }
  const btn = document.getElementById('aggDocUploadBtn');
  btn.disabled = true; btn.textContent = 'caricamento...';
  try {
    const file = aggDocUploadCtx.file;
    const base64 = await aggBlobToBase64(file);
    await aggCall('doc_upload', {
      volontario_id: aggDocUploadCtx.volontarioId,
      tipo: aggDocUploadCtx.tipo,
      descrizione: document.getElementById('aggDocDescrizione').value.trim() || null,
      scadenza: document.getElementById('aggDocScadenza').value || null,
      nome_file: file.name,
      content_type: file.type || 'application/octet-stream',
      file_base64: base64,
    });
    aggChiudiUploadDoc();
    const data = await aggCall('get', { id: aggCorrente.volontario.id });
    aggCorrente = data;
    aggRenderScheda();
  } catch (e) {
    errEl.textContent = 'Errore: ' + e.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'carica';
}

function aggBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// -- BLOCCO 4: DPI --
function aggBloccoDpi(v) {
  const catalogo = (aggCorrente.catalogo || []).filter(c => c.attivo !== false);
  const dpiRows  = aggCorrente.dpi || [];
  const suggerite = aggCorrente.categorie_suggerite || [];
  const categorie = Array.from(new Set(catalogo.map(c => c.categoria)));
  // Suggerite per prime, poi le altre
  categorie.sort((a, b) => (suggerite.includes(b) ? 1 : 0) - (suggerite.includes(a) ? 1 : 0));

  let html = '<div class="vol-section"><div class="vol-section-head" onclick="toggleVolSection(this)">DPI</div><div class="vol-section-body">';
  if (!categorie.length) html += '<div class="note">Nessun capo nel catalogo. Usa "Catalogo DPI" per aggiungerne.</div>';

  categorie.forEach(cat => {
    const capi = catalogo.filter(c => c.categoria === cat).sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
    html += '<div class="agg-dpi-cat"><div class="agg-dpi-cat-head">' + cat + (suggerite.includes(cat) ? ' (suggerita)' : '') + '</div>';
    capi.forEach(capo => {
      const riga = dpiRows.find(d => d.dpi_id === capo.id);
      const ha = !!riga;
      const taglie = AG_TAGLIE_SAFE(capo.tipo_taglia);
      html += '<div class="agg-dpi-row' + (ha ? '' : ' off') + '" id="aggDpiRow_' + capo.id + '">'
        + '<label><input type="checkbox" ' + (ha ? 'checked' : '') + ' onchange="aggDpiToggle(' + v.id + ',' + capo.id + ',this.checked)"> ' + capo.nome + '</label>'
        + (taglie.length
            ? '<select onchange="aggDpiCampo(' + v.id + ',' + capo.id + ',\'taglia\',this.value)"><option value="">taglia</option>' + taglie.map(t => '<option value="' + t + '"' + ((riga && riga.taglia === t) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>'
            : '<span></span>')
        + '<div class="agg-dpi-consegnato"><label><input type="checkbox" ' + ((riga && riga.consegnato) ? 'checked' : '') + ' onchange="aggDpiCampo(' + v.id + ',' + capo.id + ',\'consegnato\',this.checked)"> consegnato</label>'
        + '<input type="date" value="' + ((riga && riga.data_consegna) ? riga.data_consegna.slice(0, 10) : '') + '" onchange="aggDpiCampo(' + v.id + ',' + capo.id + ',\'data_consegna\',this.value)"></div>'
        + '</div>';
    });
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}
function AG_TAGLIE_SAFE(tipo) { return AGG_TAGLIE[tipo] || []; }

async function aggDpiToggle(volontarioId, dpiId, ha) {
  const row = document.getElementById('aggDpiRow_' + dpiId);
  if (row) row.classList.toggle('off', !ha);
  try {
    await aggCall('dpi_set', { volontario_id: volontarioId, dpi_id: dpiId, ha });
    const data = await aggCall('get', { id: volontarioId });
    aggCorrente = data;
    aggRenderScheda();
  } catch (e) { alert('Errore: ' + e.message); }
}

async function aggDpiCampo(volontarioId, dpiId, campo, valore) {
  const dpiRows = aggCorrente.dpi || [];
  const riga = dpiRows.find(d => d.dpi_id === dpiId);
  const payload = {
    volontario_id: volontarioId, dpi_id: dpiId, ha: true,
    taglia: riga ? riga.taglia : null, consegnato: riga ? riga.consegnato : false, data_consegna: riga ? riga.data_consegna : null,
  };
  payload[campo] = valore;
  try {
    await aggCall('dpi_set', payload);
    const data = await aggCall('get', { id: volontarioId });
    aggCorrente = data;
    // Non ri-renderizzo tutta la scheda per non perdere lo scroll sulla griglia DPI:
    // aggiorno solo i dati in cache, la UI è già coerente (checkbox/select già nello stato scelto).
  } catch (e) { alert('Errore: ' + e.message); }
}

// -- BLOCCO 5: VERIFICA --
function aggBloccoVerifica(v) {
  const fmtData = v.verificato_il ? new Date(v.verificato_il).toLocaleDateString('it-IT') : '—';
  return '<div class="vol-section"><div class="vol-section-head" onclick="toggleVolSection(this)">Verifica</div><div class="vol-section-body">'
    + '<div class="vol-form-field" style="margin-bottom:12px"><span class="vol-form-lbl">Stato verifica</span>'
    + '<select class="vol-form-inp" onchange="aggSetVerifica(' + v.id + ',this.value)">'
    + AGG_STATI_VERIFICA.map(s => '<option value="' + s + '"' + (v.stato_verifica === s ? ' selected' : '') + '>' + s.replace('_', ' ') + '</option>').join('')
    + '</select></div>'
    + '<div class="vol-field"><span class="vol-field-label">Verificato il</span><span class="vol-field-value">' + fmtData + '</span></div>'
    + '<div class="vol-field"><span class="vol-field-label">Verificato da</span><span class="vol-field-value">' + (v.verificato_da || '—') + '</span></div>'
    + '</div></div>';
}

async function aggSetVerifica(id, stato) {
  try {
    const data = await aggCall('set_verifica', { id, stato_verifica: stato });
    aggCorrente.volontario = data.volontario;
    aggRenderScheda();
  } catch (e) { alert('Errore: ' + e.message); }
}

// ============================================================
// EDITOR FOTO (ritaglio 98:118 → 196×236, JPG < 50KB)
// ============================================================
let aggCropImg = null;
let aggCropBaseScale = 1;
let aggCropZoom = 1;
let aggCropPanX = 0;
let aggCropPanY = 0;
let aggCropDragging = false;
let aggCropDragStart = null;
let aggCropVolontarioId = null;
let aggCropBlobPronto = null;
let aggCropRidotto = false;

function aggApriEditorFoto(volontarioId) {
  aggCropVolontarioId = volontarioId;
  aggCropImg = null; aggCropBlobPronto = null; aggCropRidotto = false;
  document.getElementById('aggFotoInput').value = '';
  document.getElementById('aggCropArea').style.display = 'none';
  document.getElementById('aggCropInfo').textContent = 'trascina per spostare, usa lo zoom per ingrandire';
  document.getElementById('aggCropInfo').className = 'agg-crop-info';
  document.getElementById('aggFotoOverlay').classList.add('open');
}
function aggChiudiEditorFoto() { document.getElementById('aggFotoOverlay').classList.remove('open'); }

function aggFotoFileSelezionato(input) {
  const file = input.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    aggCropImg = img;
    aggCropBaseScale = Math.max(196 / img.naturalWidth, 236 / img.naturalHeight);
    aggCropZoom = 1; aggCropPanX = 0; aggCropPanY = 0;
    document.getElementById('aggCropZoom').value = 100;
    document.getElementById('aggCropArea').style.display = 'block';
    aggFotoRidisegna();
    aggAttivaDragCrop();
  };
  img.onerror = () => alert('Immagine non leggibile.');
  img.src = URL.createObjectURL(file);
}

function aggFotoZoomCambiato(v) { aggCropZoom = Number(v) / 100; aggFotoRidisegna(); }

function aggFotoRidisegna() {
  const canvas = document.getElementById('aggCropCanvas');
  if (!canvas || !aggCropImg) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 196, 236);
  const scale = aggCropBaseScale * aggCropZoom;
  const w = aggCropImg.naturalWidth * scale, h = aggCropImg.naturalHeight * scale;
  // Clamp pan: i bordi dell'immagine scalata non devono mai entrare dentro il riquadro.
  const maxPanX = Math.max(0, (w - 196) / 2), maxPanY = Math.max(0, (h - 236) / 2);
  aggCropPanX = Math.max(-maxPanX, Math.min(maxPanX, aggCropPanX));
  aggCropPanY = Math.max(-maxPanY, Math.min(maxPanY, aggCropPanY));
  const x = 196 / 2 - w / 2 + aggCropPanX;
  const y = 236 / 2 - h / 2 + aggCropPanY;
  ctx.drawImage(aggCropImg, x, y, w, h);
}

function aggAttivaDragCrop() {
  const canvas = document.getElementById('aggCropCanvas');
  if (canvas._aggBound) return;
  canvas._aggBound = true;
  canvas.addEventListener('pointerdown', e => {
    aggCropDragging = true;
    aggCropDragStart = { x: e.clientX, y: e.clientY, panX: aggCropPanX, panY: aggCropPanY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (!aggCropDragging) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = 196 / rect.width;
    aggCropPanX = aggCropDragStart.panX + (e.clientX - aggCropDragStart.x) * ratio;
    aggCropPanY = aggCropDragStart.panY + (e.clientY - aggCropDragStart.y) * ratio;
    aggFotoRidisegna();
  });
  const fine = () => { aggCropDragging = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', fine);
  canvas.addEventListener('pointercancel', fine);
}

async function aggEsportaJPEG(canvas, maxBytes) {
  let q = 0.92;
  while (q >= 0.4) {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size < maxBytes) return blob;
    q -= 0.08;
  }
  return null;
}

async function aggFotoConferma() {
  const info = document.getElementById('aggCropInfo');
  info.className = 'agg-crop-info';
  info.textContent = 'elaborazione...';
  const canvas = document.getElementById('aggCropCanvas');
  let blob = await aggEsportaJPEG(canvas, 50 * 1024);
  aggCropRidotto = false;
  if (!blob) {
    // Fallback 98x118 (metà risoluzione) come da SPEC
    const small = document.createElement('canvas');
    small.width = 98; small.height = 118;
    small.getContext('2d').drawImage(canvas, 0, 0, 98, 118);
    blob = await aggEsportaJPEG(small, 50 * 1024);
    aggCropRidotto = true;
  }
  if (!blob) {
    info.className = 'agg-crop-info err';
    info.textContent = 'Impossibile scendere sotto i 50 KB, riprova con un\'immagine più semplice.';
    return;
  }
  aggCropBlobPronto = blob;
  const dim = aggCropRidotto ? '98×118' : '196×236';
  info.className = 'agg-crop-info ok';
  info.innerHTML = '✓ pronta — ' + dim + ', ' + (blob.size / 1024).toFixed(1) + ' KB'
    + '<button class="btn pri full agg-mt" onclick="aggFotoSalva()">salva foto</button>';
}

async function aggFotoSalva() {
  if (!aggCropBlobPronto || !aggCropVolontarioId) return;
  try {
    const base64 = await aggBlobToBase64(aggCropBlobPronto);
    await aggCall('doc_upload', {
      volontario_id: aggCropVolontarioId, tipo: 'FOTO',
      content_type: 'image/jpeg', file_base64: base64,
    });
    aggChiudiEditorFoto();
    const data = await aggCall('get', { id: aggCropVolontarioId });
    aggCorrente = data;
    aggRenderScheda();
  } catch (e) { alert('Errore salvataggio foto: ' + e.message); }
}

// ============================================================
// CATALOGO DPI
// ============================================================
async function aggApriCatalogo() {
  document.getElementById('aggCatalogoOverlay').classList.add('open');
  const list = document.getElementById('aggCatalogoList');
  list.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  try {
    const data = await aggCall('dpi_catalogo_list', {});
    aggCatalogoCache = data.catalogo || [];
    aggRenderCatalogo();
  } catch (e) { list.innerHTML = '<div class="loading-msg bad">Errore: ' + e.message + '</div>'; }
}
function aggChiudiCatalogo() { document.getElementById('aggCatalogoOverlay').classList.remove('open'); }

function aggRenderCatalogo() {
  const list = document.getElementById('aggCatalogoList');
  const datalist = document.getElementById('aggCatCategorieList');
  if (!list) return;
  const categorie = Array.from(new Set(aggCatalogoCache.map(c => c.categoria))).sort();
  if (datalist) datalist.innerHTML = categorie.map(c => '<option value="' + c + '">').join('');
  if (!aggCatalogoCache.length) { list.innerHTML = '<div class="loading-msg">nessun capo nel catalogo.</div>'; return; }
  let html = '';
  categorie.forEach(cat => {
    html += '<div class="agg-cat-head">' + cat + '</div>';
    aggCatalogoCache.filter(c => c.categoria === cat).sort((a, b) => (a.ordine || 0) - (b.ordine || 0)).forEach(c => {
      html += '<div class="agg-cat-list-row' + (c.attivo === false ? ' inattivo' : '') + '">'
        + '<div style="flex:1">' + c.nome + ' <span class="sub" style="display:inline">(' + c.tipo_taglia + ')</span></div>'
        + '<button class="btn-sm" onclick="aggCatalogoToggleAttivo(' + c.id + ')">' + (c.attivo === false ? 'riattiva' : 'disattiva') + '</button>'
        + '</div>';
    });
  });
  list.innerHTML = html;
}

async function aggCatalogoToggleAttivo(id) {
  const capo = aggCatalogoCache.find(c => c.id === id);
  if (!capo) return;
  try {
    await aggCall('dpi_catalogo_upsert', { id, categoria: capo.categoria, nome: capo.nome, tipo_taglia: capo.tipo_taglia, ordine: capo.ordine, attivo: capo.attivo === false });
    await aggApriCatalogo();
  } catch (e) { alert('Errore: ' + e.message); }
}

async function aggCatalogoSalva() {
  const categoria = document.getElementById('aggCatNuovaCategoria').value.trim().toUpperCase();
  const nome = document.getElementById('aggCatNuovoNome').value.trim();
  const tipo_taglia = document.getElementById('aggCatNuovoTipoTaglia').value;
  const ordine = Number(document.getElementById('aggCatNuovoOrdine').value) || 0;
  if (!categoria || !nome) { alert('Categoria e nome sono obbligatori.'); return; }
  try {
    await aggCall('dpi_catalogo_upsert', { categoria, nome, tipo_taglia, ordine, attivo: true });
    document.getElementById('aggCatNuovaCategoria').value = '';
    document.getElementById('aggCatNuovoNome').value = '';
    document.getElementById('aggCatNuovoOrdine').value = '0';
    await aggApriCatalogo();
  } catch (e) { alert('Errore: ' + e.message); }
}
