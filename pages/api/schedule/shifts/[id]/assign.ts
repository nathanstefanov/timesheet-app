// pages/api/schedule/shifts/[id]/assign.ts
import type { NextApiResponse } from 'next';
import twilio from 'twilio';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireAdmin, type AuthenticatedRequest, handleApiError } from '../../../../../lib/middleware';

type ApiResponse = { ok: true } | { error: string };

function getBaseUrl(req: AuthenticatedRequest) {
  // Prefer an explicit env if you have it
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (env) return env.replace(/\/$/, '');

  // Fallback: build from request
  const proto =
    (req.headers['x-forwarded-proto'] as string) ||
    (req.socket as any)?.encrypted
      ? 'https'
      : 'http';

  const host =
    (req.headers['x-forwarded-host'] as string) ||
    (req.headers.host as string) ||
    'localhost:3000';

  return `${proto}://${host}`;
}

function fmtShiftText(shift: any) {
  const start = shift?.start_time ? new Date(shift.start_time) : null;
  const end = shift?.end_time ? new Date(shift.end_time) : null;

  const date = start
    ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'TBD';

  const startTime = start
    ? start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'TBD';

  const endTime = end
    ? end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

  return { date, startTime, endTime };
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse>
) {
  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing schedule_shift_id in URL.' });
    }

    // ADD ASSIGNMENTS (+ SMS ONLY TO NEW ADDS)
    if (req.method === 'POST') {
      const { employee_ids } = req.body as { employee_ids?: string[] };

      if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
        return res.status(400).json({ error: 'employee_ids array is required.' });
      }

      const uniqueIds = Array.from(new Set(employee_ids));

      // 1) Find who is ALREADY assigned (so we don't re-text them)
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from('schedule_assignments')
        .select('employee_id')
        .eq('schedule_shift_id', id)
        .in('employee_id', uniqueIds);

      if (existingErr) {
        console.error('assign POST existing check error', existingErr);
        throw existingErr;
      }

      const existingSet = new Set((existing || []).map((r: any) => r.employee_id as string));
      const newlyAddedIds = uniqueIds.filter((empId) => !existingSet.has(empId));

      // 2) Upsert assignments
      const rows = uniqueIds.map((empId) => ({
        schedule_shift_id: id,
        employee_id: empId,
      }));

      const { error: upsertErr } = await supabaseAdmin
        .from('schedule_assignments')
        .upsert(rows, { onConflict: 'schedule_shift_id,employee_id' });

      if (upsertErr) {
        console.error('assign POST upsert error', upsertErr);
        throw upsertErr;
      }

    // 3) If nobody newly added, done (no SMS)
    if (newlyAddedIds.length === 0) {
      return res.status(200).json({ ok: true });
    }

    // 4) Load shift details once
    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from('schedule_shifts')
      .select('id, start_time, end_time, location_name, address, job_type, notes')
      .eq('id', id)
      .single();

    if (shiftErr) {
      console.error('assign POST shift load error', shiftErr);
      // assignments already saved; still return ok
      return res.status(200).json({ ok: true });
    }

    // 5) Load employee phones/names
    const { data: people, error: peopleErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', newlyAddedIds);

    if (peopleErr) {
      console.error('assign POST profiles load error', peopleErr);
      return res.status(200).json({ ok: true });
    }

    // 6) Send SMS (best-effort; do not fail the request if Twilio is misconfigured)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !from) {
      console.warn('Twilio env missing; not sending SMS', {
        hasSid: !!accountSid,
        hasToken: !!authToken,
        hasFrom: !!from,
      });
      return res.status(200).json({ ok: true });
    }

    const client = twilio(accountSid, authToken);

    const baseUrl = getBaseUrl(req);
    const scheduleUrl = `${baseUrl}/me/schedule`;

    const { date, startTime, endTime } = fmtShiftText(shift);

    const locationLine = shift.location_name
      ? shift.address
        ? `${shift.location_name} — ${shift.address}`
        : `${shift.location_name}`
      : shift.address
      ? shift.address
      : 'Location TBD';

    const job = shift.job_type ? String(shift.job_type).toUpperCase() : 'SHIFT';

    const sendPromises = (people || []).map(async (p: any) => {
      const phone = (p.phone || '').toString().trim();
      if (!phone) return;

      const name = (p.full_name || 'there').toString().trim();

      const body =
        `Hi ${name} — you were assigned a ${job}.\n` +
        `${date} • ${startTime}${endTime ? `–${endTime}` : ''}\n` +
        `${locationLine}\n` +
        `View schedule: ${scheduleUrl}\n` +
        `Reply STOP to opt out.`;

      try {
        await client.messages.create({
          from,
          to: phone,
          body,
        });
      } catch (e: any) {
        console.error('Twilio send error', { to: phone, message: e?.message || e });
      }
    });

      await Promise.allSettled(sendPromises);

      return res.status(200).json({ ok: true });
    }

    // REMOVE ASSIGNMENTS (NO SMS)
    if (req.method === 'DELETE') {
      const { employee_ids } = req.body as { employee_ids?: string[] };

      if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
        return res.status(400).json({ error: 'employee_ids array is required.' });
      }

      const { error } = await supabaseAdmin
        .from('schedule_assignments')
        .delete()
        .eq('schedule_shift_id', id)
        .in('employee_id', employee_ids);

      if (error) {
        console.error('assign DELETE error', error);
        throw error;
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'POST, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return handleApiError(error, res, 'Managing shift assignments');
  }
}

export default requireAdmin(handler);
