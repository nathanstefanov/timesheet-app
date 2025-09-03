// pages/api/auth/set.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseServerClient } from '../../../lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Mirror the provided session into Supabase SSR cookies.
  // Body should be: { event: string, session: object | null }
  const { event, session } = req.body || {};
  const supabase = createSupabaseServerClient(req, res);

  // This no-op read triggers cookie logic in the helper; then we overwrite tokens below.
  await supabase.auth.getSession();

  // Write / clear cookies explicitly:
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || session) {
    // Set both access and refresh tokens into cookies
    // @ts-ignore - private API is okay here
    await supabase.auth.setSession({
      access_token: session?.access_token,
      refresh_token: session?.refresh_token,
    });
  }
  if (event === 'SIGNED_OUT') {
    // @ts-ignore
    await supabase.auth.signOut();
  }

  res.status(200).json({ ok: true });
}
