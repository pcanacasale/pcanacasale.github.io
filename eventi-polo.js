// ============================================================
// STRUMENTI — pagina Eventi, seconda parte (prefisso ev*, permesso eventi).
// ============================================================
// Modello: cruscotto delle Attivazioni del Polo Logistico, compilato dallo staff, solo volontari dell'anagrafica.
// Una riga in evento_disponibilita vuol dire "disponibile quel giorno"; senza orari è giornata intera.
// Pasti, posti letto e conteggi sono calcolati qui nel browser dai dati caricati.
// Gli assenti (presente = false) non contano in cucina, nel riepilogo e nelle stampe.
// evSalvaVolontario è l'unico punto di salvataggio, usato dalla form e dall'import Excel.
// ============================================================

const EV_SERVIZI = [['colazione', 'Colazione', 'C'], ['pranzo', 'Pranzo', 'P'], ['cena', 'Cena', 'Ce'], ['pernotto', 'Pernotto', 'N']];
const EV_PASTI = ['colazione', 'pranzo', 'cena'];
const EV_COL_DISP = 'id,evento_id,evento_volontario_id,giorno,ora_dalle,ora_alle,colazione,pranzo,cena,pernotto';
const EV_MAX_GIORNI = 120;
const EV_EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

async function evCaricaPolo(id) {
  const [disp, mezzi, materiali, ospiti, extra, tipologie, esigenze] = await Promise.all([
    evLeggi('evento_disponibilita?evento_id=eq.' + id + '&select=' + EV_COL_DISP + '&order=giorno'),
    evLeggi('evento_mezzi?evento_id=eq.' + id + '&select=id,evento_id,mezzo_id,tipo,targa,giorni,note&order=id'),
    evLeggi('evento_materiali?evento_id=eq.' + id + '&select=id,evento_id,quantita,descrizione,note&order=id'),
    evLeggi('evento_ospiti?evento_id=eq.' + id + '&select=id,evento_id,nome,esigenze,esigenze_nota,note&order=id'),
    evLeggi('evento_extra?evento_id=eq.' + id + '&select=id,evento_id,giorno,servizio,quantita,note&order=giorno'),
    evLeggi('eventi_tipologie?select=id,nome,ordine,attiva&order=ordine,nome'),
    evLeggi('eventi_esigenze?select=id,nome,ordine,attiva,con_nota&order=ordine,nome'),
  ]);
  const ospitiServizi = ospiti.length
    ? await evLeggi('evento_ospiti_servizi?ospite_id=in.(' + ospiti.map(o => o.id).join(',') + ')&select=id,ospite_id,giorno,colazione,pranzo,cena,pernotto') : [];
  return { disp, mezzi, materiali, ospiti, ospitiServizi, extra, tipologie, esigenze };
}

// Le abilitazioni stanno nel registro formazione: senza accesso le barre non compaiono
async function evCaricaAbilitazioni() {
  try { evCorrente.abilitazioni = await evLeggi('formazione_registro?tipo=eq.ABILITAZIONE&select=volontario_id,titolo'); }
  catch(e) { evCorrente.abilitazioni = []; }
}

