// ottimizza-immagine.js — funzioni condivise (prefisso oi*) usate da
// aggiorna.html (link personale del volontario) e da aggiornamento-dati.js
// (area riservata, master). Nessuna libreria: solo canvas.
//
// - oiCarica(file)            immagine con orientamento EXIF corretto
// - oiRuota(src, gradi)       copia ruotata di 90/180/270 gradi
// - ottimizzaImmagine(file)   orientamento, ritaglio bordi, luce/contrasto,
//                             max 1800 px, JPEG ~0.8 sotto 1 MB; mai più
//                             pesante dell'originale
// - oiScegli(file)            anteprima con "Usa migliorata" / "Usa originale"
//                             e rotazione; restituisce il File scelto o null
// - oiTrovaViso(src)          riquadro del viso (FaceDetector) oppure null
// I PDF non vengono mai toccati.
'use strict';

const OI_LATO_MAX = 1800;
const OI_PESO_OBIETTIVO = 1024 * 1024;

function oiDim(src) { return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height }; }

// Immagine decodificata con l'orientamento EXIF applicato.
async function oiCarica(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* ripiego su <img> */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Immagine non leggibile.'));
    img.src = URL.createObjectURL(file);
  });
}

function oiRuota(src, gradi) {
  const g = ((gradi % 360) + 360) % 360;
  const { w, h } = oiDim(src);
  const cv = document.createElement('canvas');
  const giro = g === 90 || g === 270;
  cv.width = giro ? h : w; cv.height = giro ? w : h;
  const ctx = cv.getContext('2d');
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate(g * Math.PI / 180);
  ctx.drawImage(src, -w / 2, -h / 2);
  return cv;
}

function oiBlob(canvas, q) { return new Promise(r => canvas.toBlob(r, 'image/jpeg', q)); }
function oiNomeJpg(nome) { return String(nome || 'immagine').replace(/\.[^.]+$/, '') + '.jpg'; }

