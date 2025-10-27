import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const PatchSchema = z.object({
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().nullable().optional(),
  task_notes: z.string().max(1000).optional(),
  status: z.enum(['draft','confirmed','changed']).optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === 'PATCH') {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const p = parsed.data;

    if (p.start_time && p.end_time && new Date(p.end_time) <= new Date(p.start_time)) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    const update: any = {};
    if (p.start_time !== undefined) update.time_in = p.start_time;
    if (p.end_time !== undefined) update.time_out = p.end_time; // can be null to clear
    if (p.task_notes !== undefined) update.notes = p.task_notes;
    if (p.status !== undefined) update.shift_type = p.status;

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin.from('shifts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  res.status(405).end();
}
