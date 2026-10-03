import { COLOR_LAYERS, GRAY_LAYERS, type Layer, type ShadowMode } from '../engine/types';
import { hexToRgb, rgbToHex } from '../lib/draw';

interface Props {
  layers: Layer[];
  onChange: (l: Layer[]) => void;
}

const NEXT_CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Editor dei livelli del dimensional: codice, nome, colore, profondità e shadow. */
export function Layers({ layers, onChange }: Props) {
  const set = (i: number, patch: Partial<Layer>) => onChange(layers.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const copy = [...layers];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  const add = () => {
    const used = new Set(layers.map((l) => l.code));
    const code = [...NEXT_CODES].find((c) => !used.has(c)) ?? `L${layers.length + 1}`;
    onChange([...layers, { code, name: `Livello ${code}`, color: [100, 100, 100] }]);
  };

  return (
    <div className="layers">
      <p className="hint">
        Ogni zona dell'immagine va al livello con il colore più vicino; il bianco non si lavora. La profondità
        compare solo nella legenda del PDF.
      </p>
      {layers.map((l, i) => (
        <div className="layer" key={i}>
          <input
            type="color"
            aria-label={`Colore del livello ${l.code}`}
            value={rgbToHex(l.color)}
            onChange={(e) => set(i, { color: hexToRgb(e.target.value) })}
          />
          <input
            className="layer-code"
            aria-label="Codice"
            maxLength={2}
            value={l.code}
            onChange={(e) => set(i, { code: e.target.value.toUpperCase() })}
          />
          <input aria-label="Nome" value={l.name} onChange={(e) => set(i, { name: e.target.value })} />
          <label className="layer-depth">
            <input
              type="number"
              min={0}
              step={0.1}
              aria-label="Profondità in cm"
              placeholder="prof."
              value={l.depthCm ?? ''}
              onChange={(e) => set(i, { depthCm: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
            <span>cm</span>
          </label>
          <select
            aria-label="Shadow del livello"
            value={l.shadow ?? 'none'}
            onChange={(e) => set(i, { shadow: e.target.value as ShadowMode | 'none' })}
          >
            <option value="none">Tutte</option>
            <option value="1:1">1:1</option>
            <option value="1:2">1/3</option>
            <option value="2:1">2/3</option>
          </select>
          <span className="layer-tools">
            <button type="button" className="icon" aria-label="Sposta su" onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="icon" aria-label="Sposta giù" onClick={() => move(i, 1)}>
              ↓
            </button>
            <button
              type="button"
              className="icon"
              aria-label="Elimina livello"
              onClick={() => onChange(layers.filter((_, k) => k !== i))}
            >
              ×
            </button>
          </span>
        </div>
      ))}
      <div className="row-buttons">
        <button type="button" className="secondary" onClick={add}>
          Aggiungi livello
        </button>
        <button type="button" className="secondary" onClick={() => onChange(GRAY_LAYERS)}>
          Grigi (3)
        </button>
        <button type="button" className="secondary" onClick={() => onChange(COLOR_LAYERS)}>
          Colori (7)
        </button>
      </div>
    </div>
  );
}
