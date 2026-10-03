import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookSettings } from '../engine/types';
import { a4Grid, type StripLayout, type StripParams } from '../engine/strips';
import { rasterToCanvas, type LoadedImage } from '../lib/raster';
import { drawCutLines, drawStrips } from '../lib/stripRender';

interface Props {
  kind: 'strip' | 'lenticular';
  a: LoadedImage;
  b: LoadedImage | null;
  book: BookSettings;
  layout: StripLayout;
  params: StripParams;
}

/** Anteprima delle strisce: panoramica del taglio e strisce del foglio da stampare. */
export function StripPreview({ kind, a, b, book, layout, params }: Props) {
  const grid = a4Grid(params.widthCm, book.heightCm, layout.slices.length);
  const overview = useRef<HTMLCanvasElement>(null);
  const sheet = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(0);
  const perSheet = grid.perRow * grid.rows;
  const pages = Math.max(1, Math.ceil(layout.slices.length / perSheet));
  const from = Math.min(page, pages - 1) * perSheet;
  const to = Math.min(layout.slices.length, from + perSheet);

  const sources = useMemo(
    () => ({
      a: rasterToCanvas(a.raster),
      b: b ? { img: rasterToCanvas(b.raster), width: b.raster.width, height: b.raster.height } : undefined,
    }),
    [a, b],
  );

  // Panoramica: tutto il libro compresso nella larghezza disponibile
  useEffect(() => {
    const c = overview.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = (c.parentElement?.clientWidth ?? 800) - 2;
    const N = layout.availableSheets;
    const colW = W / N;
    const pxPerCm = Math.min(18, (W * 0.45) / book.heightCm);
    c.style.width = `${W}px`;
    c.style.height = `${book.heightCm * pxPerCm}px`;
    c.width = Math.round(W * dpr);
    c.height = Math.round(book.heightCm * pxPerCm * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#e4e2da';
    g.fillRect(0, 0, W, book.heightCm * pxPerCm);
    // ogni striscia è larga colW: scala orizzontale indipendente da quella verticale
    g.save();
    g.translate(layout.offset * colW, 0);
    g.scale(colW / (params.widthCm * pxPerCm), 1);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, layout.usedSheets * params.widthCm * pxPerCm, book.heightCm * pxPerCm);
    drawStrips(g, kind, sources, layout, params, book.heightCm, 0, layout.slices.length, 0, 0, pxPerCm);
    g.restore();
    g.strokeStyle = '#f2d04b';
    g.lineWidth = 3;
    g.strokeRect((layout.offset + from) * colW, 1.5, (to - from) * colW, book.heightCm * pxPerCm - 3);
  }, [sources, kind, layout, params, book.heightCm, from, to]);

  // Strisce del foglio A4 selezionato (prima fascia)
  useEffect(() => {
    const c = sheet.current;
    if (!c) return;
    const count = Math.min(grid.perRow, to - from);
    const pxPerCm = 40;
    const sw = params.widthCm * pxPerCm;
    const h = book.heightCm * pxPerCm;
    c.width = Math.max(1, Math.round(count * sw + 40));
    c.height = Math.round(h + 44);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    drawStrips(g, kind, sources, layout, params, book.heightCm, from, from + count, 30, 22, pxPerCm);
    drawCutLines(g, count, book.heightCm, 30, 22, pxPerCm, params, kind === 'lenticular');
    g.fillStyle = '#1d2b33';
    g.font = '13px "Atkinson Hyperlegible", sans-serif';
    g.textAlign = 'center';
    for (let i = 0; i < count; i++) {
      const pg = String(layout.slices[from + i].page);
      g.fillText(pg, 30 + i * sw + sw / 2, 15);
      g.fillText(pg, 30 + i * sw + sw / 2, 22 + h + 16);
    }
    g.textAlign = 'right';
    g.font = '11px "Atkinson Hyperlegible", sans-serif';
    for (let cm = 1; cm < book.heightCm; cm++) {
      g.fillRect(22, 22 + cm * pxPerCm, 6, 1);
      g.fillText(String(cm), 20, 26 + cm * pxPerCm);
    }
  }, [sources, kind, layout, params, book.heightCm, from, to, grid.perRow]);

  return (
    <div className="strip-preview">
      <p>
        <strong>{kind === 'lenticular' ? 'Lenticolare' : 'Strip art'}</strong>{' '}
        <span className="muted">
          {layout.slices.length} strisce da {String(params.widthCm).replace('.', ',')} cm, pagine{' '}
          {layout.slices[0]?.page}–{layout.slices[layout.slices.length - 1]?.page}; {perSheet} strisce per foglio A4,{' '}
          {grid.sheets} fogli da stampare.
        </span>
      </p>
      <div className="strip-canvas">
        <canvas ref={overview} role="img" aria-label="Panoramica del taglio del libro con le strisce" />
      </div>
      <p className="hint">
        Il taglio del libro con le strisce incollate. In giallo le strisce del foglio A4 mostrato sotto.
      </p>
      <div className="strip-nav">
        <button type="button" className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Foglio precedente
        </button>
        <span className="muted">
          Foglio A4 {Math.min(page, pages - 1) + 1} di {pages}
          {grid.rows > 1 ? ' (prima fascia)' : ''}
        </span>
        <button type="button" className="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
          Foglio successivo
        </button>
      </div>
      <div className="strip-canvas">
        <canvas ref={sheet} aria-label="Strisce da stampare" />
      </div>
    </div>
  );
}
