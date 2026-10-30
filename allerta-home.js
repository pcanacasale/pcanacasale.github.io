// ============================================================
// STATO ALLERTA — card in cima alla Home, solo lettura. Prefisso funzioni: al*
// ============================================================
// Legge allerta_cache e, se ha più di 30 minuti, chiede alla Edge Function
// allerta-arpa di aggiornarla (supabase/functions/allerta-arpa).
// Regola: mai un verde finto. Senza dati, con un livello non riconosciuto o con il
// bollettino scaduto la fascia è grigia; se la fonte tace resta l'ultimo dato con
// "Non aggiornato dalle HH:MM" in evidenza.
// Fonte: Arpa Piemonte - www.arpa.piemonte.it
// ============================================================

const AL_FUNCTION_URL = SUPA_URL + '/functions/v1/allerta-arpa';
const AL_BOLLETTINO_URL = 'https://www.arpa.piemonte.it/bollettino/allerta-meteoidrologica-idraulica';
const AL_ZONA_NOME = 'Pianura Settentrionale';
const AL_TZ = 'Europe/Rome';
const AL_MAX_ETA_MS = 30 * 60 * 1000;     // oltre, si chiede un aggiornamento
const AL_SCADUTO_ETA_MS = 35 * 60 * 1000; // oltre, il dato è "non aggiornato" (margine per il pianificatore)

const AL_LIVELLI = {
  VERDE:     { peso: 1, titolo: 'Nessuna allerta',    voce: 'Verde',     cls: 'al-verde' },
  GIALLO:    { peso: 2, titolo: 'Allerta gialla',     voce: 'Gialla',    cls: 'al-giallo' },
  ARANCIONE: { peso: 3, titolo: 'Allerta arancione',  voce: 'Arancione', cls: 'al-arancione' },
  ROSSO:     { peso: 4, titolo: 'Allerta rossa',      voce: 'Rossa',     cls: 'al-rosso' },
};
const AL_ND = { peso: 0, titolo: 'Allerta non disponibile', voce: 'N/D', cls: 'al-nd' };
const AL_RISCHI = [['idrogeologico', 'Idrogeologico'], ['idraulico', 'Idraulico'], ['temporali', 'Temporali'], ['neve', 'Neve']];

function alOra(iso) { return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: AL_TZ }); }
function alGiorno(d) { return new Date(d).toLocaleDateString('sv-SE', { timeZone: AL_TZ }); } // AAAA-MM-GG
function alGiornoBreve(d) { return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: AL_TZ }); }
function alGiornoDopo(iso) { return new Date(new Date(iso).getTime() + 24 * 3600 * 1000); }

// Livello complessivo di un giorno: il più alto dei rischi. Se tutto è verde ma un
// valore non si capisce, il giorno non è verde: è non disponibile.
function alLivelloGiorno(rischi, g) {
  let top = AL_ND, ignoti = false;
  AL_RISCHI.forEach(r => {
    const v = rischi[r[0]] ? rischi[r[0]]['g' + g] : null;
    if (v === 'BIANCO') return; // non valutato
    const l = AL_LIVELLI[v];
    if (!l) { ignoti = true; return; }
    if (l.peso > top.peso) top = l;
  });
  return ignoti && top.peso <= 1 ? AL_ND : top;
}

function alRigaRischio(s, r) {
  const celle = [0, 1].map(g => {
    const v = s.rischi[r[0]] ? s.rischi[r[0]]['g' + g] : null;
    const l = AL_LIVELLI[v] || AL_ND;
    return '<span class="pill ' + l.cls + '">' + l.voce + '</span>';
  }).join('');
  return '<div class="al-riga"><span>' + r[1] + '</span>' + celle + '</div>';
}

