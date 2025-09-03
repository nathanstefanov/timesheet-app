// pages/admin.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { supabase } from '../lib/supabaseClient';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';

type Profile = { id: string; role: 'admin' | 'employee' } | null;
type Shift = {
  id: string;
  user_id: string;
  shift_date: string;
  shift_type: string;
  time_in?: string | null;
  time_out?: string | null;
  hours_worked?: number | null;
  pay_due?: number | null;
  is_paid?: boolean | null;
  paid_at?: string | null;
  paid_by?: string | null;
};

function payInfo(s: Shift): { pay: number; minApplied: boolean; base: number } {
  const rate = Number((s as any).pay_rate ?? 25);
  const hours = Number(s.hours_worked ?? 0);
  const base = s.pay_due != null ? Number(s.pay_due) : hours * rate;
  const isBreakdown = s.shift_type === 'Breakdown';
  const pay = isBreakdown ? Math.max(base, 50) : base;
  return { pay, minApplied: isBreakdown && base < 50, base };
}

function venmoHref(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.startsWith('@') ? v.slice(1) : v;
  return `https://venmo.com/u/${encodeURIComponent(handle)}`;
}

type PageProps = {
  initialSession: any;
  initialProfile: { id: string; full_name?: string | null; role: 'admin' | 'employee' };
};

