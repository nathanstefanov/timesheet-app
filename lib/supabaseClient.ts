// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Note: no multiTab flag in v2. The onAuthStateChange dedupe in _app.tsx handles multi-tab noise.
  },
  global: {
    fetch: (input, init) =>
      fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
