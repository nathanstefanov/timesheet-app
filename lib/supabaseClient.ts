// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,          // <-- set in .env.local and Vercel
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,     // <-- set in .env.local and Vercel
  {
    auth: {
      persistSession: true,       // keep user logged in across refreshes
      autoRefreshToken: true,     // refresh tokens in the background
      detectSessionInUrl: true,   // handle magic-link redirects
      storageKey: 'timesheet-auth'
    }
  }
);
