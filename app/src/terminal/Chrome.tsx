import { useEffect, useState } from 'react';
import { DESKS, useTerminal } from './TerminalContext';
import { ImportModal } from './ImportModal';
import { daysUntil } from '@/game/engine';
import { describeFreshness } from '@/game/freshness';
import { nextLook } from './look';

const RANGES = [
  { key: '1', label: 'TODAY', days: 1 },
  { key: '2', label: '7D', days: 7 },
  { key: '3', label: '30D', days: 30 },
];

// pixel palm — the Tropical Futures mark, hand-drawn inline
function Palm({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="var(--palm)" aria-hidden>
      <rect x="7" y="7" width="2" height="8" />
      <rect x="7" y="6" width="2" height="1" />
      <rect x="5" y="5" width="2" height="1" />
      <rect x="9" y="5" width="2" height="1" />
      <rect x="3" y="4" width="2" height="1" />
      <rect x="11" y="4" width="2" height="1" />
      <rect x="2" y="5" width="1" height="2" />
      <rect x="13" y="5" width="1" height="2" />
      <rect x="6" y="4" width="4" height="1" />
      <rect x="7" y="3" width="2" height="1" />
      <rect x="4" y="15" width="8" height="1" fill="var(--sun)" />
    </svg>
  );
}

export function TopBar() {
  const { desk, setDesk, range, setRange, setHelpOpen, imported, look, toggleLook } = useTerminal();
  const [importOpen, setImportOpen] = useState(false);
  return (
    <header className="flex items-stretch border-b border-[var(--crt-mid)] bg-[var(--crt-dark)]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-r border-[var(--crt-mid)]">
        <Palm />
        <span className="font-display text-xl phosphor crt-flicker tracking-wide">TROPICAL FUTURES</span>
        <span className="font-display text-xl tropic-pink">TERMINAL</span>
      </div>
      <nav className="flex items-center gap-1 px-2 overflow-x-auto">
        {DESKS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDesk(d.key)}
            className="keycap-btn flex items-center gap-1.5 px-2 py-1"
          >
            <span className={`keycap ${desk === d.key ? 'keycap-active' : ''}`}>{d.key.toUpperCase()}</span>
            <span className={`keycap-label font-display text-base ${desk === d.key ? 'text-[var(--vhs-white)]' : 'dim'}`}>
              {d.label}
            </span>
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1 px-2 border-l border-[var(--crt-mid)]">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.days)} className="keycap-btn flex items-center gap-1 px-1.5 py-1">
            <span className={`keycap ${range === r.days ? 'keycap-active' : ''}`}>{r.key}</span>
            <span className={`keycap-label font-display text-sm ${range === r.days ? 'text-[var(--vhs-white)]' : 'dim'}`}>{r.label}</span>
          </button>
        ))}
        <button onClick={() => setImportOpen(true)} className="keycap-btn flex items-center gap-1 px-1.5 py-1" title="IMPORT SYNC DATA">
          <span className={`keycap ${imported ? 'keycap-active' : ''}`}>⇪</span>
          <span className={`keycap-label font-display text-sm ${imported ? 'tier-green' : 'dim'}`}>IMPORT</span>
        </button>
        <button onClick={toggleLook} className="keycap-btn flex items-center gap-1 px-1.5 py-1" title="SWITCH LOOK (T)">
          <span className="keycap">T</span>
          <span className="keycap-label font-display text-sm dim">{nextLook(look).toUpperCase()}</span>
        </button>
        <button onClick={() => setHelpOpen(true)} className="keycap-btn flex items-center gap-1 px-1.5 py-1">
          <span className="keycap">?</span>
        </button>
      </div>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </header>
  );
}

export function StatusBar() {
  const { data, metrics, desk, sourceName, notices, imported, importedAt } = useTerminal();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const deskMeta = DESKS.find((d) => d.key === desk);
  const redCount = notices.filter((n) => n.tier === 'red').length;
  const fresh = describeFreshness({ imported, importedAt, meta: data?.meta, now });
  const badgeCls = fresh.mode === 'sample' ? 'tier-amber' : fresh.stale ? 'tier-amber' : 'tier-green';
  const badgeText = fresh.mode === 'sample' ? sourceName : fresh.stale ? 'SYNC NEEDED' : 'SYNC CURRENT';
  const dropDays = data?.nextDrop ? daysUntil(data.nextDrop.date) : null;
  return (
    <footer className="flex items-center gap-4 border-t border-[var(--crt-mid)] bg-[var(--crt-dark)] px-3 py-1 font-display text-base overflow-hidden whitespace-nowrap">
      <span className="phosphor">
        BANK ${data ? data.bankBalance.toLocaleString() : '—'}
      </span>
      <span className="warm">SCORE {metrics?.rating ?? '—'} · {metrics?.ratingBand ?? ''}</span>
      {data?.nextDrop && dropDays !== null && dropDays >= 0 && (
        <span className={dropDays <= 3 ? 'tier-red' : 'tropic-pink'}>
          {dropDays === 0 ? 'DROP DAY' : `D-${dropDays}`} · {data.nextDrop.name}
        </span>
      )}
      <span className="dim">SESSIONS {metrics?.guests != null ? metrics.guests.toLocaleString() : '—'}</span>
      {redCount > 0 && <span className="tier-red">▲ {redCount} RED</span>}
      <span className="dim">[{deskMeta?.title}]</span>
      <span className="ml-auto flex items-center gap-3">
        {fresh.items.map((f) => (
          <span key={f.label} className={f.tone === 'ok' ? 'dim' : 'tier-amber'}>
            {f.label} {f.text}
          </span>
        ))}
        <span className={`badge ${badgeCls}`}>{badgeText}</span>
        <span className="warm">{now.toLocaleTimeString('en-GB')}</span>
      </span>
    </footer>
  );
}

export function HelpOverlay() {
  const { helpOpen, setHelpOpen } = useTerminal();
  if (!helpOpen) return null;
  const rows = [
    ...DESKS.map((d) => [d.key.toUpperCase(), d.title]),
    ['1 / 2 / 3', 'RANGE: TODAY / 7D / 30D'],
    ['T', 'SWITCH LOOK: PAPER / DARK / TERMINAL'],
    ['?', 'THIS CHEAT SHEET'],
    ['ESC', 'CLOSE'],
  ];
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      onClick={() => setHelpOpen(false)}
    >
      <div className="panel w-[380px] desk-enter">
        <div className="panel-head">KEYMAP</div>
        <div className="p-3 space-y-2">
          {rows.map(([k, label]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="keycap">{k}</span>
              <span className="font-display text-lg warm">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
