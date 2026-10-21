import type { Disease, NotificationRule, Village, Ward } from '@/types';
import { DISEASE_CATEGORIES } from '@/types';
import { ApiError } from '@/services/apiClient';
import { normalize, uid } from '@/lib/utils';
import { db, resetDb } from '../db';
import { publicUser, route } from '../router';
import { audit, now, paginate, requireFields } from '../helpers';

// ---------- Reference data (public: contains no personal data) ----------
route('GET', '/locations', 'public', () => ({
  constituency: db().constituency,
  wards: db().wards,
  villages: db().villages,
}));

route('GET', '/diseases', 'public', () => db().diseases);

route('GET', '/settings/public', 'public', () => {
  const s = db().settings;
  return { systemName: s.systemName, smsKeyword: s.smsKeyword, smsShortcode: s.smsShortcode, maskPhoneNumbers: s.maskPhoneNumbers };
});

// ---------- Diseases ----------
function validateDisease(body: Partial<Disease>, id?: string) {
  requireFields(body as Record<string, unknown>, ['name', 'category', 'alertThreshold', 'alertWindowHours', 'basePriority']);
  if (!DISEASE_CATEGORIES.includes(body.category!)) throw new ApiError(422, 'Choose a valid category.');
  if (!(Number(body.alertThreshold) >= 1)) throw new ApiError(422, 'Alert threshold must be at least 1 report.');
  if (!(Number(body.alertWindowHours) >= 1 && Number(body.alertWindowHours) <= 720))
    throw new ApiError(422, 'Alert window must be between 1 and 720 hours.');
  const clash = db().diseases.find((d) => d.id !== id && normalize(d.name) === normalize(body.name!));
  if (clash) throw new ApiError(409, `A disease named "${clash.name}" already exists.`);
}

route('POST', '/diseases', 'admin', ({ body, user }) => {
  validateDisease(body);
  const d: Disease = {
    id: uid('d'),
    name: String(body.name).trim(),
    category: body.category,
    description: String(body.description ?? '').trim(),
    alertThreshold: Number(body.alertThreshold),
    alertWindowHours: Number(body.alertWindowHours),
    basePriority: body.basePriority,
    active: body.active ?? true,
    aliases: Array.isArray(body.aliases) ? body.aliases.filter(Boolean) : [],
  };
  db().diseases.push(d);
  audit(user, 'disease.created', 'disease', d.id, `Added disease ${d.name} (${d.category}).`);
  return d;
});

route('PATCH', '/diseases/:id', 'admin', ({ params, body, user }) => {
  const d = db().diseases.find((x) => x.id === params.id);
  if (!d) throw new ApiError(404, 'Disease not found.');
  const next = { ...d, ...body };
  validateDisease(next, d.id);
  const changes: string[] = [];
  if (next.alertThreshold !== d.alertThreshold || next.alertWindowHours !== d.alertWindowHours)
    changes.push(`alert threshold ${next.alertThreshold} reports / ${next.alertWindowHours} h`);
  if (next.active !== d.active) changes.push(next.active ? 'enabled' : 'disabled');
  Object.assign(d, {
    ...next,
    alertThreshold: Number(next.alertThreshold),
    alertWindowHours: Number(next.alertWindowHours),
  });
  audit(user, 'disease.updated', 'disease', d.id, `Updated ${d.name}${changes.length ? `: ${changes.join(', ')}` : ''}.`);
  return d;
});

// ---------- Locations ----------
route('POST', '/locations/wards', 'admin', ({ body, user }) => {
  requireFields(body, ['name']);
  if (db().wards.some((w) => normalize(w.name) === normalize(body.name))) throw new ApiError(409, 'A ward with that name already exists.');
  const w: Ward = { id: uid('w'), name: String(body.name).trim(), constituencyId: db().constituency.id };
  db().wards.push(w);
  audit(user, 'location.created', 'location', w.id, `Added ward ${w.name}.`);
  return w;
});

route('PATCH', '/locations/wards/:id', 'admin', ({ params, body, user }) => {
  const w = db().wards.find((x) => x.id === params.id);
  if (!w) throw new ApiError(404, 'Ward not found.');
  requireFields(body, ['name']);
  w.name = String(body.name).trim();
  audit(user, 'location.updated', 'location', w.id, `Renamed ward to ${w.name}.`);
  return w;
});

