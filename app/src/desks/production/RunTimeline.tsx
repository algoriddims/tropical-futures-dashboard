// All production runs on one calendar: sampling, bulk and transit as bars
// (solid = happened, hatched = planned or estimated, dashed "?" = not known),
// payments as markers (✓ paid, ! due), a today line, and Chinese New Year
// when it falls inside the window. Layout comes from timelineModel
// (src/game/production.ts); this file only draws it.
import { useId } from 'react';
import { PHASES, timelineModel } from '@/game/production';
import type { PhaseKey, ProductionRun, TimelinePayment } from '@/game/production';
import { money } from '@/game/format';

const W = 1000, LABEL_W = 190, X0 = 200, X1 = 985, HEAD = 34, ROW = 74, FOOT = 46, BAR_H = 20;
const PHASE_VAR: Record<PhaseKey, string> = { SAMPLING: 'var(--phase-1)', BULK: 'var(--phase-2)', TRANSIT: 'var(--phase-3)' };
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const paymentText = (p: TimelinePayment) => {
  const amt = p.amount === null ? 'amount not set' : money(p.amount / 100);
  const more = p.amount !== null && p.unknownLines ? ' + ?' : '';
  return p.paid ? `✓ ${amt}${more} paid` : `! ${amt}${more} due${p.date ? '' : ' · date not set'}`;
};

