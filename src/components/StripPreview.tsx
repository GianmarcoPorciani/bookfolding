import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookSettings } from '../engine/types';
import { stripLayout, a4Grid } from '../engine/strips';
import { rasterToCanvas, type LoadedImage } from '../lib/raster';

interface Props {
  kind: 'strip' | 'lenticular';
  a: LoadedImage;
  b: LoadedImage | null;
  book: BookSettings;
  sheets?: number;
  stripWidthCm: number;
}

/** Anteprima delle strisce: il risultato sul taglio e il primo foglio da stampare. */
export function StripPreview({ kind, a, b, book, sheets, stripWidthCm }: Props) {
  const layout = useMemo(() => stripLayout(a.raster, book, sheets), [a, book, sheets]);
  const grid = a4Grid(stripWidthCm, book.heightCm, layout.slices.length);
  const ref = useRef<HTMLCanvasElement>(null);
  const [from, setFrom] = useState(0);
  const perSheet = grid.perRow * grid.rows;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const canA = rasterToCanvas(a.raster);
    const canB = b ? rasterToCanvas(b.raster) : null;
    const count = Math.min(grid.perRow, layout.slices.length - from);
    const pxPerCm = 40;
    const sw = stripWidthCm * pxPerCm;
    const h = book.heightCm * pxPerCm;
    c.width = Math.max(1, Math.round(count * sw + 2));
    c.height = Math.round(h + 40);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.font = '12px "Atkinson Hyperlegible", sans-serif';
    g.textAlign = 'center';
    for (let i = 0; i < count; i++) {
      const sl = layout.slices[from + i];
      const x = 1 + i * sw;
      if (kind === 'lenticular' && canB && b) {
        g.drawImage(canA, sl.x0, 0, sl.x1 - sl.x0, canA.height, x, 20, sw / 2, h);
        const bx0 = Math.floor((sl.sheet * b.raster.width) / layout.usedSheets);
        const bx1 = Math.max(bx0 + 1, Math.floor(((sl.sheet + 1) * b.raster.width) / layout.usedSheets));
        g.drawImage(canB, bx0, 0, bx1 - bx0, canB.height, x + sw / 2, 20, sw / 2, h);
        g.setLineDash([3, 3]);
        g.strokeStyle = '#b4232a';
        g.beginPath();
        g.moveTo(x + sw / 2, 20);
        g.lineTo(x + sw / 2, 20 + h);
        g.stroke();
        g.setLineDash([]);
      } else {
        g.drawImage(canA, sl.x0, 0, sl.x1 - sl.x0, canA.height, x, 20, sw, h);
      }
      g.strokeStyle = '#1d2b33';
      g.strokeRect(x, 20, sw, h);
      g.fillStyle = '#1d2b33';
      g.fillText(String(sl.page), x + sw / 2, 14);
      g.fillText(String(sl.page), x + sw / 2, h + 35);
    }
  }, [a, b, kind, layout, from, grid.perRow, stripWidthCm, book.heightCm]);

  return (
    <div className="strip-preview">
      <div className="strip-result">
        <img src={a.dataUrl} alt="Immagine A sul taglio del libro" />
        {kind === 'lenticular' && b && <img src={b.dataUrl} alt="Immagine B sul taglio del libro" />}
      </div>
      <p className="muted">
        {layout.slices.length} strisce da {String(stripWidthCm).replace('.', ',')} cm, pagine {layout.slices[0]?.page}–
        {layout.slices[layout.slices.length - 1]?.page}. {grid.perRow * grid.rows} strisce per foglio A4, {grid.sheets}{' '}
        fogli da stampare.
      </p>
      <div className="strip-nav">
        <button type="button" className="secondary" disabled={from === 0} onClick={() => setFrom(Math.max(0, from - grid.perRow))}>
          Strisce precedenti
        </button>
        <span className="muted">
          Pagine {layout.slices[from]?.page}–{layout.slices[Math.min(layout.slices.length, from + grid.perRow) - 1]?.page}
        </span>
        <button
          type="button"
          className="secondary"
          disabled={from + grid.perRow >= layout.slices.length}
          onClick={() => setFrom(from + grid.perRow)}
        >
          Strisce successive
        </button>
      </div>
      <div className="strip-canvas">
        <canvas ref={ref} aria-label="Strisce da stampare" />
      </div>
      {perSheet === 0 && <p className="error">La striscia è troppo larga per un foglio A4.</p>}
    </div>
  );
}
