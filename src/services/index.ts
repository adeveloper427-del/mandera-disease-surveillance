/**
 * Service layer: the ONLY place the UI talks to the backend.
 * Each function documents the REST endpoint it calls. Swapping the mock for
 * the real API changes nothing here (see apiClient.ts).
 */
import type {
  AdminSummary,
  Alert,
  AlertStatus,
  AppNotification,
  AuditLog,
  CountRow,
  DashboardSummary,
  Disease,
  DiseaseMatrixRow,
  ExportResult,
  GeneratedReport,
  GeneratedReportParams,
  Granularity,
  InboundResult,
  LocationTree,
  NotificationRule,
  OfficerSummary,
  Paginated,
  ParsedSms,
  PerformanceStats,
  RegistrationRequest,
  Report,
  ReportAction,
  ReportQuery,
  Session,
  SmsMessage,
  SmsTemplate,
  SmsTemplateKey,
  SystemSettings,
  TimeBucket,
  User,
  Village,
  Ward,
} from '@/types';
import { supabase } from '@/lib/supabase';
import { api, API_MODE, ApiError, type QueryParams } from './apiClient';

export interface PublicSettings {
  systemName: string;
  smsKeyword: string;
  smsShortcode: string;
  maskPhoneNumbers: boolean;
}

const FORGOT_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

/** Turn Supabase Auth errors into the messages the UI shows. */
function authError(message: string): ApiError {
  if (/invalid login credentials/i.test(message)) return new ApiError(401, 'Incorrect email or password.');
  if (/email not confirmed/i.test(message)) return new ApiError(403, 'Please verify your email address before signing in. Check your inbox for the code.');
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(message)) return new ApiError(422, 'That code is incorrect or has expired. Check the code or request a new one.');
  if (/banned/i.test(message)) return new ApiError(403, 'This account has been disabled. Contact your system administrator.');
  if (/rate limit|too many/i.test(message)) return new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.');
  return new ApiError(400, message);
}

/**
 * Authentication. In Supabase mode, Supabase Auth handles credentials and
 * passwords (hashed server-side); the API records the login and returns the
 * user's profile and role.
 */
