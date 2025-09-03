// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// ---- ENV (must point to the SAME project everywhere) ----
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A clearly new key so we never collide with old, broken values.
const STORAGE_KEY = 'sb-timesheet-v3';

// Remove any stale/legacy keys from older project refs or older client versions.
// Run once on first import (safe in browser; no-op on SSR where localStorage doesn't exist).
(function purgeLegacyKeys() {
  if (typeof window === 'undefined') return;
  try {
    // Default key format: sb-<project-ref>-auth-token
    // Also clear any earlier custom keys you had.
    const legacyPrefixes = [
      'sb-',                   // default format for other project refs
      'supabase.auth.token',   // (older libs)
      'sb-timesheet-auth',     // your older custom key (if you used this)
      'sb-timesheet-v2',       // just in case
    ];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (legacyPrefixes.some(p => k.startsWith(p)) && k !== STORAGE_KEY) {
        // Don’t remove CURRENT storage key
        // Mark to delete after loop (can’t mutate while iterating)
      }
    }
    // Second pass delete (avoid index jumping)
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (k !== STORAGE_KEY && (k.startsWith('sb-') || k.startsWith('sb_timesheet') || k.includes('supabase'))) {
        toDelete.push(k);
      }
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  } catch {
    // ignore
  }
})();

// Safe storage wrapper: if something corrupted is in storage, drop it instead of poisoning the client.
const safeLocalStorage = {
  getItem(key: string) {
    try {
      const v = window.localStorage.getItem(key);
      if (!v) return null;
      // Supabase stores JSON; if parse fails, blow it away so we start clean.
      JSON.parse(v);
      return v;
    } catch {
      try { window.localStorage.removeItem(key); } catch {}
      return null;
    }
  },
  setItem(key: string, value: string) {
    try { window.localStorage.setItem(key, value); } catch {}
  },
  removeItem(key: string) {
    try { window.localStorage.removeItem(key); } catch {}
  },
};

// Single client instance for the whole app.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: STORAGE_KEY,
    storage: typeof window === 'undefined' ? undefined : (safeLocalStorage as any),
    flowType: 'pkce',
    // Optional: set a short-ish refresh margin so we proactively refresh before expiry
    // refreshToken: <handled internally>,
  },
  global: {
    fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
