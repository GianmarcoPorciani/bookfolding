// Test di regressione: i valori attesi sono quelli prodotti da Wunderfold
// con le stesse immagini sintetiche (libro pagine 1–401, altezza 21 cm,
// precisione 0,5 mm), registrati durante l'analisi del 3 ottobre 2026.
import { describe, expect, it } from 'vitest';
import { computePattern, shadowActive } from '../pattern';
import { tableRows, fmt, speechFor } from '../format';
import { stripLayout, a4Grid } from '../strips';
import { otsu, otsu2, histogram } from '../image';
import { COLOR_LAYERS, DEFAULT_OPTIONS, type PatternOptions, type RasterImage } from '../types';

type Rect = [number, number, number, number, [number, number, number]];
const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [170, 170, 170];

/** Immagine 200×200 bianca con rettangoli (estremi inclusi). */
function image(rects: Rect[], w = 200, h = 200): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, x1, y1, c] of rects)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
      }
  return { width: w, height: h, data };
}

const book = { firstPage: 1, lastPage: 401, heightCm: 21 };
const opt = (o: Partial<PatternOptions>): PatternOptions => ({ ...DEFAULT_OPTIONS, precisionMm: 0.5, ...o });
const pos = (p: ReturnType<typeof computePattern>, page: number) =>
  p.pages.find((e) => e.page === page)!.marks.map((m) => (m.kind === 'fold' ? `F${m.pos}` : `${m.pos}`));

// Due blocchi neri nelle prime colonne + blocco a destra (come nei test Wunderfold)
const twoBlocks = image([
  [0, 30, 15, 70, BLACK],
  [0, 100, 15, 170, BLACK],
  [150, 10, 199, 190, BLACK],
]);

describe('cut & fold', () => {
  it('inverted: ogni bordo è un taglio', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'inverted' }));
    expect(pos(p, 1)).toEqual(['3.15', '7.45', '10.5', '17.95']);
    expect(pos(p, 3)).toEqual(['3.15', '7.45', '10.5', '17.95']);
    expect(p.availableSheets).toBe(201);
  });
  it('embossed: stesse misure dell’inverted', () => {
    const a = computePattern(twoBlocks, book, opt({ method: 'inverted' }));
    const b = computePattern(twoBlocks, book, opt({ method: 'embossed' }));
    expect(b.pages).toEqual(a.pages);
  });
});

describe('comby', () => {
  it('primo e ultimo bordo sono pieghe, gli altri tagli', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'combi' }));
    expect(pos(p, 1)).toEqual(['F3.15', '7.45', '10.5', 'F17.95']);
  });
  it('tre figure: piega, 4 tagli, piega', () => {
    const img = image([
      [0, 20, 15, 50, BLACK],
      [0, 80, 15, 110, BLACK],
      [0, 140, 15, 180, BLACK],
      [150, 10, 199, 190, BLACK],
    ]);
    const p = computePattern(img, book, opt({ method: 'combi' }));
    expect(pos(p, 1)).toEqual(['F2.1', '5.35', '8.4', '11.65', '14.7', 'F19']);
  });
  it('una sola figura: due pieghe', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'combi' }));
    expect(pos(p, 399)).toEqual(['F1.05', 'F20.05']);
  });
});

describe('MMF', () => {
  it('una coppia di pieghe per pagina, alternando le figure', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'mmf' }));
    expect(pos(p, 1)).toEqual(['F10.5', 'F17.95']);
    expect(pos(p, 3)).toEqual(['F3.15', 'F7.45']);
    expect(pos(p, 5)).toEqual(['F10.5', 'F17.95']);
  });
  it('multilinea: una coppia per ogni riga di testo', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'mmf-multi' }));
    // le righe 30–70 e 100–170 sono separate da righe vuote solo a sinistra,
    // ma il blocco a destra (10–190) le unisce in un'unica banda
    expect(pos(p, 1).length).toBe(2);
    const img = image([
      [0, 20, 199, 60, BLACK],
      [0, 120, 199, 170, BLACK],
    ]);
    const q = computePattern(img, book, opt({ method: 'mmf-multi' }));
    expect(pos(q, 1)).toEqual(['F2.1', 'F6.4', 'F12.6', 'F17.95']);
  });
});

describe('shadow', () => {
  it('1:1 piega una pagina sì e una no', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'shadow', shadowMode: '1:1' }));
    expect(pos(p, 1)).toEqual(['3.15', '7.45', '10.5', '17.95']);
    expect(pos(p, 3)).toEqual([]);
    expect(pos(p, 5)).toEqual(['3.15', '7.45', '10.5', '17.95']);
    expect(pos(p, 7)).toEqual([]);
  });
  it('ritmi 1/3 e 2/3', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => shadowActive(s, '1:2'))).toEqual([true, false, false, true, false, false]);
    expect([0, 1, 2, 3, 4, 5].map((s) => shadowActive(s, '2:1'))).toEqual([true, true, false, true, true, false]);
  });
});