function alRender(s, fonteInErrore) {
  const box = document.getElementById('homeAllerta');
  if (!box) return;
  const fascia = (l, sotto) => '<div class="al-fascia ' + l.cls + '"><span class="al-etichetta">Stato allerta</span><b>' + l.titolo + '</b>'
    + (sotto ? '<span class="al-sotto">' + sotto + '</span>' : '') + '</div>';
  const zona = 'Casale Monferrato · Zona ' + (s && s.zona ? aggEsc(s.zona) : 'Piem-I') + ' ' + AL_ZONA_NOME;
  const link = '<a class="go" href="' + AL_BOLLETTINO_URL + '" target="_blank" rel="noopener">Bollettino ufficiale →</a>';

  if (!s || !s.aggiornato_il || !s.rischi) {
    box.innerHTML = '<section class="card al-card" aria-label="Stato allerta">' + fascia(AL_ND, zona)
      + '<div class="al-corpo"><p class="note m0">Dati ARPA non ancora disponibili: consulta il bollettino ufficiale.</p>'
      + '<div class="al-piede"><span>Fonte: Arpa Piemonte</span>' + link + '</div></div></section>';
    return;
  }

  const oggi = alGiorno(Date.now());
  const g0 = alGiorno(s.valido_dal), g1Data = alGiornoDopo(s.valido_dal), g1 = alGiorno(g1Data);
  const indice = oggi === g0 ? 0 : (oggi === g1 ? 1 : -1);
  const scaduto = indice < 0 || new Date(s.valido_al).getTime() < Date.now();
  const nonAggiornato = scaduto || fonteInErrore || Date.now() - new Date(s.aggiornato_il).getTime() > AL_SCADUTO_ETA_MS;

  const livello = scaduto ? AL_ND : alLivelloGiorno(s.rischi, indice);
  let sotto = zona;
  if (indice === 0 && !scaduto) {
    const domani = alLivelloGiorno(s.rischi, 1);
    if (domani !== livello) sotto += '<br>Domani: ' + domani.titolo.toLowerCase();
  }

  const dalle = alOra(s.aggiornato_il) + (alGiorno(s.aggiornato_il) === oggi ? '' : ' del ' + alGiornoBreve(s.aggiornato_il));
  const mostraNeve = ['g0', 'g1'].some(g => { const v = s.rischi.neve ? s.rischi.neve[g] : null; return v !== 'VERDE' && v !== 'BIANCO'; });
  const rischi = AL_RISCHI.filter(r => r[0] !== 'neve' || mostraNeve);

  box.innerHTML = '<section class="card al-card" aria-label="Stato allerta">' + fascia(livello, sotto)
    + (nonAggiornato ? '<div class="al-avviso" role="status"><b>Non aggiornato dalle ' + dalle + '</b>'
      + '<span>' + (scaduto ? 'Il bollettino è scaduto: controlla quello ufficiale.' : 'Ultimo dato ricevuto: controlla il bollettino ufficiale.') + '</span></div>' : '')
    + '<div class="al-corpo">'
    + '<div class="al-riga al-testa"><span>Rischi</span><span>' + alGiornoBreve(s.valido_dal) + '</span><span>' + alGiornoBreve(g1Data) + '</span></div>'
    + rischi.map(r => alRigaRischio(s, r)).join('')
    + (s.effetti ? '<p class="al-effetti"><b>Effetti sul territorio:</b> ' + aggEsc(s.effetti) + '</p>' : '')
    + '<div class="kv"><span>Validità</span><b>dal ' + alGiornoBreve(s.valido_dal) + ' ore ' + alOra(s.valido_dal) + ' al ' + alGiornoBreve(s.valido_al) + ' ore ' + alOra(s.valido_al) + '</b></div>'
    + (s.numero_bollettino ? '<div class="kv"><span>Bollettino</span><b>n. ' + aggEsc(s.numero_bollettino) + '</b></div>' : '')
    + '<div class="al-piede"><span>' + (nonAggiornato ? '' : 'Aggiornato alle ' + alOra(s.aggiornato_il) + ' · ') + 'Fonte: Arpa Piemonte</span>' + link + '</div>'
    + '</div></section>';
}

async function caricaAllerta() {
  let stato = null;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/allerta_cache?id=eq.1&select=*', { headers: H });
    if (res.ok) stato = (await res.json())[0] || null;
  } catch(e) {}
  alRender(stato, false);
  const eta = stato && stato.aggiornato_il ? Date.now() - new Date(stato.aggiornato_il).getTime() : Infinity;
  if (eta <= AL_MAX_ETA_MS) return;
  try {
    const res = await fetch(AL_FUNCTION_URL, { method: 'POST', headers: HJ, body: '{}' });
    const data = await res.json();
    alRender(data.stato || stato, !data.ok);
  } catch(e) { alRender(stato, true); }
}
