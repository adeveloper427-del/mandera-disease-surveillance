import type { OfficerSummary, Report, ReportAction, ReportStatus } from '@/types';
import { ApiError } from '@/services/apiClient';
import { priorityRank } from '@/lib/priority';
import { canPerform, ACTION_HINT } from '@/lib/workflow';
import { uid } from '@/lib/utils';
import { db } from '../db';
import { publicUser, route } from '../router';
import {
  audit,
  diseaseOf,
  findReport,
  notify,
  now,
  paginate,
  sendSms,
  templateBody,
  toClientReport,
  userOf,
  villageOf,
  wardOfVillage,
} from '../helpers';

export const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  escalated: 'Escalated',
  closed: 'Closed',
};

export function filterReports(q: Record<string, string>): Report[] {
  let list = db().reports;
  if (q.search) {
    const s = q.search.trim().toLowerCase();
    // Only treat the term as a phone search when it looks like a number (so "MS001" doesn't match phones).
    const digits = /^[\d\s+()-]+$/.test(s) ? s.replace(/\D/g, '') : '';
    list = list.filter((r) => {
      const v = villageOf(r.villageId)?.name.toLowerCase() ?? '';
      const d = diseaseOf(r.diseaseId)?.name.toLowerCase() ?? '';
      const phoneDigits = r.phone.replace(/\D/g, '');
      const localPhone = phoneDigits.startsWith('254') ? `0${phoneDigits.slice(3)}` : phoneDigits;
      return (
        r.id.toLowerCase().includes(s) ||
        r.reporterName.toLowerCase().includes(s) ||
        v.includes(s) ||
        d.includes(s) ||
        (digits.length >= 3 && (phoneDigits.includes(digits) || localPhone.includes(digits)))
      );
    });
  }
  if (q.diseaseId) list = list.filter((r) => r.diseaseId === q.diseaseId);
  if (q.villageId) list = list.filter((r) => r.villageId === q.villageId);
  if (q.wardId) list = list.filter((r) => wardOfVillage(r.villageId) === q.wardId);
  if (q.status) list = list.filter((r) => r.status === q.status);
  if (q.outcome) list = list.filter((r) => r.outcome === q.outcome);
  if (q.priority) list = list.filter((r) => r.priority === q.priority);
  if (q.assignedTo === 'unassigned') list = list.filter((r) => !r.assignedOfficerId);
  else if (q.assignedTo) list = list.filter((r) => r.assignedOfficerId === q.assignedTo);
  if (q.dateFrom) {
    const from = new Date(`${q.dateFrom}T00:00:00`).getTime();
    list = list.filter((r) => new Date(r.receivedAt).getTime() >= from);
  }
  if (q.dateTo) {
    const to = new Date(`${q.dateTo}T23:59:59.999`).getTime();
    list = list.filter((r) => new Date(r.receivedAt).getTime() <= to);
  }
  const dir = q.sortDir === 'asc' ? 1 : -1;
  const statusOrder: ReportStatus[] = ['pending', 'escalated', 'under_review', 'verified', 'rejected', 'closed'];
  const sorted = [...list].sort((a, b) => {
    switch (q.sortBy) {
      case 'priority':
        return (priorityRank(a.priority) - priorityRank(b.priority)) * dir || b.receivedAt.localeCompare(a.receivedAt);
      case 'id':
        return a.id.localeCompare(b.id, undefined, { numeric: true }) * dir;
      case 'status':
        return (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)) * dir;
      default:
        return a.receivedAt.localeCompare(b.receivedAt) * dir;
    }
  });
  return sorted;
}

route('GET', '/reports', 'user', ({ query }) => {
  const page = paginate(filterReports(query), query);
  return { ...page, items: page.items.map(toClientReport) };
});

route('GET', '/reports/:id', 'user', ({ params }) => toClientReport(findReport(params.id)));

route('POST', '/reports/:id/view', 'user', ({ params, user }) => {
  const r = findReport(params.id);
  audit(user, 'report.viewed', 'report', r.id, `${user!.name} viewed ${r.id}.`);
  return { ok: true };
});

route('POST', '/reports/:id/reveal-phone', 'user', ({ params, user }) => {
  const r = findReport(params.id);
  audit(user, 'report.phone_revealed', 'report', r.id, `${user!.name} revealed the reporter phone number on ${r.id}.`);
  return { phone: r.phone };
});

route('GET', '/reports/:id/sms', 'user', ({ params }) => {
  const r = findReport(params.id);
  return db().sms.filter((m) => m.reportId === r.id);
});

