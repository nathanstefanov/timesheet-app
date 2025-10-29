// pages/new-shift.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type ShiftType = 'Setup' | 'Breakdown' | 'Shop';

/** Combine a local date (YYYY-MM-DD) and time (HH:MM) into a JS Date in local tz */
function combineLocal(date: string, time: string): Date {
  // Construct at midnight local, then set hours/minutes to avoid DST issues
  const d = new Date(`${date}T00:00:00`);
  const [hh, mm] = time.split(':').map(Number);
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d;
}

export default function NewShift() {
  const r = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [type, setType] = useState<ShiftType>('Setup');
  const [tin, setTin] = useState('');
  const [tout, setTout] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { r.replace('/'); return; }
      setUserId(user.id);
    })();
  }, [r]);

  async function submit() {
    setErr(undefined);
    if (!userId) return;

    try {
      if (!date || !tin || !tout) {
        throw new Error('Date, Time In and Time Out are required.');
      }

      // Build local Date objects
      let timeIn = combineLocal(date, tin);
      let timeOut = combineLocal(date, tout);

      // If out <= in, treat as overnight (roll to next day)
      if (timeOut <= timeIn) {
        timeOut.setDate(timeOut.getDate() + 1);
      }

      // (Optional sanity check: max 18 hours)
      const hours = (timeOut.getTime() - timeIn.getTime()) / 36e5;
      if (hours <= 0 || hours > 18) {
        throw new Error('Please double-check your times (shift length seems off).');
      }

      setSaving(true);
      const { error } = await supabase.from('shifts').insert({
        user_id: userId,
        shift_date: date,            // start date (keep as your canonical day)
        shift_type: type,
        time_in: timeIn.toISOString(),
        time_out: timeOut.toISOString(),
        notes,
      });
      if (error) throw error;

      r.push('/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Could not save shift');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page page--center">
      <h1 className="page__title">Log Shift</h1>

      <div className="form-container">
        <section className="form-card" aria-labelledby="log-shift-heading">
          <div className="card__header">
            <div>
              <h2 id="log-shift-heading" className="title">Shift details</h2>
              <p className="form-intro">Record your shift information so payroll stays accurate.</p>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="shift-date">Date</label>
            <input
              id="shift-date"
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="shift-type">Shift type</label>
            <select
              id="shift-type"
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as ShiftType)}
            >
              <option>Setup</option>
              <option>Breakdown</option>
              <option>Shop</option>
            </select>
          </div>

          <div className="grid-two-cols">
            <div className="form-field">
              <label htmlFor="time-in">Time in</label>
              <input
                id="time-in"
                className="input"
                type="time"
                value={tin}
                onChange={(e) => setTin(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="time-out">Time out</label>
              <input
                id="time-out"
                className="input"
                type="time"
                value={tout}
                onChange={(e) => setTout(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="shift-notes">Notes (optional)</label>
            <textarea
              id="shift-notes"
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to add…"
            />
          </div>

          {err && <div className="alert error" role="alert">{err}</div>}

          <div className="form-actions">
            <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
              {saving ? 'Saving…' : 'Save shift'}
            </button>
          </div>
        </section>
      </div>

    </main>
  );
}
