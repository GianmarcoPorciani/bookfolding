// Lettura dei pixel, luminanza e soglie automatiche.
import type { RasterImage, RGB } from './types';

/** Colore del pixel con la trasparenza composta su bianco. */
export function pixelRGB(img: RasterImage, x: number, y: number): RGB {
  const i = (y * img.width + x) * 4;
  const a = img.data[i + 3] / 255;
  return [
    Math.round(img.data[i] * a + 255 * (1 - a)),
    Math.round(img.data[i + 1] * a + 255 * (1 - a)),
    Math.round(img.data[i + 2] * a + 255 * (1 - a)),
  ];
}

export function luminance([r, g, b]: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Istogramma a 256 classi della luminanza di tutta l'immagine. */
export function histogram(img: RasterImage): number[] {
  const h = new Array<number>(256).fill(0);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      h[Math.min(255, Math.round(luminance(pixelRGB(img, x, y))))]++;
    }
  }
  return h;
}

/**
 * Soglia di Otsu: restituisce t tale che i pixel con luminanza < t sono figura.
 * Se l'immagine è uniforme torna 128.
 */
export function otsu(hist: number[]): number {
  const total = hist.reduce((a, b) => a + b, 0);
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let bestT = 128;
  for (let t = 0; t < 255; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      bestT = t + 1; // classe figura = valori <= t
    }
  }
  // Con due soli valori (es. 0 e 255) la soglia cade subito dopo il primo:
  // spostala a metà strada per non dipendere da piccole sfumature.
  let lo = bestT - 1;
  while (lo > 0 && hist[lo] === 0) lo--;
  let hi = bestT;
  while (hi < 255 && hist[hi] === 0) hi++;
  return Math.round((lo + hi) / 2) || 1;
}

/**
 * Otsu a due soglie (tre classi): restituisce [t1, t2] con
 * luminanza < t1 = scuro, t1 ≤ L < t2 = chiaro, ≥ t2 = sfondo.
 */
export function otsu2(hist: number[]): [number, number] {
  const P = new Array<number>(257).fill(0);
  const S = new Array<number>(257).fill(0);
  for (let i = 0; i < 256; i++) {
    P[i + 1] = P[i] + hist[i];
    S[i + 1] = S[i] + i * hist[i];
  }
  const cls = (a: number, b: number) => {
    const w = P[b] - P[a];
    if (w === 0) return 0;
    const s = S[b] - S[a];
    return (s * s) / w;
  };
  let best = -1;
  let res: [number, number] = [85, 170];
  for (let t1 = 1; t1 < 255; t1++) {
    for (let t2 = t1 + 1; t2 < 256; t2++) {
      const v = cls(0, t1) + cls(t1, t2) + cls(t2, 256);
      if (v > best) {
        best = v;
        res = [t1, t2];
      }
    }
  }
  // Centra ciascuna soglia nel vuoto dell'istogramma in cui cade.
  const centre = (t: number) => {
    let lo = t - 1;
    while (lo > 0 && hist[lo] === 0) lo--;
    let hi = t;
    while (hi < 255 && hist[hi] === 0) hi++;
    return Math.round((lo + hi) / 2);
  };
  const a = centre(res[0]);
  const b = Math.max(a + 1, centre(res[1]));
  return [a, b];
}

/** Colonne interamente sfondo ai lati: restituisce [prima, ultima] colonna con contenuto. */
export function contentColumns(
  img: RasterImage,
  isFigure: (rgb: RGB) => boolean,
): [number, number] {
  let first = -1;
  let last = -1;
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) {
      if (isFigure(pixelRGB(img, x, y))) {
        if (first < 0) first = x;
        last = x;
        break;
      }
    }
  }
  if (first < 0) return [0, img.width - 1];
  return [first, last];
}

/** Ritaglia orizzontalmente l'immagine fra due colonne incluse. */
export function cropColumns(img: RasterImage, x0: number, x1: number): RasterImage {
  const w = x1 - x0 + 1;
  const data = new Uint8ClampedArray(w * img.height * 4);
  for (let y = 0; y < img.height; y++) {
    const src = (y * img.width + x0) * 4;
    data.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: img.height, data };
}

export function colorDistance2(a: RGB, b: RGB): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