// Ritaglio dei margini: sfondo = colore medio del bordo, se uniforme o scuro.
// Analisi su una copia piccola; restituisce il riquadro in proporzione (0..1).
function oiMargini(src) {
  const { w, h } = oiDim(src);
  const k = Math.min(1, 300 / Math.max(w, h));
  const aw = Math.max(1, Math.round(w * k)), ah = Math.max(1, Math.round(h * k));
  const cv = document.createElement('canvas'); cv.width = aw; cv.height = ah;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, aw, ah);
  const d = ctx.getImageData(0, 0, aw, ah).data;
  const px = (x, y) => { const i = (y * aw + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

  // Colore e uniformità del bordo (anello di 2 pixel)
  let n = 0, s = [0, 0, 0], s2 = 0;
  const bordo = [];
  for (let x = 0; x < aw; x++) for (const y of [0, 1, ah - 2, ah - 1]) if (y >= 0 && y < ah) bordo.push(px(x, y));
  for (let y = 2; y < ah - 2; y++) for (const x of [0, 1, aw - 2, aw - 1]) if (x >= 0 && x < aw) bordo.push(px(x, y));
  bordo.forEach(c => { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; });
  const bg = s.map(v => v / n);
  bordo.forEach(c => { s2 += (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2; });
  const dev = Math.sqrt(s2 / n);
  const lumBg = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  const scuro = lumBg < 60;
  if (dev > 38 && !scuro) return null; // bordo non uniforme: non si ritaglia

  const soglia = Math.max(40, dev * 1.6);
  const diverso = (c) => {
    if (scuro && 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 50) return false;
    return Math.sqrt((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) > soglia;
  };
  const riga = y => { let c = 0; for (let x = 0; x < aw; x++) if (diverso(px(x, y))) c++; return c / aw; };
  const colonna = x => { let c = 0; for (let y = 0; y < ah; y++) if (diverso(px(x, y))) c++; return c / ah; };
  const MIN = 0.04;
  let top = 0; while (top < ah - 1 && riga(top) < MIN) top++;
  let bot = ah - 1; while (bot > top && riga(bot) < MIN) bot--;
  let sx = 0; while (sx < aw - 1 && colonna(sx) < MIN) sx++;
  let dx = aw - 1; while (dx > sx && colonna(dx) < MIN) dx--;

  // Margine di sicurezza del 3% per lato
  const mx = Math.round(aw * 0.03), my = Math.round(ah * 0.03);
  sx = Math.max(0, sx - mx); dx = Math.min(aw - 1, dx + mx);
  top = Math.max(0, top - my); bot = Math.min(ah - 1, bot + my);
  const cw = (dx - sx + 1) / aw, ch = (bot - top + 1) / ah;
  // Troppo poco da togliere, o ritaglio sospetto (resterebbe troppo poco): niente
  if (cw * ch > 0.94 || cw < 0.35 || ch < 0.35) return null;
  return { x: sx / aw, y: top / ah, w: cw, h: ch };
}

// Luminosità e contrasto: allunga leggermente l'istogramma (1°–99° percentile),
// con limiti per non "bruciare" la foto.
function oiNormalizza(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const ist = new Uint32Array(256);
  const passo = Math.max(1, Math.floor((w * h) / 200000));
  let tot = 0;
  for (let i = 0; i < d.length; i += 4 * passo) { ist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++; tot++; }
  let acc = 0, basso = 0, alto = 255;
  for (let v = 0; v < 256; v++) { acc += ist[v]; if (acc >= tot * 0.01) { basso = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += ist[v]; if (acc >= tot * 0.01) { alto = v; break; } }
  basso = Math.min(basso, 40); alto = Math.max(alto, 200);
  if (basso <= 6 && alto >= 249) return false; // già a posto
  const gain = Math.min(1.5, 255 / Math.max(1, alto - basso));
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - basso) * gain;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
  return true;
}

// Esporta in JPEG puntando a meno di 1 MB (qualità e poi dimensioni).
async function oiEsporta(canvas, q0) {
  let cv = canvas, q = q0 || 0.8, b = await oiBlob(cv, q);
  while (b && b.size > OI_PESO_OBIETTIVO && q > 0.6) { q -= 0.1; b = await oiBlob(cv, q); }
  while (b && b.size > OI_PESO_OBIETTIVO && cv.width > 900) {
    const p = document.createElement('canvas');
    p.width = Math.round(cv.width * 0.85); p.height = Math.round(cv.height * 0.85);
    p.getContext('2d').drawImage(cv, 0, 0, p.width, p.height);
    cv = p; b = await oiBlob(cv, q);
  }
  return b;
}

// opz.rotazione = 0/90/180/270 (in aggiunta all'EXIF)
// Risultato: { file, migliorata, originale, base, ritagliata, w, h }
//   file = migliorata se più leggera, altrimenti "base"
//   base = originale (o sua copia ruotata / convertita in JPG quando serve)
async function ottimizzaImmagine(file, opz) {
  opz = opz || {};
  const tipo = (file.type || '').toLowerCase();
  if (tipo === 'application/pdf') return { file, migliorata: false, originale: file, base: file };
  let src;
  try { src = await oiCarica(file); } catch (e) { return { file, migliorata: false, originale: file, base: file }; }
  const rot = ((opz.rotazione || 0) % 360 + 360) % 360;
  const sorgente = rot ? oiRuota(src, rot) : src;
  const { w, h } = oiDim(sorgente);

  // Base: l'originale se non c'è nulla da cambiare, altrimenti ruotata / in JPG
  let base = file;
  if (rot || !['image/jpeg', 'image/png'].includes(tipo)) {
    const k = Math.min(1, 4000 / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.getContext('2d').drawImage(sorgente, 0, 0, cv.width, cv.height);
    const b = await oiBlob(cv, 0.92);
    if (b) base = new File([b], oiNomeJpg(file.name), { type: 'image/jpeg' });
  }

  // Migliorata: ritaglio → ridimensiono → luce/contrasto → JPEG
  const r = oiMargini(sorgente) || { x: 0, y: 0, w: 1, h: 1 };
  const rx = Math.round(r.x * w), ry = Math.round(r.y * h), rw = Math.round(r.w * w), rh = Math.round(r.h * h);
  const k = Math.min(1, OI_LATO_MAX / Math.max(rw, rh));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(rw * k)); cv.height = Math.max(1, Math.round(rh * k));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); // PNG trasparenti su bianco
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sorgente, rx, ry, rw, rh, 0, 0, cv.width, cv.height);
  oiNormalizza(ctx, cv.width, cv.height);
  const b = await oiEsporta(cv, 0.8);
  if (src.close) try { src.close(); } catch (e) {}

  if (!b || b.size >= base.size) return { file: base, migliorata: false, originale: file, base, w, h };
  const mig = new File([b], oiNomeJpg(file.name), { type: 'image/jpeg' });
  return { file: mig, migliorata: true, originale: file, base, ritagliata: r.w < 1 || r.h < 1, w: cv.width, h: cv.height };
}

// Riquadro del viso nell'immagine (coordinate di src), se il browser ha FaceDetector.
async function oiTrovaViso(src) {
  if (typeof window === 'undefined' || !('FaceDetector' in window)) return null;
  try {
    const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
    const visi = await fd.detect(src);
    if (!visi || !visi.length) return null;
    const v = visi.slice().sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0].boundingBox;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  } catch (e) { return null; }
}

