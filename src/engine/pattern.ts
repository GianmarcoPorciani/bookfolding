// Calcolo dello schema: dall'immagine alle misure per ogni pagina.
import {
  colorDistance2,
  contentColumns,
  cropColumns,
  histogram,
  luminance,
  otsu,
  otsu2,
  pixelRGB,
} from './image';
import type {
  BookSettings,
  Layer,
  Mark,
  PageEntry,
  Pattern,
  PatternOptions,
  RasterImage,
  RGB,
  ShadowMode,
} from './types';

/** Tratto verticale in cm (non arrotondato): [inizio, fine). */
type Run = [number, number];

/** Numero di fogli disponibili fra prima e ultima pagina (una pagina dispari per foglio). */
export function availableSheets(book: BookSettings): number {
  if (book.lastPage < book.firstPage) return 0;
  return Math.floor((book.lastPage - book.firstPage) / 2) + 1;
}

/** true se il foglio s lavora con il ritmo shadow indicato. */
export function shadowActive(s: number, mode: ShadowMode): boolean {
  switch (mode) {
    case '1:1':
      return s % 2 === 0;
    case '1:2':
      return s % 3 === 0;
    case '2:1':
      return s % 3 !== 2;
  }
}

/** Arrotonda una misura in cm alla precisione in mm. */
export function roundTo(cm: number, precisionMm: number): number {
  const q = precisionMm / 10;
  const k = Math.round(cm / q + 1e-9);
  return Number((k * q).toFixed(2));
}

/** Classificatore dei pixel: 0 = sfondo, altrimenti classe (1 = figura, 2 = scuro, livello+1…). */
export type Classifier = (rgb: RGB) => number;

export function buildClassifier(img: RasterImage, opt: PatternOptions): Classifier {
  const lum = (rgb: RGB) => (opt.invert ? 255 - luminance(rgb) : luminance(rgb));
  if (opt.method === 'twotone') {
    let t: [number, number];
    if (opt.twoToneThresholds === 'auto') {
      const h = histogram(img);
      t = otsu2(opt.invert ? [...h].reverse() : h);
    } else {
      t = opt.twoToneThresholds;
    }
    return (rgb) => {
      const l = lum(rgb);
      if (l < t[0]) return 2; // scuro
      if (l < t[1]) return 1; // chiaro
      return 0;
    };
  }
  if (opt.method === 'multilayer') {
    const palette: RGB[] = [[255, 255, 255], ...opt.layers.map((l) => l.color)];
    return (rgb) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const d = colorDistance2(rgb, palette[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
  }
  let t: number;
  if (opt.threshold === 'auto') {
    const h = histogram(img);
    t = otsu(opt.invert ? [...h].reverse() : h);
  } else {
    t = opt.threshold;
  }
  return (rgb) => (lum(rgb) < t ? 1 : 0);
}

/** Classi di ogni riga di pixel nella colonna x. */
function columnClasses(img: RasterImage, x: number, cls: Classifier): Uint8Array {
  const out = new Uint8Array(img.height);
  for (let y = 0; y < img.height; y++) out[y] = cls(pixelRGB(img, x, y));
  return out;
}

/** Tratti di righe che soddisfano il predicato, convertiti in cm. */
function runsOf(classes: Uint8Array, pred: (c: number) => boolean, cmPerPx: number): Run[] {
  const runs: Run[] = [];
  let start = -1;
  for (let y = 0; y <= classes.length; y++) {
    const on = y < classes.length && pred(classes[y]);
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      runs.push([start * cmPerPx, y * cmPerPx]);
      start = -1;
    }
  }
  return runs;
}

/** Fonde gli spazi troppo stretti, elimina i tratti troppo corti, arrotonda. */
export function cleanRuns(runs: Run[], opt: PatternOptions): Run[] {
  const minGap = opt.minGapMm / 10;
  const minTab = opt.minTabMm / 10;
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < minGap - 1e-9) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  const out: Run[] = [];
  for (const r of merged) {
    if (r[1] - r[0] < minTab - 1e-9) continue;
    const a = roundTo(r[0], opt.precisionMm);
    const b = roundTo(r[1], opt.precisionMm);
    if (b <= a) continue;
    const prev = out[out.length - 1];
    if (prev && a <= prev[1]) prev[1] = Math.max(prev[1], b);
    else out.push([a, b]);
  }
  return out;
}

const cuts = (runs: Run[], layer?: string): Mark[] =>
  runs.flatMap(([a, b]) => [
    { pos: a, kind: 'cut' as const, layer },
    { pos: b, kind: 'cut' as const, layer },
  ]);

/** Bande di righe con contenuto, separate da righe completamente vuote (MMF multilinea). */
function textBands(columns: Uint8Array[], height: number): [number, number][] {
  const used = new Uint8Array(height);
  for (const col of columns) for (let y = 0; y < height; y++) if (col[y]) used[y] = 1;
  const bands: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    const on = y < height && used[y] === 1;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      bands.push([start, y]);
      start = -1;
    }
  }
  return bands;
}

/**
 * Calcola lo schema completo. Per strip e lenticolare restituisce solo la
 * suddivisione delle pagine (le misure non servono): vedi strips.ts.
 */
