// ============================================================
// ELENCHI — Amministrazione, permesso "elenchi". Prefisso funzioni: el*
// ============================================================
// Si sceglie l'argomento (volontari, mezzi, dotazioni), si aggiungono i filtri (valgono tutti
// insieme) e le colonne; il risultato si scarica in Excel, PDF o stampa, e per i volontari si
// copiano mail e telefoni. Gli elenchi si salvano con un nome in elenchi_salvati (solo la
// definizione, mai i dati) e si riaprono sempre con i dati del momento.
// - Ogni fonte si legge con l'accesso di chi usa la pagina: quello che non può vedere
//   (es. registro formazione, interventi) non compare tra filtri e colonne.
// - Telegram collegato e taglie DPI arrivano da elenchi_extra() (supabase/elenchi.sql);
//   le taglie solo con il permesso aggiornamento_dati.
// - Stato dei corsi obbligatori: stessa regola della dashboard di Formazione (fzDashStato).
// - Ore interventi: stessa regola di Statistiche (interventi SVOLTI, ore divise tra i presenti),
//   arrotondate all'intero.
// ============================================================

const EL_ARGOMENTI = [['volontari', 'Volontari'], ['mezzi', 'Mezzi'], ['dotazioni', 'Dotazioni']];
const EL_TIPO_OPS = {
  testo:  [['contiene', 'contiene'], ['uguale', 'è uguale a'], ['vuoto', 'è vuoto'], ['pieno', 'non è vuoto']],
  scelta: [['uno', 'è uno di'], ['nessuno', 'non è nessuno di']],
  si:     [['si', 'sì'], ['no', 'no']],
  data:   [['scaduta', 'scaduta'], ['scadenza', 'in scadenza (60 giorni)'], ['scaduta_scadenza', 'scaduta o in scadenza'],
           ['valida', 'non scaduta'], ['prima', 'prima del'], ['dopo', 'dopo il'], ['tra', 'tra'], ['vuota', 'non indicata'], ['presente', 'indicata']],
  numero: [['mag', 'almeno'], ['min', 'al massimo'], ['ug', 'uguale a'], ['tra', 'tra']],
  corso:  [['uno', 'è uno di'], ['nessuno', 'non è nessuno di']],
  voce:   [['valido', 'ce l\'ha valido'], ['qualsiasi', 'ce l\'ha (anche scaduto)'], ['scaduto', 'ce l\'ha scaduto'], ['nessuno', 'non ce l\'ha']],
};
const EL_CORSO_STATI = [['ok', 'In regola'], ['scadenza', 'In scadenza'], ['scaduto', 'Scaduto'], ['senza', 'Senza attestato'],
  ['mai', 'Mai fatto'], ['esonero', 'Esonerato'], ['nonrichiesto', 'Non richiesto']];
const EL_CORSI = [
  { codice: '4_ORE',  titolo: 'Corso 4 ore',       k: 'c4' },
  { codice: '12_ORE', titolo: 'Corso 12 ore',      k: 'c12', esonero: 'esonero_12_ore' },
  { codice: 'CAPOSQ', titolo: 'Corso Caposquadra', k: 'ccs', esonero: 'esonero_caposq', soloCapi: true },
];
const EL_COLONNE_BASE = {
  volontari: ['cognome', 'nome', 'squadra', 'telefono', 'email'],
  mezzi: ['automezzo', 'targa', 'revisione', 'assicurazione', 'stato'],
  dotazioni: ['articolo', 'magazzino', 'categoria', 'quantita', 'ubicazione'],
};
const EL_VUOTO = '(vuoto)';

let EL = null;            // stato della pagina (null = da inizializzare)
let elTimer = null;

// ============================================================
// AGGANCIO ALL'APP (come verifica-piattaforme.js)
// ============================================================
function elHaAccesso() { return !!currentUser && currentUser.tipo_accesso !== 'volontario' && hasPerm('elenchi'); }
(function () {
  const _avvia = window.avviaDashboard;
  window.avviaDashboard = function () {
    _avvia.apply(this, arguments);
    const si = document.getElementById('siElenchi');
    if (si) si.style.display = elHaAccesso() ? 'flex' : 'none';
  };
  const _logout = window.logout;
  window.logout = function () {
    _logout.apply(this, arguments);
    const si = document.getElementById('siElenchi'); if (si) si.style.display = 'none';
    EL = null;                                                      // niente dati del precedente utente in memoria
    const r = document.getElementById('elRoot'); if (r) r.innerHTML = '';
  };
  const _show = window.showPanel;
  window.showPanel = function (name) { _show.apply(this, arguments); if (name === 'elenchi') caricaElenchi(); };
})();

function elStatoVuoto() {
  const anno = new Date().getFullYear();
  return {
    arg: 'volontari', filtri: [], colonne: [], ordine: null,
    periodo: { dal: anno + '-01-01', al: elOggiIso() },
    id: null, nome: '',
    dati: {}, fonti: {}, salvati: [], salvatiOk: true, caricamento: {},
  };
}

async function caricaElenchi() {
  const root = document.getElementById('elRoot');
  if (!root) return;
  if (!elHaAccesso()) { root.innerHTML = '<div class="loading-msg">Non hai il permesso per accedere a questa pagina.</div>'; return; }
  if (EL) { elRender(); elCaricaSalvati(); return; }               // si torna sulla pagina: resta tutto com'era
  EL = elStatoVuoto();
  elNuovo('volontari', true);
  root.innerHTML = '<div class="loading-msg">Caricamento…</div>';
  await Promise.all([elCaricaArgomento('volontari'), elCaricaSalvati()]);
  elRender();
}