function validateVillage(body: Partial<Village>, id?: string) {
  requireFields(body as Record<string, unknown>, ['name', 'wardId', 'lat', 'lng']);
  if (!db().wards.some((w) => w.id === body.wardId)) throw new ApiError(422, 'Choose a valid ward.');
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!(lat >= -5 && lat <= 5.5 && lng >= 33 && lng <= 42.5)) throw new ApiError(422, 'Coordinates must be within Kenya.');
  const clash = db().villages.find(
    (v) => v.id !== id && [v.name, ...v.aliases].some((a) => normalize(a) === normalize(body.name!)),
  );
  if (clash) throw new ApiError(409, `"${body.name}" is already used by ${clash.name}. SMS location names must be unique.`);
}

route('POST', '/locations/villages', 'admin', ({ body, user }) => {
  validateVillage(body);
  const v: Village = {
    id: uid('v'),
    name: String(body.name).trim(),
    wardId: body.wardId,
    lat: Number(body.lat),
    lng: Number(body.lng),
    population: Number(body.population) || 0,
    active: body.active ?? true,
    aliases: Array.isArray(body.aliases) ? body.aliases.filter(Boolean) : [],
  };
  db().villages.push(v);
  audit(user, 'location.created', 'location', v.id, `Added village ${v.name}.`);
  return v;
});

route('PATCH', '/locations/villages/:id', 'admin', ({ params, body, user }) => {
  const v = db().villages.find((x) => x.id === params.id);
  if (!v) throw new ApiError(404, 'Village not found.');
  const next = { ...v, ...body };
  validateVillage(next, v.id);
  Object.assign(v, { ...next, lat: Number(next.lat), lng: Number(next.lng), population: Number(next.population) || 0 });
  audit(user, 'location.updated', 'location', v.id, `Updated village ${v.name}${body.active === false ? ' (disabled)' : ''}.`);
  return v;
});

// ---------- Users ----------
route('GET', '/users', 'admin', () => db().users.map(publicUser));

function validateUser(body: Record<string, unknown>, id?: string) {
  requireFields(body, ['name', 'email', 'role']);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) throw new ApiError(422, 'Enter a valid email address.');
  if (!['admin', 'officer'].includes(String(body.role))) throw new ApiError(422, 'Choose a valid role.');
  const clash = db().users.find((u) => u.id !== id && u.email.toLowerCase() === String(body.email).toLowerCase());
  if (clash) throw new ApiError(409, 'Another account already uses that email.');
}

function tempPassword() {
  return `Tmp-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}a`;
}

route('POST', '/users', 'admin', ({ body, user }) => {
  validateUser(body);
  const password = tempPassword();
  const u = {
    id: uid('u'),
    name: String(body.name).trim(),
    email: String(body.email).trim().toLowerCase(),
    phone: String(body.phone ?? '').trim(),
    role: body.role,
    title: String(body.title ?? (body.role === 'admin' ? 'Administrator' : 'Health Officer')).trim(),
    status: 'active' as const,
    wardIds: Array.isArray(body.wardIds) ? body.wardIds : [],
    lastLoginAt: null,
    createdAt: now(),
    password,
  };
  db().users.push(u);
  audit(user, 'user.created', 'user', u.id, `Created ${u.role === 'admin' ? 'administrator' : 'health officer'} account for ${u.name}.`);
  return { user: publicUser(u), temporaryPassword: password };
});

route('PATCH', '/users/:id', 'admin', ({ params, body, user }) => {
  const u = db().users.find((x) => x.id === params.id);
  if (!u) throw new ApiError(404, 'User not found.');
  const next = { ...u, ...body, password: u.password, id: u.id };
  validateUser(next, u.id);
  if (u.id === user!.id && next.role !== 'admin') throw new ApiError(409, 'You cannot remove your own administrator role.');
  Object.assign(u, next);
  audit(user, 'user.updated', 'user', u.id, `Updated account for ${u.name}.`);
  return publicUser(u);
});

route('POST', '/users/:id/status', 'admin', ({ params, body, user }) => {
  const u = db().users.find((x) => x.id === params.id);
  if (!u) throw new ApiError(404, 'User not found.');
  if (u.id === user!.id) throw new ApiError(409, 'You cannot disable your own account.');
  u.status = body.status === 'disabled' ? 'disabled' : 'active';
  if (u.status === 'disabled') {
    // Sign the user out everywhere.
    for (const [t, s] of Object.entries(db().sessions)) if (s.userId === u.id) delete db().sessions[t];
  }
  audit(user, u.status === 'disabled' ? 'user.disabled' : 'user.enabled', 'user', u.id, `${u.status === 'disabled' ? 'Disabled' : 'Enabled'} account for ${u.name}.`);
  return publicUser(u);
});

