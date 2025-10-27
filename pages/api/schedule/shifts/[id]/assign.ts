import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

const AssignSchema = z.object({
  employee_ids: z.array(z.string().uuid()).min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing schedule_shift_id' });

  const parsed = AssignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const { employee_ids } = parsed.data;

  const rows = employee_ids.map((empId) => ({
    schedule_shift_id: id,
    employee_id: empId,
    // optionally assigned_by from auth token, omitted for brevity
  }));

  const { data, error } = await supabaseAdmin
    .from('schedule_assignments')
    .upsert(rows, { onConflict: 'schedule_shift_id,employee_id' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, assigned: data?.length ?? 0 });
}
