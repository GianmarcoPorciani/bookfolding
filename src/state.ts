// Stato dell'applicazione e salvataggio dei progetti.
import type { DecimalSep } from './engine/format';
import { DEFAULT_OPTIONS, GRAY_LAYERS, type BookSettings, type PatternOptions } from './engine/types';

export interface Meta {
  title: string;
  author: string;
  copyright: string;
  notes: string;
  logoDataUrl?: string;
}

export interface Project {
  version: 1;
  book: BookSettings;
  options: PatternOptions;
  meta: Meta;
  decimalSep: DecimalSep;
  stripWidthCm: number;
  imageA?: { name: string; dataUrl: string };
  imageB?: { name: string; dataUrl: string };
}

export const DEFAULT_PROJECT: Project = {
  version: 1,
  book: { firstPage: 1, lastPage: 399, heightCm: 21 },
  options: { ...DEFAULT_OPTIONS, layers: GRAY_LAYERS },
  meta: { title: '', author: '', copyright: '', notes: '' },
  decimalSep: ',',
  stripWidthCm: 1.5,
};

const PROFILE_KEY = 'piegalibro.profilo';
const LAST_KEY = 'piegalibro.ultimo';

/** Autore, copyright e logo restano memorizzati nel browser per i prossimi schemi. */
export function loadProfile(): Partial<Meta> & { decimalSep?: DecimalSep } {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveProfile(meta: Meta, decimalSep: DecimalSep) {
  try {
    const { author, copyright, logoDataUrl } = meta;
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ author, copyright, logoDataUrl, decimalSep }));
  } catch {
    /* spazio esaurito o archiviazione bloccata: non è indispensabile */
  }
}

/** Ultimo progetto aperto (senza immagini se troppo grande). */
export function saveLast(p: Project) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(p));
  } catch {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ ...p, imageA: undefined, imageB: undefined }));
    } catch {
      /* ignora */
    }
  }
}

export function loadLast(): Project | null {
  try {
    const s = localStorage.getItem(LAST_KEY);
    if (!s) return null;
    const p = JSON.parse(s) as Project;
    if (p.version !== 1) return null;
    return {
      ...DEFAULT_PROJECT,
      ...p,
      options: { ...DEFAULT_OPTIONS, ...p.options },
      meta: { ...DEFAULT_PROJECT.meta, ...p.meta },
    };
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function safeFileName(s: string): string {
  return (s || 'schema').replace(/[^\w\-àèéìòù ]+/gi, '').trim().replace(/\s+/g, '_') || 'schema';
}
