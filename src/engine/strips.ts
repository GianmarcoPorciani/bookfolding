// Strip art e lenticolare: suddivisione dell'immagine in strisce per foglio.
import { availableSheets } from './pattern';
import type { BookSettings, RasterImage } from './types';

export interface StripSlice {
  page: number;
  sheet: number;
  /** Colonne di pixel [x0, x1) della fetta nell'immagine sorgente. */
  x0: number;
  x1: number;
}

export interface StripLayout {
  slices: StripSlice[];
  usedSheets: number;
  offset: number;
}

/**
 * Fette d'immagine per ogni foglio. Ogni fetta ha almeno una colonna di pixel;
 * se l'immagine è più stretta del numero di fogli le colonne si ripetono.
 */
export function stripLayout(
  img: Pick<RasterImage, 'width'>,
  book: BookSettings,
  sheets?: number,
): StripLayout {
  const N = availableSheets(book);
  const n = sheets && sheets > 0 ? Math.min(sheets, N) : N;
  const offset = Math.floor((N - n) / 2);
  const slices: StripSlice[] = [];
  for (let s = 0; s < n; s++) {
    let x0 = Math.floor((s * img.width) / n);
    let x1 = Math.floor(((s + 1) * img.width) / n);
    if (x1 <= x0) {
      x0 = Math.min(img.width - 1, x0);
      x1 = x0 + 1;
    }
    slices.push({ page: book.firstPage + 2 * (s + offset), sheet: s, x0, x1 });
  }
  return { slices, usedSheets: n, offset };
}

export interface SheetGrid {
  /** Strisce per riga sull'A4. */
  perRow: number;
  /** Righe di strisce per foglio A4. */
  rows: number;
  /** Fogli A4 necessari. */
  sheets: number;
}

/** Quante strisce stanno su un A4 verticale (210 × 297 mm) con margini e righello. */
export function a4Grid(stripWidthCm: number, heightCm: number, count: number): SheetGrid {
  const usableW = 21 - 1.0 * 2 - 1.0; // margini + righello
  const usableH = 29.7 - 1.0 * 2;
  const perRow = Math.max(1, Math.floor(usableW / stripWidthCm));
  const rowH = heightCm + 1.2; // spazio per i numeri sopra e sotto
  const rows = Math.max(1, Math.floor(usableH / rowH));
  return { perRow, rows, sheets: Math.ceil(count / (perRow * rows)) };
}
