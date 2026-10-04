// Anteprima 3D del libro piegato/tagliato (three.js, caricato solo se serve).
// Assi in cm: y = altezza (0 in basso); il libro guarda verso +z, col dorso
// nell'origine e la pagina 1 a sinistra. Ogni foglio ha i tratti "in fuori"
// che sporgono di pieghaCm; il resto è piegato e mostra la faccia arretrata.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CARTA = '#f6f1e6';
const CARTA_LATO = '#e4dccb';
const PIEGA = '#ddd4c2';
const COPERTINA = '#5b3a29';

export function creaVista(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scena = new THREE.Scene();
  scena.background = new THREE.Color('#efebe4');
  scena.add(new THREE.HemisphereLight('#ffffff', '#8a8070', 1.6));
  const sole = new THREE.DirectionalLight('#ffffff', 2.2);
  sole.position.set(30, 40, 60);
  scena.add(sole);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  const controlli = new OrbitControls(camera, canvas);
  controlli.enableDamping = false;
  controlli.addEventListener('change', disegna);

  const materiale = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  let mesh = null;
  let inquadratura = '';

  function disegna() {
    renderer.render(scena, camera);
  }

  function ridimensiona() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    disegna();
  }
  const osservatore = new ResizeObserver(ridimensiona);
  osservatore.observe(canvas);

  function aggiorna(m) {
    if (mesh) {
      scena.remove(mesh);
      mesh.geometry.dispose();
    }
    mesh = new THREE.Mesh(costruisci(m), materiale);
    scena.add(mesh);
    // Reinquadra solo se cambia la forma del libro, non per colori o soglia:
    // l'utente può aver girato la vista e non va riportata indietro.
    const chiave = [m.altezzaCm, m.larghezzaCm, m.aperturaGradi, m.spessoreCm].join();
    if (chiave !== inquadratura) {
      const meta = (Math.min(m.aperturaGradi, 180) * Math.PI) / 360;
      const larghezza = Math.max(m.spessoreCm, 2 * m.larghezzaCm * Math.sin(meta));
      const d = Math.max(m.altezzaCm, larghezza) * 1.6;
      const centro = new THREE.Vector3(0, m.altezzaCm / 2, m.larghezzaCm * (m.aperturaGradi > 90 ? 0.4 : 0.9));
      controlli.target.copy(centro);
      camera.position.set(centro.x + d * 0.25, centro.y + d * 0.2, centro.z + d);
      controlli.update();
      inquadratura = chiave;
    }
    ridimensiona();
  }

  return { aggiorna, distruggi: () => { osservatore.disconnect(); controlli.dispose(); renderer.dispose(); } };
}

/**
 * Geometria unica con colori per vertice. Ogni foglio è costruito nel proprio
 * riferimento (x = spessore, z = dalla costola al taglio) e poi ruotato attorno
 * al suo punto sul dorso: con apertura 0 è un libro chiuso, con 180° un ventaglio.
 */
function costruisci(m) {
  const pos = [], nor = [], col = [];
  const c = (hex) => new THREE.Color(hex);
  const colore = c(m.colore);
  const carta = c(CARTA), lato = c(CARTA_LATO), piega = c(PIEGA), copertina = c(COPERTINA);

  let cos = 1, sin = 0, px = 0;
  const posa = (x, y, z) => [px + x * cos + z * sin, y, -x * sin + z * cos];
  const ruota = (n) => [n[0] * cos + n[2] * sin, n[1], -n[0] * sin + n[2] * cos];

  // Quadrilatero a, b, c, d in senso antiorario visto dal lato della normale n.
  function quad(a, b, cc, d, n, colQ) {
    const nr = ruota(n);
    for (const p of [a, b, cc, a, cc, d]) {
      pos.push(...posa(...p));
      nor.push(...nr);
      col.push(colQ.r, colQ.g, colQ.b);
    }
  }
  // Parallelepipedo con un colore per faccia: { fronte, sopra, sotto, lati, retro }.
  function box(x0, x1, y0, y1, z0, z1, f) {
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], f.fronte);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], f.retro);
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], f.sopra);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], f.sotto);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], f.lati);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], f.lati);
  }
  function posiziona(angoloGradi, perno) {
    const a = (angoloGradi * Math.PI) / 180;
    cos = Math.cos(a); sin = Math.sin(a); px = perno;
  }

  const H = m.altezzaCm, T = m.spessoreCm, W = m.larghezzaCm;
  const Z0 = Math.max(0.1, W - m.pieghaCm);
  const fogli = m.tratti.length;
  const passo = T / fogli;
  // Sotto qualche decimo di mm il foglio diventa più sottile di un pixel e sfarfalla.
  const mezzo = Math.max(passo * 0.41, 0.015);
  const colPiega = m.coloraPieghe ? colore : piega;
  const colTaglio = m.coloraTaglio ? colore : carta;
  const angolo = (i) => (fogli > 1 ? -m.aperturaGradi / 2 + (m.aperturaGradi * i) / (fogli - 1) : 0);

  // Il pennarello colora il taglio e sborda di qualche decimo sulle facce del
  // foglio: è questa fascia che rende visibile il colore, il taglio da solo è
  // largo un decimo di millimetro. Leggermente più spessa per non sovrapporsi.
  const fascia = Math.min(0.15, m.pieghaCm / 2);
  const tutto = (col) => ({ fronte: col, retro: col, sopra: col, sotto: col, lati: col });

  m.tratti.forEach((lista, i) => {
    posiziona(angolo(i), -T / 2 + (i + 0.5) * passo);
    // Parte del foglio fino alla piega: la faccia frontale è la piega.
    box(-mezzo, mezzo, 0, H, 0, Z0, { fronte: colPiega, retro: lato, sopra: lato, sotto: lato, lati: carta });
    if (m.coloraPieghe) box(-mezzo * 1.06, mezzo * 1.06, 0, H, Z0 - fascia, Z0, tutto(colore));
    // Tratti sporgenti: fronte, sopra e sotto sono la costola tagliata.
    for (const tr of lista) {
      if (tr.disegno !== m.fuoriDisegno) continue;
      const y0 = H - tr.a / 10, y1 = H - tr.da / 10;
      box(-mezzo, mezzo, y0, y1, Z0, W, { fronte: colTaglio, retro: carta, sopra: colTaglio, sotto: colTaglio, lati: lato });
      if (m.coloraTaglio) box(-mezzo * 1.06, mezzo * 1.06, y0, y1, W - fascia, W, tutto(colore));
    }
  });

  // Copertina rigida: due piatti che si aprono con i primi e gli ultimi fogli.
  const s = 0.25, b = 0.3;
  const cop = { fronte: copertina, retro: copertina, sopra: copertina, sotto: copertina, lati: copertina };
  posiziona(angolo(0), -T / 2);
  box(-s, 0, -b, H + b, 0, W + b, cop);
  posiziona(angolo(fogli - 1), T / 2);
  box(0, s, -b, H + b, 0, W + b, cop);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
