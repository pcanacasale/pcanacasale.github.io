// Scrittura della firma nel PDF con pdf-lib. I campi sono in punti PDF, origine in alto a
// sinistra, nella pagina COME SI VEDE: una pagina girata nell'editor resta ruotata nel file
// (/Rotate), quindi coordinate e verso del disegno vanno riportati nello spazio della pagina.

import { degrees, PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

export type Campo = { pagina: number; x: number; y: number; larghezza: number; altezza: number };

// Dalla pagina vista al punto da passare a pdf-lib, per un oggetto il cui angolo in basso a
// sinistra, a schermo, sta in (dx, dy). l, a: larghezza e altezza della pagina non ruotata.
export function puntoPagina(dx: number, dy: number, l: number, a: number, rotazione: number) {
  const r = ((rotazione % 360) + 360) % 360;
  if (r === 90) return { x: dy, y: dx, angolo: 90 };
  if (r === 180) return { x: l - dx, y: dy, angolo: 180 };
  if (r === 270) return { x: l - dy, y: a - dx, angolo: 270 };
  return { x: dx, y: a - dy, angolo: 0 };
}

// Helvetica standard: fuori da Latin-1 un carattere diventa "?"
export const testoSicuro = (s: string) => String(s).replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

export async function scriviFirma(pdfBytes: Uint8Array, campo: Campo, png: Uint8Array, dicitura: string) {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pagina = pdf.getPages()[campo.pagina - 1];
  if (!pagina) throw new Error("campo_non_trovato");
  const { width: l, height: a } = pagina.getSize();
  const rotazione = pagina.getRotation().angle;
  const altezzaVista = rotazione % 180 === 0 ? a : l;

  const img = await pdf.embedPng(png);
  const scala = Math.min(campo.larghezza / img.width, campo.altezza / img.height);
  const w = img.width * scala, h = img.height * scala;
  const p = puntoPagina(campo.x + (campo.larghezza - w) / 2, campo.y + campo.altezza - (campo.altezza - h) / 2, l, a, rotazione);
  pagina.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(p.angolo) });

  // La dicitura sta sotto il campo; se il campo è in fondo alla pagina, sopra
  const yTesto = campo.y + campo.altezza + 7 <= altezzaVista ? campo.y + campo.altezza + 7 : campo.y - 2;
  const t = puntoPagina(campo.x, yTesto, l, a, rotazione);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pagina.drawText(testoSicuro(dicitura), { x: t.x, y: t.y, size: 5.5, font, color: rgb(0.4, 0.45, 0.52), rotate: degrees(t.angolo) });

  return await pdf.save();
}

export async function verificaPdf(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}
