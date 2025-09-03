// pages/admin.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';

type ShiftRow = {
  id: string;
  user_id: string;
  shift_date: string;        // YYYY-MM-DD
  shift_type: string;        // 'Setup' | 'Breakdown' | 'Shop' | ...
  time_in: string | null;    // ISO
  time_out: string | null;   // ISO
  hours_worked: number | null;
  pay_due: number | null;    // may be computed by DB or null; we fallback below
  is_paid: boolean | null;
  paid_at: string | null;    // ISO
  paid_by: string | null;

  // joined profile (via FK shifts.user_id -> profiles.id)
  profiles: {
    id: string;
    full_name: string | null;
    venmo_url: string | null;
    hourly_rate?: number | null;
  } | null;
};

function calcPay(row: ShiftRow) {
  // If DB provides pay_due we trust it; otherwise compute fallback
  const rate =
    Number((row as any).pay_rate ?? row.profiles?.hourly_rate ?? 25);
  const hours = Number(row.hours_worked ?? 0);
  const base = row.pay_due != null ? Number(row.pay_due) : hours * rate;
  const isBreakdown = row.shift_type === 'Breakdown';
  const pay = isBreakdown ? Math.max(base, 50) : base;
  return { pay, minApplied: isBreakdown && base < 50, base };
}

function venmoHref(raw?: string | null) {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.startsWith('@') ? v.slice(1) : v;
  return `https://venmo.com/u/${encodeURIComponent(handle)}`;
}