// ============================================================
// UTILITÀ
// ============================================================
function elOggiIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function elData(iso) { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
function elNorm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
function elGiorni(iso) { const oggi = new Date(); oggi.setHours(0, 0, 0, 0); return (new Date(String(iso).slice(0, 10) + 'T00:00:00') - oggi) / 86400000; }
function elGiorniAvviso() { return typeof ARC_GIORNI_AVVISO === 'number' ? ARC_GIORNI_AVVISO : 60; }
function elEsc(s) { return aggEsc(s); }

// Legge tutte le righe a blocchi da 1000 (limite di PostgREST)
async function elLeggiTutto(url) {
  const tutte = [];
  for (let da = 0; ; da += 1000) {
    const res = await sbFetch(url, { headers: Object.assign({}, H, { 'Range-Unit': 'items', 'Range': da + '-' + (da + 999) }) });
    sbOk(res);
    const righe = await res.json();
    tutte.push(...righe);
    if (righe.length < 1000) return tutte;
  }
}

// ============================================================
// CARICAMENTO DATI
// ============================================================
async function elCaricaArgomento(arg) {
  if (EL.dati[arg] || EL.caricamento[arg]) return EL.caricamento[arg];
  const prom = (async () => {
    const R = SUPA_URL + '/rest/v1/';
    const prova = async (fonte, fn) => { try { const x = await fn(); EL.fonti[fonte] = true; return x; } catch (e) { EL.fonti[fonte] = false; return null; } };
    if (arg === 'volontari') {
      const [vol, reg, cat, int, extra] = await Promise.all([
        prova('volontari', () => elLeggiTutto(R + 'volontari?select=*&order=cognome,nome')),
        prova('formazione', () => elLeggiTutto(R + 'formazione_registro?select=id,volontario_id,tipo,codice,titolo,data_corso,scadenza,drive_file_id,catalogo_id')),
        prova('catalogo', () => elLeggiTutto(R + 'formazione_catalogo?select=id,tipo,codice,titolo,attivo,unita_in&order=ordine')),
        prova('interventi', () => elLeggiTutto(R + 'interventi_con_stato?select=id,data,n_ore,n_volontari,volontari_ids&stato_calcolato=eq.SVOLTO')),
        prova('extra', async () => {
          const res = await sbFetch(R + 'rpc/elenchi_extra', { method: 'POST', headers: HJ, body: '{}', silenzioso: true });
          sbOk(res);
          return res.json();
        }),
      ]);
      EL.fonti.telegram = !!(extra && extra.telegram);
      EL.fonti.taglie = !!(extra && extra.taglie);
      if (!cat) EL.fonti.formazione = false;
      EL.dati.volontari = { righe: vol || [], reg: reg || [], cat: cat || [], int: int || [], extra: extra || {} };
      elPreparaVolontari();
    } else if (arg === 'mezzi') {
      const m = await prova('mezzi', () => elLeggiTutto(R + 'mezzi?select=*&order=automezzo'));
      EL.dati.mezzi = { righe: m || [] };
    } else if (arg === 'dotazioni') {
      const [d, cat, mag] = await Promise.all([
        prova('dotazioni', () => elLeggiTutto(R + 'dotazioni?select=*&order=articolo')),
        prova('dotCategorie', () => elLeggiTutto(R + 'dotazioni_categorie?select=*&order=ordine')),
        prova('dotMagazzini', () => elLeggiTutto(R + 'dotazioni_magazzini?select=*&order=ordine')),
      ]);
      EL.dati.dotazioni = { righe: d || [], cat: cat || [], mag: mag || [] };
      elPreparaDotazioni();
    }
    delete EL.caricamento[arg];
  })();
  EL.caricamento[arg] = prom;
  return prom;
}

// Indici per volontario: registro formazione, Telegram, taglie
function elPreparaVolontari() {
  const D = EL.dati.volontari;
  D.regPer = new Map();
  D.reg.forEach(r => { if (!D.regPer.has(r.volontario_id)) D.regPer.set(r.volontario_id, []); D.regPer.get(r.volontario_id).push(r); });
  D.catPer = new Map(D.cat.map(c => [c.id, c]));
  D.tg = new Set((D.extra.telegram || []).map(Number));
  D.taglie = new Map();
  D.capi = [];
  (D.extra.taglie || []).forEach(t => {
    if (!D.taglie.has(t.v)) D.taglie.set(t.v, {});
    D.taglie.get(t.v)[t.capo] = t.taglia || '';
    if (!D.capi.includes(t.capo)) D.capi.push(t.capo);
  });
  D.capi.sort((a, b) => a.localeCompare(b, 'it'));
  elCalcolaInterventi();
}

// Ore e numero di interventi nel periodo scelto (regola di Statistiche)
function elCalcolaInterventi() {
  const D = EL.dati.volontari;
  if (!D) return;
  const dal = EL.periodo.dal || '0000-01-01', al = EL.periodo.al || '9999-12-31';
  D.intPer = new Map();
  D.int.forEach(i => {
    if (!i.data || i.data < dal || i.data > al) return;
    const ids = i.volontari_ids || [];
    const nVol = ids.length || i.n_volontari || 1;
    const oreInd = parseFloat(i.n_ore || 0) / nVol;
    ids.forEach(vid => {
      const k = Number(vid);
      const s = D.intPer.get(k) || { n: 0, ore: 0 };
      s.n += 1; s.ore += oreInd;
      D.intPer.set(k, s);
    });
  });
}

function elPreparaDotazioni() {
  const D = EL.dati.dotazioni;
  const byId = new Map(D.cat.map(c => [c.id, c]));
  D.percorso = id => {
    const parti = [];
    let c = byId.get(id), giri = 0;
    while (c && giri++ < 10) { parti.unshift(c.nome); c = byId.get(c.parent_id); }
    return parti.join(' › ');
  };
}

// Stato di un corso obbligatorio (stessa regola di fzDashStato in formazione.js)
function elStatoCorso(v, corso) {
  const D = EL.dati.volontari;
  const righe = (D.regPer.get(v.id) || []).filter(r => r.codice === corso.codice);
  const ord = r => (r.data_corso || '') + '|' + (r.scadenza || '');
  let st;
  if (!righe.length) st = 'mai';
  else {
    const ultima = righe.reduce((m, r) => ord(r) > ord(m) ? r : m);
    st = ultima.scadenza ? (elGiorni(ultima.scadenza) < 0 ? 'scaduto' : elGiorni(ultima.scadenza) <= elGiorniAvviso() ? 'scadenza' : '') : '';
    if (!st) st = righe.some(r => r.drive_file_id) ? 'ok' : 'senza';
  }
  if (corso.esonero && v[corso.esonero] && st !== 'ok') return 'esonero';
  if (corso.soloCapi && st === 'mai' && !elECapo(v)) return 'nonrichiesto';
  return st;
}
function elECapo(v) { return String(v.tipo_volontario || '').toUpperCase().replace(/\s+/g, '') === 'CAPOSQUADRA'; }
function elScadenzaCorso(v, codice) {
  const righe = (EL.dati.volontari.regPer.get(v.id) || []).filter(r => r.codice === codice && r.scadenza);
  return righe.length ? righe.map(r => r.scadenza).sort().pop() : '';
}
// Voci del registro (corsi e abilitazioni) di un volontario: catalogo_id → scadenza più lontana ('' = senza scadenza)
function elVociVolontario(v) {
  const D = EL.dati.volontari;
  const m = new Map();
  (D.regPer.get(v.id) || []).forEach(r => {
    if (!r.catalogo_id) return;
    let id = r.catalogo_id, c = D.catPer.get(id), giri = 0;
    while (c && c.unita_in && giri++ < 5) { id = c.unita_in; c = D.catPer.get(id); }
    const prima = m.get(id);
    const sc = r.scadenza || '';
    if (prima === undefined) m.set(id, sc);
    else if (prima !== '' && (sc === '' || sc > prima)) m.set(id, sc);
  });
  return m;
}
function elVoceValida(sc) { return sc === '' || elGiorni(sc) >= 0; }

// ============================================================
// CAMPI (filtri e colonne) PER ARGOMENTO
// ============================================================
// t = tipo; g = gruppo; fonte = dato richiesto; f:false = solo colonna; c:false = solo filtro
function elCampi(arg) {
  if (arg === 'volontari') return elCampiVolontari();
  if (arg === 'mezzi') return [
    { k: 'automezzo', l: 'Automezzo', t: 'testo' }, { k: 'targa', l: 'Targa', t: 'testo' },
    { k: 'marca', l: 'Marca', t: 'scelta' }, { k: 'modello', l: 'Modello', t: 'testo' },
    { k: 'stato', l: 'Stato', t: 'scelta' },
    { k: 'immatricolazione', l: 'Immatricolazione', t: 'data' },
    { k: 'revisione', l: 'Revisione', t: 'data' }, { k: 'assicurazione', l: 'Assicurazione', t: 'data' },
    { k: 'note', l: 'Note', t: 'testo' },
  ];
  const D = EL.dati.dotazioni;
  return [
    { k: 'codice', l: 'Codice', t: 'testo' }, { k: 'articolo', l: 'Articolo', t: 'testo' },
    { k: 'descrizione', l: 'Descrizione', t: 'testo' },
    { k: 'magazzino', l: 'Magazzino', t: 'scelta' },
    { k: 'categoria', l: 'Categoria', t: 'scelta', get: r => D ? D.percorso(r.categoria_id) : '' },
    { k: 'ubicazione', l: 'Ubicazione', t: 'testo' },
    { k: 'quantita', l: 'Quantità', t: 'numero', get: r => r.quantita == null ? null : Number(r.quantita) },
    { k: 'unita_misura', l: 'Unità di misura', t: 'scelta' },
    { k: 'note', l: 'Note', t: 'testo' },
  ];
}

function elCampiVolontari() {
  const D = EL.dati.volontari;
  const F = EL.fonti;
  const c = [
    { k: 'cognome', l: 'Cognome', t: 'testo', g: 'Anagrafica' },
    { k: 'nome', l: 'Nome', t: 'testo', g: 'Anagrafica' },
    { k: 'nominativo', l: 'Cognome e nome', t: 'testo', g: 'Anagrafica', get: v => ((v.cognome || '') + ' ' + (v.nome || '')).trim() },
    { k: 'codice_fiscale', l: 'Codice fiscale', t: 'testo', g: 'Anagrafica' },
    { k: 'data_nascita', l: 'Data di nascita', t: 'data', g: 'Anagrafica' },
    { k: 'eta', l: 'Età', t: 'numero', g: 'Anagrafica', get: v => {
      if (!v.data_nascita) return null;
      const n = new Date(v.data_nascita + 'T00:00:00'), o = new Date();
      return o.getFullYear() - n.getFullYear() - ((o.getMonth() < n.getMonth() || (o.getMonth() === n.getMonth() && o.getDate() < n.getDate())) ? 1 : 0);
    } },
    { k: 'luogo_nascita', l: 'Luogo di nascita', t: 'testo', g: 'Anagrafica' },
    { k: 'indirizzo', l: 'Indirizzo', t: 'testo', g: 'Anagrafica' },
    { k: 'cap', l: 'CAP', t: 'testo', g: 'Anagrafica' },
    { k: 'citta', l: 'Città', t: 'scelta', g: 'Anagrafica' },
    { k: 'professione', l: 'Professione', t: 'testo', g: 'Anagrafica' },
    { k: 'patenti', l: 'Patenti', t: 'testo', g: 'Anagrafica' },
    { k: 'telefono', l: 'Telefono', t: 'testo', g: 'Contatti' },
    { k: 'email', l: 'Email', t: 'testo', g: 'Contatti' },
    { k: 'stato', l: 'Stato', t: 'scelta', g: 'Unità', get: v => v.stato || 'ATTIVO' },
    { k: 'squadra', l: 'Squadra', t: 'scelta', g: 'Unità' },
    { k: 'tipo_volontario', l: 'Tipo', t: 'scelta', g: 'Unità' },
    { k: 'mansione', l: 'Mansione', t: 'scelta', g: 'Unità' },
    { k: 'specializzazione', l: 'Specializzazione', t: 'scelta', g: 'Unità' },
    { k: 'gruppo_alpini', l: 'Gruppo Alpini', t: 'scelta', g: 'Unità' },
    { k: 'pronto_impiego', l: 'Pronto impiego', t: 'si', g: 'Unità' },
    { k: 'datore_lavoro', l: 'Datore di lavoro', t: 'testo', g: 'Datore di lavoro' },
    { k: 'citta_lavoro', l: 'Città ditta', t: 'scelta', g: 'Datore di lavoro' },
    { k: 'comm_unita', l: 'Commissione di Unità', t: 'si', g: 'Amministrativo' },
    { k: 'tutela_legale_cap', l: 'Tutela legale CAP', t: 'si', g: 'Amministrativo' },
    { k: 'cod_emercom', l: 'ID EMERCOM', t: 'testo', g: 'Amministrativo' },
    { k: 'stato_visita', l: 'Visita: stato', t: 'scelta', g: 'Visita medica', get: v => {
      const k = (v.stato_visita || '').replace(' ', '_');
      return k && typeof VISITA_STATI !== 'undefined' && VISITA_STATI[k] ? VISITA_STATI[k].label : (v.stato_visita || '');
    } },
    { k: 'esito_visita', l: 'Visita: esito', t: 'scelta', g: 'Visita medica' },
    { k: 'data_visita', l: 'Visita: data', t: 'data', g: 'Visita medica' },
    { k: 'scadenza_visita', l: 'Visita: scadenza', t: 'data', g: 'Visita medica' },
    { k: 'radio_ana', l: 'Corso Radio ANA', t: 'si', g: 'Formazione' },
    { k: 'emercom', l: 'EMERCOM', t: 'si', g: 'Formazione' },
    { k: 'dae', l: 'DAE', t: 'si', g: 'Formazione' },
    { k: 'scad_dae', l: 'DAE: scadenza', t: 'data', g: 'Formazione' },
  ];
  if (F.formazione) {
    EL_CORSI.forEach(cr => {
      c.push({ k: cr.k, l: cr.titolo, t: 'corso', g: 'Formazione', get: v => elStatoCorso(v, cr),
        txt: v => { const s = elStatoCorso(v, cr); return (EL_CORSO_STATI.find(x => x[0] === s) || ['', s])[1]; } });
      c.push({ k: cr.k + '_scad', l: cr.titolo + ': scadenza', t: 'data', g: 'Formazione', get: v => elScadenzaCorso(v, cr.codice) });
    });
    c.push({ k: 'voce', l: 'Corso o abilitazione', t: 'voce', g: 'Formazione', c: false });
    c.push({ k: 'voci_valide', l: 'Corsi e abilitazioni validi', t: 'testo', g: 'Formazione', f: false, get: v => {
      const out = [];
      elVociVolontario(v).forEach((sc, id) => { const cat = D.catPer.get(id); if (cat && cat.codice !== 'DA_VERIFICARE' && elVoceValida(sc)) out.push(cat.titolo); });
      return out.sort((a, b) => a.localeCompare(b, 'it')).join(', ');
    } });
  }
  if (F.interventi) {
    c.push({ k: 'int_n', l: 'Interventi nel periodo', t: 'numero', g: 'Interventi', get: v => (D.intPer.get(v.id) || { n: 0 }).n });
    c.push({ k: 'int_ore', l: 'Ore interventi nel periodo', t: 'numero', g: 'Interventi', get: v => Math.round((D.intPer.get(v.id) || { ore: 0 }).ore) });
  }
  if (F.telegram) c.push({ k: 'telegram', l: 'Collegato a Telegram', t: 'si', g: 'Telegram', get: v => D.tg.has(Number(v.id)) });
  if (F.taglie) D.capi.forEach((capo, i) => {
    c.push({ k: 'taglia_' + i, capo, l: 'Taglia: ' + capo, t: 'scelta', g: 'Taglie DPI', get: v => (D.taglie.get(v.id) || {})[capo] || '' });
  });
  return c;
}

function elCampo(k) { return elCampi(EL.arg).find(c => c.k === k) || null; }
function elValore(campo, r) { return campo.get ? campo.get(r) : r[campo.k]; }
function elTesto(campo, r) {
  if (campo.txt) return campo.txt(r);
  const v = elValore(campo, r);
  if (v == null || v === '') return '';
  if (campo.t === 'si') return v ? 'Sì' : 'No';
  if (campo.t === 'data') return elData(v);
  return String(v);
}
function elRigheArg() { const D = EL.dati[EL.arg]; return D ? D.righe : []; }
function elScelte(campo) {
  if (campo.t === 'corso') return EL_CORSO_STATI.map(s => [s[0], s[1]]);
  const set = new Set();
  elRigheArg().forEach(r => { const v = elValore(campo, r); set.add(v == null || v === '' ? '' : String(v)); });
  return [...set].sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'it')).map(v => [v, v === '' ? EL_VUOTO : v]);
}

