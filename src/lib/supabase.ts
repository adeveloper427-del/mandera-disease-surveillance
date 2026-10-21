import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, used for sign-in only. All data goes through the `api` Edge
 * Function. The publishable key is safe to ship to the browser: tables have RLS
 * enabled with no client policies.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export const SUPABASE_FUNCTIONS_URL = url ? `${url}/functions/v1/api` : '';
export const SUPABASE_KEY = key ?? '';
