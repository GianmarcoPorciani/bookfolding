// Generazione dei PDF: schema a tabella e fogli di strisce in scala 1:1.
import { jsPDF } from 'jspdf';
import { fmt, tableRows, type DecimalSep } from '../engine/format';
import { METHOD_LABELS, type Layer, type Pattern, type RasterImage } from '../engine/types';
import { a4Grid, MAX_STRIP_HEIGHT_CM, type StripLayout, type StripParams } from '../engine/strips';
import { drawStrips } from './stripRender';
import { rasterToCanvas } from './raster';

export interface PdfMeta {
  title: string;
  author: string;
  copyright: string;
  notes: string;
  logo?: { dataUrl: string; width: number; height: number };
  decimalSep: DecimalSep;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 12; // margine

const INK: [number, number, number] = [29, 43, 51];
const FOLD: [number, number, number] = [37, 99, 168];
const TINT: [number, number, number] = [238, 241, 236];

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
}

/** Rasterizza un data URL qualsiasi (anche SVG) in PNG per jsPDF. */
async function toPng(dataUrl: string): Promise<{ url: string; w: number; h: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 800;
  if (!dataUrl.startsWith('data:image/svg')) return { url: dataUrl, w, h };
  const c = document.createElement('canvas');
  const k = Math.min(1, 1600 / Math.max(w, h)) || 1;
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
}

/** Inserisce un'immagine dentro un riquadro mantenendo le proporzioni. */
function fitImage(doc: jsPDF, url: string, w: number, h: number, x: number, y: number, bw: number, bh: number) {
  const k = Math.min(bw / w, bh / h);
  const dw = w * k;
  const dh = h * k;
  doc.addImage(url, imageFormat(url), x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh);
}

function footer(doc: jsPDF, meta: PdfMeta) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 118, 122);
    doc.text(`${meta.title || 'Schema'} – pagina ${i} di ${n}`, M, PAGE_H - 7);
    const c = meta.copyright || (meta.author ? `© ${meta.author}` : '');
    if (c) doc.text(c, PAGE_W - M, PAGE_H - 7, { align: 'right' });
  }
}

interface CoverInfo {
  method: string;
  rows: [string, string][];
  images: { url: string; w: number; h: number; caption: string }[];
  howTo: string[];
  layers?: Layer[];
}

