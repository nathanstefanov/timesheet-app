import type { NextApiRequest, NextApiResponse } from 'next';
import { setAuthCookie } from '@supabase/auth-helpers-nextjs';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Mirrors client auth state to httpOnly cookies for SSR
  return setAuthCookie(req, res);
}
