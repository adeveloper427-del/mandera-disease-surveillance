import { useState } from 'react';
import { AlertTriangle, ArrowRight, Pencil, UserPlus } from 'lucide-react';
import type { User } from '@/types';
import { useOfficers, useRefData } from '@/hooks/queries';
import { formatPhone, relativeTime } from '@/lib/format';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert, ErrorState, Skeleton } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { UserFormModal } from '@/components/admin/UserFormModal';

export function OfficersPage() {
  const officers = useOfficers();
  const ref = useRefData();
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const list = officers.data ?? [];
  const active = list.filter((o) => o.user.status === 'active');
  const uncovered = ref.wards.filter((w) => !active.some((o) => o.user.wardIds.includes(w.id)));

  return (
    <>
      <PageHeader
        title="Health officers"
        description="Workload, ward coverage and response times for each health officer."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing(null)}>
            Add health officer
          </Button>
        }
      />

      {uncovered.length > 0 && (
        <Alert tone="warning" className="mb-6" icon={<AlertTriangle className="h-4 w-4" />} title="Wards without an active officer">
          {uncovered.map((w) => w.name).join(', ')}. Reports from these wards will notify all officers until someone is assigned.
        </Alert>
      )}

      {officers.error ? (
        <Card>
          <ErrorState error={officers.error} onRetry={() => officers.refetch()} />
        </Card>
      ) : (
        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {officers.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          {list.map((o) => (
            <Card key={o.user.id} as="article" className={o.user.status === 'disabled' ? 'opacity-70' : ''}>
              <div className="flex items-start gap-3 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {o.user.name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-ink">{o.user.name}</h2>
                    <Badge className={o.user.status === 'active' ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}>
                      {o.user.status === 'active' ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink-muted">{o.user.title}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatPhone(o.user.phone)} · last login {o.user.lastLoginAt ? relativeTime(o.user.lastLoginAt) : 'never'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 px-5">
                {o.user.wardIds.map((w) => (
                  <span key={w} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-ink-soft">
                    {ref.wardById(w)}
                  </span>
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-4 divide-x divide-slate-100 border-y border-slate-100 text-center">
                {[
                  ['Open', o.open],
                  ['Pending', o.pending],
                  ['Reviewing', o.underReview],
                  ['Decided', o.decided],
                ].map(([label, n]) => (
                  <div key={label} className="py-3">
                    <dt className="text-[11px] text-ink-muted">{label}</dt>
                    <dd className="text-lg font-semibold text-ink">{n}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center justify-between gap-2 px-5 py-3">
                <p className="text-xs text-ink-muted">
                  Avg. decision:{' '}
                  <span className="font-medium text-ink">
                    {o.avgDecisionHours === null ? '—' : o.avgDecisionHours < 24 ? `${o.avgDecisionHours.toFixed(1)} h` : `${(o.avgDecisionHours / 24).toFixed(1)} d`}
                  </span>
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(o.user)}>
                    Edit
                  </Button>
                  <ButtonLink size="sm" variant="ghost" to={`/app/reports?assignedTo=${o.user.id}`}>
                    Reports <ArrowRight className="h-3.5 w-3.5" />
                  </ButtonLink>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Ward coverage" description="Active officers assigned to each ward" />
        <Table caption="Ward coverage">
          <THead>
            <tr>
              <Th>Ward</Th>
              <Th>Officers</Th>
              <Th className="text-right">Villages</Th>
              <Th className="text-right">Open reports</Th>
            </tr>
          </THead>
          <TBody>
            {ref.wards.map((w) => {
              const covering = active.filter((o) => o.user.wardIds.includes(w.id));
              return (
                <tr key={w.id}>
                  <Td className="font-medium text-ink">{w.name}</Td>
                  <Td className="whitespace-normal">
                    {covering.length ? covering.map((o) => o.user.name).join(', ') : <span className="font-medium text-amber-700">No active officer</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{ref.villages.filter((v) => v.wardId === w.id).length}</Td>
                  <Td className="text-right tabular-nums">{covering.reduce((s, o) => s + o.open, 0)}</Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <UserFormModal open={editing !== undefined} user={editing} defaultRole="officer" onClose={() => setEditing(undefined)} />
    </>
  );
}
