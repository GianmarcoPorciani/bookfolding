import { useEffect, useRef } from 'react';
import type { Pattern } from '../engine/types';
import { drawPreview } from '../lib/draw';

interface Props {
  pattern: Pattern;
  highlight?: number;
  layerColors?: Record<string, string>;
  onPick?: (index: number) => void;
}

/** Anteprima del taglio del libro, ridisegnata a ogni cambio e adattata alla larghezza. */
export function Preview({ pattern, highlight, layerColors, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = ref.current;
    const b = box.current;
    if (!c || !b) return;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = b.clientWidth;
      const h = Math.min(520, Math.max(240, Math.round(w * 0.5)));
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPreview(c, pattern, { highlight, layerColors, width: w, height: h });
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(b);
    return () => ro.disconnect();
  }, [pattern, highlight, layerColors]);

  return (
    <div className="preview" ref={box}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Anteprima del taglio del libro con le pagine lavorate"
        onClick={(e) => {
          if (!onPick) return;
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor(((e.clientX - r.left - 8) / (r.width - 16)) * pattern.pages.length);
          onPick(Math.max(0, Math.min(pattern.pages.length - 1, i)));
        }}
      />
    </div>
  );
}
