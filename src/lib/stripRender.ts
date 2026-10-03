// Disegno delle strisce (strip art e lenticolare) su un canvas, condiviso da
// anteprima, PDF ed Excel.
import type { StripLayout, StripParams } from '../engine/strips';

export interface StripSources {
  a: CanvasImageSource;
  /** Immagine B del lenticolare con il suo rettangolo sorgente. */
  b?: { img: CanvasImageSource; width: number; height: number };
}

/**
 * Disegna le strisce [from, to) a partire da (x0, y0). Le unità sono pixel del
 * canvas: pxPerCm decide la scala. Le linee di taglio sono escluse: chi chiama
 * le disegna come vettori (PDF) o le aggiunge con drawCutLines.
 */
export function drawStrips(
  g: CanvasRenderingContext2D,
  kind: 'strip' | 'lenticular',
  src: StripSources,
  layout: StripLayout,
  p: StripParams,
  heightCm: number,
  from: number,
  to: number,
  x0: number,
  y0: number,
  pxPerCm: number,
) {
  const sw = p.widthCm * pxPerCm;
  const top = y0 + p.marginTopCm * pxPerCm;
  const h = (heightCm - p.marginTopCm - p.marginBottomCm) * pxPerCm;
  if (h <= 0) return;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const S = layout.source;
  for (let i = from; i < to; i++) {
    const sl = layout.slices[i];
    const x = x0 + (i - from) * sw;
    const w = Math.max(0.5, sl.x1 - sl.x0);
    if (kind === 'lenticular' && src.b) {
      g.drawImage(src.a, sl.x0, S.y, w, S.h, x, top, sw / 2, h);
      const bw = src.b.width / layout.usedSheets;
      g.drawImage(src.b.img, sl.sheet * bw, 0, Math.max(0.5, bw), src.b.height, x + sw / 2, top, sw / 2, h);
    } else {
      g.drawImage(src.a, sl.x0, S.y, w, S.h, x, top, sw, h);
    }
  }
}

/** Linee di taglio verticali e bordi sopra e sotto, per anteprima ed Excel. */
export function drawCutLines(
  g: CanvasRenderingContext2D,
  count: number,
  heightCm: number,
  x0: number,
  y0: number,
  pxPerCm: number,
  p: StripParams,
  lenticular: boolean,
) {
  const sw = p.widthCm * pxPerCm;
  const h = heightCm * pxPerCm;
  g.save();
  g.strokeStyle = p.lineColor;
  g.lineWidth = Math.max(1, (p.lineWidthMm / 10) * pxPerCm);
  g.beginPath();
  for (let c = 0; c <= count; c++) {
    g.moveTo(x0 + c * sw, y0);
    g.lineTo(x0 + c * sw, y0 + h);
  }
  g.moveTo(x0, y0);
  g.lineTo(x0 + count * sw, y0);
  g.moveTo(x0, y0 + h);
  g.lineTo(x0 + count * sw, y0 + h);
  g.stroke();
  if (lenticular) {
    g.setLineDash([pxPerCm * 0.15, pxPerCm * 0.15]);
    g.beginPath();
    for (let c = 0; c < count; c++) {
      g.moveTo(x0 + c * sw + sw / 2, y0);
      g.lineTo(x0 + c * sw + sw / 2, y0 + h);
    }
    g.stroke();
  }
  g.restore();
}
