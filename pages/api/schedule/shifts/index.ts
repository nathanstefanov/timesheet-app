// pages/api/schedule/shifts/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const ShiftSchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional().nullable(),
  location_name: z.string().min(1).max(200).optional(),
  address: z.string().min(3).max(300).optional(),
  job_type: z.enum(['setup', 'event', 'breakdown', 'other']).optional(),
  task_notes: z.string().max(1000).optional(),
  status: z.enum(['draft', 'confirmed', 'changed']).optional(),
  created_by: z.string().uuid(), // admin user id (required by your NOT NULL user_id)
});

// lowercase → exact DB values
const JOB_TO_SHIFT_TYPE: Record<string, 'Setup' | 'Breakdown' | 'Shop'> = {
  setup: 'Setup',
  breakdown: 'Breakdown',
  event: 'Shop',
  other: 'Shop',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle CORS preflight if your browser sends it
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const parsed = ShiftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const {
        start_time,
        end_time,
        task_notes,
        status,
        location_name,
        address,
        job_type,
        created_by,
      } = parsed.data;

      if (end_time && new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ error: 'end_time must be after start_time' });
      }

      const shift_type = JOB_TO_SHIFT_TYPE[job_type ?? 'other']; // always valid: Setup/Breakdown/Shop

      const { data, error } = await supabaseAdmin
        .from('shifts')
        .insert([
          {
            user_id: created_by,                // satisfy NOT NULL
            time_in: start_time,
            time_out: end_time ?? null,         // optional end time
            notes: task_notes ?? null,
            status: status ?? 'draft',
            shift_type,                         // must be one of: Setup | Breakdown | Shop
            // scheduling-only fields:
            location_name: location_name ?? null,
            address: address ?? null,
            job_type: job_type ?? null,
            shift_date: start_time.split('T')[0],
          },
        ])
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
    console.error('shifts/index error:', e);
    return res.status(500).json({ error: e?.message || 'Unexpected server error' });
  }
}
