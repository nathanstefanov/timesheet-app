// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anon) {
  // This log helps catch "No API key found..." instantly
  // eslint-disable-next-line no-console
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    // keep cache off, but *do not* strip headers
    fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
  },
});
