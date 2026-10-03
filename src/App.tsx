import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { computePattern, availableSheets } from './engine/pattern';
import { METHOD_LABELS, type Method, type PatternOptions, type BookSettings, type ShadowMode } from './engine/types';
import { autoCrop, stripLayout, type StripParams, type CropPercent } from './engine/strips';
import { ImageDrop } from './components/ImageDrop';
import { Layers } from './components/Layers';
import { Preview } from './components/Preview';
import { Table } from './components/Table';
import { WorkMode } from './components/WorkMode';
import { StripPreview } from './components/StripPreview';
import { dataUrlToRaster, fileToDataUrl, fileToLoaded, loadImageElement, type LoadedImage } from './lib/raster';
import { layerColorMap, previewDataUrl } from './lib/draw';
import {
  DEFAULT_PROJECT,
  downloadBlob,
  loadLast,
  loadProfile,
  normalizeStrip,
  safeFileName,
  saveLast,
  saveProfile,
  type Meta,
  type Project,
} from './state';
import type { DecimalSep } from './engine/format';

type View = 'anteprima' | '3d' | 'tabella' | 'lavoro';

const Book3D = lazy(() => import('./components/Book3D'));

const METHOD_ORDER: Method[] = [
  'inverted',
  'embossed',
  'combi',
  'mmf',
  'mmf-multi',
  'shadow',
  'twotone',
  'multilayer',
  'strip',
  'lenticular',
];

