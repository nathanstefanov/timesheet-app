// pages/api/sendShiftUpdateSms.ts
import type { NextApiResponse } from 'next';
import { z } from 'zod';
import Twilio from 'twilio';
import { requireAdmin, type AuthenticatedRequest, handleApiError } from '../../lib/middleware';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { isTwilioConfigured } from '../../lib/env';

// Zod schema for request validation
const ChangeSchema = z.object({
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
});

const SendShiftUpdateSmsSchema = z.object({
  shift_id: z.string().uuid('shift_id must be a valid UUID'),
  changes: z.object({
    start_time: ChangeSchema.optional(),
    end_time: ChangeSchema.optional(),
    location_name: ChangeSchema.optional(),
    address: ChangeSchema.optional(),
  }).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one change must be provided' }
  ),
});

const twilio = isTwilioConfigured() ? Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
) : null;

function fmt(dtIso?: string | null) {
  if (!dtIso) return '';
  return new Date(dtIso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Check if Twilio is configured
    if (!twilio) {
      return res.status(503).json({ error: 'SMS service is not configured' });
    }

    // Validate request body with Zod
    const parsed = SendShiftUpdateSmsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: parsed.error.errors.map(e => e.message).join(', ')
      });
    }

    const { shift_id, changes } = parsed.data;

    // Pull current assignments for this shift
    const { data: assigns, error: aErr } = await supabaseAdmin
      .from('schedule_assignments')
      .select('employee_id')
      .eq('schedule_shift_id', shift_id);

    if (aErr) {
      console.error('[sendShiftUpdateSms] Failed to load assignments:', aErr);
      throw aErr;
    }

    const employeeIds = (assigns || []).map((x: any) => x.employee_id);
    if (employeeIds.length === 0) return res.status(200).json({ success: true, sent: 0 });

    // Load shift (for context)
    const { data: shift, error: sErr } = await supabaseAdmin
      .from('schedule_shifts')
      .select('start_time, end_time, location_name, address, job_type')
      .eq('id', shift_id)
      .single();

    if (sErr || !shift) {
      console.error('[sendShiftUpdateSms] Failed to load shift:', sErr);
      throw sErr || new Error('Shift not found');
    }

    // Load employee phone numbers (ONLY opt-in)
    const { data: emps, error: eErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', employeeIds)
      .eq('sms_opt_in', true);

    if (eErr) {
      console.error('[sendShiftUpdateSms] Failed to load employees:', eErr);
      throw eErr;
    }

    // Build a compact "what changed" block
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
  } catch (error) {
    return handleApiError(error, res, 'Sending shift update SMS');
  }
}

export default requireAdmin(handler);