// ============================================================
// FILTRI
// ============================================================
function elPassa(f, r) {
  if (f.c === 'voce') return elPassaVoce(f, r);
  const campo = elCampo(f.c);
  if (!campo) return true;                                         // campo non più disponibile: ignorato
  const val = elValore(campo, r);
  const vv = f.v;
  switch (campo.t) {
    case 'testo': {
      const s = elNorm(val);
      if (f.o === 'vuoto') return !s;
      if (f.o === 'pieno') return !!s;
      if (!elNorm(vv)) return true;
      return f.o === 'uguale' ? s === elNorm(vv) : s.includes(elNorm(vv));
    }
    case 'scelta': case 'corso': {
      const lista = Array.isArray(vv) ? vv : [];
      if (!lista.length) return true;
      const dentro = lista.includes(val == null ? '' : String(val));
      return f.o === 'nessuno' ? !dentro : dentro;
    }
    case 'si': return f.o === 'no' ? !val : !!val;
    case 'data': {
      const d = val ? String(val).slice(0, 10) : '';
      if (f.o === 'vuota') return !d;
      if (f.o === 'presente') return !!d;
      if (!d) return false;
      const g = elGiorni(d), avv = elGiorniAvviso();
      if (f.o === 'scaduta') return g < 0;
      if (f.o === 'scadenza') return g >= 0 && g <= avv;
      if (f.o === 'scaduta_scadenza') return g <= avv;
      if (f.o === 'valida') return g >= 0;
      if (f.o === 'prima') return !vv || d < vv;
      if (f.o === 'dopo') return !vv || d > vv;
      if (f.o === 'tra') return (!vv || d >= vv) && (!f.v2 || d <= f.v2);
      return true;
    }
    case 'numero': {
      const n = val == null || val === '' ? null : Number(val);
      const a = vv === '' || vv == null ? null : Number(vv), b = f.v2 === '' || f.v2 == null ? null : Number(f.v2);
      if (f.o === 'tra') { if (a == null && b == null) return true; if (n == null) return false; return (a == null || n >= a) && (b == null || n <= b); }
      if (a == null) return true;
      if (n == null) return false;
      return f.o === 'mag' ? n >= a : f.o === 'min' ? n <= a : n === a;
    }
  }
  return true;
}
function elPassaVoce(f, v) {
  if (!f.v || !EL.dati.volontari) return true;
  const sc = elVociVolontario(v).get(Number(f.v));
  if (f.o === 'nessuno') return sc === undefined;
  if (sc === undefined) return false;
  if (f.o === 'valido') return elVoceValida(sc);
  if (f.o === 'scaduto') return !elVoceValida(sc);
  return true;
}

