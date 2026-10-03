// Una pagina A4 completa su canvas: è l'anteprima di quello che esce nel PDF.
import { A4 } from './layout.js';
import { etichetteFogli } from './griglia.js';
import { disegnaFoto, disegnaLinee } from './render.js';

export function disegnaPagina(canvas, pxMm, s, indice) {
  const L = s.layout;
  const { da, a } = L.pagine[indice];
  canvas.width = Math.round(A4.w * pxMm);
  canvas.height = Math.round(A4.h * pxMm);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const g = { x0: L.fotoX * pxMm, y0: L.fotoY * pxMm, colW: L.colW * pxMm, cmH: L.cmH * pxMm };
  disegnaFoto(ctx, s.img, s.crop, s.zona, da, a, g);
  disegnaLinee(ctx, a - da, s.p.altezzaCm, g, { ...s.stile, spessore: s.stile.spessore * pxMm });

  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1, 0.1 * pxMm);
  ctx.beginPath();
  for (let k = 1; k < s.p.altezzaCm; k++) {
    ctx.moveTo(g.x0 - 1.5 * pxMm, g.y0 + k * g.cmH);
    ctx.lineTo(g.x0, g.y0 + k * g.cmH);
  }
  ctx.stroke();

  const etichette = etichetteFogli(L.fogli);
  ctx.fillStyle = '#000';
  ctx.font = `${3 * pxMm}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = da; c < a; c++) {
    const x = g.x0 + (c - da + 0.5) * g.colW;
    ctx.fillText(etichette[c], x, (L.numeriSopraY + L.rigaNumeri / 2) * pxMm);
    ctx.fillText(etichette[c], x, (L.numeriSottoY + L.rigaNumeri / 2) * pxMm);
  }
  ctx.textAlign = 'right';
  for (let k = 1; k <= Math.ceil(s.p.altezzaCm); k++) {
    // Il numero sta nella riga del suo centimetro, come negli Excel originali.
    const y = g.y0 + (Math.min(k, s.p.altezzaCm) - 0.5) * g.cmH;
    ctx.fillText(k, (L.colonnaCmX + L.colonnaCm - 1.2) * pxMm, y);
  }
}
