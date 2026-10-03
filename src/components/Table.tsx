import { fmt, tableRows, type DecimalSep } from '../engine/format';
import type { Pattern } from '../engine/types';

interface Props {
  pattern: Pattern;
  decimalSep: DecimalSep;
  layerColors?: Record<string, string>;
  onOpen?: (page: number) => void;
}

/** Tabella dello schema: una riga per pagina lavorata, le pagine vuote compresse. */
export function Table({ pattern, decimalSep, layerColors, onOpen }: Props) {
  const prec = pattern.options.precisionMm;
  const rows = tableRows(pattern);
  const isLayer = pattern.method === 'multilayer';
  return (
    <div className="table-wrap">
      <table className="scheme">
        <thead>
          <tr>
            <th scope="col">Pagina</th>
            <th scope="col">
              {pattern.method === 'combi'
                ? 'Pieghe (P) e tagli'
                : pattern.method.startsWith('mmf')
                  ? 'Pieghe'
                  : isLayer
                    ? 'Livello e tratto'
                    : 'Tagli'}{' '}
              <span className="muted">cm dal bordo alto</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pages} className={r.skip ? 'skip' : ''}>
              <th scope="row">
                {r.skip || !onOpen ? (
                  r.pages
                ) : (
                  <button type="button" className="link" onClick={() => onOpen(r.first)}>
                    {r.pages}
                  </button>
                )}
              </th>
              <td>
                {r.skip ? (
                  <span className="muted">Salta</span>
                ) : isLayer ? (
                  <span className="marks">
                    {Array.from({ length: r.marks.length / 2 }, (_, k) => {
                      const a = r.marks[k * 2];
                      const b = r.marks[k * 2 + 1];
                      return (
                        <span className="pair" key={k}>
                          <i style={{ background: layerColors?.[a.layer ?? ''] }} />
                          <b>{a.layer}</b> {fmt(a.pos, prec, decimalSep)}–{fmt(b.pos, prec, decimalSep)}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="marks">
                    {r.marks.map((m, k) => (
                      <span
                        key={k}
                        className={`m ${m.kind === 'fold' ? 'fold' : 'cut'} ${Math.floor(k / 2) % 2 ? 'odd' : 'even'}`}
                      >
                        {pattern.method === 'combi' && m.kind === 'fold' ? 'P' : ''}
                        {fmt(m.pos, prec, decimalSep)}
                      </span>
                    ))}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