function elRisultato() {
  const righe = elRigheArg().filter(r => EL.filtri.every(f => elPassa(f, r)));
  const ord = EL.ordine && elCampo(EL.ordine.k) ? EL.ordine : (EL.colonne[0] ? { k: EL.colonne[0], d: false } : null);
  if (ord) {
    const campo = elCampo(ord.k);
    const chiave = r => { const v = elValore(campo, r); return v == null ? '' : v; };
    righe.sort((a, b) => {
      const x = chiave(a), y = chiave(b);
      let c;
      if (x === '' && y !== '') c = 1; else if (y === '' && x !== '') c = -1;
      else if (typeof x === 'number' && typeof y === 'number') c = x - y;
      else if (typeof x === 'boolean' || typeof y === 'boolean') c = (y ? 1 : 0) - (x ? 1 : 0);
      else c = String(x).localeCompare(String(y), 'it', { numeric: true });
      return ord.d ? -c : c;
    });
  }
  return righe;
}

// Descrizione dei filtri in parole (per PDF ed Excel)
function elDescriviFiltri() {
  const parti = EL.filtri.map(f => {
    if (f.c === 'voce') {
      const cat = EL.dati.volontari && EL.dati.volontari.catPer.get(Number(f.v));
      return cat ? cat.titolo + ': ' + (EL_TIPO_OPS.voce.find(o => o[0] === f.o) || ['', ''])[1] : '';
    }
    const campo = elCampo(f.c);
    if (!campo) return '';
    const op = (EL_TIPO_OPS[campo.t].find(o => o[0] === f.o) || ['', ''])[1];
    let val = '';
    if (campo.t === 'scelta' || campo.t === 'corso') {
      const nomi = Object.fromEntries(elScelte(campo));
      val = (f.v || []).map(x => nomi[x] || (x === '' ? EL_VUOTO : x)).join(', ');
      if (!val) return '';
    } else if (campo.t === 'si') return campo.l + ': ' + op;
    else if (campo.t === 'data') val = f.o === 'tra' ? elData(f.v) + ' – ' + elData(f.v2) : ['prima', 'dopo'].includes(f.o) ? elData(f.v) : '';
    else if (campo.t === 'numero') val = f.o === 'tra' ? (f.v || '…') + ' – ' + (f.v2 || '…') : (f.v || '');
    else val = ['vuoto', 'pieno'].includes(f.o) ? '' : (f.v ? '"' + f.v + '"' : '');
    if (!val && !['vuoto', 'pieno', 'scaduta', 'scadenza', 'scaduta_scadenza', 'valida', 'vuota', 'presente'].includes(f.o)) return '';
    return campo.l + ' ' + op + (val ? ' ' + val : '');
  }).filter(Boolean);
  if (EL.arg === 'volontari' && elUsaPeriodo()) parti.push('Interventi dal ' + elData(EL.periodo.dal) + ' al ' + elData(EL.periodo.al));
  return parti.join(' · ');
}
function elUsaPeriodo() {
  return EL.arg === 'volontari' && (EL.filtri.some(f => f.c === 'int_n' || f.c === 'int_ore') || EL.colonne.some(k => k === 'int_n' || k === 'int_ore'));
}

