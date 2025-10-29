import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
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
