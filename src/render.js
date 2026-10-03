// Disegno su canvas: foto stirata sulla griglia e linee di taglio.
// Le coordinate sono in "unità griglia": la colonna c inizia a x0 + c*colW,
// il centimetro k a y0 + k*cmH. Chi chiama sceglie la scala (px o mm*px).

/**
 * Disegna la parte di foto che cade nelle colonne [da, a).
 * crop = rettangolo della sorgente; zona = {col0, col1, cm0, cm1} dalla griglia.
 */
export function disegnaFoto(ctx, img, crop, zona, da, a, g) {
  const c0 = Math.max(da, zona.col0);
  const c1 = Math.min(a, zona.col1);
  if (c1 <= c0) return;
  const nCol = zona.col1 - zona.col0;
  const sx = crop.x + ((c0 - zona.col0) / nCol) * crop.w;
  const sw = ((c1 - c0) / nCol) * crop.w;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    sx, crop.y, sw, crop.h,
    g.x0 + (c0 - da) * g.colW, g.y0 + zona.cm0 * g.cmH,
    (c1 - c0) * g.colW, (zona.cm1 - zona.cm0) * g.cmH,
  );
}

/**
 * Linee di taglio verticali su ogni bordo di colonna, più i bordi sopra e sotto
 * che chiudono le strisce. Spessore in unità della tela; mai sotto 1 px, se no sparisce.
 */
export function disegnaLinee(ctx, nCol, altezzaCm, g, stile) {
  const h = altezzaCm * g.cmH;
  ctx.save();
  ctx.strokeStyle = stile.colore;
  ctx.lineWidth = Math.max(1, stile.spessore);
  ctx.beginPath();
  for (let c = 0; c <= nCol; c++) {
    ctx.moveTo(g.x0 + c * g.colW, g.y0);
    ctx.lineTo(g.x0 + c * g.colW, g.y0 + h);
  }
  ctx.moveTo(g.x0, g.y0);
  ctx.lineTo(g.x0 + nCol * g.colW, g.y0);
  ctx.moveTo(g.x0, g.y0 + h);
  ctx.lineTo(g.x0 + nCol * g.colW, g.y0 + h);
  ctx.stroke();
  ctx.restore();
}
