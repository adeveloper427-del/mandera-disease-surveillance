import type {
  Alert,
  AppNotification,
  AuditLog,
  NotificationType,
  Report,
  SmsMessage,
  SmsTemplateKey,
  User,
} from '@/types';
import { ApiError } from '@/services/apiClient';
import { detectAlerts, isOpenAlert } from '@/lib/hotspot';
import { maskPhone } from '@/lib/format';
import { renderTemplate } from '@/lib/smsParser';
import { uid } from '@/lib/utils';
import { db, persist } from './db';

export const now = () => new Date().toISOString();

export function audit(
  actor: User | null,
  action: AuditLog['action'],
  entityType: AuditLog['entityType'],
  entityId: string | null,
  details: string,
) {
  db().auditLogs.unshift({
    id: uid('a'),
    at: now(),
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? 'System',
    action,
    entityType,
    entityId,
    details,
  });
}

export function findReport(id: string): Report {
  const r = db().reports.find((x) => x.id.toLowerCase() === id.toLowerCase());
  if (!r) throw new ApiError(404, `Report ${id} was not found.`);
  return r;
}

export const villageOf = (id: string) => db().villages.find((v) => v.id === id);
export const diseaseOf = (id: string) => db().diseases.find((d) => d.id === id);
export const userOf = (id: string | null) => (id ? db().users.find((u) => u.id === id) : undefined);
export const wardOfVillage = (villageId: string) => villageOf(villageId)?.wardId ?? '';

/** Phone numbers are masked in API responses unless explicitly revealed. */
export function toClientReport(r: Report): Report {
  return db().settings.maskPhoneNumbers ? { ...r, phone: maskPhone(r.phone) } : r;
}

export function activeOfficersForWard(wardId: string) {
  const officers = db().users.filter((u) => u.role === 'officer' && u.status === 'active');
  const covering = officers.filter((u) => u.wardIds.length === 0 || u.wardIds.includes(wardId));
  return covering.length ? covering : officers;
}

/** Who should receive a notification of this type, according to admin rules. */
export function recipientsFor(type: NotificationType, opts: { wardId?: string; assignedId?: string | null }) {
  const rule = db().notificationRules.find((r) => r.type === type);
  if (!rule || !rule.inApp) return { users: [] as User[], rule };
  const users = db().users.filter((u) => u.status === 'active');
  let list: User[];
  switch (rule.recipients) {
    case 'all_officers':
      list = users.filter((u) => u.role === 'officer' || u.role === 'admin');
      break;
    case 'ward_officers':
      list = opts.wardId ? activeOfficersForWard(opts.wardId) : users.filter((u) => u.role === 'officer');
      break;
    case 'assigned_officer':
      list = users.filter((u) => u.id === opts.assignedId);
      break;
    case 'admins':
      list = users.filter((u) => u.role === 'admin');
      break;
  }
  return { users: list, rule };
}

export function notify(
  type: NotificationType,
  opts: { wardId?: string; assignedId?: string | null; title: string; message: string; link: string | null },
) {
  const { users } = recipientsFor(type, opts);
  for (const u of users) {
    const n: AppNotification = {
      id: uid('n'),
      userId: u.id,
      type,
      title: opts.title,
      message: opts.message,
      link: opts.link,
      read: false,
      createdAt: now(),
    };
    db().notifications.unshift(n);
  }
}

export function sendSms(
  phone: string,
  type: SmsTemplateKey | 'custom',
  body: string,
  reportId: string | null,
): SmsMessage {
  const msg: SmsMessage = {
    id: uid('sms'),
    direction: 'outbound',
    phone,
    body,
    at: now(),
    status: 'sent',
    type,
    reportId,
    error: null,
  };
  db().sms.unshift(msg);
  // Simulate the gateway's delivery receipt arriving a few seconds later.
  setTimeout(() => {
    const m = db().sms.find((x) => x.id === msg.id);
    if (m && m.status === 'sent') {
      m.status = 'delivered';
      persist();
    }
  }, 4000);
  return msg;
}

export function templateBody(key: SmsTemplateKey, vars: Record<string, string | number>) {
  const t = db().templates.find((x) => x.key === key);
  if (!t || !t.active) return null;
  return renderTemplate(t.body, vars);
}

export function currentAlerts(): Alert[] {
  return detectAlerts(db().reports, db().diseases, db().alertStates);
}

/**
 * Called after a report is created: raises notifications (and officer SMS)
 * for alerts that are new or have escalated from hotspot to outbreak.
 */
export function raiseAlertNotifications(before: Alert[]) {
  const after = currentAlerts().filter(isOpenAlert);
  for (const a of after) {
    const prev = before.find((b) => b.id === a.id);
    if (prev && prev.level === a.level) continue;
    const disease = diseaseOf(a.diseaseId)?.name ?? 'Unknown';
    const village = villageOf(a.villageId)?.name ?? 'Unknown';
    const type: NotificationType = a.level === 'outbreak' ? 'outbreak_alert' : 'hotspot';
    notify(type, {
      wardId: wardOfVillage(a.villageId),
      title: a.level === 'outbreak' ? `Potential outbreak alert: ${disease} in ${village}` : `Potential hotspot: ${disease} in ${village}`,
      message: `${a.count} suspected ${disease} reports received from ${village} within the last ${a.windowHours} hours. Requires verification.`,
      link: '/app/alerts',
    });
    const rule = db().notificationRules.find((r) => r.type === type);
    if (rule?.sms && a.level === 'outbreak') {
      const body = templateBody('alert_notification', { count: a.count, disease, location: village, hours: a.windowHours });
      if (body) for (const o of activeOfficersForWard(wardOfVillage(a.villageId))) sendSms(o.phone, 'alert_notification', body, null);
    }
  }
}

export function paginate<T>(items: T[], query: Record<string, string>) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 10000);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), pages);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export function requireFields(body: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  if (missing.length) throw new ApiError(422, `Missing required field(s): ${missing.join(', ')}.`, { missing });
}