export const authService = {
  async login(email: string, password: string): Promise<Session> {
    if (API_MODE !== 'supabase') return api.post<Session>('/auth/login', { email, password });
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw authError(error?.message ?? 'Sign-in failed.');
    try {
      const user = await api.post<User>('/auth/session');
      return { token: data.session.access_token, user, expiresAt: new Date((data.session.expires_at ?? 0) * 1000).toISOString() };
    } catch (err) {
      await supabase!.auth.signOut();
      throw err;
    }
  },
  async logout() {
    try {
      await api.post<{ ok: true }>('/auth/logout');
    } finally {
      if (API_MODE === 'supabase') await supabase!.auth.signOut();
    }
    return { ok: true as const };
  },
  me: () => api.get<User>('/auth/me'),
  async forgotPassword(email: string): Promise<{ message: string; devResetToken: string | null }> {
    if (API_MODE !== 'supabase') return api.post('/auth/forgot-password', { email });
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error && /rate limit/i.test(error.message)) throw authError(error.message);
    return { message: FORGOT_MESSAGE, devResetToken: null };
  },
  async resetPassword(token: string, password: string) {
    if (API_MODE !== 'supabase') return api.post<{ ok: true }>('/auth/reset-password', { token, password });
    // The email link signs the user in with a recovery session; set the new password on it.
    const { data } = await supabase!.auth.getSession();
    if (!data.session) throw new ApiError(400, 'This reset link is invalid or has expired. Request a new one.');
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) throw authError(error.message);
    await api.post('/auth/password-changed', { reset: true }).catch(() => undefined);
    await supabase!.auth.signOut();
    return { ok: true as const };
  },
  async changePassword(currentPassword: string, newPassword: string) {
    if (API_MODE !== 'supabase') return api.post<{ ok: true }>('/auth/change-password', { currentPassword, newPassword });
    const { data } = await supabase!.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new ApiError(401, 'Your session has expired. Please sign in again.');
    const check = await supabase!.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) throw new ApiError(422, 'Current password is incorrect.');
    if (currentPassword === newPassword) throw new ApiError(422, 'New password must be different from the current one.');
    const { error } = await supabase!.auth.updateUser({ password: newPassword });
    if (error) throw authError(error.message);
    await api.post('/auth/password-changed');
    return { ok: true as const };
  },
  updateProfile: (data: { name: string; phone: string }) => api.patch<User>('/auth/profile', data),
  /** Health officer self-registration; the account stays pending until an admin approves it. */
  register: (data: RegistrationRequest) =>
    api.post<{ ok: true; message: string; verified?: boolean; devCode?: string }>('/auth/register', { ...data, redirectTo: `${window.location.origin}/verify-email` }),
  /** Confirm the code Supabase emailed. Returns the account status (normally 'pending'). */
  async verifyEmail(email: string, code: string): Promise<{ status: User['status'] }> {
    if (API_MODE !== 'supabase') return api.post('/auth/verify-email', { email, code });
    const { data, error } = await supabase!.auth.verifyOtp({ email, token: code.trim(), type: 'signup' });
    if (error || !data.session) throw authError(error?.message ?? 'Verification failed.');
    return finishVerification();
  },
  /** When the officer clicked the link in the email instead of typing the code. */
  async completeLinkVerification(): Promise<{ status: User['status'] } | null> {
    if (API_MODE !== 'supabase') return null;
    const { data } = await supabase!.auth.getSession();
    if (!data.session?.user.email_confirmed_at) return null;
    return finishVerification();
  },
  async resendCode(email: string): Promise<{ devCode?: string | null }> {
    if (API_MODE !== 'supabase') return api.post('/auth/resend-code', { email });
    const { error } = await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/verify-email` } });
    if (error) throw authError(error.message);
    return {};
  },
};

/** Tell the API the email is verified (notifies admins), then end the temporary session. */
async function finishVerification(): Promise<{ status: User['status'] }> {
  try {
    return await api.post<{ status: User['status'] }>('/auth/email-verified');
  } finally {
    await supabase!.auth.signOut();
  }
}

export const reportService = {
  list: (q: ReportQuery) => api.get<Paginated<Report>>('/reports', q as QueryParams), // GET /reports
  get: (id: string) => api.get<Report>(`/reports/${id}`), // GET /reports/:id
  logView: (id: string) => api.post<{ ok: true }>(`/reports/${id}/view`),
  revealPhone: (id: string) => api.post<{ phone: string }>(`/reports/${id}/reveal-phone`),
  act: (id: string, action: ReportAction) => api.post<Report>(`/reports/${id}/actions`, action), // POST /reports/:id/actions
  sms: (id: string) => api.get<SmsMessage[]>(`/reports/${id}/sms`),
  sendSms: (id: string, message: string, templateKey?: SmsTemplateKey) =>
    api.post<SmsMessage>(`/reports/${id}/sms`, { message, templateKey }),
};

export const smsService = {
  /** Mirrors the SMS gateway webhook. Used by the simulator. */
  simulateInbound: (from: string, body: string) =>
    api.post<InboundResult>('/sms/inbound', { from, body, source: 'simulator' }),
  validate: (body: string) => api.post<ParsedSms>('/sms/validate', { body }),
  /** Later replies to the reporting phone for reports it created (verification, rejection, officer messages). */
  conversation: (phone: string, reportIds: string[], since?: string) =>
    api.get<SmsMessage[]>('/sms/conversation', { phone, reports: reportIds.join(','), since }),
  list: (q: { direction?: string; status?: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<SmsMessage>>('/sms', q),
  retry: (id: string) => api.post<SmsMessage>(`/sms/${id}/retry`),
  templates: () => api.get<SmsTemplate[]>('/sms/templates'),
  updateTemplate: (key: SmsTemplateKey, data: { body: string; active: boolean }) =>
    api.put<SmsTemplate>(`/sms/templates/${key}`, data),
};

export const userService = {
  list: () => api.get<User[]>('/users'),
  create: (data: Partial<User>) => api.post<{ user: User; temporaryPassword: string }>('/users', data),
  update: (id: string, data: Partial<User>) => api.patch<User>(`/users/${id}`, data),
  setStatus: (id: string, status: User['status']) => api.post<User>(`/users/${id}/status`, { status }),
  resetPassword: (id: string) => api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`),
  approve: (id: string, wardIds?: string[]) => api.post<User>(`/users/${id}/approve`, { wardIds }),
  reject: (id: string) => api.post<{ ok: true }>(`/users/${id}/reject`),
  officers: () => api.get<OfficerSummary[]>('/officers'),
};

