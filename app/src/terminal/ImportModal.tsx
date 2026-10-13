import { useState } from 'react';
import { useTerminal } from './TerminalContext';

// Paste-in bridge for the external sync (Claude Code writes park-data.json,
// you paste its contents here). Keeps the static build usable with real data
// before any server exists. Manual slices and shelf edits survive the import.
// Mounted only while open, so each opening starts from a clean state.
export function ImportModal({ onClose }: { onClose: () => void }) {
  const { importData, clearImport, imported, exportStored, shared, sharedError, reloadShared } = useTerminal();
  const [raw, setRaw] = useState('');
  const [errors, setErrors] = useState<string[] | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    setBusy(true);
    const errs = await importData(raw);
    setBusy(false);
    setErrors(errs);
    if (!errs) {
      setRaw('');
      setOk(true);
      window.setTimeout(onClose, 900);
    }
  };

  const doExport = () => {
    const blob = new Blob([exportStored()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tfi-terminal-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="panel w-[580px] desk-enter" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import sync data">
        <div className="panel-head">IMPORT SYNC DATA</div>
        <div className="space-y-3 p-4">
          <p className="text-[0.75rem] leading-relaxed dim">
            PASTE THE CONTENTS OF <span className="warm">park-data.json</span> FROM THE DAILY SYNC.
            THE WHOLE FILE IS CHECKED FIRST — IF ANYTHING IS MISSING OR MALFORMED, NOTHING CHANGES.
            YOUR MANUAL ENTRIES — COST LINES, PLANNING INPUTS, SHELF CORRECTIONS — ARE PRESERVED.
          </p>
          <p className="text-[0.75rem] leading-relaxed">
            {shared === 'server' ? (
              <span className="tier-green">SHARED: THIS UPLOADS TO YOUR SERVER, SO EVERY DEVICE YOU SIGN IN FROM SEES IT. MANUAL ENTRIES STAY IN EACH BROWSER.</span>
            ) : shared === 'local' ? (
              <span className="tier-amber">THIS BROWSER ONLY: NO SHARED STORE HERE (LOCAL DEV OR PREVIEW). OTHER DEVICES NEED THEIR OWN IMPORT.</span>
            ) : (
              <span className="dim">CHECKING FOR A SHARED STORE…</span>
            )}
          </p>
          {sharedError && (
            <div className="max-h-24 overflow-y-auto font-display text-sm tier-amber" role="status">
              {sharedError.map((e, i) => <div key={i}>◆ {e}</div>)}
            </div>
          )}
          <textarea
            autoFocus
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setErrors(null); }}
            rows={10}
            spellCheck={false}
            placeholder='{"products": [...], "pipeline": [...], "channels": [...], ...}'
            className="w-full resize-none border border-[var(--crt-mid)] bg-[var(--crt-black)] p-2 font-mono text-xs leading-relaxed text-[var(--vhs-white)] outline-none focus:border-[var(--phosphor)]"
          />
          {errors && (
            <div className="max-h-32 overflow-y-auto font-display text-sm tier-red" role="alert">
              {errors.map((e, i) => <div key={i}>▲ {e}</div>)}
            </div>
          )}
          {ok && <div className="font-display text-sm tier-green">✓ {shared === 'server' ? 'UPLOADED — ALL YOUR DEVICES WILL LOAD THIS' : 'SYNC DATA LOADED IN THIS BROWSER'}</div>}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={doExport} className="keycap-btn px-2 py-1 font-display text-sm dim" title="DOWNLOAD EVERYTHING STORED IN THIS BROWSER">
                EXPORT BACKUP
              </button>
              {shared === 'server' && (
                <button onClick={() => { void reloadShared(); }} className="keycap-btn px-2 py-1 font-display text-sm dim" title="FETCH THE LATEST SHARED DATA">
                  RELOAD SHARED
                </button>
              )}
              {imported && shared !== 'server' && (
                <button
                  onClick={() => {
                    if (!window.confirm('Remove the imported snapshot from this browser? Export a backup first if you may need it.')) return;
                    clearImport();
                    onClose();
                  }}
                  className="keycap-btn px-2 py-1 font-display text-sm tier-amber"
                >
                  CLEAR IMPORT — BACK TO SAMPLE DATA
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="keycap-btn px-2 py-1 font-display text-sm dim">CANCEL</button>
              <button
                onClick={() => { void doImport(); }}
                disabled={!raw.trim() || busy || shared === 'checking'}
                className="keycap-btn px-3 py-1 font-display text-sm phosphor disabled:opacity-40"
              >
                {busy ? 'UPLOADING…' : shared === 'server' ? 'UPLOAD' : 'IMPORT'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
