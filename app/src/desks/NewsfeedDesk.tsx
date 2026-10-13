import { useState } from 'react';
import { useTerminal } from '@/terminal/TerminalContext';
import type { DeskKey } from '@/terminal/TerminalContext';
import type { Tier } from '@/game/types';

const FILTERS: { key: Tier | 'all'; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'red', label: 'ACT NOW' },
  { key: 'amber', label: 'NOTABLE' },
  { key: 'green', label: 'CONTEXT' },
];

const TIER_MARK: Record<Tier, string> = { red: '▲', amber: '◆', green: '●' };

export default function NewsfeedDesk() {
  const { notices, setDesk } = useTerminal();
  const [filter, setFilter] = useState<Tier | 'all'>('all');
  const shown = filter === 'all' ? notices : notices.filter((n) => n.tier === filter);
  const counts = {
    red: notices.filter((n) => n.tier === 'red').length,
    amber: notices.filter((n) => n.tier === 'amber').length,
    green: notices.filter((n) => n.tier === 'green').length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="panel flex min-h-0 flex-1 flex-col">
        <div className="panel-head">
          <span>ALERTS</span>
          <span className="flex gap-3">
            <span className="tier-red">▲ {counts.red}</span>
            <span className="tier-amber">◆ {counts.amber}</span>
            <span className="tier-green">● {counts.green}</span>
          </span>
        </div>

        <div className="flex gap-1 border-b border-[var(--crt-mid)] p-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`font-display text-sm px-2 py-0.5 border ${
                filter === f.key
                  ? 'border-[var(--phosphor)] text-[var(--phosphor)]'
                  : 'border-[var(--crt-line)] dim hover:text-[var(--vhs-white)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((n) => (
            <button
              key={n.id}
              onClick={() => setDesk(n.desk as DeskKey)}
              className="tape-row w-full text-left"
            >
              <span className={`tier-${n.tier} shrink-0`}>{TIER_MARK[n.tier]}</span>
              <span className="dim shrink-0 font-display">{n.time}</span>
              <span className={`badge tier-${n.tier === 'green' ? 'green' : n.tier} shrink-0`}>{n.source}</span>
              <span className="flex-1 min-w-0">
                <span className="warm block truncate">{n.text}</span>
                <span className="dim block truncate text-[0.7rem]">{n.detail}</span>
              </span>
              <span className="keycap shrink-0">{n.desk.toUpperCase()}</span>
            </button>
          ))}
          {shown.length === 0 && (
            <div className="p-6 text-center font-display text-lg dim">NOTHING AT THIS LEVEL.</div>
          )}
        </div>
      </div>
    </div>
  );
}
