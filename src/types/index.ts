/**
 * Domain types shared by the UI, the service layer and the mock backend.
 * They mirror the future database entities (users, reports, diseases, locations,
 * sms_messages, notifications, audit_logs, sms_templates) so the real API can
 * return the same shapes.
 */

export type ID = string;
export type ISODate = string;

// ---------- Users & auth ----------
export type Role = 'admin' | 'officer';
/** pending = self-registered health officer awaiting admin approval. */
export type AccountStatus = 'pending' | 'active' | 'disabled';

export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string;
  status: AccountStatus;
  /** Wards this user covers (health officers). Empty = all wards. */
  wardIds: ID[];
  lastLoginAt: ISODate | null;
  createdAt: ISODate;
  /** False until a self-registered officer confirms the emailed code. */
  emailVerified?: boolean;
}

export interface Session {
  token: string;
  user: User;
  expiresAt: ISODate;
}

// ---------- Locations ----------
export interface Constituency {
  id: ID;
  name: string;
  county: string;
}

export interface Ward {
  id: ID;
  name: string;
  constituencyId: ID;
}

export interface Village {
  id: ID;
  name: string;
  wardId: ID;
  lat: number;
  lng: number;
  population: number;
  active: boolean;
  /** Alternative spellings accepted in SMS (e.g. "El Wak"). */
  aliases: string[];
}

// ---------- Diseases ----------
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export const DISEASE_CATEGORIES = [
  'Waterborne',
  'Vector-borne',
  'Vaccine-preventable',
  'Zoonotic',
  'Respiratory',
  'Other',
] as const;
export type DiseaseCategory = (typeof DISEASE_CATEGORIES)[number];

export interface Disease {
  id: ID;
  name: string;
  category: DiseaseCategory;
  description: string;
  /** Surveillance threshold: N suspected reports from one village within the window raises an alert. */
  alertThreshold: number;
  alertWindowHours: number;
  /** Starting priority before age/cluster rules are applied. */
  basePriority: Priority;
  active: boolean;
  aliases: string[];
}

// ---------- Reports ----------
export type ReportStatus = 'pending' | 'under_review' | 'verified' | 'rejected' | 'escalated' | 'closed';
export type ReportSource = 'sms' | 'simulator' | 'web';

export interface Remark {
  id: ID;
  authorId: ID;
  text: string;
  createdAt: ISODate;
}

export type ReportEventType = 'created' | 'assigned' | 'status_changed' | 'remark' | 'sms_sent' | 'priority_changed';

export interface ReportEvent {
  id: ID;
  type: ReportEventType;
  actorId: ID | null;
  message: string;
  at: ISODate;
}

export interface Report {
  id: ID; // e.g. MS001
  reporterName: string;
  age: number;
  phone: string;
  villageId: ID;
  diseaseId: ID;
  /** Text exactly as the resident typed it, kept for audit. */
  rawMessage: string;
  receivedAt: ISODate;
  source: ReportSource;
  status: ReportStatus;
  priority: Priority;
  /** Human-readable reasons the priority was assigned. */
  priorityReasons: string[];
  assignedOfficerId: ID | null;
  remarks: Remark[];
  /** Officer decision, kept after the report is closed. */
  outcome: 'verified' | 'rejected' | null;
  /** When the verify/reject decision was made. */
  decidedAt: ISODate | null;
  decidedBy: ID | null;
  updatedAt: ISODate;
  history: ReportEvent[];
}

