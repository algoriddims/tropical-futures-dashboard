import { useEffect, useState } from 'react';
import { useTerminal } from './TerminalContext';

// Paste-in bridge for the external sync (Claude Code writes park-data.json,
// you paste its contents here). Keeps the static build usable with real data
// before any server exists. Manual slices survive the import.
export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { importData, clearImport, imported } = useTerminal();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setOk(false);
    }
  }, [open]);

  if (!open) return null;

  const doImport = () => {
    const err = importData(raw);
    setError(err);
    if (!err) {
      setRaw('');
      setOk(true);
      window.setTimeout(onClose, 600);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="panel w-[580px] desk-enter" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">IMPORT SYNC DATA</div>
        <div className="space-y-3 p-4">
          <p className="text-[0.75rem] leading-relaxed dim">
            PASTE THE CONTENTS OF <span className="warm">park-data.json</span> FROM THE DAILY SYNC.
            IT REPLACES SHOPIFY/META-DERIVED DATA. YOUR MANUAL ENTRIES — BANK BALANCE, COST LINES,
            STOCKIST STOCK — ARE PRESERVED.
          </p>
          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setError(null); }}
            rows={10}
            spellCheck={false}
            placeholder='{"products": [...], "pipeline": [...], "channels": [...], ...}'
            className="w-full resize-none border border-[var(--crt-mid)] bg-[var(--crt-black)] p-2 font-mono text-xs leading-relaxed text-[var(--vhs-white)] outline-none focus:border-[var(--phosphor)]"
          />
          {error && <div className="font-display text-sm tier-red">▲ {error}</div>}
          {ok && <div className="font-display text-sm tier-green">✓ SYNC DATA LOADED</div>}
          <div className="flex items-center justify-between">
            <div>
              {imported && (
                <button
                  onClick={() => { clearImport(); onClose(); }}
                  className="keycap-btn px-2 py-1 font-display text-sm tier-amber"
                >
                  CLEAR IMPORT — BACK TO SAMPLE DATA
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="keycap-btn px-2 py-1 font-display text-sm dim">CANCEL</button>
              <button
                onClick={doImport}
                disabled={!raw.trim()}
                className="keycap-btn px-3 py-1 font-display text-sm phosphor disabled:opacity-40"
              >
                IMPORT
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
