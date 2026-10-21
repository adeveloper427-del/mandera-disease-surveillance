import type { InboundResult, Report, SimulationStep, SmsMessage, SmsTemplateKey } from '@/types';
import { ApiError } from '@/services/apiClient';
import { toE164 } from '@/lib/format';
import { computePriority } from '@/lib/priority';
import { parseSms } from '@/lib/smsParser';
import { renderReply } from '@/lib/smsReplies';
import { uid } from '@/lib/utils';
import { db } from '../db';
import { route } from '../router';
import {
  activeOfficersForWard,
  audit,
  currentAlerts,
  diseaseOf,
  notify,
  now,
  paginate,
  raiseAlertNotifications,
  sendSms,
  toClientReport,
  villageOf,
} from '../helpers';

const parserContext = () => ({
  keyword: db().settings.smsKeyword,
  villages: db().villages,
  diseases: db().diseases,
});

/** Dry-run validation used by the SMS Validation demo page. */
route('POST', '/sms/validate', 'public', ({ body }) => parseSms(String(body.body ?? ''), parserContext()));

/**
 * Inbound SMS webhook. With a real gateway (e.g. Africa's Talking), the
 * provider POSTs here; the backend must verify the gateway signature and
 * rate-limit per phone number before processing.
 */
route('POST', '/sms/inbound', 'public', ({ body }): InboundResult => {
  const phone = toE164(String(body.from ?? ''));
  if (!phone) throw new ApiError(422, 'Enter a valid Kenyan phone number, e.g. 0712345678.');
  const text = String(body.body ?? '');
  if (text.length > 480) throw new ApiError(422, 'Message is too long.');
  const at = now();
  const steps: SimulationStep[] = [];

  const inbound: SmsMessage = {
    id: uid('sms'),
    direction: 'inbound',
    phone,
    body: text,
    at,
    status: 'processed',
    type: 'report',
    reportId: null,
    error: null,
  };
  db().sms.unshift(inbound);
  steps.push({ key: 'received', label: 'SMS received', status: 'done', detail: `From ${phone} via ${body.source === 'simulator' ? 'simulator' : 'SMS gateway'}.` });

  const parsed = parseSms(text, parserContext());
  if (!parsed.valid) {
    inbound.status = 'invalid';
    inbound.error = parsed.issues.map((i) => i.message).join(' ');
    steps.push({ key: 'validated', label: 'Validation', status: 'failed', detail: inbound.error });
    steps.push({ key: 'created', label: 'Report created', status: 'skipped', detail: 'No report is created for an invalid message.' });
    steps.push({ key: 'id_generated', label: 'Report ID generated', status: 'skipped', detail: '—' });
    steps.push({ key: 'notified', label: 'Health officers notified', status: 'skipped', detail: '—' });
    const reply = renderReply(parsed, db().templates);
    const out = sendSms(phone, reply.key, reply.body, null);
    steps.push({ key: 'replied', label: 'Error SMS sent', status: 'done', detail: `Template: ${reply.key}` });
    return { inbound, reply: out, parsed, report: null, steps };
  }
  steps.push({ key: 'validated', label: 'Validation', status: 'done', detail: 'Format, age, location and disease are valid.' });

  // Create the report.
  const disease = diseaseOf(parsed.diseaseId!)!;
  const village = villageOf(parsed.villageId!)!;
  const alertsBefore = currentAlerts();
  const windowStart = Date.now() - disease.alertWindowHours * 3_600_000;
  const recent =
    db().reports.filter(
      (r) =>
        r.diseaseId === disease.id &&
        r.villageId === village.id &&
        r.status !== 'rejected' &&
        new Date(r.receivedAt).getTime() >= windowStart,
    ).length + 1;
  const { priority, reasons } = computePriority({ disease, age: parsed.age!, recentSameVillageCount: recent });
  const settings = db().settings;
  const id = `${settings.reportIdPrefix}${String(db().nextReportNumber).padStart(3, '0')}`;
  db().nextReportNumber += 1;

  let assignedOfficerId: string | null = null;
  if (settings.autoAssign) {
    const candidates = activeOfficersForWard(village.wardId);
    const load = (uidv: string) =>
      db().reports.filter((r) => r.assignedOfficerId === uidv && ['pending', 'under_review'].includes(r.status)).length;
    assignedOfficerId = [...candidates].sort((a, b) => load(a.id) - load(b.id))[0]?.id ?? null;
  }

  const report: Report = {
    id,
    reporterName: parsed.fields.name,
    age: parsed.age!,
    phone,
    villageId: village.id,
    diseaseId: disease.id,
    rawMessage: text,
    receivedAt: at,
    source: body.source === 'simulator' ? 'simulator' : 'sms',
    status: 'pending',
    priority,
    priorityReasons: reasons,
    assignedOfficerId,
    remarks: [],
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    updatedAt: at,
    history: [
      {
        id: uid('e'),
        type: 'created',
        actorId: null,
        message: `Report received by SMS from ${village.name}. Priority set to ${priority}.`,
        at,
      },
    ],
  };
  if (assignedOfficerId) {
    const o = db().users.find((u) => u.id === assignedOfficerId)!;
    report.history.push({ id: uid('e'), type: 'assigned', actorId: null, message: `Auto-assigned to ${o.name}.`, at });
  }
  db().reports.push(report);
  inbound.reportId = id;
  audit(null, 'report.created', 'report', id, `Report ${id} created from inbound SMS.`);
  steps.push({ key: 'created', label: 'Report created', status: 'done', detail: `Suspected ${disease.name} in ${village.name}, priority ${priority.toUpperCase()}. Status: Pending.` });
  steps.push({ key: 'id_generated', label: 'Report ID generated', status: 'done', detail: id });

  // Notify officers.
  const high = priority === 'high' || priority === 'critical';
  notify(high ? 'high_priority' : 'new_report', {
    wardId: village.wardId,
    title: high ? `${priority === 'critical' ? 'Critical' : 'High'}-priority report ${id}` : `New report ${id}`,
    message: `Suspected ${disease.name} reported from ${village.name}.`,
    link: `/app/reports/${id}`,
  });
  if (assignedOfficerId)
    notify('assigned', {
      assignedId: assignedOfficerId,
      title: `Report ${id} assigned to you`,
      message: `Suspected ${disease.name} in ${village.name} needs review.`,
      link: `/app/reports/${id}`,
    });
  raiseAlertNotifications(alertsBefore);
  steps.push({ key: 'notified', label: 'Health officers notified', status: 'done', detail: `Officers covering ${village.name} received a ${high ? 'high-priority' : 'new report'} notification.` });

  const reply = renderReply(parsed, db().templates, { reportId: id, disease: disease.name, location: village.name });
  const out = sendSms(phone, reply.key, reply.body, id);
  report.history.push({ id: uid('e'), type: 'sms_sent', actorId: null, message: 'Confirmation SMS sent to resident.', at });
  steps.push({ key: 'replied', label: 'Confirmation SMS sent', status: 'done', detail: `Template: ${reply.key}` });

  return { inbound, reply: out, parsed, report: toClientReport(report), steps };
});

