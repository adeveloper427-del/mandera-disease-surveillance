import type { ReactNode } from 'react';
import type { AlertLevel, AlertStatus, InboundStatus, OutboundStatus, Priority, ReportStatus } from '@/types';
import { ALERT_LEVEL, ALERT_STATUS, PRIORITY, SMS_STATUS, STATUS } from '@/config/status';
import { cn } from '@/lib/utils';

export function Badge({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge className={s.className} title={s.description}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority];
  const Icon = p.icon;
  return (
    <Badge className={cn(p.className, 'uppercase tracking-wide')} title={`${p.label} priority: ${p.description}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {p.label}
    </Badge>
  );
}

export function AlertLevelBadge({ level }: { level: AlertLevel }) {
  const a = ALERT_LEVEL[level];
  const Icon = a.icon;
  return (
    <Badge className={a.className} title={a.description}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {a.label}
    </Badge>
  );
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const a = ALERT_STATUS[status];
  return <Badge className={a.className}>{a.label}</Badge>;
}

export function SmsStatusBadge({ status }: { status: InboundStatus | OutboundStatus }) {
  const s = SMS_STATUS[status];
  return (
    <Badge className={s.className}>
      <span className={cn('h-1.5 w-1.5 rounded-full', status === 'failed' || status === 'invalid' ? 'bg-rose-500' : status === 'delivered' || status === 'processed' ? 'bg-emerald-500' : 'bg-current opacity-60')} aria-hidden />
      {s.label}
    </Badge>
  );
}
