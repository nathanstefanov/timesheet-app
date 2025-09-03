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
    // ↓ This avoids cross-tab broadcast churn/races
    multiTab: false,
  },
  global: {
    fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
