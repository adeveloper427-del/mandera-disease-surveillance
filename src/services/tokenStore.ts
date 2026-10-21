import { supabase } from '@/lib/supabase';

/**
 * Where the session token lives.
 * - mock mode: a demo token in localStorage.
 * - supabase mode: Supabase Auth owns the session (and refreshes it); we keep the
 *   current access token in memory so it can be read synchronously.
 */
const KEY = 'msdss.token';
const supabaseMode = import.meta.env.VITE_API_MODE === 'supabase' && !!supabase;
let accessToken: string | null = null;

if (supabaseMode) {
  // Restore a persisted session synchronously from supabase-js storage, then track changes.
  try {
    const raw = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (raw) accessToken = JSON.parse(localStorage.getItem(raw) ?? 'null')?.access_token ?? null;
  } catch {
    // ignore
  }
  supabase!.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
  });
}

export const tokenStore = {
  get(): string | null {
    if (supabaseMode) return accessToken;
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    if (supabaseMode) {
      accessToken = token;
      return;
    }
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // ignore
    }
  },
  clear() {
    if (supabaseMode) {
      accessToken = null;
      return;
    }
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  },
};