// ============================================================
// AZIONI SULLA DEFINIZIONE
// ============================================================
function elNuovo(arg, silenzioso) {
  EL.arg = arg; EL.id = null; EL.nome = '';
  EL.filtri = arg === 'volontari' ? [{ c: 'stato', o: 'uno', v: ['ATTIVO'] }] : [];
  EL.colonne = EL_COLONNE_BASE[arg].slice();
  EL.ordine = null;
  if (!silenzioso) elRender();
}
async function elScegliArgomento(arg) {
  if (arg === EL.arg) return;
  elNuovo(arg, true);
  const p = elCaricaArgomento(arg);
  elRender();
  await p;
  elRender();
}
function elFiltroDefault(campo) {
  if (campo.k === 'voce') return { c: 'voce', o: 'valido', v: '' };
  const o = EL_TIPO_OPS[campo.t][0][0];
  return { c: campo.k, o, v: campo.t === 'scelta' || campo.t === 'corso' ? [] : '', v2: '' };
}
function elAggiungiFiltro() {
  const campi = elCampi(EL.arg).filter(c => c.f !== false);
  EL.filtri.push(elFiltroDefault(campi[0]));
  elRender();
}
function elTogliFiltro(i) { EL.filtri.splice(i, 1); elRender(); }
function elCambiaCampoFiltro(i, k) {
  const campo = elCampo(k);
  if (!campo) return;
  EL.filtri[i] = elFiltroDefault(campo);
  elRender();
}
function elCambiaOp(i, o) { EL.filtri[i].o = o; elRender(); }
function elCambiaValore(i, quale, val) {
  EL.filtri[i][quale] = val;
  clearTimeout(elTimer);
  elTimer = setTimeout(elRenderRisultati, 250);
}
function elCambiaValoreSubito(i, quale, val) { EL.filtri[i][quale] = val; elRender(); }
function elToggleScelta(i, valore) {
  const f = EL.filtri[i];
  if (!Array.isArray(f.v)) f.v = [];
  const p = f.v.indexOf(valore);
  if (p >= 0) f.v.splice(p, 1); else f.v.push(valore);
  elRender();
}
function elCambiaPeriodo(quale, val) {
  EL.periodo[quale] = val;
  elCalcolaInterventi();
  clearTimeout(elTimer);
  elTimer = setTimeout(elRenderRisultati, 250);
}
function elToggleColonna(k, si) {
  const p = EL.colonne.indexOf(k);
  if (si && p < 0) EL.colonne.push(k);
  if (!si && p >= 0) EL.colonne.splice(p, 1);
  elRender();
}
function elSpostaColonna(k, dir) {
  const p = EL.colonne.indexOf(k), q = p + dir;
  if (p < 0 || q < 0 || q >= EL.colonne.length) return;
  [EL.colonne[p], EL.colonne[q]] = [EL.colonne[q], EL.colonne[p]];
  elRender();
}
function elOrdina(k) {
  EL.ordine = EL.ordine && EL.ordine.k === k ? { k, d: !EL.ordine.d } : { k, d: false };
  elRenderRisultati();
}

// ============================================================
// ELENCHI SALVATI
// ============================================================
async function elCaricaSalvati() {
  try {
    const res = await sbFetch(SUPA_URL + '/rest/v1/elenchi_salvati?attivo=eq.true&select=id,nome,argomento,definizione,aggiornato_il&order=nome', { headers: H });
    sbOk(res);
    EL.salvati = await res.json();
    EL.salvatiOk = true;
  } catch (e) { EL.salvatiOk = false; EL.salvati = []; }
  if (document.getElementById('elSalvati')) elRenderSalvati();
}
async function elApriSalvato(id) {
  const s = EL.salvati.find(x => x.id === id);
  if (!s) return;
  const d = s.definizione || {};
  EL.arg = s.argomento; EL.id = s.id; EL.nome = s.nome;
  EL.filtri = JSON.parse(JSON.stringify(d.filtri || []));
  EL.colonne = (d.colonne || EL_COLONNE_BASE[s.argomento]).slice();
  EL.ordine = d.ordine || null;
  if (d.periodo && d.periodo.anno) {
    // periodo "anno in corso": si ricalcola sempre sull'anno attuale
    const anno = new Date().getFullYear();
    EL.periodo = { dal: anno + '-01-01', al: elOggiIso() };
  } else if (d.periodo) EL.periodo = { dal: d.periodo.dal || '', al: d.periodo.al || '' };
  const p = elCaricaArgomento(EL.arg);
  elRender();
  await p;
  if (EL.arg === 'volontari' && EL.dati.volontari) elCalcolaInterventi();
  elRender();
}
function elDefinizione() {
  const anno = new Date().getFullYear();
  const annoInCorso = EL.periodo.dal === anno + '-01-01' && EL.periodo.al === elOggiIso();
  return { filtri: EL.filtri, colonne: EL.colonne, ordine: EL.ordine, periodo: annoInCorso ? { anno: true } : EL.periodo };
}
async function elSalva(comeNuovo) {
  const nome = (prompt('Nome dell\'elenco:', comeNuovo ? '' : EL.nome) || '').trim();
  if (!nome) return;
  const corpo = { nome, argomento: EL.arg, definizione: elDefinizione(), aggiornato_il: new Date().toISOString() };
  const nuovo = comeNuovo || !EL.id;
  if (nuovo) corpo.creato_da = currentUser && currentUser.volontario_id || null;
  const res = await sbFetch(SUPA_URL + '/rest/v1/elenchi_salvati' + (nuovo ? '' : '?id=eq.' + EL.id), {
    method: nuovo ? 'POST' : 'PATCH',
    headers: Object.assign({}, HJ, { 'Prefer': 'return=representation' }),
    body: JSON.stringify(corpo),
  });
  let righe = [];
  try { righe = await res.json(); } catch (e) {}
  if (!res.ok || !Array.isArray(righe) || !righe.length) {
    alert('Salvataggio non riuscito.' + (res.status === 404 ? ' Va prima eseguito supabase/elenchi.sql.' : ''));
    return;
  }
  EL.id = righe[0].id; EL.nome = righe[0].nome;
  logAttivita('Elenchi: salvato "' + nome + '"');
  await elCaricaSalvati();
  elRender();
}
async function elElimina() {
  if (!EL.id || !confirm('Togliere l\'elenco "' + EL.nome + '" dagli elenchi salvati?')) return;
  const res = await sbFetch(SUPA_URL + '/rest/v1/elenchi_salvati?id=eq.' + EL.id, {
    method: 'PATCH', headers: Object.assign({}, HJ, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ attivo: false, aggiornato_il: new Date().toISOString() }),
  });
  if (!res.ok) { alert('Operazione non riuscita.'); return; }
  logAttivita('Elenchi: tolto "' + EL.nome + '"');
  EL.id = null; EL.nome = '';
  await elCaricaSalvati();
  elRender();
}

