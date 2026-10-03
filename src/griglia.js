// Calcoli puri della griglia: nessuna dipendenza dal DOM, testabili con node --test.
//
// Convenzione dei file originali: una colonna per foglio, etichettata con la
// pagina dispari (1, 3, 5, ...); una riga per centimetro di altezza del libro.

/** Numero di fogli dato il numero dell'ultima pagina (245 → 123). */
export function numeroFogli(ultimaPagina) {
  const n = Math.floor(Number(ultimaPagina));
  if (!Number.isFinite(n) || n < 1) throw new Error('Ultima pagina non valida');
  return Math.ceil(n / 2);
}

/** Etichette delle colonne: 1, 3, 5, ... */
export function etichetteFogli(fogli) {
  return Array.from({ length: fogli }, (_, i) => 2 * i + 1);
}

/** Quante colonne larghe colonnaMm stanno nella larghezza utile (sempre almeno una). */
export function fogliPerPagina(larghezzaUtileMm, colonnaMm) {
  if (!(colonnaMm > 0)) throw new Error('Larghezza della colonna non valida');
  return Math.max(1, Math.floor(larghezzaUtileMm / colonnaMm + 1e-9));
}

/** Divide i fogli in pagine A4: [[0..10], [11..21], ...] come indici di colonna. */
export function paginaA4(fogli, perPagina) {
  const pagine = [];
  for (let i = 0; i < fogli; i += perPagina) {
    pagine.push({ da: i, a: Math.min(i + perPagina, fogli) });
  }
  return pagine;
}

/**
 * Zona della griglia occupata dalla foto, tolti i margini.
 * Restituisce colonne [col0, col1) e altezza [cm0, cm1) in centimetri.
 */
export function zonaFoto({ fogli, altezzaCm, fogliVuotiInizio = 0, fogliVuotiFine = 0, cmVuotiSopra = 0, cmVuotiSotto = 0 }) {
  const col0 = Math.max(0, Math.floor(fogliVuotiInizio));
  const col1 = fogli - Math.max(0, Math.floor(fogliVuotiFine));
  const cm0 = Math.max(0, cmVuotiSopra);
  const cm1 = altezzaCm - Math.max(0, cmVuotiSotto);
  if (col1 <= col0) throw new Error('I fogli vuoti occupano tutto il libro');
  if (cm1 <= cm0) throw new Error("I margini sopra e sotto occupano tutta l'altezza");
  return { col0, col1, cm0, cm1 };
}

/**
 * Ritaglio automatico: trova il rettangolo che contiene i pixel "di disegno",
 * cioè non trasparenti e non quasi bianchi. data = RGBA come in ImageData.
 * Restituisce {x, y, w, h} in pixel, oppure l'immagine intera se è tutta vuota.
 */
export function rilevaBordi(data, larghezza, altezza, soglia = 240) {
  let minX = larghezza, minY = altezza, maxX = -1, maxY = -1;
  for (let y = 0; y < altezza; y++) {
    for (let x = 0; x < larghezza; x++) {
      const i = (y * larghezza + x) * 4;
      const vuoto = data[i + 3] < 16 || (data[i] >= soglia && data[i + 1] >= soglia && data[i + 2] >= soglia);
      if (!vuoto) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: larghezza, h: altezza };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
