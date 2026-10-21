import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck } from 'lucide-react';
import type { NotificationType } from '@/types';
import { useMarkNotification, useNotifications } from '@/hooks/queries';
import { formatDateTime } from '@/lib/format';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { NotificationRow } from '@/components/layout/NotificationBell';

type Filter = 'all' | 'unread' | 'alerts' | 'reports';
const ALERT_TYPES: NotificationType[] = ['hotspot', 'outbreak_alert'];
const REPORT_TYPES: NotificationType[] = ['new_report', 'high_priority', 'assigned', 'awaiting_review'];

export function NotificationsPage() {
  const { data, isLoading, error, refetch } = useNotifications();
  const mark = useMarkNotification();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const items = (data?.items ?? []).filter((n) =>
    filter === 'unread' ? !n.read : filter === 'alerts' ? ALERT_TYPES.includes(n.type) : filter === 'reports' ? REPORT_TYPES.includes(n.type) : true,
  );

  // Group by day for readability.
  const groups = items.reduce<Record<string, typeof items>>((acc, n) => {
    const key = formatDateTime(n.createdAt).split(',')[0];
    (acc[key] ??= []).push(n);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Notifications"
        description="New reports, high-priority cases, assignments and potential hotspot alerts."
        actions={
          <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={() => mark.mutate('all')} disabled={!data?.unread} loading={mark.isPending && mark.variables === 'all'}>
            Mark all as read
          </Button>
        }
      />
      <div className="mb-4">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: data?.items.length },
            { value: 'unread', label: 'Unread', count: data?.unread },
            { value: 'alerts', label: 'Alerts' },
            { value: 'reports', label: 'Reports' },
          ]}
        />
      </div>
      <Card>
        {isLoading ? (
          <LoadingBlock rows={6} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={BellOff} title={filter === 'unread' ? "You're all caught up" : 'No notifications'} message="New notifications will appear here as reports arrive." />
        ) : (
          Object.entries(groups).map(([day, list]) => (
            <div key={day}>
              <p className="sticky top-16 z-10 border-b border-slate-100 bg-slate-50/95 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{day}</p>
              <div className="divide-y divide-slate-100">
                {list.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    onOpen={(x) => {
                      if (!x.read) mark.mutate(x.id);
                      if (x.link) navigate(x.link);
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
