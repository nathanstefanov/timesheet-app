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
    <main className="wrap">
      <section className="card">
        <h1>Log Shift</h1>

        <div className="field">
          <label>Date</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Shift Type</label>
          <select
            className="input select"
            value={type}
            onChange={(e) => setType(e.target.value as ShiftType)}
          >
            <option>Setup</option>
            <option>Breakdown</option>
            <option>Shop</option>
          </select>
        </div>

        <div className="grid">
          <div className="field">
            <label>Time In</label>
            <input
              className="input"
              type="time"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Time Out</label>
            <input
              className="input"
              type="time"
              value={tout}
              onChange={(e) => setTout(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>Notes (optional)</label>
          <textarea
            className="input textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to add…"
          />
        </div>

        {err && <p className="alert">{err}</p>}

        <button className="primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>

      <style jsx>{`
        /* Container */
        .wrap {
          max-width: 720px;
          margin: 24px auto;
          padding: 0 16px;
        }
        .card {
          background: #fff;
          border: 1px solid #edf2f7;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,.04);
          padding: 20px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        h1 {
          margin: 0 0 16px;
          font-size: clamp(22px, 3.4vw, 32px);
        }

        /* Fields */
        .field { margin-bottom: 12px; }
        label {
          display: block;
          margin: 0 0 6px;
          font-weight: 600;
          color: #1f2937;
        }
        .input {
          width: 100%;
          box-sizing: border-box;
          height: 48px;
          padding: 12px 14px;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          background: #fff;
          font-size: 16px;
          line-height: 1.2;
          -webkit-appearance: none;
          appearance: none;
        }
        .input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,.15);
        }
        .textarea {
          height: 120px;
          resize: vertical;
          padding-top: 10px;
          padding-bottom: 10px;
        }

        .select {
          padding-right: 36px;
          background-image:
            linear-gradient(45deg, transparent 50%, #6b7280 50%),
            linear-gradient(135deg, #6b7280 50%, transparent 50%);
          background-position:
            calc(100% - 18px) 50%,
            calc(100% - 12px) 50%;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        @media (max-width: 560px) {
          .wrap { margin: 16px auto; }
          .card { padding: 16px; border-radius: 14px; }
          .grid { grid-template-columns: 1fr; }  /* stack time fields */
          .input { height: 50px; }
        }

        .primary {
          width: 100%;
          height: 52px;
          border: 0;
          border-radius: 12px;
          background: #2563eb;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .primary:disabled { opacity: .6; cursor: not-allowed; }

        .alert {
          color: #b91c1c;
          background: #fee2e2;
          border: 1px solid #fecaca;
          padding: 10px 12px;
          border-radius: 10px;
          margin-bottom: 10px;
        }
      `}</style>
    </main>
  );
}