export interface ReportQuery {
  search?: string;
  diseaseId?: ID;
  villageId?: ID;
  wardId?: ID;
  status?: ReportStatus;
  priority?: Priority;
  assignedTo?: ID | 'unassigned';
  dateFrom?: string; // yyyy-mm-dd
  dateTo?: string;
  sortBy?: 'receivedAt' | 'priority' | 'id' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReportAction =
  | { type: 'assign'; officerId: ID }
  | { type: 'start_review' }
  | { type: 'verify'; remark?: string; notifyResident: boolean }
  | { type: 'reject'; remark: string; notifyResident: boolean }
  | { type: 'escalate'; remark: string }
  | { type: 'close'; remark?: string }
  | { type: 'remark'; text: string }
  | { type: 'set_priority'; priority: Priority; reason: string };

// ---------- SMS ----------
export type SmsDirection = 'inbound' | 'outbound';
export type InboundStatus = 'processed' | 'invalid' | 'duplicate';
export type OutboundStatus = 'pending' | 'sent' | 'delivered' | 'failed';
export type SmsTemplateKey =
  | 'report_received'
  | 'invalid_format'
  | 'unknown_location'
  | 'unknown_disease'
  | 'report_verified'
  | 'report_rejected'
  | 'alert_notification';

export interface SmsMessage {
  id: ID;
  direction: SmsDirection;
  phone: string;
  body: string;
  at: ISODate;
  status: InboundStatus | OutboundStatus;
  type: SmsTemplateKey | 'custom' | 'report';
  reportId: ID | null;
  error: string | null;
}

export interface SmsTemplate {
  key: SmsTemplateKey;
  name: string;
  description: string;
  body: string;
  variables: string[];
  active: boolean;
  updatedAt: ISODate;
}

export type ValidationCode =
  | 'EMPTY'
  | 'BAD_KEYWORD'
  | 'WRONG_FIELD_COUNT'
  | 'MISSING_NAME'
  | 'INVALID_NAME'
  | 'MISSING_AGE'
  | 'INVALID_AGE'
  | 'MISSING_LOCATION'
  | 'UNKNOWN_LOCATION'
  | 'MISSING_DISEASE'
  | 'UNKNOWN_DISEASE';

export interface ValidationIssue {
  code: ValidationCode;
  field: 'message' | 'keyword' | 'name' | 'age' | 'location' | 'disease';
  message: string;
}

export interface ParsedSms {
  valid: boolean;
  fields: { keyword: string; name: string; age: string; location: string; disease: string };
  issues: ValidationIssue[];
  /** Resolved references when valid. */
  villageId: ID | null;
  diseaseId: ID | null;
  age: number | null;
}

export interface SimulationStep {
  key: 'received' | 'validated' | 'created' | 'id_generated' | 'notified' | 'replied';
  label: string;
  status: 'done' | 'failed' | 'skipped';
  detail: string;
}

export interface InboundResult {
  inbound: SmsMessage;
  reply: SmsMessage;
  parsed: ParsedSms;
  report: Report | null;
  steps: SimulationStep[];
}

// ---------- Alerts ----------
export type AlertLevel = 'hotspot' | 'outbreak';
export type AlertStatus = 'new' | 'acknowledged' | 'investigating' | 'dismissed' | 'resolved';

export interface Alert {
  id: ID; // `${diseaseId}:${villageId}`
  diseaseId: ID;
  villageId: ID;
  level: AlertLevel;
  count: number;
  threshold: number;
  windowHours: number;
  firstAt: ISODate;
  lastAt: ISODate;
  reportIds: ID[];
  status: AlertStatus;
  note: string | null;
  updatedBy: ID | null;
  updatedAt: ISODate | null;
}

// ---------- Notifications ----------
export type NotificationType =
  | 'new_report'
  | 'high_priority'
  | 'hotspot'
  | 'outbreak_alert'
  | 'assigned'
  | 'awaiting_review'
  | 'system';

export interface AppNotification {
  id: ID;
  userId: ID;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: ISODate;
}

export interface NotificationRule {
  type: NotificationType;
  label: string;
  description: string;
  inApp: boolean;
  sms: boolean;
  email: boolean;
  recipients: 'all_officers' | 'ward_officers' | 'assigned_officer' | 'admins';
}

// ---------- Audit ----------
export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.password_reset'
  | 'report.created'
  | 'report.viewed'
  | 'report.phone_revealed'
  | 'report.assigned'
  | 'report.status_changed'
  | 'report.verified'
  | 'report.rejected'
  | 'report.escalated'
  | 'report.remark'
  | 'report.exported'
  | 'sms.sent'
  | 'alert.updated'
  | 'user.created'
  | 'user.updated'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.password_reset'
  | 'user.registered'
  | 'user.approved'
  | 'user.rejected'
  | 'disease.created'
  | 'disease.updated'
  | 'location.created'
  | 'location.updated'
  | 'template.updated'
  | 'settings.updated';

export interface AuditLog {
  id: ID;
  at: ISODate;
  actorId: ID | null;
  actorName: string;
  action: AuditAction;
  entityType: 'report' | 'user' | 'disease' | 'location' | 'sms' | 'alert' | 'template' | 'settings' | 'session';
  entityId: ID | null;
  details: string;
}

// ---------- Settings ----------
export interface SystemSettings {
  systemName: string;
  reportIdPrefix: string;
  smsKeyword: string;
  smsShortcode: string;
  autoAssign: boolean;
  maskPhoneNumbers: boolean;
  sessionTimeoutMinutes: number;
  dataRetentionMonths: number;
  gateway: {
    provider: string;
    senderId: string;
    apiKeyConfigured: boolean;
  };
  /** Only meaningful for the mock backend; lets you demo loading/error states. */
  mock: {
    latencyMs: number;
    failureRate: number;
  };
}

// ---------- Analytics ----------
export interface DashboardSummary {
  total: number;
  byStatus: Record<ReportStatus, number>;
  today: number;
  thisWeek: number;
  lastWeek: number;
  activeAlerts: number;
  needsAttention: Report[];
}

export interface TimeBucket {
  label: string;
  date: string;
  total: number;
  verified: number;
  rejected: number;
}

export interface CountRow {
  id: ID;
  name: string;
  total: number;
  verified: number;
  rejected: number;
  pending: number;
}

export type Granularity = 'daily' | 'weekly' | 'monthly';

// ---------- Generated reports (exports) ----------
export type GeneratedReportType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'disease'
  | 'location'
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'hotspot';

export interface GeneratedReportParams {
  type: GeneratedReportType;
  dateFrom: string;
  dateTo: string;
  diseaseId?: ID;
  villageId?: ID;
}

export interface GeneratedReport {
  id: ID;
  title: string;
  params: GeneratedReportParams;
  createdAt: ISODate;
  createdBy: ID;
  rowCount: number;
}

/** Generic tabular result so PDF/Excel export works for every report type. */
export interface ExportResult {
  record: GeneratedReport;
  title: string;
  subtitle: string;
  summary: { label: string; value: string }[];
  columns: string[];
  rows: (string | number)[][];
}

export interface DiseaseMatrixRow {
  diseaseId: ID;
  total: number;
  verified: number;
  rejected: number;
  pending: number;
  prevTotal: number;
  /** villageId -> report count in the period */
  villages: Record<ID, number>;
}

export interface OfficerSummary {
  user: User;
  open: number;
  pending: number;
  underReview: number;
  decided: number;
  avgDecisionHours: number | null;
}

export interface PerformanceStats {
  avgDecisionHours: number | null;
  verificationRate: number;
  decided: number;
  ageGroups: { label: string; total: number }[];
  byWard: CountRow[];
  bySource: { label: string; total: number }[];
}

export interface AdminSummary {
  totalUsers: number;
  pendingApprovals: number;
  activeOfficers: number;
  totalReports: number;
  reportsToday: number;
  diseasesReported: number;
  locationsAffected: number;
  sms: { inbound: number; invalid: number; outbound: number; delivered: number; failed: number; pending: number };
  smsByDay: { label: string; inbound: number; outbound: number; failed: number }[];
  recentActivity: AuditLog[];
}

export interface RegistrationRequest {
  name: string;
  email: string;
  phone: string;
  title: string;
  wardIds: ID[];
  password: string;
  /** Where the email's confirmation link should return to. */
  redirectTo?: string;
}

export interface LocationTree {
  constituency: Constituency;
  wards: Ward[];
  villages: Village[];
}
