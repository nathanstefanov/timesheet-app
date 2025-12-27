// lib/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use a unique storage key so auth state doesn't collide with other apps on the same domain.
const STORAGE_KEY = 'tsapp-auth-v1';

// Create a storage adapter that checks both localStorage and sessionStorage
const customStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    // Check sessionStorage first (for non-persistent sessions)
    const sessionValue = window.sessionStorage.getItem(key);
    if (sessionValue) return sessionValue;
    // Fall back to localStorage (for persistent sessions)
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    // By default, store in localStorage (persistent)
    window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: STORAGE_KEY,
    storage: customStorage,
    debug: false,
  },
  // Avoid stale fetches during auth transitions (Chrome can be aggressive)
  global: {
    fetch: (input, init) =>
      fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});

// Helper function to set session storage type
export function setSessionStorageType(useSessionStorage: boolean) {
  if (typeof window === 'undefined') return;

  const currentSession = window.localStorage.getItem(STORAGE_KEY) ||
                        window.sessionStorage.getItem(STORAGE_KEY);

  if (currentSession) {
    if (useSessionStorage) {
      // Move to sessionStorage (non-persistent)
      window.sessionStorage.setItem(STORAGE_KEY, currentSession);
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      // Move to localStorage (persistent)
      window.localStorage.setItem(STORAGE_KEY, currentSession);
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }
}