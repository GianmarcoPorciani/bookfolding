// Formattazione delle misure per tabella, PDF e lettura vocale.
import type { Mark, Pattern, PageEntry, Method } from './types';

export type DecimalSep = ',' | '.';

/** Numero con una o due cifre decimali secondo la precisione, es. 6,7 / 17,95. */
export function fmt(n: number, precisionMm: number, sep: DecimalSep = ','): string {
  const decimals = precisionMm >= 1 ? 1 : 2;
  let s = n.toFixed(decimals);
  if (decimals === 2 && s.endsWith('0') && precisionMm >= 0.5) s = s.slice(0, -1);
  return sep === ',' ? s.replace('.', ',') : s;
}

/** Testo di una misura come appare nello schema: "P9,0" per le pieghe in comby. */
export function markLabel(m: Mark, method: Method, precisionMm: number, sep: DecimalSep): string {
  const v = fmt(m.pos, precisionMm, sep);
  if (method === 'combi' && m.kind === 'fold') return `P${v}`;
  return v;
}

export interface TableRow {
  /** "1–25" oppure "27". */
  pages: string;
  first: number;
  skip: boolean;
  marks: Mark[];
}

/** Righe della tabella con le pagine vuote consecutive compresse in un intervallo. */
export function tableRows(p: Pattern): TableRow[] {
  const rows: TableRow[] = [];
  let run: PageEntry[] = [];
  const flush = () => {
    if (!run.length) return;
    const a = run[0].page;
    const b = run[run.length - 1].page;
    rows.push({ pages: a === b ? `${a}` : `${a}–${b}`, first: a, skip: true, marks: [] });
    run = [];
  };
  for (const e of p.pages) {
    if (!e.marks.length) {
      run.push(e);
      continue;
    }
    flush();
    rows.push({ pages: `${e.page}`, first: e.page, skip: false, marks: e.marks });
  }
  flush();
  return rows;
}

/** Testo da leggere ad alta voce per una pagina. */
export function speechFor(e: PageEntry, method: Method, precisionMm: number): string {
  const n = (v: number) => fmt(v, precisionMm, ',').replace(',', ' virgola ');
  if (!e.marks.length) return `Pagina ${e.page}. Salta.`;
  const parts: string[] = [`Pagina ${e.page}.`];
  if (method === 'multilayer') {
    for (let i = 0; i < e.marks.length; i += 2) {
      const a = e.marks[i];
      const b = e.marks[i + 1];
      parts.push(`Livello ${a.layer ?? ''}, da ${n(a.pos)} a ${n(b.pos)}.`);
    }
    return parts.join(' ');
  }
  for (const m of e.marks) {
    const word = m.kind === 'fold' ? 'Piega' : 'Taglio';
    parts.push(`${word} ${n(m.pos)}.`);
  }
  return parts.join(' ');
}

/** Parola usata nelle intestazioni per il tipo di segno prevalente. */
export function markNoun(method: Method): string {
  if (method === 'mmf' || method === 'mmf-multi') return 'Pieghe';
  if (method === 'combi') return 'Pieghe (P) e tagli';
  return 'Tagli';
}
