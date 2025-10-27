import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

const AssignSchema = z.object({
  employee_ids: z.array(z.string().uuid()).min(1),
  assigned_by: z.string().uuid().optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST'); return res.status(405).end();
  }

  const shift_id = req.query.id as string;
  const parsed = AssignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const rows = parsed.data.employee_ids.map(eid => ({
    shift_id, employee_id: eid, assigned_by: parsed.data.assigned_by ?? null
  }));

  const { data, error } = await supabaseAdmin
    .from('shift_assignments')
    .insert(rows)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
}
