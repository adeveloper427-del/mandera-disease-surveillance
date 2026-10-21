import { beforeEach, describe, expect, it } from 'vitest';
import { mockRequest } from '@/mock';
import { db, resetDb } from '@/mock/db';
import type { DashboardSummary, InboundResult, Paginated, Report, Session } from '@/types';

/** End-to-end flows through the mock backend, exactly as the UI calls it. */
async function call<T>(method: string, path: string, body?: unknown, token: string | null = null, query?: Record<string, string>) {
  return mockRequest<T>(method, path, { body, token, query });
}

async function login(email: string, password: string) {
  return (await call<Session>('POST', '/auth/login', { email, password })).token;
}

beforeEach(() => {
  resetDb();
  db().settings.mock.latencyMs = 0;
  db().settings.mock.failureRate = 0;
});

describe('seed data', () => {
  it('contains the Rhamu cholera outbreak scenario', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    const alerts = await call<{ id: string; level: string; count: number }[]>('GET', '/alerts', undefined, token);
    const rhamu = alerts.find((a) => a.id === 'd_cholera:v_rhamu');
    expect(rhamu?.level).toBe('outbreak');
    expect(rhamu?.count).toBeGreaterThanOrEqual(15);
  });
});

describe('auth & authorization', () => {
  it('rejects bad credentials with a generic message', async () => {
    await expect(login('ahmed.hassan@msdss.demo', 'wrong')).rejects.toMatchObject({ status: 401, message: 'Incorrect email or password.' });
  });
  it('blocks disabled accounts', async () => {
    await expect(login('omar.ali@msdss.demo', 'Officer@123')).rejects.toMatchObject({ status: 403 });
  });
  it('forbids officers from admin endpoints', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    await expect(call('GET', '/users', undefined, token)).rejects.toMatchObject({ status: 403 });
  });
  it('requires a session for protected endpoints', async () => {
    await expect(call('GET', '/reports')).rejects.toMatchObject({ status: 401 });
  });
  it('lets admins in and never returns passwords', async () => {
    const token = await login('admin@mandera.com', 'admin123!');
    const users = await call<Record<string, unknown>[]>('GET', '/users', undefined, token);
    expect(users.length).toBeGreaterThan(3);
    expect(users.every((u) => !('password' in u))).toBe(true);
  });
});

describe('SMS to verified report', () => {
  it('runs the full workflow and keeps the dashboard in sync', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    const before = await call<DashboardSummary>('GET', '/analytics/summary', undefined, token);

    const res = await call<InboundResult>('POST', '/sms/inbound', { from: '0799123456', body: 'REPORT#Abdullahi#35#Rhamu#Cholera', source: 'simulator' });
    expect(res.report).not.toBeNull();
    expect(res.reply.body).toBe(`Your disease report has been received successfully. Report ID: ${res.report!.id}.`);
    expect(res.steps.every((s) => s.status === 'done')).toBe(true);
    expect(res.report!.phone).toContain('•'); // masked in API responses

    const after = await call<DashboardSummary>('GET', '/analytics/summary', undefined, token);
    expect(after.total).toBe(before.total + 1);
    expect(after.byStatus.pending).toBe(before.byStatus.pending + 1);

    const id = res.report!.id;
    await expect(call('POST', `/reports/${id}/actions`, { type: 'verify', notifyResident: true }, token)).rejects.toMatchObject({ status: 409 });
    await call('POST', `/reports/${id}/actions`, { type: 'start_review' }, token);
    const verified = await call<Report>('POST', `/reports/${id}/actions`, { type: 'verify', remark: 'Confirmed at facility.', notifyResident: true }, token);
    expect(verified.status).toBe('verified');
    expect(verified.outcome).toBe('verified');
    expect(verified.assignedOfficerId).toBe('u_ahmed');

    const sms = await call<{ body: string }[]>('GET', `/reports/${id}/sms`, undefined, token);
    expect(sms.some((m) => m.body.includes(`Your disease report ${id} has been verified`))).toBe(true);

    const final = await call<DashboardSummary>('GET', '/analytics/summary', undefined, token);
    expect(final.byStatus.verified).toBe(before.byStatus.verified + 1);
  });

  it('rejects invalid SMS without creating a report', async () => {
    const count = db().reports.length;
    const res = await call<InboundResult>('POST', '/sms/inbound', { from: '0799123456', body: 'REPORT#Abdullahi#abc#Rhamu#Cholera' });
    expect(res.report).toBeNull();
    expect(res.reply.body).toContain('Invalid format. Use: REPORT#Name#Age#Location#Disease.');
    expect(db().reports.length).toBe(count);
  });

  it('requires a reason to reject', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    const res = await call<InboundResult>('POST', '/sms/inbound', { from: '0799123456', body: 'REPORT#Ali#40#Kutulo#Typhoid' });
    const id = res.report!.id;
    await call('POST', `/reports/${id}/actions`, { type: 'start_review' }, token);
    await expect(call('POST', `/reports/${id}/actions`, { type: 'reject', remark: ' ', notifyResident: true }, token)).rejects.toMatchObject({ status: 422 });
  });
});

