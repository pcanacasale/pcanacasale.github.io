/* Estrazione schede volontari da PIA (solo lettura).
 * Uso: accedere a pia.ana.it > VolA > Schede Volontari (volontari_Scheda.aspx), aprire la console del browser (F12),
 * incollare questo script e premere Invio. Dopo circa 2 minuti scarica "pia_volontari.json": è il file da caricare in
 * Amministrazione > Verifica piattaforme. Non modifica nulla in PIA. */
(async () => {
  const CAMPI = { cf: 'txtCodFiscale', ind: 'txtIndirizzo', cap: 'txtCap', com: 'txtLocalita', prov: 'txtProvincia', cell1: 'txtCellulare1', cell2: 'txtCellulare2', tel: 'txtTeleCasa', email: 'txtEmail', dn: 'txtPfDataNasc', ln: 'txtPfLocNasc', pn: 'txtPfProvNasc' };
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;left:-9999px;width:1200px;height:800px';
  document.body.appendChild(ifr);
  const carica = fn => new Promise(r => { ifr.onload = () => setTimeout(r, 100); fn(); });
  const out = [];
  try {
    await carica(() => { ifr.src = location.href; });
    let d = ifr.contentDocument;
    const dd = d.getElementById('DropDownRighe'); dd.value = '4';              // 4 = TUTTE le righe
    await carica(() => ifr.contentWindow.__doPostBack(dd.name, ''));
    await carica(() => ifr.contentWindow.__doPostBack('gvCustomers', 'Page$2')); // applica la selezione
    d = ifr.contentDocument;
    const n = d.querySelectorAll('#gvCustomers tr').length - 1;
    console.log('Schede da leggere:', n);
    for (let i = 0; i < n; i++) {
      await carica(() => ifr.contentWindow.__doPostBack('gvCustomers', 'visualizzaScheda$' + i));
      d = ifr.contentDocument;
      const o = {};
      for (const k in CAMPI) { const e = d.getElementById(CAMPI[k]); o[k] = e ? (e.value ?? e.innerText ?? '').trim() : ''; }
      const riga = d.querySelectorAll('#gvCustomers tr')[i + 1];
      o.nome = riga ? riga.children[4].innerText.trim() : '';
      out.push(o);
      if (i % 10 === 9) console.log((i + 1) + ' / ' + n);
    }
  } finally { ifr.remove(); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = 'pia_volontari.json'; document.body.appendChild(a); a.click(); a.remove();
  console.log('Fatto: ' + out.length + ' schede.');
  window.__piaVolontari = out;
})();
