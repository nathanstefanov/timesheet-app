import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../lib/lib/supabaseAdmin';

const ShiftSchema = z.object({
  location_id: z.string().uuid().optional(),     // keep if you add locations later
  start_time: z.string().datetime(),             // ISO from client
  end_time: z.string().datetime().optional().nullable(), // OPTIONAL
  task_notes: z.string().max(1000).optional(),
  status: z.enum(['draft','confirmed','changed']).optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const parsed = ShiftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const { start_time, end_time, task_notes, status } = parsed.data;

    if (end_time && new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .insert([{
        time_in: start_time,
        time_out: end_time ?? null,
        notes: task_notes ?? null,
        shift_type: status ?? 'draft',
        shift_date: start_time.split('T')[0]  // optional convenience
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .select('*')
      .order('time_in', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
}
