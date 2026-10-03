// Anteprima 3D del libro piegato: pagine aperte a ventaglio attorno al dorso,
// ogni pagina sagomata secondo lo schema calcolato.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Pattern } from '../engine/types';
import { edgeAt, type ReliefParams } from '../engine/relief';

interface Props {
  pattern: Pattern;
}

const PAPER = new THREE.Color('#fbf7ec');
const PAPER_SHADE = new THREE.Color('#4a4237');
const CLOTH = '#2f5d50';

/** Costruisce la geometria di tutte le pagine in un'unica mesh. */
function buildPages(p: Pattern, r: ReliefParams, openingDeg: number): THREE.BufferGeometry {
  const N = p.pages.length;
  const H = p.book.heightCm;
  const W = r.pageWidthCm;
  const steps = Math.max(60, Math.round(H / 0.05)); // campionamento ogni 0,5 mm
  const dy = H / steps;
  const theta = (openingDeg * Math.PI) / 180;
  const pos: number[] = [];
  const col: number[] = [];
  let c = new THREE.Color();
  // colore al dorso (ombra dentro il libro) e al taglio (chiaro se sporge, scuro se piegato)
  const spineColor = new THREE.Color().copy(PAPER).lerp(PAPER_SHADE, 0.75);
  const pushQuad = (dir: [number, number], y0: number, y1: number, r0: number, r1: number, edge: THREE.Color) => {
    // y in cm dal bordo alto → coordinata verticale centrata
    const Y0 = H / 2 - y0;
    const Y1 = H / 2 - y1;
    const [dx, dz] = dir;
    const v = [
      [0, Y0, 0],
      [r0 * dx, Y0, r0 * dz],
      [0, Y1, 0],
      [r1 * dx, Y1, r1 * dz],
    ];
    const colors = [spineColor, edge, spineColor, edge];
    for (const k of [0, 1, 2, 2, 1, 3]) {
      pos.push(...v[k]);
      col.push(colors[k].r, colors[k].g, colors[k].b);
    }
  };
  for (let i = 0; i < N; i++) {
    const a = N === 1 ? 0 : -theta / 2 + (theta * i) / (N - 1);
    const dir: [number, number] = [Math.sin(a), Math.cos(a)];
    // profilo campionato; i tratti a sporgenza costante diventano un solo quadrilatero
    const R: number[] = [];
    for (let k = 0; k <= steps; k++) R.push(edgeAt(p, i, Math.min(H - 1e-6, k * dy), r));
    let start = 0;
    for (let k = 1; k <= steps; k++) {
      if (R[k] !== R[start] || k === steps) {
        const rMin = R[start];
        const depth = Math.max(0, (W - rMin) / W);
        c.copy(PAPER);
        if (rMin < W - 1e-6) c.lerp(PAPER_SHADE, Math.min(0.8, 0.4 + depth * 2));
        c = c.clone();
        pushQuad(dir, start * dy, k * dy, R[start], R[start], c);
        start = k;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export default function Book3D({ pattern }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    book: THREE.Group;
  } | null>(null);
  const [opening, setOpening] = useState(180);
  const [depth, setDepth] = useState(2);
  const [width, setWidth] = useState(14);
  const [error, setError] = useState('');

  // Scena, luci, camera: una sola volta
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
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9ebe4');
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
    scene.add(new THREE.HemisphereLight('#ffffff', '#8c8576', 0.7));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(-35, 25, 30);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#fff3dc', 0.5);
    rim.position.set(30, -10, 20);
    scene.add(rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const book = new THREE.Group();
    scene.add(book);
    three.current = { renderer, scene, camera, controls, book };

    // il contenitore ha altezza fissata dal CSS: il canvas si adatta senza cambiare l'impaginazione
    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  const frontView = () => {
    const t = three.current;
    if (!t) return;
    const H = pattern.book.heightCm;
    t.camera.position.set(0, H * 0.15, width * 1.4 + H * 2.1);
    t.controls.target.set(0, 0, width * 0.45);
    t.controls.update();
  };

  // Libro: ricostruito a ogni cambio di schema o parametri
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    for (const ch of [...t.book.children]) {
      t.book.remove(ch);
      const m = ch as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    }
    const H = pattern.book.heightCm;
    const geo = buildPages(pattern, { pageWidthCm: width, depthCm: depth }, opening);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 });
    t.book.add(new THREE.Mesh(geo, mat));
    // copertine rigide alle due estremità del ventaglio
    const theta = (opening * Math.PI) / 180;
    for (const sgn of [-1, 1]) {
      const a = (sgn * theta) / 2 + sgn * 0.03;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, H + 0.6, width + 0.4),
        new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.8 }),
      );
      const rr = (width + 0.4) / 2;
      board.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      board.rotation.y = a;
      t.book.add(board);
    }
    // dorso
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, H + 0.6, 16),
      new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.8 }),
    );
    t.book.add(spine);
    frontView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, opening, depth, width]);

  const saveImage = () => {
    const t = three.current;
    if (!t) return;
    t.renderer.render(t.scene, t.camera);
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
        <div className="row-buttons">
          <button type="button" className="secondary" onClick={frontView}>
            Vista frontale
          </button>
          <button type="button" className="secondary" onClick={saveImage}>
            Salva immagine
          </button>
        </div>
      </div>
      <p className="hint">
        Trascina per ruotare, rotella o due dita per lo zoom. Simulazione indicativa: pieghe e tagli sono resi come
        rientranze della profondità scelta; nel dimensional ogni livello usa la sua profondità, se indicata.
      </p>
    </div>
  );
}
