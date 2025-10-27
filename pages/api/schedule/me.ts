import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    let userId: string | null = null;
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error) userId = data.user?.id ?? null;
    }
    if (!userId) return res.status(200).json([]);

    // Find my schedule shift ids
    const { data: assigns, error: aErr } = await supabaseAdmin
      .from('schedule_assignments')
      .select('schedule_shift_id')
      .eq('employee_id', userId);

    if (aErr) return res.status(500).json({ error: aErr.message });
    const ids = (assigns ?? []).map((r: any) => r.schedule_shift_id);
    if (ids.length === 0) return res.status(200).json([]);

    // Load shifts
    const { data: shifts, error: sErr } = await supabaseAdmin
      .from('schedule_shifts')
      .select('id, start_time, end_time, job_type, location_name, address, status')
      .in('id', ids)
      .order('start_time', { ascending: true });

    if (sErr) return res.status(500).json({ error: sErr.message });

    // Load teammates for each shift
    const result = await Promise.all(
      (shifts ?? []).map(async (sh: any) => {
        const { data: matesRows } = await supabaseAdmin
          .from('schedule_assignments')
          .select('employee_id, profiles!inner(id, full_name)')
          .eq('schedule_shift_id', sh.id)
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
