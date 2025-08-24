// pages/dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import {
  startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths,
  format
} from 'date-fns';

type Mode = 'week' | 'month' | 'all';

type ShiftRow = {
  id: string;
  user_id: string;
  shift_date: string;              // 'YYYY-MM-DD'
  shift_type: 'Setup' | 'Breakdown' | 'Shop';
  time_in: string;                 // ISO
  time_out: string;                // ISO
  hours_worked: number;
  pay_rate?: number | null;
  pay_due?: number | null;         // base calc from DB
  is_paid?: boolean | null;
  paid_at?: string | null;
};

function calcPay(row: ShiftRow) {
  const base = Number(row.pay_due ?? 0);
  // $50 minimum for Breakdown shifts
  return row.shift_type === 'Breakdown' ? Math.max(base, 50) : base;
}

export default function Dashboard() {
  const r = useRouter();
  const [user, setUser] = useState<any>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  // Auth guard: bounce to / when not signed in
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) r.replace('/'); // go to sign in
    });
  }, [r]);

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
      return { start, end, label: `${format(start, 'MMMM yyyy')}` };
    }
    return { start: null as any, end: null as any, label: 'All time' };
  }, [mode, offset]);

  async function load() {
    if (!user) return;
    setLoading(true);
    setErr(undefined);
    try {
      let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
      if (mode !== 'all') {
        q = q
          .gte('shift_date', format(range.start, 'yyyy-MM-dd'))
          .lte('shift_date', format(range.end, 'yyyy-MM-dd'));
      }
      const { data, error } = await q;
      if (error) throw error;
      setShifts((data as ShiftRow[]) || []);
    } catch (e: any) {
      setErr(e.message || 'Could not load shifts');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [user, mode, offset]); // reload when range changes

  // Totals use calcPay() so they reflect the $50 Breakdown minimum
  const totals = useMemo(() => {
    const hours = shifts.reduce((s, x) => s + Number(x.hours_worked || 0), 0);
    const pay = shifts.reduce((s, x) => s + calcPay(x), 0);
    const unpaid = shifts.reduce((s, x) => s + ((x.is_paid ? 0 : calcPay(x))), 0);
    return { hours, pay, unpaid };
  }, [shifts]);

  if (!user) return null;

  return (
    <main className="page">
      <h1>My Shifts ({mode === 'week' ? 'This Week' : mode === 'month' ? 'This Month' : 'All Time'})</h1>
      {err && <p className="error">Error: {err}</p>}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
        <select value={mode} onChange={(e) => { setMode(e.target.value as Mode); setOffset(0); }}>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="all">All time</option>
        </select>
        {mode !== 'all' && (
          <>
            <button onClick={() => setOffset(n => n - 1)}>◀ Prev</button>
            <button onClick={() => setOffset(0)}>This {mode}</button>
            <button onClick={() => setOffset(n => n + 1)} disabled={offset >= 0}>Next ▶</button>
            <div style={{ marginLeft: 8, opacity: 0.8 }}>{range.label}</div>
          </>
        )}
        <Link href="/new-shift" className="link-right">+ Log Shift</Link>
      </div>

      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <div className="chip">Hours: <b>{totals.hours.toFixed(2)}</b></div>
        <div className="chip">Pay: <b>${totals.pay.toFixed(2)}</b></div>
        <div className="chip">Unpaid: <b>${totals.unpaid.toFixed(2)}</b></div>
      </div>

      {loading && <p>Loading…</p>}

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
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const paid = Boolean(s.is_paid);
              const displayPay = calcPay(s);
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
                  <td data-label="Hours" style={{ textAlign: 'center' }}>
                    {Number(s.hours_worked).toFixed(2)}
                  </td>
                  <td data-label="Pay" style={{ textAlign: 'center' }}>
                    ${displayPay.toFixed(2)}
                  </td>
                  <td data-label="Status">
                    <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>
                      {paid ? 'PAID' : 'NOT PAID'}
                    </span>
                    {s.paid_at
                      ? <span style={{ marginLeft: 8, opacity: 0.7 }}>
                          ({new Date(s.paid_at).toLocaleDateString()})
                        </span>
                      : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .page { max-width: 1100px; margin: 32px auto; padding: 0 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
        h1 { margin: 0 0 12px; font-size: clamp(22px, 3.2vw, 34px); }
        .row { display: flex; align-items: center; }
        .link-right { margin-left: auto; }
        .chip { background: #f8fafc; border: 1px solid #e5e7eb; padding: 8px 12px; border-radius: 999px; }

        .table-wrap { width: 100%; overflow-x: auto; }
        .table { width: 100%; border-collapse: collapse; border-radius: 14px; overflow: hidden; }
        thead th { background: #f8fafc; border-bottom: 1px solid #eaeef3; padding: 12px; text-align: center; }
        thead th:first-child, tbody td:first-child { text-align: left; }
        tbody td { padding: 12px; border-top: 1px solid #f1f5f9; }
        .table--center td:nth-child(5),
        .table--center td:nth-child(6) { text-align: center; }

        .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .badge-paid { background: #dcfce7; color: #065f46; border: 1px solid #bbf7d0; }
        .badge-unpaid { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

        /* Mobile stacked labels */
        @media (max-width: 760px) {
          thead { display: none; }
          .table, tbody, tr, td { display: block; width: 100%; }
          tr { background: #fff; border: 1px solid #eef2f7; border-radius: 12px; margin-bottom: 10px; padding: 6px 8px; }
          td { border: none; padding: 8px; display: grid; grid-template-columns: 120px 1fr; gap: 10px; }
          td::before { content: attr(data-label); font-weight: 600; color: #1f2937; }
          .table--center td { text-align: right !important; }
        }
      `}</style>
    </main>
  );
}
