// Anteprima 3D fotorealistica del libro piegato: pagine a ventaglio attorno al
// dorso sagomate secondo lo schema, lembi ripiegati, ombre morbide e occlusione
// ambientale fra le pagine, luce da studio e piano d'appoggio.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pattern, RasterImage } from '../engine/types';
import type { StripLayout, StripParams } from '../engine/strips';
import { rasterToCanvas } from '../lib/raster';
import { edgeAt, foldFlaps, type ReliefParams } from '../engine/relief';

interface Props {
  pattern: Pattern;
  /** Solo per strip art e lenticolare. */
  skin?: StripSkin;
}

const PAPER = new THREE.Color('#f1e9d6');
const BACKDROP = '#e9e5dc';

/** Colori di copertina proposti (tela da rilegatura); con il selettore si sceglie qualsiasi altro. */
const COVERS: [string, string][] = [
  ['Verde bottiglia', '#2f5d50'],
  ['Rosso bordeaux', '#6e1f2a'],
  ['Blu notte', '#1f2f4f'],
  ['Marrone pelle', '#5a3a24'],
  ['Nero', '#1c1c1c'],
  ['Senape', '#b8892e'],
  ['Crema', '#e7dcc2'],
];

/** Generatore pseudo-casuale con seme: le sfumature delle pagine restano stabili. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Trama di carta/tela procedurale, usata come mappa di colore e rugosità. */
function noiseTexture(size: number, base: string, amount: number, fibers: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const rand = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (fibers) {
    g.globalAlpha = 0.025;
    g.strokeStyle = '#000';
    for (let k = 0; k < size * 2; k++) {
      g.beginPath();
      const y = rand() * size;
      g.moveTo(0, y);
      g.lineTo(size, y + (rand() - 0.5) * 6);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Layout {
  roots: number[]; // posizione della radice di ogni pagina lungo il dorso (x)
  angles: number[];
  spineWidth: number;
}

function layoutFor(N: number, openingDeg: number, thicknessCm = 0.01): Layout {
  const theta = (openingDeg * Math.PI) / 180;
  const spineWidth = Math.min(8, Math.max(0.6, N * thicknessCm * 1.15));
  const rand = rng(N * 31 + openingDeg);
  const roots: number[] = [];
  const angles: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0.5 : i / (N - 1);
    roots.push((t - 0.5) * spineWidth);
    // piccola irregolarità come in un libro vero
    const jitter = (rand() - 0.5) * (theta / Math.max(1, N)) * 0.35;
    angles.push(-theta / 2 + theta * t + jitter);
  }
  return { roots, angles, spineWidth };
}

type V3 = [number, number, number];

/** Raccoglie triangoli con colore e normale espliciti, orientati verso l'esterno. */
class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uvs: number[] = [];
  /** Quadrilatero con coordinate di texture esplicite (una per vertice, stesso ordine di q). */
  quadUV(q: V3[], outward: V3, shade: V3, c: THREE.Color, uv: [number, number][]) {
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * outward[0] + cr[1] * outward[1] + cr[2] * outward[2] < 0;
    for (const k of flip ? [0, 2, 1, 2, 3, 1] : [0, 1, 2, 2, 1, 3]) {
      this.pos.push(...q[k]);
      this.nor.push(...shade);
      this.col.push(c.r, c.g, c.b);
      this.uvs.push(...uv[k]);
    }
  }
  /**
   * Quadrilatero q0 q1 q2 q3 (q0-q1 in alto, q2-q3 in basso) con la faccia
   * visibile dal lato `outward`; `shade` è la normale usata per la luce.
   */
  quad(q: V3[], outward: V3, shade: V3, c: THREE.Color) {
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * outward[0] + cr[1] * outward[1] + cr[2] * outward[2] < 0;
    const order = flip ? [0, 2, 1, 2, 3, 1] : [0, 1, 2, 2, 1, 3];
    for (const k of order) {
      this.pos.push(...q[k]);
      this.nor.push(...shade);
      this.col.push(c.r, c.g, c.b);
    }
  }
  tri(t: V3[], outward: V3, shade: V3, c: THREE.Color) {
    const e1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
    const e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * outward[0] + cr[1] * outward[1] + cr[2] * outward[2] < 0;
    for (const k of flip ? [0, 2, 1] : [0, 1, 2]) {
      this.pos.push(...t[k]);
      this.nor.push(...shade);
      this.col.push(c.r, c.g, c.b);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    let uv = this.uvs;
    if (!uv.length) {
      uv = [];
      for (let k = 0; k < this.pos.length; k += 3) uv.push(this.pos[k + 2] * 0.15, this.pos[k + 1] * 0.15);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
}

/** Strisce incollate sul bordo delle pagine (strip art e lenticolare). */
export interface StripSkin {
  kind: 'strip' | 'lenticular';
  a: RasterImage;
  b?: RasterImage;
  layout: StripLayout;
  params: StripParams;
}

/**
 * Costola colorata (di solito nero): si colora il bordo dei tratti scelti e le
 * superfici di taglio fra un tratto e l'altro, così taglio e piega risaltano.
 */
export interface Ink {
  color: string;
  /** Colora il bordo dei tratti piegati (rientrati). */
  folded: boolean;
  /** Colora il bordo dei tratti non piegati (a filo pagina). */
  unfolded: boolean;
}

/** Il pennarello sborda sulle facce del foglio: è questa fascia che si vede, il taglio è largo un decimo di mm. */
const INK_BAND_CM = 0.15;

const UP: V3 = [0, 1, 0];
const DOWN: V3 = [0, -1, 0];

/**
 * Pagine e lembi in due geometrie (vertex color per la sfumatura di ogni foglio).
 * Ogni foglio è un solido sottile chiuso: due facce, il bordo del taglio e i
 * gradini orizzontali dove la sporgenza cambia (i tagli), con lo spessore reale.
 */
function buildGeometry(p: Pattern, r: ReliefParams, L: Layout, thicknessCm: number, skin?: StripSkin, ink?: Ink) {
  const N = p.pages.length;
  const H = p.book.heightCm;
  const steps = Math.max(60, Math.round(H / 0.05));
  const dy = H / steps;
  const half = thicknessCm / 2;
  const pages = new Mesher();
  const flaps = new Mesher();
  const stripA = new Mesher();
  const stripB = new Mesher();
  const rand = rng(1234);
  const white = new THREE.Color(1, 1, 1);
  const tint = new THREE.Color();
  const inkColor = new THREE.Color(ink?.color ?? '#000000');
  const inked = (rr: number) => !!ink && (rr < r.pageWidthCm - 1e-6 ? ink.folded : ink.unfolded);
  const inkCuts = !!ink && (ink.folded || ink.unfolded);
  // fuori anche dai lembi ripiegati: il pennarello passa sopra la piega
  const bandOff = half + Math.max(thicknessCm, 0.004) + 0.002;
  const P = (i: number, rr: number, y: number, off = 0): V3 => {
    const a = L.angles[i];
    return [L.roots[i] + Math.sin(a) * rr + Math.cos(a) * off, H / 2 - y, Math.cos(a) * rr - Math.sin(a) * off];
  };
  for (let i = 0; i < N; i++) {
    const a = L.angles[i];
    const n: V3 = [Math.cos(a), 0, -Math.sin(a)];
    const nNeg: V3 = [-n[0], 0, -n[2]];
    const radial: V3 = [Math.sin(a), 0, Math.cos(a)];
    // ogni foglio ha una tinta leggermente diversa: crea le righe sottili del taglio
    const v = 0.9 + rand() * 0.1;
    const warm = rand() * 0.04;
    tint.setRGB(PAPER.r * v, PAPER.g * v * (1 - warm * 0.3), PAPER.b * v * (1 - warm));
    const R: number[] = [];
    for (let k = 0; k <= steps; k++) R.push(edgeAt(p, i, Math.min(H - 1e-6, k * dy), r));
    const segs: { y0: number; y1: number; rr: number }[] = [];
    let start = 0;
    for (let k = 1; k <= steps; k++) {
      if (R[k] !== R[start] || k === steps) {
        segs.push({ y0: start * dy, y1: k * dy, rr: R[start] });
        start = k;
      }
    }
    segs.forEach((sg, j) => {
      const { y0, y1, rr } = sg;
      // facce del foglio
      pages.quad([P(i, 0, y0, half), P(i, rr, y0, half), P(i, 0, y1, half), P(i, rr, y1, half)], n, n, tint);
      pages.quad([P(i, 0, y0, -half), P(i, rr, y0, -half), P(i, 0, y1, -half), P(i, rr, y1, -half)], nNeg, nNeg, tint);
      // bordo del taglio
      const edge = inked(rr) ? inkColor : tint;
      pages.quad([P(i, rr, y0, half), P(i, rr, y0, -half), P(i, rr, y1, half), P(i, rr, y1, -half)], radial, radial, edge);
      if (inked(rr) && rr > 0) {
        const b = Math.max(0, rr - INK_BAND_CM);
        pages.quad([P(i, b, y0, bandOff), P(i, rr, y0, bandOff), P(i, b, y1, bandOff), P(i, rr, y1, bandOff)], n, n, inkColor);
        pages.quad([P(i, b, y0, -bandOff), P(i, rr, y0, -bandOff), P(i, b, y1, -bandOff), P(i, rr, y1, -bandOff)], nNeg, nNeg, inkColor);
      }
      // gradino in alto: rivolto verso l'alto se il tratto sotto sporge di più
      const prev = j === 0 ? 0 : segs[j - 1].rr;
      if (prev !== rr) {
        const r0 = Math.min(prev, rr);
        const r1 = Math.max(prev, rr);
        const up = rr > prev;
        // superficie di taglio
        const cut = inkCuts ? inkColor : tint;
        pages.quad([P(i, r0, y0, half), P(i, r1, y0, half), P(i, r0, y0, -half), P(i, r1, y0, -half)], up ? UP : DOWN, up ? UP : DOWN, cut);
      }
      if (j === segs.length - 1)
        pages.quad([P(i, 0, y1, half), P(i, rr, y1, half), P(i, 0, y1, -half), P(i, rr, y1, -half)], DOWN, DOWN, tint);
    });
    // lembi ripiegati: appoggiati alla faccia del foglio rivolta verso chi guarda
    const flapTint = tint.clone().multiplyScalar(0.96);
    const side = n[2] >= 0 ? 1 : -1;
    const out = side > 0 ? n : nNeg;
    for (const poly of foldFlaps(p, i, r)) {
      const pts = poly.map(([rr, y]) => P(i, rr, y, side * (half + Math.max(thicknessCm, 0.004))));
      for (let t = 1; t + 1 < pts.length; t++) flaps.tri([pts[0], pts[t], pts[t + 1]], out, out, flapTint);
    }
    // strisce incollate sul bordo delle due facce della pagina
    if (skin) {
      const s = i - skin.layout.offset;
      const sl = skin.layout.slices[s];
      if (sl) {
        const W = r.pageWidthCm;
        const sw = Math.min(W, skin.params.widthCm);
        const yT = Math.max(0, skin.params.marginTopCm);
        const yB = Math.min(H, H - skin.params.marginBottomCm);
        if (yB > yT) {
          const S = skin.layout.source;
          const iw = skin.a.width;
          const ih = skin.a.height;
          const vT = 1 - S.y / ih;
          const vB = 1 - (S.y + S.h) / ih;
          const uA: [number, number] = [sl.x0 / iw, sl.x1 / iw];
          const off = half + 0.003;
          const quadOn = (m: Mesher, sign: number, u: [number, number], vt: number, vb: number) =>
            m.quadUV(
              [P(i, W - sw, yT, sign * off), P(i, W, yT, sign * off), P(i, W - sw, yB, sign * off), P(i, W, yB, sign * off)],
              sign > 0 ? n : nNeg,
              sign > 0 ? n : nNeg,
              white,
              [
                [u[0], vt],
                [u[1], vt],
                [u[0], vb],
                [u[1], vb],
              ],
            );
          quadOn(stripA, 1, uA, vT, vB);
          if (skin.kind === 'lenticular' && skin.b) {
            const bw = 1 / skin.layout.usedSheets;
            quadOn(stripB, -1, [s * bw, (s + 1) * bw], 1, 0);
          } else {
            quadOn(stripA, -1, uA, vT, vB);
          }
        }
      }
    }
  }
  return { pages: pages.geometry(), flaps: flaps.geometry(), stripA: stripA.geometry(), stripB: stripB.geometry() };
}

interface Three {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  book: THREE.Group;
  key: THREE.DirectionalLight;
  ground: THREE.Mesh;
  composer: EffectComposer;
  gtao: GTAOPass;
  aoMaterial: THREE.ShaderMaterial;
  paperTex: THREE.CanvasTexture;
  clothTex: THREE.CanvasTexture;
  contactTex: THREE.CanvasTexture;
  render: () => void;
}

export default function Book3D({ pattern, skin }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<Three | null>(null);
  const [opening, setOpening] = useState(180);
  const [depth, setDepth] = useState(2);
  const [width, setWidth] = useState(14);
  const [paperMm, setPaperMm] = useState(0.1);
  const [cover, setCover] = useState('#2f5d50');
  const [inkOn, setInkOn] = useState(false);
  const [inkWhere, setInkWhere] = useState<'folded' | 'unfolded' | 'both'>('folded');
  const [inkColor, setInkColor] = useState('#000000');
  const [hq, setHq] = useState(() => !/Android|iPhone|iPad/i.test(navigator.userAgent));
  const [error, setError] = useState('');
  const hqRef = useRef(hq);
  hqRef.current = hq;

  // Scena, luci, camera, post-processing: una sola volta
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError('Il browser non supporta la grafica 3D (WebGL).');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKDROP);
    // la nebbia fonde il piano d'appoggio con lo sfondo: nessuna linea d'orizzonte
    scene.fog = new THREE.Fog(BACKDROP, 90, 220);
    // luce che dipende solo da quanto una superficie guarda verso l'alto: tutte le facce
    // verticali delle pagine (a sinistra, a destra e al centro) ricevono la stessa luce
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfc6b4', 2.3));

    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    const key = new THREE.DirectionalLight('#fff6e8', 2.4);
    key.castShadow = true;
    // luce verticale: la camera delle ombre ha bisogno di un 'alto' non parallelo alla direzione
    key.shadow.camera.up.set(0, 0, -1);
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.05;
    
    scene.add(key, key.target);


    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.32 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const book = new THREE.Group();
    scene.add(book);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.55;

    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 2.5, scale: 1.2, samples: 24 });
    gtao.updatePdMaterial({ lumaPhi: 4, depthPhi: 1, normalPhi: 1, radius: 12, rings: 3, samples: 24 });
    gtao.blendIntensity = 1;
    // l'occlusione usa solo la profondità (normali rivolte alla camera): così pesa allo
    // stesso modo su facce viste di fronte o di sbieco e al centro non compare la cucitura
    // il piano d'appoggio viene escluso (discard): l'occlusione riguarda solo il libro
    const aoMaterial = new THREE.ShaderMaterial({
      uniforms: { groundY: { value: -1000 } },
      vertexShader:
        'varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader:
        'uniform float groundY; varying float vY; void main() { if (vY < groundY + 0.02) discard; gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0); }',
      blending: THREE.NoBlending,
    });
    gtao.normalMaterial = aoMaterial as unknown as THREE.MeshNormalMaterial;
    composer.addPass(gtao);
    composer.addPass(new OutputPass());

    const paperTex = noiseTexture(256, '#ffffff', 8, true);
    const clothTex = noiseTexture(256, '#ffffff', 60, false);
    // gradiente radiale per l'ombra di contatto
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const cg = cc.getContext('2d')!;
    const grad = cg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = grad;
    cg.fillRect(0, 0, 128, 128);
    const contactTex = new THREE.CanvasTexture(cc);

    let frame = 0;
    const render = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        renderer.shadowMap.enabled = hqRef.current;
        if (hqRef.current) composer.render();
        else renderer.render(scene, camera);
      });
    };
    controls.addEventListener('change', render);
    three.current = { renderer, scene, camera, controls, book, key, ground, composer, gtao, aoMaterial, paperTex, clothTex, contactTex, render };

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      composer.dispose();
      target.dispose();
      paperTex.dispose();
      clothTex.dispose();
      contactTex.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  const frontView = () => {
    const t = three.current;
    if (!t) return;
    const H = pattern.book.heightCm;
    t.camera.position.set(0, H * 0.32, width * 1.2 + H * 2.3);
    t.controls.target.set(0, -H * 0.04, width * 0.35);
    t.controls.update();
    t.render();
  };

  const threeQuarterView = () => {
    const t = three.current;
    if (!t) return;
    const H = pattern.book.heightCm;
    const d = width * 1.2 + H * 2.3;
    t.camera.position.set(d * 0.62, H * 0.55, d * 0.75);
    t.controls.target.set(0, -H * 0.04, width * 0.2);
    t.controls.update();
    t.render();
  };

  // Libro: ricostruito a ogni cambio di schema o parametri
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.book.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map && mat.map !== t.paperTex) mat.map.dispose();
        mat.dispose();
      }
    });
    t.book.clear();

    const H = pattern.book.heightCm;
    const N = pattern.pages.length;
    const L = layoutFor(N, opening, paperMm / 10);
    const ink: Ink | undefined = inkOn
      ? { color: inkColor, folded: inkWhere !== 'unfolded', unfolded: inkWhere !== 'folded' }
      : undefined;
    const { pages, flaps, stripA, stripB } = buildGeometry(pattern, { pageWidthCm: width, depthCm: depth }, L, paperMm / 10, skin, ink);
    const paperMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
      roughness: 0.88,
      metalness: 0,
      roughnessMap: t.paperTex,
      map: t.paperTex,
    });
    const pagesMesh = new THREE.Mesh(pages, paperMat);
    const flapsMesh = new THREE.Mesh(flaps, paperMat.clone());
    // strisce di immagine (strip art e lenticolare)
    if (skin) {
      const tex = (r: RasterImage) => {
        const tx = new THREE.CanvasTexture(rasterToCanvas(r));
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.anisotropy = t.renderer.capabilities.getMaxAnisotropy();
        return tx;
      };
      const meshes: [THREE.BufferGeometry, RasterImage | undefined][] = [
        [stripA, skin.a],
        [stripB, skin.b],
      ];
      for (const [g, img] of meshes) {
        if (!img || !g.getAttribute('position').count) {
          g.dispose();
          continue;
        }
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex(img), roughness: 0.7 }));
        m.castShadow = true;
        m.receiveShadow = true;
        t.book.add(m);
      }
    } else {
      stripA.dispose();
      stripB.dispose();
    }
    for (const m of [pagesMesh, flapsMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      t.book.add(m);
    }

    // copertine rigide in tela e dorso arrotondato
    const clothMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cover),
      roughness: 0.9,
      roughnessMap: t.clothTex,
      bumpMap: t.clothTex,
      bumpScale: 0.6,
    });
    const boardW = width + 0.4;
    const boardH = H + 0.6;
    for (const end of [0, N - 1]) {
      const sgn = end === 0 ? -1 : 1;
      const a = L.angles[end] + sgn * 0.035;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.28, boardH, boardW), clothMat);
      board.position.set(L.roots[end] + sgn * 0.2 + Math.sin(a) * (boardW / 2), 0, Math.cos(a) * (boardW / 2));
      board.rotation.y = a;
      board.castShadow = true;
      board.receiveShadow = true;
      t.book.add(board);
    }
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(L.spineWidth / 2 + 0.3, L.spineWidth / 2 + 0.3, boardH, 32, 1, true, Math.PI / 2, Math.PI),
      clothMat,
    );
    spine.position.z = 0.1;
    spine.castShadow = true;
    spine.material = clothMat.clone();
    (spine.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    t.book.add(spine);
    // fondo del blocco delle pagine lungo il dorso: chiude la fessura centrale fra i fogli
    const gutter = new THREE.Mesh(
      new THREE.BoxGeometry(L.spineWidth + 0.3, H, 0.5),
      new THREE.MeshStandardMaterial({ color: PAPER.clone().multiplyScalar(0.72), roughness: 0.95 }),
    );
    gutter.position.z = -0.2;
    t.book.add(gutter);
    // ombra di contatto morbida sotto il ventaglio delle pagine
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: t.contactTex, transparent: true, depthWrite: false, opacity: 0.55, color: '#000000' }),
    );
    contact.rotation.x = -Math.PI / 2;
    const reach = width * Math.max(0.35, Math.sin(Math.min(Math.PI / 2, (opening * Math.PI) / 360)));
    contact.scale.set(reach * 2.3, width * 1.35, 1);
    contact.position.set(0, -boardH / 2 + 0.01, width * 0.42);
    t.book.add(contact);

    // il libro poggia sul piano; luce chiave dall'alto a sinistra, ombre inquadrate sul libro
    t.ground.position.y = -boardH / 2;
    t.aoMaterial.uniforms.groundY.value = -boardH / 2;
    // luce principale dall'alto, appena in avanti e centrata: le facce delle pagine sono
    // verticali, quindi ricevono la stessa luce a sinistra, a destra e al centro
    t.key.position.set(0, H * 4, width * 0.3);
    t.key.target.position.set(0, 0, width * 0.3);
    const ext = width + H;
    const sc = t.key.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = ext * 6;
    sc.updateProjectionMatrix();
    // occlusione ambientale solo attorno al libro (niente aloni sullo sfondo)
    t.gtao.setSceneClipBox(
      new THREE.Box3(new THREE.Vector3(-width - 3, -boardH / 2 - 0.5, -width - 3), new THREE.Vector3(width + 3, boardH / 2 + 1, width + 3)),
    );
    frontView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, skin, opening, depth, width, paperMm, cover, inkOn, inkWhere, inkColor]);

  useEffect(() => {
    three.current?.render();
  }, [hq]);

  const saveImage = () => {
    const t = three.current;
    if (!t) return;
    t.renderer.shadowMap.enabled = hq;
    if (hq) t.composer.render();
    else t.renderer.render(t.scene, t.camera);
    const a = document.createElement('a');
    a.href = t.renderer.domElement.toDataURL('image/png');
    a.download = 'anteprima-3d.png';
    a.click();
  };

  if (error) return <p className="error">{error}</p>;

  return (
    <div className="book3d">
      <div className="book3d-view" ref={box} />
      <div className="book3d-controls">
        <label className="slider">
          <span>Apertura del libro {opening}°</span>
          <input type="range" min={90} max={360} step={10} value={opening} onChange={(e) => setOpening(Number(e.target.value))} />
        </label>
        <label className="slider">
          <span>Profondità delle pieghe {String(depth).replace('.', ',')} cm</span>
          <input type="range" min={0.5} max={6} step={0.5} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
        </label>
        <label className="slider">
          <span>Larghezza della pagina {width} cm</span>
          <input type="range" min={6} max={24} step={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <label className="slider">
          <span>Spessore della carta {String(paperMm).replace('.', ',')} mm</span>
          <input type="range" min={0.05} max={0.5} step={0.01} value={paperMm} onChange={(e) => setPaperMm(Number(e.target.value))} />
        </label>
        <div className="field">
          <span className="field-label">Colore della copertina</span>
          <div className="cover-row">
            {COVERS.map(([name, hex]) => (
              <button
                key={hex}
                type="button"
                className={`swatch${cover === hex ? ' on' : ''}`}
                style={{ background: hex }}
                aria-label={name}
                title={name}
                onClick={() => setCover(hex)}
              />
            ))}
            <input type="color" aria-label="Altro colore" value={cover} onChange={(e) => setCover(e.target.value)} />
          </div>
        </div>
        {!skin && (
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={inkOn} onChange={(e) => setInkOn(e.target.checked)} />
              Colora la costola tagliata
            </label>
            {inkOn && (
              <div className="cover-row">
                <select aria-label="Quali tratti colorare" value={inkWhere} onChange={(e) => setInkWhere(e.target.value as typeof inkWhere)}>
                  <option value="folded">Tratti piegati</option>
                  <option value="unfolded">Tratti non piegati</option>
                  <option value="both">Tutti</option>
                </select>
                <input type="color" aria-label="Colore della costola" value={inkColor} onChange={(e) => setInkColor(e.target.value)} />
              </div>
            )}
          </div>
        )}
        <div className="row-buttons">
          <label className="check">
            <input type="checkbox" checked={hq} onChange={(e) => setHq(e.target.checked)} />
            Qualità fotografica
          </label>
          <button type="button" className="secondary" onClick={frontView}>
            Vista frontale
          </button>
          <button type="button" className="secondary" onClick={threeQuarterView}>
            Vista di tre quarti
          </button>
          <button type="button" className="secondary" onClick={saveImage}>
            Salva immagine
          </button>
        </div>
      </div>
      <p className="hint">
        Trascina per ruotare, rotella o due dita per lo zoom. La qualità fotografica aggiunge ombre e occlusione fra le
        pagine: se il telefono rallenta, disattivala.
      </p>
    </div>
  );
}
