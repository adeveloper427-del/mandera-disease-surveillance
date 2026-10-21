import type {
  AdminSummary,
  AlertStatus,
  CountRow,
  DashboardSummary,
  DiseaseMatrixRow,
  ExportResult,
  GeneratedReportParams,
  PerformanceStats,
  Report,
  ReportStatus,
  TimeBucket,
} from '@/types';
import { ApiError } from '@/services/apiClient';
import { formatDate, formatDateTime, formatMonth, formatShortDay, maskPhone, startOfDay, startOfWeek, toDateKey } from '@/lib/format';
import { isOpenAlert } from '@/lib/hotspot';
import { priorityRank } from '@/lib/priority';
import { uid } from '@/lib/utils';
import { db } from '../db';
import { route } from '../router';
import { audit, currentAlerts, diseaseOf, now, toClientReport, userOf, villageOf, wardOfVillage } from '../helpers';
import { filterReports, STATUS_LABEL } from './reports';

// ---------- Alerts ----------
route('GET', '/alerts', 'user', () => currentAlerts());

route('PATCH', '/alerts/:id', 'user', ({ params, body, user }) => {
  const alert = currentAlerts().find((a) => a.id === params.id);
  if (!alert) throw new ApiError(404, 'This alert is no longer active.');
  const status = body.status as AlertStatus;
  if (!['new', 'acknowledged', 'investigating', 'dismissed', 'resolved'].includes(status)) throw new ApiError(422, 'Invalid alert status.');
  if ((status === 'dismissed' || status === 'resolved') && !String(body.note ?? '').trim())
    throw new ApiError(422, 'Add a note explaining why the alert is being closed.');
  db().alertStates[alert.id] = {
    status,
    note: String(body.note ?? '').trim() || alert.note,
    updatedBy: user!.id,
    updatedAt: now(),
  };
  const disease = diseaseOf(alert.diseaseId)?.name;
  const village = villageOf(alert.villageId)?.name;
  audit(user, 'alert.updated', 'alert', alert.id, `${user!.name} marked the ${disease} alert in ${village} as ${status}.`);
  return currentAlerts().find((a) => a.id === alert.id);
});

// ---------- Notifications ----------
route('GET', '/notifications', 'user', ({ user }) => {
  const mine = db().notifications.filter((n) => n.userId === user!.id);
  return { items: mine.slice(0, 100), unread: mine.filter((n) => !n.read).length };
});

route('POST', '/notifications/:id/read', 'user', ({ params, user }) => {
  const n = db().notifications.find((x) => x.id === params.id && x.userId === user!.id);
  if (n) n.read = true;
  return { ok: true };
});

route('POST', '/notifications/read-all', 'user', ({ user }) => {
  db().notifications.forEach((n) => {
    if (n.userId === user!.id) n.read = true;
  });
  return { ok: true };
});

// ---------- Analytics ----------
const H = 3_600_000;
const time = (iso: string) => new Date(iso).getTime();

function scoped(q: Record<string, string>): Report[] {
  let list = db().reports;
  if (q.diseaseId) list = list.filter((r) => r.diseaseId === q.diseaseId);
  if (q.villageId) list = list.filter((r) => r.villageId === q.villageId);
  if (q.wardId) list = list.filter((r) => wardOfVillage(r.villageId) === q.wardId);
  if (q.days) {
    const since = Date.now() - Number(q.days) * 24 * H;
    list = list.filter((r) => time(r.receivedAt) >= since);
  }
  return list;
}

route('GET', '/analytics/summary', 'user', (): DashboardSummary => {
  const reports = db().reports;
  const byStatus = { pending: 0, under_review: 0, verified: 0, rejected: 0, escalated: 0, closed: 0 } as Record<ReportStatus, number>;
  reports.forEach((r) => byStatus[r.status]++);
  const today = startOfDay().getTime();
  const week = startOfWeek().getTime();
  const lastWeek = week - 7 * 24 * H;
  const needsAttention = reports
    .filter((r) => ['pending', 'escalated', 'under_review'].includes(r.status) && priorityRank(r.priority) >= 2)
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 6)
    .map(toClientReport);
  return {
    total: reports.length,
    byStatus,
    today: reports.filter((r) => time(r.receivedAt) >= today).length,
    thisWeek: reports.filter((r) => time(r.receivedAt) >= week).length,
    lastWeek: reports.filter((r) => time(r.receivedAt) >= lastWeek && time(r.receivedAt) < week).length,
    activeAlerts: currentAlerts().filter(isOpenAlert).length,
    needsAttention,
  };
});

