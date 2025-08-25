// pages/dashboard.tsx
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import {
  startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths,
  format
} from 'date-fns';

type Mode = 'week' | 'month' | 'all';

function DashboardInner() {
  const r = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [shifts, setShifts] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string>();

  // ---- tolerant getUser with timeout (handles slow storage/cold loads) ----
  const withTimeout = <T,>(p: Promise<T>, ms = 12000) =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('auth timeout')), ms)),
    ]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setErr(undefined);
      setLoadingUser(true);
      try {
        // try twice quickly; handles occasional delay on first call after hard refresh
        const tryOnce = async () => (await withTimeout(supabase.auth.getUser(), 12000)).data?.user ?? null;
        let u = await tryOnce();
        if (!u) u = await tryOnce();
        if (cancelled) return;

        if (!u) {
          // no session: bounce to login so we don't leave a blank shell
          r.replace('/');
          return;
        }
        setUser(u);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || 'Failed to read session');
        r.replace('/'); // conservative bounce on error
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();

    return () => { cancelled = true; };
  }, [r]);

  // ---- date range calc ----
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

  // ---- fetch shifts when we have a user + range ----
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
        setErr(e.message || 'Failed to load shifts');
      }
    })();
  }, [user, mode, offset, range]);

  // ---- totals ----
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

  // ---- UX while determining session ----
  if (loadingUser) {
    return (
      <main className="page">
        <div className="toast" role="status" aria-live="polite">Loading…</div>
      </main>
    );
  }

  // If we got here without a user, we already redirected; render nothing.
  if (!user) return null;

  return (
    <>
      <h1>My Shifts ({mode === 'week' ? 'This Week' : mode === 'month' ? 'This Month' : 'All Time'})</h1>
      {err && <p className="error" role="alert">Error: {err}</p>}

      {/* Range controls */}
      <div className="row wrap gap-sm between mb-md">
        <div className="row gap-sm">
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
              <button onClick={() => setOffset(n => n - 1)} aria-label="Previous range">◀ Prev</button>
              <button onClick={() => setOffset(0)}>{mode === 'week' ? 'This week' : 'This month'}</button>
              <button onClick={() => setOffset(n => n + 1)} disabled={offset >= 0} aria-label="Next range">Next ▶</button>
              <div className="muted" aria-live="polite" style={{ alignSelf: 'center' }}>{range.label}</div>
            </>
          )}
        </div>

        <Link href="/new-shift" className="link-right btn-edit" style={{ textDecoration: 'none' }}>
          + Log Shift
        </Link>
      </div>

      {/* Totals row */}
      <div className="row gap-md mb-sm">
        <div className="chip">Hours: <b>{totals.hours.toFixed(2)}</b></div>
        <div className="chip">Pay: <b>${totals.pay.toFixed(2)}</b></div>
        <div className="chip">Unpaid: <b>${totals.unpaid.toFixed(2)}</b></div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table table--center table--stack">
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
              const timeIn = s.time_in ? new Date(s.time_in) : null;
              const timeOut = s.time_out ? new Date(s.time_out) : null;

              return (
                <tr key={s.id}>
                  <td data-label="Date">{s.shift_date}</td>
                  <td data-label="Type">{s.shift_type}</td>
                  <td data-label="In">
                    {timeIn ? timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td data-label="Out">
                    {timeOut ? timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td data-label="Hours">{Number(s.hours_worked ?? 0).toFixed(2)}</td>
                  <td data-label="Pay">${Number(s.pay_due ?? 0).toFixed(2)}</td>
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
    </>
  );
}

// Export as client-only to avoid SSR/hydration blank after hard refresh on Vercel
export default dynamic(() => Promise.resolve(DashboardInner), { ssr: false });
