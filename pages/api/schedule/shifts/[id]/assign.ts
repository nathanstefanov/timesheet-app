// pages/api/schedule/shifts/[id]/assign.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

type ApiResponse =
  | { ok: true }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing schedule_shift_id in URL.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ADD ASSIGNMENTS
  if (req.method === 'POST') {
    const { employee_ids } = req.body as { employee_ids?: string[] };

    if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ error: 'employee_ids array is required.' });
    }

    const uniqueIds = Array.from(new Set(employee_ids));

    const rows = uniqueIds.map((empId) => ({
      schedule_shift_id: id,
      employee_id: empId,
    }));

    // If you have a unique index on (schedule_shift_id, employee_id),
    // this upsert will keep it clean. If not, it still behaves like insert.
    const { error } = await supabaseAdmin
      .from('schedule_assignments')
      .upsert(rows, {
        onConflict: 'schedule_shift_id,employee_id',
      });

    if (error) {
      console.error('assign POST error', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  // REMOVE ASSIGNMENTS
  if (req.method === 'DELETE') {
    const { employee_ids } = req.body as { employee_ids?: string[] };

    if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ error: 'employee_ids array is required.' });
    }

    const { error } = await supabaseAdmin
      .from('schedule_assignments')
      .delete()
      .eq('schedule_shift_id', id)
      .in('employee_id', employee_ids);

    if (error) {
      console.error('assign DELETE error', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'POST, DELETE, OPTIONS');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
