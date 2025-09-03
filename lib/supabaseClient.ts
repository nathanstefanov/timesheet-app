// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// IMPORTANT: a unique storageKey avoids collisions with other projects/domains
const STORAGE_KEY = 'tsapp-auth-v1';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Reduce cross-tab noise that can cause races in Chrome
    debug: false,
  },
  // Prevent cached fetch weirdness during auth
  global: { fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }) },
});
