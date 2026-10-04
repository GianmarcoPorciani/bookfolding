// Sagoma per piega e taglio: da quale millimetro a quale ogni foglio è "disegno".
// Calcoli puri su array RGBA, testabili con node --test.

/** Un pixel è disegno se è abbastanza opaco e più scuro della soglia (0-255). */
export function eDisegno(r, g, b, a, soglia) {
  if (a < 128) return false;
  return 0.299 * r + 0.587 * g + 0.114 * b < soglia;
}

/**
 * Divide una colonna di valori booleani (uno per mm, dall'alto) in tratti
 * consecutivi: [{ da, a, disegno }] con da incluso e a escluso, in mm.
 */
export function tratti(valori) {
  const out = [];
  let inizio = 0;
  for (let i = 1; i <= valori.length; i++) {
    if (i === valori.length || valori[i] !== valori[inizio]) {
      out.push({ da: inizio, a: i, disegno: valori[inizio] });
      inizio = i;
    }
  }
  return out;
}

/**
 * Tratti di ogni foglio da un'immagine larga un pixel per foglio e alta un
 * pixel per mm (data = RGBA come in ImageData).
 */
export function trattiPerFoglio(data, fogli, mm, soglia) {
  const risultato = [];
  for (let c = 0; c < fogli; c++) {
    const col = [];
    for (let y = 0; y < mm; y++) {
      const i = (y * fogli + c) * 4;
      col.push(eDisegno(data[i], data[i + 1], data[i + 2], data[i + 3], soglia));
    }
    risultato.push(tratti(col));
  }
  return risultato;
}
