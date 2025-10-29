// pages/api/schedule/shifts/[id]/assign.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

const BodySchema = z.object({
  employee_ids: z.array(z.string().uuid()).min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing schedule_shift_id' });

  if (req.method === 'POST') {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const rows = parsed.data.employee_ids.map((empId) => ({
      schedule_shift_id: id,
      employee_id: empId,
    }));

    const { data, error } = await supabaseAdmin
      .from('schedule_assignments')
      .upsert(rows, { onConflict: 'schedule_shift_id,employee_id' })
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, assigned: data?.length ?? 0 });
  }

  if (req.method === 'DELETE') {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const { error } = await supabaseAdmin
      .from('schedule_assignments')
      .delete()
      .eq('schedule_shift_id', id)
      .in('employee_id', parsed.data.employee_ids);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, removed: parsed.data.employee_ids.length });
  }

  res.setHeader('Allow', ['POST', 'DELETE']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
