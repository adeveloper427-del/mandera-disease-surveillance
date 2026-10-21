import { useEffect, useState } from 'react';
import type { Priority, Report, ReportAction, SmsTemplateKey } from '@/types';
import { useRefData, useReportAction, useSendReportSms, useTemplates } from '@/hooks/queries';
import { renderTemplate, smsSegments } from '@/lib/smsParser';
import { errorMessage } from '@/services/apiClient';
import { PRIORITY } from '@/config/status';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/forms';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';

export type DialogKind = 'assign' | 'start_review' | 'verify' | 'reject' | 'escalate' | 'close' | 'remark' | 'sms' | 'priority';

const CONFIG: Record<DialogKind, { title: string; description: string; confirm: string; tone: 'primary' | 'success' | 'danger'; remark?: 'optional' | 'required'; remarkLabel?: string; notify?: SmsTemplateKey }> = {
  assign: { title: 'Assign health officer', description: 'The officer will be notified and the report will appear in their queue.', confirm: 'Assign officer', tone: 'primary' },
  start_review: { title: 'Start review', description: 'Move this report to Under Review. If no officer is assigned, it will be assigned to you.', confirm: 'Start review', tone: 'primary' },
  verify: {
    title: 'Verify report',
    description: 'Confirm that follow-up supports this suspected case. This records an officer decision. It is not a medical diagnosis.',
    confirm: 'Verify report',
    tone: 'success',
    remark: 'optional',
    remarkLabel: 'Verification remarks',
    notify: 'report_verified',
  },
  reject: {
    title: 'Reject report',
    description: 'Use this when follow-up does not support the suspected case, or the report is a duplicate or cannot be confirmed.',
    confirm: 'Reject report',
    tone: 'danger',
    remark: 'required',
    remarkLabel: 'Reason for rejection',
    notify: 'report_rejected',
  },
  escalate: {
    title: 'Escalate report',
    description: 'Refer this report to the county disease surveillance team for urgent action. Priority will be raised to at least High.',
    confirm: 'Escalate',
    tone: 'danger',
    remark: 'required',
    remarkLabel: 'Reason for escalation',
  },
  close: { title: 'Close report', description: 'Close the report once follow-up is complete. It stays in history and reports.', confirm: 'Close report', tone: 'primary', remark: 'optional', remarkLabel: 'Closing note' },
  remark: { title: 'Add remarks', description: 'Remarks are visible to all health officers and kept in the report history.', confirm: 'Save remark', tone: 'primary', remark: 'required', remarkLabel: 'Remark' },
  sms: { title: 'Send SMS to resident', description: 'The message is sent to the phone number that submitted the report.', confirm: 'Send SMS', tone: 'primary' },
  priority: { title: 'Change priority', description: 'Override the automatically assigned priority. Give a reason for the audit trail.', confirm: 'Update priority', tone: 'primary', remark: 'required', remarkLabel: 'Reason' },
};