// ============================================================
// DISEGNO
// ============================================================
function elCss() {
  if (document.getElementById('elCss')) return;
  const s = document.createElement('style');
  s.id = 'elCss';
  s.textContent = `
#elRoot .el-card{margin-bottom:16px}
#elRoot .el-card h2{margin-bottom:12px}
#elRoot .el-filtro{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(140px,1fr) minmax(0,2fr) 40px;gap:8px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}
#elRoot .el-filtro:first-child{border-top:0;padding-top:0}
#elRoot .el-x{width:40px;height:44px;border:1px solid var(--line2);border-radius:12px;background:var(--surface);color:var(--red);font-size:18px}
#elRoot .el-val{display:flex;gap:8px;flex-wrap:wrap;align-items:center;min-width:0}
#elRoot .el-val .chip{height:34px;padding:0 12px;font-size:13px}
#elRoot .el-due{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
#elRoot .el-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 16px}
#elRoot .el-cols label{display:flex;align-items:center;gap:8px;min-height:36px;font-size:14px;cursor:pointer}
#elRoot .el-grp{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin:12px 0 4px;grid-column:1/-1}
#elRoot .el-scelte{display:flex;flex-wrap:wrap;gap:6px}
#elRoot .el-scelte .chip{height:34px;padding:0 10px;font-size:13px}
#elRoot .el-ord{display:inline-flex;gap:2px;margin-left:4px}
#elRoot .el-ord button{border:0;background:none;color:var(--muted);padding:0 4px;font-size:13px}
#elRoot .el-tab{width:100%;border-collapse:collapse;font-size:14px}
#elRoot .el-tab th{position:sticky;top:0;background:var(--bg);text-align:left;font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);padding:10px 12px;white-space:nowrap;cursor:pointer;user-select:none}
#elRoot .el-tab td{padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}
#elRoot .el-tabwrap{overflow:auto;max-height:70vh;border:1px solid var(--line);border-radius:14px}
#elRoot .el-conto{font-size:20px;font-weight:800}
#elRoot .el-azioni{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
#elRoot details>summary{cursor:pointer;font-weight:700;color:var(--accent);min-height:40px;display:flex;align-items:center}
@media (max-width:720px){#elRoot .el-filtro{grid-template-columns:1fr 40px}#elRoot .el-filtro>*:nth-child(2),#elRoot .el-filtro>*:nth-child(3){grid-column:1/2}#elRoot .el-filtro .el-x{grid-row:1;grid-column:2}}
`;
  document.head.appendChild(s);
}

function elRender() {
  const root = document.getElementById('elRoot');
  if (!root || !EL) return;
  elCss();
  const carica = !!EL.caricamento[EL.arg];
  root.innerHTML =
    '<div class="card el-card"><h2>Elenchi salvati</h2><div id="elSalvati"></div></div>'
    + '<div class="card el-card"><div class="frow"><span class="fl">Elenco di</span><div class="seg">'
    + EL_ARGOMENTI.map(a => '<button class="' + (EL.arg === a[0] ? 'on' : '') + '" onclick="elScegliArgomento(\'' + a[0] + '\')">' + a[1] + '</button>').join('')
    + '</div><span class="grow"></span>'
    + (EL.id ? '<span class="pill p-blue">' + elEsc(EL.nome) + '</span>' : '')
    + '<button class="btn sm" onclick="elNuovo(\'' + EL.arg + '\')">Ricomincia</button></div>'
    + (carica ? '<div class="loading-msg">Caricamento…</div>' : '<div id="elCostruisci"></div>')
    + '</div>'
    + (carica ? '' : '<div class="card el-card" id="elRisultati"></div>');
  elRenderSalvati();
  if (!carica) { elRenderCostruisci(); elRenderRisultati(); }
}

function elRenderSalvati() {
  const box = document.getElementById('elSalvati');
  if (!box) return;
  if (!EL.salvatiOk) { box.innerHTML = '<p class="note">Elenchi salvati non disponibili (va eseguito supabase/elenchi.sql).</p>'; return; }
  if (!EL.salvati.length) { box.innerHTML = '<p class="note">Nessun elenco salvato. Costruisci un elenco qui sotto e premi "Salva elenco".</p>'; return; }
  const nomi = Object.fromEntries(EL_ARGOMENTI);
  box.innerHTML = '<div class="chips">' + EL.salvati.map(s =>
    '<button class="chip' + (EL.id === s.id ? ' on' : '') + '" onclick="elApriSalvato(' + s.id + ')" title="' + elEsc(nomi[s.argomento] || '') + '">'
    + elEsc(s.nome) + '</button>').join('') + '</div>';
}

function elRenderCostruisci() {
  const box = document.getElementById('elCostruisci');
  if (!box) return;
  const D = EL.dati[EL.arg];
  const fontePrinc = { volontari: 'volontari', mezzi: 'mezzi', dotazioni: 'dotazioni' }[EL.arg];
  if (EL.fonti[fontePrinc] === false) { box.innerHTML = '<p class="bad">Non hai accesso a questi dati.</p>'; return; }
  if (!D) { box.innerHTML = ''; return; }
  const campi = elCampi(EL.arg);
  let h = '<h2>Filtri</h2><p class="note" style="margin:-6px 0 10px">Devono valere tutti insieme.</p><div>';
  h += EL.filtri.map((f, i) => elFiltroHtml(f, i, campi)).join('');
  h += '</div><button class="btn sm" style="margin-top:10px" onclick="elAggiungiFiltro()">+ Aggiungi filtro</button>';
  if (EL.arg === 'volontari' && EL.fonti.interventi && elUsaPeriodo()) {
    h += '<div class="frow" style="margin-top:14px"><span class="fl">Periodo interventi</span>'
      + '<input type="date" style="max-width:180px" value="' + elEsc(EL.periodo.dal) + '" onchange="elCambiaPeriodo(\'dal\', this.value)">'
      + '<input type="date" style="max-width:180px" value="' + elEsc(EL.periodo.al) + '" onchange="elCambiaPeriodo(\'al\', this.value)"></div>';
  }
  if (EL.arg === 'volontari') {
    const manca = [];
    if (!EL.fonti.formazione) manca.push('corsi e abilitazioni');
    if (!EL.fonti.interventi) manca.push('interventi');
    if (!EL.fonti.telegram) manca.push('Telegram');
    if (!EL.fonti.taglie) manca.push('taglie DPI');
    if (manca.length) h += '<p class="note">Non disponibili con il tuo accesso: ' + manca.join(', ') + '.</p>';
  }
  // colonne
  h += '<details style="margin-top:14px"' + (EL.colAperte || !EL.colonne.length ? ' open' : '') + ' ontoggle="EL.colAperte=this.open"><summary>Colonne (' + EL.colonne.length + ')</summary>';
  if (EL.colonne.length) {
    h += '<div class="el-scelte" style="margin:6px 0 10px">' + EL.colonne.map((k, i) => {
      const c = campi.find(x => x.k === k);
      if (!c) return '';
      return '<span class="chip on">' + elEsc(c.l)
        + '<span class="el-ord">' + (i > 0 ? '<button style="color:inherit" title="Sposta a sinistra" onclick="elSpostaColonna(\'' + k + '\',-1)">‹</button>' : '')
        + (i < EL.colonne.length - 1 ? '<button style="color:inherit" title="Sposta a destra" onclick="elSpostaColonna(\'' + k + '\',1)">›</button>' : '')
        + '<button style="color:inherit" title="Togli" onclick="elToggleColonna(\'' + k + '\', false)">✕</button></span></span>';
    }).join('') + '</div>';
  }
  h += '<div class="el-cols">';
  let gruppo = null;
  campi.filter(c => c.c !== false).forEach(c => {
    if (c.g && c.g !== gruppo) { gruppo = c.g; h += '<div class="el-grp">' + elEsc(gruppo) + '</div>'; }
    h += '<label><input type="checkbox"' + (EL.colonne.includes(c.k) ? ' checked' : '') + ' onchange="elToggleColonna(\'' + c.k + '\', this.checked)"> ' + elEsc(c.l) + '</label>';
  });
  h += '</div></details>';
  box.innerHTML = h;
}

