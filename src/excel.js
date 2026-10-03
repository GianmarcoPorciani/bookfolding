// Esportazione .xlsx con ExcelJS (caricato da CDN come window.ExcelJS).
// Stessa struttura dei file originali: colonna A con i cm, riga 1 e ultima con
// le pagine dispari, foto ancorata alla griglia. Le linee sono "cotte" dentro
// l'immagine perché in Excel l'immagine copre i bordi delle celle.
import { etichetteFogli } from './griglia.js';
import { disegnaFoto, disegnaLinee } from './render.js';

const PX_COL = 60; // con 1 cm di colonna, 1 px ≈ 0,17 mm: la linea minima resta sottile
const PX_CM = 120;
const PT_CM = 28.35; // 1 cm in punti tipografici

/** Restituisce il file .xlsx come Blob; il download lo gestisce chi chiama. */
export async function creaExcel(s) {
  const { p, layout: L } = s;
  const righe = Math.ceil(p.altezzaCm);
  const ultimaRiga = righe + 2;

  const tela = document.createElement('canvas');
  tela.width = L.fogli * PX_COL;
  tela.height = Math.round(p.altezzaCm * PX_CM);
  const ctx = tela.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tela.width, tela.height);
  const g = { x0: 0, y0: 0, colW: PX_COL, cmH: PX_CM };
  disegnaFoto(ctx, s.img, s.crop, s.zona, 0, L.fogli, g);
  disegnaLinee(ctx, L.fogli, p.altezzaCm, g, { ...s.stile, spessore: s.stile.spessore * PX_COL / L.colW });

  const wb = new window.ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1', {
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  });
  ws.getColumn(1).width = 3;
  // Larghezza Excel in caratteri Calibri 11: pixel = larghezza*7 + 5, a 96 dpi 1 cm = 37,8 px.
  const larghezzaColonna = (p.colonnaCm * 37.8 - 5) / 7;
  for (let c = 2; c <= L.fogli + 1; c++) ws.getColumn(c).width = larghezzaColonna;
  ws.getRow(1).height = 14.1;
  ws.getRow(ultimaRiga).height = 14.1;
  for (let r = 1; r <= righe; r++) {
    const parziale = Math.min(1, p.altezzaCm - (r - 1));
    ws.getRow(r + 1).height = PT_CM * parziale;
    ws.getCell(r + 1, 1).value = r;
  }
  etichetteFogli(L.fogli).forEach((n, i) => {
    ws.getCell(1, i + 2).value = n;
    ws.getCell(ultimaRiga, i + 2).value = n;
  });

  const id = wb.addImage({ base64: tela.toDataURL('image/jpeg', 0.9), extension: 'jpeg' });
  // Ancore 0-based: dalla cella B2 fino alla fine dell'ultima riga di centimetri.
  ws.addImage(id, { tl: { col: 1, row: 1 }, br: { col: L.fogli + 1, row: 1 + righe } });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
