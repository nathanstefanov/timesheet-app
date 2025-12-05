// pages/new-shift.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type ShiftType = 'Setup' | 'Breakdown' | 'Shop';

/** Combine a local date (YYYY-MM-DD) and time (HH:MM) into a JS Date in local tz */
function combineLocal(date: string, time: string): Date {
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        r.replace('/');
        return;
      }
      setUserId(user.id);
    })();
  }, [r]);

  async function submit() {
    setErr(undefined);
    if (!userId) return;

    try {
      if (!date || !tin || !tout)
        throw new Error('Date, Time In and Time Out are required.');

      let timeIn = combineLocal(date, tin);
      let timeOut = combineLocal(date, tout);

      if (timeOut <= timeIn) timeOut.setDate(timeOut.getDate() + 1);

      const hours = (timeOut.getTime() - timeIn.getTime()) / 36e5;
      if (hours <= 0 || hours > 18)
        throw new Error('Please double-check your times (shift length seems off).');

      setSaving(true);

      const { error } = await supabase.from('shifts').insert({
        user_id: userId,
        shift_date: date,
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
    <main className="wrap newshift-page">
      <section className="card card--tight full newshift-card">
        <header className="newshift-header">
          <div>
            <h1 className="newshift-title">Log Shift</h1>
            <p className="newshift-subtitle">Enter your shift details below.</p>
          </div>
        </header>

        {/* Date / Type / Time In / Time Out */}
        <div className="newshift-grid">
          <div className="field newshift-field">
            <label>Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field newshift-field">
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

          <div className="field newshift-field">
            <label>Time In</label>
            <input
              className="input"
              type="time"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
            />
          </div>

          <div className="field newshift-field">
            <label>Time Out</label>
            <input
              className="input"
              type="time"
              value={tout}
              onChange={(e) => setTout(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="field newshift-field newshift-notes">
          <label>Notes (optional)</label>
          <textarea
            className="input textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to add…"
          />
        </div>

        {err && <p className="alert newshift-alert">{err}</p>}

        <button
          className="btn-primary newshift-submit"
          onClick={submit}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Shift'}
        </button>
      </section>

      <style jsx>{`
        /* Center the whole card on the page on ALL screen sizes */
        .newshift-page {
          display: flex;
          justify-content: center;
          padding: 24px 16px 32px;
        }

        .newshift-card {
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
          padding: 24px 24px 28px;
        }

        .newshift-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 20px;
          gap: 12px;
        }

        .newshift-title {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
        }

        .newshift-subtitle {
          margin: 4px 0 0;
          font-size: 0.95rem;
          opacity: 0.7;
        }

        .newshift-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px 24px;
          align-items: flex-end;
        }

        .newshift-field {
          width: 100%;
        }

        .newshift-field label {
          display: block;
          margin-bottom: 6px;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .newshift-notes {
          margin-top: 18px;
        }

        .newshift-notes textarea {
          min-height: 80px;
          resize: vertical;
        }

        .newshift-alert {
          margin-top: 12px;
        }

        .newshift-submit {
          margin-top: 24px;
          width: 100%;
          font-size: 1.05rem;
          padding: 14px 0;
        }

        /* ---------- MOBILE ---------- */
        @media (max-width: 768px) {
          .newshift-page {
            padding: 20px 12px 28px;
          }

          .newshift-card {
            max-width: 100%;
            padding: 20px 16px 24px;
          }

          .newshift-title {
            font-size: 1.4rem;
          }

          .newshift-subtitle {
            font-size: 0.9rem;
          }

          .newshift-grid {
            grid-template-columns: 1fr;
            gap: 14px;
            margin-top: 6px;
          }

          .newshift-card :global(.input),
          .newshift-card :global(.select) {
            width: 100%;
            font-size: 1rem;
            padding-top: 12px;
            padding-bottom: 12px;
          }

          .newshift-notes textarea {
            min-height: 70px;
          }

          .newshift-submit {
            font-size: 1.05rem;
            padding: 14px 0;
            margin-top: 20px;
          }
        }
      `}</style>
    </main>
  );
}
