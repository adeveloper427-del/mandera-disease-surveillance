import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, ClipboardList, Siren, AlertOctagon, UserPlus, Clock, Info, type LucideIcon } from 'lucide-react';
import type { AppNotification, NotificationType } from '@/types';
import { useMarkNotification, useNotifications } from '@/hooks/queries';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Dropdown } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/states';

export const NOTIFICATION_ICON: Record<NotificationType, { icon: LucideIcon; className: string; label: string }> = {
  new_report: { icon: ClipboardList, className: 'bg-sky-50 text-sky-700', label: 'New report' },
  high_priority: { icon: AlertOctagon, className: 'bg-orange-50 text-orange-700', label: 'High priority' },
  hotspot: { icon: BellRing, className: 'bg-amber-50 text-amber-700', label: 'Potential hotspot' },
  outbreak_alert: { icon: Siren, className: 'bg-red-50 text-red-700', label: 'Outbreak alert' },
  assigned: { icon: UserPlus, className: 'bg-violet-50 text-violet-700', label: 'Assigned' },
  awaiting_review: { icon: Clock, className: 'bg-slate-100 text-slate-700', label: 'Awaiting review' },
  system: { icon: Info, className: 'bg-slate-100 text-slate-700', label: 'System' },
};

export function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const meta = NOTIFICATION_ICON[n.type];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50', !n.read && 'bg-brand-50/40')}
    >
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.className)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={cn('text-sm', n.read ? 'text-ink-soft' : 'font-semibold text-ink')}>{n.title}</span>
          {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted line-clamp-2">{n.message}</span>
        <span className="mt-1 block text-[11px] text-ink-muted">{relativeTime(n.createdAt)}</span>
      </span>
    </button>
  );
}

export function NotificationBell() {
  const { data, isLoading } = useNotifications();
  const mark = useMarkNotification();
  const navigate = useNavigate();
  const unread = data?.unread ?? 0;

  return (
    <Dropdown
      width="w-[22rem] max-w-[calc(100vw-2rem)]"
      label="Notifications"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          className="relative rounded-lg p-2 text-ink-soft hover:bg-slate-100 hover:text-ink"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink">
              Notifications {unread > 0 && <span className="ml-1 text-xs font-normal text-ink-muted">({unread} unread)</span>}
            </p>
            <button
              type="button"
              onClick={() => mark.mutate('all')}
              disabled={!unread}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
            </button>
          </div>
          <div className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            {data?.items.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-muted">You're all caught up.</p>}
            {data?.items.slice(0, 8).map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onOpen={(x) => {
                  if (!x.read) mark.mutate(x.id);
                  close();
                  if (x.link) navigate(x.link);
                }}
              />
            ))}
          </div>
          <Link
            to="/app/notifications"
            onClick={close}
            className="block rounded-b-xl border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50"
          >
            View all notifications
          </Link>
        </div>
      )}
    </Dropdown>
  );
}
