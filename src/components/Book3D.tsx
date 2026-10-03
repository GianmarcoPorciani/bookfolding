// Anteprima 3D fotorealistica del libro piegato: pagine a ventaglio attorno al
// dorso sagomate secondo lo schema, lembi ripiegati, ombre morbide e occlusione
// ambientale fra le pagine, luce da studio e piano d'appoggio.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pattern } from '../engine/types';
import { edgeAt, foldFlaps, type ReliefParams } from '../engine/relief';

interface Props {
  pattern: Pattern;
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

/**
 * Pagine e lembi in due geometrie (vertex color per la sfumatura di ogni foglio).
 * Ogni foglio è un solido sottile: due facce, il bordo del taglio e i gradini
 * orizzontali dove la sporgenza cambia (i tagli), con lo spessore reale della carta.
 */
function buildGeometry(p: Pattern, r: ReliefParams, L: Layout, thicknessCm: number) {
  const N = p.pages.length;
  const H = p.book.heightCm;
  const steps = Math.max(60, Math.round(H / 0.05));
  const dy = H / steps;
  const half = thicknessCm / 2;
  const pages: number[] = [];
  const pagesCol: number[] = [];
  const flaps: number[] = [];
  const flapsCol: number[] = [];
  const rand = rng(1234);
  const tint = new THREE.Color();
  const edgeTint = new THREE.Color();
  // punto della pagina i a distanza rr dal dorso, altezza y, spostato di off lungo la normale
  const P = (i: number, rr: number, y: number, off = 0): [number, number, number] => {
    const a = L.angles[i];
    return [L.roots[i] + Math.sin(a) * rr + Math.cos(a) * off, H / 2 - y, Math.cos(a) * rr - Math.sin(a) * off];
  };
  const quad = (out: number[], cols: number[], q: [number, number, number][], c: THREE.Color) => {
    for (const idx of [0, 1, 2, 2, 1, 3]) {
      out.push(...q[idx]);
      cols.push(c.r, c.g, c.b);
    }
  };
  for (let i = 0; i < N; i++) {
    // ogni foglio ha una tinta leggermente diversa: crea le righe sottili del taglio
    const v = 0.9 + rand() * 0.1;
    const warm = rand() * 0.04;
    tint.setRGB(PAPER.r * v, PAPER.g * v * (1 - warm * 0.3), PAPER.b * v * (1 - warm));
    edgeTint.copy(tint).multiplyScalar(0.94);
    const R: number[] = [];
    for (let k = 0; k <= steps; k++) R.push(edgeAt(p, i, Math.min(H - 1e-6, k * dy), r));
    // tratti a sporgenza costante
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
      // due facce del foglio
      for (const off of [half, -half]) quad(pages, pagesCol, [P(i, 0, y0, off), P(i, rr, y0, off), P(i, 0, y1, off), P(i, rr, y1, off)], tint);
      // bordo del taglio
      quad(pages, pagesCol, [P(i, rr, y0, half), P(i, rr, y0, -half), P(i, rr, y1, half), P(i, rr, y1, -half)], edgeTint);
      // gradino in alto (inizio pagina o cambio di sporgenza)
      const prev = j === 0 ? 0 : segs[j - 1].rr;
      if (prev !== rr) {
        const r0 = Math.min(prev, rr);
        const r1 = Math.max(prev, rr);
        quad(pages, pagesCol, [P(i, r0, y0, half), P(i, r1, y0, half), P(i, r0, y0, -half), P(i, r1, y0, -half)], edgeTint);
      }
      if (j === segs.length - 1)
        quad(pages, pagesCol, [P(i, 0, y1, half), P(i, rr, y1, half), P(i, 0, y1, -half), P(i, rr, y1, -half)], edgeTint);
    });
    // lembi ripiegati: appoggiati alla faccia del foglio
    const flapTint = tint.clone().multiplyScalar(0.96);
    for (const poly of foldFlaps(p, i, r)) {
      const pts = poly.map(([rr, y]) => P(i, rr, y, half + Math.max(thicknessCm, 0.004)));
      for (let t = 1; t + 1 < pts.length; t++) {
        for (const pt of [pts[0], pts[t], pts[t + 1]]) {
          flaps.push(...pt);
          flapsCol.push(flapTint.r, flapTint.g, flapTint.b);
        }
      }
    }
  }
  const mk = (pos: number[], col: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // coordinate UV per la trama della carta (proiezione semplice)
    const uv: number[] = [];
    for (let k = 0; k < pos.length; k += 3) uv.push(pos[k + 2] * 0.15, pos[k + 1] * 0.15);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  return { pages: mk(pages, pagesCol), flaps: mk(flaps, flapsCol) };
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
  paperTex: THREE.CanvasTexture;
  clothTex: THREE.CanvasTexture;
  render: () => void;
}

export default function Book3D({ pattern }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<Three | null>(null);
  const [opening, setOpening] = useState(180);
  const [depth, setDepth] = useState(2);
  const [width, setWidth] = useState(14);
  const [paperMm, setPaperMm] = useState(0.1);
  const [cover, setCover] = useState('#2f5d50');
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
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKDROP);
    // la nebbia fonde il piano d'appoggio con lo sfondo: nessuna linea d'orizzonte
    scene.fog = new THREE.Fog(BACKDROP, 90, 220);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    const key = new THREE.DirectionalLight('#fff6e8', 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.05;
    
    scene.add(key, key.target);
    const fillL = new THREE.DirectionalLight('#fff1dc', 0.45);
    fillL.position.set(-50, 15, 20);
    const fillR = new THREE.DirectionalLight('#e6eeff', 0.45);
    fillR.position.set(50, 15, 20);
    scene.add(fillL, fillR);

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
    // i fogli si vedono sia di fronte sia dal retro: l'occlusione deve considerare entrambe le facce
    gtao.normalMaterial.side = THREE.DoubleSide;
    composer.addPass(gtao);
    composer.addPass(new OutputPass());

    const paperTex = noiseTexture(256, '#ffffff', 8, true);
    const clothTex = noiseTexture(256, '#ffffff', 60, false);

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
    three.current = { renderer, scene, camera, controls, book, key, ground, composer, gtao, paperTex, clothTex, render };

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
      pmrem.dispose();
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
        (m.material as THREE.Material).dispose();
      }
    });
    t.book.clear();

    const H = pattern.book.heightCm;
    const N = pattern.pages.length;
    const L = layoutFor(N, opening, paperMm / 10);
    const { pages, flaps } = buildGeometry(pattern, { pageWidthCm: width, depthCm: depth }, L, paperMm / 10);
    const paperMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0,
      roughnessMap: t.paperTex,
      map: t.paperTex,
    });
    const pagesMesh = new THREE.Mesh(pages, paperMat);
    const flapsMesh = new THREE.Mesh(flaps, paperMat.clone());
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
    t.book.add(spine);

    // il libro poggia sul piano; luce chiave dall'alto a sinistra, ombre inquadrate sul libro
    t.ground.position.y = -boardH / 2;
    // luce principale frontale dall'alto: illumina allo stesso modo le due metà del libro
    t.key.position.set(-width * 0.15, H * 3, width * 2.6);
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
  }, [pattern, opening, depth, width, paperMm, cover]);

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
