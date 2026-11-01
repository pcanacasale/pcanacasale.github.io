// ============================================================
// STRUMENTI — pagina Eventi, seconda parte (prefisso ev*, permesso eventi).
// ============================================================
// Modello: Attivazioni del Polo Logistico, compilato dallo staff, solo volontari dell'anagrafica.
// Una riga in evento_disponibilita vuol dire "disponibile quel giorno"; senza orari è giornata intera.
// Pasti, posti letto e conteggi sono calcolati qui nel browser dai dati caricati.
// Gli assenti (presente = false) non contano in cucina, nel riepilogo e nelle stampe.
// evSalvaVolontario è l'unico punto di salvataggio, usato da aggiunta, Dettagli e import Excel.
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
  evEl('evScheda').innerHTML = '<div class="bar">' + legenda + '<span class="grow"></span>' + estendi + '</div>'
    + (evAtt('servizi') ? '<p class="sub mb10">Spuntando il pernotto, la colazione del mattino dopo si spunta da sola (modificabile).</p>' : '')
    + (!c.squadra.length ? '<div class="empty">Aggiungi prima i volontari nella scheda Squadra.</div>'
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
function evHaDettagli() { return ['tipologia', 'art39', 'esigenze', 'note'].some(evAtt); }

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

// I campi obbligatori che dipendono da anagrafica e griglia si segnalano, non bloccano
function evMancanti(r) {
  const v = evVol(r.volontario_id) || {}, giorni = evGiorni(evCorrente.e).map(g => evDisp(r.id, g)).filter(Boolean);
  const out = evValidaVol(r);
  if (evObb('cellulare') && !v.telefono) out.push('cellulare mancante in anagrafica');
  if (evObb('patenti') && !v.patenti) out.push('patenti mancanti in anagrafica');
  if (evObb('servizi') && !giorni.length) out.push('nessun giorno indicato');
  if (evObb('orari') && giorni.some(d => !d.ora_dalle)) out.push('orari mancanti');
  return out;
}

function evSottotitoloVol(r) {
  const v = evVol(r.volontario_id) || {}, parti = [];
  if (evAtt('cellulare') && v.telefono) parti.push(v.telefono);
  if (evAtt('patenti') && v.patenti) parti.push('Patenti ' + v.patenti);
  if (evAtt('tipologia') && r.tipologia) parti.push(r.tipologia);
  if (evAtt('art39') && r.art39) parti.push('Art. 39');
  if (evAtt('esigenze') && (r.esigenze || []).length) parti.push(r.esigenze.join(', '));
  const manca = evMancanti(r);
  return (parti.length ? '<div class="doc-item-meta">' + aggEsc(parti.join(' · ')) + '</div>' : '')
    + (manca.length ? '<div class="doc-item-meta bad">' + aggEsc(manca.join(' · ')) + '</div>' : '');
}

// Inserisce o aggiorna il volontario; giorni (Map giorno → campi) sostituisce la griglia se presente
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
    for (const g of evGiorni(c.e)) {
      const vuole = giorni.get(g), ha = evDisp(riga.id, g);
      if (vuole) await evScriviGiorno(riga.id, g, vuole);
      else if (ha) await evTogliGiorno(ha);
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

function evApriVol(id) {
  const r = evCorrente.squadra.find(x => x.id === id);
  if (!r) return;
  const tip = evCorrente.tipologie.filter(t => t.attiva || t.nome === r.tipologia);
  const ov = evEl('evFormOv');
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Dati del volontario"><div class="shead"><h2>' + aggEsc(evNomeVol(r.volontario_id)) + '</h2><button class="x" onclick="evChiudiForm()" aria-label="Chiudi">✕</button></div><div class="sbody form">'
    + '<div class="form-err" id="evVolErr"></div>'
    + (evAtt('tipologia') ? '<label>Tipologia<select id="evVolTip"><option value="">—</option>' + tip.map(t => '<option' + (t.nome === r.tipologia ? ' selected' : '') + '>' + aggEsc(t.nome) + '</option>').join('') + '</select></label>' : '')
    + (evAtt('art39') ? '<label class="perm-check"><input type="checkbox" id="evVolArt"' + (r.art39 ? ' checked' : '') + '> Chiede art. 39</label>' : '')
    + (evAtt('esigenze') ? '<div class="grp">Esigenze alimentari</div>' + evCheckEsigenze('evVolEs_', r.esigenze) + '<label>Nota esigenze<input id="evVolNota" value="' + aggEsc(r.esigenze_nota || '') + '"></label>' : '')
    + (evAtt('note') ? '<label>Note<textarea id="evVolNote" rows="2">' + aggEsc(r.note || '') + '</textarea></label>' : '')
    + '<div class="actions"><button class="btn" onclick="evChiudiForm()">Annulla</button><button class="btn pri" id="evVolBtn" onclick="evSalvaVol(' + id + ')">Salva</button></div></div></div>';
  ov.hidden = false;
}

async function evSalvaVol(id) {
  const r = evCorrente.squadra.find(x => x.id === id), err = evEl('evVolErr'), btn = evEl('evVolBtn');
  const d = { volontario_id: r.volontario_id };
  if (evAtt('tipologia')) d.tipologia = evEl('evVolTip').value || null;
  if (evAtt('art39')) d.art39 = evEl('evVolArt').checked;
  if (evAtt('esigenze')) { d.esigenze = evLeggiEsigenze('evVolEs_'); d.esigenze_nota = evEl('evVolNota').value.trim() || null; }
  if (evAtt('note')) d.note = evEl('evVolNote').value.trim() || null;
  const errori = evValidaVol(Object.assign({}, r, d));
  if (errori.length) { err.textContent = errori.join(' · '); err.style.display = 'block'; return; }
  btn.disabled = true;
  try {
    await evSalvaVolontario(d);
    evChiudiForm();
    evRenderSquadra();
  } catch(e) { btn.disabled = false; err.textContent = e.message; err.style.display = 'block'; }
}

// -- MEZZI E MATERIALI --
function evMezzoAnagrafica(m) { return m.mezzo_id ? evCorrente.parco.find(x => x.id === m.mezzo_id) || null : null; }
function evMezzoNome(m) { const a = evMezzoAnagrafica(m); return m.tipo || (a ? a.automezzo : 'Mezzo ' + m.mezzo_id); }
function evMezzoTarga(m) { const a = evMezzoAnagrafica(m); return m.targa || (a && a.targa) || ''; }
// Elenco vuoto = tutti i giorni: vale anche per i mezzi aggiunti prima che ci fossero i giorni
function evMezzoNelGiorno(m, g) { return !(m.giorni || []).length || m.giorni.map(evGiorno).includes(g); }
function evGiorniMezzo(m) {
  const giorni = evGiorni(evCorrente.e), suoi = giorni.filter(g => evMezzoNelGiorno(m, g));
  return suoi.length === giorni.length ? 'Tutti i giorni' : suoi.map(evGiornoBreve).join(', ');
}

function evRenderMezzi() {
  const c = evCorrente, giorni = evGiorni(c.e);
  const presi = new Set(c.mezzi.map(r => r.mezzo_id).filter(Boolean));
  const liberi = c.parco.filter(m => !presi.has(m.id));
  evEl('evScheda').innerHTML = '<div class="card form mb18"><h2>Aggiungi mezzo</h2>'
    + (c.parcoOk ? '<label>Dall\'anagrafica<select id="evMezzoSel" onchange="evMezzoScelto()"><option value="">— inserisci a mano —</option>'
      + liberi.map(m => '<option value="' + m.id + '">' + aggEsc(m.automezzo + (m.targa ? ' · ' + m.targa : '')) + '</option>').join('') + '</select></label>' : '')
    + '<div class="row2"><label>Tipo<input id="evMezzoTipo"></label><label>Targa<input id="evMezzoTarga" class="upper"></label></div>'
    + '<div class="actions"><button class="btn pri" onclick="evAggiungiMezzo()">Aggiungi</button></div></div>'
    + '<div class="grp">Mezzi (' + c.mezzi.length + ')</div>'
    + (!c.mezzi.length ? '<div class="empty">Nessun mezzo assegnato.</div>' : c.mezzi.map(m => '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc([evMezzoNome(m), evMezzoTarga(m)].filter(Boolean).join(' · ')) + '</div>'
      + '<div class="chips mt6">' + giorni.map(g => '<button class="ev-t' + (evMezzoNelGiorno(m, g) ? ' on' : '') + '" aria-pressed="' + evMezzoNelGiorno(m, g) + '" onclick="evMezzoGiorno(' + m.id + ',\'' + g + '\')">' + aggEsc(evGiornoBreve(g)) + '</button>').join('') + '</div></div>'
      + '<button class="btn sm danger" aria-label="Togli" onclick="evTogliMezzo(' + m.id + ')">✕</button></div>').join(''))
    + '<div class="card form mt14"><h2>Aggiungi materiale</h2><div class="row2"><label>Quantità<input type="number" min="1" step="1" id="evMatQta" value="1"></label><label>Descrizione<input id="evMatDesc"></label></div>'
    + '<label>Note<input id="evMatNote"></label><div class="actions"><button class="btn pri" onclick="evAggiungiMateriale()">Aggiungi</button></div></div>'
    + '<div class="grp">Materiali (' + c.materiali.length + ')</div>'
    + (!c.materiali.length ? '<div class="empty">Nessun materiale indicato.</div>' : c.materiali.map(m => '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + m.quantita + ' × ' + aggEsc(m.descrizione) + '</div>'
      + (m.note ? '<div class="doc-item-meta">' + aggEsc(m.note) + '</div>' : '') + '</div><button class="btn sm danger" aria-label="Togli" onclick="evTogliMateriale(' + m.id + ')">✕</button></div>').join(''));
}

function evMezzoScelto() {
  const m = evCorrente.parco.find(x => x.id === Number(evEl('evMezzoSel').value));
  evEl('evMezzoTipo').value = m ? m.automezzo : '';
  evEl('evMezzoTarga').value = m ? m.targa || '' : '';
}

async function evAggiungiMezzo() {
  const sel = evEl('evMezzoSel'), mezzo = sel && sel.value ? Number(sel.value) : null;
  const tipo = evEl('evMezzoTipo').value.trim(), targa = evEl('evMezzoTarga').value.trim().toUpperCase();
  if (!tipo) { sbAvviso('Indica il tipo di mezzo.'); return; }
  try {
    const [riga] = await evScrivi('POST', 'evento_mezzi', { evento_id: evCorrente.e.id, mezzo_id: mezzo, tipo, targa: targa || null, giorni: evGiorni(evCorrente.e) });
    evCorrente.mezzi.push(riga);
    await logAttivita('ha aggiunto ' + tipo + ' all\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
  } catch(e) { sbAvviso('Mezzo non aggiunto.'); }
}

async function evMezzoGiorno(id, g) {
  const m = evCorrente.mezzi.find(x => x.id === id), tutti = evGiorni(evCorrente.e);
  const giorni = evMezzoNelGiorno(m, g) ? tutti.filter(x => x !== g && evMezzoNelGiorno(m, x)) : tutti.filter(x => x === g || evMezzoNelGiorno(m, x));
  if (!giorni.length) { sbAvviso('Un mezzo deve restare almeno su un giorno: per toglierlo usa ✕.'); return; }
  try {
    const [riga] = await evScrivi('PATCH', 'evento_mezzi?id=eq.' + id, { giorni });
    Object.assign(m, riga);
    await logAttivita('ha modificato i giorni di ' + evMezzoNome(m) + ' nell\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
  } catch(e) { sbAvviso('Modifica non salvata.'); }
}

async function evTogliMezzo(id) {
  try {
    await evScrivi('DELETE', 'evento_mezzi?id=eq.' + id);
    evCorrente.mezzi = evCorrente.mezzi.filter(r => r.id !== id);
    await logAttivita('ha tolto un mezzo dall\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
  } catch(e) { sbAvviso('Mezzo non tolto.'); }
}

async function evAggiungiMateriale() {
  const quantita = Math.round(Number(evEl('evMatQta').value)), descrizione = evEl('evMatDesc').value.trim();
  if (!(quantita >= 1) || !descrizione) { sbAvviso('Indica quantità e descrizione.'); return; }
  try {
    const [riga] = await evScrivi('POST', 'evento_materiali', { evento_id: evCorrente.e.id, quantita, descrizione, note: evEl('evMatNote').value.trim() || null });
    evCorrente.materiali.push(riga);
    await logAttivita('ha aggiunto materiale all\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
  } catch(e) { sbAvviso('Materiale non aggiunto.'); }
}

async function evTogliMateriale(id) {
  try {
    await evScrivi('DELETE', 'evento_materiali?id=eq.' + id);
    evCorrente.materiali = evCorrente.materiali.filter(r => r.id !== id);
    await logAttivita('ha tolto materiale dall\'evento: ' + evCorrente.e.titolo);
    evRenderMezzi();
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
  const c = evCorrente;
  evEl('evScheda').innerHTML = '<div class="bar"><p class="sub">Totali per servizio: volontari + ospiti + extra. I nomi compaiono solo per le esigenze da segnalare.</p><span class="grow"></span><button class="btn sm" onclick="evStampaCucina()">Stampa cucina</button></div>'
    + evTabellaCucina(evCalcolaCucina(), false)
    + '<div class="bar mt14"><h2>Ospiti (' + c.ospiti.length + ')</h2><span class="grow"></span><button class="btn sm pri" onclick="evApriOspite()">Aggiungi ospite</button></div>'
    + (!c.ospiti.length ? '<div class="empty">Nessun ospite.</div>' : c.ospiti.map(o => {
      const serv = c.ospitiServizi.filter(s => s.ospite_id === o.id).map(s => evGiornoBreve(evGiorno(s.giorno)) + ' ' + EV_SERVIZI.filter(x => s[x[0]]).map(x => x[2]).join(' ')).join(', ');
      return '<div class="doc-item"><div class="doc-item-info"><div class="doc-item-name">' + aggEsc(o.nome) + '</div><div class="doc-item-meta">' + aggEsc([serv, (o.esigenze || []).join(', ')].filter(Boolean).join(' · ') || 'Nessun servizio') + '</div></div>'
        + '<button class="btn sm" onclick="evApriOspite(' + o.id + ')">Modifica</button><button class="btn sm danger" aria-label="Elimina" onclick="evEliminaOspite(' + o.id + ')">✕</button></div>';
    }).join(''));
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
    evRenderCucina();
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
    evRenderCucina();
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

function evRenderRiepilogo() {
  const c = evCorrente, giorni = evCalcolaGiorni(), tipologie = evAtt('tipologia') ? evTipologieUsate(giorni) : [];
  const conOrari = evAtt('orari'), conPat = evAtt('patenti');
  const senzaTip = evAtt('tipologia') && giorni.some(g => g.tipologie['']);
  const box = (n, l) => '<div class="card"><b class="ev-num">' + n + '</b><span class="sub">' + l + '</span></div>';
  const nArt = evPresenti().filter(r => r.art39).length;
  evEl('evScheda').innerHTML = '<div class="bar"><span class="grow"></span><button class="btn sm" onclick="evEsportaExcel()">Esporta Excel</button>'
    + '<label class="btn sm">Importa Excel<input type="file" accept=".xlsx" hidden onchange="evImportaExcel(this)"></label></div>'
    + '<div class="ev-stat mb18">' + box(evPresenti().length, 'Volontari presenti') + box(giorni.reduce((t, g) => t + g.pasti, 0), 'Pasti totali (con ospiti ed extra)')
    + box(Math.max(0, ...giorni.map(g => g.pernotti)), 'Posti letto (notte più piena)') + box(c.mezzi.length, 'Mezzi')
    + (evAtt('art39') ? box(nArt, 'Chiedono l\'art. 39') : '') + '</div>'
    + '<div class="ev-scorri"><table class="ev-tab"><thead><tr><th class="sx">Giorno</th><th>Volontari</th>' + (conOrari ? '<th>Giornata intera</th><th>Con orario</th>' : '')
    + tipologie.map(t => '<th>' + aggEsc(t) + '</th>').join('') + (senzaTip ? '<th>Non indicata</th>' : '') + (conPat ? '<th>Patenti</th>' : '') + '<th>Mezzi</th><th>Pasti</th></tr></thead><tbody>'
    + giorni.map(g => '<tr><td class="sx">' + aggEsc(evGiornoBreve(g.giorno)) + '</td><td><b>' + g.volontari + '</b></td>'
      + (conOrari ? '<td>' + g.intera + '</td><td class="sx">' + g.conOrario + (g.conOrario ? '<div class="sub">' + aggEsc(evConteggi(g.fasce)) + '</div>' : '') + '</td>' : '')
      + tipologie.map(t => '<td>' + (g.tipologie[t] || 0) + '</td>').join('') + (senzaTip ? '<td>' + (g.tipologie[''] || 0) + '</td>' : '')
      + (conPat ? '<td class="sx">' + aggEsc(evConteggi(g.patenti) || '—') + '</td>' : '') + '<td>' + g.mezzi + '</td><td>' + g.pasti + '</td></tr>').join('')
    + '</tbody></table></div>'
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