route('GET', '/analytics/timeseries', 'user', ({ query }): TimeBucket[] => {
  const granularity = query.granularity ?? 'daily';
  const list = scoped({ ...query, days: '' });
  const buckets: { start: number; end: number; label: string; date: string }[] = [];
  if (granularity === 'monthly') {
    const periods = Number(query.periods) || 6;
    const d = new Date();
    for (let i = periods - 1; i >= 0; i--) {
      const start = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
      buckets.push({ start: start.getTime(), end: end.getTime(), label: formatMonth(start), date: toDateKey(start) });
    }
  } else if (granularity === 'weekly') {
    const periods = Number(query.periods) || 12;
    const w = startOfWeek().getTime();
    for (let i = periods - 1; i >= 0; i--) {
      const start = w - i * 7 * 24 * H;
      buckets.push({ start, end: start + 7 * 24 * H, label: `Wk of ${formatShortDay(new Date(start))}`, date: toDateKey(new Date(start)) });
    }
  } else {
    const periods = Number(query.periods) || 30;
    const today = startOfDay();
    for (let i = periods - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      buckets.push({ start: start.getTime(), end: end.getTime(), label: formatShortDay(start), date: toDateKey(start) });
    }
  }
  return buckets.map((b) => {
    const inBucket = list.filter((r) => time(r.receivedAt) >= b.start && time(r.receivedAt) < b.end);
    return {
      label: b.label,
      date: b.date,
      total: inBucket.length,
      verified: inBucket.filter((r) => r.outcome === 'verified').length,
      rejected: inBucket.filter((r) => r.outcome === 'rejected').length,
    };
  });
});

