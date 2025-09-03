// pages/api/auth/set.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

function makeServerClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return req.cookies[name]; },
        set(name, value, options: CookieOptions) {
          const cookie = [
            `${name}=${value}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            options.maxAge ? `Max-Age=${options.maxAge}` : '',
            process.env.NODE_ENV === 'production' ? 'Secure' : '',
          ].filter(Boolean).join('; ');
          res.appendHeader('Set-Cookie', cookie);
        },
        remove(name) {
          const cookie = [
            `${name}=`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            'Max-Age=0',
            process.env.NODE_ENV === 'production' ? 'Secure' : '',
          ].filter(Boolean).join('; ');
          res.appendHeader('Set-Cookie', cookie);
        },
      },
    }
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { event, session } = req.body ?? {};

  // Input validation
  if (typeof event !== 'string' || (session && (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string'))) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const supabase = makeServerClient(req, res);

  // Touch session (ensures cookie helpers are wired)
  await supabase.auth.getSession();

  if (event === 'SIGNED_OUT') {
    await supabase.auth.signOut();
    return res.status(200).json({ ok: true });
  }

  if (session?.access_token && session?.refresh_token) {
    // @ts-ignore (internal API is OK here)
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  res.status(200).json({ ok: true });
}
