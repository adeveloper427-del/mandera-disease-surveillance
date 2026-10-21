import { useState } from 'react';
import { Download, History, RotateCcw } from 'lucide-react';
import type { AuditLog } from '@/types';
import { useAuditLogs, useUsers } from '@/hooks/queries';
import { useDebounce } from '@/hooks/useDebounce';
import { auditService } from '@/services';
import { exportCsv } from '@/lib/exporters';
import { formatDate, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, SearchInput, Select } from '@/components/ui/forms';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { Pagination, TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

const CATEGORIES = [
  { value: 'auth', label: 'Sign-in & passwords' },
  { value: 'report', label: 'Reports' },
  { value: 'sms', label: 'SMS' },
  { value: 'alert', label: 'Alerts' },
  { value: 'user', label: 'Users' },
  { value: 'disease', label: 'Diseases' },
  { value: 'location', label: 'Locations' },
  { value: 'template', label: 'Templates' },
  { value: 'settings', label: 'Settings' },
];

const TONE: Record<string, string> = {
  auth: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  report: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  sms: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  alert: 'bg-red-50 text-red-800 ring-red-600/20',
  user: 'bg-violet-50 text-violet-800 ring-violet-600/20',
  disease: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  location: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  template: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  settings: 'bg-amber-50 text-amber-800 ring-amber-600/20',
};

const actionLabel = (a: AuditLog['action']) => a.split('.')[1].replace(/_/g, ' ');

export function AuditLogsPage() {
  const users = useUsers();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search, 300);
  const filters = { search: debounced || undefined, action: action || undefined, actorId: actorId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
  const logs = useAuditLogs({ ...filters, page, pageSize: 20 });
  const anyFilter = !!(search || action || actorId || dateFrom || dateTo);

  const reset = () => {
    setSearch('');
    setAction('');
    setActorId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await auditService.list({ ...filters, page: 1, pageSize: 10000 });
      exportCsv('audit-log', ['Date', 'Time', 'User', 'Action', 'Entity', 'Details'], all.items.map((a) => [formatDate(a.at), formatTime(a.at), a.actorName, a.action, a.entityId ?? '', a.details]));
      toast.success('Audit log exported', `${all.items.length} entries.`);
    } catch (e) {
      toast.error('Export failed', (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="A tamper-evident record of who did what and when. Entries cannot be edited or deleted from the interface."
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportAll} loading={exporting}>
            Export CSV
          </Button>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput
            className="lg:col-span-2"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search details, user or record ID"
            label="Search audit logs"
          />
          <Select aria-label="Filter by action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">All actions</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by user" value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }}>
            <option value="">All users</option>
            <option value="system">System</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Input type="date" aria-label="From date" value={dateFrom} max={dateTo || undefined} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          <Input type="date" aria-label="To date" value={dateTo} min={dateFrom || undefined} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        </div>
        {anyFilter && (
          <div className="flex justify-end border-b border-slate-100 px-4 py-2">
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={reset}>
              Clear filters
            </Button>
          </div>
        )}
        {logs.isLoading ? (
          <LoadingBlock rows={10} />
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        ) : !logs.data?.items.length ? (
          <EmptyState icon={History} title="No audit entries match your filters" />
        ) : (
          <div className={cn(logs.isFetching && 'opacity-70')}>
            <Table caption="Audit log entries">
              <THead>
                <tr>
                  <Th>Date / time</Th>
                  <Th>User</Th>
                  <Th>Action</Th>
                  <Th>Details</Th>
                </tr>
              </THead>
              <TBody>
                {logs.data.items.map((a) => {
                  const cat = a.action.split('.')[0];
                  return (
                    <tr key={a.id}>
                      <Td className="text-xs">
                        <span className="block font-medium text-ink">{formatDate(a.at)}</span>
                        {formatTime(a.at)}
                      </Td>
                      <Td className="font-medium text-ink">{a.actorName}</Td>
                      <Td>
                        <Badge className={cn(TONE[cat], 'capitalize')}>
                          {cat} · {actionLabel(a.action)}
                        </Badge>
                      </Td>
                      <Td className="max-w-xl whitespace-normal text-ink">{a.details}</Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={logs.data.page} pageSize={logs.data.pageSize} total={logs.data.total} onPage={setPage} />
          </div>
        )}
      </Card>
    </>
  );
}
