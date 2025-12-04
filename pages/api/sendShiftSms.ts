// pages/api/sendShiftSms.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import twilio from 'twilio';

// Inline Twilio client so we don't need a separate module
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  throw new Error('Missing Twilio environment variables');
}

const twilioClient = twilio(accountSid, authToken);

function formatShiftMessage(shift: any, employeeName: string) {
  const start = new Date(shift.start_time);
  const end = new Date(shift.end_time);

  const date = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  let msg = `${employeeName}, you’ve been scheduled for a shift on ${date} from ${startTime} to ${endTime}`;

  if (shift.location_name) {
    msg += ` at ${shift.location_name}.`;
  } else if (shift.address) {
    msg += ` at ${shift.address}.`;
  } else {
    msg += `.`;
  }

  msg += ' Reply to your manager if you have any questions.';
  return msg;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    const { scheduleShiftId } = req.body;

    if (!scheduleShiftId) {
      return res.status(400).json({ error: 'Missing scheduleShiftId in body' });
    }

    // 1) Load the shift + all assignments + employee profiles
    const { data: shift, error } = await supabaseAdmin
      .from('schedule_shifts')
      .select(
        `
        id,
        start_time,
        end_time,
        location_name,
        address,
        job_type,
        schedule_assignments (
          employee_id,
          profiles (
            full_name,
            phone
          )
        )
      `
      )
      .eq('id', scheduleShiftId)
      .single();

    if (error || !shift) {
      console.error('Shift lookup error', error);
      return res.status(404).json({ error: 'Shift not found' });
    }

    const assignments = shift.schedule_assignments || [];

    if (!assignments.length) {
      console.warn('No assignments for shift', scheduleShiftId);
      return res.status(200).json({ ok: true, info: 'No employees assigned' });
    }

    // 2) For each assigned employee, send SMS if they have a phone
    const sendPromises: Promise<any>[] = [];

    for (const assignment of assignments) {
      const profile = assignment.profiles;
      const phone = profile?.phone;

      if (!phone) {
        console.warn('No phone number for employee', assignment.employee_id);
        continue;
      }

      const name = profile.full_name || 'You';
      const body = formatShiftMessage(shift, name);

      sendPromises.push(
        twilioClient.messages.create({
          from: process.env.TWILIO_FROM_NUMBER!,
          to: phone,
          body,
        })
      );
    }

    await Promise.all(sendPromises);

    return res.status(200).json({ ok: true, sent: sendPromises.length });
  } catch (err) {
    console.error('SMS handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
