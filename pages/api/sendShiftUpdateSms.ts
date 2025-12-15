// pages/api/sendShiftUpdateSms.ts
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

function fmt(dtIso?: string | null) {
  if (!dtIso) return '';
  return new Date(dtIso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { shift_id, changes } = req.body as {
    shift_id?: string;
    changes?: {
      start_time?: { from: string | null; to: string | null };
      end_time?: { from: string | null; to: string | null };
      location_name?: { from: string | null; to: string | null };
      address?: { from: string | null; to: string | null };
    };
  };

  if (!shift_id || !changes) {
    return res.status(400).json({ error: 'Missing shift_id or changes' });
  }

  // Pull current assignments for this shift
  const { data: assigns, error: aErr } = await supabase
    .from('schedule_assignments')
    .select('employee_id')
    .eq('schedule_shift_id', shift_id);

  if (aErr) return res.status(500).json({ error: 'Failed to load assignments' });

  const employeeIds = (assigns || []).map((x: any) => x.employee_id);
  if (employeeIds.length === 0) return res.status(200).json({ success: true, sent: 0 });

  // Load shift (for context)
  const { data: shift, error: sErr } = await supabase
    .from('schedule_shifts')
    .select('start_time, end_time, location_name, address, job_type')
    .eq('id', shift_id)
    .single();

  if (sErr || !shift) return res.status(500).json({ error: 'Shift not found' });

  // Load employee phone numbers (ONLY opt-in)
  const { data: emps, error: eErr } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', employeeIds)
    .eq('sms_opt_in', true);

  if (eErr) return res.status(500).json({ error: 'Failed to load employees' });

  // Build a compact “what changed” block
  const lines: string[] = [];
  if (changes.start_time) lines.push(`Start: ${fmt(changes.start_time.from)} → ${fmt(changes.start_time.to)}`);
  if (changes.end_time) lines.push(`End: ${fmt(changes.end_time.from)} → ${fmt(changes.end_time.to)}`);
  if (changes.location_name) lines.push(`Location: ${changes.location_name.from || '—'} → ${changes.location_name.to || '—'}`);
  if (changes.address) lines.push(`Address: ${changes.address.from || '—'} → ${changes.address.to || '—'}`);

  const changeBlock = lines.join('\n');

  // Optional schedule link (recommended)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '';
  const scheduleLink = baseUrl ? `${baseUrl}/me/schedule` : '';

  let sent = 0;

  for (const emp of emps || []) {
    if (!emp.phone) continue;

    const msg =
      `Shift updated.\n\n` +
      `${changeBlock}\n\n` +
      (scheduleLink ? `View schedule: ${scheduleLink}\n\n` : '') +
      `Reply STOP to opt out.`;

    try {
      await twilio.messages.create({
        to: emp.phone,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: msg,
      });
      sent += 1;
    } catch (err: any) {
      console.error('Twilio update SMS error:', err?.message || err);
    }
  }

  return res.status(200).json({ success: true, sent });
}
