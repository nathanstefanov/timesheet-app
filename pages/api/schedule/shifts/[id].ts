import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAdmin, type AuthenticatedRequest, handleApiError } from '../../../../lib/middleware';

// IMPORTANT: twilio must only run server-side
import twilio from 'twilio';

const PatchSchema = z.object({
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().nullable().optional(),
  location_name: z.string().min(1).max(200).optional(),
  address: z.string().min(3).max(300).optional(),
  job_type: z.enum(['setup', 'lights', 'breakdown', 'other']).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['draft', 'confirmed', 'changed']).optional(),
});

// ---------- SMS helpers ----------
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || ''; // your verified TF or 10DLC number (E.164)

function hasTwilioEnv() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM);
}

function fmtWhen(shift: any) {
  const start = shift.start_time ? new Date(shift.start_time) : null;
  const end = shift.end_time ? new Date(shift.end_time) : null;

  const startStr = start
    ? start.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : 'TBD';

  if (!end) return startStr;

  const endStr = end.toLocaleTimeString(undefined, { timeStyle: 'short' });
  return `${startStr} – ${endStr}`;
}

function buildShiftUpdatedMessage(params: {
  employeeFirst?: string;
  before: any;
  after: any;
  scheduleUrl?: string;
}) {
  const { employeeFirst, before, after, scheduleUrl } = params;

  const beforeWhen = fmtWhen(before);
  const afterWhen = fmtWhen(after);

  const beforeLoc = before.location_name || '';
  const afterLoc = after.location_name || '';
  const beforeAddr = before.address || '';
  const afterAddr = after.address || '';

  // Keep it short + carrier-safe
  let msg = `Shift updated${employeeFirst ? `, ${employeeFirst}` : ''}.\n\n`;

  if (beforeWhen !== afterWhen) {
    msg += `When: ${beforeWhen} → ${afterWhen}\n`;
  } else {
    msg += `When: ${afterWhen}\n`;
  }

  if (beforeLoc !== afterLoc) {
    msg += `Location: ${beforeLoc || '—'} → ${afterLoc || '—'}\n`;
  } else if (afterLoc) {
    msg += `Location: ${afterLoc}\n`;
  }

  if (beforeAddr !== afterAddr) {
    // address changes can be long; keep it readable
    msg += `Address updated.\n`;
  } else if (afterAddr) {
    msg += `Address: ${afterAddr}\n`;
  }

  if (scheduleUrl) {
    msg += `\nView schedule: ${scheduleUrl}\n`;
  }

  msg += `\nReply STOP to opt out.`;
  return msg;
}

async function sendSms(to: string, body: string) {
  if (!hasTwilioEnv()) {
    console.warn('Twilio env missing; not sending SMS', {
      hasSid: !!TWILIO_ACCOUNT_SID,
      hasToken: !!TWILIO_AUTH_TOKEN,
      hasFrom: !!TWILIO_FROM,
    });
    return;
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  await client.messages.create({
    from: TWILIO_FROM,
    to,
    body,
  });
}

// ---------- handler ----------
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (req.method === 'PATCH') {
      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const p = parsed.data;

      if (p.start_time && p.end_time && new Date(p.end_time) <= new Date(p.start_time)) {
        return res.status(400).json({ error: 'end_time must be after start_time' });
      }

      // 1) Fetch BEFORE
      const beforeRes = await supabaseAdmin
        .from('schedule_shifts')
        .select('id, start_time, end_time, location_name, address, job_type, notes')
        .eq('id', id)
        .single();

      if (beforeRes.error || !beforeRes.data) {
        console.error('[PATCH /api/schedule/shifts/[id]] Failed to fetch shift:', beforeRes.error);
        throw beforeRes.error || new Error('Shift not found');
      }

      const before = beforeRes.data;

      // 2) Update
      const update: Record<string, any> = {};
      for (const k of Object.keys(p) as (keyof typeof p)[]) update[k] = (p as any)[k];

      const afterRes = await supabaseAdmin
        .from('schedule_shifts')
        .update(update)
        .eq('id', id)
        .select('id, start_time, end_time, location_name, address, job_type, notes')
        .single();

      if (afterRes.error || !afterRes.data) {
        console.error('[PATCH /api/schedule/shifts/[id]] Update failed:', afterRes.error);
        throw afterRes.error || new Error('Update failed');
      }

    const after = afterRes.data;

    // 3) Detect changes that should trigger "Shift updated" SMS
    const timeChanged =
      String(before.start_time || '') !== String(after.start_time || '') ||
      String(before.end_time || '') !== String(after.end_time || '');

    const locationChanged =
      String(before.location_name || '') !== String(after.location_name || '') ||
      String(before.address || '') !== String(after.address || '');

    const shouldNotify = timeChanged || locationChanged;

    // 4) If changed, send to assigned employees
    if (shouldNotify) {
      const scheduleUrl =
        process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/me/schedule`
          : undefined;

      const assigns = await supabaseAdmin
        .from('schedule_assignments')
        .select('employee_id, profiles:employee_id ( full_name, phone )')
        .eq('schedule_shift_id', id);

      if (assigns.error) {
        console.warn('Could not load schedule_assignments for update SMS', assigns.error);
      } else {
        const rows = (assigns.data || []) as any[];

        for (const a of rows) {
          const prof = a.profiles;
          const phone: string | null | undefined = prof?.phone;

          if (!phone) {
            console.warn('No phone for employee; skipping update SMS', a.employee_id);
            continue;
          }

          const first = (prof?.full_name || '').trim().split(/\s+/)[0];

          const body = buildShiftUpdatedMessage({
            employeeFirst: first || undefined,
            before,
            after,
            scheduleUrl,
          });

          try {
            await sendSms(phone, body);
          } catch (err: any) {
            console.warn('Failed to send update SMS', { employee: a.employee_id, phone, err: err?.message || err });
          }
        }
      }
    }

      // Return the updated shift
      return res.status(200).json(after);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseAdmin.from('schedule_shifts').delete().eq('id', id);
      if (error) {
        console.error('[DELETE /api/schedule/shifts/[id]] Delete failed:', error);
        throw error;
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['PATCH', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return handleApiError(error, res, 'Updating or deleting schedule shift');
  }
}

export default requireAdmin(handler);
