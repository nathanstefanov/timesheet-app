// pages/api/sendShiftSms.ts
import type { NextApiResponse } from 'next';
import { z } from 'zod';
import Twilio from 'twilio';
import { requireAdmin, type AuthenticatedRequest, handleApiError } from '../../lib/middleware';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { isTwilioConfigured } from '../../lib/env';
import { formatForDisplay } from '../../lib/timezone';

// Zod schema for request validation
const SendShiftSmsSchema = z.object({
  shift_id: z.string().uuid('shift_id must be a valid UUID'),
  employee_ids: z.array(z.string().uuid('employee_id must be a valid UUID')).min(1, 'At least one employee_id is required'),
});

const twilio = isTwilioConfigured() ? Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
) : null;

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check if Twilio is configured
    if (!twilio) {
      return res.status(503).json({ error: 'SMS service is not configured' });
    }

    // Validate request body with Zod
    const parsed = SendShiftSmsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: parsed.error.errors.map(e => e.message).join(', ')
      });
    }

    const { shift_id, employee_ids } = parsed.data;

    // Get shift details
    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from('schedule_shifts')
      .select('start_time, location_name, address, job_type')
      .eq('id', shift_id)
      .single();

    if (shiftErr || !shift) {
      console.error('[sendShiftSms] Failed to load shift:', shiftErr);
      throw shiftErr || new Error('Shift not found');
    }

    // Get ONLY the newly added employees
    const { data: employees, error: empErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', employee_ids)
      .eq('sms_opt_in', true);

    if (empErr) {
      console.error('[sendShiftSms] Failed to load employees:', empErr);
      throw empErr;
    }

    // Format date and time in user's timezone (America/Chicago)
    const dateStr = formatForDisplay(shift.start_time, 'EEE, MMM d');
    const timeStr = formatForDisplay(shift.start_time, 'h:mm a');

    const results = [];

    for (const emp of employees || []) {
      if (!emp.phone) continue;

      // Build location line (include address if available)
      const locationLine = shift.address
        ? `📍 ${shift.location_name ?? 'Location'}\n   ${shift.address}`
        : `📍 ${shift.location_name ?? 'Location'}`;

      const message =
        `🔔 New Shift Assignment\n\n` +
        `${locationLine}\n\n` +
        `📅 ${dateStr}\n` +
        `🕒 ${timeStr}\n` +
        `👷 ${shift.job_type ?? 'General'}\n\n` +
        `View full details:\n${process.env.NEXT_PUBLIC_APP_URL}/me/schedule\n\n` +
        `Questions? Contact Lance.\n` +
        `Text STOP to unsubscribe.`;

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
  } catch (error) {
    return handleApiError(error, res, 'Sending shift SMS');
  }
}

export default requireAdmin(handler);
