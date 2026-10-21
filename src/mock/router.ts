import type { User } from '@/types';
import { ApiError, type QueryParams } from '@/services/apiClient';
import { sleep } from '@/lib/utils';
import { db, persist } from './db';

export interface HandlerContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  user: User | null;
  token: string | null;
}

type Access = 'public' | 'user' | 'admin';
type Handler = (ctx: HandlerContext) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  access: Access;
  handler: Handler;
}

const routes: Route[] = [];

/** Register a mock endpoint. Pattern uses Express-style params: /reports/:id */
export function route(method: string, path: string, access: Access, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:(\w+)/g, (_, k: string) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, pattern, keys, access, handler });
}

export function publicUser(u: User & { password?: string }): User {
  // Never send credentials to the client.
  const { password: _password, ...rest } = u;
  void _password;
  return rest;
}

function resolveUser(token: string | null): User | null {
  if (!token) return null;
  const s = db().sessions[token];
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    delete db().sessions[token];
    persist();
    return null;
  }
  const u = db().users.find((x) => x.id === s.userId);
  if (!u || u.status !== 'active') return null;
  // Sliding idle timeout.
  s.expiresAt = new Date(Date.now() + db().settings.sessionTimeoutMinutes * 60_000).toISOString();
  return publicUser(u);
}

export async function mockRequest<T>(
  method: string,
  path: string,
  opts: { query?: QueryParams; body?: unknown; token: string | null },
): Promise<T> {
  const { latencyMs, failureRate } = db().settings.mock;
  await sleep(latencyMs * (0.6 + Math.random() * 0.8));

  const match = routes
    .filter((r) => r.method === method)
    .map((r) => ({ r, m: path.match(r.pattern) }))
    .find((x) => x.m);
  if (!match || !match.m) throw new ApiError(404, `No endpoint for ${method} ${path}`);

  if (failureRate > 0 && !path.startsWith('/auth') && !path.startsWith('/settings') && Math.random() < failureRate) {
    throw new ApiError(503, 'The server could not be reached (simulated network failure).');
  }

  const user = resolveUser(opts.token);
  if (match.r.access !== 'public' && !user) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  if (match.r.access === 'admin' && user?.role !== 'admin')
    throw new ApiError(403, 'You do not have permission to perform this action.');

  const params: Record<string, string> = {};
  match.r.keys.forEach((k, i) => (params[k] = decodeURIComponent(match.m![i + 1])));
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== '') query[k] = String(v);

  const result = match.r.handler({ params, query, body: opts.body ?? {}, user, token: opts.token });
  persist();
  // Clone so UI code can never mutate the "database" by reference.
  return (result === undefined ? undefined : structuredClone(result)) as T;
}
