import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/services/apiClient';
import { Button } from './Button';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} aria-hidden />;
}

export function LoadingBlock({ rows = 5, label = 'Loading data' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn('h-9', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }} role="status" aria-label="Loading chart">
      {Array.from({ length: 14 }).map((_, i) => (
        <Skeleton key={i} className="flex-1" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
  className,
  headingLevel = 'h3',
}: {
  icon?: LucideIcon;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  className?: string;
  headingLevel?: 'h1' | 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <Heading className="mt-4 text-sm font-semibold text-ink">{title}</Heading>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)} role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink">Could not load this information</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  className,
  action,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    danger: 'bg-rose-50 text-rose-900 ring-rose-200',
  };
  const DefaultIcon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={cn('flex gap-3 rounded-lg p-4 text-sm ring-1 ring-inset', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="mt-0.5 shrink-0">{icon ?? <DefaultIcon className="h-4 w-4" aria-hidden />}</div>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-1', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
