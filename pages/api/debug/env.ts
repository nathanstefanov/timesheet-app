import type { NextApiResponse } from 'next';
import { requireAdmin, type AuthenticatedRequest } from '../../../lib/middleware';

function handler(_req: AuthenticatedRequest, res: NextApiResponse) {
  // Report only presence (not values) for sensitive keys to avoid leaking secrets.
  const keys = [
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const result: Record<string, boolean> = {};
  for (const k of keys) {
    result[k] = typeof process.env[k] !== 'undefined' && process.env[k] !== '';
  }

  return res.status(200).json({ ok: true, present: result });
}

export default requireAdmin(handler);
