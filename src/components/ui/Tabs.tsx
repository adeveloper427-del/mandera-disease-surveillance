import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === it.value ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-ink-soft')}>
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Small dropdown menu that closes on outside click and Escape. */
export function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 'w-56',
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'absolute z-40 mt-2 origin-top rounded-xl bg-white shadow-pop ring-1 ring-slate-200 animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  icon,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40',
        danger ? 'text-rose-700 hover:bg-rose-50' : 'text-ink-soft hover:bg-slate-50 hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
