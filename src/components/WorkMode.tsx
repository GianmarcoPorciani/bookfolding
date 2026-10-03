import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt, speechFor, type DecimalSep } from '../engine/format';
import type { Pattern } from '../engine/types';
import { foldedSegments } from '../lib/draw';

interface Props {
  pattern: Pattern;
  decimalSep: DecimalSep;
  storageKey: string;
  startPage?: number | null;
  layerColors?: Record<string, string>;
}

// Riconoscimento vocale: disponibile in Chrome/Edge (anche Android), non in Firefox.
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
const SpeechRec: (new () => SR) | undefined =
  (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

function italianVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((v) => v.lang === 'it-IT') ?? voices.find((v) => v.lang.startsWith('it'));
}

/** Modalità lavoro: una pagina per schermata, misure grandi, lettura e comandi vocali. */
export function WorkMode({ pattern, decimalSep, storageKey, startPage, layerColors }: Props) {
  const work = useMemo(() => pattern.pages.map((e, i) => ({ e, i })).filter((x) => x.e.marks.length), [pattern]);
  const [idx, setIdx] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey) ?? '0');
    return Number.isFinite(saved) ? Math.min(saved, Math.max(0, work.length - 1)) : 0;
  });
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recRef = useRef<SR | null>(null);
  const prec = pattern.options.precisionMm;

  useEffect(() => {
    if (startPage == null) return;
    const k = work.findIndex((w) => w.e.page === startPage);
    if (k >= 0) setIdx(k);
  }, [startPage, work]);

  useEffect(() => {
    if (idx >= work.length) setIdx(Math.max(0, work.length - 1));
    try {
      localStorage.setItem(storageKey, String(idx));
    } catch {
      /* ignora */
    }
  }, [idx, work.length, storageKey]);

  const current = work[idx];

  const speak = useCallback(() => {
    if (!current || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speechFor(current.e, pattern.method, prec));
    u.lang = 'it-IT';
    const v = italianVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }, [current, pattern.method, prec]);

  useEffect(() => {
    if (autoSpeak) speak();
  }, [idx, autoSpeak, speak]);

  const next = useCallback(() => setIdx((i) => Math.min(work.length - 1, i + 1)), [work.length]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key.toLowerCase() === 'r') speak();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, speak]);

  // Comandi vocali
  const commands = useRef({ next, prev, speak });
  commands.current = { next, prev, speak };
  const toggleListening = () => {
    if (!SpeechRec) return;
    if (listening) {
      recRef.current?.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript.toLowerCase();
        if (/avanti|prossima|successiva|vai/.test(t)) commands.current.next();
        else if (/indietro|precedente/.test(t)) commands.current.prev();
        else if (/ripeti|ancora/.test(t)) commands.current.speak();
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setVoiceError('Microfono non autorizzato: consenti l’accesso nelle impostazioni del browser.');
    };
    rec.onend = () => {
      // il browser chiude l'ascolto dopo un po' di silenzio: riavvialo finché è attivo
      if (recRef.current === rec) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      }
    };
    recRef.current = rec;
    setVoiceError('');
    rec.start();
    setListening(true);
  };
  useEffect(() => () => recRef.current?.stop(), []);

  if (!current) return <p className="empty">Nessuna pagina da lavorare con queste impostazioni.</p>;

  const e = current.e;
  const prevWork = work[idx - 1];
  const skipped = prevWork ? (e.page - prevWork.e.page) / 2 - 1 : 0;
  const segs = foldedSegments(pattern, current.i);
  const H = pattern.book.heightCm;
  const pct = (v: number) => `${(v / H) * 100}%`;

  return (
    <div className="work">
      <div className="work-head">
        <div>
          <div className="work-page">Pagina {e.page}</div>
          <div className="muted">
            {idx + 1} di {work.length} pagine lavorate
            {skipped > 0 && `, prima salta ${skipped} ${skipped === 1 ? 'pagina' : 'pagine'}`}
          </div>
        </div>
        <div className="work-voice">
          <label className="check">
            <input type="checkbox" checked={autoSpeak} onChange={(ev) => setAutoSpeak(ev.target.checked)} />
            Leggi ad alta voce
          </label>
          {SpeechRec && (
            <button type="button" className={listening ? 'primary' : 'secondary'} onClick={toggleListening}>
              {listening ? 'Comandi vocali attivi' : 'Attiva comandi vocali'}
            </button>
          )}
        </div>
      </div>
      {listening && <p className="hint">Di' "avanti", "indietro" o "ripeti".</p>}
      {voiceError && <p className="error">{voiceError}</p>}

      <div className="work-body">
        <div className="ruler" aria-hidden="true">
          {Array.from({ length: Math.floor(H) + 1 }, (_, cm) => (
            <span key={cm} className="tick" style={{ top: pct(cm) }}>
              {cm > 0 && cm < H ? cm : ''}
            </span>
          ))}
          {segs.map((s, k) => (
            <span
              key={k}
              className="seg"
              style={{
                top: pct(s.a),
                height: pct(s.b - s.a),
                background: (s.layer && layerColors?.[s.layer]) || undefined,
              }}
            />
          ))}
          {e.marks.map((m, k) => (
            <span key={k} className={`rmark ${m.kind}`} style={{ top: pct(m.pos) }} />
          ))}
        </div>
        <ol className="work-marks">
          {pattern.method === 'multilayer'
            ? Array.from({ length: e.marks.length / 2 }, (_, k) => (
                <li key={k}>
                  <span className="kind">Livello {e.marks[k * 2].layer}</span>
                  <span className="val">
                    {fmt(e.marks[k * 2].pos, prec, decimalSep)} – {fmt(e.marks[k * 2 + 1].pos, prec, decimalSep)}
                  </span>
                </li>
              ))
            : e.marks.map((m, k) => (
                <li key={k} className={m.kind}>
                  <span className="kind">{m.kind === 'fold' ? 'Piega' : 'Taglio'}</span>
                  <span className="val">{fmt(m.pos, prec, decimalSep)}</span>
                </li>
              ))}
        </ol>
      </div>

      <div className="work-nav">
        <button type="button" className="secondary big" onClick={prev} disabled={idx === 0}>
          Indietro
        </button>
        <button type="button" className="secondary big" onClick={speak}>
          Ripeti
        </button>
        <button type="button" className="primary big" onClick={next} disabled={idx >= work.length - 1}>
          Avanti
        </button>
      </div>
      <label className="work-jump">
        Vai alla pagina
        <select value={idx} onChange={(ev) => setIdx(Number(ev.target.value))}>
          {work.map((w, k) => (
            <option key={w.e.page} value={k}>
              {w.e.page}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
