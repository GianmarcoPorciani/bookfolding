// Profilo del taglio di ogni pagina per l'anteprima 3D: per ogni altezza y (cm
// dal bordo alto) restituisce quanto sporge la pagina dal dorso (cm).
import type { Mark, Pattern } from './types';

export interface ReliefParams {
  /** Larghezza della pagina dal dorso al taglio, in cm. */
  pageWidthCm: number;
  /** Profondità di piega/taglio predefinita, in cm. */
  depthCm: number;
}

type Seg = [number, number];

const pairs = (m: Mark[]): Seg[] => {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < m.length; i += 2) out.push([m[i].pos, m[i + 1].pos]);
  return out;
};

const inside = (y: number, s: Seg[]) => s.some(([a, b]) => y >= a && y < b);

/**
 * Sporgenza della pagina `idx` all'altezza y. Le pagine non lavorate restano
 * piene; i tratti piegati rientrano della profondità di taglio (o del livello);
 * le pieghe MMF e le pieghe esterne del comby tagliano l'angolo a 45°.
 */
export function edgeAt(p: Pattern, idx: number, y: number, r: ReliefParams): number {
  const W = r.pageWidthCm;
  const D = Math.min(r.depthCm, W);
  const e = p.pages[idx];
  if (!e || !e.marks.length) return W;
  const m = e.marks;
  // Piega MMF a 45°: angolo alto piegato fino ad a, angolo basso fino a b
  const mmf = (a: number, b: number) => {
    if (y < a) return Math.max(0, W - (a - y));
    if (y > b) return Math.max(0, W - (y - b));
    return W;
  };
  switch (p.method) {
    case 'inverted':
    case 'shadow':
    case 'twotone':
      return inside(y, pairs(m)) ? W - D : W;
    case 'embossed':
      return inside(y, pairs(m)) ? W : W - D;
    case 'multilayer': {
      for (let i = 0; i + 1 < m.length; i += 2) {
        if (y >= m[i].pos && y < m[i + 1].pos) {
          const code = m[i].layer;
          const li = p.options.layers.findIndex((l) => l.code === code);
          const layer = p.options.layers[li];
          const d = layer?.depthCm ?? D * ((li + 1) / Math.max(1, p.options.layers.length));
          return W - Math.min(W, d);
        }
      }
      return W;
    }
    case 'mmf':
      return mmf(m[0].pos, m[1].pos);
    case 'mmf-multi': {
      // più coppie: la pagina sporge solo dentro le coppie, con angoli a 45° verso le altre
      const s = pairs(m);
      let best = 0;
      for (const [a, b] of s) {
        const v = y < a ? W - (a - y) : y > b ? W - (y - b) : W;
        best = Math.max(best, v);
      }
      return Math.max(0, best);
    }
    case 'combi': {
      const a = m[0].pos;
      const b = m[m.length - 1].pos;
      const outer = mmf(a, b);
      if (outer < W) return outer;
      // tagli interni: gli spazi fra i tratti si piegano verso l'interno
      const runs = pairs(m);
      for (let i = 0; i + 1 < runs.length; i++) {
        if (y >= runs[i][1] && y < runs[i + 1][0]) return W - D;
      }
      return W;
    }
    default:
      return W;
  }
}
