import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Inbox, MessageSquareWarning, RefreshCw, Send, Smartphone } from 'lucide-react';
import type { SmsMessage } from '@/types';
import { useAdminSummary, useSmsLog } from '@/hooks/queries';
import { useDebounce } from '@/hooks/useDebounce';
import { smsService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { formatDateTime, maskPhone } from '@/lib/format';
import { Card, PageHeader, StatCard } from '@/components/ui/Card';
import { SmsStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/forms';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '@/components/ui/states';
import { Pagination, TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

const TYPE_LABEL: Record<SmsMessage['type'], string> = {
  report: 'Report',
  report_received: 'Successful report',
  invalid_format: 'Invalid format',
  unknown_location: 'Unknown location',
  unknown_disease: 'Unknown disease',
  report_verified: 'Verified report',
  report_rejected: 'Rejected report',
  alert_notification: 'Alert notification',
  custom: 'Custom',
};

export function SmsManagementPage() {
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 300);
  const log = useSmsLog({ direction, status: status || undefined, search: debounced || undefined, page, pageSize: 15 });
  const summary = useAdminSummary();
  const qc = useQueryClient();
  const toast = useToast();

  const retry = useMutation({
    mutationFn: smsService.retry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms'] });
      toast.success('SMS re-queued', 'The message will be re-sent through the gateway.');
    },
    onError: (e) => toast.error('Retry failed', errorMessage(e)),
  });

  const s = summary.data?.sms;
  const statusOptions = direction === 'inbound' ? ['processed', 'invalid'] : ['pending', 'sent', 'delivered', 'failed'];

  return (
    <>
      <PageHeader
        title="SMS management"
        description="Incoming reports and outgoing messages, with processing and delivery status."
        actions={
          <ButtonLink to="/app/demo/simulator" variant="secondary" icon={<Smartphone className="h-4 w-4" />}>
            Send test SMS
          </ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!s ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
        ) : (
          <>
            <StatCard compact label="Inbound (30 days)" value={s.inbound} icon={ArrowDownLeft} tone="sky" />
            <StatCard compact label="Invalid messages" value={s.invalid} icon={MessageSquareWarning} tone="rose" hint={`${s.inbound ? Math.round((s.invalid / s.inbound) * 100) : 0}% of inbound`} />
            <StatCard compact label="Outbound (30 days)" value={s.outbound} icon={ArrowUpRight} tone="emerald" />
            <StatCard compact label="Failed deliveries" value={s.failed} icon={Send} tone="amber" hint="Can be retried" />
          </>
        )}
      </div>

      <div className="mb-4">
        <Tabs
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setStatus('');
            setPage(1);
          }}
          items={[
            { value: 'inbound', label: 'Incoming SMS' },
            { value: 'outbound', label: 'Outgoing SMS' },
          ]}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput
            className="sm:max-w-sm sm:flex-1"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search message, phone or report ID"
            label="Search SMS"
          />
          <Select
            aria-label="Filter by status"
            className="sm:w-48"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {statusOptions.map((o) => (
              <option key={o} value={o}>
                {o[0].toUpperCase() + o.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        {log.isLoading ? (
          <LoadingBlock rows={8} />
        ) : log.error ? (
          <ErrorState error={log.error} onRetry={() => log.refetch()} />
        ) : !log.data?.items.length ? (
          <EmptyState icon={Inbox} title="No messages found" message="Try another filter or send a test SMS." />
        ) : (
          <>
            <Table caption={direction === 'inbound' ? 'Incoming SMS' : 'Outgoing SMS'}>
              <THead>
                <tr>
                  <Th>{direction === 'inbound' ? 'Sender' : 'Recipient'}</Th>
                  <Th>Message</Th>
                  {direction === 'outbound' && <Th>Type</Th>}
                  <Th>Date / time</Th>
                  <Th>{direction === 'inbound' ? 'Processing' : 'Delivery'}</Th>
                  <Th>Report ID</Th>
                  {direction === 'outbound' && (
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  )}
                </tr>
              </THead>
              <TBody>
                {log.data.items.map((m) => (
                  <tr key={m.id}>
                    <Td className="font-mono text-xs">{maskPhone(m.phone)}</Td>
                    <Td className="max-w-md whitespace-normal">
                      <p className={direction === 'inbound' ? 'font-mono text-xs text-ink' : 'text-sm text-ink'}>{m.body || <em className="text-ink-muted">(empty)</em>}</p>
                      {m.error && <p className="mt-0.5 text-xs text-rose-700">{m.error}</p>}
                    </Td>
                    {direction === 'outbound' && <Td className="text-xs">{TYPE_LABEL[m.type]}</Td>}
                    <Td className="text-xs">{formatDateTime(m.at)}</Td>
                    <Td>
                      <SmsStatusBadge status={m.status} />
                    </Td>
                    <Td>
                      {m.reportId ? (
                        <Link to={`/app/reports/${m.reportId}`} className="font-mono text-sm font-medium text-brand-700 hover:underline">
                          {m.reportId}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </Td>
                    {direction === 'outbound' && (
                      <Td className="text-right">
                        {m.status === 'failed' && (
                          <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => retry.mutate(m.id)} loading={retry.isPending && retry.variables === m.id}>
                            Retry
                          </Button>
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={log.data.page} pageSize={log.data.pageSize} total={log.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
