import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

function toLocalTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function toISO(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export default function EditShift() {
  const r = useRouter();
  const id = r.query.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const [isPaid, setIsPaid] = useState(false);

  const [date, setDate] = useState('');
  const [type, setType] = useState<'Setup'|'Breakdown'|'Shop'>('Setup');
  const [tin, setTin] = useState('');
  const [tout, setTout] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data, error } = await supabase.from('shifts').select('*').eq('id', id).single();
      if (error) { setErr(error.message); setLoading(false); return; }
      setDate(data.shift_date);
      setType(data.shift_type);
      setTin(toLocalTime(data.time_in));
      setTout(toLocalTime(data.time_out));
      setNotes(data.notes || '');
      setIsPaid(Boolean((data as any).is_paid));
      setLoading(false);
    })();
  }, [id]);

  async function save() {
    setErr(undefined); setSaving(true);
    try {
      if (!date || !tin || !tout) throw new Error('Date, Time In, and Time Out are required');
      const patch = { shift_date: date, shift_type: type, time_in: toISO(date, tin), time_out: toISO(date, tout), notes };
      const { error } = await supabase.from('shifts').update(patch).eq('id', id!);
      if (error) throw error;
      r.back();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  async function del() {
    if (!confirm('Delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id!);
    if (error) return alert(error.message);
    r.push('/dashboard');
  }

  if (loading) return <main className="page">Loading…</main>;

  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <h1>Edit Shift</h1>

      {isPaid && (
        <div style={{background:'#fff4f4', border:'1px solid #f8caca', color:'#7a1111',
                     padding:10, borderRadius:8, marginBottom:10}}>
          This shift is marked <b>PAID</b>. If you shouldn’t edit paid shifts, ask an admin.
        </div>
      )}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      <label>Date</label>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} />

      <label>Shift Type</label>
      <select value={type} onChange={e=>setType(e.target.value as any)}>
        <option>Setup</option><option>Breakdown</option><option>Shop</option>
      </select>

      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Time In</label>
          <input type="time" value={tin} onChange={e=>setTin(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Time Out</label>
          <input type="time" value={tout} onChange={e=>setTout(e.target.value)} />
        </div>
      </div>

      <label>Notes</label>
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} />

      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn-edit" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn-delete" onClick={del}>Delete</button>
        <button onClick={() => history.back()} style={{ marginLeft: 'auto' }}>Cancel</button>
      </div>
    </main>
  );
}