function elFiltroHtml(f, i, campi) {
  const campo = f.c === 'voce' ? campi.find(c => c.k === 'voce') : campi.find(c => c.k === f.c);
  let sel = '<select onchange="elCambiaCampoFiltro(' + i + ', this.value)">';
  if (!campo) sel += '<option selected>(campo non disponibile)</option>';
  let gruppo = null;
  campi.filter(c => c.f !== false).forEach(c => {
    if ((c.g || '') !== gruppo) { if (gruppo !== null) sel += '</optgroup>'; gruppo = c.g || ''; sel += '<optgroup label="' + elEsc(gruppo || 'Campi') + '">'; }
    sel += '<option value="' + c.k + '"' + (campo && c.k === campo.k ? ' selected' : '') + '>' + elEsc(c.l) + '</option>';
  });
  if (gruppo !== null) sel += '</optgroup>';
  sel += '</select>';
  if (!campo) return '<div class="el-filtro">' + sel + '<span></span><span></span><button class="el-x" title="Togli filtro" onclick="elTogliFiltro(' + i + ')">✕</button></div>';
  const ops = EL_TIPO_OPS[campo.t];
  const opSel = '<select onchange="elCambiaOp(' + i + ', this.value)">' + ops.map(o => '<option value="' + o[0] + '"' + (o[0] === f.o ? ' selected' : '') + '>' + elEsc(o[1]) + '</option>').join('') + '</select>';
  let val = '';
  const v = f.v == null ? '' : f.v;
  if (campo.t === 'testo') {
    if (!['vuoto', 'pieno'].includes(f.o)) val = '<input type="text" value="' + elEsc(v) + '" placeholder="testo" oninput="elCambiaValore(' + i + ', \'v\', this.value)">';
  } else if (campo.t === 'scelta' || campo.t === 'corso') {
    const scelte = elScelte(campo);
    const lista = Array.isArray(f.v) ? f.v : [];
    val = '<div class="el-scelte">' + scelte.map(s => '<button class="chip' + (lista.includes(s[0]) ? ' on' : '') + '" onclick="elToggleScelta(' + i + ', ' + elEsc(JSON.stringify(s[0])) + ')">' + elEsc(s[1]) + '</button>').join('')
      + (scelte.length ? '' : '<span class="note" style="margin:0">Nessun valore.</span>') + '</div>';
  } else if (campo.t === 'data') {
    if (['prima', 'dopo'].includes(f.o)) val = '<input type="date" value="' + elEsc(v) + '" onchange="elCambiaValoreSubito(' + i + ', \'v\', this.value)">';
    if (f.o === 'tra') val = '<div class="el-due"><input type="date" value="' + elEsc(v) + '" onchange="elCambiaValoreSubito(' + i + ', \'v\', this.value)"><input type="date" value="' + elEsc(f.v2 || '') + '" onchange="elCambiaValoreSubito(' + i + ', \'v2\', this.value)"></div>';
  } else if (campo.t === 'numero') {
    val = f.o === 'tra'
      ? '<div class="el-due"><input type="number" value="' + elEsc(v) + '" placeholder="da" oninput="elCambiaValore(' + i + ', \'v\', this.value)"><input type="number" value="' + elEsc(f.v2 || '') + '" placeholder="a" oninput="elCambiaValore(' + i + ', \'v2\', this.value)"></div>'
      : '<input type="number" value="' + elEsc(v) + '" oninput="elCambiaValore(' + i + ', \'v\', this.value)">';
  } else if (campo.t === 'voce') {
    const D = EL.dati.volontari;
    const voci = D.cat.filter(c => c.attivo && !c.unita_in && c.codice !== 'DA_VERIFICARE')
      .sort((a, b) => (a.tipo || '').localeCompare(b.tipo || '') || a.titolo.localeCompare(b.titolo, 'it'));
    val = '<select onchange="elCambiaValoreSubito(' + i + ', \'v\', this.value)"><option value="">— scegli —</option>'
      + ['CORSO', 'ABILITAZIONE'].map(t => {
        const g = voci.filter(c => (c.tipo || 'CORSO') === t);
        return g.length ? '<optgroup label="' + (t === 'CORSO' ? 'Corsi' : 'Abilitazioni') + '">' + g.map(c => '<option value="' + c.id + '"' + (String(c.id) === String(v) ? ' selected' : '') + '>' + elEsc(c.titolo) + '</option>').join('') + '</optgroup>' : '';
      }).join('') + '</select>';
  }
  // per "Corso o abilitazione" prima la voce, poi la condizione
  if (campo.t === 'voce') return '<div class="el-filtro">' + sel + val + opSel + '<button class="el-x" title="Togli filtro" onclick="elTogliFiltro(' + i + ')">✕</button></div>';
  return '<div class="el-filtro">' + sel + opSel + '<div class="el-val">' + val + '</div><button class="el-x" title="Togli filtro" onclick="elTogliFiltro(' + i + ')">✕</button></div>';
}

