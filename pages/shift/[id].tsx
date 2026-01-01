// Force SSR so Vercel does not emit static HTML for dynamic route
export async function getServerSideProps() {
  return { props: {} };
}
// pages/shift/[id].tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { logShiftUpdated, logShiftDeleted } from '../../lib/auditLog';

type ShiftType = 'Setup' | 'Breakdown' | 'Shop';

function fmtTimeLocal(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function buildLocal(date: string, time: string) {
  // Let the browser build a local Date; we only convert to ISO when persisting
  return new Date(`${date}T${time}:00`);
}

export default function EditShift() {
  const r = useRouter();
  const id = r.query.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [type, setType] = useState<ShiftType>('Setup');
  const [tin, setTin] = useState('');
  const [tout, setTout] = useState('');
  const [notes, setNotes] = useState('');

  // derived for UI: does out fall on the following calendar day?
  const [endsNextDay, setEndsNextDay] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        r.replace('/');
        return;
      }
      setUserId(user.id);

      const { data, error } = await supabase.from('shifts').select('*').eq('id', id).single();
      if (error) { setErr(error.message); setLoading(false); return; }
      if (!data) { setErr('Shift not found'); setLoading(false); return; }

      setDate(data.shift_date);
      setType(data.shift_type);
      setTin(fmtTimeLocal(data.time_in));
      setTout(fmtTimeLocal(data.time_out));
      setNotes(data.notes || '');

      const inD = new Date(data.time_in);
      const outD = new Date(data.time_out);
      setEndsNextDay(outD.toDateString() !== inD.toDateString());

      setLoading(false);
    })();
  }, [id]);

  async function save() {
    setErr(undefined);
    setSaving(true);
    try {
      if (!date || !tin || !tout) throw new Error('Date, Time In, and Time Out are required.');
      if (!userId) throw new Error('User not authenticated');

      const inDt = buildLocal(date, tin);
      let outDt = buildLocal(date, tout);
      if (endsNextDay || outDt <= inDt) outDt.setDate(outDt.getDate() + 1);

      if (outDt.getTime() - inDt.getTime() < 60_000) {
        throw new Error('Time Out must be after Time In.');
      }

      const patch = {
        shift_date: date,
        shift_type: type,
        time_in: inDt.toISOString(),
        time_out: outDt.toISOString(),
        notes,
      };

      const { error } = await supabase.from('shifts').update(patch).eq('id', id!);
      if (error) throw error;

      // Log the shift update
      const changes = Object.keys(patch)
        .map(key => `${key}: ${patch[key as keyof typeof patch]}`)
        .join(', ');
      await logShiftUpdated(userId, id!, changes);

      r.back();
    } catch (e: any) {
      setErr(e.message || 'Failed to save shift.');
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm('Delete this shift?')) return;
    if (!userId) return alert('User not authenticated');

    const { error } = await supabase.from('shifts').delete().eq('id', id!);
    if (error) return alert(error.message);

    // Log the shift deletion
    await logShiftDeleted(userId, id!, type);

    r.push('/dashboard');
  }

  if (loading) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="page">
      {err && (
        <div className="toast toast--error" role="alert">
          <span>{err}</span>
          <button className="toast__dismiss" onClick={() => setErr(undefined)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="card narrow mx-auto">
        <div className="card__header">
          <h1 style={{ margin: 0, fontSize: 22 }}>Edit Shift</h1>
        </div>

        <div style={{ padding: 14 }}>
          <div className="form-field">
            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="type">Shift Type</label>
            <select
              id="type"
              value={type}
              onChange={e => setType(e.target.value as ShiftType)}
            >
              <option>Setup</option>
              <option>Breakdown</option>
              <option>Shop</option>
            </select>
          </div>

          <div className="grid-2 gap-md">
            <div className="form-field">
              <label htmlFor="time-in">Time In</label>
              <input
                id="time-in"
                type="time"
                value={tin}
                onChange={e => setTin(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="time-out">Time Out</label>
              <input
                id="time-out"
                type="time"
                value={tout}
                onChange={e => setTout(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="inline-check" style={{ margin: '8px 0 12px' }}>
            <input
              type="checkbox"
              checked={endsNextDay}
              onChange={e => setEndsNextDay(e.target.checked)}
            />
            Ends after midnight (next day)
          </label>

          <div className="form-field">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="actions">
            <button className="btn-edit" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-delete" onClick={del}>Delete</button>
            <button className="topbar-btn" style={{ marginLeft: 'auto' }} onClick={() => history.back()}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
