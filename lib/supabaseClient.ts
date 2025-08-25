// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// If you're still testing with literals, you *can* temporarily fall back to them:
// const url = 'https://miwlxkotxlldqwcmifow.supabase.co/';
// const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...<snip>';

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // important if you ever use OAuth
    flowType: 'pkce',
    storageKey: 'gg_timesheet_auth', // unique key prevents collisions
  },
  global: {
    // Avoid service worker / cache weirdness that can cause "working..." stuck states
    fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
