// pages/shift/[id].tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

type ShiftType = 'Setup' | 'Breakdown' | 'Shop';

function fmtTimeLocal(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function buildLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export default function EditShift() {
  const r = useRouter();
  const id = r.query.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | undefined>();

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
      const { data, error } = await supabase.from('shifts').select('*').eq('id', id).single();
      if (error) { setErr(error.message); setLoading(false); return; }

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
      if (!date || !tin || !tout) throw new Error('Date, Time In, and Time Out are required');

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
      r.back();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm('Delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id!);
    if (error) return alert(error.message);
    r.push('/dashboard');
  }

  if (loading) return <main className="page" style={{ padding: 24 }}>Loading…</main>;

  return (
    <main className="page" style={{ maxWidth: 520, margin: '32px auto', fontFamily: 'system-ui' }}>
      <h1>Edit Shift</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      <label>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 8 }} />

      <label>Shift Type</label>
      <select value={type} onChange={e => setType(e.target.value as ShiftType)} style={{ width: '100%', padding: 8, marginBottom: 8 }}>
        <option>Setup</option>
        <option>Breakdown</option>
        <option>Shop</option>
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label>Time In</label>
          <input type="time" value={tin} onChange={e => setTin(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 8 }} />
        </div>
        <div>
          <label>Time Out</label>
          <input type="time" value={tout} onChange={e => setTout(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 8 }} />
        </div>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" checked={endsNextDay} onChange={e => setEndsNextDay(e.target.checked)} />
        Ends after midnight (next day)
      </label>

      <label>Notes</label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 12 }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ padding: '10px 14px' }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={del} style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fecaca' }}>Delete</button>
        <button onClick={() => history.back()} style={{ marginLeft: 'auto' }}>Cancel</button>
      </div>
    </main>
  );
}