// -- GIORNI --
function evPiuUno(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function evGiorni(e) {
  const inizio = evGiorno(e.data_inizio), fine = evGiorno(e.data_fine || e.fine_finestra) || inizio;
  const out = [];
  for (let g = inizio; g <= fine && out.length < EV_MAX_GIORNI; g = evPiuUno(g)) out.push(g);
  return out;
}

function evGiornoBreve(iso) {
  const t = new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function evOraBreve(o) { return o ? String(o).slice(0, 5) : ''; }
function evFascia(d) { return d.ora_dalle ? evOraBreve(d.ora_dalle) + '–' + evOraBreve(d.ora_alle) : ''; }
function evDisp(rigaId, g) { return evCorrente.disp.find(d => d.evento_volontario_id === rigaId && evGiorno(d.giorno) === g) || null; }
function evDispValide() {
  const giorni = evGiorni(evCorrente.e);
  return evCorrente.disp.filter(d => giorni.includes(evGiorno(d.giorno)) && evPresenti().some(r => r.id === d.evento_volontario_id));
}

function evPatentiDi(r) {
  const v = evVol(r.volontario_id);
  return v && v.patenti ? String(v.patenti).split(/[,;/\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean) : [];
}

// Quanti log di modifica della griglia: uno ogni minuto, non uno per clic
let evUltimoLogGiorni = 0;
function evLogGiorni() {
  if (Date.now() - evUltimoLogGiorni < 60000) return;
  evUltimoLogGiorni = Date.now();
  logAttivita('ha modificato giorni e servizi dell\'evento: ' + evCorrente.e.titolo);
}

async function evScriviGiorno(rigaId, g, campi) {
  const d = evDisp(rigaId, g);
  if (d) {
    const [riga] = await evScrivi('PATCH', 'evento_disponibilita?id=eq.' + d.id, campi);
    Object.assign(d, riga);
  } else {
    const [riga] = await evScrivi('POST', 'evento_disponibilita', Object.assign({ evento_id: evCorrente.e.id, evento_volontario_id: rigaId, giorno: g }, campi));
    evCorrente.disp.push(riga);
  }
}

async function evTogliGiorno(d) {
  await evScrivi('DELETE', 'evento_disponibilita?id=eq.' + d.id);
  evCorrente.disp = evCorrente.disp.filter(x => x.id !== d.id);
}

function evCellaHtml(rigaId, g) {
  const d = evDisp(rigaId, g);
  const bott = (campo, testo, titolo, on) => '<button class="ev-t' + (on ? ' on' : '') + '" title="' + titolo + '" aria-label="' + titolo + ' ' + evGiornoBreve(g) + '" aria-pressed="' + !!on + '" onclick="evCella(' + rigaId + ',\'' + g + '\',\'' + campo + '\')">' + testo + '</button>';
  let h = bott('disponibile', '✓', 'Disponibile', !!d);
  if (evAtt('servizi')) h += EV_SERVIZI.map(s => bott(s[0], s[2], s[1], d && d[s[0]])).join('');
  if (d && evAtt('orari')) {
    h += '<div class="ev-orari"><input type="time" aria-label="Dalle" value="' + evOraBreve(d.ora_dalle) + '" onchange="evOrario(' + rigaId + ',\'' + g + '\',this.parentNode)">'
      + '<input type="time" aria-label="Alle" value="' + evOraBreve(d.ora_alle) + '" onchange="evOrario(' + rigaId + ',\'' + g + '\',this.parentNode)"></div>';
  }
  return h;
}

function evRenderGiorni() {
  const c = evCorrente, giorni = evGiorni(c.e);
  const estendi = c.e.tipo === 'EMERGENZA' && !c.e.data_fine ? '<button class="btn sm" onclick="evEstendi()">Aggiungi un giorno</button>' : '';
  const legenda = '<p class="sub">✓ disponibile' + (evAtt('servizi') ? ' · C colazione · P pranzo · Ce cena · N pernotto' : '') + (evAtt('orari') ? ' · senza orari vale la giornata intera' : '') + '</p>';
  evEl('evScheda').innerHTML = '<div class="bar">' + legenda + '<span class="grow"></span>' + estendi + '<button class="btn sm" onclick="evVistaGriglia(false)">Torna all\'elenco</button></div>'
    + (evAtt('servizi') ? '<p class="sub mb10">Spuntando il pernotto, la colazione del mattino dopo si spunta da sola (modificabile).</p>' : '')
    + (!c.squadra.length ? '<div class="empty">Aggiungi prima i volontari.</div>'
      : '<div class="ev-scorri"><table class="ev-tab ev-griglia"><thead><tr><th>Volontario</th>' + giorni.map(g => '<th>' + aggEsc(evGiornoBreve(g)) + '</th>').join('') + '</tr></thead><tbody>'
        + c.squadra.map(r => '<tr><td><b>' + aggEsc(evNomeVol(r.volontario_id)) + '</b></td>'
          + giorni.map(g => '<td id="evC_' + r.id + '_' + g + '">' + evCellaHtml(r.id, g) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>');
}

function evAggiornaCella(rigaId, g) {
  const td = evEl('evC_' + rigaId + '_' + g);
  if (td) td.innerHTML = evCellaHtml(rigaId, g);
}

async function evCella(rigaId, g, campo) {
  const d = evDisp(rigaId, g);
  try {
    if (campo === 'disponibile') {
      if (d) await evTogliGiorno(d); else await evScriviGiorno(rigaId, g, {});
    } else {
      const val = !(d && d[campo]);
      await evScriviGiorno(rigaId, g, { [campo]: val });
      // Comodità della griglia, non un vincolo: la colazione resta modificabile
      const domani = evPiuUno(g);
      if (campo === 'pernotto' && val && evGiorni(evCorrente.e).includes(domani)) {
        await evScriviGiorno(rigaId, domani, { colazione: true });
        evAggiornaCella(rigaId, domani);
      }
    }
    evLogGiorni();
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  evAggiornaCella(rigaId, g);
}

async function evOrario(rigaId, g, box) {
  const [dalle, alle] = [...box.querySelectorAll('input')].map(i => i.value);
  if (!!dalle !== !!alle) return;   // aspetta il secondo orario
  if (dalle && dalle === alle) { sbAvviso('I due orari devono essere diversi.'); return; }
  try {
    await evScriviGiorno(rigaId, g, { ora_dalle: dalle || null, ora_alle: alle || null });
    evLogGiorni();
  } catch(e) { sbAvviso('Modifica non salvata.'); evAggiornaCella(rigaId, g); }
}

async function evEstendi() {
  const e = evCorrente.e, nuova = evPiuUno(evGiorno(e.fine_finestra) || evGiorno(e.data_inizio));
  try {
    const [riga] = await evScrivi('PATCH', 'eventi?id=eq.' + e.id, { fine_finestra: nuova });
    evCorrente.e = riga;
    await logAttivita('ha esteso l\'evento: ' + e.titolo + ' fino al ' + evData(nuova));
    evRender();
  } catch(x) { sbAvviso('Modifica non salvata.'); }
}

// -- DATI DEL VOLONTARIO --
// Controlli comuni a form e import; d ha gli stessi nomi delle colonne
function evValidaVol(d) {
  const err = [];
  if (evObb('tipologia') && !d.tipologia) err.push('tipologia obbligatoria');
  if (evObb('note') && !d.note) err.push('note obbligatorie');
  if (evObb('esigenze') && !(d.esigenze || []).length) err.push('esigenze alimentari obbligatorie');
  const conNota = evCorrente.esigenze.filter(x => x.con_nota).map(x => x.nome);
  if ((d.esigenze || []).some(x => conNota.includes(x)) && !d.esigenze_nota) err.push('descrivere l\'esigenza alimentare nella nota');
  return err;
}

// I campi che dipendono da anagrafica e griglia si segnalano in elenco, non bloccano
function evMancanti(r) {
  const v = evVol(r.volontario_id) || {}, giorni = evGiorni(evCorrente.e).map(g => evDisp(r.id, g)).filter(Boolean);
  const out = evValidaVol(r);
  if (evObb('cellulare') && !v.telefono) out.push('cellulare mancante in anagrafica');
  if (evObb('patenti') && !v.patenti) out.push('patenti mancanti in anagrafica');
  if (evObb('servizi') && !giorni.length) out.push('nessun giorno indicato');
  if (evObb('orari') && giorni.some(d => !d.ora_dalle)) out.push('orari mancanti');
  return out;
}

// Come descriviServiziAdesione del Polo: giornate con orario, poi pasti e notti
function evDescriviServizi(r) {
  const giorni = evGiorni(evCorrente.e).filter(g => evDisp(r.id, g));
  const righe = giorni.map(g => evDisp(r.id, g));
  const pasti = righe.reduce((t, d) => t + EV_PASTI.filter(p => d[p]).length, 0), notti = righe.filter(d => d.pernotto).length;
  const testo = giorni.map(g => evGiornoBreve(g) + (evFascia(evDisp(r.id, g)) ? ' ' + evFascia(evDisp(r.id, g)) : '')).join(', ');
  const serv = evAtt('servizi') ? [pasti ? pasti + (pasti === 1 ? ' pasto' : ' pasti') : '', notti ? notti + (notti === 1 ? ' notte' : ' notti') : ''] : [];
  return [testo, ...serv].filter(Boolean).join(', ') || '—';
}

// Inserisce o aggiorna il volontario; giorni (Map giorno → campi) sostituisce le giornate se presente
async function evSalvaVolontario(d, giorni) {
  const c = evCorrente, esiste = c.squadra.find(r => r.volontario_id === d.volontario_id);
  const campi = Object.assign({}, d);
  delete campi.volontario_id;
  let riga;
  if (esiste) {
    if (Object.keys(campi).length) [riga] = await evScrivi('PATCH', 'evento_volontari?id=eq.' + esiste.id, campi);
    Object.assign(esiste, riga || {});
    riga = esiste;
  } else {
    [riga] = await evScrivi('POST', 'evento_volontari', Object.assign({ evento_id: c.e.id, volontario_id: d.volontario_id, presente: true }, campi));
    c.squadra.push(riga);
  }
  if (giorni) {
    const uguale = (k, a, b) => k.startsWith('ora_') ? (evOraBreve(a) || null) === (evOraBreve(b) || null) : a === b;
    for (const g of evGiorni(c.e)) {
      const vuole = giorni.get(g), ha = evDisp(riga.id, g);
      if (vuole && (!ha || Object.keys(vuole).some(k => !uguale(k, ha[k], vuole[k])))) await evScriviGiorno(riga.id, g, vuole);
      else if (!vuole && ha) await evTogliGiorno(ha);
    }
  }
  await logAttivita((esiste ? 'ha modificato ' : 'ha aggiunto ') + evNomeVol(d.volontario_id) + ' nell\'evento: ' + c.e.titolo);
  return riga;
}

function evCheckEsigenze(prefisso, scelte) {
  const lista = evCorrente.esigenze.filter(x => x.attiva || (scelte || []).includes(x.nome));
  if (!lista.length) return '<p class="note">Nessuna esigenza in lista: si aggiungono da Impostazioni.</p>';
  return '<div class="perm-grid">' + lista.map((x, i) => '<label class="perm-check"><input type="checkbox" id="' + prefisso + i + '" data-nome="' + aggEsc(x.nome) + '"' + ((scelte || []).includes(x.nome) ? ' checked' : '') + '> ' + aggEsc(x.nome) + '</label>').join('') + '</div>';
}

function evLeggiEsigenze(prefisso) {
  return [...document.querySelectorAll('[id^="' + prefisso + '"]')].filter(i => i.checked).map(i => i.dataset.nome);
}

// -- SCHEDA VOLONTARI --
function evVistaGriglia(si) { evCorrente.griglia = si; evRender(); }

function evRenderVolontari() {
  const c = evCorrente, presenti = evPresenti();
  const ore = presenti.reduce((t, r) => t + evOre(r), 0);
  evEl('evScheda').innerHTML = '<div class="bar"><label class="search" for="evVolFiltro"><input type="search" id="evVolFiltro" placeholder="Cerca volontario" autocomplete="off" value="' + aggEsc(c.cerca) + '" oninput="evCorrente.cerca=this.value;evDisegnaVolontari()"></label><span class="grow"></span>'
    + '<button class="btn sm" onclick="evVistaGriglia(true)">Griglia giorni</button>'
    + '<label class="btn sm">Importa da Excel<input type="file" accept=".xlsx" hidden onchange="evImportaExcel(this)"></label>'
    + '<button class="btn sm pri" onclick="evApriVol()">Aggiungi volontario</button></div>'
    + '<p class="sub mb10">' + presenti.length + ' presenti su ' + c.squadra.length + ' volontari · ' + ore + ' ore</p><div id="evVolLista"></div>';
  evDisegnaVolontari();
}

function evDisegnaVolontari() {
  const c = evCorrente, q = c.cerca.toLowerCase().trim(), box = evEl('evVolLista');
  const nome = r => evNomeVol(r.volontario_id);
  const righe = c.squadra.filter(r => !q || nome(r).toLowerCase().includes(q) || (r.ruolo || '').toLowerCase().includes(q))
    .slice().sort((a, b) => nome(a).localeCompare(nome(b)));
  if (!righe.length) { box.innerHTML = '<div class="empty">' + (c.squadra.length ? 'Nessun volontario corrisponde alla ricerca.' : 'Nessun volontario.') + '</div>'; return; }
  const cel = evAtt('cellulare'), tip = evAtt('tipologia'), pat = evAtt('patenti'), es = evAtt('esigenze'), art = evAtt('art39');
  box.innerHTML = '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Cognome Nome</th>' + (cel ? '<th class="sx">Cellulare</th>' : '') + (tip ? '<th class="sx">Tipologia</th>' : '') + (pat ? '<th class="sx">Patenti</th>' : '')
    + '<th class="sx">Giorni e servizi</th>' + (es ? '<th class="sx">Esigenze</th>' : '') + (art ? '<th>Art. 39</th>' : '') + '<th>Ore</th><th>Presente</th><th></th></tr></thead><tbody>'
    + righe.map(r => {
      const v = evVol(r.volontario_id) || {}, manca = evMancanti(r);
      const sotto = [r.ruolo, evAtt('note') ? r.note : ''].filter(Boolean).join(' · ');
      return '<tr><td class="sx"><b>' + aggEsc(nome(r)) + '</b>' + (sotto ? '<div class="sub">' + aggEsc(sotto) + '</div>' : '') + (manca.length ? '<div class="sub bad">' + aggEsc(manca.join(' · ')) + '</div>' : '') + '</td>'
        + (cel ? '<td class="sx">' + aggEsc(v.telefono || '—') + '</td>' : '') + (tip ? '<td class="sx">' + aggEsc(r.tipologia || '—') + '</td>' : '') + (pat ? '<td class="sx">' + aggEsc(v.patenti || '—') + '</td>' : '')
        + '<td class="sx">' + aggEsc(evDescriviServizi(r)) + '</td>' + (es ? '<td class="sx">' + aggEsc(evTestoEsigenzePersona(r)) + '</td>' : '') + (art ? '<td>' + (r.art39 ? 'Sì' : '—') + '</td>' : '')
        + '<td>' + (r.ore != null ? evOre(r) : '—') + '</td><td>' + (r.presente !== false ? 'Sì' : '<span class="pill p-grey">Assente</span>') + '</td>'
        + '<td class="ev-az"><button class="btn sm" onclick="evApriVol(' + r.id + ')">Modifica</button><button class="btn sm danger" onclick="evTogliVol(' + r.id + ')">Elimina</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}

let evFormVol = null;   // { id, volontario_id }

function evRigheGiorniForm(r) {
  const orari = evAtt('orari'), serv = evAtt('servizi');
  return '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Giorno</th><th>Disponibile</th>' + (orari ? '<th>Orario (facoltativo)</th>' : '') + (serv ? EV_SERVIZI.map(s => '<th>' + s[1] + '</th>').join('') : '') + '</tr></thead><tbody>'
    + evGiorni(evCorrente.e).map(g => {
      const d = (r && evDisp(r.id, g)) || null;
      return '<tr><td class="sx">' + aggEsc(evGiornoBreve(g)) + '</td><td><input type="checkbox" id="evFg_' + g + '_disp" aria-label="Disponibile"' + (d ? ' checked' : '') + ' onchange="evFormDisp(\'' + g + '\',this.checked)"></td>'
        + (orari ? '<td><span class="ev-orari"><input type="time" id="evFg_' + g + '_dalle" aria-label="Dalle" value="' + evOraBreve(d && d.ora_dalle) + '"><input type="time" id="evFg_' + g + '_alle" aria-label="Alle" value="' + evOraBreve(d && d.ora_alle) + '"></span></td>' : '')
        + (serv ? EV_SERVIZI.map(s => '<td><input type="checkbox" id="evFg_' + g + '_' + s[0] + '" aria-label="' + s[1] + '"' + (d && d[s[0]] ? ' checked' : '') + ' onchange="evFormServizio(\'' + g + '\',\'' + s[0] + '\',this.checked)"></td>').join('') : '') + '</tr>';
    }).join('') + '</tbody></table></div>'
    + (orari ? '<p class="sub mt6">Orario vuoto = giornata intera.</p>' : '')
    + (serv ? '<p class="sub mt6">Spuntando il pernotto, la colazione del mattino dopo si spunta da sola (modificabile).</p>' : '');
}

function evFormDisp(g, si) {
  if (si) return;
  EV_SERVIZI.forEach(s => { const b = evEl('evFg_' + g + '_' + s[0]); if (b) b.checked = false; });
}

function evFormServizio(g, servizio, si) {
  if (!si) return;
  evEl('evFg_' + g + '_disp').checked = true;
  const domani = evEl('evFg_' + evPiuUno(g) + '_colazione');
  if (servizio === 'pernotto' && domani) { domani.checked = true; evEl('evFg_' + evPiuUno(g) + '_disp').checked = true; }
}

// Giornate spuntate nella form: Map giorno → campi, oppure un errore
function evLeggiGiorniForm() {
  const giorni = new Map(), orari = evAtt('orari'), serv = evAtt('servizi');
  for (const g of evGiorni(evCorrente.e)) {
    if (!evEl('evFg_' + g + '_disp').checked) continue;
    const campi = {};
    if (serv) EV_SERVIZI.forEach(s => { campi[s[0]] = evEl('evFg_' + g + '_' + s[0]).checked; });
    if (orari) {
      const dalle = evEl('evFg_' + g + '_dalle').value, alle = evEl('evFg_' + g + '_alle').value;
      if (!!dalle !== !!alle) return { errore: evGiornoBreve(g) + ': indica entrambi gli orari.' };
      if (dalle && dalle === alle) return { errore: evGiornoBreve(g) + ': i due orari devono essere diversi.' };
      if (!dalle && evObb('orari')) return { errore: evGiornoBreve(g) + ': l\'orario è obbligatorio.' };
      campi.ora_dalle = dalle || null;
      campi.ora_alle = alle || null;
    }
    giorni.set(g, campi);
  }
  if (evObb('servizi') && !giorni.size) return { errore: 'Indica almeno una giornata.' };
  return { giorni };
}

function evApriVol(id) {
  const c = evCorrente, r = id ? c.squadra.find(x => x.id === id) : null;
  if (id && !r) return;
  evFormVol = { id: id || null, volontario_id: r ? r.volontario_id : null };
  const tip = c.tipologie.filter(t => t.attiva || (r && t.nome === r.tipologia));
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Volontario"><div class="shead"><h2>' + (r ? aggEsc(evNomeVol(r.volontario_id)) : 'Aggiungi volontario') + '</h2><button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="evVolErr"></div>'
    + (r ? '' : '<label>Volontario<input type="search" id="evVolCerca" placeholder="Cerca per cognome o squadra" autocomplete="off" oninput="evRenderCercaVol()"></label><div id="evVolRisultati"></div>')
    + '<div class="row2"><label>Ruolo<input id="evVolRuolo" value="' + aggEsc(r ? r.ruolo || '' : '') + '"></label><label>Ore<input type="number" min="0" step="1" id="evVolOre" value="' + aggEsc(r && r.ore != null ? evOre(r) : '') + '"></label></div>'
    + '<label class="perm-check"><input type="checkbox" id="evVolPresente"' + (!r || r.presente !== false ? ' checked' : '') + '> Presente</label>'
    + (evAtt('tipologia') ? '<label>Tipologia<select id="evVolTip"><option value="">—</option>' + tip.map(t => '<option' + (r && t.nome === r.tipologia ? ' selected' : '') + '>' + aggEsc(t.nome) + '</option>').join('') + '</select></label>' : '')
    + '<div class="grp">Giorni' + (evAtt('servizi') ? ' e servizi' : '') + '</div>' + evRigheGiorniForm(r)
    + (evAtt('art39') ? '<label class="perm-check mt10"><input type="checkbox" id="evVolArt"' + (r && r.art39 ? ' checked' : '') + '> Chiede art. 39</label>' : '')
    + (evAtt('esigenze') ? '<div class="grp">Esigenze alimentari</div>' + evCheckEsigenze('evVolEs_', r ? r.esigenze : []) + '<label>Nota esigenze<input id="evVolNota" value="' + aggEsc(r ? r.esigenze_nota || '' : '') + '"></label>' : '')
    + (evAtt('note') ? '<label>Note<textarea id="evVolNote" rows="2">' + aggEsc(r ? r.note || '' : '') + '</textarea></label>' : '')
    + '<div class="actions"><button class="btn" onclick="evChiudiForm()">Annulla</button><button class="btn pri" id="evVolBtn" onclick="evSalvaVol()">Salva</button></div></div></div>';
  ov.hidden = false;
}

function evRenderCercaVol() {
  const q = evEl('evVolCerca').value.toLowerCase().trim(), box = evEl('evVolRisultati');
  evFormVol.volontario_id = null;
  if (!q) { box.innerHTML = ''; return; }
  const presi = new Set(evCorrente.squadra.map(r => r.volontario_id));
  const trovati = evVolontari.filter(v => v.stato !== 'DIMESSO' && !presi.has(v.id) && (v.cognome + ' ' + v.nome + ' ' + (v.squadra || '')).toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = trovati.length ? trovati.map(v => '<div class="lr clk" onclick="evSceltoVol(' + v.id + ')"><div class="mid"><b>' + aggEsc(v.cognome + ' ' + v.nome) + '</b><span class="sub">' + aggEsc(v.squadra || '') + '</span></div></div>').join('')
    : '<p class="note">Nessun volontario trovato.</p>';
}

function evSceltoVol(id) {
  evFormVol.volontario_id = id;
  evEl('evVolCerca').value = evNomeVol(id);
  evEl('evVolRisultati').innerHTML = '';
}

async function evSalvaVol() {
  const err = evEl('evVolErr'), btn = evEl('evVolBtn');
  const errore = t => { err.textContent = t; err.style.display = 'block'; };
  if (!evFormVol.volontario_id) return errore('Scegli un volontario dall\'elenco.');
  const ore = evEl('evVolOre').value;
  const d = {
    volontario_id: evFormVol.volontario_id, ruolo: evEl('evVolRuolo').value.trim() || null,
    ore: ore === '' ? null : Math.max(0, Math.round(Number(ore))), presente: evEl('evVolPresente').checked,
  };
  if (evAtt('tipologia')) d.tipologia = evEl('evVolTip').value || null;
  if (evAtt('art39')) d.art39 = evEl('evVolArt').checked;
  if (evAtt('esigenze')) { d.esigenze = evLeggiEsigenze('evVolEs_'); d.esigenze_nota = evEl('evVolNota').value.trim() || null; }
  if (evAtt('note')) d.note = evEl('evVolNote').value.trim() || null;
  const esiste = evCorrente.squadra.find(x => x.id === evFormVol.id) || {};
  const errori = evValidaVol(Object.assign({}, esiste, d));
  if (errori.length) return errore(errori.join(' · '));
  const { giorni, errore: errGiorni } = evLeggiGiorniForm();
  if (errGiorni) return errore(errGiorni);
  btn.disabled = true;
  try {
    await evSalvaVolontario(d, giorni);
    evChiudiForm();
    evRender();
  } catch(e) { btn.disabled = false; errore(e.message); }
}

async function evTogliVol(id) {
  const c = evCorrente, r = c.squadra.find(x => x.id === id);
  if (!confirm('Eliminare ' + evNomeVol(r.volontario_id) + ' dall\'evento, con i suoi giorni e servizi?')) return;
  try {
    await sbFetch(SUPA_URL + '/rest/v1/evento_disponibilita?evento_volontario_id=eq.' + id, { method: 'DELETE', headers: H, silenzioso: true });
    await evScrivi('DELETE', 'evento_volontari?id=eq.' + id);
    c.squadra = c.squadra.filter(x => x.id !== id);
    c.disp = c.disp.filter(d => d.evento_volontario_id !== id);
    await logAttivita('ha tolto ' + evNomeVol(r.volontario_id) + ' dall\'evento: ' + c.e.titolo);
    evRender();
  } catch(e) { sbAvviso('Volontario non tolto.'); }
}

// -- MEZZI E MATERIALI --
function evMezzoAnagrafica(m) { return m.mezzo_id ? evCorrente.parco.find(x => x.id === m.mezzo_id) || null : null; }
function evMezzoNome(m) { const a = evMezzoAnagrafica(m); return m.tipo || (a ? a.automezzo : 'Mezzo ' + m.mezzo_id); }
function evMezzoTarga(m) { const a = evMezzoAnagrafica(m); return m.targa || (a && a.targa) || ''; }
// Elenco vuoto = tutti i giorni: vale anche per i mezzi aggiunti prima che ci fossero i giorni
function evMezzoNelGiorno(m, g) { return !(m.giorni || []).length || m.giorni.map(evGiorno).includes(g); }
function evGiorniMezzo(m) {
  const giorni = evGiorni(evCorrente.e), suoi = giorni.filter(g => evMezzoNelGiorno(m, g));
  return suoi.length === giorni.length ? 'Tutti i giorni' : suoi.map(evGiornoBreve).join(', ') || '—';
}

function evRenderMezzi() {
  const c = evCorrente;
  evEl('evScheda').innerHTML = '<div class="bar"><h2>Mezzi (' + c.mezzi.length + ')</h2><span class="grow"></span><button class="btn sm pri" onclick="evApriMezzo()">Aggiungi mezzo</button></div>'
    + (!c.mezzi.length ? '<div class="empty">Nessun mezzo indicato.</div>' : '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Mezzo</th><th class="sx">Targa</th><th class="sx">Disponibile</th><th class="sx">Note</th><th></th></tr></thead><tbody>'
      + c.mezzi.map(m => '<tr><td class="sx"><b>' + aggEsc(evMezzoNome(m)) + '</b></td><td class="sx">' + aggEsc(evMezzoTarga(m) || '—') + '</td><td class="sx">' + aggEsc(evGiorniMezzo(m)) + '</td><td class="sx">' + aggEsc(m.note || '—') + '</td>'
        + '<td class="ev-az"><button class="btn sm" onclick="evApriMezzo(' + m.id + ')">Modifica</button><button class="btn sm danger" onclick="evTogliMezzo(' + m.id + ')">Elimina</button></td></tr>').join('') + '</tbody></table></div>')
    + '<div class="bar mt14"><h2>Materiali (' + c.materiali.length + ')</h2><span class="grow"></span><button class="btn sm pri" onclick="evApriMateriale()">Aggiungi materiale</button></div>'
    + (!c.materiali.length ? '<div class="empty">Nessun materiale indicato.</div>' : '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th>Quantità</th><th class="sx">Descrizione</th><th class="sx">Note</th><th></th></tr></thead><tbody>'
      + c.materiali.map(m => '<tr><td>' + m.quantita + '</td><td class="sx"><b>' + aggEsc(m.descrizione) + '</b></td><td class="sx">' + aggEsc(m.note || '—') + '</td>'
        + '<td class="ev-az"><button class="btn sm" onclick="evApriMateriale(' + m.id + ')">Modifica</button><button class="btn sm danger" onclick="evTogliMateriale(' + m.id + ')">Elimina</button></td></tr>').join('') + '</tbody></table></div>');
}

function evApriMezzo(id) {
  const c = evCorrente, m = id ? c.mezzi.find(x => x.id === id) : null;
  const presi = new Set(c.mezzi.filter(x => x !== m).map(x => x.mezzo_id).filter(Boolean));
  const liberi = c.parco.filter(x => !presi.has(x.id));
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Mezzo"><div class="shead"><h2>' + (m ? 'Modifica mezzo' : 'Aggiungi mezzo') + '</h2><button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="evMezzoErr"></div>'
    + (c.parcoOk ? '<label>Dall\'anagrafica<select id="evMezzoSel" onchange="evMezzoScelto()"><option value="">— inserisci a mano —</option>'
      + liberi.map(x => '<option value="' + x.id + '"' + (m && m.mezzo_id === x.id ? ' selected' : '') + '>' + aggEsc(x.automezzo + (x.targa ? ' · ' + x.targa : '')) + '</option>').join('') + '</select></label>' : '')
    + '<div class="row2"><label>Tipo<input id="evMezzoTipo" value="' + aggEsc(m ? evMezzoNome(m) : '') + '"></label><label>Targa<input id="evMezzoTargaC" class="upper" maxlength="15" value="' + aggEsc(m ? evMezzoTarga(m) : '') + '"></label></div>'
    + '<div class="grp">Giorni</div><div class="perm-grid">' + evGiorni(c.e).map(g => '<label class="perm-check"><input type="checkbox" id="evMg_' + g + '"' + (!m || evMezzoNelGiorno(m, g) ? ' checked' : '') + '> ' + aggEsc(evGiornoBreve(g)) + '</label>').join('') + '</div>'
    + '<label>Note<input id="evMezzoNote" value="' + aggEsc(m ? m.note || '' : '') + '"></label>'
    + '<div class="actions"><button class="btn" onclick="evChiudiForm()">Annulla</button><button class="btn pri" id="evMezzoBtn" onclick="evSalvaMezzo(' + (m ? m.id : 'null') + ')">Salva</button></div></div></div>';
  ov.hidden = false;
}

function evMezzoScelto() {
  const m = evCorrente.parco.find(x => x.id === Number(evEl('evMezzoSel').value));
  evEl('evMezzoTipo').value = m ? m.automezzo : '';
  evEl('evMezzoTargaC').value = m ? m.targa || '' : '';
}

async function evSalvaMezzo(id) {
  const c = evCorrente, err = evEl('evMezzoErr'), btn = evEl('evMezzoBtn'), sel = evEl('evMezzoSel');
  const errore = t => { err.textContent = t; err.style.display = 'block'; };
  const tipo = evEl('evMezzoTipo').value.trim(), giorni = evGiorni(c.e).filter(g => evEl('evMg_' + g).checked);
  if (!tipo) return errore('Indica il tipo di mezzo.');
  if (!giorni.length) return errore('Indica almeno un giorno.');
  const corpo = { mezzo_id: sel && sel.value ? Number(sel.value) : null, tipo, targa: evEl('evMezzoTargaC').value.trim().toUpperCase() || null, giorni, note: evEl('evMezzoNote').value.trim() || null };
  btn.disabled = true;
  try {
    const [riga] = id ? await evScrivi('PATCH', 'evento_mezzi?id=eq.' + id, corpo) : await evScrivi('POST', 'evento_mezzi', Object.assign({ evento_id: c.e.id }, corpo));
    if (id) Object.assign(c.mezzi.find(x => x.id === id), riga); else c.mezzi.push(riga);
    await logAttivita((id ? 'ha modificato ' : 'ha aggiunto ') + tipo + ' nell\'evento: ' + c.e.titolo);
    evChiudiForm();
    evRender();
  } catch(e) { btn.disabled = false; errore(e.message); }
}

async function evTogliMezzo(id) {
  const m = evCorrente.mezzi.find(x => x.id === id);
  if (!confirm('Eliminare ' + evMezzoNome(m) + ' dall\'evento?')) return;
  try {
    await evScrivi('DELETE', 'evento_mezzi?id=eq.' + id);
    evCorrente.mezzi = evCorrente.mezzi.filter(r => r.id !== id);
    await logAttivita('ha tolto ' + evMezzoNome(m) + ' dall\'evento: ' + evCorrente.e.titolo);
    evRender();
  } catch(e) { sbAvviso('Mezzo non tolto.'); }
}

function evApriMateriale(id) {
  const m = id ? evCorrente.materiali.find(x => x.id === id) : null;
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Materiale"><div class="shead"><h2>' + (m ? 'Modifica materiale' : 'Aggiungi materiale') + '</h2><button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="evMatErr"></div><div class="row2"><label>Quantità<input type="number" min="1" step="1" id="evMatQta" value="' + (m ? m.quantita : 1) + '"></label><label>Descrizione<input id="evMatDesc" value="' + aggEsc(m ? m.descrizione : '') + '"></label></div>'
    + '<label>Note<input id="evMatNote" value="' + aggEsc(m ? m.note || '' : '') + '"></label>'
    + '<div class="actions"><button class="btn" onclick="evChiudiForm()">Annulla</button><button class="btn pri" id="evMatBtn" onclick="evSalvaMateriale(' + (m ? m.id : 'null') + ')">Salva</button></div></div></div>';
  ov.hidden = false;
}

async function evSalvaMateriale(id) {
  const c = evCorrente, err = evEl('evMatErr'), btn = evEl('evMatBtn');
  const errore = t => { err.textContent = t; err.style.display = 'block'; };
  const quantita = Math.round(Number(evEl('evMatQta').value)), descrizione = evEl('evMatDesc').value.trim();
  if (!(quantita >= 1) || !descrizione) return errore('Indica quantità e descrizione.');
  const corpo = { quantita, descrizione, note: evEl('evMatNote').value.trim() || null };
  btn.disabled = true;
  try {
    const [riga] = id ? await evScrivi('PATCH', 'evento_materiali?id=eq.' + id, corpo) : await evScrivi('POST', 'evento_materiali', Object.assign({ evento_id: c.e.id }, corpo));
    if (id) Object.assign(c.materiali.find(x => x.id === id), riga); else c.materiali.push(riga);
    await logAttivita((id ? 'ha modificato' : 'ha aggiunto') + ' materiale nell\'evento: ' + c.e.titolo);
    evChiudiForm();
    evRender();
  } catch(e) { btn.disabled = false; errore(e.message); }
}

async function evTogliMateriale(id) {
  const m = evCorrente.materiali.find(x => x.id === id);
  if (!confirm('Eliminare "' + m.descrizione + '"?')) return;
  try {
    await evScrivi('DELETE', 'evento_materiali?id=eq.' + id);
    evCorrente.materiali = evCorrente.materiali.filter(r => r.id !== id);
    await logAttivita('ha tolto materiale dall\'evento: ' + evCorrente.e.titolo);
    evRender();
  } catch(e) { sbAvviso('Materiale non tolto.'); }
}

// -- CUCINA --
// Una riga per giorno e servizio: volontari + ospiti + extra, esigenze e nomi di quelle con nota
function evCalcolaCucina() {
  const c = evCorrente, disp = evDispValide();
  const conNota = c.esigenze.filter(x => x.con_nota).map(x => x.nome);
  const squadra = id => c.squadra.find(r => r.id === id);
  const righe = [];
  evGiorni(c.e).forEach(g => EV_SERVIZI.forEach(([tipo]) => {
    const persone = [];
    if (evAtt('servizi')) disp.filter(d => evGiorno(d.giorno) === g && d[tipo]).forEach(d => {
      const r = squadra(d.evento_volontario_id);
      persone.push({ nome: evNomeVol(r.volontario_id), esigenze: evAtt('esigenze') ? r.esigenze || [] : [], nota: r.esigenze_nota, tipo: 'volontario' });
    });
    const nVol = persone.length;
    c.ospitiServizi.filter(s => evGiorno(s.giorno) === g && s[tipo]).forEach(s => {
      const o = c.ospiti.find(x => x.id === s.ospite_id);
      if (o) persone.push({ nome: o.nome, esigenze: o.esigenze || [], nota: o.esigenze_nota, tipo: 'ospite' });
    });
    const extra = c.extra.filter(x => evGiorno(x.giorno) === g && x.servizio === tipo).reduce((t, x) => t + x.quantita, 0);
    const esigenze = {};
    persone.forEach(p => p.esigenze.forEach(n => { esigenze[n] = (esigenze[n] || 0) + 1; }));
    righe.push({ giorno: g, tipo, volontari: nVol, ospiti: persone.length - nVol, extra, totale: persone.length + extra, esigenze,
      conNota: persone.filter(p => p.esigenze.some(n => conNota.includes(n))) });
  }));
  return righe;
}

function evTestoEsigenze(r) {
  return Object.entries(r.esigenze).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(' · ');
}
function evTestoConNota(p) { return p.nome + (p.tipo === 'ospite' ? ' (ospite)' : '') + ': ' + p.esigenze.join(', ') + (p.nota ? ' – ' + p.nota : ''); }
function evTitoloGiorno(g) { return new Date(g + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

function evTabellaCucina(righe, stampa) {
  const lab = Object.fromEntries(EV_SERVIZI.map(s => [s[0], s[1]]));
  return [...new Set(righe.map(r => r.giorno))].map(g => '<h3' + (stampa ? '' : ' class="grp"') + '>' + aggEsc(evTitoloGiorno(g)) + '</h3>'
    + (stampa ? '' : '<div class="ev-scorri">') + '<table' + (stampa ? '' : ' class="ev-tab"') + '><thead><tr><th>Servizio</th><th>Volontari</th><th>Ospiti</th><th>Extra</th><th>Totale</th><th>Esigenze alimentari</th></tr></thead><tbody>'
    + righe.filter(r => r.giorno === g).map(r => '<tr><td class="sx"><b>' + lab[r.tipo] + '</b></td><td>' + r.volontari + '</td><td>' + r.ospiti + '</td><td>'
      + (stampa ? r.extra : '<input class="ev-extra" type="number" min="0" step="1" aria-label="Extra" value="' + r.extra + '" onchange="evSalvaExtra(\'' + g + '\',\'' + r.tipo + '\',this.value)">')
      + '</td><td><b>' + r.totale + '</b>' + (r.tipo === 'pernotto' ? ' posti letto' : '') + '</td><td class="sx">' + (r.tipo === 'pernotto' ? '—' : aggEsc(evTestoEsigenze(r) || '—')) + '</td></tr>'
      + (r.tipo !== 'pernotto' && r.conNota.length ? '<tr><td></td><td class="sx" colspan="5">' + r.conNota.map(p => '⚠ ' + aggEsc(evTestoConNota(p))).join('<br>') + '</td></tr>' : '')).join('')
    + '</tbody></table>' + (stampa ? '' : '</div>')).join('');
}

function evRenderCucina() {
  evEl('evScheda').innerHTML = '<div class="bar"><p class="sub">Totali per servizio: volontari + ospiti + extra. I nomi compaiono solo per le esigenze da segnalare.</p><span class="grow"></span><button class="btn sm" onclick="evStampaCucina()">Stampa cucina</button></div>'
    + evTabellaCucina(evCalcolaCucina(), false);
}

function evRenderOspiti() {
  const c = evCorrente;
  evEl('evScheda').innerHTML = '<div class="bar"><p class="sub">Persone esterne che usufruiscono di pasti o pernotti. Vengono conteggiate in cucina.</p><span class="grow"></span><button class="btn sm pri" onclick="evApriOspite()">Aggiungi ospite</button></div>'
    + (!c.ospiti.length ? '<div class="empty">Nessun ospite.</div>' : '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Nome</th><th class="sx">Giorni e servizi</th><th class="sx">Esigenze alimentari</th><th class="sx">Note</th><th></th></tr></thead><tbody>'
      + c.ospiti.map(o => {
        const serv = c.ospitiServizi.filter(s => s.ospite_id === o.id).sort((a, b) => evGiorno(a.giorno).localeCompare(evGiorno(b.giorno))).map(s => evGiornoBreve(evGiorno(s.giorno)) + ' ' + EV_SERVIZI.filter(x => s[x[0]]).map(x => x[2]).join(' ')).join(', ');
        return '<tr><td class="sx"><b>' + aggEsc(o.nome) + '</b></td><td class="sx">' + aggEsc(serv || '—') + '</td><td class="sx">' + aggEsc(evTestoEsigenzePersona(o)) + '</td><td class="sx">' + aggEsc(o.note || '—') + '</td>'
          + '<td class="ev-az"><button class="btn sm" onclick="evApriOspite(' + o.id + ')">Modifica</button><button class="btn sm danger" onclick="evEliminaOspite(' + o.id + ')">Elimina</button></td></tr>';
      }).join('') + '</tbody></table></div>');
}

function evTestoEsigenzePersona(p) {
  return (p.esigenze || []).join(', ') + (p.esigenze_nota ? ' – ' + p.esigenze_nota : '') || '—';
}

async function evSalvaExtra(g, servizio, valore) {
  const c = evCorrente, q = Math.max(0, Math.round(Number(valore) || 0));
  const righe = c.extra.filter(x => evGiorno(x.giorno) === g && x.servizio === servizio);
  try {
    if (q && righe[0]) {
      const [riga] = await evScrivi('PATCH', 'evento_extra?id=eq.' + righe[0].id, { quantita: q });
      Object.assign(righe[0], riga);
      for (const x of righe.slice(1)) { await evScrivi('DELETE', 'evento_extra?id=eq.' + x.id); c.extra = c.extra.filter(y => y.id !== x.id); }
    } else if (q) {
      const [riga] = await evScrivi('POST', 'evento_extra', { evento_id: c.e.id, giorno: g, servizio, quantita: q });
      c.extra.push(riga);
    } else {
      for (const x of righe) { await evScrivi('DELETE', 'evento_extra?id=eq.' + x.id); c.extra = c.extra.filter(y => y.id !== x.id); }
    }
    await logAttivita('ha modificato gli extra di cucina dell\'evento: ' + c.e.titolo);
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  evRenderCucina();
}

function evApriOspite(id) {
  const c = evCorrente, o = id ? c.ospiti.find(x => x.id === id) : null;
  const serv = g => (o ? c.ospitiServizi.find(s => s.ospite_id === o.id && evGiorno(s.giorno) === g) : null) || {};
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Ospite"><div class="shead"><h2>' + (o ? 'Modifica ospite' : 'Nuovo ospite') + '</h2><button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="evOspErr"></div><label>Nome<input id="evOspNome" value="' + aggEsc(o ? o.nome : '') + '"></label>'
    + '<div class="grp">Giorni e servizi</div><p class="sub">Spuntando il pernotto, la colazione del mattino dopo si spunta da sola (modificabile).</p><div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Giorno</th>' + EV_SERVIZI.map(s => '<th>' + s[1] + '</th>').join('') + '</tr></thead><tbody>'
    + evGiorni(c.e).map(g => '<tr><td class="sx">' + aggEsc(evGiornoBreve(g)) + '</td>' + EV_SERVIZI.map(s => '<td><input type="checkbox" aria-label="' + s[1] + '" id="evOsp_' + g + '_' + s[0] + '"' + (serv(g)[s[0]] ? ' checked' : '') + (s[0] === 'pernotto' ? ' onchange="evOspitePernotto(\'' + g + '\',this)"' : '') + '></td>').join('') + '</tr>').join('')
    + '</tbody></table></div><div class="grp">Esigenze alimentari</div>' + evCheckEsigenze('evOspEs_', o ? o.esigenze : [])
    + '<label>Nota esigenze<input id="evOspNota" value="' + aggEsc(o ? o.esigenze_nota || '' : '') + '"></label><label>Note<input id="evOspNote" value="' + aggEsc(o ? o.note || '' : '') + '"></label>'
    + '<div class="actions"><button class="btn" onclick="evChiudiForm()">Annulla</button><button class="btn pri" id="evOspBtn" onclick="evSalvaOspite(' + (o ? o.id : 'null') + ')">Salva</button></div></div></div>';
  ov.hidden = false;
}

function evOspitePernotto(g, box) {
  const dopo = evEl('evOsp_' + evPiuUno(g) + '_colazione');
  if (box.checked && dopo) dopo.checked = true;
}

async function evSalvaOspite(id) {
  const c = evCorrente, err = evEl('evOspErr'), btn = evEl('evOspBtn');
  const nome = evEl('evOspNome').value.trim(), esigenze = evLeggiEsigenze('evOspEs_'), nota = evEl('evOspNota').value.trim();
  const errore = t => { err.textContent = t; err.style.display = 'block'; };
  if (!nome) return errore('Il nome è obbligatorio.');
  const conNota = c.esigenze.filter(x => x.con_nota).map(x => x.nome);
  if (esigenze.some(x => conNota.includes(x)) && !nota) return errore('Descrivi l\'esigenza alimentare nella nota.');
  btn.disabled = true;
  try {
    const corpo = { nome, esigenze, esigenze_nota: nota || null, note: evEl('evOspNote').value.trim() || null };
    const [riga] = id ? await evScrivi('PATCH', 'evento_ospiti?id=eq.' + id, corpo) : await evScrivi('POST', 'evento_ospiti', Object.assign({ evento_id: c.e.id }, corpo));
    if (id) Object.assign(c.ospiti.find(x => x.id === id), riga); else c.ospiti.push(riga);
    for (const g of evGiorni(c.e)) {
      const voluti = Object.fromEntries(EV_SERVIZI.map(s => [s[0], evEl('evOsp_' + g + '_' + s[0]).checked]));
      const ha = c.ospitiServizi.find(s => s.ospite_id === riga.id && evGiorno(s.giorno) === g);
      if (Object.values(voluti).some(Boolean)) {
        const [s] = ha ? await evScrivi('PATCH', 'evento_ospiti_servizi?id=eq.' + ha.id, voluti) : await evScrivi('POST', 'evento_ospiti_servizi', Object.assign({ ospite_id: riga.id, giorno: g }, voluti));
        if (ha) Object.assign(ha, s); else c.ospitiServizi.push(s);
      } else if (ha) {
        await evScrivi('DELETE', 'evento_ospiti_servizi?id=eq.' + ha.id);
        c.ospitiServizi = c.ospitiServizi.filter(x => x.id !== ha.id);
      }
    }
    await logAttivita((id ? 'ha modificato' : 'ha aggiunto') + ' l\'ospite ' + nome + ' nell\'evento: ' + c.e.titolo);
    evChiudiForm();
    evRender();
  } catch(e) { btn.disabled = false; errore(e.message); }
}

async function evEliminaOspite(id) {
  const c = evCorrente, o = c.ospiti.find(x => x.id === id);
  if (!confirm('Eliminare l\'ospite ' + o.nome + '?')) return;
  try {
    await sbFetch(SUPA_URL + '/rest/v1/evento_ospiti_servizi?ospite_id=eq.' + id, { method: 'DELETE', headers: H, silenzioso: true });
    await evScrivi('DELETE', 'evento_ospiti?id=eq.' + id);
    c.ospiti = c.ospiti.filter(x => x.id !== id);
    c.ospitiServizi = c.ospitiServizi.filter(x => x.ospite_id !== id);
    await logAttivita('ha eliminato l\'ospite ' + o.nome + ' dall\'evento: ' + c.e.titolo);
    evRender();
  } catch(e) { sbAvviso('Eliminazione non riuscita.'); }
}

function evStampaCucina() {
  const e = evCorrente.e, finestra = window.open('', '_blank');
  if (!finestra) { sbAvviso('Il browser ha bloccato la finestra di stampa.'); return; }
  finestra.document.write('<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Cucina - ' + aggEsc(e.titolo) + '</title><style>'
    + '@page{size:A4;margin:14mm}body{font:11.5pt Arial,Helvetica,sans-serif;color:#111}h1{font-size:16pt;margin:0 0 2px}.sub{font-size:10pt;color:#555;margin-bottom:12px}'
    + 'h3{font-size:12.5pt;margin:16px 0 6px;text-transform:capitalize;border-bottom:1.5px solid #333;padding-bottom:2px}table{width:100%;border-collapse:collapse;page-break-inside:avoid}'
    + 'th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee;font-size:10pt}td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center}td[colspan]{text-align:left!important}'
    + '</style></head><body><h1>Cucina - ' + aggEsc(e.titolo) + '</h1><div class="sub">' + aggEsc([evDate(e), e.luogo, 'stampato il ' + new Date().toLocaleString('it-IT')].filter(Boolean).join(' · ')) + '</div>'
    + evTabellaCucina(evCalcolaCucina(), true) + '</body></html>');
  finestra.document.close();
  finestra.focus();
  finestra.print();
}

// -- RIEPILOGO --
function evConteggi(obj) { return Object.entries(obj).filter(([k]) => k).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(' · '); }

function evCalcolaGiorni() {
  const c = evCorrente, disp = evDispValide(), cucina = evCalcolaCucina();
  return evGiorni(c.e).map(g => {
    const delGiorno = disp.filter(d => evGiorno(d.giorno) === g), fasce = {}, tipologie = {}, patenti = {};
    delGiorno.forEach(d => {
      const r = c.squadra.find(x => x.id === d.evento_volontario_id);
      if (d.ora_dalle) { const k = evFascia(d); fasce[k] = (fasce[k] || 0) + 1; }
      const t = r.tipologia || ''; tipologie[t] = (tipologie[t] || 0) + 1;
      evPatentiDi(r).forEach(p => { patenti[p] = (patenti[p] || 0) + 1; });
    });
    const serv = cucina.filter(r => r.giorno === g), conOrario = delGiorno.filter(d => d.ora_dalle).length;
    return { giorno: g, volontari: delGiorno.length, intera: delGiorno.length - conOrario, conOrario, fasce, tipologie, patenti,
      mezzi: c.mezzi.filter(m => evMezzoNelGiorno(m, g)).length,
      pasti: serv.filter(r => EV_PASTI.includes(r.tipo)).reduce((t, r) => t + r.totale, 0),
      pernotti: serv.filter(r => r.tipo === 'pernotto').reduce((t, r) => t + r.totale, 0) };
  });
}

// Le tipologie della lista più quelle già usate e poi tolte
function evTipologieUsate(giorni) {
  return [...new Set([...evCorrente.tipologie.filter(t => t.attiva).map(t => t.nome), ...giorni.flatMap(g => Object.keys(g.tipologie).filter(Boolean))])];
}

// Come barreEsercitazione del Polo
function evBarre(righe) {
  if (!righe.length) return '<div class="empty">Nessun dato.</div>';
  const max = Math.max(1, ...righe.map(r => r.n));
  return '<div class="ev-barre">' + righe.map(r => '<div class="ev-barra"><span>' + aggEsc(r.nome) + '</span><i><b style="width:' + Math.round(r.n / max * 100) + '%"></b></i><span>' + r.n + '</span></div>').join('') + '</div>';
}

function evContaDa(valori) {
  const conta = {};
  valori.forEach(v => { conta[v] = (conta[v] || 0) + 1; });
  return Object.entries(conta).map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

function evRenderRiepilogo() {
  const c = evCorrente, giorni = evCalcolaGiorni(), cucina = evCalcolaCucina(), presenti = evPresenti();
  const tipologie = evAtt('tipologia') ? evTipologieUsate(giorni) : [];
  const conOrari = evAtt('orari'), conPat = evAtt('patenti'), conPasti = evConPasti();
  const senzaTip = evAtt('tipologia') && giorni.some(g => g.tipologie['']);
  const disponibili = new Set(evDispValide().map(d => d.evento_volontario_id)).size;
  const box = (n, l) => '<div class="card"><b class="ev-num">' + n + '</b><span class="sub">' + l + '</span></div>';
  const pasti = giorni.reduce((t, g) => t + g.pasti, 0), pernotti = giorni.reduce((t, g) => t + g.pernotti, 0);
  const lab = t => EV_SERVIZI.find(s => s[0] === t)[1];
  const cella = (g, t) => cucina.find(r => r.giorno === g && r.tipo === t).totale;
  const elenco = evGiorni(c.e);
  const idPresenti = new Set(presenti.map(r => r.volontario_id));
  const patenti = evContaDa(presenti.flatMap(evPatentiDi));
  const abilitazioni = evContaDa(c.abilitazioni.filter(a => idPresenti.has(a.volontario_id)).map(a => a.titolo));
  evEl('evScheda').innerHTML = '<div class="ev-stat mb18">' + box(disponibili, 'Volontari disponibili') + box(c.mezzi.length, 'Mezzi')
    + (evAtt('art39') ? box(presenti.filter(r => r.art39).length, 'Richieste Art. 39') : '')
    + (conPasti ? box(pasti, 'Pasti (con ospiti ed extra)') + box(pernotti, 'Pernotti') + box(Math.max(0, ...giorni.map(g => g.pernotti)), 'Posti letto (notte più piena)') : '') + '</div>'
    + '<div class="grp">Disponibilità per giorno</div><div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Giorno</th><th>Volontari</th>' + (conOrari ? '<th>Giornata intera</th><th>Con orario</th>' : '')
    + tipologie.map(t => '<th>' + aggEsc(t) + '</th>').join('') + (senzaTip ? '<th>Non indicata</th>' : '') + (conPat ? '<th class="sx">Patenti</th>' : '') + '<th>Mezzi</th></tr></thead><tbody>'
    + giorni.map(g => '<tr><td class="sx">' + aggEsc(evGiornoBreve(g.giorno)) + '</td><td><b>' + g.volontari + '</b></td>'
      + (conOrari ? '<td>' + g.intera + '</td><td>' + g.conOrario + (g.conOrario ? '<div class="sub">' + aggEsc(evConteggi(g.fasce)) + '</div>' : '') + '</td>' : '')
      + tipologie.map(t => '<td>' + (g.tipologie[t] || 0) + '</td>').join('') + (senzaTip ? '<td>' + (g.tipologie[''] || 0) + '</td>' : '')
      + (conPat ? '<td class="sx">' + aggEsc(evConteggi(g.patenti) || '—') + '</td>' : '') + '<td>' + g.mezzi + '</td></tr>').join('')
    + '</tbody></table></div>'
    + (c.e.tipo === 'ESERCITAZIONE' && conPasti ? '<div class="grp mt14">Pasti e pernotti per giorno</div><div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Giorno</th>' + EV_SERVIZI.map(s => '<th>' + s[1] + '</th>').join('') + '</tr></thead><tbody>'
      + elenco.map(g => '<tr><td class="sx">' + aggEsc(evGiornoBreve(g)) + '</td>' + EV_SERVIZI.map(s => '<td>' + cella(g, s[0]) + '</td>').join('') + '</tr>').join('')
      + '<tr><td class="sx"><b>Totale</b></td>' + EV_SERVIZI.map(s => '<td><b>' + elenco.reduce((t, g) => t + cella(g, s[0]), 0) + '</b></td>').join('') + '</tr></tbody></table></div>' : '')
    + '<div class="ev-due">' + (conPat ? '<div><div class="grp">Patenti</div>' + evBarre(patenti) + '</div>' : '')
    + (abilitazioni.length ? '<div><div class="grp">Abilitazioni</div>' + evBarre(abilitazioni) + '</div>' : '') + '</div>'
    + (c.disp.length > evDispValide().length ? '<p class="sub mt10">Le righe degli assenti e dei giorni fuori dal periodo non sono conteggiate.</p>' : '');
}

// -- EXCEL --
let evExcelCaricamento = null;
function evCaricaExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (evExcelCaricamento) return evExcelCaricamento;
  evExcelCaricamento = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = EV_EXCELJS;
    s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : ko(new Error('Libreria Excel non disponibile.'));
    s.onerror = () => { evExcelCaricamento = null; ko(new Error('Impossibile caricare la libreria Excel: controlla la connessione.')); };
    document.head.appendChild(s);
  });
  return evExcelCaricamento;
}

function evFoglio(wb, nome, intestazioni, righe, vuoto) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
  if (!righe.length && vuoto) { ws.addRow([vuoto]); return ws; }
  const testa = ws.addRow(intestazioni);
  testa.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  testa.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  testa.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4E89' } }; });
  righe.forEach(r => ws.addRow(r));
  intestazioni.forEach((t, i) => { ws.getColumn(i + 1).width = Math.min(30, Math.max(12, String(t).length + 2)); });
  return ws;
}

// Colonne del foglio Volontari: le stesse si rileggono all'import. { t: titolo, v: valore della riga }
function evDataFoglio(g) { return g.split('-').reverse().join('/'); }
function evColonneVol() {
  const giorni = evGiorni(evCorrente.e);
  const col = [
    { t: 'Cognome', v: r => (evVol(r.volontario_id) || {}).cognome || '' },
    { t: 'Nome', v: r => (evVol(r.volontario_id) || {}).nome || '' },
    { t: 'Codice fiscale', v: r => (evVol(r.volontario_id) || {}).codice_fiscale || '' },
  ];
  if (evAtt('cellulare')) col.push({ t: 'Cellulare', v: r => (evVol(r.volontario_id) || {}).telefono || '' });
  if (evAtt('patenti')) col.push({ t: 'Patenti', v: r => (evVol(r.volontario_id) || {}).patenti || '' });
  if (evAtt('tipologia')) col.push({ t: 'Tipologia', v: r => r.tipologia || '' });
  if (evAtt('art39')) col.push({ t: 'Art. 39', v: r => r.art39 ? 'SI' : '' });
  col.push({ t: 'Ruolo', v: r => r.ruolo || '' }, { t: 'Ore', v: r => r.ore != null ? evOre(r) : '' }, { t: 'Presente', v: r => r.presente !== false ? 'SI' : 'NO' });
  giorni.forEach(g => {
    col.push({ t: evDataFoglio(g) + ' Disponibile', v: r => { const d = evDisp(r.id, g); return d ? evFascia(d) || 'X' : ''; } });
    if (evAtt('servizi')) EV_SERVIZI.forEach(s => col.push({ t: evDataFoglio(g) + ' ' + s[1], v: r => { const d = evDisp(r.id, g); return d && d[s[0]] ? 'X' : ''; } }));
  });
  if (evAtt('esigenze')) col.push({ t: 'Esigenze alimentari', v: r => (r.esigenze || []).join(', ') }, { t: 'Nota esigenze', v: r => r.esigenze_nota || '' });
  if (evAtt('note')) col.push({ t: 'Note', v: r => r.note || '' });
  return col;
}

async function evEsportaExcel() {
  const c = evCorrente;
  try {
    const ExcelJS = await evCaricaExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Protezione Civile ANA Casale Monferrato';
    wb.created = new Date();
    const giorni = evCalcolaGiorni(), tipologie = evAtt('tipologia') ? evTipologieUsate(giorni) : [];
    const cols = evColonneVol();
    evFoglio(wb, 'Volontari', cols.map(x => x.t), c.squadra.map(r => cols.map(x => x.v(r))));
    const orari = evAtt('orari'), pat = evAtt('patenti');
    evFoglio(wb, 'Per giorno',
      ['Giorno', 'Volontari', ...(orari ? ['Giornata intera', 'Con orario', 'Fasce orarie'] : []), ...tipologie, ...(tipologie.length ? ['Tipologia non indicata'] : []), ...(pat ? ['Patenti'] : []), 'Mezzi', 'Pasti', 'Pernotti'],
      giorni.map(g => [evGiornoBreve(g.giorno), g.volontari, ...(orari ? [g.intera, g.conOrario, evConteggi(g.fasce)] : []), ...tipologie.map(t => g.tipologie[t] || 0), ...(tipologie.length ? [g.tipologie[''] || 0] : []), ...(pat ? [evConteggi(g.patenti)] : []), g.mezzi, g.pasti, g.pernotti]));
    evFoglio(wb, 'Mezzi', ['Mezzo', 'Targa', 'Giorni', 'Note'], c.mezzi.map(m => [evMezzoNome(m), evMezzoTarga(m), evGiorniMezzo(m), m.note || '']), 'Nessun mezzo indicato');
    evFoglio(wb, 'Materiali', ['Quantità', 'Descrizione', 'Note'], c.materiali.map(m => [m.quantita, m.descrizione, m.note || '']), 'Nessun materiale indicato');
    const nomi = c.esigenze.map(x => x.nome), lab = Object.fromEntries(EV_SERVIZI.map(s => [s[0], s[1]]));
    evFoglio(wb, 'Cucina', ['Giorno', 'Servizio', 'Volontari', 'Ospiti', 'Extra', 'Totale', ...nomi, 'Da segnalare'],
      evCalcolaCucina().map(r => [evGiornoBreve(r.giorno), lab[r.tipo], r.volontari, r.ospiti, r.extra, r.totale, ...nomi.map(n => r.tipo === 'pernotto' ? '' : r.esigenze[n] || 0), r.tipo === 'pernotto' ? '' : r.conNota.map(evTestoConNota).join('; ')]));
    if (evAtt('art39')) {
      const conArt = evPresenti().filter(r => r.art39), elenco = evGiorni(c.e);
      evFoglio(wb, 'Art. 39', ['Cognome', 'Nome', 'Codice fiscale', 'Giornate'], conArt.map(r => {
        const v = evVol(r.volontario_id) || {};
        return [v.cognome || '', v.nome || '', v.codice_fiscale || '', elenco.filter(g => evDisp(r.id, g)).map(g => evGiornoBreve(g) + (evFascia(evDisp(r.id, g)) ? ' ' + evFascia(evDisp(r.id, g)) : '')).join(', ')];
      }), 'Nessun volontario chiede l\'art. 39');
    }
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = (EV_TIPI[c.e.tipo] || 'Evento') + '_' + c.e.titolo.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60) + '_' + evGiorno(c.e.data_inizio) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch(e) { sbAvviso(e.message || 'Esportazione non riuscita.'); }
}

function evTestoCella(cella) {
  const v = cella ? cella.value : null;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (v instanceof Date) return v.toISOString().slice(11, 16);
  }
  return String(v).trim();
}

function evSiNo(t) {
  const x = String(t || '').trim().toUpperCase().replace('Ì', 'I');
  if (['', 'NO', 'N', '0', 'FALSO', 'FALSE'].includes(x)) return false;
  if (['SI', 'S', 'X', '1', 'VERO', 'TRUE'].includes(x)) return true;
  return null;
}

// Legge il file senza salvare nulla: ogni riga diventa i dati per evSalvaVolontario, o una lista di errori
function evLeggiFoglio(ws) {
  const c = evCorrente, titoli = [], righe = [], avvisi = [], visti = new Set();
  const giorniEv = evGiorni(c.e), fuori = new Set();
  ws.getRow(1).eachCell((cella, i) => { titoli[i] = evTestoCella(cella); });
  const pos = t => titoli.indexOf(t);
  if (pos('Cognome') < 0 || pos('Nome') < 0) return { righe, avvisi: ['Nel foglio "Volontari" mancano le colonne Cognome e Nome. Usa il file di Esporta Excel come modello.'] };
  const giornoCol = [];
  titoli.forEach((t, i) => {
    const m = String(t || '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (Disponibile|Colazione|Pranzo|Cena|Pernotto)$/);
    if (!m) return;
    const g = m[3] + '-' + m[2] + '-' + m[1];
    if (giorniEv.includes(g)) giornoCol.push({ i, g, tipo: m[4].toLowerCase() }); else fuori.add(evDataFoglio(g));
  });
  if (fuori.size) avvisi.push('Colonne ignorate, fuori dal periodo dell\'evento: ' + [...fuori].join(', ') + '.');
  const attive = evCorrente.tipologie.map(t => t.nome), esig = c.esigenze.map(x => x.nome);
  for (let n = 2; n <= ws.rowCount; n++) {
    const riga = ws.getRow(n), val = t => pos(t) >= 0 ? evTestoCella(riga.getCell(pos(t))) : undefined;
    const cognome = val('Cognome') || '', nome = val('Nome') || '', cf = (val('Codice fiscale') || '').toUpperCase();
    if (!cognome && !nome && !cf) continue;
    const errori = [];
    let vol = cf ? evVolontari.find(v => (v.codice_fiscale || '').toUpperCase() === cf) : null;
    if (!vol) {
      const uguali = evVolontari.filter(v => (v.cognome || '').toUpperCase() === cognome.toUpperCase() && (v.nome || '').toUpperCase() === nome.toUpperCase());
      if (uguali.length === 1) vol = uguali[0];
      else errori.push(uguali.length ? 'omonimi: serve il codice fiscale' : 'non trovato in anagrafica');
    }
    if (vol && visti.has(vol.id)) errori.push('volontario ripetuto');
    if (vol) visti.add(vol.id);
    const d = { volontario_id: vol ? vol.id : null };
    if (val('Ruolo') !== undefined) d.ruolo = val('Ruolo') || null;
    if (val('Ore') !== undefined) {
      const ore = val('Ore');
      if (ore && !isFinite(Number(ore.replace(',', '.')))) errori.push('ore non valide');
      d.ore = ore ? Math.max(0, Math.round(Number(ore.replace(',', '.')))) : null;
    }
    if (val('Presente') !== undefined && val('Presente') !== '') {
      const p = evSiNo(val('Presente'));
      if (p === null) errori.push('Presente: scrivere SI o NO'); else d.presente = p;
    }
    if (evAtt('tipologia') && val('Tipologia') !== undefined) {
      const t = val('Tipologia'), trovata = attive.find(x => x.toUpperCase() === t.toUpperCase());
      if (t && !trovata) errori.push('tipologia "' + t + '" non prevista');
      d.tipologia = trovata || null;
    }
    if (evAtt('art39') && val('Art. 39') !== undefined) {
      const a = evSiNo(val('Art. 39'));
      if (a === null) errori.push('Art. 39: scrivere SI o NO'); else d.art39 = a;
    }
    if (evAtt('esigenze') && val('Esigenze alimentari') !== undefined) {
      d.esigenze = [];
      val('Esigenze alimentari').split(',').map(x => x.trim()).filter(Boolean).forEach(x => {
        const t = esig.find(y => y.toUpperCase() === x.toUpperCase());
        if (t) d.esigenze.push(t); else errori.push('esigenza "' + x + '" non prevista');
      });
      d.esigenze_nota = val('Nota esigenze') || null;
    }
    if (evAtt('note') && val('Note') !== undefined) d.note = val('Note') || null;
    const giorni = giornoCol.length ? new Map() : null;
    giornoCol.filter(x => x.tipo === 'disponibile').forEach(x => {
      const t = evTestoCella(riga.getCell(x.i));
      if (!t) return;
      const campi = Object.fromEntries(EV_SERVIZI.map(s => [s[0], false]));
      const ore = t.match(/^(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})$/);
      if (ore) { campi.ora_dalle = ore[1].replace('.', ':'); campi.ora_alle = ore[2].replace('.', ':'); }
      else if (evSiNo(t) === true) { campi.ora_dalle = null; campi.ora_alle = null; }
      else errori.push(evDataFoglio(x.g) + ': scrivere X oppure 08:00-14:00');
      giorni.set(x.g, campi);
    });
    giornoCol.filter(x => x.tipo !== 'disponibile').forEach(x => {
      const s = evSiNo(evTestoCella(riga.getCell(x.i)));
      if (s === null) { errori.push(evDataFoglio(x.g) + ' ' + x.tipo + ': scrivere X o lasciare vuoto'); return; }
      if (!s) return;
      if (!giorni.has(x.g)) giorni.set(x.g, Object.fromEntries(EV_SERVIZI.map(z => [z[0], false])));
      giorni.get(x.g)[x.tipo] = true;
    });
    const esiste = vol ? c.squadra.find(r => r.volontario_id === vol.id) : null;
    errori.push(...evValidaVol(Object.assign({}, esiste || {}, d)));
    righe.push({ n, nome: (cognome + ' ' + nome).trim() || cf, nuovo: !esiste, d, giorni, errori });
  }
  if (!righe.length && !avvisi.length) avvisi.push('Il file non contiene volontari.');
  return { righe, avvisi };
}

let evImport = null;
async function evImportaExcel(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const ExcelJS = await evCaricaExcelJS();
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(await file.arrayBuffer()); }
    catch(e) { throw new Error('Il file non è un Excel valido (.xlsx).'); }
    const ws = wb.getWorksheet('Volontari') || wb.worksheets[0];
    if (!ws) throw new Error('Nel file non c\'è il foglio "Volontari".');
    evImport = evLeggiFoglio(ws);
  } catch(e) { sbAvviso(e.message || 'Importazione non riuscita.'); return; }
  const validi = evImport.righe.filter(r => !r.errori.length);
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Importa da Excel"><div class="shead"><h2>Importa da Excel</h2><button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody">'
    + evImport.avvisi.map(a => '<p class="sub">' + aggEsc(a) + '</p>').join('')
    + '<p class="sub"><b>' + validi.length + ' righe valide</b>' + (evImport.righe.length > validi.length ? ' · ' + (evImport.righe.length - validi.length) + ' con errori, non verranno caricate' : '') + '. Caricare il file non salva nulla: conferma qui sotto.</p>'
    + (evImport.righe.length ? '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th>Riga</th><th class="sx">Volontario</th><th class="sx">Esito</th></tr></thead><tbody>'
      + evImport.righe.map(r => '<tr><td>' + r.n + '</td><td class="sx">' + aggEsc(r.nome) + '</td><td class="sx' + (r.errori.length ? ' bad' : '') + '">' + aggEsc(r.errori.join('; ') || (r.nuovo ? 'Da aggiungere' : 'Da aggiornare')) + '</td></tr>').join('') + '</tbody></table></div>' : '')
    + '<div class="actions mt14"><button class="btn" onclick="evChiudiForm()">Annulla</button>' + (validi.length ? '<button class="btn pri" id="evImpBtn" onclick="evConfermaImport()">Salva ' + validi.length + ' volontari</button>' : '') + '</div></div></div>';
  ov.hidden = false;
}

async function evConfermaImport() {
  const btn = evEl('evImpBtn'), righe = evImport.righe.filter(r => !r.errori.length);
  btn.disabled = true;
  let fatti = 0;
  try {
    for (const r of righe) { await evSalvaVolontario(r.d, r.giorni); fatti++; }
    evChiudiForm();
    evRender();
    sbAvviso(fatti + ' volontari salvati.');
  } catch(e) {
    evChiudiForm();
    evRender();
    sbAvviso('Importazione interrotta: salvati ' + fatti + ' volontari su ' + righe.length + '.');
  }
}

// -- IMPOSTAZIONI: LISTE --
const EV_LISTE = { eventi_tipologie: 'Tipologie', eventi_esigenze: 'Esigenze alimentari' };
let evListe = {};

async function evCaricaListe() {
  const box = evEl('evListe');
  if (!box) return;
  try {
    const [t, e] = await Promise.all([
      evLeggi('eventi_tipologie?select=id,nome,ordine,attiva&order=ordine,nome'),
      evLeggi('eventi_esigenze?select=id,nome,ordine,attiva,con_nota&order=ordine,nome'),
    ]);
    evListe = { eventi_tipologie: t, eventi_esigenze: e };
    evRenderListe();
  } catch(x) { box.innerHTML = '<div class="loading-msg">Non disponibile.</div>'; }
}

function evRenderListe() {
  evEl('evListe').innerHTML = Object.keys(EV_LISTE).map(tab => {
    const conNota = tab === 'eventi_esigenze';
    return '<div class="grp">' + EV_LISTE[tab] + '</div>' + evListe[tab].map(r => '<div class="ev-liste-riga">'
      + '<input class="ev-nome" aria-label="Nome" value="' + aggEsc(r.nome) + '" onchange="evVoceLista(\'' + tab + '\',' + r.id + ',{nome:this.value.trim()})">'
      + '<input class="ev-ordine" type="number" step="1" aria-label="Ordine" value="' + r.ordine + '" onchange="evVoceLista(\'' + tab + '\',' + r.id + ',{ordine:Math.round(Number(this.value))||0})">'
      + '<label class="perm-check"><input type="checkbox"' + (r.attiva ? ' checked' : '') + ' onchange="evVoceLista(\'' + tab + '\',' + r.id + ',{attiva:this.checked})"> Attiva</label>'
      + (conNota ? '<label class="perm-check"><input type="checkbox"' + (r.con_nota ? ' checked' : '') + ' onchange="evVoceLista(\'' + tab + '\',' + r.id + ',{con_nota:this.checked})"> Con nota</label>' : '')
      + '<button class="btn sm danger" aria-label="Elimina" onclick="evEliminaVoce(\'' + tab + '\',' + r.id + ')">✕</button></div>').join('')
      + '<div class="ev-liste-riga"><input class="ev-nome" id="evNuova_' + tab + '" aria-label="Nuova voce" placeholder="Nuova voce"><button class="btn sm pri" onclick="evNuovaVoce(\'' + tab + '\')">Aggiungi</button></div>';
  }).join('');
}

async function evVoceLista(tab, id, campi) {
  if (campi.nome === '') { sbAvviso('Il nome non può essere vuoto.'); evRenderListe(); return; }
  try {
    const [riga] = await evScrivi('PATCH', tab + '?id=eq.' + id, campi);
    Object.assign(evListe[tab].find(r => r.id === id), riga);
    await logAttivita('ha modificato la voce ' + riga.nome + ' in ' + EV_LISTE[tab]);
  } catch(e) { sbAvviso('Modifica non salvata.'); }
  evRenderListe();
}

async function evNuovaVoce(tab) {
  const nome = evEl('evNuova_' + tab).value.trim();
  if (!nome) return;
  try {
    const ordine = Math.max(0, ...evListe[tab].map(r => r.ordine)) + 1;
    const [riga] = await evScrivi('POST', tab, { nome, ordine, attiva: true });
    evListe[tab].push(riga);
    await logAttivita('ha aggiunto la voce ' + nome + ' in ' + EV_LISTE[tab]);
    evRenderListe();
  } catch(e) { sbAvviso('Voce non aggiunta: esiste già?'); }
}

async function evEliminaVoce(tab, id) {
  const r = evListe[tab].find(x => x.id === id);
  if (!confirm('Eliminare "' + r.nome + '"? Gli eventi che la usano conservano il testo. Per nasconderla soltanto togli la spunta Attiva.')) return;
  try {
    await evScrivi('DELETE', tab + '?id=eq.' + id);
    evListe[tab] = evListe[tab].filter(x => x.id !== id);
    await logAttivita('ha eliminato la voce ' + r.nome + ' da ' + EV_LISTE[tab]);
    evRenderListe();
  } catch(e) { sbAvviso('Eliminazione non riuscita.'); }
}