describe('two-tone', () => {
  it('scuro su tutti i fogli, chiaro a fogli alterni', () => {
    const img = image([
      [0, 40, 15, 90, GRAY],
      [0, 120, 15, 170, BLACK],
      [150, 10, 199, 190, BLACK],
    ]);
    const p = computePattern(img, book, opt({ method: 'twotone' }));
    expect(pos(p, 1)).toEqual(['12.6', '17.95']);
    expect(pos(p, 3)).toEqual(['4.2', '9.55', '12.6', '17.95']);
    expect(pos(p, 5)).toEqual(['12.6', '17.95']);
    expect(pos(p, 7)).toEqual(['4.2', '9.55', '12.6', '17.95']);
  });
});

describe('multilivello', () => {
  it('assegna ogni tratto al livello del colore più vicino', () => {
    const img = image([
      [0, 20, 15, 60, [0, 0, 0]],
      [0, 80, 15, 120, [255, 0, 0]],
      [0, 140, 15, 180, [0, 255, 0]],
    ]);
    const p = computePattern(img, book, opt({ method: 'multilayer', layers: COLOR_LAYERS }));
    const m = p.pages[0].marks;
    expect(m.map((x) => `${x.layer}${x.pos}`)).toEqual(['A2.1', 'A6.4', 'B8.4', 'B12.7', 'C14.7', 'C19']);
  });
  it('rispetta lo shadow per livello', () => {
    const img = image([[0, 20, 15, 60, [255, 0, 0]]]);
    const layers = COLOR_LAYERS.map((l) => (l.code === 'B' ? { ...l, shadow: '1:1' as const } : l));
    const p = computePattern(img, book, opt({ method: 'multilayer', layers }));
    expect(p.pages[0].marks.length).toBe(2);
    expect(p.pages[1].marks.length).toBe(0);
  });
});

describe('fogli e centratura', () => {
  it('centra il disegno se usa meno fogli di quelli disponibili', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'inverted', widthMode: 'sheets', sheets: 101 }));
    expect(p.usedSheets).toBe(101);
    expect(p.offset).toBe(50);
    expect(p.pages[49].marks).toEqual([]);
    expect(p.pages[50].sheet).toBe(0);
    expect(p.pages[50].page).toBe(101);
  });
  it('precisione 1 mm', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'inverted', precisionMm: 1 }));
    expect(pos(p, 1)).toEqual(['3.2', '7.5', '10.5', '18']);
  });
  it('linguetta minima: elimina tratti troppo corti', () => {
    const img = image([[0, 50, 199, 50, BLACK]]); // una riga = 1,05 mm
    const p = computePattern(img, book, opt({ method: 'inverted', minTabMm: 2, minGapMm: 2 }));
    expect(p.totalMarks).toBe(0);
  });
});

describe('formattazione', () => {
  it('virgola decimale e intervalli di pagine saltate', () => {
    expect(fmt(17.95, 0.5)).toBe('17,95');
    expect(fmt(12.6, 0.5)).toBe('12,6');
    expect(fmt(6.7, 1)).toBe('6,7');
    expect(fmt(6.7, 1, '.')).toBe('6.7');
    const p = computePattern(twoBlocks, book, opt({ method: 'inverted' }));
    const rows = tableRows(p);
    expect(rows[0].pages).toBe('1');
    const skip = rows.find((r) => r.skip)!;
    expect(skip.pages).toBe('33–301');
  });
  it('lettura vocale', () => {
    const p = computePattern(twoBlocks, book, opt({ method: 'combi' }));
    expect(speechFor(p.pages[0], 'combi', 0.5)).toBe(
      'Pagina 1. Piega 3 virgola 15. Taglio 7 virgola 45. Taglio 10 virgola 5. Piega 17 virgola 95.',
    );
  });
});

describe('soglie automatiche', () => {
  it('otsu fra nero e bianco', () => {
    const t = otsu(histogram(twoBlocks));
    expect(t).toBeGreaterThan(50);
    expect(t).toBeLessThan(205);
  });
  it('otsu a due soglie separa nero, grigio e bianco', () => {
    const img = image([
      [0, 0, 50, 50, BLACK],
      [60, 60, 120, 120, GRAY],
    ]);
    const [a, b] = otsu2(histogram(img));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(170);
    expect(b).toBeGreaterThan(170);
    expect(b).toBeLessThan(255);
  });
});

describe('strip e lenticolare', () => {
  it('una fetta per foglio', () => {
    const l = stripLayout({ width: 200 }, { firstPage: 1, lastPage: 21, heightCm: 21 });
    expect(l.slices.length).toBe(11);
    expect(l.slices[0]).toMatchObject({ page: 1, x0: 0 });
    expect(l.slices[10].x1).toBe(200);
  });
  it('impaginazione A4', () => {
    const g = a4Grid(1.5, 21, 144);
    expect(g.perRow).toBe(12);
    expect(g.rows).toBe(1);
    expect(g.sheets).toBe(12);
    expect(a4Grid(1.5, 10, 154).rows).toBe(2);
  });
});
