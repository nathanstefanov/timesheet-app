// lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';

export function createSupabaseServerClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies[name];
        },
        set(name: string, value: string, options: CookieOptions) {
          const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; ${
            options.maxAge ? `Max-Age=${options.maxAge};` : ''
          } ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`;
          res.setHeader('Set-Cookie', [
            ...(Array.isArray(res.getHeader('Set-Cookie')) ? (res.getHeader('Set-Cookie') as string[]) : []),
            cookie.trim(),
          ]);
        },
        remove(name: string, _opts: CookieOptions) {
          res.setHeader('Set-Cookie', [
            ...(Array.isArray(res.getHeader('Set-Cookie')) ? (res.getHeader('Set-Cookie') as string[]) : []),
            `${name}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax; ${
              process.env.NODE_ENV === 'production' ? 'Secure;' : ''
            }`.trim(),
          ]);
        },
      },
    }
  );
}
