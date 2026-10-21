import type { Session } from '@/types';
import { ApiError } from '@/services/apiClient';
import { uid } from '@/lib/utils';
import { db } from '../db';
import { publicUser, route } from '../router';
import { audit, now, requireFields } from '../helpers';
import { toE164 } from '@/lib/format';

export function passwordProblems(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[A-Z]/.test(pw)) issues.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) issues.push('a lowercase letter');
  if (!/\d/.test(pw)) issues.push('a number');
  return issues;
}

function assertStrong(pw: string) {
  const issues = passwordProblems(pw);
  if (issues.length) throw new ApiError(422, `Password must contain ${issues.join(', ')}.`);
}

route('POST', '/auth/login', 'public', ({ body }) => {
  requireFields(body, ['email', 'password']);
  const email = String(body.email).trim().toLowerCase();
  const u = db().users.find((x) => x.email.toLowerCase() === email);
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!u || u.password !== body.password) throw new ApiError(401, 'Incorrect email or password.');
  if (u.emailVerified === false)
    throw new ApiError(403, 'Please verify your email address before signing in. Check your inbox for the code.');
  if (u.status === 'pending')
    throw new ApiError(403, 'Your account is awaiting approval by the administrator. You will be able to sign in once it is approved.');
  if (u.status !== 'active') throw new ApiError(403, 'This account has been disabled. Contact your system administrator.');
  const token = uid('tok');
  const expiresAt = new Date(Date.now() + db().settings.sessionTimeoutMinutes * 60_000).toISOString();
  db().sessions[token] = { userId: u.id, expiresAt };
  u.lastLoginAt = now();
  audit(publicUser(u), 'auth.login', 'session', null, `${u.name} logged in.`);
  const session: Session = { token, user: publicUser(u), expiresAt };
  return session;
});

route('POST', '/auth/register', 'public', ({ body }) => {
  requireFields(body, ['name', 'email', 'phone', 'password']);
  const email = String(body.email).trim().toLowerCase();
  const phone = toE164(String(body.phone));
  const wardIds: string[] = Array.isArray(body.wardIds) ? body.wardIds : [];
  if (String(body.name).trim().length < 3) throw new ApiError(422, 'Enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(422, 'Enter a valid email address.');
  if (!phone) throw new ApiError(422, 'Enter a valid Kenyan mobile number, e.g. 0712 345 678.');
  assertStrong(String(body.password));
  if (!wardIds.length || wardIds.some((w) => !db().wards.some((x) => x.id === w))) throw new ApiError(422, 'Choose at least one ward you work in.');
  if (db().users.some((u) => u.email.toLowerCase() === email))
    throw new ApiError(409, 'An account with this email already exists or is awaiting approval.');
  const u = {
    id: uid('u'),
    name: String(body.name).trim(),
    email,
    phone,
    role: 'officer' as const,
    title: String(body.title ?? '').trim() || 'Health Officer',
    status: 'pending' as const,
    wardIds,
    lastLoginAt: null,
    createdAt: now(),
    emailVerified: false,
    password: String(body.password),
  };
  db().users.push(u);
  const wardNames = wardIds.map((w) => db().wards.find((x) => x.id === w)?.name).join(', ');
  audit(publicUser(u), 'user.registered', 'user', u.id, `${u.name} requested a health officer account (${wardNames}).`);
  const devCode = issueCode(email);
  // devCode is returned only by the in-browser mock (no email server). Supabase emails the real code.
  return { ok: true, message: `We sent a verification code to ${email}. Enter it to confirm your email address.`, devCode };
});

function issueCode(email: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  (db().verifyCodes ??= {})[email] = { code, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() };
  return code;
}

route('POST', '/auth/resend-code', 'public', ({ body }) => {
  const email = String(body.email ?? '').trim().toLowerCase();
  const u = db().users.find((x) => x.email === email && x.emailVerified === false);
  // Same response whether or not the account exists.
  return { ok: true, devCode: u ? issueCode(email) : null };
});

route('POST', '/auth/verify-email', 'public', ({ body }) => {
  const email = String(body.email ?? '').trim().toLowerCase();
  const entry = db().verifyCodes?.[email];
  const u = db().users.find((x) => x.email === email);
  if (!u || !entry || entry.code !== String(body.code ?? '').trim() || new Date(entry.expiresAt).getTime() < Date.now())
    throw new ApiError(422, 'That code is incorrect or has expired. Check the code or request a new one.');
  delete db().verifyCodes![email];
  if (u.emailVerified === false) {
    u.emailVerified = true;
    audit(publicUser(u), 'user.updated', 'user', u.id, `${u.name} verified their email address.`);
    const wardNames = u.wardIds.map((w) => db().wards.find((x) => x.id === w)?.name).join(', ');
    for (const a of db().users.filter((x) => x.role === 'admin' && x.status === 'active'))
      db().notifications.unshift({
        id: uid('n'), userId: a.id, type: 'system', title: 'New health officer awaiting approval',
        message: `${u.name} (${email}) verified their email and requested access for ${wardNames}.`, link: '/admin/users?status=pending', read: false, createdAt: now(),
      });
  }
  return { ok: true, status: u.status };
});

route('POST', '/auth/logout', 'user', ({ user, token }) => {
  if (token) delete db().sessions[token];
  audit(user, 'auth.logout', 'session', null, `${user!.name} logged out.`);
  return { ok: true };
});

route('GET', '/auth/me', 'user', ({ user }) => user);

route('POST', '/auth/forgot-password', 'public', ({ body }) => {
  requireFields(body, ['email']);
  const u = db().users.find((x) => x.email.toLowerCase() === String(body.email).trim().toLowerCase());
  let devResetToken: string | null = null;
  if (u && u.status === 'active') {
    devResetToken = uid('rst');
    db().resetTokens[devResetToken] = { userId: u.id, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  }
  // The real backend emails the link and never returns the token.
  return {
    message: 'If an account exists for that email, a password reset link has been sent.',
    devResetToken,
  };
});

route('POST', '/auth/reset-password', 'public', ({ body }) => {
  requireFields(body, ['token', 'password']);
  const entry = db().resetTokens[body.token];
  if (!entry || new Date(entry.expiresAt).getTime() < Date.now())
    throw new ApiError(400, 'This reset link is invalid or has expired. Request a new one.');
  assertStrong(body.password);
  const u = db().users.find((x) => x.id === entry.userId)!;
  u.password = body.password;
  delete db().resetTokens[body.token];
  audit(publicUser(u), 'auth.password_reset', 'user', u.id, `${u.name} reset their password via email link.`);
  return { ok: true };
});

route('POST', '/auth/change-password', 'user', ({ body, user }) => {
  requireFields(body, ['currentPassword', 'newPassword']);
  const u = db().users.find((x) => x.id === user!.id)!;
  if (u.password !== body.currentPassword) throw new ApiError(422, 'Current password is incorrect.');
  if (body.currentPassword === body.newPassword) throw new ApiError(422, 'New password must be different from the current one.');
  assertStrong(body.newPassword);
  u.password = body.newPassword;
  audit(user, 'auth.password_changed', 'user', u.id, `${u.name} changed their password.`);
  return { ok: true };
});

route('PATCH', '/auth/profile', 'user', ({ body, user }) => {
  requireFields(body, ['name']);
  const u = db().users.find((x) => x.id === user!.id)!;
  u.name = String(body.name).trim();
  if (body.phone !== undefined) u.phone = String(body.phone).trim();
  audit(user, 'user.updated', 'user', u.id, `${u.name} updated their profile.`);
  return publicUser(u);
});