export function ReportActionDialog({ kind, report, onClose }: { kind: DialogKind | null; report: Report; onClose: () => void }) {
  const ref = useRefData();
  const templates = useTemplates();
  const action = useReportAction(report.id);
  const sendSms = useSendReportSms(report.id);
  const toast = useToast();

  const [remark, setRemark] = useState('');
  const [officerId, setOfficerId] = useState('');
  const [notify, setNotify] = useState(true);
  const [priority, setPriority] = useState<Priority>(report.priority);
  const [smsTemplate, setSmsTemplate] = useState<'custom' | SmsTemplateKey>('custom');
  const [smsText, setSmsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;
    setRemark('');
    setOfficerId(report.assignedOfficerId ?? '');
    setNotify(true);
    setPriority(report.priority);
    setSmsTemplate('custom');
    setSmsText('');
    setError(null);
  }, [kind, report.assignedOfficerId, report.priority]);

  if (!kind) return null;
  const cfg = CONFIG[kind];
  const pending = action.isPending || sendSms.isPending;
  const tpl = (key: SmsTemplateKey) => templates.data?.find((t) => t.key === key);
  const preview = cfg.notify ? renderTemplate(tpl(cfg.notify)?.body ?? '', { reportId: report.id, name: report.reporterName }) : '';

  const submit = async () => {
    setError(null);
    if (cfg.remark === 'required' && !remark.trim()) {
      setError(`${cfg.remarkLabel} is required.`);
      return;
    }
    try {
      if (kind === 'sms') {
        if (!smsText.trim()) {
          setError('Write a message to send.');
          return;
        }
        await sendSms.mutateAsync({ message: smsText.trim() });
        toast.success('SMS sent', `Message queued for delivery to the reporter of ${report.id}.`);
      } else {
        let payload: ReportAction;
        switch (kind) {
          case 'assign':
            if (!officerId) {
              setError('Choose a health officer.');
              return;
            }
            payload = { type: 'assign', officerId };
            break;
          case 'start_review':
            payload = { type: 'start_review' };
            break;
          case 'verify':
            payload = { type: 'verify', remark, notifyResident: notify };
            break;
          case 'reject':
            payload = { type: 'reject', remark, notifyResident: notify };
            break;
          case 'escalate':
            payload = { type: 'escalate', remark };
            break;
          case 'close':
            payload = { type: 'close', remark };
            break;
          case 'priority':
            payload = { type: 'set_priority', priority, reason: remark };
            break;
          default:
            payload = { type: 'remark', text: remark };
        }
        await action.mutateAsync(payload);
        const msgs: Partial<Record<DialogKind, string>> = {
          assign: `Report ${report.id} assigned to ${ref.officerName(officerId)}.`,
          start_review: `Report ${report.id} is now under review.`,
          verify: `Report ${report.id} verified${notify ? ' and the resident has been notified by SMS' : ''}.`,
          reject: `Report ${report.id} rejected${notify ? ' and the resident has been notified by SMS' : ''}.`,
          escalate: `Report ${report.id} escalated to the county team.`,
          close: `Report ${report.id} closed.`,
          remark: 'Remark added to the report history.',
          priority: `Priority updated to ${PRIORITY[priority].label}.`,
        };
        toast.success('Done', msgs[kind]);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${cfg.title} · ${report.id}`}
      description={cfg.description}
      size={kind === 'assign' || kind === 'sms' ? 'lg' : 'md'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={cfg.tone} onClick={submit} loading={pending}>
            {cfg.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}

        {kind === 'assign' && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Health officer</legend>
            <div className="space-y-2">
              {ref.officers
                .filter((o) => o.user.status === 'active')
                .map((o) => {
                  const covers = o.user.wardIds.length === 0 || o.user.wardIds.includes(ref.villages.find((v) => v.id === report.villageId)?.wardId ?? '');
                  return (
                    <label
                      key={o.user.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 ring-1 ring-inset transition ${officerId === o.user.id ? 'bg-brand-50 ring-brand-400' : 'ring-slate-200 hover:bg-slate-50'}`}
                    >
                      <input
                        type="radio"
                        name="officer"
                        value={o.user.id}
                        checked={officerId === o.user.id}
                        onChange={() => setOfficerId(o.user.id)}
                        className="h-4 w-4 text-brand-600 focus:ring-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">
                          {o.user.name}
                          {covers && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Covers this ward</span>}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {o.user.title} · {o.user.wardIds.map((w) => ref.wardById(w)).join(', ') || 'All wards'}
                        </span>
                      </span>
                      <span className="text-right text-xs text-ink-muted">
                        <span className="block font-semibold text-ink">{o.open}</span>open
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>
        )}

        {kind === 'priority' && (
          <Field label="New priority">
            {(id) => (
              <Select id={id} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}: {PRIORITY[p].description}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {cfg.remark && (
          <Field label={cfg.remarkLabel!} required={cfg.remark === 'required'} hint={`${remark.length}/500 characters`}>
            {(id, d) => (
              <Textarea
                id={id}
                aria-describedby={d}
                value={remark}
                maxLength={500}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={kind === 'reject' ? 'e.g. Follow-up call: symptoms do not match the case definition.' : 'Add details of the follow-up…'}
              />
            )}
          </Field>
        )}

        {cfg.notify && (
          <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
            <Checkbox checked={notify} onChange={setNotify} label={<span className="font-medium">Send SMS to resident</span>} />
            {notify && (
              <div className="mt-3">
                <p className="text-xs text-ink-muted">Preview (template “{tpl(cfg.notify)?.name}”):</p>
                <p className="mt-1 rounded-lg bg-white p-3 text-sm text-ink ring-1 ring-slate-200">{preview || 'Template unavailable.'}</p>
              </div>
            )}
          </div>
        )}

        {kind === 'sms' && (
          <>
            <Field label="Template">
              {(id) => (
                <Select
                  id={id}
                  value={smsTemplate}
                  onChange={(e) => {
                    const v = e.target.value as typeof smsTemplate;
                    setSmsTemplate(v);
                    if (v !== 'custom') setSmsText(renderTemplate(tpl(v)?.body ?? '', { reportId: report.id, name: report.reporterName }));
                  }}
                >
                  <option value="custom">Custom message</option>
                  <option value="report_received">Successful report</option>
                  <option value="report_verified">Verified report</option>
                  <option value="report_rejected">Rejected report</option>
                </Select>
              )}
            </Field>
            <Field label="Message" required hint={`${smsText.length} characters · ${smsSegments(smsText)} SMS segment(s)`}>
              {(id, d) => (
                <Textarea
                  id={id}
                  aria-describedby={d}
                  value={smsText}
                  maxLength={459}
                  rows={5}
                  onChange={(e) => {
                    setSmsText(e.target.value);
                    setSmsTemplate('custom');
                  }}
                  placeholder="e.g. A community health volunteer will visit you today. Please keep the patient hydrated."
                />
              )}
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