describe('report search & filters', () => {
  it('filters by status and paginates', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    const page = await call<Paginated<Report>>('GET', '/reports', undefined, token, { status: 'pending', pageSize: '5', page: '1' });
    expect(page.items.length).toBeLessThanOrEqual(5);
    expect(page.items.every((r) => r.status === 'pending')).toBe(true);
  });
  it('finds a report by ID', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    const page = await call<Paginated<Report>>('GET', '/reports', undefined, token, { search: 'MS001' });
    expect(page.items[0].id).toBe('MS001');
  });
});

describe('health officer self-registration', () => {
  const request = { name: 'Halima Noor', email: 'halima.noor@msdss.demo', phone: '0711222333', title: 'Nurse', wardIds: ['w_kutulo'], password: 'Strong@123' };

  it('requires email verification, then admin approval', async () => {
    const { devCode } = await call<{ devCode: string }>('POST', '/auth/register', request);
    await expect(login(request.email, request.password)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('verify your email') });

    const adminToken = await login('admin@mandera.com', 'admin123!');
    const pending = (await call<{ id: string; status: string; email: string }[]>('GET', '/users', undefined, adminToken)).find((u) => u.email === request.email)!;
    expect(pending.status).toBe('pending');
    await expect(call('POST', `/users/${pending.id}/approve`, {}, adminToken)).rejects.toMatchObject({ status: 409 });

    await expect(call('POST', '/auth/verify-email', { email: request.email, code: '000000' })).rejects.toMatchObject({ status: 422 });
    await call('POST', '/auth/verify-email', { email: request.email, code: devCode });
    await expect(login(request.email, request.password)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('awaiting approval') });

    await call('POST', `/users/${pending.id}/approve`, {}, adminToken);

    expect(await login(request.email, request.password)).toBeTruthy();
  });

  it('rejects duplicates, weak passwords and removes rejected requests', async () => {
    await call('POST', '/auth/register', request);
    await expect(call('POST', '/auth/register', request)).rejects.toMatchObject({ status: 409 });
    await expect(call('POST', '/auth/register', { ...request, email: 'x@msdss.demo', password: 'weak' })).rejects.toMatchObject({ status: 422 });
    const adminToken = await login('admin@mandera.com', 'admin123!');
    const pending = (await call<{ id: string; email: string }[]>('GET', '/users', undefined, adminToken)).find((u) => u.email === request.email)!;
    await call('POST', `/users/${pending.id}/reject`, {}, adminToken);
    await expect(login(request.email, request.password)).rejects.toMatchObject({ status: 401 });
  });
});

describe('audit trail', () => {
  it('records phone reveals', async () => {
    const token = await login('ahmed.hassan@msdss.demo', 'Officer@123');
    const { phone } = await call<{ phone: string }>('POST', '/reports/MS001/reveal-phone', undefined, token);
    expect(phone.startsWith('+254')).toBe(true);
    expect(db().auditLogs[0].action).toBe('report.phone_revealed');
  });
});
