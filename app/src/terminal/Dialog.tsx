import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Modal shell: aria-modal, focus moves in (and back out on close), Tab stays
// inside, Esc and a backdrop click close it. Desk shortcuts are ignored while
// any aria-modal dialog is open (see the key handler in TerminalContext).
export function Dialog({ label, onClose, className = '', children }: {
  label: string; onClose: () => void; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    // Esc works wherever focus is (a button that just became disabled drops
    // focus to <body>); Tab from outside pulls focus back in.
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key === 'Tab' && el && !el.contains(document.activeElement)) {
        e.preventDefault();
        (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
      }
    };
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('keydown', onDocKey);
      before?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`panel desk-enter max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto ${className}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
