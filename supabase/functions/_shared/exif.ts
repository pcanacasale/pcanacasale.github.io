// Lettura delle coordinate GPS dall'EXIF di un JPEG, senza librerie.
// Restituisce null per tutto ciò che non è un dato valido: qui il file arriva da fuori,
// quindi ogni offset viene controllato prima di leggerlo.

export function leggiGpsExif(bytes: Uint8Array): { lat: number; lon: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return null;
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) return null;   // iniziano i dati immagine
    const lung = (bytes[p + 2] << 8) | bytes[p + 3];
    if (lung < 2 || p + 2 + lung > bytes.length) return null;
    if (marker === 0xe1 && lung >= 8 && String.fromCharCode(...bytes.subarray(p + 4, p + 10)) === 'Exif\0\0') {
      return gpsDaTiff(bytes.subarray(p + 10, p + 2 + lung));
    }
    p += 2 + lung;
  }
  return null;
}

function gpsDaTiff(t: Uint8Array) {
  if (t.length < 8) return null;
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const ordine = String.fromCharCode(t[0], t[1]);
  if (ordine !== 'II' && ordine !== 'MM') return null;
  const le = ordine === 'II';
  if (v.getUint16(2, le) !== 42) return null;
  const u16 = (o: number) => o + 2 <= t.length ? v.getUint16(o, le) : null;
  const u32 = (o: number) => o + 4 <= t.length ? v.getUint32(o, le) : null;

  const voci = (ifd: number | null) => {
    const out = new Map<number, { tipo: number; n: number; pos: number }>();
    if (ifd === null) return out;
    const n = u16(ifd);
    if (n === null) return out;
    for (let i = 0; i < n; i++) {
      const o = ifd + 2 + i * 12;
      if (o + 12 > t.length) break;
      out.set(v.getUint16(o, le), { tipo: v.getUint16(o + 2, le), n: v.getUint32(o + 4, le), pos: o + 8 });
    }
    return out;
  };

  const puntatore = voci(u32(4)).get(0x8825);
  if (!puntatore) return null;
  const gps = voci(u32(puntatore.pos));

  const lettera = (tag: number) => {
    const e = gps.get(tag);
    return e && e.pos < t.length ? String.fromCharCode(t[e.pos]).toUpperCase() : '';
  };
  const gradi = (tag: number) => {
    const e = gps.get(tag);
    if (!e || e.tipo !== 5 || e.n !== 3) return null;
    const dati = u32(e.pos);
    if (dati === null || dati + 24 > t.length) return null;
    const r = (i: number) => {
      const den = v.getUint32(dati + i * 8 + 4, le);
      return den ? v.getUint32(dati + i * 8, le) / den : NaN;
    };
    const g = r(0) + r(1) / 60 + r(2) / 3600;
    return Number.isFinite(g) ? g : null;
  };

  const rifLat = lettera(1), rifLon = lettera(3), lat = gradi(2), lon = gradi(4);
  if (lat === null || lon === null || !['N', 'S'].includes(rifLat) || !['E', 'W'].includes(rifLon)) return null;
  const a = rifLat === 'S' ? -lat : lat, o = rifLon === 'W' ? -lon : lon;
  if (a < -90 || a > 90 || o < -180 || o > 180) return null;
  if (a === 0 && o === 0) return null;   // molte fotocamere scrivono zero quando non hanno il segnale
  return { lat: a, lon: o };
}