export const diseaseService = {
  list: () => api.get<Disease[]>('/diseases'),
  create: (data: Partial<Disease>) => api.post<Disease>('/diseases', data),
  update: (id: string, data: Partial<Disease>) => api.patch<Disease>(`/diseases/${id}`, data),
};

export const locationService = {
  tree: () => api.get<LocationTree>('/locations'),
  createWard: (name: string) => api.post<Ward>('/locations/wards', { name }),
  updateWard: (id: string, name: string) => api.patch<Ward>(`/locations/wards/${id}`, { name }),
  createVillage: (data: Partial<Village>) => api.post<Village>('/locations/villages', data),
  updateVillage: (id: string, data: Partial<Village>) => api.patch<Village>(`/locations/villages/${id}`, data),
};

export const alertService = {
  list: () => api.get<Alert[]>('/alerts'),
  update: (id: string, status: AlertStatus, note?: string) => api.patch<Alert>(`/alerts/${id}`, { status, note }),
};

export const notificationService = {
  list: () => api.get<{ items: AppNotification[]; unread: number }>('/notifications'),
  markRead: (id: string) => api.post<{ ok: true }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ ok: true }>('/notifications/read-all'),
  rules: () => api.get<NotificationRule[]>('/settings/notification-rules'),
  saveRules: (rules: NotificationRule[]) => api.put<NotificationRule[]>('/settings/notification-rules', rules),
};

export interface AnalyticsScope {
  diseaseId?: string;
  villageId?: string;
  wardId?: string;
  days?: number;
}

export const analyticsService = {
  summary: () => api.get<DashboardSummary>('/analytics/summary'),
  timeseries: (granularity: Granularity, scope: AnalyticsScope & { periods?: number } = {}) =>
    api.get<TimeBucket[]>('/analytics/timeseries', { granularity, ...scope }),
  byDisease: (scope: AnalyticsScope = {}) => api.get<CountRow[]>('/analytics/by-disease', { ...scope }),
  byLocation: (level: 'village' | 'ward', scope: AnalyticsScope = {}) =>
    api.get<CountRow[]>('/analytics/by-location', { level, ...scope }),
  matrix: (scope: { days?: number; wardId?: string } = {}) => api.get<DiseaseMatrixRow[]>('/analytics/matrix', { ...scope }),
  performance: (scope: AnalyticsScope = {}) => api.get<PerformanceStats>('/analytics/performance', { ...scope }),
  adminSummary: () => api.get<AdminSummary>('/analytics/admin-summary'),
};

export const auditService = {
  list: (q: { search?: string; action?: string; actorId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<AuditLog>>('/audit-logs', q),
};

export const settingsService = {
  public: () => api.get<PublicSettings>('/settings/public'),
  get: () => api.get<SystemSettings>('/settings'),
  update: (s: SystemSettings) => api.put<SystemSettings>('/settings', s),
  resetDemo: () => api.post<{ ok: true }>('/settings/reset-demo'),
};

export const exportService = {
  history: () => api.get<GeneratedReport[]>('/exports'),
  generate: (params: GeneratedReportParams) => api.post<ExportResult>('/exports', params),
  logDownload: (id: string, format: 'pdf' | 'xlsx') => api.post<{ ok: true }>(`/exports/${id}/download`, { format }),
};
