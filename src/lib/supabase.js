// The one Supabase client for the browser. It only ever has the URL and the publishable key:
// those are safe in the browser because every table has Row Level Security on.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(url && key) && !/secret|service_role/i.test(key || '');

export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

// Can we reach the database? A free Supabase project pauses after a week without use, and phones go offline.
// Returns { ok: true } or { ok: false, reason: 'offline' | 'paused' | 'error' }.
export async function checkReachable(timeoutMs = 8000) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: ctrl.signal });
    if (res.ok) return { ok: true };
    return { ok: false, reason: res.status >= 500 || res.status === 404 ? 'paused' : 'error' };
  } catch {
    return { ok: false, reason: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'paused' };
  } finally {
    clearTimeout(timer);
  }
}
