// pages/admin.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';
type Profile = { id: string; role: 'admin' | 'employee' } | null;

/** Compute pay info with Breakdown $50 minimum (uses DB pay_due if present). */
function payInfo(s: any): { pay: number; minApplied: boolean; base: number } {
  const rate  = Number(s.pay_rate ?? 25);
  const hours = Number(s.hours_worked ?? 0);
  const base  = s.pay_due != null ? Number(s.pay_due) : hours * rate;
  const isBreakdown = s.shift_type === 'Breakdown';
  const pay = isBreakdown ? Math.max(base, 50) : base;
  const minApplied = isBreakdown && base < 50;
  return { pay, minApplied, base };
}

export default function Admin() {
  const r = useRouter();

  const [me, setMe] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);

  const [shifts, setShifts] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const [tab, setTab] = useState<Tab>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  // ---- Auth + role check ----
  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setMe(null);
        setChecking(false);
        r.replace('/');
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single();

      if (!active) return;
      setMe((prof as any) ?? null);
      setChecking(false);

      if (!prof || prof.role !== 'admin') {
        r.replace('/dashboard?msg=not_admin');
      }
    }

    setChecking(true);
    loadProfile();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setChecking(true);
      loadProfile();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [r]);

  // ---- Load shifts after role is known ----
  useEffect(() => {
    if (checking) return;
    if (!me || me.role !== 'admin') return;

    (async () => {
      setLoading(true);
      setErr(undefined);
      try {
        let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
        if (tab === 'unpaid') q = q.eq('is_paid', false);
        if (tab === 'paid') q = q.eq('is_paid', true);

        const { data, error } = await q;
        if (error) throw error;

        const rows = data || [];
        setShifts(rows);

        // Fetch names for display
        const ids = Array.from(new Set(rows.map((s: any) => s.user_id)));
        if (ids.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', ids);
          const map: Record<string, string> = {};
          (profs || []).forEach((p: any) => { map[p.id] = p.full_name || '—'; });
          setNames(map);
        } else {
          setNames({});
        }
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [checking, me, tab]);

  // ---- Totals by employee ----
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

  // ---- Sort totals table ----
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

  // ---- Group shifts by employee ----
  const groups = useMemo(() => {
    const m: Record<string, any[]> = {};
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

  // ---- Actions ----
  async function togglePaid(row: any, next: boolean) {
    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? (me as any)!.id : null,
    };
    setShifts(prev => prev.map(s => s.id === row.id ? { ...s, ...patch } : s));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => s.id === row.id ? { ...s, is_paid: !next } : s));
    }
  }

  async function bulkTogglePaidForEmployee(userId: string, next: boolean) {
    const rows = groups[userId] || [];
    const toChange = rows.filter((s) => Boolean(s.is_paid) !== next).map((s) => s.id);
    if (!toChange.length) return;

    const name = names[userId] || 'employee';
    const verb = next ? 'mark ALL shifts PAID' : 'mark ALL shifts UNPAID';
    if (!confirm(`Are you sure you want to ${verb} for ${name}? (${toChange.length} shift${toChange.length > 1 ? 's' : ''})`)) return;

    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? (me as any)!.id : null,
    };

    setBulkBusy((b) => ({ ...b, [userId]: true }));
    const prevShifts = shifts;

    setShifts((prev) =>
      prev.map((s) => (s.user_id === userId && toChange.includes(s.id) ? { ...s, ...patch } : s))
    );

    const { error } = await supabase.from('shifts').update(patch).in('id', toChange);
    if (error) {
      alert(error.message);
      setShifts(prevShifts);
    }
    setBulkBusy((b) => ({ ...b, [userId]: false }));
  }

  function editRow(row: any) { r.push(`/shift/${row.id}`); }

  async function deleteRow(row: any) {
    if (!confirm(`Delete shift for ${names[row.user_id] || 'employee'} on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(s => s.id !== row.id));
  }

  if (checking) {
    return (
      <main className="page">
        <h1>Admin</h1>
        <p>Loading…</p>
      </main>
    );
  }
  if (!me || me.role !== 'admin') return null;

  return (
    <main className="page">
      <h1>Admin Dashboard</h1>
      {err && <p className="error" role="alert">Error: {err}</p>}

      {/* Summary bar */}
      <div className="admin-summary">
        <span>Total Unpaid: ${unpaidTotal.toFixed(2)}</span>
        <span className="meta">Employees with Unpaid: {totals.filter(t => t.unpaid > 0).length}</span>
        <span className="meta inline">
          <span className="badge badge-min">MIN $50</span>
          <span className="muted">Breakdown shifts boosted to minimum</span>
        </span>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="Filter by paid status">
        <button
          role="tab"
          aria-selected={tab === 'unpaid'}
          className={tab === 'unpaid' ? 'active' : ''}
          onClick={() => setTab('unpaid')}
        >
          Unpaid
        </button>
        <button
          role="tab"
          aria-selected={tab === 'paid'}
          className={tab === 'paid' ? 'active' : ''}
          onClick={() => setTab('paid')}
        >
          Paid
        </button>
        <button
          role="tab"
          aria-selected={tab === 'all'}
          className={tab === 'all' ? 'active' : ''}
          onClick={() => setTab('all')}
        >
          All
        </button>
      </div>

      {/* Totals by employee */}
      <div className="card">
        <div className="card__header">
          <h3>Totals by Employee</h3>
          <div className="row">
            <label className="sr-only" htmlFor="sort-by">Sort by</label>
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
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label="Toggle sort direction"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table table--center table--stack">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Hours</th>
                <th>Pay</th>
                <th>Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {sortedTotals.map((t) => (
                <tr key={t.id}>
                  <td data-label="Employee">
                    {t.name}
                    {t.minCount > 0 && (
                      <span className="muted" style={{ marginLeft: 8 }}>
                        ({t.minCount}× MIN)
                      </span>
                    )}
                  </td>
                  <td data-label="Hours">{t.hours.toFixed(2)}</td>
                  <td data-label="Pay">${t.pay.toFixed(2)}</td>
                  <td data-label="Unpaid">${t.unpaid.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shifts grouped by employee */}
      <h3>Shifts</h3>
      {loading && <p>Loading…</p>}
      <div className="table-wrap">
        <table className="table table--center table--stack">
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
              <th>Paid at</th>
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

              const unpaidCount = rows.filter((s) => !s.is_paid).length;
              const allPaid = unpaidCount === 0;

              return (
                <React.Fragment key={uid}>
                  <tr className="section-head">
                    <td colSpan={10} className="section-controls">
                      <div className="section-controls__left">
                        <strong>{name}</strong>
                        {/* Centered unpaid shifts counter */}
                        <div className="section-stat" aria-label="Unpaid shifts">
                          <div className="section-stat__num">{unpaidCount}</div>
                          <div className="section-stat__label">unpaid<br/>shifts</div>
                        </div>
                      </div>

                      <div className="section-controls__right">
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
                          {new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td data-label="Out">
                          {new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td data-label="Hours">{Number(s.hours_worked).toFixed(2)}</td>
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
                        <td data-label="Paid at">
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
    </main>
  );
}
