// Profilo del taglio per la vista 3D.
import { describe, expect, it } from 'vitest';
import { edgeAt, foldFlaps } from '../relief';
import { DEFAULT_OPTIONS, type Pattern, type PageEntry, type Method } from '../types';

const page = (marks: [number, 'cut' | 'fold'][]): PageEntry => ({
  page: 1,
  sheet: 0,
  marks: marks.map(([pos, kind]) => ({ pos, kind })),
});
const pat = (method: Method, e: PageEntry): Pattern => ({
  method,
  book: { firstPage: 1, lastPage: 1, heightCm: 21 },
  options: { ...DEFAULT_OPTIONS, method },
  pages: [e],
  availableSheets: 1,
  usedSheets: 1,
  offset: 0,
  totalMarks: e.marks.length,
  warnings: [],
});
const r = { pageWidthCm: 14, depthCm: 2 };

describe('profilo 3D', () => {
  it('inverted: rientra fra i tagli', () => {
    const p = pat('inverted', page([[5, 'cut'], [10, 'cut']]));
    expect(edgeAt(p, 0, 7, r)).toBe(12);
    expect(edgeAt(p, 0, 3, r)).toBe(14);
  });
  it('embossed: rientra fuori dai tagli', () => {
    const p = pat('embossed', page([[5, 'cut'], [10, 'cut']]));
    expect(edgeAt(p, 0, 7, r)).toBe(14);
    expect(edgeAt(p, 0, 3, r)).toBe(12);
  });
  it('MMF: angoli piegati a 45°', () => {
    const p = pat('mmf', page([[5, 'fold'], [15, 'fold']]));
    expect(edgeAt(p, 0, 10, r)).toBe(14);
    expect(edgeAt(p, 0, 3, r)).toBe(12);
    expect(edgeAt(p, 0, 18, r)).toBe(11);
  });
  it('comby: pieghe esterne e tagli interni', () => {
    const p = pat('combi', page([[4, 'fold'], [8, 'cut'], [12, 'cut'], [16, 'fold']]));
    expect(edgeAt(p, 0, 2, r)).toBe(12);
    expect(edgeAt(p, 0, 6, r)).toBe(14);
    expect(edgeAt(p, 0, 10, r)).toBe(12);
    expect(edgeAt(p, 0, 14, r)).toBe(14);
  });
  it('pagina saltata resta piena', () => {
    const p = pat('shadow', page([]));
    expect(edgeAt(p, 0, 10, r)).toBe(14);
  });
});

describe('lembi piegati', () => {
  it('cut & fold: un rettangolo per coppia di tagli', () => {
    const p = pat('inverted', page([[5, 'cut'], [10, 'cut']]));
    expect(foldFlaps(p, 0, r)).toEqual([[[10, 5], [12, 5], [12, 10], [10, 10]]]);
  });
  it('MMF: triangoli a 45° in alto e in basso', () => {
    const p = pat('mmf', page([[5, 'fold'], [15, 'fold']]));
    const [top, bottom] = foldFlaps(p, 0, r);
    expect(top).toEqual([[14, 5], [9, 0], [9, 5]]);
    expect(bottom).toEqual([[14, 15], [8, 21], [8, 15]]);
  });
});
