import { useTerminal } from '@/terminal/TerminalContext';
import { guestThoughts } from '@/game/engine';

// Marquee of guest thoughts + simulated sample orders — the park's ambient
// voice. Both are fiction, and the strip says so up front.
export default function Ticker() {
  const { data, metrics, liveEvents } = useTerminal();
  if (!data || !metrics) return null;

  const thoughts = guestThoughts(data, metrics);
  const live = liveEvents.slice(0, 3).map((e) => `SIMULATED + $${e.amount} — ${e.text}`);
  const items = [...live, ...thoughts];

  const chunk = (key: string) => (
    <span key={key} className="inline-flex items-center">
      {items.map((t, i) => (
        <span key={i} className="mx-6 font-display text-base tracking-wide">
          <span className="tier-amber mr-2">☺</span>
          <span className={i < live.length ? 'phosphor' : 'dim'}>{t}</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="flex items-center overflow-hidden border-b border-[var(--crt-mid)] bg-[var(--crt-black)] py-0.5">
      <span className="z-10 shrink-0 bg-[var(--crt-black)] px-2 font-display text-xs dim" title="Invented voices for atmosphere — not customer feedback">
        FICTIONAL GUEST VOICES
      </span>
      <div className="ticker-track">
        {chunk('a')}
        {chunk('b')}
      </div>
    </div>
  );
}
