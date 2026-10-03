// Disegno dell'anteprima: il taglio del libro visto di fronte, un filo per pagina.
import type { Layer, Pattern } from '../engine/types';

export const COLORS = {
  paper: '#f7f6f1',
  page: '#dcd9cf',
  ink: '#1d2b33',
  cut: '#b4232a',
  fold: '#2563a8',
  mark: '#f2d04b',
};

/** Segmenti piegati di una pagina, in cm. */
export function foldedSegments(p: Pattern, idx: number): { a: number; b: number; layer?: string }[] {
  const e = p.pages[idx];
  const segs: { a: number; b: number; layer?: string }[] = [];
  for (let i = 0; i + 1 < e.marks.length; i += 2)
    segs.push({ a: e.marks[i].pos, b: e.marks[i + 1].pos, layer: e.marks[i].layer });
  if (p.method === 'embossed' && e.marks.length) {
    // nell'embossed si piegano gli spazi: complemento dei tratti
    const out: { a: number; b: number }[] = [];
    let y = 0;
    for (const s of segs) {
      if (s.a > y) out.push({ a: y, b: s.a });
      y = s.b;
    }
    if (y < p.book.heightCm) out.push({ a: y, b: p.book.heightCm });
    return out;
  }
  return segs;
}

/**
 * Disegna l'anteprima del risultato: ogni pagina lavorata è un filo verticale,
 * i tratti piegati sono in inchiostro, le pagine intatte restano chiare.
 */
export function drawPreview(
  canvas: HTMLCanvasElement,
  p: Pattern,
  opts: { highlight?: number; layerColors?: Record<string, string>; width?: number; height?: number } = {},
) {
  const N = p.pages.length;
  const H = opts.height ?? canvas.height;
  const W = opts.width ?? canvas.width;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  g.fillStyle = COLORS.paper;
  g.fillRect(0, 0, W, H);
  if (!N) return;
  const pad = 8;
  const colW = (W - pad * 2) / N;
  const scale = (H - pad * 2) / p.book.heightCm;
  // pagine
  g.fillStyle = COLORS.page;
  for (let i = 0; i < N; i++) {
    const x = pad + i * colW;
    g.fillRect(x, pad, Math.max(1, colW * 0.62), H - pad * 2);
  }
  for (let i = 0; i < N; i++) {
    const x = pad + i * colW;
    for (const s of foldedSegments(p, i)) {
      g.fillStyle = (s.layer && opts.layerColors?.[s.layer]) || COLORS.ink;
      g.fillRect(x, pad + s.a * scale, Math.max(1, colW * 0.82), Math.max(1, (s.b - s.a) * scale));
    }
  }
  if (opts.highlight !== undefined && opts.highlight >= 0) {
    const x = pad + opts.highlight * colW;
    g.strokeStyle = COLORS.mark;
    g.lineWidth = Math.max(3, colW);
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(x + colW / 2, 0);
    g.lineTo(x + colW / 2, H);
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** Anteprima come data URL PNG (per il PDF). */
export function previewDataUrl(p: Pattern, w = 1200, h = 600, layerColors?: Record<string, string>): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawPreview(c, p, { layerColors });
  return c.toDataURL('image/png');
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function layerColorMap(layers: Layer[]): Record<string, string> {
  return Object.fromEntries(layers.map((l) => [l.code, rgbToHex(l.color)]));
}
