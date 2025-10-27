// pages/api/schedule/shifts/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

const ShiftSchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional().nullable(),
  location_name: z.string().min(1).max(200).optional(),
  address: z.string().min(3).max(300).optional(),
  job_type: z.enum(['setup','event','breakdown','other']).optional(),
  task_notes: z.string().max(1000).optional(),
  status: z.enum(['draft','confirmed','changed']).optional(),
  created_by: z.string().uuid(),
});

const JOB_TO_SHIFT_TYPE = {
  setup: 'Setup',
  breakdown: 'Breakdown',
  event: 'Shop',
  other: 'Shop',
} as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(200).end();
  }

  try {
    const supabaseAdmin = getSupabaseAdmin(); // ← lazy; throws inside try/catch

    if (req.method === 'POST') {
      const parsed = ShiftSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const { start_time, end_time, task_notes, status, location_name, address, job_type, created_by } = parsed.data;
      if (end_time && new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ error: 'end_time must be after start_time' });
      }

      const shift_type = JOB_TO_SHIFT_TYPE[(job_type ?? 'other') as keyof typeof JOB_TO_SHIFT_TYPE];

      const { data, error } = await supabaseAdmin
        .from('shifts')
        .insert([{
          user_id: created_by,
          time_in: start_time,
          time_out: end_time ?? null,
          notes: task_notes ?? null,
          status: status ?? 'draft',
          shift_type,
          location_name: location_name ?? null,
          address: address ?? null,
          job_type: job_type ?? null,
          shift_date: start_time.split('T')[0],
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

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e: any) {
    // If envs are missing you’ll see this JSON instead of a generic HTML /500
    return res.status(500).json({ error: e?.message || 'Unexpected server error' });
  }
}
