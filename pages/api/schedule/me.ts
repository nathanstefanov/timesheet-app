// pages/api/schedule/me.ts
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { withAuth, type AuthenticatedRequest, handleApiError } from '../../../lib/middleware';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  try {
    const userId = req.user.id;

    // Find my schedule shift ids
    const { data: assigns, error: aErr } = await supabaseAdmin
      .from('schedule_assignments')
      .select('schedule_shift_id')
      .eq('employee_id', userId);

    if (aErr) throw aErr;

    const ids = (assigns ?? []).map((r: any) => r.schedule_shift_id);
    if (ids.length === 0) return res.status(200).json([]);

    // Load shifts INCLUDING notes
    const { data: shifts, error: sErr } = await supabaseAdmin
      .from('schedule_shifts')
      .select(
        'id, start_time, end_time, job_type, location_name, address, status, notes'
      )
      .in('id', ids)
      .order('start_time', { ascending: true });

    if (sErr) throw sErr;

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

        // make sure notes is passed through
        return {
          id: sh.id,
          start_time: sh.start_time,
          end_time: sh.end_time,
          job_type: sh.job_type,
          location_name: sh.location_name,
          address: sh.address,
          status: sh.status,
          notes: sh.notes ?? null,
          mates,
        };
      })
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleApiError(error, res, 'Loading employee schedule');
  }
}

export default withAuth(handler, { requireAuth: true });
