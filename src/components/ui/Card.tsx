import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('rounded-xl bg-white shadow-card ring-1 ring-slate-200/70', className)}>{children}</As>;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'brand' | 'amber' | 'sky' | 'emerald' | 'rose' | 'violet' | 'slate';
  hint?: ReactNode;
  to?: string;
  trend?: { value: number; label: string; goodWhenUp?: boolean };
  compact?: boolean;
}

const tones = {
  brand: 'bg-brand-50 text-brand-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-700',
};

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint, to, trend, compact }: StatCardProps) {
  const body = (
    <div className={cn('flex items-start gap-4', compact ? 'p-4' : 'p-5')}>
      <div className={cn('flex shrink-0 items-center justify-center rounded-lg', tones[tone], compact ? 'h-9 w-9' : 'h-11 w-11')}>
        <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        <p className={cn('mt-1 font-semibold text-ink', compact ? 'text-xl' : 'text-2xl')}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {trend && (
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
            {trend.value >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="font-medium text-ink-soft">
              {trend.value >= 0 ? '+' : ''}
              {trend.value}
            </span>
            {trend.label}
          </p>
        )}
        {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
  if (to)
    return (
      <Link
        to={to}
        className="block rounded-xl bg-white shadow-card ring-1 ring-slate-200/70 transition hover:ring-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        aria-label={`${label}: ${value}. View details`}
      >
        {body}
      </Link>
    );
  return <Card as="div">{body}</Card>;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2 text-sm text-ink-muted">{breadcrumb}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
