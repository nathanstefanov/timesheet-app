// pages/api/auth/set.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { event, session } = req.body ?? {};

  // Build the server client inline; no external helper import needed.
  const supabase = createServerSupabaseClient(
    { req, res },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );

  // Touch session to ensure cookie plumbing is live
  await supabase.auth.getSession();

  if (event === 'SIGNED_OUT') {
    await supabase.auth.signOut();
    return res.status(200).json({ ok: true });
  }

  if (session?.access_token && session?.refresh_token) {
    // This writes the HTTP-only cookies via the helper
    // @ts-ignore: setSession is available at runtime
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  return res.status(200).json({ ok: true });
}
