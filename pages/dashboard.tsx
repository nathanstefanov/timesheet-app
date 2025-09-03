// pages/dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import {
  startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths, format
} from 'date-fns';
import type { GetServerSidePropsContext } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

type Mode = 'week' | 'month' | 'all';

type Shift = {
  id: string;
  user_id: string;
  shift_date: string;          // YYYY-MM-DD
  shift_type: string;
  time_in?: string | null;     // ISO
  time_out?: string | null;    // ISO
  hours_worked?: number | null;
  pay_due?: number | null;
  is_paid?: boolean | null;
  paid_at?: string | null;     // ISO
};

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | undefined>();

  // Grab current user (client mirror only). SSR already protected the page.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      setUserId(session?.user?.id ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // Compute date range label
  const range = useMemo(() => {
    const now = new Date();
    if (mode === 'week') {
      const base = addWeeks(now, offset);
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return { start, end, label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` as const };
    }
    if (mode === 'month') {
      const base = addMonths(now, offset);
      const start = startOfMonth(base);
      const end = endOfMonth(base);
      return { start, end, label: format(start, 'MMMM yyyy') as const };
    }
    return { start: null as any, end: null as any, label: 'All time' as const };
  }, [mode, offset]);

  // Load shifts on user/range changes
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      setErr(undefined);
      setLoading(true);
      try {
        let q = supabase
          .from('shifts')
          .select('*')
          .eq('user_id', userId)
          .order('shift_date', { ascending: false });

        if (mode !== 'all') {
          q = q
            .gte('shift_date', format(range.start, 'yyyy-MM-dd'))
            .lte('shift_date', format(range.end, 'yyyy-MM-dd'));
        }

        const { data, error } = await q;
        if (error) throw error;
        if (!alive) return;
        setShifts((data ?? []) as Shift[]);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'Failed to load shifts.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, mode, range.start, range.end]);

  const totals = useMemo(() => {
    const hours = shifts.reduce((s, x) => s + Number(x.hours_worked ?? 0), 0);
    const pay = shifts.reduce((s, x) => s + Number(x.pay_due ?? 0), 0);
    const unpaid = shifts.reduce((s, x) => s + (x.is_paid ? 0 : Number(x.pay_due ?? 0)), 0);
    return { hours, pay, unpaid };
  }, [shifts]);

  async function delShift(id: string) {
    if (!confirm('Delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(x => x.id !== id));
  }

  // Render (SSR already ensured user is present)
  return (
    <main className="page page--center">
      <h1 className="page__title">
        My Shifts ({mode === 'week' ? 'This Week' : mode === 'month' ? 'This Month' : 'All Time'})
      </h1>

      {err && <div className="alert error" role="alert">Error: {err}</div>}

      {/* Toolbar */}
      <div className="toolbar toolbar--center full">
        <div className="toolbar__left row wrap">
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
              <button
                className="topbar-btn"
                onClick={() => setOffset(n => n + 1)}
                disabled={offset >= 0}
                aria-label="Next range"
                title={offset >= 0 ? 'Cannot view future range' : 'Next'}
              >
                Next ▶
              </button>
              <div className="muted" aria-live="polite" style={{ alignSelf: 'center' }}>
                {range.label}
              </div>
            </>
          )}
        </div>

        <Link href="/new-shift" className="btn-primary">+ Log Shift</Link>
      </div>

      {/* Totals */}
      <div className="totals totals--center">
        <div className="chip chip--xl">Hours:&nbsp;<b>{totals.hours.toFixed(2)}</b></div>
        <div className="chip chip--xl">Pay:&nbsp;<b>${totals.pay.toFixed(2)}</b></div>
        <div className="chip chip--xl">Unpaid:&nbsp;<b>${totals.unpaid.toFixed(2)}</b></div>
      </div>

      {/* Shifts table */}
      <div className="table-wrap">
        <table className="table table--admin table--center table--stack">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>In</th>
              <th>Out</th>
              <th>Hours</th>
              <th>Pay</th>
              <th>Status</th>
              <th className="col-hide-md">Paid at</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && shifts.map((s) => {
              const paid = Boolean(s.is_paid);
              return (
                <tr key={s.id}>
                  <td data-label="Date">{s.shift_date}</td>
                  <td data-label="Type">{s.shift_type}</td>
                  <td data-label="In">{s.time_in ? new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td data-label="Out">{s.time_out ? new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td data-label="Hours">{Number(s.hours_worked ?? 0).toFixed(2)}</td>
                  <td data-label="Pay">${Number(s.pay_due ?? 0).toFixed(2)}</td>
                  <td data-label="Status">
                    <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>
                      {paid ? 'PAID' : 'NOT PAID'}
                    </span>
                  </td>
                  <td data-label="Paid at" className="col-hide-md">
                    {s.paid_at ? new Date(s.paid_at).toLocaleDateString() : '—'}
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

            {!loading && shifts.length === 0 && (
              <tr><td colSpan={9} className="muted center">No shifts in this range.</td></tr>
            )}

            {loading && (
              <tr><td colSpan={9} className="center">Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

// SSR guard: must be signed in
export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const supabase = createServerSupabaseClient(ctx, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/', permanent: false } };

  return { props: {} };
}
