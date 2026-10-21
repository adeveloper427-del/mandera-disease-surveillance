import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Table({ children, className, caption }: { children: ReactNode; className?: string; caption?: string }) {
  return (
    // `relative` keeps absolutely positioned children (e.g. sr-only labels) inside the scroll area.
    <div className={cn('relative overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50/80">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted', className)} {...rest}>
      {children}
    </th>
  );
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  current?: K;
  dir?: 'asc' | 'desc';
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink">
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} aria-hidden />
      </button>
    </Th>
  );
}

export function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('whitespace-nowrap px-4 py-3 text-ink-soft', className)} {...rest}>
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row" aria-label="Pagination">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span>
          Showing <span className="font-medium text-ink">{from}</span>–<span className="font-medium text-ink">{to}</span> of{' '}
          <span className="font-medium text-ink">{total.toLocaleString()}</span>
        </span>
        {onPageSize && (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-md border-0 py-1 pl-2 pr-7 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-md p-2 text-ink-soft hover:bg-slate-100 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="px-2 text-sm text-ink-muted">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
              className={cn(
                'h-8 min-w-8 rounded-md px-2 text-sm font-medium',
                n === page ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-slate-100',
              )}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="rounded-md p-2 text-ink-soft hover:bg-slate-100 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
