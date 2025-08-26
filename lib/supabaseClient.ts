// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** -------- Cookie storage (instead of localStorage) -------- */
const COOKIE_KEY = 'gg_timesheet_auth'; // keep your unique key

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function writeCookie(name: string, value: string, days = 90) {
  if (typeof document === 'undefined') return;
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${d.toUTCString()}`;
  // SameSite=Lax + Secure for production HTTPS; Secure is ignored on http://localhost
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax${secure}`;
}
function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

const cookieStorage = {
  getItem: (key: string) => readCookie(key),
  setItem: (key: string, value: string) => writeCookie(key, value),
  removeItem: (key: string) => deleteCookie(key),
};

/** ---------------------------------------------------------- */

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // PKCE is fine; keep it on. detectSessionInUrl true is harmless.
    flowType: 'pkce',
    detectSessionInUrl: true,
    storage: cookieStorage as any,
    storageKey: COOKIE_KEY,
  },
  global: {
    // avoid any stale caches on auth calls
    fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