route('POST', '/reports/:id/actions', 'user', ({ params, body, user }) => {
  const r = findReport(params.id);
  const action = body as ReportAction;
  if (!canPerform(action.type, r.status)) throw new ApiError(409, ACTION_HINT[action.type] || 'Action not allowed.');
  const actor = user!;
  const at = now();
  const event = (type: Report['history'][number]['type'], message: string) =>
    r.history.push({ id: uid('e'), type, actorId: actor.id, message, at });
  const addRemark = (text: string) => {
    r.remarks.push({ id: uid('r'), authorId: actor.id, text, createdAt: at });
    event('remark', `Remark added: "${text}"`);
  };
  const setStatus = (to: ReportStatus, verb: string) => {
    const from = r.status;
    r.status = to;
    event('status_changed', verb || `Status changed from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}.`);
  };
  const disease = diseaseOf(r.diseaseId)?.name ?? '';
  const village = villageOf(r.villageId)?.name ?? '';
  const residentSms = (key: 'report_verified' | 'report_rejected') => {
    const text = templateBody(key, { reportId: r.id, name: r.reporterName });
    if (!text) return;
    sendSms(r.phone, key, text, r.id);
    event('sms_sent', `${key === 'report_verified' ? 'Verification' : 'Rejection'} SMS sent to resident.`);
    audit(actor, 'sms.sent', 'sms', r.id, `SMS "${key}" sent to reporter of ${r.id}.`);
  };

  switch (action.type) {
    case 'assign': {
      const officer = userOf(action.officerId);
      if (!officer || officer.status !== 'active') throw new ApiError(422, 'Select an active health officer.');
      r.assignedOfficerId = officer.id;
      event('assigned', `Assigned to ${officer.name}.`);
      audit(actor, 'report.assigned', 'report', r.id, `${actor.name} assigned ${r.id} to ${officer.name}.`);
      if (officer.id !== actor.id)
        notify('assigned', {
          assignedId: officer.id,
          title: `Report ${r.id} assigned to you`,
          message: `Suspected ${disease} in ${village} needs review.`,
          link: `/app/reports/${r.id}`,
        });
      break;
    }
    case 'start_review':
      if (!r.assignedOfficerId) {
        r.assignedOfficerId = actor.id;
        event('assigned', `Assigned to ${actor.name}.`);
      }
      setStatus('under_review', '');
      audit(actor, 'report.status_changed', 'report', r.id, `${actor.name} started reviewing ${r.id}.`);
      break;
    case 'verify':
      if (action.remark?.trim()) addRemark(action.remark.trim());
      setStatus('verified', 'Report verified.');
      r.outcome = 'verified';
      r.decidedAt = at;
      r.decidedBy = actor.id;
      audit(actor, 'report.verified', 'report', r.id, `Officer ${actor.name.split(' ')[0]} verified ${r.id}.`);
      if (action.notifyResident) residentSms('report_verified');
      break;
    case 'reject':
      if (!action.remark?.trim()) throw new ApiError(422, 'A reason is required when rejecting a report.');
      addRemark(action.remark.trim());
      setStatus('rejected', 'Report rejected.');
      r.outcome = 'rejected';
      r.decidedAt = at;
      r.decidedBy = actor.id;
      audit(actor, 'report.rejected', 'report', r.id, `Officer ${actor.name.split(' ')[0]} rejected ${r.id}.`);
      if (action.notifyResident) residentSms('report_rejected');
      break;
    case 'escalate':
      if (!action.remark?.trim()) throw new ApiError(422, 'Explain why the report is being escalated.');
      addRemark(action.remark.trim());
      setStatus('escalated', 'Report escalated.');
      if (r.priority !== 'critical' && r.priority !== 'high') {
        r.priority = 'high';
        event('priority_changed', 'Priority raised to high on escalation.');
      }
      audit(actor, 'report.escalated', 'report', r.id, `Officer ${actor.name.split(' ')[0]} escalated ${r.id}.`);
      break;
    case 'close':
      if (action.remark?.trim()) addRemark(action.remark.trim());
      setStatus('closed', 'Report closed.');
      audit(actor, 'report.status_changed', 'report', r.id, `${actor.name} closed ${r.id}.`);
      break;
    case 'remark':
      if (!action.text?.trim()) throw new ApiError(422, 'Remark cannot be empty.');
      addRemark(action.text.trim());
      audit(actor, 'report.remark', 'report', r.id, `${actor.name} added a remark to ${r.id}.`);
      break;
    case 'set_priority':
      r.priority = action.priority;
      event('priority_changed', `Priority changed to ${action.priority}: ${action.reason}`);
      audit(actor, 'report.status_changed', 'report', r.id, `${actor.name} set priority of ${r.id} to ${action.priority}.`);
      break;
  }
  r.updatedAt = at;
  return toClientReport(r);
});

route('POST', '/reports/:id/sms', 'user', ({ params, body, user }) => {
  const r = findReport(params.id);
  const text = String(body.message ?? '').trim();
  if (!text) throw new ApiError(422, 'Message cannot be empty.');
  if (text.length > 459) throw new ApiError(422, 'Message is too long (maximum 3 SMS segments).');
  const msg = sendSms(r.phone, body.templateKey ?? 'custom', text, r.id);
  r.history.push({ id: uid('e'), type: 'sms_sent', actorId: user!.id, message: `SMS sent to resident: "${text}"`, at: now() });
  r.updatedAt = now();
  audit(user, 'sms.sent', 'sms', r.id, `${user!.name} sent an SMS to the reporter of ${r.id}.`);
  return msg;
});

route('GET', '/officers', 'user', () => {
  const officers = db().users.filter((u) => u.role === 'officer' && u.status !== 'pending');
  return officers.map<OfficerSummary>((o) => {
    const mine = db().reports.filter((r) => r.assignedOfficerId === o.id);
    const decided = mine.filter((r) => r.decidedAt && r.decidedBy === o.id);
    const hours = decided.map((r) => (new Date(r.decidedAt!).getTime() - new Date(r.receivedAt).getTime()) / 3_600_000);
    return {
      user: publicUser(o),
      open: mine.filter((r) => ['pending', 'under_review', 'escalated'].includes(r.status)).length,
      pending: mine.filter((r) => r.status === 'pending').length,
      underReview: mine.filter((r) => r.status === 'under_review').length,
      decided: decided.length,
      avgDecisionHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    };
  });
});

