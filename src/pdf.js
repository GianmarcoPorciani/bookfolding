// Esportazione PDF A4 in scala reale con jsPDF (caricato da CDN come window.jspdf).
// Foto come immagine, linee e numeri come vettori: restano nitidi a qualsiasi zoom.
import { A4 } from './layout.js';
import { etichetteFogli } from './griglia.js';
import { disegnaFoto } from './render.js';

const PX_MM = 10; // ~254 dpi: abbondante per una striscia di carta
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Restituisce il PDF come Blob; il download lo gestisce chi chiama. */
export function creaPdf(s, nome) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  paginaRiepilogo(doc, s, nome);

  const L = s.layout;
  const etichette = etichetteFogli(L.fogli);
  const tela = document.createElement('canvas');
  const colore = hexRgb(s.stile.colore);

  L.pagine.forEach(({ da, a }) => {
    doc.addPage('a4', 'portrait');
    const n = a - da;
    const w = n * L.colW;
    tela.width = Math.round(w * PX_MM);
    tela.height = Math.round(L.fotoH * PX_MM);
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tela.width, tela.height);
    disegnaFoto(ctx, s.img, s.crop, s.zona, da, a, { x0: 0, y0: 0, colW: L.colW * PX_MM, cmH: L.cmH * PX_MM });
    doc.addImage(tela.toDataURL('image/jpeg', 0.9), 'JPEG', L.fotoX, L.fotoY, w, L.fotoH);

    // Linee di taglio: verticali su ogni bordo di colonna, più i bordi sopra e sotto.
    doc.setDrawColor(...colore);
    doc.setLineWidth(s.stile.spessore);
    for (let c = 0; c <= n; c++) doc.line(L.fotoX + c * L.colW, L.fotoY, L.fotoX + c * L.colW, L.fotoY + L.fotoH);
    doc.line(L.fotoX, L.fotoY, L.fotoX + w, L.fotoY);
    doc.line(L.fotoX, L.fotoY + L.fotoH, L.fotoX + w, L.fotoY + L.fotoH);
    // Tacche dei centimetri solo nel margine, per non sporcare la foto.
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);
    for (let k = 1; k < s.p.altezzaCm; k++) doc.line(L.fotoX - 1.5, L.fotoY + k * 10, L.fotoX, L.fotoY + k * 10);

    doc.setFontSize(8.5);
    for (let c = da; c < a; c++) {
      const x = L.fotoX + (c - da + 0.5) * L.colW;
      doc.text(String(etichette[c]), x, L.numeriSopraY + L.rigaNumeri / 2, { align: 'center', baseline: 'middle' });
      doc.text(String(etichette[c]), x, L.numeriSottoY + L.rigaNumeri / 2, { align: 'center', baseline: 'middle' });
    }
    for (let k = 1; k <= Math.ceil(s.p.altezzaCm); k++) {
      const y = L.fotoY + (Math.min(k, s.p.altezzaCm) - 0.5) * 10;
      doc.text(String(k), L.colonnaCmX + L.colonnaCm - 1.2, y, { align: 'right', baseline: 'middle' });
    }
  });
  return doc.output('blob');
}

function paginaRiepilogo(doc, s, nome) {
  const { p, layout: L } = s;
  doc.setFontSize(18);
  doc.text(`Schema bookfolding – ${nome}`, 20, 25);
  doc.setFontSize(11);
  const righe = [
    `Altezza libro: ${p.altezzaCm} cm  (una riga = 1 cm)`,
    `Ultima pagina: ${p.ultimaPagina}  ->  ${L.fogli} fogli (colonne 1, 3, 5 ... ${2 * L.fogli - 1})`,
    `Fogli vuoti: ${p.fogliVuotiInizio} all'inizio, ${p.fogliVuotiFine} alla fine`,
    `Margini foto: ${p.cmVuotiSopra} cm sopra, ${p.cmVuotiSotto} cm sotto`,
    `Colonna (larghezza di taglio): ${p.colonnaCm} cm`,
    `Pagine di schema: ${L.pagine.length}, ${L.perPagina} fogli per pagina`,
  ];
  righe.forEach((r, i) => doc.text(r, 20, 40 + i * 7));

  doc.setFontSize(13);
  doc.text('Prima di stampare tutto, controlla la scala', 20, 90);
  doc.setFontSize(11);
  doc.text('Stampa con "Dimensioni effettive" / "100%", NON "Adatta alla pagina".', 20, 98);
  doc.text('Il righello qui sotto deve misurare esattamente 10 cm.', 20, 105);

  const x0 = 20, y0 = 120;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(x0, y0, x0 + 100, y0);
  for (let mm = 0; mm <= 100; mm++) {
    const h = mm % 10 === 0 ? 6 : mm % 5 === 0 ? 4 : 2;
    doc.setLineWidth(mm % 10 === 0 ? 0.3 : 0.15);
    doc.line(x0 + mm, y0, x0 + mm, y0 + h);
    if (mm % 10 === 0) doc.text(String(mm / 10), x0 + mm, y0 + 10, { align: 'center' });
  }
  doc.text('cm', x0 + 106, y0 + 10);
}