route('GET', '/sms/conversation', 'public', ({ query }) => {
  const phone = toE164(String(query.phone ?? ''));
  const ids = String(query.reports ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if (!phone || !ids.length) return [];
  return db()
    .sms.filter((m) => m.direction === 'outbound' && m.phone === phone && m.reportId && ids.includes(m.reportId) && (!query.since || m.at > query.since))
    .sort((a, b) => a.at.localeCompare(b.at));
});

route('GET', '/sms', 'admin', ({ query }) => {
  let list = db().sms;
  if (query.direction) list = list.filter((m) => m.direction === query.direction);
  if (query.status) list = list.filter((m) => m.status === query.status);
  if (query.type) list = list.filter((m) => m.type === query.type);
  if (query.search) {
    const s = query.search.toLowerCase();
    const digits = /^[\d\s+()-]+$/.test(s) ? s.replace(/\D/g, '') : '';
    list = list.filter(
      (m) =>
        m.body.toLowerCase().includes(s) ||
        (m.reportId ?? '').toLowerCase().includes(s) ||
        (digits.length >= 3 && m.phone.replace(/\D/g, '').includes(digits.replace(/^0/, ''))),
    );
  }
  return paginate(list, query);
});

route('POST', '/sms/:id/retry', 'admin', ({ params, user }) => {
  const m = db().sms.find((x) => x.id === params.id);
  if (!m || m.direction !== 'outbound') throw new ApiError(404, 'Outbound message not found.');
  if (m.status !== 'failed') throw new ApiError(409, 'Only failed messages can be retried.');
  m.status = 'sent';
  m.error = null;
  m.at = now();
  setTimeout(() => {
    m.status = 'delivered';
  }, 3000);
  audit(user, 'sms.sent', 'sms', m.reportId, `Retried failed SMS to ${m.phone}.`);
  return m;
});

route('GET', '/sms/templates', 'public', () => db().templates);

route('PUT', '/sms/templates/:key', 'admin', ({ params, body, user }) => {
  const t = db().templates.find((x) => x.key === (params.key as SmsTemplateKey));
  if (!t) throw new ApiError(404, 'Template not found.');
  const text = String(body.body ?? '').trim();
  if (!text) throw new ApiError(422, 'Template text cannot be empty.');
  if (text.length > 459) throw new ApiError(422, 'Template is too long (maximum 3 SMS segments).');
  t.body = text;
  if (typeof body.active === 'boolean') t.active = body.active;
  t.updatedAt = now();
  audit(user, 'template.updated', 'template', t.key, `Updated SMS template "${t.name}".`);
  return t;
});
