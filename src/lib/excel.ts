// Esportazione .xlsx delle strisce (dalla prima app bookfolding).
// Struttura dei file usati nel gruppo: colonna A con i centimetri, riga 1 e
// ultima con le pagine dispari, immagine ancorata alla griglia. Le linee sono
// disegnate dentro l'immagine perché in Excel l'immagine copre i bordi delle celle.
import type { RasterImage } from '../engine/types';
import type { StripLayout, StripParams } from '../engine/strips';
import { rasterToCanvas } from './raster';
import { drawCutLines, drawStrips } from './stripRender';

const PX_CM = 120; // risoluzione dell'immagine incorporata
const PT_CM = 28.35; // 1 cm in punti tipografici

export async function stripExcel(
  kind: 'strip' | 'lenticular',
  images: { a: RasterImage; b?: RasterImage },
  layout: StripLayout,
  heightCm: number,
  p: StripParams,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const n = layout.slices.length;
  const rows = Math.ceil(heightCm);
  const lastRow = rows + 2;

  const c = document.createElement('canvas');
  c.width = Math.round(n * p.widthCm * PX_CM);
  c.height = Math.round(heightCm * PX_CM);
  if (c.width > 32000) throw new Error('Troppe strisce per un unico foglio Excel: riduci la larghezza della striscia.');
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  const b = images.b ? { img: rasterToCanvas(images.b), width: images.b.width, height: images.b.height } : undefined;
  drawStrips(g, kind, { a: rasterToCanvas(images.a), b }, layout, p, heightCm, 0, n, 0, 0, PX_CM);
  drawCutLines(g, n, heightCm, 0, 0, PX_CM, p, kind === 'lenticular');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1', { pageSetup: { paperSize: 9, orientation: 'portrait' } });
  ws.getColumn(1).width = 3;
  // Larghezza Excel in caratteri Calibri 11: pixel = larghezza·7 + 5; a 96 dpi 1 cm = 37,8 px.
  const colWidth = (p.widthCm * 37.8 - 5) / 7;
  for (let col = 2; col <= n + 1; col++) ws.getColumn(col).width = colWidth;
  ws.getRow(1).height = 14.1;
  ws.getRow(lastRow).height = 14.1;
  for (let r = 1; r <= rows; r++) {
    const partial = Math.min(1, heightCm - (r - 1));
    ws.getRow(r + 1).height = PT_CM * partial;
    ws.getCell(r + 1, 1).value = r;
  }
  layout.slices.forEach((s, i) => {
    ws.getCell(1, i + 2).value = s.page;
    ws.getCell(lastRow, i + 2).value = s.page;
  });
  const id = wb.addImage({ base64: c.toDataURL('image/jpeg', 0.9), extension: 'jpeg' });
  ws.addImage(id, { tl: { col: 1, row: 1 }, br: { col: n + 1, row: 1 + rows } } as never);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
