// pages/api/schedule/me.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the user from Supabase auth cookie/JWT via admin getUser
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    let userId: string | null = null;
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error) userId = data.user?.id ?? null;
    }

    // Fallback: if you’re proxying with client fetch (no bearer),
    // use RLS-safe pattern if you already pass userId via header/query.
    if (!userId && req.query.user_id && typeof req.query.user_id === 'string') {
      userId = req.query.user_id;
    }

    if (!userId) {
      // still return an array to keep the client safe
      return res.status(200).json([]);
    }

    // 1) find shifts the user is assigned to
    const { data: assigns, error: aErr } = await supabaseAdmin
      .from('shift_assignments')
      .select('shift_id')
      .eq('employee_id', userId);

    if (aErr) return res.status(500).json({ error: aErr.message });
    const ids = (assigns || []).map((r: any) => r.shift_id);
    if (ids.length === 0) return res.status(200).json([]);

    // 2) load those shifts
    const { data: shifts, error: sErr } = await supabaseAdmin
      .from('shifts')
      .select('id, time_in, time_out, job_type, location_name, address, status')
      .in('id', ids)
      .order('time_in', { ascending: true });

    if (sErr) return res.status(500).json({ error: sErr.message });

    // 3) for each shift, load teammates (profiles) except the current user
    const result = await Promise.all(
      (shifts || []).map(async (sh: any) => {
        const { data: matesRows } = await supabaseAdmin
          .from('shift_assignments')
          .select('employee_id, profiles!inner(id, full_name)')
          .eq('shift_id', sh.id)
          .neq('employee_id', userId);

        const mates = (matesRows || []).map((r: any) => ({
          id: r.profiles?.id ?? r.employee_id,
          full_name: r.profiles?.full_name ?? null,
        }));

        return { ...sh, mates };
      })
    );

    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unexpected error' });
  }
}