async function cover(doc: jsPDF, meta: PdfMeta, info: CoverInfo) {
  let y = M + 4;
  if (meta.logo) {
    const lg = await toPng(meta.logo.dataUrl);
    fitImage(doc, lg.url, lg.w, lg.h, PAGE_W - M - 40, M, 40, 26);
  }
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(meta.title || 'Schema di bookfolding', M, y + 6, { maxWidth: PAGE_W - M * 2 - 46 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  y += 15;
  doc.text(`Schema di bookfolding – ${info.method}`, M, y);
  if (meta.author) {
    y += 6;
    doc.setFontSize(10);
    doc.text(`Realizzato da ${meta.author}`, M, y);
  }
  y += 10;
  // tabella dati
  doc.setFontSize(10);
  for (const [k, v] of info.rows) {
    doc.setFillColor(...TINT);
    doc.rect(M, y - 4.2, 62, 6.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(k, M + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, M + 66, y);
    y += 6.6;
  }
  y += 4;
  // immagini
  if (info.images.length) {
    const gap = 6;
    const bw = (PAGE_W - M * 2 - gap * (info.images.length - 1)) / info.images.length;
    const bh = 70;
    info.images.forEach((im, i) => {
      const x = M + i * (bw + gap);
      doc.setDrawColor(210, 214, 208);
      doc.rect(x, y, bw, bh);
      fitImage(doc, im.url, im.w, im.h, x + 2, y + 2, bw - 4, bh - 4);
      doc.setFontSize(8);
      doc.setTextColor(110, 118, 122);
      doc.text(im.caption, x, y + bh + 4);
    });
    doc.setTextColor(...INK);
    y += bh + 12;
  }
  // legenda livelli
  if (info.layers?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Livelli', M, y);
    y += 6;
    doc.setFontSize(10);
    for (const l of info.layers) {
      const [r, g, b] = l.color;
      doc.setFillColor(r, g, b);
      doc.setDrawColor(150, 150, 150);
      doc.rect(M, y - 3.6, 4.5, 4.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text(l.code, M + 7, y);
      doc.setFont('helvetica', 'normal');
      const depth = l.depthCm ? ` – profondità taglio ${fmt(l.depthCm, 1, meta.decimalSep)} cm` : '';
      const sh = l.shadow && l.shadow !== 'none' ? ` – shadow ${l.shadow}` : '';
      doc.text(`${l.name}${depth}${sh}`, M + 15, y);
      y += 6;
    }
    y += 3;
  }
  // istruzioni
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Come leggere lo schema', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = [...info.howTo, ...(meta.notes ? [meta.notes] : [])];
  for (const t of lines) {
    const wrapped = doc.splitTextToSize(t, PAGE_W - M * 2) as string[];
    if (y + wrapped.length * 4.5 > PAGE_H - 14) {
      doc.addPage();
      y = M + 4;
    }
    doc.text(wrapped, M, y);
    y += wrapped.length * 4.5 + 1.5;
  }
}

function howToFor(p: Pattern): string[] {
  const base = 'Tutte le misure sono in centimetri dal bordo alto della pagina. Si lavorano solo le pagine dispari indicate; "Salta" = pagina da lasciare intatta.';
  const by: Record<string, string> = {
    inverted: 'Cut & fold inverted: segna e taglia orizzontalmente ogni misura fino alla linea di taglio, poi piega verso l’interno i tratti compresi fra ogni coppia di tagli (1°–2°, 3°–4°…).',
    embossed: 'Cut & fold embossed: taglia ogni misura, poi piega verso l’interno i tratti esterni alle coppie, lasciando in rilievo i tratti fra 1°–2°, 3°–4°…',
    combi: 'Comby: le misure con la P sono pieghe (bordo alto e basso, piegati come nell’MMF); le altre sono tagli da eseguire e piegare come nel cut & fold.',
    mmf: 'MMF: piega l’angolo della pagina fino alla prima e alla seconda misura (pieghe a 45°). Nessun taglio.',
    'mmf-multi': 'MMF multilinea: ogni coppia di misure è una riga del disegno; piega ogni coppia come nell’MMF.',
    shadow: `Shadow ${p.options.shadowMode}: come il cut & fold, ma le pagine indicate con "Salta" restano intatte.`,
    twotone: 'Two-tone: taglia e piega ogni coppia di misure; le zone scure compaiono su tutte le pagine lavorate, quelle chiare solo su una pagina sì e una no.',
    multilayer: 'Dimensional: ogni coppia di misure riporta il codice del livello; taglia alla profondità del livello e piega il tratto fra le due misure.',
  };
  return [base, by[p.method] ?? ''];
}

/** PDF dello schema a tabella. */
export async function patternPdf(
  p: Pattern,
  meta: PdfMeta,
  source: { dataUrl: string } | null,
  preview: string,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const sep = meta.decimalSep;
  const prec = p.options.precisionMm;
  const used = p.pages.filter((e) => e.marks.length);
  const images: CoverInfo['images'] = [];
  if (source) {
    const s = await toPng(source.dataUrl);
    images.push({ ...s, caption: 'Immagine di partenza' });
  }
  const pv = await toPng(preview);
  images.push({ ...pv, caption: 'Anteprima del taglio del libro' });
  await cover(doc, meta, {
    method: METHOD_LABELS[p.method],
    rows: [
      ['Tipologia', METHOD_LABELS[p.method]],
      ['Pagine del libro', `${p.book.firstPage}–${p.book.lastPage}`],
      ['Pagine lavorate', `${used.length ? used[0].page : '-'}–${used.length ? used[used.length - 1].page : '-'} (${used.length})`],
      ['Altezza pagina', `${fmt(p.book.heightCm, 1, sep)} cm`],
      ['Precisione', `${fmt(prec / 10, prec >= 1 ? 1 : 0.1, sep)} cm`],
      ['Tagli e pieghe totali', `${p.totalMarks}`],
      ['Data', new Date().toLocaleDateString('it-IT')],
    ],
    images,
    howTo: howToFor(p),
    layers: p.method === 'multilayer' ? p.options.layers : undefined,
  });

  // Tabella
  doc.addPage();
  const pageCol = 20;
  const isLayer = p.method === 'multilayer';
  const cellW = isLayer ? 27 : 13.5;
  const perLine = Math.floor((PAGE_W - M * 2 - pageCol) / cellW);
  const lineH = 6.2;
  let y = M + 2;
  const header = () => {
    doc.setFillColor(...INK);
    doc.rect(M, y, PAGE_W - M * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Pagina', M + 2, y + 4.8);
    const noun = p.method === 'combi' ? 'Pieghe (P) e tagli' : p.method.startsWith('mmf') ? 'Pieghe' : isLayer ? 'Livello e tratto' : 'Tagli';
    doc.text(`${noun} – cm dal bordo alto`, M + pageCol + 2, y + 4.8);
    y += 7;
    doc.setTextColor(...INK);
  };
  header();
  for (const row of tableRows(p)) {
    const items: string[] = [];
    const folds: boolean[] = [];
    if (row.skip) {
      items.push('Salta');
      folds.push(false);
    } else if (isLayer) {
      for (let i = 0; i + 1 < row.marks.length; i += 2)
        items.push(`${row.marks[i].layer ?? ''}  ${fmt(row.marks[i].pos, prec, sep)} – ${fmt(row.marks[i + 1].pos, prec, sep)}`);
    } else {
      for (const m of row.marks) {
        const isFold = m.kind === 'fold';
        items.push(`${p.method === 'combi' && isFold ? 'P' : ''}${fmt(m.pos, prec, sep)}`);
        folds.push(isFold && p.method === 'combi');
      }
    }
    const lines = Math.max(1, Math.ceil(items.length / perLine));
    const h = lines * lineH;
    if (y + h > PAGE_H - 14) {
      doc.addPage();
      y = M + 2;
      header();
    }
    doc.setDrawColor(200, 204, 198);
    doc.setLineWidth(0.2);
    doc.rect(M, y, PAGE_W - M * 2, h);
    doc.line(M + pageCol, y, M + pageCol, y + h);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(row.pages, M + 2, y + 4.4);
    doc.setFont('helvetica', 'normal');
    items.forEach((t, i) => {
      const ln = Math.floor(i / perLine);
      const col = i % perLine;
      const x = M + pageCol + col * cellW;
      const cy = y + ln * lineH;
      // fascia alterna per coppia di tagli, come aiuto visivo
      if (!row.skip && !isLayer && Math.floor(i / 2) % 2 === 0) {
        doc.setFillColor(...TINT);
        doc.rect(x + 0.3, cy + 0.3, cellW - 0.6, lineH - 0.6, 'F');
      }
      if (row.skip) doc.setTextColor(140, 146, 150);
      else if (folds[i]) doc.setTextColor(...FOLD);
      else if (p.method.startsWith('mmf')) doc.setTextColor(...FOLD);
      else doc.setTextColor(...INK);
      doc.setFont('helvetica', folds[i] ? 'bold' : 'normal');
      doc.text(t, x + 1.6, cy + 4.4);
    });
    doc.setTextColor(...INK);
    y += h;
  }
  footer(doc, meta);
  return doc.output('blob');
}

/** Righello di controllo da 10 cm con tacche millimetriche. */
function scaleRuler(doc: jsPDF, x0: number, y0: number) {
  doc.setDrawColor(...INK);
  doc.setTextColor(...INK);
  doc.setFontSize(8);
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

function hexToRgbTuple(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** PDF di strip art o lenticolare: strisce in scala 1:1 su A4. */
export async function stripPdf(
  kind: 'strip' | 'lenticular',
  images: { a: RasterImage; aUrl: string; b?: RasterImage; bUrl?: string },
  layout: StripLayout,
  heightCm: number,
  params: StripParams,
  meta: PdfMeta,
  book: { firstPage: number; lastPage: number },
): Promise<Blob> {
  if (heightCm > MAX_STRIP_HEIGHT_CM)
    throw new Error(`In scala reale su A4 il libro può essere alto al massimo ${MAX_STRIP_HEIGHT_CM} cm.`);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const imgs: CoverInfo['images'] = [];
  const a = await toPng(images.aUrl);
  imgs.push({ ...a, caption: kind === 'lenticular' ? 'Immagine A (metà sinistra)' : 'Immagine' });
  if (kind === 'lenticular' && images.bUrl) {
    const b = await toPng(images.bUrl);
    imgs.push({ ...b, caption: 'Immagine B (metà destra)' });
  }
  const sep = meta.decimalSep;
  const grid = a4Grid(params.widthCm, heightCm, layout.slices.length);
  const sl = layout.slices;
  await cover(doc, meta, {
    method: kind === 'lenticular' ? 'Lenticolare' : 'Strip art',
    rows: [
      ['Tipologia', kind === 'lenticular' ? 'Lenticolare' : 'Strip art'],
      ['Pagine del libro', `${book.firstPage}–${book.lastPage} (${layout.availableSheets} fogli)`],
      ['Pagine con striscia', `${sl[0]?.page ?? '-'}–${sl[sl.length - 1]?.page ?? '-'} (${sl.length})`],
      ['Altezza pagina', `${fmt(heightCm, 1, sep)} cm (una tacca = 1 cm)`],
      ['Margini foto', `${fmt(params.marginTopCm, 1, sep)} cm sopra, ${fmt(params.marginBottomCm, 1, sep)} cm sotto`],
      ['Larghezza striscia', `${fmt(params.widthCm, 1, sep)} cm${kind === 'lenticular' ? ' (metà A, metà B)' : ''}`],
      ['Fogli A4 da stampare', `${grid.sheets} (${grid.perRow * grid.rows} strisce per foglio)`],
    ],
    images: imgs,
    howTo: [
      'Stampa con "Dimensioni effettive" / 100%, non "Adatta alla pagina". Il righello qui sotto deve misurare esattamente 10 cm.',
      kind === 'lenticular'
        ? 'Ritaglia ogni striscia lungo le linee continue, piegala a metà sulla linea tratteggiata e incollala sul taglio della pagina indicata: la metà A si vede da un lato, la metà B dall’altro.'
        : 'Ritaglia ogni striscia lungo le linee e incollala sul taglio della pagina indicata, allineando il bordo alto della striscia al bordo alto della pagina.',
      'Le tacche a sinistra sono i centimetri dal bordo alto della pagina.',
    ],
  });
  scaleRuler(doc, M, PAGE_H - 40);

  const pxPerCm = 100; // ~254 dpi
  const canvA = rasterToCanvas(images.a);
  const canvB = images.b ? { img: rasterToCanvas(images.b), width: images.b.width, height: images.b.height } : undefined;
  const stripMm = params.widthCm * 10;
  const hMm = heightCm * 10;
  const rowH = hMm + 12;
  const x0 = M + 8; // dopo il righello
  const line = hexToRgbTuple(params.lineColor);
  let idx = 0;
  while (idx < sl.length) {
    doc.addPage();
    doc.setDrawColor(...INK);
    doc.setTextColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(PAGE_W - M - 50, M - 3, PAGE_W - M, M - 3);
    doc.line(PAGE_W - M - 50, M - 4.5, PAGE_W - M - 50, M - 1.5);
    doc.line(PAGE_W - M, M - 4.5, PAGE_W - M, M - 1.5);
    doc.setFontSize(7);
    doc.text('controllo scala: 5 cm', PAGE_W - M - 25, M - 4.5, { align: 'center' });
    doc.text(meta.title || '', M, M - 3);
    for (let r = 0; r < grid.rows && idx < sl.length; r++) {
      const top = M + 3 + r * rowH;
      const count = Math.min(grid.perRow, sl.length - idx);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((count * stripMm * pxPerCm) / 10));
      c.height = Math.max(1, Math.round(heightCm * pxPerCm));
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      drawStrips(g, kind, { a: canvA, b: canvB }, layout, params, heightCm, idx, idx + count, 0, 0, pxPerCm);
      doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', x0, top + 5, count * stripMm, hMm);
      // linee di taglio vettoriali
      doc.setDrawColor(...line);
      doc.setLineWidth(params.lineWidthMm);
      for (let i = 0; i <= count; i++) doc.line(x0 + i * stripMm, top + 5, x0 + i * stripMm, top + 5 + hMm);
      doc.line(x0, top + 5, x0 + count * stripMm, top + 5);
      doc.line(x0, top + 5 + hMm, x0 + count * stripMm, top + 5 + hMm);
      if (kind === 'lenticular') {
        doc.setLineDashPattern([1, 1], 0);
        for (let i = 0; i < count; i++) doc.line(x0 + i * stripMm + stripMm / 2, top + 5, x0 + i * stripMm + stripMm / 2, top + 5 + hMm);
        doc.setLineDashPattern([], 0);
      }
      // numeri di pagina
      doc.setFontSize(stripMm < 9 ? 6.5 : 8);
      doc.setTextColor(...INK);
      for (let i = 0; i < count; i++) {
        const cx = x0 + i * stripMm + stripMm / 2;
        doc.text(String(sl[idx + i].page), cx, top + 4, { align: 'center' });
        doc.text(String(sl[idx + i].page), cx, top + 5 + hMm + 3.5, { align: 'center' });
      }
      // righello in cm, solo nel margine
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.15);
      doc.setFontSize(6.5);
      for (let cm = 0; cm <= Math.floor(heightCm); cm++) {
        const yy = top + 5 + cm * 10;
        doc.line(x0 - 3, yy, x0, yy);
        if (cm > 0) doc.text(String(cm), x0 - 4, yy + 1, { align: 'right' });
        if (cm < heightCm) doc.line(x0 - 1.5, yy + 5, x0, yy + 5);
      }
      idx += count;
    }
  }
  footer(doc, meta);
  return doc.output('blob');
}
