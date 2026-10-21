import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CheckCircle2, Eye, Info, MapPin, Search, ShieldQuestion, XCircle } from 'lucide-react';
import type { Alert, AlertStatus } from '@/types';
import { useAlerts, useRefData } from '@/hooks/queries';
import { alertService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { formatDateTime, relativeTime, toDateKey } from '@/lib/format';
import { isOpenAlert } from '@/lib/hotspot';
import { cn } from '@/lib/utils';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { AlertLevelBadge, AlertStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/forms';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { Alert as Notice, EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

type View = 'open' | 'closed' | 'all';

function AlertCard({ alert, focused, onAction }: { alert: Alert; focused: boolean; onAction: (a: Alert, s: AlertStatus) => void }) {
  const ref = useRefData();
  const disease = ref.diseaseName(alert.diseaseId);
  const village = ref.villageName(alert.villageId);
  const pct = Math.min(100, (alert.count / alert.threshold) * 100);
  const outbreak = alert.level === 'outbreak';
  const open = isOpenAlert(alert);
  const from = toDateKey(new Date(alert.firstAt));

  return (
    <article
      id={`alert-${alert.id}`}
      className={cn(
        'rounded-xl bg-white shadow-card ring-1 transition',
        outbreak && open ? 'ring-red-200' : 'ring-slate-200',
        focused && 'ring-2 ring-brand-500',
      )}
    >
      <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-t-xl px-5 py-3', outbreak && open ? 'bg-red-50' : open ? 'bg-amber-50/70' : 'bg-slate-50')}>
        <p className={cn('flex items-center gap-2 text-xs font-bold uppercase tracking-wider', outbreak && open ? 'text-red-700' : open ? 'text-amber-800' : 'text-ink-muted')}>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {outbreak ? 'Potential outbreak alert' : 'Potential hotspot'}
        </p>
        <div className="flex items-center gap-2">
          <AlertLevelBadge level={alert.level} />
          <AlertStatusBadge status={alert.status} />
        </div>
      </div>
      <div className="p-5">
        <h2 className="text-base font-semibold text-ink">
          {alert.count} suspected {disease} reports have been received from {village} within the last {alert.windowHours} hours.
        </h2>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {village}, {ref.wardName(alert.villageId)} ward · requires verification by a health officer
        </p>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>
              {alert.count} of {alert.threshold} reports (threshold for {alert.windowHours} h)
            </span>
            <span className="font-semibold text-ink">{Math.round((alert.count / alert.threshold) * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={alert.count} aria-valuemin={0} aria-valuemax={alert.threshold} aria-label="Reports relative to alert threshold">
            <div className={cn('h-2 rounded-full', outbreak ? 'bg-red-600' : 'bg-orange-400')} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">First report</dt>
            <dd className="font-medium text-ink">{formatDateTime(alert.firstAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Latest report</dt>
            <dd className="font-medium text-ink">{relativeTime(alert.lastAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Reports</dt>
            <dd className="font-mono font-medium text-ink">
              {alert.reportIds.slice(0, 3).join(', ')}
              {alert.reportIds.length > 3 && ` +${alert.reportIds.length - 3}`}
            </dd>
          </div>
        </dl>

        {alert.note && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">
            <span className="font-medium text-ink">Officer note:</span> {alert.note}
            {alert.updatedBy && (
              <span className="mt-1 block text-xs text-ink-muted">
                {ref.officerName(alert.updatedBy)} · {formatDateTime(alert.updatedAt)}
              </span>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <ButtonLink
            size="sm"
            variant="secondary"
            to={`/app/reports?diseaseId=${alert.diseaseId}&villageId=${alert.villageId}&dateFrom=${from}`}
            icon={<Search className="h-3.5 w-3.5" />}
          >
            View {alert.count} reports
          </ButtonLink>
          {open && alert.status === 'new' && (
            <Button size="sm" variant="secondary" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => onAction(alert, 'acknowledged')}>
              Acknowledge
            </Button>
          )}
          {open && alert.status !== 'investigating' && (
            <Button size="sm" variant="primary" icon={<ShieldQuestion className="h-3.5 w-3.5" />} onClick={() => onAction(alert, 'investigating')}>
              Start investigation
            </Button>
          )}
          {open && (
            <>
              <Button size="sm" variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => onAction(alert, 'resolved')}>
                Resolve
              </Button>
              <Button size="sm" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => onAction(alert, 'dismissed')}>
                Dismiss
              </Button>
            </>
          )}
          {!open && (
            <Button size="sm" variant="secondary" onClick={() => onAction(alert, 'investigating')}>
              Re-open
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

const ACTION_COPY: Record<AlertStatus, { title: string; confirm: string; noteRequired: boolean; description: string }> = {
  new: { title: 'Reset alert', confirm: 'Reset', noteRequired: false, description: '' },
  acknowledged: { title: 'Acknowledge alert', confirm: 'Acknowledge', noteRequired: false, description: 'Confirm that you have seen this alert. Other officers will see it has been picked up.' },
  investigating: { title: 'Start investigation', confirm: 'Start investigation', noteRequired: false, description: 'Record that a field investigation or follow-up has started.' },
  resolved: { title: 'Resolve alert', confirm: 'Resolve alert', noteRequired: true, description: 'Close the alert after investigation and response. Explain what was found and done.' },
  dismissed: { title: 'Dismiss alert', confirm: 'Dismiss alert', noteRequired: true, description: 'Dismiss when investigation shows no cluster (e.g. duplicates or unrelated cases). A reason is required.' },
};

export function AlertsPage() {
  const ref = useRefData();
  const alerts = useAlerts();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [view, setView] = useState<View>('open');
  const [pendingAction, setPendingAction] = useState<{ alert: Alert; status: AlertStatus } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (v: { id: string; status: AlertStatus; note?: string }) => alertService.update(v.id, v.status, v.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  useEffect(() => {
    if (focus && alerts.data) document.getElementById(`alert-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, alerts.data]);

  const list = alerts.data ?? [];
  const shown = list.filter((a) => (view === 'all' ? true : view === 'open' ? isOpenAlert(a) : !isOpenAlert(a)));
  const openCount = list.filter(isOpenAlert).length;

  const confirm = async () => {
    if (!pendingAction) return;
    const copy = ACTION_COPY[pendingAction.status];
    if (copy.noteRequired && !note.trim()) {
      setError('A note is required.');
      return;
    }
    try {
      await mutation.mutateAsync({ id: pendingAction.alert.id, status: pendingAction.status, note: note.trim() || undefined });
      toast.success('Alert updated', `${ref.diseaseName(pendingAction.alert.diseaseId)} alert in ${ref.villageName(pendingAction.alert.villageId)} marked as ${pendingAction.status}.`);
      setPendingAction(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Alerts & hotspots"
        description="Automatic signals raised when suspected reports of one disease cluster in one village. Every alert must be investigated and verified by a health officer."
      />

      <Notice tone="info" className="mb-6" icon={<Info className="h-4 w-4" />} title="These are not confirmed outbreaks">
        The system compares report counts with each disease's surveillance threshold. A <strong>potential hotspot</strong> is raised at half the threshold, and a{' '}
        <strong>potential outbreak alert</strong> when the threshold is reached. Officers confirm or dismiss each signal after investigation.
      </Notice>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: 'open', label: 'Open', count: openCount },
            { value: 'closed', label: 'Resolved / dismissed', count: list.length - openCount },
            { value: 'all', label: 'All', count: list.length },
          ]}
        />
      </div>

      {alerts.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : alerts.error ? (
        <Card>
          <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={BellRing}
            title={view === 'open' ? 'No open alerts' : 'No alerts in this view'}
            message={view === 'open' ? 'No disease is currently clustering above its surveillance threshold.' : 'Resolved and dismissed alerts appear here while their reports are within the alert window.'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              focused={focus === a.id}
              onAction={(alert, status) => {
                setNote('');
                setError(null);
                setPendingAction({ alert, status });
              }}
            />
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader
          title="Detection rules"
          description="Thresholds are configured by the administrator for each disease"
          actions={
            <Link to="/app/diseases" className="text-xs font-medium text-brand-700 hover:underline">
              Disease monitoring →
            </Link>
          }
        />
        <Table caption="Detection rules">
          <THead>
            <tr>
              <Th>Disease</Th>
              <Th>Window</Th>
              <Th className="text-right">Potential hotspot at</Th>
              <Th className="text-right">Potential outbreak at</Th>
            </tr>
          </THead>
          <TBody>
            {ref.diseases
              .filter((d) => d.active)
              .map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium text-ink">{d.name}</Td>
                  <Td>{d.alertWindowHours} hours</Td>
                  <Td className="text-right tabular-nums">{Math.max(3, Math.ceil(d.alertThreshold / 2))} reports</Td>
                  <Td className="text-right tabular-nums">{d.alertThreshold} reports</Td>
                </tr>
              ))}
          </TBody>
        </Table>
      </Card>

      {pendingAction && (
        <Modal
          open
          onClose={() => setPendingAction(null)}
          title={ACTION_COPY[pendingAction.status].title}
          description={ACTION_COPY[pendingAction.status].description}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingAction(null)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                variant={pendingAction.status === 'dismissed' ? 'danger' : pendingAction.status === 'resolved' ? 'success' : 'primary'}
                onClick={confirm}
                loading={mutation.isPending}
              >
                {ACTION_COPY[pendingAction.status].confirm}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {error && <Notice tone="danger">{error}</Notice>}
            <p className="text-sm text-ink-soft">
              {ref.diseaseName(pendingAction.alert.diseaseId)} in {ref.villageName(pendingAction.alert.villageId)} · {pendingAction.alert.count} reports
            </p>
            <Field label="Note" required={ACTION_COPY[pendingAction.status].noteRequired}>
              {(id) => (
                <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="e.g. Rapid response team visited; water source treated." />
              )}
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
