// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use a unique storage key so auth state doesn't collide with other apps on the same domain.
const STORAGE_KEY = 'tsapp-auth-v1';

// One-time cleanup of old storage keys
if (typeof window !== 'undefined') {
  const MIGRATION_FLAG = 'tsapp-storage-migrated';
  if (!localStorage.getItem(MIGRATION_FLAG)) {
    // Remove old default Supabase auth keys
    const oldKeys = [
      'sb-auth-token',
      'supabase.auth.token',
      'sb-localhost-auth-token',
    ];

    oldKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        console.log('[Auth Migration] Removing old storage key:', key);
        localStorage.removeItem(key);
      }
    });

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG, 'true');
    console.log('[Auth Migration] Storage migration complete');
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: STORAGE_KEY,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    debug: false,
  },
  // Avoid stale fetches during auth transitions (Chrome can be aggressive)
  global: {
    fetch: (input, init) =>
      fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});