export function computePattern(
  source: RasterImage,
  book: BookSettings,
  opt: PatternOptions,
): Pattern {
  const warnings: string[] = [];
  const N = availableSheets(book);
  let img = source;
  const cls0 = buildClassifier(img, opt);

  if (opt.cropSides && opt.method !== 'strip' && opt.method !== 'lenticular') {
    const [x0, x1] = contentColumns(img, (rgb) => cls0(rgb) > 0);
    img = cropColumns(img, x0, x1);
  }
  const cls = cls0;

  // Numero di fogli occupati dal disegno.
  let n = N;
  if (opt.widthMode === 'sheets' && opt.sheets && opt.sheets > 0) n = Math.min(opt.sheets, N);
  if (opt.widthMode === 'proportional') {
    const widthCm = (img.width / img.height) * book.heightCm;
    n = Math.min(N, Math.max(1, Math.round(widthCm / opt.sheetSpacingCm)));
  }
  if (opt.widthMode !== 'fill' && n < N) {
    // nessun avviso: è la centratura richiesta
  }
  if (n > N) n = N;
  const offset = Math.floor((N - n) / 2);
  if (N === 0) warnings.push("L'ultima pagina deve essere successiva alla prima.");

  const cmPerPx = book.heightCm / img.height;
  const columns: Uint8Array[] = [];
  for (let s = 0; s < n; s++) {
    const x = Math.min(img.width - 1, Math.floor(((s + 0.5) * img.width) / n));
    columns.push(columnClasses(img, x, cls));
  }

  const bands = opt.method === 'mmf-multi' ? textBands(columns, img.height) : [];

  const pageEntries: PageEntry[] = [];
  let maxMarks = 0;
  for (let k = 0; k < N; k++) {
    const page = book.firstPage + 2 * k;
    const s = k - offset;
    if (s < 0 || s >= n) {
      pageEntries.push({ page, sheet: -1, marks: [] });
      continue;
    }
    const col = columns[s];
    let marks: Mark[] = [];
    switch (opt.method) {
      case 'inverted':
      case 'embossed':
      case 'strip':
      case 'lenticular': {
        marks = cuts(cleanRuns(runsOf(col, (c) => c > 0, cmPerPx), opt));
        break;
      }
      case 'shadow': {
        if (shadowActive(s, opt.shadowMode))
          marks = cuts(cleanRuns(runsOf(col, (c) => c > 0, cmPerPx), opt));
        break;
      }
      case 'combi': {
        const runs = cleanRuns(runsOf(col, (c) => c > 0, cmPerPx), opt);
        const edges = runs.flatMap((r) => r);
        marks = edges.map((pos, i) => ({
          pos,
          kind: i === 0 || i === edges.length - 1 ? ('fold' as const) : ('cut' as const),
        }));
        break;
      }
      case 'mmf': {
        const runs = cleanRuns(runsOf(col, (c) => c > 0, cmPerPx), opt);
        if (runs.length) {
          const r = runs[(s + 1) % runs.length];
          marks = [
            { pos: r[0], kind: 'fold' },
            { pos: r[1], kind: 'fold' },
          ];
        }
        if (runs.length * 2 > 6) maxMarks = Math.max(maxMarks, runs.length * 2);
        break;
      }
      case 'mmf-multi': {
        for (const [y0, y1] of bands) {
          const sub = col.subarray(y0, y1);
          const runs = cleanRuns(
            runsOf(sub, (c) => c > 0, cmPerPx).map(([a, b]) => [a + y0 * cmPerPx, b + y0 * cmPerPx] as Run),
            opt,
          );
          if (!runs.length) continue;
          const r = runs[(s + 1) % runs.length];
          marks.push({ pos: r[0], kind: 'fold' }, { pos: r[1], kind: 'fold' });
        }
        break;
      }
      case 'twotone': {
        const lightOn = s % 2 === 1;
        marks = cuts(cleanRuns(runsOf(col, (c) => c === 2 || (lightOn && c === 1), cmPerPx), opt));
        break;
      }
      case 'multilayer': {
        const all: Mark[] = [];
        opt.layers.forEach((layer: Layer, i: number) => {
          const mode = layer.shadow && layer.shadow !== 'none' ? layer.shadow : null;
          if (mode && !shadowActive(s, mode)) return;
          all.push(...cuts(cleanRuns(runsOf(col, (c) => c === i + 1, cmPerPx), opt), layer.code));
        });
        // Ordina per segmento (coppie) in base all'inizio
        const pairs: Mark[][] = [];
        for (let i = 0; i < all.length; i += 2) pairs.push([all[i], all[i + 1]]);
        pairs.sort((a, b) => a[0].pos - b[0].pos);
        marks = pairs.flat();
        break;
      }
    }
    pageEntries.push({ page, sheet: s, marks });
  }

  if (opt.method === 'mmf' && maxMarks > 6)
    warnings.push(
      `Alcune pagine hanno fino a ${maxMarks} segni: con l'MMF oltre 6 segni il disegno perde leggibilità. Valuta il cut & fold o l'MMF multilinea.`,
    );

  const totalMarks = pageEntries.reduce((a, p) => a + p.marks.length, 0);
  return {
    method: opt.method,
    book,
    options: opt,
    pages: pageEntries,
    availableSheets: N,
    usedSheets: n,
    offset,
    totalMarks,
    warnings,
  };
}