export default function Admin() {
  // Access / gating
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // UI state
  const [tab, setTab] = useState<Tab>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Data
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<Record<string, boolean>>({});

  // --- One-time admin check (no redirects, just guard the page) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      if (!alive) return;

      if (!session?.user) {
        setIsAdmin(false);
        setAuthChecked(true);
        return;
      }

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setIsAdmin(false);
      } else {
        setIsAdmin((prof?.role as any) === 'admin');
      }
      setAuthChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // --- Load shifts (single query with JOIN so names & Venmo are present) ---
  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErr(null);
    try {
      // NOTE: The '!inner' ensures only rows with a matching profile come back
      let q = supabase
        .from('shifts')
        .select(
          `
          id, user_id, shift_date, shift_type, time_in, time_out,
          hours_worked, pay_due, is_paid, paid_at, paid_by,
          profiles!inner (
            id, full_name, venmo_url, hourly_rate
          )
        `
        )
        .order('shift_date', { ascending: false });

      if (tab === 'unpaid') q = q.eq('is_paid', false);
      if (tab === 'paid') q = q.eq('is_paid', true);

      const { data, error } = await q;
      if (error) throw error;

      // Fix: Map profiles from array to object
      const fixedData = (data ?? []).map((row: any) => ({
        ...row,
        profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles ?? null,
      }));
      setRows(fixedData as ShiftRow[]);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load shifts.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, tab]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // ---- Derived aggregations ----
  const byUser = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        name: string;
        venmo: string | null;
        rows: ShiftRow[];
        hours: number;
        pay: number;
        unpaid: number;
        minCount: number;
      }
    > = {};
    for (const r of rows) {
      const id = r.user_id;
      const name = r.profiles?.full_name || '—';
      const venmo = r.profiles?.venmo_url || null;
      const { pay, minApplied } = calcPay(r);
      const hours = Number(r.hours_worked || 0);

      if (!map[id]) {
        map[id] = {
          id,
          name,
          venmo,
          rows: [],
          hours: 0,
          pay: 0,
          unpaid: 0,
          minCount: 0,
        };
      }
      map[id].rows.push(r);
      map[id].hours += hours;
      map[id].pay += pay;
      if (!r.is_paid) map[id].unpaid += pay;
      if (minApplied) map[id].minCount += 1;
    }

    // sort each user's rows by date/time
    for (const uid in map) {
      map[uid].rows.sort((a, b) => {
        if (a.shift_date < b.shift_date) return -1;
        if (a.shift_date > b.shift_date) return 1;
        return String(a.time_in || '').localeCompare(String(b.time_in || ''));
      });
    }
    return map;
  }, [rows]);

  const userList = useMemo(() => Object.values(byUser), [byUser]);

  const sectionOrder = useMemo(() => {
    const arr = [...userList];
    if (sortBy === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy]);
    }
    if (sortDir === 'desc') arr.reverse();
    return arr.map((x) => x.id);
  }, [userList, sortBy, sortDir]);

  const unpaidTotal = useMemo(
    () => userList.reduce((sum, u) => sum + u.unpaid, 0),
    [userList]
  );

  // ---- Actions ----
  async function togglePaid(row: ShiftRow, next: boolean) {
    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? 'admin' : null,
    };

    // optimistic
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r))
    );

    const { error } = await supabase
      .from('shifts')
      .update(patch)
      .eq('id', row.id);

    if (error) {
      alert(error.message);
      // revert optimistic change
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, is_paid: !next, paid_at: row.paid_at, paid_by: row.paid_by } : r
        )
      );
    }
  }

  async function bulkToggle(userId: string, next: boolean) {
    const group = byUser[userId];
    if (!group) return;

    const toChange = group.rows.filter((r) => Boolean(r.is_paid) !== next);
    if (!toChange.length) return;

    if (
      !confirm(
        `Are you sure you want to ${next ? 'mark ALL PAID' : 'mark ALL UNPAID'} for ${group.name}? (${toChange.length} shift${toChange.length > 1 ? 's' : ''})`
      )
    ) {
      return;
    }

    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? 'admin' : null,
    };

    setBusyUser((b) => ({ ...b, [userId]: true }));
    const prev = rows;
    setRows((prevRows) =>
      prevRows.map((r) => (r.user_id === userId ? { ...r, ...patch } : r))
    );

    const ids = toChange.map((r) => r.id);
    const { error } = await supabase.from('shifts').update(patch).in('id', ids);
    if (error) {
      alert(error.message);
      setRows(prev); // revert
    }
    setBusyUser((b) => ({ ...b, [userId]: false }));
  }

  async function remove(row: ShiftRow) {
    if (!confirm(`Delete shift on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) return alert(error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  // ---- Render ----
  if (!authChecked) {
    return (
      <main className="page page--center">
        <h1 className="page__title">Admin</h1>
        <p>Checking access…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="page page--center">
        <h1 className="page__title">Admin</h1>
        <div className="alert error">You don’t have access to this page.</div>
      </main>
    );
  }

  return (
    <main className="page page--center">
      <h1 className="page__title">Admin Dashboard</h1>
      {err && <div className="alert error">Error: {err}</div>}

      {/* Summary */}
      <div className="card card--tight full">
        <div
          className="admin-summary admin-summary--center"
          style={{ margin: 0, border: 0, boxShadow: 'none' }}
        >
          <span className="chip chip--xl">
            Total Unpaid: ${unpaidTotal.toFixed(2)}
          </span>
          <span className="meta">
            Employees with Unpaid: {userList.filter((u) => u.unpaid > 0).length}
          </span>
          <span className="inline">
            <span className="badge badge-min">MIN $50</span>
            <span className="muted">Breakdown boosted to minimum</span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="card card--tight full" style={{ marginTop: 10, padding: 10 }}>
        <div className="tabs tabs--center" style={{ margin: 0 }}>
          <button
            className={tab === 'unpaid' ? 'active' : ''}
            onClick={() => setTab('unpaid')}
          >
            Unpaid
          </button>
          <button
            className={tab === 'paid' ? 'active' : ''}
            onClick={() => setTab('paid')}
          >
            Paid
          </button>
          <button
            className={tab === 'all' ? 'active' : ''}
            onClick={() => setTab('all')}
          >
            All
          </button>
        </div>
      </div>

      {/* Totals by Employee */}
      <div className="card card--tight full">
        <div className="card__header">
          <h3>Totals by Employee</h3>
          <div className="row">
            <label className="sr-only" htmlFor="sort-by">
              Sort by
            </label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              <option value="name">Name</option>
              <option value="hours">Hours</option>
              <option value="pay">Pay</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <button
              className="topbar-btn"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
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
              {sectionOrder.map((uid) => {
                const u = byUser[uid];
                const vHref = venmoHref(u?.venmo);
                const hasUnpaid = (u?.unpaid ?? 0) > 0.0001;
                return (
                  <tr key={uid}>
                    <td>
                      {u?.name ?? '—'}
                      {!!u?.minCount && (
                        <span className="muted" style={{ marginLeft: 8 }}>
                          ({u.minCount}× MIN)
                        </span>
                      )}
                    </td>
                    <td>{(u?.hours ?? 0).toFixed(2)}</td>
                    <td>${(u?.pay ?? 0).toFixed(2)}</td>
                    <td>
                      ${(u?.unpaid ?? 0).toFixed(2)}
                      {hasUnpaid && vHref && (
                        <a
                          className="btn-venmo"
                          href={vHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ marginLeft: 8 }}
                        >
                          Venmo
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted center">
                    No data.
                  </td>
                </tr>
              )}
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
                const group = byUser[uid];
                if (!group) return null;

                const unpaidCount = group.rows.filter((r) => !r.is_paid).length;
                const allPaid = unpaidCount === 0;

                return (
                  <React.Fragment key={uid}>
                    <tr className="section-head">
                      <td colSpan={10}>
                        <div className="section-bar">
                          <div className="section-bar__left">
                            <strong className="employee-name">{group.name}</strong>
                            <div className="pill" aria-label="Unpaid shifts">
                              <span className="pill__num">{unpaidCount}</span>
                              <span className="pill__label">unpaid shifts</span>
                            </div>
                          </div>
                          <div className="section-bar__right">
                            <button
                              className="topbar-btn"
                              disabled={busyUser[uid] || allPaid}
                              onClick={() => bulkToggle(uid, true)}
                            >
                              Mark ALL Paid
                            </button>
                            <button
                              className="topbar-btn"
                              disabled={
                                busyUser[uid] || group.rows.length === unpaidCount
                              }
                              onClick={() => bulkToggle(uid, false)}
                            >
                              Mark ALL Unpaid
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {group.rows.map((r) => {
                      const { pay, minApplied, base } = calcPay(r);
                      const paid = !!r.is_paid;
                      return (
                        <tr key={r.id}>
                          <td>{group.name}</td>
                          <td>{r.shift_date}</td>
                          <td>{r.shift_type}</td>
                          <td>
                            {r.time_in
                              ? new Date(r.time_in).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td>
                            {r.time_out
                              ? new Date(r.time_out).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td>{Number(r.hours_worked ?? 0).toFixed(2)}</td>
                          <td>
                            ${pay.toFixed(2)}{' '}
                            {minApplied && (
                              <span
                                className="badge badge-min"
                                title={`Breakdown minimum applied (base ${base.toFixed(
                                  2
                                )} < $50)`}
                                style={{ marginLeft: 6 }}
                              >
                                MIN $50
                              </span>
                            )}
                          </td>
                          <td>
                            <label className="inline-check">
                              <input
                                type="checkbox"
                                checked={paid}
                                onChange={(e) => togglePaid(r, e.target.checked)}
                                disabled={busyUser[uid]}
                              />
                              <span
                                className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}
                              >
                                {paid ? 'PAID' : 'NOT PAID'}
                              </span>
                            </label>
                          </td>
                          <td className="col-hide-md">
                            {r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                className="btn-edit"
                                onClick={() =>
                                  (window.location.href = `/shift/${r.id}`)
                                }
                              >
                                Edit
                              </button>
                              <button className="btn-delete" onClick={() => remove(r)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="subtotal">
                      <td colSpan={5} style={{ textAlign: 'right' }}>
                        Total — {group.name}
                      </td>
                      <td>{group.hours.toFixed(2)}</td>
                      <td>${group.pay.toFixed(2)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted center">
                    No shifts.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={10} className="center">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .btn-venmo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          font-weight: 800;
          text-decoration: none;
          border: 1px solid var(--border);
          background: #f8fafc;
          color: #1f2937;
          box-shadow: var(--shadow-sm);
        }
        .btn-venmo:hover {
          filter: brightness(0.98);
        }
        .btn-venmo:active {
          transform: translateY(1px);
        }
      `}</style>
    </main>
  );
}