function num(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export default function App() {
  const initial = useMemo<Project>(() => {
    const last = loadLast();
    const profile = loadProfile();
    const base = last ?? DEFAULT_PROJECT;
    return {
      ...base,
      decimalSep: profile.decimalSep ?? base.decimalSep,
      meta: {
        ...base.meta,
        author: base.meta.author || profile.author || '',
        copyright: base.meta.copyright || profile.copyright || '',
        logoDataUrl: base.meta.logoDataUrl || profile.logoDataUrl,
      },
    };
  }, []);

  const [book, setBook] = useState<BookSettings>(initial.book);
  const [options, setOptions] = useState<PatternOptions>(initial.options);
  const [meta, setMeta] = useState<Meta>(initial.meta);
  const [decimalSep, setDecimalSep] = useState<DecimalSep>(initial.decimalSep);
  const [strip, setStrip] = useState<StripParams>(initial.strip);
  const [imgA, setImgA] = useState<LoadedImage | null>(null);
  const [imgB, setImgB] = useState<LoadedImage | null>(null);
  const [view, setView] = useState<View>('anteprima');
  const [workStart, setWorkStart] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const projectInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Ricarica le immagini dell'ultimo progetto
  useEffect(() => {
    if (initial.imageA) dataUrlToRaster(initial.imageA.dataUrl, initial.imageA.name).then(setImgA).catch(() => {});
    if (initial.imageB) dataUrlToRaster(initial.imageB.dataUrl, initial.imageB.name).then(setImgB).catch(() => {});
  }, [initial]);

  const project: Project = useMemo(
    () => ({
      version: 1,
      book,
      options,
      meta,
      decimalSep,
      strip,
      imageA: imgA ? { name: imgA.name, dataUrl: imgA.dataUrl } : undefined,
      imageB: imgB ? { name: imgB.name, dataUrl: imgB.dataUrl } : undefined,
    }),
    [book, options, meta, decimalSep, strip, imgA, imgB],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      saveLast(project);
      saveProfile(meta, decimalSep);
    }, 400);
    return () => clearTimeout(t);
  }, [project, meta, decimalSep]);

  // Incolla un'immagine dagli appunti
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setImgA(await fileToLoaded(file));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const isStrip = options.method === 'strip' || options.method === 'lenticular';
  const deferredBook = useDeferredValue(book);
  const deferredOptions = useDeferredValue(options);

  const pattern = useMemo(() => {
    if (!imgA || isStrip) return null;
    if (deferredBook.lastPage < deferredBook.firstPage || deferredBook.heightCm <= 0) return null;
    return computePattern(imgA.raster, deferredBook, deferredOptions);
  }, [imgA, deferredBook, deferredOptions, isStrip]);

  const stripResult = useMemo(() => {
    if (!imgA || !isStrip) return null;
    try {
      return {
        layout: stripLayout(imgA.raster, book, {
          sheets: options.widthMode === 'sheets' ? options.sheets : undefined,
          emptyStart: strip.emptyStart,
          emptyEnd: strip.emptyEnd,
          crop: strip.crop,
        }),
        error: '',
      };
    } catch (e) {
      return { layout: null, error: (e as Error).message };
    }
  }, [imgA, isStrip, book, options.widthMode, options.sheets, strip.emptyStart, strip.emptyEnd, strip.crop]);

  const layerColors = useMemo(
    () => (options.method === 'multilayer' ? layerColorMap(options.layers) : undefined),
    [options.method, options.layers],
  );

  const setOpt = <K extends keyof PatternOptions>(k: K, v: PatternOptions[K]) => setOptions((o) => ({ ...o, [k]: v }));
  const setBk = <K extends keyof BookSettings>(k: K, v: BookSettings[K]) => setBook((b) => ({ ...b, [k]: v }));
  const setSt = <K extends keyof StripParams>(k: K, v: StripParams[K]) => setStrip((x) => ({ ...x, [k]: v }));
  const setCrop = (k: keyof CropPercent, v: number) => setStrip((x) => ({ ...x, crop: { ...x.crop, [k]: v } }));
  const setMt = <K extends keyof Meta>(k: K, v: Meta[K]) => setMeta((m) => ({ ...m, [k]: v }));

  const N = availableSheets(book);
  const used = pattern ? pattern.pages.filter((e) => e.marks.length) : [];

  const pdfMeta = useCallback(async () => {
    let logo;
    if (meta.logoDataUrl) {
      const el = await loadImageElement(meta.logoDataUrl);
      logo = { dataUrl: meta.logoDataUrl, width: el.naturalWidth, height: el.naturalHeight };
    }
    return {
      title: meta.title || imgA?.name.replace(/\.\w+$/, '') || 'Schema',
      author: meta.author,
      copyright: meta.copyright,
      notes: meta.notes,
      logo,
      decimalSep,
    };
  }, [meta, imgA, decimalSep]);

  const exportPdf = async () => {
    if (!imgA) return;
    setBusy('Preparo il PDF…');
    setMessage('');
    try {
      const m = await pdfMeta();
      const { patternPdf, stripPdf } = await import('./lib/pdf');
      let blob: Blob;
      if (isStrip) {
        if (options.method === 'lenticular' && !imgB) throw new Error("Per il lenticolare carica anche l'immagine B.");
        if (!stripResult?.layout) throw new Error(stripResult?.error || 'Controlla le impostazioni delle strisce.');
        blob = await stripPdf(
          options.method as 'strip' | 'lenticular',
          { a: imgA.raster, aUrl: imgA.dataUrl, b: imgB?.raster, bUrl: imgB?.dataUrl },
          stripResult.layout,
          book.heightCm,
          strip,
          m,
          book,
        );
      } else {
        if (!pattern) throw new Error('Controlla prima e ultima pagina e altezza del libro.');
        blob = await patternPdf(pattern, m, imgA, previewDataUrl(pattern, 1400, 700, layerColors));
      }
      downloadBlob(blob, `${safeFileName(m.title)}.pdf`);
      setMessage('PDF scaricato.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const exportExcel = async () => {
    if (!imgA || !stripResult?.layout) return;
    setBusy('Preparo il file Excel…');
    setMessage('');
    try {
      if (options.method === 'lenticular' && !imgB) throw new Error("Per il lenticolare carica anche l'immagine B.");
      const { stripExcel } = await import('./lib/excel');
      const blob = await stripExcel(
        options.method as 'strip' | 'lenticular',
        { a: imgA.raster, b: imgB?.raster },
        stripResult.layout,
        book.heightCm,
        strip,
      );
      const m = await pdfMeta();
      downloadBlob(blob, `${safeFileName(m.title)}.xlsx`);
      setMessage('File Excel scaricato.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const saveProject = () => {
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    downloadBlob(blob, `${safeFileName(meta.title || imgA?.name.replace(/\.\w+$/, '') || 'progetto')}.piegalibro.json`);
  };

  const openProject = async (file?: File | null) => {
    if (!file) return;
    try {
      const p = JSON.parse(await file.text()) as Project;
      if (p.version !== 1) throw new Error('File di progetto non riconosciuto.');
      setBook(p.book);
      setOptions({ ...DEFAULT_PROJECT.options, ...p.options });
      setMeta({ ...DEFAULT_PROJECT.meta, ...p.meta });
      setDecimalSep(p.decimalSep ?? ',');
      setStrip(normalizeStrip(p));
      setImgA(p.imageA ? await dataUrlToRaster(p.imageA.dataUrl, p.imageA.name) : null);
      setImgB(p.imageB ? await dataUrlToRaster(p.imageB.dataUrl, p.imageB.name) : null);
      setMessage(`Progetto "${file.name}" aperto.`);
    } catch (e) {
      setMessage(`Impossibile aprire il progetto: ${(e as Error).message}`);
    }
  };

  const workKey = `piegalibro.lavoro.${meta.title || imgA?.name || ''}.${options.method}.${book.firstPage}-${book.lastPage}`;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} style={{ height: `${[40, 70, 90, 100, 100, 100, 90, 70, 40][i]}%` }} />
            ))}
          </span>
          <span className="brand-name">Piegalibro</span>
        </div>
        <div className="top-actions">
          <button type="button" className="secondary" onClick={() => projectInput.current?.click()}>
            Apri progetto
          </button>
          <button type="button" className="secondary" onClick={saveProject} disabled={!imgA}>
            Salva progetto
          </button>
          {isStrip && (
            <button type="button" className="secondary" onClick={exportExcel} disabled={!stripResult?.layout || !!busy}>
              Scarica Excel
            </button>
          )}
          <button type="button" className="primary" onClick={exportPdf} disabled={!imgA || !!busy}>
            {busy || 'Scarica PDF'}
          </button>
          <input
            ref={projectInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              openProject(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {message && (
        <p className="toast" role="status">
          {message}
          <button type="button" className="link" onClick={() => setMessage('')}>
            Chiudi
          </button>
        </p>
      )}

      <div className="layout">
        <aside className="panel">
          <section>
            <h2>Disegno</h2>
            <label className="field">
              <span className="field-label">Tipologia</span>
              <select value={options.method} onChange={(e) => setOpt('method', e.target.value as Method)}>
                {METHOD_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <ImageDrop
              label={options.method === 'lenticular' ? 'Immagine A' : 'Immagine'}
              image={imgA}
              onChange={setImgA}
            />
            {options.method === 'lenticular' && (
              <ImageDrop label="Immagine B" image={imgB} onChange={setImgB} hint="Si vede dall'altro lato del libro." />
            )}
          </section>

          <section>
            <h2>Libro</h2>
            <div className="grid2">
              <label className="field">
                <span className="field-label">Prima pagina numerata</span>
                <input
                  type="number"
                  min={1}
                  value={book.firstPage}
                  onChange={(e) => setBk('firstPage', Math.max(1, Math.round(num(e.target.value, 1))))}
                />
              </label>
              <label className="field">
                <span className="field-label">Ultima pagina numerata</span>
                <input
                  type="number"
                  min={1}
                  value={book.lastPage}
                  onChange={(e) => setBk('lastPage', Math.max(1, Math.round(num(e.target.value, 1))))}
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Altezza della pagina (cm)</span>
              <input
                type="number"
                min={1}
                step={0.1}
                value={book.heightCm}
                onChange={(e) => setBk('heightCm', num(e.target.value, 21))}
              />
            </label>
            <p className="hint">
              {N > 0 ? `${N} fogli disponibili (pagine dispari da ${book.firstPage} a ${book.firstPage + (N - 1) * 2}).` : "L'ultima pagina deve venire dopo la prima."}
            </p>
            <label className="field">
              <span className="field-label">Fogli usati dal disegno</span>
              <select
                value={options.widthMode}
                onChange={(e) => setOpt('widthMode', e.target.value as PatternOptions['widthMode'])}
              >
                <option value="fill">Tutti i fogli disponibili</option>
                <option value="sheets">Un numero di fogli, centrato</option>
                {!isStrip && <option value="proportional">In proporzione all'immagine, centrato</option>}
              </select>
            </label>
            {options.widthMode === 'sheets' && (
              <label className="field">
                <span className="field-label">Numero di fogli</span>
                <input
                  type="number"
                  min={1}
                  max={N}
                  value={options.sheets ?? N}
                  onChange={(e) => setOpt('sheets', Math.max(1, Math.round(num(e.target.value, N))))}
                />
              </label>
            )}
            {options.widthMode === 'proportional' && (
              <label className="field">
                <span className="field-label">Spessore visivo di un foglio (cm)</span>
                <input
                  type="number"
                  min={0.02}
                  step={0.01}
                  value={options.sheetSpacingCm}
                  onChange={(e) => setOpt('sheetSpacingCm', num(e.target.value, 0.1))}
                />
              </label>
            )}
          </section>

          {isStrip ? (
            <section>
              <h2>Strisce</h2>
              <div className="grid2">
                <label className="field">
                  <span className="field-label">Larghezza striscia (cm)</span>
                  <input
                    type="number"
                    min={0.3}
                    step={0.1}
                    value={strip.widthCm}
                    onChange={(e) => setSt('widthCm', Math.max(0.3, num(e.target.value, 1.5)))}
                  />
                </label>
                <span />
                <label className="field">
                  <span className="field-label">Fogli vuoti all'inizio</span>
                  <input
                    type="number"
                    min={0}
                    value={strip.emptyStart}
                    onChange={(e) => setSt('emptyStart', Math.max(0, Math.round(num(e.target.value, 0))))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Fogli vuoti alla fine</span>
                  <input
                    type="number"
                    min={0}
                    value={strip.emptyEnd}
                    onChange={(e) => setSt('emptyEnd', Math.max(0, Math.round(num(e.target.value, 0))))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Margine sopra (cm)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={strip.marginTopCm}
                    onChange={(e) => setSt('marginTopCm', Math.max(0, num(e.target.value, 0)))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Margine sotto (cm)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={strip.marginBottomCm}
                    onChange={(e) => setSt('marginBottomCm', Math.max(0, num(e.target.value, 0)))}
                  />
                </label>
              </div>
              <p className="hint">
                Con i fogli vuoti a 0 il disegno usa i fogli scelti in "Fogli usati dal disegno", centrato.
              </p>
              <span className="field-label">Ritaglio della foto (%)</span>
              <div className="grid2 crop">
                {(
                  [
                    ['left', 'Sinistra'],
                    ['right', 'Destra'],
                    ['top', 'Sopra'],
                    ['bottom', 'Sotto'],
                  ] as [keyof CropPercent, string][]
                ).map(([k, label]) => (
                  <label className="field" key={k}>
                    <span className="field-label">{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={95}
                      step={0.5}
                      value={strip.crop[k]}
                      onChange={(e) => setCrop(k, Math.min(95, Math.max(0, num(e.target.value, 0))))}
                    />
                  </label>
                ))}
              </div>
              <div className="row-buttons">
                <button
                  type="button"
                  className="secondary"
                  disabled={!imgA}
                  onClick={() => imgA && setSt('crop', autoCrop(imgA.raster))}
                >
                  Ritaglio automatico
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSt('crop', { left: 0, right: 0, top: 0, bottom: 0 })}
                >
                  Nessun ritaglio
                </button>
              </div>
              <div className="grid2">
                <label className="field">
                  <span className="field-label">Colore linee di taglio</span>
                  <input
                    type="color"
                    className="color-wide"
                    value={strip.lineColor}
                    onChange={(e) => setSt('lineColor', e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Spessore linee (mm)</span>
                  <input
                    type="number"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={strip.lineWidthMm}
                    onChange={(e) => setSt('lineWidthMm', Math.min(1, Math.max(0.05, num(e.target.value, 0.2))))}
                  />
                </label>
              </div>
              {options.method === 'lenticular' && (
                <p className="hint">
                  Metà striscia per l'immagine A e metà per la B, divise dalla linea di piega tratteggiata. Il
                  ritaglio vale per l'immagine A.
                </p>
              )}
            </section>
          ) : (
            <section>
              <h2>Calcolo</h2>
              {options.method === 'shadow' && (
                <label className="field">
                  <span className="field-label">Ritmo dello shadow</span>
                  <select value={options.shadowMode} onChange={(e) => setOpt('shadowMode', e.target.value as ShadowMode)}>
                    <option value="1:1">Piega 1, salta 1</option>
                    <option value="1:2">Piega 1, salta 2</option>
                    <option value="2:1">Piega 2, salta 1</option>
                  </select>
                </label>
              )}
              {options.method === 'multilayer' && (
                <Layers layers={options.layers} onChange={(l) => setOpt('layers', l)} />
              )}
              {options.method === 'twotone' ? (
                <ThresholdPair
                  value={options.twoToneThresholds}
                  onChange={(v) => setOpt('twoToneThresholds', v)}
                />
              ) : (
                options.method !== 'multilayer' && (
                  <Threshold value={options.threshold} onChange={(v) => setOpt('threshold', v)} />
                )
              )}
              <label className="field">
                <span className="field-label">Precisione delle misure</span>
                <select value={options.precisionMm} onChange={(e) => setOpt('precisionMm', Number(e.target.value))}>
                  <option value={1}>1 mm</option>
                  <option value={0.5}>0,5 mm</option>
                  <option value={0.1}>0,1 mm</option>
                </select>
              </label>
              <div className="grid2">
                <label className="field">
                  <span className="field-label">Tratto minimo (mm)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={options.minTabMm}
                    onChange={(e) => setOpt('minTabMm', Math.max(0, num(e.target.value, 1)))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Spazio minimo (mm)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={options.minGapMm}
                    onChange={(e) => setOpt('minGapMm', Math.max(0, num(e.target.value, 1)))}
                  />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={options.cropSides} onChange={(e) => setOpt('cropSides', e.target.checked)} />
                Ritaglia i lati vuoti dell'immagine
              </label>
              {options.method !== 'multilayer' && (
                <label className="check">
                  <input type="checkbox" checked={options.invert} onChange={(e) => setOpt('invert', e.target.checked)} />
                  Inverti figura e sfondo
                </label>
              )}
            </section>
          )}

          <section>
            <h2>Dati dello schema</h2>
            <label className="field">
              <span className="field-label">Titolo</span>
              <input value={meta.title} placeholder={imgA?.name.replace(/\.\w+$/, '') ?? ''} onChange={(e) => setMt('title', e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Autore</span>
              <input value={meta.author} onChange={(e) => setMt('author', e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Copyright a piè di pagina</span>
              <input
                value={meta.copyright}
                placeholder={meta.author ? `© ${meta.author}` : ''}
                onChange={(e) => setMt('copyright', e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Note per chi piega</span>
              <textarea rows={3} value={meta.notes} onChange={(e) => setMt('notes', e.target.value)} />
            </label>
            <div className="field">
              <span className="field-label">Logo</span>
              <div className="logo-row">
                {meta.logoDataUrl && <img src={meta.logoDataUrl} alt="Logo" className="logo-thumb" />}
                <button type="button" className="secondary" onClick={() => logoInput.current?.click()}>
                  {meta.logoDataUrl ? 'Cambia logo' : 'Carica logo'}
                </button>
                {meta.logoDataUrl && (
                  <button type="button" className="link" onClick={() => setMt('logoDataUrl', undefined)}>
                    Rimuovi
                  </button>
                )}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setMt('logoDataUrl', await fileToDataUrl(f));
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            <label className="field">
              <span className="field-label">Separatore decimale</span>
              <select value={decimalSep} onChange={(e) => setDecimalSep(e.target.value as DecimalSep)}>
                <option value=",">Virgola (6,7)</option>
                <option value=".">Punto (6.7)</option>
              </select>
            </label>
          </section>
        </aside>

        <main className="main">
          {!imgA ? (
            <div className="welcome">
              <h1>Dal disegno allo schema di taglio e piega</h1>
              <p>
                Carica un'immagine a sinistra, scegli la tipologia e inserisci prima e ultima pagina numerata e
                l'altezza del libro. Lo schema si aggiorna mentre cambi le impostazioni.
              </p>
              <p className="muted">
                Le immagini restano sul tuo dispositivo: il calcolo e il PDF si fanno nel browser.
              </p>
            </div>
          ) : isStrip ? (
            options.method === 'lenticular' && !imgB ? (
              <p className="empty">Carica anche l'immagine B per vedere le strisce lenticolari.</p>
            ) : (
              stripResult?.layout ? (
                <StripPreview
                  kind={options.method as 'strip' | 'lenticular'}
                  a={imgA}
                  b={imgB}
                  book={book}
                  layout={stripResult.layout}
                  params={strip}
                />
              ) : (
                <p className="error">{stripResult?.error}</p>
              )
            )
          ) : pattern ? (
            <>
              <div className="summary">
                <div>
                  <strong>{METHOD_LABELS[pattern.method]}</strong>
                  <span className="muted">
                    {used.length
                      ? ` pagine ${used[0].page}–${used[used.length - 1].page}, ${used.length} lavorate, ${pattern.totalMarks} tra tagli e pieghe`
                      : ' nessuna pagina da lavorare'}
                  </span>
                </div>
                <nav className="tabs" aria-label="Vista">
                  {(['anteprima', '3d', 'tabella', 'lavoro'] as View[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={view === v ? 'tab active' : 'tab'}
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                    >
                      {v === 'anteprima' ? 'Anteprima' : v === '3d' ? '3D' : v === 'tabella' ? 'Tabella' : 'Modalità lavoro'}
                    </button>
                  ))}
                </nav>
              </div>
              {pattern.warnings.map((w) => (
                <p key={w} className="warning">
                  {w}
                </p>
              ))}
              {view === 'anteprima' && (
                <>
                  <Preview
                    pattern={pattern}
                    layerColors={layerColors}
                    onPick={(i) => {
                      const e = pattern.pages[i];
                      if (e.marks.length) {
                        setWorkStart(e.page);
                        setView('lavoro');
                      }
                    }}
                  />
                  <p className="hint">
                    Il taglio del libro visto di fronte: ogni filo è una pagina, in scuro i tratti piegati. Tocca una
                    pagina per aprirla in modalità lavoro.
                  </p>
                  <div className="source">
                    <img src={imgA.dataUrl} alt="Immagine di partenza" />
                  </div>
                </>
              )}
              {view === '3d' && (
                <Suspense fallback={<p className="muted">Carico la vista 3D…</p>}>
                  <Book3D pattern={pattern} />
                </Suspense>
              )}
              {view === 'tabella' && (
                <Table
                  pattern={pattern}
                  decimalSep={decimalSep}
                  layerColors={layerColors}
                  onOpen={(page) => {
                    setWorkStart(page);
                    setView('lavoro');
                  }}
                />
              )}
              {view === 'lavoro' && (
                <WorkMode
                  pattern={pattern}
                  decimalSep={decimalSep}
                  storageKey={workKey}
                  startPage={workStart}
                  layerColors={layerColors}
                />
              )}
            </>
          ) : (
            <p className="empty">Controlla prima e ultima pagina e altezza del libro.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function Threshold({ value, onChange }: { value: number | 'auto'; onChange: (v: number | 'auto') => void }) {
  const auto = value === 'auto';
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" checked={auto} onChange={(e) => onChange(e.target.checked ? 'auto' : 128)} />
        Soglia bianco/nero automatica
      </label>
      {!auto && (
        <label className="slider">
          <span>Soglia {value}</span>
          <input type="range" min={1} max={254} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
      )}
    </div>
  );
}

function ThresholdPair({
  value,
  onChange,
}: {
  value: [number, number] | 'auto';
  onChange: (v: [number, number] | 'auto') => void;
}) {
  const auto = value === 'auto';
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" checked={auto} onChange={(e) => onChange(e.target.checked ? 'auto' : [85, 170])} />
        Soglie scuro/chiaro automatiche
      </label>
      {!auto && (
        <>
          <label className="slider">
            <span>Scuro sotto {value[0]}</span>
            <input
              type="range"
              min={1}
              max={253}
              value={value[0]}
              onChange={(e) => onChange([Math.min(Number(e.target.value), value[1] - 1), value[1]])}
            />
          </label>
          <label className="slider">
            <span>Chiaro sotto {value[1]}</span>
            <input
              type="range"
              min={2}
              max={254}
              value={value[1]}
              onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0] + 1)])}
            />
          </label>
        </>
      )}
    </div>
  );
}
