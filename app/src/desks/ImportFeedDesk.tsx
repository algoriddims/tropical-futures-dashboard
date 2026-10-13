import { useEffect, useState } from 'react';
import { useTerminal } from '@/terminal/TerminalContext';
import { fetchImportFeed } from '@/game/remote';
import type { ImportFeedEntry } from '@/game/remote';

// Import feed: every upload with what it covered and the sync's data notes.
// On the hosted site this lists the versions the server keeps (shared by every
// device); locally it's just this browser's current import.

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'UNKNOWN');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '?');

function Entry({ e, open, onToggle }: { e: ImportFeedEntry; open: boolean; onToggle: () => void }) {
  return (
    <div className={`border-b border-[var(--crt-mid)] ${e.current ? '' : 'opacity-80'}`}>
      <button onClick={onToggle} className="tape-row w-full text-left">
        <span className="dim shrink-0 font-display">{open ? '▾' : '▸'}</span>
        <span className="warm shrink-0 font-display">{when(e.savedAt)}</span>
        {e.current && <span className="badge tier-green shrink-0">CURRENT</span>}
        <span className="flex-1 min-w-0 dim truncate">
          COVERS {e.coverageStart ? `${day(e.coverageStart)} → ` : ''}{day(e.coverageEnd)}
          {e.sources.length > 0 && ` · ${e.sources.join(' + ')}`}
        </span>
        <span className={`badge shrink-0 ${e.notes.length ? 'tier-amber' : 'dim'}`}>
          {e.notes.length} NOTE{e.notes.length === 1 ? '' : 'S'}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-0.5 text-[0.74rem]">
          {e.counts && (
            <div className="dim">
              {e.counts.products} PRODUCTS · {e.counts.orders} ORDERS · {e.counts.days} DAYS OF SALES
              {e.counts.accounts > 0 && ` · ${e.counts.accounts} BANK ACCOUNTS`}
              {e.extractedAt && ` · EXTRACTED ${when(e.extractedAt)}`}
            </div>
          )}
          {e.notes.length === 0 && <div className="dim">NO DATA NOTES IN THIS SYNC.</div>}
          {e.notes.map((n, i) => <div key={i} className="warm">· {n}</div>)}
        </div>
      )}
    </div>
  );
}

export default function ImportFeedDesk() {
  const { data, imported, importedAt, shared } = useTerminal();
  const [entries, setEntries] = useState<ImportFeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (shared !== 'server') return;
    let live = true;
    fetchImportFeed().then((r) => {
      if (!live) return;
      if (r.status === 'ok') { setEntries(r.entries); setError(null); }
      else setError(r.status === 'error' ? r.message.toUpperCase() : 'SHARED STORE NOT REACHABLE');
    });
    return () => { live = false; };
  }, [shared, importedAt]);

  // Local mode: the only import there is is this browser's current one.
  const local: ImportFeedEntry[] = imported && data
    ? [{
        savedAt: importedAt ?? '',
        current: true,
        coverageStart: data.meta?.coverageStart,
        coverageEnd: data.meta?.coverageEnd,
        extractedAt: data.meta?.extractedAt,
        sources: (data.meta?.sources ?? []).map((s) => s.label),
        notes: data.meta?.notes ?? [],
      }]
    : [];
  const list = shared === 'server' ? entries : local;
  const isOpen = (e: ImportFeedEntry, i: number) => (openKey === null ? i === 0 : openKey === e.savedAt);

  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="panel flex min-h-0 flex-1 flex-col">
        <div className="panel-head">
          <span>IMPORT FEED</span>
          <span className="dim">
            {shared === 'server' ? 'SHARED · LAST 21 UPLOADS KEPT ON THE SERVER' : shared === 'local' ? 'THIS BROWSER ONLY' : 'CHECKING…'}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="p-3 tier-red text-sm">COULD NOT LOAD THE FEED: {error}</div>}
          {list === null && !error && <div className="p-6 text-center font-display text-lg dim">LOADING…</div>}
          {list?.map((e, i) => (
            <Entry
              key={e.savedAt || i}
              e={e}
              open={isOpen(e, i)}
              onToggle={() => setOpenKey(isOpen(e, i) ? '' : e.savedAt)}
            />
          ))}
          {list && list.length === 0 && (
            <div className="p-6 text-center font-display text-lg dim">NO IMPORTS YET — OPEN IMPORT TO ADD A SYNC.</div>
          )}
        </div>
      </div>
    </div>
  );
}