export default function Admin(_props: PageProps) {
  // We already know the user is admin (SSR enforced), so no client role check.
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [venmo, setVenmo] = useState<Record<string, string>>({});

  const [tab, setTab] = useState<Tab>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setErr(undefined);
    try {
      let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
      if (tab === 'unpaid') q = q.eq('is_paid', false);
      if (tab === 'paid') q = q.eq('is_paid', true);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Shift[];
      setShifts(rows);

      const ids = Array.from(new Set(rows.map(s => s.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, venmo_url')
          .in('id', ids);

        const nameMap: Record<string, string> = {};
        const venmoMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          nameMap[p.id] = p.full_name || '—';
          if (p.venmo_url) venmoMap[p.id] = p.venmo_url;
        });
        setNames(nameMap);
        setVenmo(venmoMap);
      } else {
        setNames({});
        setVenmo({});
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load shifts.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  useEffect(() => {
    const onFocus = () => loadShifts();
    const onVisible = () => document.visibilityState === 'visible' && loadShifts();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadShifts]);

  const totals = useMemo(() => {
    const m: Record<string, { id: string; name: string; hours: number; pay: number; unpaid: number; minCount: number }> = {};
    for (const s of shifts) {
      const id = s.user_id;
      const name = names[id] || '—';
      m[id] ??= { id, name, hours: 0, pay: 0, unpaid: 0, minCount: 0 };
      const { pay, minApplied } = payInfo(s);
      const h = Number(s.hours_worked || 0);
      m[id].hours += h;
      m[id].pay += pay;
      if (minApplied) m[id].minCount += 1;
      if (!Boolean(s.is_paid)) m[id].unpaid += pay;
    }
    return Object.values(m);
  }, [shifts, names]);

  const unpaidTotal = useMemo(() => totals.reduce((sum, t) => sum + t.unpaid, 0), [totals]);

  const sortedTotals = useMemo(() => {
    const a = [...totals];
    if (sortBy === 'name') {
      a.sort((x, y) => x.name.localeCompare(y.name) * (sortDir === 'asc' ? 1 : -1));
    } else {
      a.sort((x, y) => {
        const aa = (x as any)[sortBy] as number;
        const bb = (y as any)[sortBy] as number;
        return (bb - aa) * (sortDir === 'asc' ? -1 : 1);
      });
    }
    return a;
  }, [totals, sortBy, sortDir]);

  const groups = useMemo(() => {
    const m: Record<string, Shift[]> = {};
    for (const s of shifts) (m[s.user_id] ??= []).push(s);
    for (const id in m) {
      m[id].sort((a, b) => {
        if (a.shift_date < b.shift_date) return -1;
        if (a.shift_date > b.shift_date) return 1;
        return String(a.time_in || '').localeCompare(String(b.time_in || ''));
      });
    }
    return m;
  }, [shifts]);

  const sectionOrder = useMemo(() => sortedTotals.map(t => t.id), [sortedTotals]);

  async function togglePaid(row: Shift, next: boolean) {
    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? 'admin' : null,
    };
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, is_paid: !next } : s)));
    }
  }

  async function bulkTogglePaidForEmployee(userId: string, next: boolean) {
    const rows = groups[userId] || [];
    const toChange = rows.filter(s => Boolean(s.is_paid) !== next).map(s => s.id);
    if (!toChange.length) return;

    const name = names[userId] || 'employee';
    const verb = next ? 'mark ALL shifts PAID' : 'mark ALL shifts UNPAID';
    if (!confirm(`Are you sure you want to ${verb} for ${name}? (${toChange.length} shift${toChange.length > 1 ? 's' : ''})`)) return;

    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? 'admin' : null,
    };

    setBulkBusy(b => ({ ...b, [userId]: true }));
    const prev = shifts;
    setShifts(prev => prev.map(s => (s.user_id === userId && toChange.includes(s.id) ? { ...s, ...patch } : s)));

    const { error } = await supabase.from('shifts').update(patch).in('id', toChange);
    if (error) {
      alert(error.message);
      setShifts(prev);
    }
    setBulkBusy(b => ({ ...b, [userId]: false }));
  }

  function editRow(row: Shift) { window.location.href = `/shift/${row.id}`; }

  async function deleteRow(row: Shift) {
    const name = names[row.user_id] || 'employee';
    if (!confirm(`Delete shift for ${name} on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(s => s.id !== row.id));
  }

  return (
    <main className="page page--center">
      <h1 className="page__title">Admin Dashboard</h1>
      {err && <div className="alert error" role="alert">Error: {err}</div>}

      {/* Summary */}
      <div className="card card--tight full">
        <div className="admin-summary admin-summary--center" style={{ margin: 0, border: 0, boxShadow: 'none' }}>
          <span className="chip chip--xl">Total Unpaid: ${unpaidTotal.toFixed(2)}</span>
          <span className="meta">Employees with Unpaid: {totals.filter(t => t.unpaid > 0).length}</span>
          <span className="inline">
            <span className="badge badge-min">MIN $50</span>
            <span className="muted">Breakdown boosted to minimum</span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="card card--tight full" style={{ marginTop: 10, padding: 10 }}>
        <div className="tabs tabs--center" style={{ margin: 0 }}>
          <button className={tab === 'unpaid' ? 'active' : ''} onClick={() => setTab('unpaid')}>Unpaid</button>
          <button className={tab === 'paid' ? 'active' : ''} onClick={() => setTab('paid')}>Paid</button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All</button>
        </div>
      </div>

      {/* Totals by Employee */}
      <div className="card card--tight full">
        <div className="card__header">
          <h3>Totals by Employee</h3>
          <div className="row">
            <label className="sr-only" htmlFor="sort-by">Sort by</label>
            <select id="sort-by" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="name">Name</option>
              <option value="hours">Hours</option>
              <option value="pay">Pay</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <button
              className="topbar-btn"
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label="Toggle sort direction"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table table--center table--compact table--admin">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Hours</th>
                <th>Pay</th>
                <th>Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {sortedTotals.map((t) => {
                const vHref = venmoHref(venmo[t.id]);
                const hasUnpaid = t.unpaid > 0.0001;
                return (
                  <tr key={t.id}>
                    <td data-label="Employee">
                      {t.name}
                      {t.minCount > 0 && <span className="muted" style={{ marginLeft: 8 }}>({t.minCount}× MIN)</span>}
                    </td>
                    <td data-label="Hours">{t.hours.toFixed(2)}</td>
                    <td data-label="Pay">${t.pay.toFixed(2)}</td>
                    <td data-label="Unpaid">
                      ${t.unpaid.toFixed(2)}
                      {hasUnpaid && vHref && (
                        <a className="btn-venmo" href={vHref} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
                          Venmo
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shifts */}
      <div className="card card--tight full" style={{ marginTop: 12 }}>
        <div className="card__header">
          <h3>Shifts</h3>
        </div>

        {loading && <p className="center">Loading…</p>}

        <div className="table-wrap">
          <table className="table table--center table--compact table--admin table--stack">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Type</th>
                <th>In</th>
                <th>Out</th>
                <th>Hours</th>
                <th>Pay</th>
                <th>Paid?</th>
                <th className="col-hide-md">Paid at</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sectionOrder.map((uid) => {
                const rows = groups[uid] || [];
                if (!rows.length) return null;

                const name = names[uid] || '—';
                const subtotal = rows.reduce(
                  (acc, s) => {
                    const info = payInfo(s);
                    acc.hours += Number(s.hours_worked || 0);
                    acc.pay += info.pay;
                    return acc;
                  },
                  { hours: 0, pay: 0 }
                );

                const unpaidCount = rows.filter(s => !s.is_paid).length;
                const allPaid = unpaidCount === 0;

                return (
                  <React.Fragment key={uid}>
                    <tr className="section-head">
                      <td colSpan={10}>
                        <div className="section-bar">
                          <div className="section-bar__left">
                            <strong className="employee-name">{name}</strong>
                            <div className="pill" aria-label="Unpaid shifts">
                              <span className="pill__num">{unpaidCount}</span>
                              <span className="pill__label">unpaid shifts</span>
                            </div>
                          </div>
                          <div className="section-bar__right">
                            <button
                              className="topbar-btn"
                              disabled={bulkBusy[uid] || allPaid}
                              onClick={() => bulkTogglePaidForEmployee(uid, true)}
                            >
                              Mark ALL Paid
                            </button>
                            <button
                              className="topbar-btn"
                              disabled={bulkBusy[uid] || rows.length === unpaidCount}
                              onClick={() => bulkTogglePaidForEmployee(uid, false)}
                            >
                              Mark ALL Unpaid
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {rows.map((s) => {
                      const { pay, minApplied, base } = payInfo(s);
                      const paid = Boolean(s.is_paid);
                      return (
                        <tr key={s.id}>
                          <td data-label="Employee">{name}</td>
                          <td data-label="Date">{s.shift_date}</td>
                          <td data-label="Type">{s.shift_type}</td>
                          <td data-label="In">
                            {s.time_in ? new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td data-label="Out">
                            {s.time_out ? new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td data-label="Hours">{Number(s.hours_worked ?? 0).toFixed(2)}</td>
                          <td data-label="Pay">
                            ${pay.toFixed(2)}{' '}
                            {minApplied && (
                              <span
                                className="badge badge-min"
                                title={`Breakdown minimum applied (base ${base.toFixed(2)} < $50)`}
                                style={{ marginLeft: 6 }}
                              >
                                MIN $50
                              </span>
                            )}
                          </td>
                          <td data-label="Paid?">
                            <label className="inline-check">
                              <input
                                type="checkbox"
                                checked={paid}
                                onChange={(e) => togglePaid(s, e.target.checked)}
                                disabled={bulkBusy[uid]}
                                aria-label={paid ? 'Mark unpaid' : 'Mark paid'}
                              />
                              <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>
                                {paid ? 'PAID' : 'NOT PAID'}
                              </span>
                            </label>
                          </td>
                          <td data-label="Paid at" className="col-hide-md">
                            {s.paid_at ? new Date(s.paid_at).toLocaleString() : '—'}
                          </td>
                          <td data-label="Actions">
                            <div className="actions">
                              <button className="btn-edit" onClick={() => editRow(s)}>Edit</button>
                              <button className="btn-delete" onClick={() => deleteRow(s)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="subtotal">
                      <td colSpan={5} style={{ textAlign: 'right' }}>Total — {name}</td>
                      <td>{subtotal.hours.toFixed(2)}</td>
                      <td>${subtotal.pay.toFixed(2)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .btn-venmo{
          display:inline-flex; align-items:center; justify-content:center;
          height:28px; padding:0 10px; border-radius:999px;
          font-weight:800; text-decoration:none; border:1px solid var(--border);
          background:#f8fafc; color:#1f2937; box-shadow: var(--shadow-sm);
        }
        .btn-venmo:hover{ filter:brightness(0.98); }
        .btn-venmo:active{ transform: translateY(1px); }
      `}</style>
    </main>
  );
}

// --- SSR: only allow admins in, and seed _app with initialProfile ---
export async function getServerSideProps(
  ctx: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<PageProps>> {
  const supa = createServerSupabaseClient(ctx, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  });

  const { data: userData } = await supa.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { redirect: { destination: '/', permanent: false } };
  }

  const { data: profile } = await supa
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { redirect: { destination: '/dashboard?msg=not_admin', permanent: false } };
  }

  return {
    props: {
      initialSession: userData,     // not strictly needed by our _app, but harmless
      initialProfile: profile,      // this is what _app.tsx consumes
    },
  };
}
