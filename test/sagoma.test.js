import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eDisegno, tratti, trattiPerFoglio } from '../src/sagoma.js';

test('disegno: scuro e opaco', () => {
  assert.equal(eDisegno(0, 0, 0, 255, 200), true);
  assert.equal(eDisegno(255, 255, 255, 255, 200), false);
  assert.equal(eDisegno(0, 0, 0, 0, 200), false); // trasparente = sfondo
});

test('tratti consecutivi', () => {
  assert.deepEqual(tratti([false, true, true, false]), [
    { da: 0, a: 1, disegno: false },
    { da: 1, a: 3, disegno: true },
    { da: 3, a: 4, disegno: false },
  ]);
  assert.deepEqual(tratti([true]), [{ da: 0, a: 1, disegno: true }]);
});

test('tratti per foglio da RGBA', () => {
  // 2 fogli, 3 mm: foglio 0 nero solo al mm 1, foglio 1 tutto bianco.
  const bianco = [255, 255, 255, 255], nero = [0, 0, 0, 255];
  const data = new Uint8ClampedArray([...bianco, ...bianco, ...nero, ...bianco, ...bianco, ...bianco]);
  const t = trattiPerFoglio(data, 2, 3, 128);
  assert.deepEqual(t[0].map((x) => x.disegno), [false, true, false]);
  assert.deepEqual(t[1], [{ da: 0, a: 3, disegno: false }]);
});