route('POST', '/users/:id/approve', 'admin', ({ params, body, user }) => {
  const u = db().users.find((x) => x.id === params.id);
  if (!u) throw new ApiError(404, 'User not found.');
  if (u.status !== 'pending') throw new ApiError(409, 'This account is not awaiting approval.');
  if (u.emailVerified === false) throw new ApiError(409, 'This person has not verified their email address yet.');
  u.status = 'active';
  if (Array.isArray(body?.wardIds) && body.wardIds.length) u.wardIds = body.wardIds;
  audit(user, 'user.approved', 'user', u.id, `${user!.name} approved the health officer account for ${u.name}.`);
  db().notifications.unshift({
    id: uid('n'), userId: u.id, type: 'system', title: 'Your account has been approved',
    message: 'Welcome to the Mandera South Disease Surveillance System.', link: '/app', read: false, createdAt: now(),
  });
  return publicUser(u);
});

route('POST', '/users/:id/reject', 'admin', ({ params, user }) => {
  const u = db().users.find((x) => x.id === params.id);
  if (!u) throw new ApiError(404, 'User not found.');
  if (u.status !== 'pending') throw new ApiError(409, 'Only pending requests can be rejected. Disable active accounts instead.');
  db().users = db().users.filter((x) => x.id !== u.id);
  db().notifications = db().notifications.filter((n) => n.userId !== u.id);
  audit(user, 'user.rejected', 'user', null, `${user!.name} rejected the account request from ${u.name} (${u.email}).`);
  return { ok: true };
});

route('POST', '/users/:id/reset-password', 'admin', ({ params, user }) => {
  const u = db().users.find((x) => x.id === params.id);
  if (!u) throw new ApiError(404, 'User not found.');
  const password = tempPassword();
  u.password = password;
  audit(user, 'user.password_reset', 'user', u.id, `Reset password for ${u.name}.`);
  return { temporaryPassword: password };
});

// ---------- Settings ----------
route('GET', '/settings', 'admin', () => db().settings);

route('PUT', '/settings', 'admin', ({ body, user }) => {
  const s = db().settings;
  requireFields(body, ['systemName', 'reportIdPrefix', 'smsKeyword']);
  if (!/^[A-Z]{1,4}$/.test(body.reportIdPrefix)) throw new ApiError(422, 'Report ID prefix must be 1 to 4 capital letters.');
  if (!/^[A-Z]{3,12}$/.test(body.smsKeyword)) throw new ApiError(422, 'SMS keyword must be 3 to 12 capital letters.');
  const changed = Object.keys(body).filter((k) => JSON.stringify((s as unknown as Record<string, unknown>)[k]) !== JSON.stringify(body[k]));
  Object.assign(s, body);
  audit(user, 'settings.updated', 'settings', null, `Updated system settings${changed.length ? `: ${changed.join(', ')}` : ''}.`);
  return s;
});

route('POST', '/settings/reset-demo', 'admin', () => {
  resetDb();
  return { ok: true };
});

route('GET', '/settings/notification-rules', 'admin', () => db().notificationRules);

route('PUT', '/settings/notification-rules', 'admin', ({ body, user }) => {
  if (!Array.isArray(body)) throw new ApiError(422, 'Expected a list of rules.');
  db().notificationRules = body as NotificationRule[];
  audit(user, 'settings.updated', 'settings', null, 'Updated notification settings.');
  return db().notificationRules;
});

// ---------- Audit logs ----------
route('GET', '/audit-logs', 'admin', ({ query }) => {
  let list = db().auditLogs;
  if (query.action) list = list.filter((a) => a.action.startsWith(query.action));
  if (query.actorId) list = list.filter((a) => (query.actorId === 'system' ? a.actorId === null : a.actorId === query.actorId));
  if (query.dateFrom) list = list.filter((a) => a.at >= new Date(`${query.dateFrom}T00:00:00`).toISOString());
  if (query.dateTo) list = list.filter((a) => a.at <= new Date(`${query.dateTo}T23:59:59.999`).toISOString());
  if (query.search) {
    const s = query.search.toLowerCase();
    list = list.filter((a) => a.details.toLowerCase().includes(s) || a.actorName.toLowerCase().includes(s) || (a.entityId ?? '').toLowerCase().includes(s));
  }
  return paginate(list, query);
});