export function RunTimeline({ runs, today, onOpen }: { runs: ProductionRun[]; today: string; onOpen: (runId: string) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = timelineModel(runs, today);
  const span = ms(t.to) - ms(t.from);
  const x = (d: string) => X0 + ((ms(d) - ms(t.from)) / span) * (X1 - X0);
  const H = HEAD + Math.max(1, t.rows.length) * ROW + FOOT;
  const months: string[] = [];
  for (let d = new Date(Date.UTC(+t.from.slice(0, 4), +t.from.slice(5, 7) - 1 + 1, 1)); d.toISOString().slice(0, 10) <= t.to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push(d.toISOString().slice(0, 10));
  }
  const hatch = (k: PhaseKey) => `url(#${uid}-${k})`;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[720px]" role="img"
          aria-label={`Timeline of ${t.rows.length} production run${t.rows.length === 1 ? '' : 's'}; details in the table below`}>
          <defs>
            {PHASES.map((p) => (
              <pattern key={p.key} id={`${uid}-${p.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={PHASE_VAR[p.key]} opacity="0.16" />
                <line x1="0" y1="0" x2="0" y2="6" stroke={PHASE_VAR[p.key]} strokeWidth="2.2" />
              </pattern>
            ))}
          </defs>

          {/* holidays */}
          {t.holidays.map((h) => (
            <g key={h.day}>
              <title>{`${h.label} ${short(h.day)} — factories commonly close for a few weeks around it (window approximate)`}</title>
              <rect x={x(h.from)} y={HEAD - 8} width={x(h.to) - x(h.from)} height={H - HEAD - FOOT + 8} fill="var(--timeline-band)" />
              <text x={x(h.from) + 4} y={H - FOOT - 18} fontSize="10" fill="var(--vhs-warm)">{h.label.toUpperCase()}</text>
              <text x={x(h.from) + 4} y={H - FOOT - 6} fontSize="10" fill="var(--vhs-dim)">factories close (approx.)</text>
            </g>
          ))}

          {/* months */}
          {months.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={HEAD - 12} y2={H - FOOT} stroke="var(--crt-mid)" />
              {x(m) < X1 - 60 && <text x={x(m) + 4} y={HEAD - 16} fontSize="11" fill="var(--vhs-dim)">
                {new Date(`${m}T12:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}
              </text>}
            </g>
          ))}

          {/* rows */}
          {t.rows.map((r, i) => {
            const y = HEAD + i * ROW + 8;
            // two lanes of payment markers: a marker goes on the first lane its label won't collide on
            const laneEnd = [-Infinity, -Infinity];
            const placed = r.payments.map((p) => {
              const px = x(p.date ?? today);
              const text = paymentText(p);
              const lane = laneEnd.findIndex((e) => px - 6 > e);
              const use = lane === -1 ? 1 : lane;
              const label = lane !== -1;
              if (label) laneEnd[use] = px + 9 + text.length * 6.1 + 8;
              return { p, px, text, lane: use, label };
            });
            return (
              <g key={r.runId}>
                <g role="button" tabIndex={0} className="cursor-pointer focus:outline-none" onClick={() => onOpen(r.runId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.runId); } }}
                  aria-label={`Open ${r.name}`}>
                  <rect x="0" y={y - 6} width={LABEL_W} height={ROW - 10} fill="transparent" />
                  <text x="0" y={y + 10} fontSize="12" fontWeight="bold" fill="var(--vhs-white)">{r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name}</text>
                  <text x="0" y={y + 25} fontSize="11" fill="var(--vhs-dim)">{r.sub.length > 38 ? `${r.sub.slice(0, 37)}…` : r.sub}</text>
                  {r.received && <text x="0" y={y + 40} fontSize="10" fill="var(--good)">✓ RECEIVED</text>}
                </g>

                {r.phases.map((p) => {
                  const a = x(p.from);
                  const end = p.to ? x(p.to) : null;
                  const solidEnd = p.doneUntil ? x(p.doneUntil) : a;
                  const known = end ?? a;
                  const tip = `${p.label}: ${short(p.from)}${p.startKind === 'done' ? '' : ` (${p.startKind === 'planned' ? 'planned' : 'est.'})`} → ${p.to ? short(p.to) : 'not known yet'}`;
                  return (
                    <g key={p.key}>
                      <title>{tip}</title>
                      {/* happened */}
                      {solidEnd > a && <rect x={a + 1} y={y} width={Math.max(2, Math.min(solidEnd, known) - a - 2)} height={BAR_H} rx="4" fill={PHASE_VAR[p.key]} />}
                      {/* planned or estimated */}
                      {end !== null && end > Math.max(a, solidEnd) + 1 && (
                        <rect x={Math.max(a, solidEnd) + 1} y={y} width={end - Math.max(a, solidEnd) - 2} height={BAR_H} rx="4" fill={hatch(p.key)} />
                      )}
                      {/* zero-length but known: a tick */}
                      {end !== null && end - a < 3 && <rect x={a - 1} y={y} width="4" height={BAR_H} rx="2" fill={PHASE_VAR[p.key]} />}
                      {/* unknown end */}
                      {end === null && (
                        <>
                          <rect x={Math.max(a, solidEnd) + 1} y={y} width="30" height={BAR_H} rx="4" fill="none" stroke={PHASE_VAR[p.key]} strokeDasharray="4 3" strokeWidth="1.5" />
                          <text x={Math.max(a, solidEnd) + 16} y={y + 14} fontSize="11" textAnchor="middle" fill="var(--vhs-warm)">?</text>
                          {p.key === 'TRANSIT' && (
                            <text x={Math.max(a, solidEnd) + 38} y={y + 14} fontSize="11" fill="var(--vhs-dim)">arrival not known — set transit days</text>
                          )}
                        </>
                      )}
                      {/* direct label when it fits */}
                      {end !== null && end - a > 52 && (
                        <text x={a + 6} y={y + 14} fontSize="11" fill={solidEnd - a > 52 ? 'var(--on-phase)' : 'var(--vhs-white)'}>{p.label}</text>
                      )}
                    </g>
                  );
                })}

                {placed.map(({ p, px, text, lane, label }, j) => {
                  const cy = y + BAR_H + 14 + lane * 16;
                  return (
                    <g key={j}>
                      <title>{`${text}${p.date ? ` on ${short(p.date)}` : ''}: ${p.lines.join('; ')}`}</title>
                      {p.paid
                        ? <circle cx={px} cy={cy} r="5" fill="var(--good)" />
                        : <circle cx={px} cy={cy} r="5" fill="var(--crt-dark)" stroke="var(--critical)" strokeWidth="2" />}
                      {label && <text x={px + 9} y={cy + 4} fontSize="11" fill="var(--vhs-warm)">{text}</text>}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {t.rows.length === 0 && (
            <text x={X0} y={HEAD + 30} fontSize="12" fill="var(--vhs-dim)">No runs yet — start one below, or paste one.</text>
          )}

          {/* today */}
          <line x1={x(today)} x2={x(today)} y1={HEAD - 12} y2={H - FOOT + 4} stroke="var(--vhs-white)" strokeWidth="1.5" />
          <text x={x(today) + 4} y={H - FOOT + 14} fontSize="11" fontWeight="bold" fill="var(--vhs-white)">TODAY {short(today).toUpperCase()}</text>

          {/* legend */}
          <g transform={`translate(0 ${H - 4})`} fontSize="10" fill="var(--vhs-dim)">
            {PHASES.map((p, i) => (
              <g key={p.key} transform={`translate(${i * 78} 0)`}>
                <rect x="0" y="-9" width="14" height="10" rx="2" fill={PHASE_VAR[p.key]} />
                <text x="18" y="0">{p.label}</text>
              </g>
            ))}
            <g transform="translate(250 0)">
              <rect x="0" y="-9" width="14" height="10" rx="2" fill={hatch('SAMPLING')} />
              <text x="18" y="0">planned / estimated</text>
              <rect x="128" y="-9" width="14" height="10" rx="2" fill="none" stroke="var(--vhs-dim)" strokeDasharray="3 2" />
              <text x="146" y="0">not known yet</text>
              <circle cx="240" cy="-4" r="4" fill="var(--good)" />
              <text x="248" y="0">paid</text>
              <circle cx="286" cy="-4" r="4" fill="none" stroke="var(--critical)" strokeWidth="2" />
              <text x="294" y="0">due</text>
            </g>
          </g>
        </svg>
      </div>

      {/* the same information as a table */}
      <details className="mt-1">
        <summary className="stat-sub cursor-pointer">SHOW AS TABLE</summary>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full min-w-[520px] text-[0.8rem]">
            <caption className="sr-only">Production runs by phase, with dates and payments</caption>
            <thead>
              <tr className="stat-label text-left">
                <th scope="col" className="px-2 py-1 font-normal">Run</th>
                <th scope="col" className="px-2 py-1 font-normal">Phase</th>
                <th scope="col" className="px-2 py-1 font-normal">From</th>
                <th scope="col" className="px-2 py-1 font-normal">To</th>
                <th scope="col" className="px-2 py-1 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.flatMap((r) => [
                ...r.phases.map((p) => (
                  <tr key={`${r.runId}-${p.key}`} className="border-t border-[var(--crt-mid)]">
                    <th scope="row" className="px-2 py-1 text-left font-normal">{r.name}</th>
                    <td className="px-2 py-1">{p.label}</td>
                    <td className="px-2 py-1">{short(p.from)}{p.startKind === 'done' ? '' : ' (est.)'}</td>
                    <td className="px-2 py-1">{p.to ? short(p.to) : 'not known'}</td>
                    <td className="px-2 py-1">{p.doneUntil && p.to && p.doneUntil >= p.to ? 'done' : p.doneUntil ? 'under way' : 'not started'}</td>
                  </tr>
                )),
                ...r.payments.map((p, j) => (
                  <tr key={`${r.runId}-pay-${j}`} className="border-t border-[var(--crt-mid)]">
                    <th scope="row" className="px-2 py-1 text-left font-normal">{r.name}</th>
                    <td className="px-2 py-1">Payment</td>
                    <td className="px-2 py-1" colSpan={2}>{p.date ? short(p.date) : 'date not set'} · {p.lines.join('; ')}</td>
                    <td className="px-2 py-1">{paymentText(p)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