function countBy(list: Report[], key: (r: Report) => string, name: (id: string) => string): CountRow[] {
  const map = new Map<string, CountRow>();
  for (const r of list) {
    const id = key(r);
    const row = map.get(id) ?? { id, name: name(id), total: 0, verified: 0, rejected: 0, pending: 0 };
    row.total++;
    if (r.outcome === 'verified') row.verified++;
    else if (r.outcome === 'rejected') row.rejected++;
    else row.pending++;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

route('GET', '/analytics/by-disease', 'user', ({ query }) =>
  countBy(scoped(query), (r) => r.diseaseId, (id) => diseaseOf(id)?.name ?? 'Unknown'),
);

route('GET', '/analytics/by-location', 'user', ({ query }) =>
  query.level === 'ward'
    ? countBy(scoped(query), (r) => wardOfVillage(r.villageId), (id) => db().wards.find((w) => w.id === id)?.name ?? 'Unknown')
    : countBy(scoped(query), (r) => r.villageId, (id) => villageOf(id)?.name ?? 'Unknown'),
);

/** Per-disease breakdown with per-village counts and the previous period for trend arrows. */
route('GET', '/analytics/matrix', 'user', ({ query }): DiseaseMatrixRow[] => {
  const days = Number(query.days) || 30;
  const nowMs = Date.now();
  const since = nowMs - days * 24 * H;
  const prevSince = since - days * 24 * H;
  const inWard = (r: Report) => !query.wardId || wardOfVillage(r.villageId) === query.wardId;
  const current = db().reports.filter((r) => time(r.receivedAt) >= since && inWard(r));
  const previous = db().reports.filter((r) => time(r.receivedAt) >= prevSince && time(r.receivedAt) < since && inWard(r));
  return db()
    .diseases.map((d) => {
      const list = current.filter((r) => r.diseaseId === d.id);
      const villages: Record<string, number> = {};
      list.forEach((r) => (villages[r.villageId] = (villages[r.villageId] ?? 0) + 1));
      return {
        diseaseId: d.id,
        total: list.length,
        verified: list.filter((r) => r.outcome === 'verified').length,
        rejected: list.filter((r) => r.outcome === 'rejected').length,
        pending: list.filter((r) => !r.outcome).length,
        prevTotal: previous.filter((r) => r.diseaseId === d.id).length,
        villages,
      };
    })
    .sort((a, b) => b.total - a.total);
});

route('GET', '/analytics/performance', 'user', ({ query }): PerformanceStats => {
  const list = scoped(query);
  const decided = list.filter((r) => r.decidedAt);
  const hours = decided.map((r) => (time(r.decidedAt!) - time(r.receivedAt)) / H);
  const verified = decided.filter((r) => r.outcome === 'verified').length;
  const groups: [string, number, number][] = [['Under 5', 0, 4], ['5–17', 5, 17], ['18–44', 18, 44], ['45–64', 45, 64], ['65+', 65, 200]];
  return {
    avgDecisionHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    verificationRate: decided.length ? verified / decided.length : 0,
    decided: decided.length,
    ageGroups: groups.map(([label, min, max]) => ({ label, total: list.filter((r) => r.age >= min && r.age <= max).length })),
    byWard: countBy(list, (r) => wardOfVillage(r.villageId), (id) => db().wards.find((w) => w.id === id)?.name ?? 'Unknown'),
    bySource: [
      { label: 'SMS gateway', total: list.filter((r) => r.source === 'sms').length },
      { label: 'Simulator', total: list.filter((r) => r.source === 'simulator').length },
    ],
  };
});

route('GET', '/analytics/admin-summary', 'admin', (): AdminSummary => {
  const d = db();
  const since30 = Date.now() - 30 * 24 * H;
  const recent = d.reports.filter((r) => time(r.receivedAt) >= since30);
  const sms30 = d.sms.filter((m) => time(m.at) >= since30);
  const today = startOfDay();
  const smsByDay = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (13 - i));
    const end = start.getTime() + 24 * H;
    const day = d.sms.filter((m) => time(m.at) >= start.getTime() && time(m.at) < end);
    return {
      label: formatShortDay(start),
      inbound: day.filter((m) => m.direction === 'inbound').length,
      outbound: day.filter((m) => m.direction === 'outbound').length,
      failed: day.filter((m) => m.status === 'failed').length,
    };
  });
  return {
    totalUsers: d.users.length,
    pendingApprovals: d.users.filter((u) => u.status === 'pending').length,
    activeOfficers: d.users.filter((u) => u.role === 'officer' && u.status === 'active').length,
    totalReports: d.reports.length,
    reportsToday: d.reports.filter((r) => time(r.receivedAt) >= today.getTime()).length,
    diseasesReported: new Set(recent.map((r) => r.diseaseId)).size,
    locationsAffected: new Set(recent.map((r) => r.villageId)).size,
    sms: {
      inbound: sms30.filter((m) => m.direction === 'inbound').length,
      invalid: sms30.filter((m) => m.status === 'invalid').length,
      outbound: sms30.filter((m) => m.direction === 'outbound').length,
      delivered: sms30.filter((m) => m.status === 'delivered').length,
      failed: sms30.filter((m) => m.status === 'failed').length,
      pending: sms30.filter((m) => m.status === 'pending' || m.status === 'sent').length,
    },
    smsByDay,
    recentActivity: d.auditLogs.slice(0, 8),
  };
});

// ---------- Generated reports / exports ----------
const REPORT_TITLES: Record<GeneratedReportParams['type'], string> = {
  daily: 'Daily Disease Report',
  weekly: 'Weekly Disease Report',
  monthly: 'Monthly Disease Report',
  disease: 'Disease-Specific Report',
  location: 'Location-Specific Report',
  verified: 'Verified Reports',
  pending: 'Pending Reports',
  rejected: 'Rejected Reports',
  hotspot: 'Potential Hotspot Report',
};

route('GET', '/exports', 'user', () => db().reportsGenerated.slice(0, 20));

