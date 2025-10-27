import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const PatchSchema = z.object({
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().nullable().optional(),
  location_name: z.string().min(1).max(200).optional(),
  address: z.string().min(3).max(300).optional(),
  job_type: z.enum(['setup','event','breakdown','other']).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['draft','confirmed','changed']).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (req.method === 'PATCH') {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const p = parsed.data;

    if (p.start_time && p.end_time && new Date(p.end_time) <= new Date(p.start_time)) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    const update: Record<string, any> = {};
    for (const k of Object.keys(p) as (keyof typeof p)[]) {
      update[k] = (p as any)[k];
    }

    const { data, error } = await supabaseAdmin
      .from('schedule_shifts')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('schedule_shifts')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['PATCH','DELETE']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
