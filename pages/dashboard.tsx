// pages/dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import {
  startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths,
  format
} from 'date-fns';

type Mode = 'week' | 'month' | 'all';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const range = useMemo(() => {
    const now = new Date();
    if (mode === 'week') {
      const base = addWeeks(now, offset);
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return { start, end, label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` };
    }
    if (mode === 'month') {
      const base = addMonths(now, offset);
      const start = startOfMonth(base);
      const end = endOfMonth(base);
      return { start, end, label: format(start, 'MMMM yyyy') };
    }
    return { start: null as any, end: null as any, label: 'All time' };
  }, [mode, offset]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setErr(undefined);
      try {
        let q = supabase
          .from('shifts')
          .select('*')
          .eq('user_id', user.id)
          .order('shift_date', { ascending: false });

        if (mode !== 'all') {
          q = q
            .gte('shift_date', format(range.start, 'yyyy-MM-dd'))
            .lte('shift_date', format(range.end, 'yyyy-MM-dd'));
        }

        const { data, error } = await q;
        if (error) throw error;
        setShifts(data || []);
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, [user, mode, offset, range]);

  const totals = useMemo(() => {
    const hours = shifts.reduce((s, x) => s + Number(x.hours_worked || 0), 0);
    const pay = shifts.reduce((s, x) => s + Number(x.pay_due || 0), 0);
    const unpaid = shifts.reduce((s, x) => s + ((x as any).is_paid ? 0 : Number(x.pay_due || 0)), 0);
    return { hours, pay, unpaid };
  }, [shifts]);

  async function delShift(id: string) {
    if (!confirm('Delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(x => x.id !== id));
  }

  if (!user) return null;

  return (
    <main className="page">
      <h1 className="page__title">My Shifts</h1>
      {err && <p className="error center" role="alert">Error: {err}</p>}

      {/* Range controls */}
      <div className="toolbar toolbar--center">
        <div className="toolbar__left">
          <label className="sr-only" htmlFor="range-mode">Range</label>
          <select
            id="range-mode"
            value={mode}
            onChange={(e) => { setMode(e.target.value as Mode); setOffset(0); }}
          >
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>

          {mode !== 'all' && (
            <>
              <button className="topbar-btn" onClick={() => setOffset(n => n - 1)} aria-label="Previous range">◀ Prev</button>
              <button className="topbar-btn" onClick={() => setOffset(0)}>{mode === 'week' ? 'This week' : 'This month'}</button>
              <button className="topbar-btn" onClick={() => setOffset(n => n + 1)} disabled={offset >= 0} aria-label="Next range">Next ▶</button>
              <div className="muted" aria-live="polite" style={{ alignSelf: 'center' }}>{range.label}</div>
            </>
          )}
        </div>

        <Link href="/new-shift" className="btn-edit" style={{ textDecoration: 'none' }}>
          + Log Shift
        </Link>
      </div>

      {/* Totals row */}
      <div className="totals totals--center">
        <div className="chip">Hours: <b>{totals.hours.toFixed(2)}</b></div>
        <div className="chip">Pay: <b>${totals.pay.toFixed(2)}</b></div>
        <div className="chip">Unpaid: <b>${totals.unpaid.toFixed(2)}</b></div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table table--center table--compact">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>In</th>
              <th>Out</th>
              <th>Hours</th>
              <th>Pay</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const paid = Boolean((s as any).is_paid);
              return (
                <tr key={s.id}>
                  <td data-label="Date">{s.shift_date}</td>
                  <td data-label="Type">{s.shift_type}</td>
                  <td data-label="In">
                    {new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td data-label="Out">
                    {new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td data-label="Hours">{Number(s.hours_worked).toFixed(2)}</td>
                  <td data-label="Pay">${Number(s.pay_due).toFixed(2)}</td>
                  <td data-label="Status">
                    <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>
                      {paid ? 'PAID' : 'NOT PAID'}
                    </span>
                    {(s as any).paid_at
                      ? <span className="muted" style={{ marginLeft: 8 }}>
                          ({new Date((s as any).paid_at).toLocaleDateString()})
                        </span>
                      : null}
                  </td>
                  <td data-label="Actions">
                    <div className="actions">
                      <Link href={`/shift/${s.id}`} className="btn-edit">Edit</Link>
                      <button className="btn-delete" onClick={() => delShift(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {shifts.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center' }} className="muted">No shifts in this range.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
