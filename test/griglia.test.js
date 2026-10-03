import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroFogli, etichetteFogli, paginaA4, zonaFoto, fogliPerPagina, rilevaBordi } from '../src/griglia.js';

// Valori ricavati dai file Excel di Alice.
test('fogli come nei file originali', () => {
  assert.equal(numeroFogli(245), 123); // File Alice - Copia / Edoardo
  assert.equal(numeroFogli(265), 133); // Torino 1
  assert.equal(numeroFogli(241), 121); // File Alice, Torino 2, giocatore thun
  assert.equal(numeroFogli(244), 122); // ultima pagina pari
  assert.throws(() => numeroFogli(0));
});

test('etichette dispari', () => {
  const e = etichetteFogli(123);
  assert.deepEqual(e.slice(0, 3), [1, 3, 5]);
  assert.equal(e.at(-1), 245);
});

test('pagine A4 da 11 fogli', () => {
  const p = paginaA4(133, 11);
  assert.equal(p.length, 13);
  assert.deepEqual(p[0], { da: 0, a: 11 });
  assert.deepEqual(p.at(-1), { da: 132, a: 133 });
});

test('zona foto con margini', () => {
  assert.deepEqual(zonaFoto({ fogli: 100, altezzaCm: 21 }), { col0: 0, col1: 100, cm0: 0, cm1: 21 });
  assert.deepEqual(
    zonaFoto({ fogli: 100, altezzaCm: 21, fogliVuotiInizio: 5, fogliVuotiFine: 10, cmVuotiSopra: 1.5, cmVuotiSotto: 2 }),
    { col0: 5, col1: 90, cm0: 1.5, cm1: 19 },
  );
  assert.throws(() => zonaFoto({ fogli: 10, altezzaCm: 21, fogliVuotiInizio: 10 }));
  assert.throws(() => zonaFoto({ fogli: 10, altezzaCm: 2, cmVuotiSopra: 1, cmVuotiSotto: 1 }));
});

test('fogli per pagina', () => {
  assert.equal(fogliPerPagina(182, 10), 18); // colonna da 1 cm su A4
  assert.equal(fogliPerPagina(182, 16.5), 11);
  assert.equal(fogliPerPagina(5, 10), 1);
  assert.throws(() => fogliPerPagina(182, 0));
});

test('ritaglio automatico dei bordi bianchi', () => {
  const w = 10, h = 8;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x, y] of [[2, 3], [6, 5]]) data.set([0, 0, 0, 255], (y * w + x) * 4);
  assert.deepEqual(rilevaBordi(data, w, h), { x: 2, y: 3, w: 5, h: 3 });
  assert.deepEqual(rilevaBordi(new Uint8ClampedArray(w * h * 4).fill(255), w, h), { x: 0, y: 0, w, h });
});
