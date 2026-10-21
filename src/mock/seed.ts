import type {
  AppNotification,
  AuditLog,
  Report,
  ReportEvent,
  ReportStatus,
  SmsMessage,
} from '@/types';
import { constituency, villages, wards } from '@/data/locations';
import { diseases } from '@/data/diseases';
import { seedUsers } from '@/data/users';
import { seedNotificationRules, seedSettings, seedTemplates } from '@/data/config';
import { computePriority } from '@/lib/priority';
import { parseSms, renderTemplate } from '@/lib/smsParser';
import { renderReply } from '@/lib/smsReplies';
import type { DbState } from './db';

export const DB_VERSION = 3;

/** Deterministic PRNG so every fresh demo looks the same. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fictional names, demonstration only.
const FIRST = [
  'Abdullahi', 'Fatuma', 'Hassan', 'Amina', 'Mohamed', 'Halima', 'Ibrahim', 'Khadija', 'Ali', 'Asha',
  'Omar', 'Sahara', 'Yusuf', 'Hawa', 'Ahmed', 'Maryan', 'Adan', 'Deka', 'Issack', 'Habiba', 'Noor',
  'Sadia', 'Bashir', 'Rukia', 'Abdirahman', 'Hodan', 'Mahat', 'Ubah', 'Kassim', 'Nasra', 'Billow', 'Sofia',
];

const REMARKS_VERIFIED = [
  'Case confirmed by community health volunteer visit. Patient referred to the nearest facility.',
  'Rapid diagnostic test positive at health centre. Household given prevention guidance.',
  'Follow-up call made. Symptoms consistent with case definition; referred for treatment.',
  'Verified during field visit. Water source chlorination recommended.',
  'Facility confirmed attendance. Contact tracing started for household members.',
];
const REMARKS_REJECTED = [
  'Follow-up call: symptoms do not match the case definition.',
  'Duplicate of an earlier report from the same household.',
  'Unable to reach reporter after three attempts; no supporting facility record.',
  'Facility visit found an alternative diagnosis.',
];
const REMARKS_ESCALATED = [
  'Escalated to the County Disease Surveillance Coordinator for a rapid response team.',
  'Cluster in the same household; escalated for laboratory sampling.',
];

export function buildSeed(nowMs = Date.now()): DbState {
  const rnd = mulberry32(20261006);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const weighted = <T,>(entries: [T, number][]): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [v, w] of entries) {
      r -= w;
      if (r <= 0) return v;
    }
    return entries[entries.length - 1][0];
  };
  const H = 3_600_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const phone = () => `+2547990${String(Math.floor(rnd() * 100000)).padStart(5, '0')}`;
  const age = () =>
    weighted<[number, number]>([
      [[0, 4], 18],
      [[5, 17], 22],
      [[18, 45], 38],
      [[46, 64], 14],
      [[65, 90], 8],
    ]);

  const officers = seedUsers.filter((u) => u.role === 'officer');
  const activeOfficers = officers.filter((u) => u.status === 'active');
  const officerForVillage = (villageId: string) => {
    const wardId = villages.find((v) => v.id === villageId)!.wardId;
    const covering = activeOfficers.filter((o) => o.wardIds.includes(wardId));
    return (covering.length ? pick(covering) : pick(activeOfficers)).id;
  };

  // ---------- 1. Raw report drafts ----------
  interface Draft {
    villageId: string;
    diseaseId: string;
    at: number;
    cluster?: string;
  }
  const drafts: Draft[] = [];

  const diseaseWeights: [string, number][] = [
    ['d_malaria', 30], ['d_cholera', 16], ['d_awd', 16], ['d_typhoid', 14], ['d_pneumonia', 10],
    ['d_measles', 7], ['d_kala_azar', 4], ['d_dengue', 4], ['d_rvf', 1], ['d_anthrax', 1],
  ];
  const villageWeights: [string, number][] = villages.map((v) => [v.id, Math.sqrt(v.population)]);
  const dayTime = (dayStart: number) => dayStart + (6 + rnd() * 15) * H;

  // Background reporting over the last ~90 days.
  for (let i = 0; i < 180; i++) {
    const daysAgo = 2 + Math.floor(Math.pow(rnd(), 1.15) * 88);
    const start = nowMs - daysAgo * 24 * H;
    drafts.push({ villageId: weighted(villageWeights), diseaseId: weighted(diseaseWeights), at: dayTime(start - 12 * H) });
  }
  // Recent scattered reports (last 40 hours).
  for (let i = 0; i < 14; i++) {
    drafts.push({
      villageId: weighted(villageWeights),
      diseaseId: weighted(diseaseWeights.filter(([d]) => d !== 'd_cholera' && d !== 'd_measles')),
      at: nowMs - rnd() * 40 * H,
    });
  }
  // Scenario clusters that drive the Alerts & Hotspots demo.
  const cluster = (villageId: string, diseaseId: string, n: number, withinHours: number, tag: string) => {
    for (let i = 0; i < n; i++)
      drafts.push({ villageId, diseaseId, at: nowMs - (0.3 + rnd() * (withinHours - 0.3)) * H, cluster: tag });
  };
  cluster('v_rhamu', 'd_cholera', 15, 22, 'rhamu-cholera'); // potential outbreak (10 / 24 h)
  cluster('v_elwak_town', 'd_cholera', 6, 20, 'elwak-cholera'); // potential hotspot
  cluster('v_kutulo', 'd_measles', 5, 60, 'kutulo-measles'); // potential outbreak (5 / 72 h)
  cluster('v_wargadud', 'd_malaria', 9, 66, 'wargadud-malaria'); // potential hotspot

  drafts.sort((a, b) => a.at - b.at);

  // ---------- 2. Build reports ----------
  const reports: Report[] = [];
  const sms: SmsMessage[] = [];
  let smsSeq = 0;
  const smsId = () => `sms_seed_${++smsSeq}`;

  drafts.forEach((d, index) => {
    const id = `${seedSettings.reportIdPrefix}${String(index + 1).padStart(3, '0')}`;
    const disease = diseases.find((x) => x.id === d.diseaseId)!;
    const village = villages.find((x) => x.id === d.villageId)!;
    const [minA, maxA] = disease.id === 'd_measles' ? [1, 12] : age();
    const personAge = minA + Math.floor(rnd() * (maxA - minA + 1));
    const reporterName = pick(FIRST);
    const reporterPhone = phone();

    const windowStart = d.at - disease.alertWindowHours * H;
    const recent =
      reports.filter(
        (r) =>
          r.diseaseId === d.diseaseId &&
          r.villageId === d.villageId &&
          new Date(r.receivedAt).getTime() >= windowStart,
      ).length + 1;
    const { priority, reasons } = computePriority({ disease, age: personAge, recentSameVillageCount: recent });

    // Status depends on how old the report is.
    const ageH = (nowMs - d.at) / H;
    let status: ReportStatus;
    if (ageH < 6) status = weighted<ReportStatus>([['pending', 80], ['under_review', 20]]);
    else if (ageH < 48)
      status = weighted<ReportStatus>([
        ['pending', 35], ['under_review', 35], ['verified', 15], ['escalated', 9], ['rejected', 6],
      ]);
    else if (ageH < 24 * 7)
      status = weighted<ReportStatus>([
        ['under_review', 10], ['verified', 55], ['rejected', 20], ['escalated', 5], ['closed', 10],
      ]);
    else
      status = weighted<ReportStatus>([['verified', 45], ['rejected', 18], ['closed', 35], ['escalated', 2]]);

    const assigned = status === 'pending' ? (rnd() < 0.35 ? officerForVillage(d.villageId) : null) : officerForVillage(d.villageId);
    const history: ReportEvent[] = [];
    let ev = 0;
    const event = (type: ReportEvent['type'], at: number, message: string, actorId: string | null = null) =>
      history.push({ id: `${id}_e${++ev}`, type, actorId, message, at: iso(at) });

    event('created', d.at, `Report received by SMS from ${village.name}. Priority set to ${priority}.`);
    event('sms_sent', d.at + 6000, 'Confirmation SMS sent to resident.');

    const remarks: Report['remarks'] = [];
    let t = d.at;
    let decidedAt: number | null = null;
    if (assigned) {
      t += (0.2 + rnd() * Math.min(4, ageH * 0.3)) * H;
      event('assigned', t, `Assigned to ${officers.find((o) => o.id === assigned)!.name}.`, 'u_ahmed');
    }
    if (status !== 'pending' && assigned) {
      t += (0.1 + rnd() * Math.min(3, ageH * 0.2)) * H;
      event('status_changed', t, 'Status changed from Pending to Under Review.', assigned);
    }
    const remarkAt = (text: string, at: number) => {
      remarks.push({ id: `${id}_r${remarks.length + 1}`, authorId: assigned!, text, createdAt: iso(at) });
      event('remark', at, `Remark added: "${text}"`, assigned);
    };
    if (status === 'verified' || status === 'closed') {
      t += (1 + rnd() * Math.min(24, Math.max(1, ageH * 0.4))) * H;
      decidedAt = t;
      remarkAt(pick(REMARKS_VERIFIED), t);
      event('status_changed', t, 'Report verified.', assigned);
      event('sms_sent', t + 4000, 'Verification SMS sent to resident.', assigned);
      if (status === 'closed') {
        t += (24 + rnd() * 72) * H;
        event('status_changed', Math.min(t, nowMs - H), 'Report closed after follow-up.', assigned);
      }
    } else if (status === 'rejected') {
      t += (1 + rnd() * Math.min(24, Math.max(1, ageH * 0.4))) * H;
      decidedAt = t;
      remarkAt(pick(REMARKS_REJECTED), t);
      event('status_changed', t, 'Report rejected.', assigned);
      event('sms_sent', t + 4000, 'Rejection SMS sent to resident.', assigned);
    } else if (status === 'escalated') {
      t += (0.5 + rnd() * Math.min(12, Math.max(1, ageH * 0.3))) * H;
      remarkAt(pick(REMARKS_ESCALATED), t);
      event('status_changed', t, 'Report escalated.', assigned);
    }

    const updatedAt = history[history.length - 1].at;
    const typedVillage = rnd() < 0.12 && village.aliases.length ? village.aliases[0] : village.name;
    const typedDisease = rnd() < 0.15 ? disease.name.toLowerCase() : disease.name;
    const rawMessage = `REPORT#${reporterName}#${personAge}#${typedVillage}#${typedDisease}`;

    reports.push({
      id,
      reporterName,
      age: personAge,
      phone: reporterPhone,
      villageId: d.villageId,
      diseaseId: d.diseaseId,
      rawMessage,
      receivedAt: iso(d.at),
      source: 'sms',
      status,
      priority,
      priorityReasons: reasons,
      assignedOfficerId: assigned,
      remarks,
      outcome: decidedAt ? (status === 'rejected' ? 'rejected' : 'verified') : null,
      decidedAt: decidedAt ? iso(decidedAt) : null,
      decidedBy: decidedAt ? assigned : null,
      updatedAt,
      history,
    });

    // SMS traffic for this report.
    sms.push({
      id: smsId(), direction: 'inbound', phone: reporterPhone, body: rawMessage, at: iso(d.at),
      status: 'processed', type: 'report', reportId: id, error: null,
    });
    const failed = rnd() < 0.03;
    sms.push({
      id: smsId(), direction: 'outbound', phone: reporterPhone,
      body: renderTemplate(seedTemplates[0].body, { reportId: id }), at: iso(d.at + 6000),
      status: failed ? 'failed' : ageH < 0.05 ? 'sent' : 'delivered', type: 'report_received', reportId: id,
      error: failed ? 'Handset unreachable (simulated)' : null,
    });
    if (decidedAt) {
      const key = status === 'rejected' ? 'report_rejected' : 'report_verified';
      const tpl = seedTemplates.find((x) => x.key === key)!;
      sms.push({
        id: smsId(), direction: 'outbound', phone: reporterPhone, body: renderTemplate(tpl.body, { reportId: id }),
        at: iso(decidedAt + 4000), status: 'delivered', type: key, reportId: id, error: null,
      });
    }
  });

  // Invalid messages, to show validation in the SMS log.
  const invalidSamples = [
    'REPORT#Abdullahi',
    'REPORT#Halima#abc#Kutulo#Malaria',
    'REPORT#Ali#35##Cholera',
    'report cholera elwak',
    'REPORT#Asha#28#Nairobi#Malaria',
    'REPORT#Noor#40#Hareri#Flu',
    'REPORT##30#Dimu#Typhoid',
    'REPORT#Bashir#200#Garse#Measles',
    'REPORT#Sadia#22#Rhamu#',
    'Hello is this the health office?',
  ];
  invalidSamples.forEach((body, i) => {
    const at = nowMs - (2 + i * 37 + rnd() * 20) * H;
    const parsed = parseSms(body, { keyword: seedSettings.smsKeyword, villages, diseases });
    const reply = renderReply(parsed, seedTemplates);
    const p = phone();
    sms.push({
      id: smsId(), direction: 'inbound', phone: p, body, at: iso(at), status: 'invalid', type: 'report',
      reportId: null, error: parsed.issues.map((x) => x.message).join(' '),
    });
    sms.push({
      id: smsId(), direction: 'outbound', phone: p, body: reply.body, at: iso(at + 5000), status: 'delivered',
      type: reply.key, reportId: null, error: null,
    });
  });
  // Officer alert SMS for the Rhamu cluster.
  const rhamuAlertAt = nowMs - 9 * H;
  for (const o of activeOfficers.slice(0, 3)) {
    sms.push({
      id: smsId(), direction: 'outbound', phone: o.phone,
      body: renderTemplate(seedTemplates.find((x) => x.key === 'alert_notification')!.body, {
        count: 10, disease: 'Cholera', location: 'Rhamu', hours: 24,
      }),
      at: iso(rhamuAlertAt), status: o.id === 'u_deka' ? 'pending' : 'delivered', type: 'alert_notification',
      reportId: null, error: null,
    });
  }
  sms.sort((a, b) => b.at.localeCompare(a.at));

  // ---------- 3. Notifications ----------
  const notifications: AppNotification[] = [];
  let nSeq = 0;
  const notify = (n: Omit<AppNotification, 'id'>) => notifications.push({ ...n, id: `n_seed_${++nSeq}` });
  const villageName = (id: string) => villages.find((v) => v.id === id)!.name;
  const diseaseName = (id: string) => diseases.find((x) => x.id === id)!.name;

  for (const o of activeOfficers) {
    const mine = reports.filter((r) => o.wardIds.includes(villages.find((v) => v.id === r.villageId)!.wardId));
    const recent = mine.filter((r) => nowMs - new Date(r.receivedAt).getTime() < 30 * H).slice(-6);
    for (const r of recent) {
      const high = r.priority === 'high' || r.priority === 'critical';
      notify({
        userId: o.id,
        type: high ? 'high_priority' : 'new_report',
        title: high ? `${r.priority === 'critical' ? 'Critical' : 'High'}-priority report ${r.id}` : `New report ${r.id}`,
        message: `Suspected ${diseaseName(r.diseaseId)} reported from ${villageName(r.villageId)}.`,
        link: `/app/reports/${r.id}`,
        read: nowMs - new Date(r.receivedAt).getTime() > 8 * H,
        createdAt: r.receivedAt,
      });
    }
    const assignedToMe = mine.filter((r) => r.assignedOfficerId === o.id && r.status === 'pending').slice(-2);
    for (const r of assignedToMe)
      notify({
        userId: o.id, type: 'assigned', title: `Report ${r.id} assigned to you`,
        message: `Suspected ${diseaseName(r.diseaseId)} in ${villageName(r.villageId)} needs review.`,
        link: `/app/reports/${r.id}`, read: false, createdAt: r.history.find((e) => e.type === 'assigned')?.at ?? r.receivedAt,
      });
    const stale = mine.filter((r) => r.status === 'pending' && nowMs - new Date(r.receivedAt).getTime() > 24 * H).slice(0, 1);
    for (const r of stale)
      notify({
        userId: o.id, type: 'awaiting_review', title: `Report ${r.id} awaiting review`,
        message: 'This report has been pending for more than 24 hours.', link: `/app/reports/${r.id}`, read: false,
        createdAt: iso(new Date(r.receivedAt).getTime() + 24 * H),
      });
  }
  for (const u of seedUsers.filter((x) => x.status === 'active')) {
    notify({
      userId: u.id, type: 'outbreak_alert', title: 'Potential outbreak alert: Cholera in Rhamu',
      message: '10 or more suspected Cholera reports received from Rhamu within 24 hours. Requires verification.',
      link: '/app/alerts', read: false, createdAt: iso(rhamuAlertAt),
    });
    notify({
      userId: u.id, type: 'hotspot', title: 'Potential hotspot: Malaria in Wargadud',
      message: 'Suspected Malaria reports are clustering in Wargadud. Review recommended.',
      link: '/app/alerts', read: u.id !== 'u_fatuma', createdAt: iso(nowMs - 20 * H),
    });
  }
  notify({
    userId: 'u_admin', type: 'system', title: 'SMS gateway not connected',
    message: 'The system is running in simulator mode. Configure an SMS provider in System Settings before go-live.',
    link: '/admin/settings', read: false, createdAt: iso(nowMs - 30 * H),
  });
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ---------- 4. Audit logs ----------
  const audit: AuditLog[] = [];
  let aSeq = 0;
  const userName = (id: string | null) => seedUsers.find((u) => u.id === id)?.name ?? 'System';
  const log = (a: Omit<AuditLog, 'id' | 'actorName'>) =>
    audit.push({ ...a, id: `a_seed_${++aSeq}`, actorName: userName(a.actorId) });

  for (const r of reports) {
    log({ at: r.receivedAt, actorId: null, action: 'report.created', entityType: 'report', entityId: r.id, details: `Report ${r.id} created from inbound SMS.` });
    for (const e of r.history) {
      if (e.type === 'assigned')
        log({ at: e.at, actorId: e.actorId, action: 'report.assigned', entityType: 'report', entityId: r.id, details: `${userName(e.actorId)} ${e.message.replace('Assigned', 'assigned ' + r.id)}` });
      if (e.type === 'status_changed') {
        const action = e.message.includes('verified') ? 'report.verified' : e.message.includes('rejected') ? 'report.rejected' : e.message.includes('escalated') ? 'report.escalated' : 'report.status_changed';
        const verb = action === 'report.verified' ? 'verified' : action === 'report.rejected' ? 'rejected' : action === 'report.escalated' ? 'escalated' : 'updated';
        log({ at: e.at, actorId: e.actorId, action, entityType: 'report', entityId: r.id, details: `Officer ${userName(e.actorId).split(' ')[0]} ${verb} ${r.id}.` });
      }
    }
  }
  for (let d = 0; d < 30; d++) {
    for (const o of activeOfficers) {
      if (rnd() < 0.55) continue;
      const at = nowMs - d * 24 * H - (rnd() * 4 + 1) * H;
      log({ at: iso(at), actorId: o.id, action: 'auth.login', entityType: 'session', entityId: null, details: `${o.name} logged in.` });
    }
  }
  const adminEvents: [number, AuditLog['action'], AuditLog['entityType'], string | null, string][] = [
    [26, 'user.created', 'user', 'u_deka', 'Created health officer account for Deka Ibrahim.'],
    [21, 'disease.updated', 'disease', 'd_cholera', 'Changed Cholera alert threshold to 10 reports / 24 h.'],
    [18, 'location.updated', 'location', 'v_rhamu', 'Added alias "Ramu" to village Rhamu.'],
    [14, 'template.updated', 'template', 'report_received', 'Updated SMS template "Successful report".'],
    [9, 'user.disabled', 'user', 'u_omar', 'Disabled account for Omar Ali (transferred).'],
    [4, 'disease.created', 'disease', 'd_pneumonia', 'Added disease Pneumonia (Respiratory).'],
    [2, 'settings.updated', 'settings', null, 'Enabled phone-number masking in report lists.'],
  ];
  for (const [daysAgo, action, entityType, entityId, details] of adminEvents)
    log({ at: iso(nowMs - daysAgo * 24 * H - 3 * H), actorId: 'u_admin', action, entityType, entityId, details });
  audit.sort((a, b) => b.at.localeCompare(a.at));

  // Last logins.
  const users = seedUsers.map((u) => {
    const last = audit.find((a) => a.action === 'auth.login' && a.actorId === u.id);
    return { ...u, lastLoginAt: last?.at ?? u.lastLoginAt ?? iso(nowMs - 26 * H) };
  });

  const alertStates: DbState['alertStates'] = {
    'd_cholera:v_elwak_town': { status: 'acknowledged', note: 'CHV team notified; monitoring water points.', updatedBy: 'u_ahmed', updatedAt: iso(nowMs - 3 * H) },
    'd_measles:v_kutulo': { status: 'investigating', note: 'Vaccination status of cases being checked with Kutulo health centre.', updatedBy: 'u_fatuma', updatedAt: iso(nowMs - 5 * H) },
  };

  return {
    version: DB_VERSION,
    seededAt: iso(nowMs),
    constituency,
    wards,
    villages,
    diseases,
    users,
    reports,
    sms,
    templates: seedTemplates,
    settings: seedSettings,
    notificationRules: seedNotificationRules,
    notifications,
    auditLogs: audit,
    alertStates,
    sessions: {},
    resetTokens: {},
    nextReportNumber: reports.length + 1,
    reportsGenerated: [],
  };
}

