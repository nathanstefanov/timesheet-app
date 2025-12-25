// pages/dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  startOfMonth,
  endOfMonth,
  addMonths,
  format,
} from 'date-fns';
import { formatForDisplay } from '../lib/timezone';

type Mode = 'week' | 'month' | 'all';

type Shift = {
  id: string;
  user_id: string;
  shift_date: string; // 'YYYY-MM-DD'
  shift_type: string; // 'Setup' | 'Breakdown' | 'Shop' | ...
  time_in: string; // ISO
  time_out: string; // ISO
  hours_worked: number;
  pay_due: number;
  is_paid?: boolean;
  paid_at?: string | null; // ISO
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | undefined>();

  // All–time unpaid total
  const [unpaidAllTime, setUnpaidAllTime] = useState(0);

  // Get current user once
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        // _app.tsx handles redirect; nothing here
        return;
      }
      setUser({ id: session.user.id });
    })();
  }, []);

  // Compute the date range + label
  const range = useMemo(() => {
    const now = new Date();
    if (mode === 'week') {
      const base = addWeeks(now, offset);
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return {
        start,
        end,
        label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
        kind: 'week' as const,
      };
    }
    if (mode === 'month') {
      const base = addMonths(now, offset);
      const start = startOfMonth(base);
      const end = endOfMonth(base);
      return {
        start,
        end,
        label: format(start, 'MMMM yyyy'),
        kind: 'month' as const,
      };
    }
    return {
      start: null as any,
      end: null as any,
      label: 'All time',
      kind: 'all' as const,
    };
  }, [mode, offset]);

  // Load shifts when user/range changes
  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      setErr(undefined);
      setLoading(true);
      try {
        // 1) Range-filtered shifts for the table + range totals
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
        if (!alive) return;
        setShifts((data ?? []) as Shift[]);

        // 2) All-time unpaid total (ignores date range)
        const { data: unpaidData, error: unpaidError } = await supabase
          .from('shifts')
          .select('pay_due, is_paid')
          .eq('user_id', user.id);

        if (!alive) return;

        if (!unpaidError && unpaidData) {
          const totalUnpaid = unpaidData.reduce((sum, row: any) => {
            const isPaid = !!row.is_paid;
            const pay = Number(row.pay_due ?? 0);
            return sum + (isPaid ? 0 : pay);
          }, 0);
          setUnpaidAllTime(totalUnpaid);
        }
        // If unpaidError, skip updating unpaidAllTime
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'Failed to load shifts.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user, mode, offset, range.start, range.end]);

  const totals = useMemo(() => {
    const hours = shifts.reduce((s, x) => s + Number(x.hours_worked || 0), 0);
    const pay = shifts.reduce((s, x) => s + Number(x.pay_due || 0), 0);
    return { hours, pay };
  }, [shifts]);

  async function delShift(id: string) {
    if (!confirm('Delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    setShifts((prev) => prev.filter((x) => x.id !== id));
    // Could refetch unpaidAllTime here if needed
  }

  if (!user) return null;

  return (
    <main className="page page--center page--dashboard">
      <h1 className="page__title">
        My Shifts (
        {mode === 'week'
          ? 'This Week'
          : mode === 'month'
          ? 'This Month'
          : 'All Time'}
        )
      </h1>

      {err && (
        <div className="alert error" role="alert">
          Error: {err}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar toolbar--center full">
        <div className="toolbar__left row wrap">
          <label className="sr-only" htmlFor="range-mode">
            Range
          </label>
          <select
            id="range-mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setOffset(0);
            }}
          >
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>

          {mode !== 'all' && (
            <>
              <button
                className="topbar-btn"
                onClick={() => setOffset((n) => n - 1)}
                aria-label="Previous range"
              >
                ◀ Prev
              </button>
              <button className="topbar-btn" onClick={() => setOffset(0)}>
                {mode === 'week' ? 'This week' : 'This month'}
              </button>
              <button
                className="topbar-btn"
                onClick={() => setOffset((n) => n + 1)}
                disabled={offset >= 0}
                aria-label="Next range"
                title={offset >= 0 ? 'Cannot view future range' : 'Next'}
              >
                Next ▶
              </button>
              <div
                className="muted toolbar-range-label"
                aria-live="polite"
              >
                {range.label}
              </div>
            </>
          )}
        </div>

        <Link href="/new-shift" className="btn-primary">
          + Log Shift
        </Link>
      </div>

      {/* Totals */}
      <div className="totals totals--center">
        <div className="chip chip--xl">
          Hours:&nbsp;<b>{totals.hours.toFixed(2)}</b>
        </div>
        <div className="chip chip--xl">
          Pay:&nbsp;<b>${totals.pay.toFixed(2)}</b>
        </div>
        <div className="chip chip--xl">
          Unpaid:&nbsp;<b>${unpaidAllTime.toFixed(2)}</b>
        </div>
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
            {!loading &&
              shifts.map((s) => {
                const paid = Boolean(s.is_paid);
                return (
                  <tr key={s.id}>
                    <td data-label="Date">{s.shift_date}</td>
                    <td data-label="Type">{s.shift_type}</td>
                    <td data-label="In">
                      {s.time_in
                        ? formatForDisplay(s.time_in, 'h:mm a')
                        : '—'}
                    </td>
                    <td data-label="Out">
                      {s.time_out
                        ? formatForDisplay(s.time_out, 'h:mm a')
                        : '—'}
                    </td>
                    <td data-label="Hours">
                      {Number(s.hours_worked ?? 0).toFixed(2)}
                    </td>
                    <td data-label="Pay">
                      ${Number(s.pay_due ?? 0).toFixed(2)}
                    </td>
                    <td data-label="Status">
                      <span
                        className={
                          paid ? 'badge badge-paid' : 'badge badge-unpaid'
                        }
                      >
                        {paid ? 'PAID' : 'NOT PAID'}
                      </span>
                    </td>
                    <td data-label="Paid at" className="col-hide-md">
                      {s.paid_at
                        ? formatForDisplay(s.paid_at, 'MMM d, yyyy')
                        : '—'}
                    </td>
                    <td data-label="Actions">
                      <div className="actions">
                        <Link
                          href={`/shift/${s.id}`}
                          className="btn-edit"
                        >
                          Edit
                        </Link>
                        <button
                          className="btn-delete"
                          onClick={() => delShift(s.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

            {!loading && shifts.length === 0 && (
              <tr>
                <td colSpan={9} className="muted center">
                  No shifts in this range.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={9} className="center">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

// Force SSR to avoid static HTML emission on /dashboard
export async function getServerSideProps() {
  return { props: {} };
}
