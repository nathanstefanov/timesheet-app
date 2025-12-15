// pages/api/sendShiftSms.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const twilio = Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shift_id, employee_ids } = req.body as {
    shift_id?: string;
    employee_ids?: string[];
  };

  if (!shift_id || !employee_ids || employee_ids.length === 0) {
    return res.status(400).json({ error: 'Missing shift_id or employee_ids' });
  }

  // Get shift details
  const { data: shift, error: shiftErr } = await supabase
    .from('schedule_shifts')
    .select('start_time, location_name, address, job_type')
    .eq('id', shift_id)
    .single();

  if (shiftErr || !shift) {
    return res.status(500).json({ error: 'Shift not found' });
  }

  // Get ONLY the newly added employees
  const { data: employees, error: empErr } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', employee_ids)
    .eq('sms_opt_in', true);

  if (empErr) {
    return res.status(500).json({ error: 'Failed to load employees' });
  }

  const when = new Date(shift.start_time).toLocaleString();

  const results = [];

  for (const emp of employees || []) {
    if (!emp.phone) continue;

    const message =
      `You’ve been scheduled for a shift.\n\n` +
      `${shift.location_name ?? 'Location'}\n` +
      `${when}\n` +
      `Role: ${shift.job_type ?? 'Shift'}\n\n` +
      `View schedule: ${process.env.NEXT_PUBLIC_APP_URL}/me/schedule\n\n` +
      `Reply STOP to opt out.`;

    try {
      const msg = await twilio.messages.create({
        to: emp.phone,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
      });

      results.push({ employee_id: emp.id, sid: msg.sid });
    } catch (err: any) {
      console.error('Twilio error:', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    sent: results.length,
  });
}
