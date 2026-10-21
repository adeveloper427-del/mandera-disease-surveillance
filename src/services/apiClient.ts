/**
 * Single entry point for all backend calls.
 *
 * VITE_API_MODE=mock     -> requests go to the in-browser mock backend in src/mock.
 * VITE_API_MODE=supabase -> requests go to the Supabase `api` Edge Function with the
 *                           signed-in user's Supabase access token.
 *
 * Services only ever call api.get/post/patch/put/delete with REST paths; both
 * backends implement the same endpoints.
 */
import { supabase, SUPABASE_FUNCTIONS_URL, SUPABASE_KEY } from '@/lib/supabase';
import { tokenStore } from './tokenStore';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_MODE: 'mock' | 'supabase' = import.meta.env.VITE_API_MODE === 'supabase' && supabase ? 'supabase' : 'mock';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Listeners notified on 401 so the auth layer can sign the user out. */
const unauthorizedListeners = new Set<() => void>();
export function onUnauthorized(fn: () => void) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

function buildQuery(query?: QueryParams) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function httpRequest<T>(method: Method, path: string, query?: QueryParams, body?: unknown): Promise<T> {
  // getSession() refreshes an expired access token before we use it.
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_FUNCTIONS_URL}${path}${buildQuery(query)}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection and try again.');
  }
  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const data = await res.json();
      message = data.message ?? message;
      details = data.details;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(res.status, message, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function request<T>(method: Method, path: string, query?: QueryParams, body?: unknown): Promise<T> {
  try {
    if (API_MODE === 'supabase') return await httpRequest<T>(method, path, query, body);
    // Loaded lazily so the mock backend is split out of the main bundle.
    const { mockRequest } = await import('@/mock');
    return await mockRequest<T>(method, path, { query, body, token: tokenStore.get() });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith('/auth/login')) {
      unauthorizedListeners.forEach((fn) => fn());
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string, query?: QueryParams) => request<T>('GET', path, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, undefined, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, undefined, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, undefined, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
