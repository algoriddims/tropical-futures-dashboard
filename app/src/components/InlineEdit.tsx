import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Terminal-styled click-to-edit controls. Click the value → it becomes an
// input; Enter or blur commits, Esc cancels. Clicks are stopped so they
// don't bubble into window-level onClick (desk switching).

const inputCls =
  'bg-[var(--crt-dark)] border border-[var(--phosphor)] px-1 py-0 font-display text-inherit outline-none w-full min-w-0';

export function InlineNumber({
  value,
  onCommit,
  format,
  className = '',
  title = 'CLICK TO EDIT',
}: {
  /** null = not set yet; shown via format (or "—") and edited from blank. */
  value: number | null;
  onCommit: (v: number) => void;
  format?: (v: number | null) => string;
  className?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const finish = (save: boolean) => {
    if (save) {
      const n = Number(draft.replace(/[^0-9.-]/g, ''));
      if (!Number.isNaN(n) && draft.trim() !== '') onCommit(n);
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        className={`cursor-text border-b border-dashed border-[var(--vhs-dim)]/40 hover:border-[var(--phosphor)] ${className}`}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value === null ? '' : String(value));
          setEditing(true);
        }}
      >
        {format ? format(value) : value === null ? '—' : value.toLocaleString()}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      className={inputCls}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
    />
  );
}

export function InlineText({
  value,
  onCommit,
  className = '',
  title = 'CLICK TO EDIT',
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const finish = (save: boolean) => {
    if (save && draft.trim()) onCommit(draft.trim().toUpperCase());
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        className={`cursor-text truncate text-left border-b border-dashed border-[var(--vhs-dim)]/40 hover:border-[var(--phosphor)] ${className}`}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      className={inputCls}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
    />
  );
}

/** Small terminal button used for row actions (pause / delete / add). */
export function RowBtn({
  children,
  onClick,
  tone = 'dim',
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: string;
  title?: string;
}) {
  return (
    <button
      className={`font-display text-xs px-1 border border-[var(--crt-mid)] hover:border-[var(--phosphor)] hover:text-[var(--phosphor)] ${tone}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