// ---------- anteprima: Usa migliorata / Usa originale / ruota ----------
function oiCSS() {
  if (document.getElementById('oiCSS')) return;
  const st = document.createElement('style'); st.id = 'oiCSS';
  st.textContent = `
.oi-ov{position:fixed;inset:0;z-index:9999;background:rgba(7,20,40,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.oi-card{background:var(--surface,#fff);color:var(--fg,#072F63);border-radius:20px;width:100%;max-width:520px;max-height:100%;overflow:auto;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:inherit}
.oi-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.oi-h b{font-size:17px}
.oi-x{border:0;background:none;font-size:22px;line-height:1;color:var(--muted,#44597D);cursor:pointer;padding:4px 8px}
.oi-prev{display:block;max-width:100%;max-height:50vh;margin:8px auto;border-radius:12px;background:var(--bg,#F3F6FB);border:1px solid var(--line,#DCE5F2)}
.oi-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
.oi-tabs button,.oi-rot button,.oi-az button{height:42px;border-radius:12px;border:1px solid var(--line2,#C5D3E8);background:var(--surface,#fff);color:var(--accent,#0A4C9E);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
.oi-tabs button.on{background:var(--soft,#DCE9FA);border-color:var(--accent,#0A4C9E)}
.oi-rot{display:flex;justify-content:center;gap:8px;margin:6px 0}
.oi-rot button{width:52px;font-size:20px}
.oi-info{text-align:center;font-size:13px;color:var(--muted,#44597D);margin:4px 0 10px}
.oi-az{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.oi-az button.pri{background:var(--yellow,#FFC20E);border-color:var(--yellow,#FFC20E);color:var(--on-yellow,#072F63);font-weight:800}
.oi-az button:disabled,.oi-rot button:disabled{opacity:.5;cursor:default}`;
  document.head.appendChild(st);
}
function oiKB(n) { return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

// Mostra l'anteprima e restituisce il File scelto (null = annullato).
// Per i PDF restituisce subito il file così com'è.
function oiScegli(file) {
  if ((file.type || '').toLowerCase() === 'application/pdf') return Promise.resolve(file);
  oiCSS();
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'oi-ov';
    ov.innerHTML = '<div class="oi-card" role="dialog" aria-modal="true" aria-label="Anteprima immagine">'
      + '<div class="oi-h"><b>Controlla l\'immagine</b><button class="oi-x" data-a="annulla" aria-label="Annulla">×</button></div>'
      + '<div class="oi-tabs"><button data-a="vMig" class="on">Migliorata</button><button data-a="vOrig">Originale</button></div>'
      + '<img class="oi-prev" alt="anteprima">'
      + '<div class="oi-rot"><button data-a="sx" aria-label="Ruota a sinistra">⟲</button><button data-a="dx" aria-label="Ruota a destra">⟳</button></div>'
      + '<div class="oi-info">Elaborazione…</div>'
      + '<div class="oi-az"><button data-a="orig">Usa originale</button><button data-a="mig" class="pri">Usa migliorata</button></div></div>';
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s);
    const img = $('.oi-prev'), info = $('.oi-info');
    let rot = 0, ris = null, vista = 'mig', url = null, lavoro = 0;
    const bottoni = Array.from(ov.querySelectorAll('.oi-rot button,.oi-az button,.oi-tabs button'));
    const mostra = () => {
      if (!ris) return;
      if (url) URL.revokeObjectURL(url);
      const f = vista === 'mig' ? ris.file : ris.base;
      url = URL.createObjectURL(f); img.src = url;
      $('[data-a=vMig]').classList.toggle('on', vista === 'mig');
      $('[data-a=vOrig]').classList.toggle('on', vista !== 'mig');
      info.textContent = ris.migliorata
        ? 'Originale ' + oiKB(ris.base.size) + ' → migliorata ' + oiKB(ris.file.size) + (ris.ritagliata ? ', bordi tagliati' : '')
        : 'L\'immagine è già leggera: verrà usata così (' + oiKB(ris.base.size) + ').';
    };
    const elabora = async () => {
      const mio = ++lavoro;
      bottoni.forEach(b => { b.disabled = true; }); info.textContent = 'Elaborazione…';
      const r = await ottimizzaImmagine(file, { rotazione: rot });
      if (mio !== lavoro) return;
      ris = r; bottoni.forEach(b => { b.disabled = false; });
      if (!ris.migliorata) { vista = 'orig'; $('[data-a=vMig]').disabled = true; }
      mostra();
    };
    const fine = (val) => { lavoro++; if (url) URL.revokeObjectURL(url); ov.remove(); resolve(val); };
    ov.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
      const az = a.dataset.a;
      if (az === 'annulla') return fine(null);
      if (az === 'sx' || az === 'dx') { rot = (rot + (az === 'dx' ? 90 : 270)) % 360; vista = 'mig'; $('[data-a=vMig]').disabled = false; return elabora(); }
      if (az === 'vMig' || az === 'vOrig') { vista = az === 'vMig' ? 'mig' : 'orig'; return mostra(); }
      if (!ris) return;
      if (az === 'mig') return fine(ris.file);
      if (az === 'orig') return fine(ris.base);
    });
    elabora();
  });
}
