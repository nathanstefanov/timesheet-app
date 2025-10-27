// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use a unique storage key so auth state doesn't collide with other apps on the same domain.
const STORAGE_KEY = 'tsapp-auth-v1';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: STORAGE_KEY, // ✅ ensures consistent restore across reloads/tabs
    debug: false,
  },
  // Avoid stale fetches during auth transitions (Chrome can be aggressive)
  global: {
    fetch: (input, init) =>
      fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
