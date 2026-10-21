import type {
  AppNotification,
  AuditLog,
  Constituency,
  Disease,
  GeneratedReport,
  NotificationRule,
  Report,
  SmsMessage,
  SmsTemplate,
  SystemSettings,
  User,
  Village,
  Ward,
} from '@/types';
import type { StoredAlertState } from '@/lib/hotspot';
import { buildSeed, DB_VERSION } from './seed';

/**
 * In-browser stand-in for the future database. Each array matches a planned
 * table (users, reports, diseases, locations, sms_messages, notifications,
 * audit_logs, sms_templates). Persisted to localStorage so the demo survives reloads.
 */
export interface DbState {
  version: number;
  seededAt: string;
  constituency: Constituency;
  wards: Ward[];
  villages: Village[];
  diseases: Disease[];
  users: (User & { password: string })[];
  reports: Report[];
  sms: SmsMessage[];
  templates: SmsTemplate[];
  settings: SystemSettings;
  notificationRules: NotificationRule[];
  notifications: AppNotification[];
  auditLogs: AuditLog[];
  alertStates: Record<string, StoredAlertState>;
  sessions: Record<string, { userId: string; expiresAt: string }>;
  resetTokens: Record<string, { userId: string; expiresAt: string }>;
  /** Mock email verification codes (Supabase sends real emails). */
  verifyCodes?: Record<string, { code: string; expiresAt: string }>;
  nextReportNumber: number;
  reportsGenerated: GeneratedReport[];
}

const STORAGE_KEY = 'msdss.mockdb';
let state: DbState | null = null;

function load(): DbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DbState;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    // Corrupt or unavailable storage: fall back to a fresh seed.
  }
  const fresh = buildSeed();
  save(fresh);
  return fresh;
}

function save(s: DbState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked (private mode); the demo keeps working in memory.
  }
}

export function db(): DbState {
  if (!state) state = load();
  return state;
}

export function persist() {
  if (state) save(state);
}

export function resetDb() {
  const sessions = state?.sessions ?? {};
  state = buildSeed();
  // Keep people signed in across a demo reset.
  state.sessions = sessions;
  save(state);
}