route('POST', '/exports', 'user', ({ body, user }): ExportResult => {
  const p = body as GeneratedReportParams;
  if (!p.type || !REPORT_TITLES[p.type]) throw new ApiError(422, 'Choose a report type.');
  if (!p.dateFrom || !p.dateTo) throw new ApiError(422, 'Choose a date range.');
  if (p.dateFrom > p.dateTo) throw new ApiError(422, 'The start date must be before the end date.');
  if (p.type === 'disease' && !p.diseaseId) throw new ApiError(422, 'Choose a disease.');
  if (p.type === 'location' && !p.villageId) throw new ApiError(422, 'Choose a location.');

  let title = REPORT_TITLES[p.type];
  if (p.type === 'disease') title += `: ${diseaseOf(p.diseaseId!)?.name}`;
  if (p.type === 'location') title += `: ${villageOf(p.villageId!)?.name}`;
  const subtitle = `${db().constituency.name} Constituency · ${formatDate(`${p.dateFrom}T00:00:00`)} to ${formatDate(`${p.dateTo}T00:00:00`)}`;

  let columns: string[];
  let rows: (string | number)[][];
  let summary: { label: string; value: string }[];

  if (p.type === 'hotspot') {
    const alerts = currentAlerts();
    columns = ['Level', 'Suspected disease', 'Village', 'Reports', 'Threshold', 'Window (h)', 'First report', 'Latest report', 'Status'];
    rows = alerts.map((a) => [
      a.level === 'outbreak' ? 'Potential outbreak' : 'Potential hotspot',
      diseaseOf(a.diseaseId)?.name ?? '',
      villageOf(a.villageId)?.name ?? '',
      a.count,
      a.threshold,
      a.windowHours,
      formatDateTime(a.firstAt),
      formatDateTime(a.lastAt),
      a.status,
    ]);
    summary = [
      { label: 'Active signals', value: String(alerts.filter(isOpenAlert).length) },
      { label: 'Potential outbreaks', value: String(alerts.filter((a) => a.level === 'outbreak').length) },
      { label: 'Potential hotspots', value: String(alerts.filter((a) => a.level === 'hotspot').length) },
    ];
  } else {
    const q: Record<string, string> = { dateFrom: p.dateFrom, dateTo: p.dateTo, sortBy: 'receivedAt', sortDir: 'asc' };
    if (p.type === 'disease') q.diseaseId = p.diseaseId!;
    if (p.type === 'location') q.villageId = p.villageId!;
    if (p.type === 'pending') q.status = 'pending';
    if (p.type === 'verified') q.outcome = 'verified';
    if (p.type === 'rejected') q.outcome = 'rejected';
    const list = filterReports(q);
    columns = ['Report ID', 'Date', 'Time', 'Reporter', 'Age', 'Phone', 'Village', 'Ward', 'Suspected disease', 'Priority', 'Status', 'Officer'];
    rows = list.map((r) => {
      const v = villageOf(r.villageId);
      const dt = new Date(r.receivedAt);
      return [
        r.id,
        formatDate(r.receivedAt),
        dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        r.reporterName,
        r.age,
        maskPhone(r.phone),
        v?.name ?? '',
        db().wards.find((w) => w.id === v?.wardId)?.name ?? '',
        diseaseOf(r.diseaseId)?.name ?? '',
        r.priority.toUpperCase(),
        STATUS_LABEL[r.status],
        userOf(r.assignedOfficerId)?.name ?? 'Unassigned',
      ];
    });
    const top = Object.entries(
      list.reduce<Record<string, number>>((acc, r) => {
        acc[r.diseaseId] = (acc[r.diseaseId] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1])[0];
    summary = [
      { label: 'Total reports', value: String(list.length) },
      { label: 'Verified', value: String(list.filter((r) => r.outcome === 'verified').length) },
      { label: 'Rejected', value: String(list.filter((r) => r.outcome === 'rejected').length) },
      { label: 'Awaiting decision', value: String(list.filter((r) => !r.outcome).length) },
      { label: 'Most reported', value: top ? `${diseaseOf(top[0])?.name} (${top[1]})` : '—' },
    ];
  }

  const record = { id: uid('g'), title, params: p, createdAt: now(), createdBy: user!.id, rowCount: rows.length };
  db().reportsGenerated.unshift(record);
  audit(user, 'report.exported', 'report', null, `${user!.name} generated "${title}" (${rows.length} rows).`);
  return { record, title, subtitle, summary, columns, rows };
});

route('POST', '/exports/:id/download', 'user', ({ params, body, user }) => {
  const rec = db().reportsGenerated.find((g) => g.id === params.id);
  audit(user, 'report.exported', 'report', null, `${user!.name} exported "${rec?.title ?? 'report'}" as ${String(body.format).toUpperCase()}.`);
  return { ok: true };
});
