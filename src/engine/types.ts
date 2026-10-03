// Tipi condivisi del motore di calcolo degli schemi di bookfolding.

/** Tipologie di lavorazione supportate. */
export type Method =
  | 'inverted' // Cut & fold, si piegano i tratti del disegno
  | 'embossed' // Cut & fold, si piegano gli spazi
  | 'combi' // pieghe sui bordi esterni, tagli all'interno
  | 'mmf' // measure, mark & fold: una coppia di pieghe per foglio
  | 'mmf-multi' // MMF con più righe di testo indipendenti
  | 'shadow' // cut & fold a fogli alterni
  | 'twotone' // scuro su tutti i fogli, chiaro a fogli alterni
  | 'multilayer' // dimensional: tagli a profondità diverse per livello
  | 'strip' // strip art: strisce d'immagine da incollare sul taglio
  | 'lenticular'; // due immagini alternate sul taglio

/** Ritmo dello shadow: 1:1 = piega 1 salta 1; 1:2 = piega 1 salta 2; 2:1 = piega 2 salta 1. */
export type ShadowMode = '1:1' | '1:2' | '2:1';

/** Immagine RGBA in memoria (compatibile con ImageData). */
export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type RGB = [number, number, number];

/** Livello del multilivello (dimensional). */
export interface Layer {
  code: string; // 1–2 lettere stampate nello schema
  name: string;
  color: RGB; // colore dell'immagine associato al livello
  depthCm?: number; // profondità di taglio facoltativa (solo legenda)
  shadow?: ShadowMode | 'none';
}

export interface BookSettings {
  /** Prima pagina numerata utile (di norma dispari). */
  firstPage: number;
  /** Ultima pagina numerata utile. */
  lastPage: number;
  /** Altezza della pagina in cm. */
  heightCm: number;
}

export type WidthMode = 'fill' | 'sheets' | 'proportional';

export interface PatternOptions {
  method: Method;
  /** Precisione delle misure in mm (1, 0,5 o 0,1). */
  precisionMm: number;
  /** Lunghezza minima di un tratto da piegare, in mm. */
  minTabMm: number;
  /** Spazio minimo fra due tratti, in mm. */
  minGapMm: number;
  /** Soglia di luminanza 0–255 per il bianco/nero, oppure automatica (Otsu). */
  threshold: number | 'auto';
  /** Soglie scuro/chiaro e chiaro/sfondo per il two-tone, oppure automatiche. */
  twoToneThresholds: [number, number] | 'auto';
  /** Ritaglia le colonne vuote ai lati dell'immagine. */
  cropSides: boolean;
  /** Inverte figura e sfondo. */
  invert: boolean;
  /** Come si decide il numero di fogli usati dal disegno. */
  widthMode: WidthMode;
  /** Numero di fogli richiesto (widthMode = 'sheets'). */
  sheets?: number;
  /** Spessore visivo di un foglio in cm (widthMode = 'proportional'). */
  sheetSpacingCm: number;
  shadowMode: ShadowMode;
  layers: Layer[];
}

export type MarkKind = 'cut' | 'fold';

export interface Mark {
  /** Distanza dal bordo alto in cm, già arrotondata alla precisione. */
  pos: number;
  kind: MarkKind;
  /** Codice livello (solo multilivello). */
  layer?: string;
}

export interface PageEntry {
  /** Numero di pagina (dispari) da lavorare. */
  page: number;
  /** Indice del foglio all'interno del disegno (−1 se fuori disegno). */
  sheet: number;
  /** Misure in ordine dall'alto; vuoto = pagina da saltare. */
  marks: Mark[];
}

export interface Pattern {
  method: Method;
  book: BookSettings;
  options: PatternOptions;
  pages: PageEntry[];
  /** Fogli disponibili fra prima e ultima pagina. */
  availableSheets: number;
  /** Fogli effettivamente occupati dal disegno. */
  usedSheets: number;
  /** Fogli lasciati vuoti prima del disegno (centratura). */
  offset: number;
  totalMarks: number;
  warnings: string[];
}

export const DEFAULT_OPTIONS: PatternOptions = {
  method: 'inverted',
  precisionMm: 1,
  minTabMm: 1,
  minGapMm: 1,
  threshold: 'auto',
  twoToneThresholds: 'auto',
  cropSides: false,
  invert: false,
  widthMode: 'fill',
  sheetSpacingCm: 0.1,
  shadowMode: '1:1',
  layers: [],
};

/** Livelli predefiniti in scala di grigi (come impostazione di partenza di Wunderfold). */
export const GRAY_LAYERS: Layer[] = [
  { code: 'A', name: 'Livello A', color: [204, 204, 204] },
  { code: 'B', name: 'Livello B', color: [136, 136, 136] },
  { code: 'C', name: 'Livello C', color: [0, 0, 0] },
];

/** Tavolozza a 7 colori ad alto contrasto. */
export const COLOR_LAYERS: Layer[] = [
  { code: 'A', name: 'Nero', color: [0, 0, 0] },
  { code: 'B', name: 'Rosso', color: [255, 0, 0] },
  { code: 'C', name: 'Verde', color: [0, 255, 0] },
  { code: 'D', name: 'Blu', color: [0, 0, 255] },
  { code: 'E', name: 'Ciano', color: [0, 255, 255] },
  { code: 'F', name: 'Magenta', color: [255, 0, 255] },
  { code: 'G', name: 'Giallo', color: [255, 255, 0] },
];

export const METHOD_LABELS: Record<Method, string> = {
  inverted: 'Cut & fold – inverted',
  embossed: 'Cut & fold – embossed',
  combi: 'Comby (cut & fold combinato)',
  mmf: 'MMF – measure, mark & fold',
  'mmf-multi': 'MMF multilinea',
  shadow: 'Shadow',
  twotone: 'Two-tone',
  multilayer: 'Dimensional / multilivello',
  strip: 'Strip art',
  lenticular: 'Lenticolare',
};
