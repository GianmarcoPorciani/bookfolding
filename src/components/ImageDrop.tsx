import { useRef, useState } from 'react';
import { fileToLoaded, type LoadedImage } from '../lib/raster';

interface Props {
  label: string;
  image: LoadedImage | null;
  onChange: (img: LoadedImage | null) => void;
  hint?: string;
}

/** Riquadro per caricare un'immagine: clic, trascinamento o incolla. */
export function ImageDrop({ label, image, onChange, hint }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');

  const load = async (file?: File | null) => {
    if (!file) return;
    setError('');
    try {
      onChange(await fileToLoaded(file));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div
        className={`drop${over ? ' drop-over' : ''}${image ? ' drop-full' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          load(e.dataTransfer.files?.[0]);
        }}
      >
        {image ? (
          <>
            <img src={image.dataUrl} alt="" />
            <div className="drop-info">
              <span className="drop-name">{image.name}</span>
              <span className="muted">
                {image.raster.width} × {image.raster.height} px
              </span>
              <span className="drop-actions">
                <button type="button" className="link" onClick={() => input.current?.click()}>
                  Cambia
                </button>
                <button type="button" className="link" onClick={() => onChange(null)}>
                  Rimuovi
                </button>
              </span>
            </div>
          </>
        ) : (
          <button type="button" className="drop-empty" onClick={() => input.current?.click()}>
            <strong>Scegli un'immagine</strong>
            <span>{hint ?? 'oppure trascinala qui o incollala con Ctrl+V. PNG, JPG o SVG.'}</span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
          hidden
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
