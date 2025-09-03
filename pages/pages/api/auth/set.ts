// pages/api/auth/set.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseServerClient } from '../../../lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { event, session } = req.body ?? {};
  const supabase = createSupabaseServerClient(req, res);

  // Touch the session so cookie plumbing is ready
  await supabase.auth.getSession();

  if (event === 'SIGNED_OUT') {
    await supabase.auth.signOut();
    return res.status(200).json({ ok: true });
  }

  if (session?.access_token && session?.refresh_token) {
    // This will write HTTP-only cookies via the helper
    // @ts-ignore – allowed here, works at runtime
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  return res.status(200).json({ ok: true });
}
