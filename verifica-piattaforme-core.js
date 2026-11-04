/* Verifica piattaforme — motore di confronto Portale / PIA (VolA) / Volter.
 * Funzioni pure, senza DOM e senza rete: funzionano nel browser (window.VerificaCore) e in Node (module.exports).
 *
 * Uso:
 *   const volter = VerificaCore.leggiVolter(righeReport, righeRubrica);   // righe = array di oggetti (da XLS/CSV)
 *   const pia    = VerificaCore.leggiPia(arrayJsonDaPia);                  // JSON prodotto dallo script di estrazione PIA
 *   const portale= VerificaCore.leggiPortale(volontariDaVpDati);           // risposta di vp-api / vp_dati
 *   const persone= VerificaCore.confronta(portale, pia, volter);           // elenco persone con campi, esiti e suggerimenti
 */
(function (root) {
  'use strict';
  const U = s => (s == null ? '' : String(s)).replace(/\u0000/g, '').trim();
  const SRC = ['portale', 'pia', 'volter'];
  const CAMPI = [['cf', 'Codice fiscale'], ['dn', 'Data di nascita'], ['ln', 'Luogo di nascita'], ['ind', 'Indirizzo'], ['cap', 'CAP'], ['com', 'Comune'], ['tel', 'Telefono'], ['em', 'Email']];

  // ---------- normalizzazione ----------
  const ABB = [[/\bC\.?SO\b/g, 'CORSO'], [/\bSTR\.?LE\b/g, 'STRADALE'], [/\bSTR\b\.?/g, 'STRADA'], [/\bP\.?ZZA\b/g, 'PIAZZA'], [/\bV\.(?=\s|[A-Z])/g, 'VIA '], [/\bFR\.?\b/g, 'FRAZIONE'],
    [/\bM\.?TO\b/g, 'MONFERRATO'], [/\bMONF\b\.?/g, 'MONFERRATO'], [/MON FERRATO/g, 'MONFERRATO'], [/\bS\.? ?GIORGIO\b/g, 'SAN GIORGIO'], [/\bS\.? ?MARTINO\b/g, 'SAN MARTINO'], [/\bS\. /g, 'SAN '], [/CELLA MONTE/g, 'CELLAMONTE']];
  function norm(s) {
    s = U(s).toUpperCase();
    ABB.forEach(([a, b]) => { s = s.replace(a, b); });
    return s.replace(/[.,'`’]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const TIPI = new Set(['VIA', 'VIALE', 'STRADA', 'CORSO', 'VICOLO', 'PIAZZA', 'PIAZZALE', 'REGIONE', 'CANTONE', 'FRAZIONE', 'LOCALITA', 'V', 'CASCINA', 'CASCINE', 'STRADALE', 'DEL', 'DELLA', 'DI', 'DE', 'DELLE', 'DEI']);
  const addrNorm = s => norm(s).split(' ').filter(x => x && !TIPI.has(x)).join(' ');
  function comuneNorm(s) {
    s = norm(s);
    if (s.endsWith('SAN GIORGIO M')) s = s.replace('SAN GIORGIO M', 'SAN GIORGIO MONFERRATO');
    return s.replace('CASALE M TO', 'CASALE MONFERRATO').replace(/\bCASALE M ONFERRATO/, 'CASALE MONFERRATO').replace('OLIVOLA MONFERRATO', 'OLIVOLA').replace('MOLDAVIA', 'MOLDOVA');
  }
  function lcomp(a, b) {
    a = comuneNorm(a); b = comuneNorm(b);
    const [sh, lg] = a.length <= b.length ? [a, b] : [b, a];
    return a === b || (sh.length >= 8 && lg.startsWith(sh + ' '));
  }
  function iso(d) {
    d = U(d); let m = d.match(/^(\d\d)\/(\d\d)\/(\d{4})/);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    return d.slice(0, 10);
  }
  function telefoni(...xs) {
    const out = [];
    xs.forEach(x => {
      let d = U(x).replace(/\D/g, '');
      if (d.startsWith('0039')) d = d.slice(4); else if (d.startsWith('39') && d.length > 10) d = d.slice(2);
      if (d.length >= 6 && !/^0+$/.test(d) && !out.includes(d)) out.push(d);
    });
    return out;
  }
  // ---------- codice fiscale ----------
  const DISPARI = { '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21 };
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => { DISPARI[c] = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23][i]; });
  function cfValido(cf) {
    cf = U(cf).toUpperCase();
    if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cf)) return false;
    let s = 0;
    for (let i = 0; i < 15; i++) { const c = cf[i]; s += i % 2 === 0 ? DISPARI[c] : (/\d/.test(c) ? +c : c.charCodeAt(0) - 65); }
    return String.fromCharCode(65 + (s % 26)) === cf[15];
  }
  function cfData(cf) {
    const m = 'ABCDEHLMPRST'.indexOf(cf[8]); if (m < 0) return null;
    let g = +cf.slice(9, 11); if (g > 40) g -= 40;
    return [+cf.slice(6, 8), m + 1, g];
  }
  function cfCoerente(cf, dn) {
    const x = cfData(cf); if (!x || !dn) return null;
    return x[0] === +dn.slice(2, 4) && x[1] === +dn.slice(5, 7) && x[2] === +dn.slice(8, 10);
  }
  // ---------- lettura sorgenti ----------
  const pulisciRiga = r => { const o = {}; Object.keys(r).forEach(k => { o[U(k)] = U(r[k]); }); return o; };

  /** Report Volter (export "report volontari") + rubrica (export "rubrica volontari"). */
  function leggiVolter(report, rubrica) {
    const rub = {};
    (rubrica || []).map(pulisciRiga).forEach(r => {
      if (r.PEC) return;
      const d = rub[r.ID_PERSONA] || (rub[r.ID_PERSONA] = { tel: [], em: [] });
      telefoni(r.CELLULARE, r.TELEFONO).forEach(t => { if (!d.tel.includes(t)) d.tel.push(t); });
      const e = (r.EMAIL || '').toLowerCase();
      if (e && e !== 'nomail' && !d.em.includes(e)) d.em.push(e);
    });
    const out = {};
    report.map(pulisciRiga).forEach(r => {
      if (!r.COD_FISCALE) return;
      const ru = rub[r.ID_PERSONA] || { tel: [], em: [] };
      let k = r.COD_FISCALE.slice(0, 8); while (out[k]) k += '_2';
      out[k] = { cf: r.COD_FISCALE, dn: iso(r.DT_NASCITA), ln: r.DESCR_COMUNE_NASCITA, ind: (r.INDIRIZZO + ' ' + r.NCIVICO).trim(), cap: r.CAP, com: r.DESCR_COMUNE,
        tel: ru.tel, em: ru.em, agg: (r.DT_AGGIORNAMENTO || '').slice(0, 10), cog: r.COGNOME, nom: r.NOME };
    });
    return out;
  }
  /** JSON estratto da PIA: [{nome, cf, ind, cap, com, prov, cell1, cell2, tel, email, dn, ln, pn}] */
  function leggiPia(arr) {
    const out = {};
    arr.forEach(r0 => {
      const r = pulisciRiga(r0); if (!r.cf) return;
      let k = r.cf.slice(0, 8); while (out[k]) k += '_2';
      out[k] = { cf: r.cf, dn: iso(r.dn), ln: r.ln, ind: r.ind, cap: r.cap, com: r.com, tel: telefoni(r.cell1, r.cell2, r.tel), em: r.email ? [r.email.toLowerCase()] : [], nomeCompleto: r.nome || '' };
    });
    return out;
  }
  /** Righe di agg_volontari (risposta di vp-api vp_dati). */
  function leggiPortale(rows) {
    const out = {};
    rows.forEach(r => {
      const cf = U(r.codice_fiscale); if (!cf) return;
      let k = cf.slice(0, 8); while (out[k]) k += '_2';
      out[k] = { cf, dn: U(r.data_nascita).slice(0, 10), ln: U(r.luogo_nascita), ind: (U(r.indirizzo) + ' ' + U(r.civico)).trim(), cap: U(r.cap), com: U(r.citta),
        tel: telefoni(r.telefono), em: r.email ? [U(r.email).toLowerCase()] : [], cog: U(r.cognome), nom: U(r.nome), stato: r.stato || null, aid: r.id };
    });
    return out;
  }
  // ---------- confronto ----------
  const mostra = (f, s) => !s ? '' : (f === 'tel' || f === 'em') ? (s[f] || []).join(', ') : (s[f] || '');
  function stessi(f, a, b) {
    if (f === 'cf') return a.toUpperCase() === b.toUpperCase();
    if (f === 'ln' || f === 'com') return lcomp(a, b);
    if (f === 'ind') return addrNorm(a) === addrNorm(b);
    if (f === 'tel' || f === 'em') return a.some(x => b.includes(x));
    return a === b;
  }
  function gruppi(f, vals) {
    const g = [];
    vals.forEach(([s, v]) => { const t = g.find(x => stessi(f, x[0][1], v)); if (t) t.push([s, v]); else g.push([[s, v]]); });
    return g;
  }
  function confronta(portale, pia, volter) {
    const chiavi = Array.from(new Set([...Object.keys(portale), ...Object.keys(pia), ...Object.keys(volter)]));
    const persone = chiavi.map(k => {
      const src = { portale: portale[k] || null, pia: pia[k] || null, volter: volter[k] || null };
      const p0 = src.portale, v0 = src.volter, a0 = src.pia;
      const cog = p0 ? p0.cog : v0 ? v0.cog : (a0 && a0.nomeCompleto) || '?';
      const nom = p0 ? p0.nom : v0 ? v0.nom : '';
      const persona = { key: k, cog, nom, presenza: {}, stato: p0 ? p0.stato : null, aid: p0 ? p0.aid : null, volter_agg: v0 ? v0.agg : null, campi: [], cfcheck: {} };
      SRC.forEach(s => { persona.presenza[s] = !!src[s]; });
      let ndiff = 0;
      CAMPI.forEach(([f, lab]) => {
        const v = {}, vals = [];
        SRC.forEach(s => {
          v[s] = mostra(f, src[s]);
          let raw = src[s] ? src[s][f] : null;
          if (f === 'tel' && raw) raw = raw.filter(n => n[0] === '3');        // si confrontano solo i cellulari
          if (raw && raw.length !== 0) vals.push([s, raw]);
        });
        const gr = gruppi(f, vals);
        const st = gr.length <= 1 ? 'ok' : 'diff';
        let sugg = null, why = '';
        if (f === 'cf') {
          const dns = SRC.map(s => src[s] && src[s].dn).filter(Boolean);
          const freq = {}; dns.forEach(d => { freq[d] = (freq[d] || 0) + 1; });
          const bd = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || '';
          const buoni = [];
          SRC.forEach(s => { if (!src[s]) return; const ok = cfValido(src[s].cf) && cfCoerente(src[s].cf, bd) !== false; persona.cfcheck[s] = ok ? 'valido' : 'non valido'; if (ok) buoni.push(s); });
          if (st === 'diff' && buoni.length && new Set(buoni.map(s => norm(src[s].cf))).size === 1) {
            sugg = buoni[0];
            if (buoni.length < SRC.filter(s => src[s]).length) why = 'Gli altri codici non superano il controllo di coerenza con la data di nascita.';
          }
        }
        if (st === 'diff' && !sugg) {
          const big = gr.reduce((a, b) => (b.length > a.length ? b : a), gr[0]);
          const altre = gr.filter(x => x !== big).reduce((m, x) => Math.max(m, x.length), 0);
          if (big.length >= 2 && big.length > altre) { sugg = big[0][0]; why = 'Due fonti su tre coincidono.'; }
        }
        if (st === 'diff') ndiff++;
        persona.campi.push({ f, lab, v, st, sugg, why });
      });
      persona.ndiff = ndiff;
      return persona;
    });
    persone.sort((a, b) => (a.cog + ' ' + a.nom).localeCompare(b.cog + ' ' + b.nom, 'it'));
    return persone;
  }
  const api = { CAMPI, SRC, leggiVolter, leggiPia, leggiPortale, confronta, cfValido, norm, addrNorm, lcomp, telefoni };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VerificaCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
