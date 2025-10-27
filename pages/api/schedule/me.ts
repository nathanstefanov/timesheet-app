import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Replace this with your real auth user id
  const employeeId = (req.query.employee_id as string) || '';
  if (!employeeId) return res.status(400).json({ error: 'employee_id required' });

  const { data: myAssigns, error: aErr } = await supabaseAdmin
    .from('shift_assignments')
    .select('shift_id')
    .eq('employee_id', employeeId);

  if (aErr) return res.status(500).json({ error: aErr.message });
  const shiftIds = (myAssigns ?? []).map(a => a.shift_id);
  if (shiftIds.length === 0) return res.status(200).json([]);

  const { data: shifts, error: sErr } = await supabaseAdmin
    .from('shifts')
    .select('*')
    .in('id', shiftIds)
    .order('time_in', { ascending: true });

  if (sErr) return res.status(500).json({ error: sErr.message });

  const { data: rosterRows, error: rErr } = await supabaseAdmin
    .from('shift_assignments')
    .select(`shift_id, employee_id`)
    .in('shift_id', shiftIds);

  if (rErr) return res.status(500).json({ error: rErr.message });

  const rosterByShift = new Map<string, string[]>();
  (rosterRows ?? []).forEach(r => {
    const arr = rosterByShift.get(r.shift_id) ?? [];
    arr.push(r.employee_id);
    rosterByShift.set(r.shift_id, arr);
  });

  const result = (shifts ?? []).map(s => ({
    ...s,
    roster_employee_ids: rosterByShift.get(s.id) ?? []
  }));

  res.status(200).json(result);
}
