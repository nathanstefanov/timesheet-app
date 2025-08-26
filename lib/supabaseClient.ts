// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use sessionStorage to avoid Safari/localStorage issues.
// (Falls back to in-memory if sessionStorage is unavailable.)
const STORAGE_KEY = 'gg_timesheet_auth';

const safeSessionStorage =
  typeof window !== 'undefined' && 'sessionStorage' in window
    ? window.sessionStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: safeSessionStorage as any,
    storageKey: STORAGE_KEY,
  },
  global: {
    fetch: (input, init) =>
      fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
