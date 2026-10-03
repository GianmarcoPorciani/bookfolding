// Strip art e lenticolare: suddivisione dell'immagine in strisce per foglio.
import { availableSheets } from './pattern';
import type { BookSettings, RasterImage } from './types';

/** Ritaglio della foto in percentuale per lato (0–95). */
export interface CropPercent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface StripParams {
  /** Larghezza di una striscia (colonna di taglio) in cm. */
  widthCm: number;
  /** Fogli lasciati vuoti all'inizio e alla fine (se entrambi 0 vale la centratura). */
  emptyStart: number;
  emptyEnd: number;
  /** Margini vuoti sopra e sotto la foto, in cm. */
  marginTopCm: number;
  marginBottomCm: number;
  crop: CropPercent;
  /** Linee di taglio. */
  lineColor: string;
  lineWidthMm: number;
}

export const DEFAULT_STRIP: StripParams = {
  widthCm: 1.5,
  emptyStart: 0,
  emptyEnd: 0,
  marginTopCm: 0,
  marginBottomCm: 0,
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
  lineColor: '#1d2b33',
  lineWidthMm: 0.2,
};

/** Rettangolo sorgente in pixel dopo il ritaglio percentuale. */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cropRect(img: Pick<RasterImage, 'width' | 'height'>, c: CropPercent): SourceRect {
  const l = Math.max(0, c.left) / 100;
  const r = Math.max(0, c.right) / 100;
  const t = Math.max(0, c.top) / 100;
  const b = Math.max(0, c.bottom) / 100;
  if (l + r >= 0.98 || t + b >= 0.98) throw new Error('Il ritaglio toglie tutta la foto.');
  return { x: img.width * l, y: img.height * t, w: img.width * (1 - l - r), h: img.height * (1 - t - b) };
}

/**
 * Ritaglio automatico: rettangolo che contiene i pixel di disegno (non trasparenti
 * e non quasi bianchi), espresso in percentuale per lato.
 */
export function autoCrop(img: RasterImage, whiteThreshold = 240): CropPercent {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const d = img.data;
      const empty = d[i + 3] < 16 || (d[i] >= whiteThreshold && d[i + 1] >= whiteThreshold && d[i + 2] >= whiteThreshold);
      if (!empty) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { left: 0, right: 0, top: 0, bottom: 0 };
  const pct = (v: number) => Math.max(0, Math.floor(v * 1000) / 10);
  return {
    left: pct(minX / img.width),
    top: pct(minY / img.height),
    right: pct((img.width - maxX - 1) / img.width),
    bottom: pct((img.height - maxY - 1) / img.height),
  };
}

export interface StripSlice {
  page: number;
  sheet: number;
  /** Colonne di pixel [x0, x1) della fetta nell'immagine sorgente (dopo il ritaglio). */
  x0: number;
  x1: number;
}

export interface StripLayout {
  slices: StripSlice[];
  availableSheets: number;
  usedSheets: number;
  offset: number;
  source: SourceRect;
}

/**
 * Fette d'immagine per ogni foglio. Fogli usati: tutti, oppure quelli fra i
 * fogli vuoti di inizio e fine, oppure il numero richiesto centrato.
 */
export function stripLayout(
  img: Pick<RasterImage, 'width' | 'height'>,
  book: BookSettings,
  opts: { sheets?: number; emptyStart?: number; emptyEnd?: number; crop?: CropPercent } = {},
): StripLayout {
  const N = availableSheets(book);
  const es = Math.max(0, Math.floor(opts.emptyStart ?? 0));
  const ee = Math.max(0, Math.floor(opts.emptyEnd ?? 0));
  let n: number;
  let offset: number;
  if (es > 0 || ee > 0) {
    n = N - es - ee;
    if (n <= 0) throw new Error('I fogli vuoti occupano tutto il libro.');
    offset = es;
  } else {
    n = opts.sheets && opts.sheets > 0 ? Math.min(opts.sheets, N) : N;
    offset = Math.floor((N - n) / 2);
  }
  const src = cropRect(img, opts.crop ?? { left: 0, right: 0, top: 0, bottom: 0 });
  const slices: StripSlice[] = [];
  for (let s = 0; s < n; s++) {
    const x0 = src.x + (s * src.w) / n;
    const x1 = src.x + ((s + 1) * src.w) / n;
    slices.push({ page: book.firstPage + 2 * (s + offset), sheet: s, x0, x1 });
  }
  return { slices, availableSheets: N, usedSheets: n, offset, source: src };
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
  const usableW = 21 - 1.2 * 2 - 0.8; // margini + righello
  const usableH = 29.7 - 1.2 - 1.5;
  const perRow = Math.max(1, Math.floor(usableW / stripWidthCm + 1e-9));
  const rowH = heightCm + 1.2; // spazio per i numeri sopra e sotto
  const rows = Math.max(1, Math.floor(usableH / rowH));
  return { perRow, rows, sheets: Math.ceil(count / (perRow * rows)) };
}

/** Altezza massima del libro che sta su un A4 in scala reale. */
export const MAX_STRIP_HEIGHT_CM = Math.floor(29.7 - 1.2 - 1.5 - 1.2);