const EL_MAX_RIGHE_VIDEO = 500;
function elRenderRisultati() {
  const box = document.getElementById('elRisultati');
  if (!box || !EL.dati[EL.arg]) return;
  const campi = elCampi(EL.arg);
  const cols = EL.colonne.map(k => campi.find(c => c.k === k)).filter(Boolean);
  const righe = elRisultato();
  const nomeArg = Object.fromEntries(EL_ARGOMENTI)[EL.arg].toLowerCase();
  const desc = elDescriviFiltri();
  let h = '<div class="frow" style="margin:0"><span class="el-conto">' + righe.length + ' ' + (righe.length === 1 ? { volontari: 'volontario', mezzi: 'mezzo', dotazioni: 'dotazione' }[EL.arg] : nomeArg) + '</span></div>'
    + (desc ? '<p class="note" style="margin-top:4px">' + elEsc(desc) + '</p>' : '')
    + '<div class="el-azioni">'
    + '<button class="btn sm" onclick="elEsportaExcel()"' + (righe.length && cols.length ? '' : ' disabled') + '>Excel</button>'
    + '<button class="btn sm" onclick="elEsportaPDF(false)"' + (righe.length && cols.length ? '' : ' disabled') + '>PDF</button>'
    + '<button class="btn sm" onclick="elEsportaPDF(true)"' + (righe.length && cols.length ? '' : ' disabled') + '>Stampa</button>'
    + (EL.arg === 'volontari' ? '<button class="btn sm" onclick="elCopia(\'email\')"' + (righe.length ? '' : ' disabled') + '>Copia mail</button>'
      + '<button class="btn sm" onclick="elCopia(\'telefono\')"' + (righe.length ? '' : ' disabled') + '>Copia telefoni</button>' : '')
    + '<span class="grow"></span>'
    + (EL.salvatiOk ? (EL.id ? '<button class="btn sm" onclick="elSalva(false)">Salva modifiche</button><button class="btn sm" onclick="elSalva(true)">Salva come nuovo</button><button class="btn sm danger" onclick="elElimina()">Togli dai salvati</button>'
      : '<button class="btn sm pri" onclick="elSalva(true)">Salva elenco</button>') : '')
    + '</div>';
  if (!cols.length) h += '<div class="empty">Scegli almeno una colonna.</div>';
  else if (!righe.length) h += '<div class="empty">Nessun risultato con questi filtri.</div>';
  else {
    const ord = EL.ordine && elCampo(EL.ordine.k) ? EL.ordine : { k: cols[0].k, d: false };
    h += '<div class="el-tabwrap"><table class="el-tab"><thead><tr>'
      + cols.map(c => '<th onclick="elOrdina(\'' + c.k + '\')">' + elEsc(c.l) + (ord.k === c.k ? (ord.d ? ' ▾' : ' ▴') : '') + '</th>').join('')
      + '</tr></thead><tbody>'
      + righe.slice(0, EL_MAX_RIGHE_VIDEO).map(r => '<tr>' + cols.map(c => '<td>' + elEsc(elTesto(c, r)) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></div>'
      + (righe.length > EL_MAX_RIGHE_VIDEO ? '<p class="note">A video le prime ' + EL_MAX_RIGHE_VIDEO + ' righe: Excel e PDF le contengono tutte.</p>' : '');
  }
  box.innerHTML = h;
}

// ============================================================
// USCITE
// ============================================================
function elTitolo() {
  return EL.nome || ('Elenco ' + Object.fromEntries(EL_ARGOMENTI)[EL.arg].toLowerCase());
}
function elNomeFile(ext) {
  return elTitolo().replace(/[^a-z0-9àèéìòù]+/gi, '_').replace(/^_|_$/g, '') + '_' + elOggiIso() + '.' + ext;
}
function elTabella() {
  const campi = elCampi(EL.arg);
  const cols = EL.colonne.map(k => campi.find(c => c.k === k)).filter(Boolean);
  const righe = elRisultato();
  return { cols, righe, testi: righe.map(r => cols.map(c => elTesto(c, r))) };
}

async function elEsportaExcel() {
  const t = elTabella();
  if (!t.righe.length) return;
  try { await caricaExcelJS(); } catch (e) { alert('Impossibile caricare la libreria Excel.'); return; }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Elenco');
  ws.addRow([elTitolo()]).font = { bold: true, size: 14 };
  ws.addRow(['Generato il ' + elData(elOggiIso()) + ' — ' + t.righe.length + ' righe']);
  const desc = elDescriviFiltri();
  if (desc) ws.addRow(['Filtri: ' + desc]);
  ws.addRow([]);
  const testa = ws.addRow(t.cols.map(c => c.l));
  testa.font = { bold: true };
  testa.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE9FA' } }; });
  const primaRiga = testa.number;
  t.righe.forEach(r => {
    ws.addRow(t.cols.map(c => {
      const v = elValore(c, r);
      if (c.t === 'numero' && v != null && v !== '') return Number(v);
      if (c.t === 'data' && v) { const d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? elTesto(c, r) : d; }
      return elTesto(c, r);
    }));
  });
  t.cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.t === 'data') col.numFmt = 'dd/mm/yyyy';
    const lung = Math.max(c.l.length, ...t.testi.slice(0, 300).map(r => String(r[i] || '').length));
    col.width = Math.min(Math.max(lung + 2, 10), 50);
  });
  ws.autoFilter = { from: { row: primaRiga, column: 1 }, to: { row: primaRiga, column: t.cols.length } };
  ws.views = [{ state: 'frozen', ySplit: primaRiga }];
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = elNomeFile('xlsx');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  logAttivita('Elenchi: Excel "' + elTitolo() + '" (' + t.righe.length + ' righe)');
}

function elEsportaPDF(stampa) {
  const t = elTabella();
  if (!t.righe.length) return;
  if (!window.jspdf || !window.jspdf.jsPDF) { alert('Libreria PDF non disponibile.'); return; }
  const largo = t.cols.length > 5;
  const doc = new window.jspdf.jsPDF({ orientation: largo ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight(), cx = W / 2, mg = 14;
  const VERDE = [26, 122, 74];
  let LOGO_SEZ = null, LOGO_VOL = null;
  try { LOGO_SEZ = 'data:image/png;base64,' + _getLogoSez(); LOGO_VOL = 'data:image/png;base64,' + _getLogoVol(); } catch (e) {}
  const desc = elDescriviFiltri();
  const titolo = elTitolo().toUpperCase();
  function intestazione() {
    if (LOGO_SEZ) try { doc.addImage(LOGO_SEZ, 'PNG', mg, 8, 18, 18); } catch (e) {}
    if (LOGO_VOL) try { doc.addImage(LOGO_VOL, 'PNG', W - mg - 14, 8, 14, 18); } catch (e) {}
    doc.setTextColor(...VERDE);
    doc.setFont('times', 'bold'); doc.setFontSize(12);
    doc.text('ASSOCIAZIONE NAZIONALE ALPINI', cx, 13, { align: 'center' });
    doc.setFontSize(10);
    doc.text('SEZIONE DI CASALE MONFERRATO', cx, 18, { align: 'center' });
    doc.text('UNITÀ DI PROTEZIONE CIVILE ANA', cx, 23, { align: 'center' });
    doc.setDrawColor(...VERDE); doc.setLineWidth(0.35); doc.line(mg, 28, W - mg, 28);
    doc.setTextColor(17, 17, 17);
  }
  intestazione();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(titolo, cx, 36, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  let y = 42;
  const sotto = 'Generato il ' + elData(elOggiIso()) + ' — ' + t.righe.length + ' righe';
  doc.text(sotto, cx, y, { align: 'center' });
  if (desc) {
    const linee = doc.splitTextToSize('Filtri: ' + desc, W - 2 * mg);
    y += 4.5;
    doc.text(linee, cx, y, { align: 'center' });
    y += (linee.length - 1) * 3.6;
  }
  doc.autoTable({
    startY: y + 5,
    head: [['#'].concat(t.cols.map(c => c.l))],
    body: t.testi.map((r, i) => [String(i + 1)].concat(r)),
    styles: { fontSize: t.cols.length > 8 ? 7 : 8.5, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: VERDE, textColor: 255 },
    columnStyles: { 0: { cellWidth: 9, halign: 'right' } },
    margin: { left: mg, right: mg, top: 32, bottom: 14 },
    didDrawPage: d => {
      if (d.pageNumber > 1) intestazione();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(titolo + ' — pagina ' + d.pageNumber, W - mg, Hh - 7, { align: 'right' });
      doc.setTextColor(17, 17, 17);
    },
  });
  logAttivita('Elenchi: ' + (stampa ? 'stampa' : 'PDF') + ' "' + elTitolo() + '" (' + t.righe.length + ' righe)');
  if (stampa) {
    doc.autoPrint();
    const url = doc.output('bloburl');
    const w = window.open(url, '_blank');
    if (!w) doc.save(elNomeFile('pdf'));
  } else doc.save(elNomeFile('pdf'));
}

async function elCopia(campo) {
  const righe = elRisultato();
  const valori = [...new Set(righe.map(r => String(r[campo] || '').trim()).filter(Boolean))];
  const mancanti = righe.length - righe.filter(r => String(r[campo] || '').trim()).length;
  if (!valori.length) { alert('Nessun ' + (campo === 'email' ? 'indirizzo mail' : 'numero di telefono') + ' in questo elenco.'); return; }
  const testo = valori.join(campo === 'email' ? '; ' : '\n');
  let ok = false;
  try { await navigator.clipboard.writeText(testo); ok = true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = testo; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }
  const cosa = campo === 'email' ? 'indirizzi mail' : 'numeri di telefono';
  if (ok) alert('Copiati ' + valori.length + ' ' + cosa + '.' + (mancanti ? '\n' + mancanti + ' nell\'elenco non ce l\'hanno.' : ''));
  else prompt('Copia a mano:', testo);
  logAttivita('Elenchi: copiati ' + cosa + ' "' + elTitolo() + '"');
}
