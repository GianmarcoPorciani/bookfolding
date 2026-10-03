// Caricamento delle immagini nel browser e conversione in RasterImage.
import type { RasterImage } from '../engine/types';

/** Lato massimo in pixel: oltre questa soglia l'immagine viene ridotta per restare veloce. */
const MAX_SIDE = 2400;

export interface LoadedImage {
  name: string;
  raster: RasterImage;
  /** Immagine originale come data URL (per anteprime, PDF e progetti salvati). */
  dataUrl: string;
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossibile leggere l'immagine: usa PNG, JPG o SVG."));
    img.src = src;
  });
}

/** Rasterizza su sfondo trasparente rispettando le proporzioni e il lato massimo. */
export async function dataUrlToRaster(dataUrl: string, name = 'immagine'): Promise<LoadedImage> {
  const el = await loadImageElement(dataUrl);
  let w = el.naturalWidth || el.width || 1000;
  let h = el.naturalHeight || el.height || 1000;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.drawImage(el, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h);
  return { name, raster: { width: w, height: h, data: id.data }, dataUrl };
}

export async function fileToLoaded(file: File): Promise<LoadedImage> {
  const url = await fileToDataUrl(file);
  return dataUrlToRaster(url, file.name);
}

/** Canvas con il contenuto della RasterImage (per ritagli e PDF). */
export function rasterToCanvas(r: RasterImage): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  const g = c.getContext('2d')!;
  g.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return c;
}
