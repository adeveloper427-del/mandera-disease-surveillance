import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronsUp,
  Eye,
  EyeOff,
  Info,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  PlayCircle,
  Send,
  SlidersHorizontal,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type { ReportAction, ReportEventType } from '@/types';
import { useRefData, useReport, useReportSms } from '@/hooks/queries';
import { formatDate, formatDateTime, formatLongDate, formatPhone, formatTime, relativeTime } from '@/lib/format';
import { canPerform, ACTION_HINT } from '@/lib/workflow';
import { reportService } from '@/services';
import { ApiError, errorMessage } from '@/services/apiClient';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PriorityBadge, SmsStatusBadge, StatusBadge } from '@/components/ui/Badge';
import { Dropdown, MenuItem } from '@/components/ui/Tabs';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { WorkflowStepper } from '@/components/reports/WorkflowStepper';
import { ReportActionDialog, type DialogKind } from '@/components/reports/ReportActionDialog';

const EVENT_STYLE: Record<ReportEventType, string> = {
  created: 'bg-brand-600',
  assigned: 'bg-violet-500',
  status_changed: 'bg-sky-500',
  remark: 'bg-slate-400',
  sms_sent: 'bg-emerald-500',
  priority_changed: 'bg-orange-500',
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink sm:col-span-2 sm:mt-0">{children}</dd>
    </div>
  );
}

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const report = useReport(id);
  const sms = useReportSms(id);
  const ref = useRefData();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const logged = useRef<string | null>(null);

  // Record "report viewed" once per visit for the audit log.
  useEffect(() => {
    if (report.data && logged.current !== report.data.id) {
      logged.current = report.data.id;
      reportService.logView(report.data.id).catch(() => undefined);
    }
  }, [report.data]);

  useEffect(() => setPhone(null), [id]);

  if (report.isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );

  if (report.error || !report.data) {
    const notFound = report.error instanceof ApiError && report.error.status === 404;
    return (
      <Card>
        {notFound ? (
          <EmptyState
            headingLevel="h1"
            title={`Report ${id.toUpperCase()} was not found`}
            message="Check the Report ID and try again. Report IDs look like MS001."
            action={<ButtonLink to="/app/reports">Back to reports</ButtonLink>}
          />
        ) : (
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        )}
      </Card>
    );
  }

  const r = report.data;
  const disease = ref.diseases.find((d) => d.id === r.diseaseId);
  const can = (a: ReportAction['type']) => canPerform(a, r.status);
  const hint = (a: ReportAction['type']) => (can(a) ? undefined : ACTION_HINT[a]);
  const masked = r.phone.includes('•');

  const reveal = async () => {
    setRevealing(true);
    try {
      const res = await reportService.revealPhone(r.id);
      setPhone(res.phone);
      toast.info('Phone number revealed', 'This action has been recorded in the audit log.');
    } catch (err) {
      toast.error('Could not reveal phone number', errorMessage(err));
    } finally {
      setRevealing(false);
    }
  };

  return (
    <>
      <div className="mb-2">
        <Link to="/app/reports" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
      </div>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Report <span className="font-mono">{r.id}</span>
            </h1>
            <StatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Suspected {disease?.name ?? 'disease'} · {ref.villageName(r.villageId)}, {ref.wardName(r.villageId)} ward · received {relativeTime(r.receivedAt)}
          </p>
        </div>
        {/* Action bar: invalid actions stay visible but disabled, with a reason */}
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Report actions">
          <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setDialog('assign')} disabled={!can('assign')} title={hint('assign')}>
            {r.assignedOfficerId ? 'Reassign' : 'Assign officer'}
          </Button>
          <Button variant="secondary" icon={<PlayCircle className="h-4 w-4" />} onClick={() => setDialog('start_review')} disabled={!can('start_review')} title={hint('start_review')}>
            Start review
          </Button>
          <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDialog('verify')} disabled={!can('verify')} title={hint('verify')}>
            Verify
          </Button>
          <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setDialog('reject')} disabled={!can('reject')} title={hint('reject')}>
            Reject
          </Button>
          <Dropdown
            label="More actions"
            trigger={({ toggle, open }) => (
              <Button variant="secondary" onClick={toggle} aria-expanded={open} icon={<MoreHorizontal className="h-4 w-4" />}>
                More
              </Button>
            )}
          >
            {(close) => (
              <div className="py-1">
                <MenuItem icon={<ChevronsUp className="h-4 w-4" />} disabled={!can('escalate')} onClick={() => { close(); setDialog('escalate'); }}>
                  Escalate
                </MenuItem>
                <MenuItem icon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => { close(); setDialog('remark'); }}>
                  Add remarks
                </MenuItem>
                <MenuItem icon={<Send className="h-4 w-4" />} onClick={() => { close(); setDialog('sms'); }}>
                  Send SMS
                </MenuItem>
                <MenuItem icon={<SlidersHorizontal className="h-4 w-4" />} disabled={!can('set_priority')} onClick={() => { close(); setDialog('priority'); }}>
                  Change priority
                </MenuItem>
                <div className="my-1 border-t border-slate-100" />
                <MenuItem icon={<Archive className="h-4 w-4" />} disabled={!can('close')} onClick={() => { close(); setDialog('close'); }}>
                  Close report
                </MenuItem>
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader title="Verification workflow" description="Suspected report → health officer review → verification or rejection" />
        <CardBody>
          <WorkflowStepper report={r} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Report information" />
            <CardBody className="py-1">
              <dl className="divide-y divide-slate-100">
                <Detail label="Report ID"><span className="font-mono">{r.id}</span></Detail>
                <Detail label="Reporter">{r.reporterName}</Detail>
                <Detail label="Age">{r.age} years</Detail>
                <Detail label="Phone">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-mono">{phone ? formatPhone(phone) : r.phone.startsWith('+') ? formatPhone(r.phone) : r.phone}</span>
                    {masked && !phone && (
                      <button type="button" onClick={reveal} disabled={revealing} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                        <Eye className="h-3.5 w-3.5" /> {revealing ? 'Revealing…' : 'Reveal'}
                      </button>
                    )}
                    {phone && (
                      <button type="button" onClick={() => setPhone(null)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:underline">
                        <EyeOff className="h-3.5 w-3.5" /> Hide
                      </button>
                    )}
                  </span>
                </Detail>
                <Detail label="Location / village">
                  {ref.villageName(r.villageId)} <span className="font-normal text-ink-muted">· {ref.wardName(r.villageId)} ward</span>
                </Detail>
                <Detail label="Suspected disease">
                  {disease?.name} {disease && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{disease.category}</span>}
                </Detail>
                <Detail label="Date">{formatLongDate(r.receivedAt)}</Detail>
                <Detail label="Time">{formatTime(r.receivedAt)}</Detail>
                <Detail label="Report source">{r.source === 'simulator' ? 'Web reporting page' : 'SMS gateway'}</Detail>
                <Detail label="Status"><StatusBadge status={r.status} /></Detail>
                <Detail label="Priority">
                  <PriorityBadge priority={r.priority} />
                  <ul className="mt-2 space-y-0.5 text-xs font-normal text-ink-muted">
                    {r.priorityReasons.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </Detail>
                <Detail label="Health officer">{r.assignedOfficerId ? ref.officerName(r.assignedOfficerId) : <span className="text-ink-muted">Not assigned</span>}</Detail>
                <Detail label="Verification date">{r.decidedAt ? formatDate(r.decidedAt) : <span className="text-ink-muted">—</span>}</Detail>
                <Detail label="Verification time">{r.decidedAt ? formatTime(r.decidedAt) : <span className="text-ink-muted">—</span>}</Detail>
                <Detail label="Last updated">{formatDateTime(r.updatedAt)}</Detail>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Original SMS" description="Exactly as received from the resident" />
            <CardBody>
              <p className="break-all rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-emerald-300">{r.rawMessage}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Health officer remarks"
              actions={
                <Button size="sm" variant="secondary" icon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => setDialog('remark')}>
                  Add remarks
                </Button>
              }
            />
            {r.remarks.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No remarks yet." message="Remarks from follow-up visits and calls will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...r.remarks].reverse().map((m) => (
                  <li key={m.id} className="px-5 py-4">
                    <p className="text-sm text-ink">{m.text}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {ref.officerName(m.authorId)} · {formatDateTime(m.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              This is a <strong>suspected</strong> case reported by a community member. Verification records an officer's follow-up decision. It is not a clinical diagnosis.
            </p>
          </div>

          <Card>
            <CardHeader title="Activity history" description={`${r.history.length} events`} />
            <ol className="relative space-y-5 px-5 py-5">
              {[...r.history].reverse().map((e, i, arr) => (
                <li key={e.id} className="relative pl-6">
                  {i < arr.length - 1 && <span className="absolute left-[5px] top-4 h-[calc(100%+0.75rem)] w-px bg-slate-200" aria-hidden />}
                  <span className={cn('absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-white', EVENT_STYLE[e.type])} aria-hidden />
                  <p className="text-sm text-ink">{e.message}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {e.actorId ? ref.officerName(e.actorId) : 'System'} · {formatDateTime(e.at)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader
              title="SMS conversation"
              actions={
                <Button size="sm" variant="ghost" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setDialog('sms')}>
                  Send SMS
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              {sms.isLoading && <Skeleton className="h-16 w-full" />}
              {sms.error && <ErrorState error={sms.error} onRetry={() => sms.refetch()} />}
              {sms.data?.length === 0 && <p className="text-sm text-ink-muted">No SMS messages linked to this report.</p>}
              {[...(sms.data ?? [])]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((m) => (
                  <div key={m.id} className={cn('flex flex-col', m.direction === 'inbound' ? 'items-start' : 'items-end')}>
                    <div
                      className={cn(
                        'max-w-[90%] rounded-2xl px-3 py-2 text-sm',
                        m.direction === 'inbound' ? 'rounded-bl-md bg-slate-100 font-mono text-xs text-ink' : 'rounded-br-md bg-brand-600 text-white',
                      )}
                    >
                      {m.body}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
                      <span>{m.direction === 'inbound' ? 'Resident' : 'System'} · {formatDateTime(m.at)}</span>
                      {m.direction === 'outbound' && <SmsStatusBadge status={m.status} />}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>

      <ReportActionDialog kind={dialog} report={r} onClose={() => setDialog(null)} />
    </>
  );
}
