// Impaginazione A4 in millimetri, condivisa da anteprima e PDF.
import { numeroFogli, paginaA4, fogliPerPagina } from './griglia.js';

export const A4 = { w: 210, h: 297 };
const MARGINE_X = 10;
const MARGINE_SOPRA = 12;
const COLONNA_CM = 8; // colonna con i numeri dei centimetri
const RIGA_NUMERI = 5; // riga con i numeri di pagina, sopra e sotto

/** Altezza massima del libro che sta in un A4 in scala reale. */
export const ALTEZZA_MAX_CM = Math.floor((A4.h - MARGINE_SOPRA - 2 * RIGA_NUMERI - 8) / 10);

export function calcolaLayout(p) {
  const fogli = numeroFogli(p.ultimaPagina);
  if (!(p.altezzaCm > 0)) throw new Error("Altezza del libro non valida");
  if (p.altezzaCm > ALTEZZA_MAX_CM) {
    throw new Error(`Con la scala reale su A4 il libro può essere alto al massimo ${ALTEZZA_MAX_CM} cm`);
  }
  // La larghezza della colonna è la misura del taglio: va stampata esatta.
  const colW = p.colonnaCm * 10;
  const perPagina = fogliPerPagina(A4.w - 2 * MARGINE_X - COLONNA_CM, colW);
  const fotoX = MARGINE_X + COLONNA_CM;
  const fotoY = MARGINE_SOPRA + RIGA_NUMERI;
  return {
    fogli,
    perPagina,
    pagine: paginaA4(fogli, perPagina),
    colW,
    cmH: 10, // 1 cm = 10 mm: la scala reale è il punto di tutto
    fotoX,
    fotoY,
    fotoH: p.altezzaCm * 10,
    numeriSopraY: MARGINE_SOPRA,
    numeriSottoY: fotoY + p.altezzaCm * 10,
    rigaNumeri: RIGA_NUMERI,
    colonnaCmX: MARGINE_X,
    colonnaCm: COLONNA_CM,
  };
}
