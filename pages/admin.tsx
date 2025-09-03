// pages/admin.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';

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

function calcPay(s: Shift) {
  const rate = Number((s as any).pay_rate ?? 25);
  const hours = Number(s.hours_worked ?? 0);
  const base = s.pay_due != null ? Number(s.pay_due) : hours * rate;
  const isBreakdown = s.shift_type === 'Breakdown';
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
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tab, setTab] = useState<Tab>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [venmo, setVenmo] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  // One-time admin check (no redirects here to avoid flicker)
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
    return () => { alive = false; };
  }, []);

  const loadShifts = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErr(null);
    try {
      let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
      if (tab === 'unpaid') q = q.eq('is_paid', false);
      if (tab === 'paid') q = q.eq('is_paid', true);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Shift[];
      setShifts(rows);

      const ids = Array.from(new Set(rows.map(r => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, venmo_url')
          .in('id', ids);

        const n: Record<string, string> = {};
        const v: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          n[p.id] = p.full_name || '—';
          if (p.venmo_url) v[p.id] = p.venmo_url;
        });
        setNames(n);
        setVenmo(v);
      } else {
        setNames({});
        setVenmo({});
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load shifts.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, tab]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // Simple visibility refresh (no timers)
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && loadShifts();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadShifts]);

  // Derived data (pure)
  const totals = useMemo(() => {
    const m: Record<string, { id: string; name: string; hours: number; pay: number; unpaid: number; minCount: number }> = {};
    for (const s of shifts) {
      const id = s.user_id;
      const name = names[id] || '—';
      const info = calcPay(s);
      const h = Number(s.hours_worked || 0);
      const slot = (m[id] ??= { id, name, hours: 0, pay: 0, unpaid: 0, minCount: 0 });
      slot.hours += h;
      slot.pay += info.pay;
      if (info.minApplied) slot.minCount += 1;
      if (!s.is_paid) slot.unpaid += info.pay;
    }
    return Object.values(m);
  }, [shifts, names]);

  const sectionOrder = useMemo(() => {
    const a = [...totals];
    if (sortBy === 'name') a.sort((x, y) => x.name.localeCompare(y.name));
    else a.sort((x, y) => (y as any)[sortBy] - (x as any)[sortBy]);
    if (sortDir === 'desc') a.reverse();
    return a.map(t => t.id);
  }, [totals, sortBy, sortDir]);

  async function togglePaid(row: Shift, next: boolean) {
    const patch = { is_paid: next, paid_at: next ? new Date().toISOString() : null, paid_by: next ? 'admin' : null };
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, is_paid: !next } : s)));
    }
  }

  async function bulkTogglePaidForEmployee(userId: string, next: boolean) {
    const rows = shifts.filter(s => s.user_id === userId);
    const toChange = rows.filter(s => Boolean(s.is_paid) !== next).map(s => s.id);
    if (!toChange.length) return;

    const name = names[userId] || 'employee';
    const verb = next ? 'mark ALL shifts PAID' : 'mark ALL shifts UNPAID';
    if (!confirm(`Are you sure you want to ${verb} for ${name}? (${toChange.length})`)) return;

    const patch = { is_paid: next, paid_at: next ? new Date().toISOString() : null, paid_by: next ? 'admin' : null };

    setBulkBusy(b => ({ ...b, [userId]: true }));
    const prev = shifts;
    setShifts(prev => prev.map(s => (toChange.includes(s.id) ? { ...s, ...patch } : s)));

    const { error } = await supabase.from('shifts').update(patch).in('id', toChange);
    if (error) setShifts(prev);
    setBulkBusy(b => ({ ...b, [userId]: false }));
  }

  async function deleteRow(row: Shift) {
    if (!confirm(`Delete shift on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(s => s.id !== row.id));
  }

  if (!authChecked) {
    return (
      <main className="page page--center"><h1 className="page__title">Admin</h1><p>Checking access…</p></main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="page page--center"><h1 className="page__title">Admin</h1><div className="alert error">You don’t have access to this page.</div></main>
    );
  }

  const unpaidTotal = totals.reduce((sum, t) => sum + t.unpaid, 0);

  return (
    <main className="page page--center">
      <h1 className="page__title">Admin Dashboard</h1>
      {err && <div className="alert error">Error: {err}</div>}

      {/* Summary */}
      <div className="card card--tight full">
        <div className="admin-summary admin-summary--center" style={{ margin: 0, border: 0, boxShadow: 'none' }}>
          <span className="chip chip--xl">Total Unpaid: ${unpaidTotal.toFixed(2)}</span>
          <span className="meta">Employees with Unpaid: {totals.filter(t => t.unpaid > 0).length}</span>
          <span className="inline"><span className="badge badge-min">MIN $50</span><span className="muted">Breakdown boosted to minimum</span></span>
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

      {/* Totals table */}
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
            <button className="topbar-btn" onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
              {sortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table table--center table--compact table--admin">
            <thead><tr><th>Employee</th><th>Hours</th><th>Pay</th><th>Unpaid</th></tr></thead>
            <tbody>
              {sectionOrder.map(uid => {
                const t = totals.find(x => x.id === uid)!;
                const vHref = venmoHref(venmo[uid]);
                return (
                  <tr key={uid}>
                    <td>{t.name}{t.minCount > 0 && <span className="muted" style={{ marginLeft: 8 }}>({t.minCount}× MIN)</span>}</td>
                    <td>{t.hours.toFixed(2)}</td>
                    <td>${t.pay.toFixed(2)}</td>
                    <td>
                      ${t.unpaid.toFixed(2)}
                      {t.unpaid > 0.0001 && vHref && (
                        <a className="btn-venmo" href={vHref} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>Venmo</a>
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
        <div className="card__header"><h3>Shifts</h3></div>
        {loading && <p className="center">Loading…</p>}
        <div className="table-wrap">
          <table className="table table--center table--compact table--admin table--stack">
            <thead>
              <tr><th>Employee</th><th>Date</th><th>Type</th><th>In</th><th>Out</th><th>Hours</th><th>Pay</th><th>Paid?</th><th className="col-hide-md">Paid at</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {sectionOrder.flatMap(uid => {
                const rows = shifts.filter(s => s.user_id === uid);
                if (!rows.length) return [];
                const name = names[uid] || '—';
                const unpaidCount = rows.filter(s => !s.is_paid).length;
                const allPaid = unpaidCount === 0;

                const head = (
                  <tr className="section-head" key={`${uid}-head`}>
                    <td colSpan={10}>
                      <div className="section-bar">
                        <div className="section-bar__left">
                          <strong className="employee-name">{name}</strong>
                          <div className="pill"><span className="pill__num">{unpaidCount}</span><span className="pill__label">unpaid shifts</span></div>
                        </div>
                        <div className="section-bar__right">
                          <button className="topbar-btn" disabled={bulkBusy[uid] || allPaid} onClick={() => bulkTogglePaidForEmployee(uid, true)}>Mark ALL Paid</button>
                          <button className="topbar-btn" disabled={bulkBusy[uid] || rows.length === unpaidCount} onClick={() => bulkTogglePaidForEmployee(uid, false)}>Mark ALL Unpaid</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );

                const body = rows.map(s => {
                  const { pay, minApplied, base } = calcPay(s);
                  const paid = !!s.is_paid;
                  return (
                    <tr key={s.id}>
                      <td>{name}</td>
                      <td>{s.shift_date}</td>
                      <td>{s.shift_type}</td>
                      <td>{s.time_in ? new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>{s.time_out ? new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>{Number(s.hours_worked ?? 0).toFixed(2)}</td>
                      <td>
                        ${pay.toFixed(2)}
                        {minApplied && <span className="badge badge-min" title={`Breakdown minimum applied (base ${base.toFixed(2)} < $50)`} style={{ marginLeft: 6 }}>MIN $50</span>}
                      </td>
                      <td>
                        <label className="inline-check">
                          <input type="checkbox" checked={paid} onChange={(e) => togglePaid(s, e.target.checked)} disabled={bulkBusy[uid]} />
                          <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>{paid ? 'PAID' : 'NOT PAID'}</span>
                        </label>
                      </td>
                      <td className="col-hide-md">{s.paid_at ? new Date(s.paid_at).toLocaleString() : '—'}</td>
                      <td>
                        <div className="actions">
                          <button className="btn-edit" onClick={() => (window.location.href = `/shift/${s.id}`)}>Edit</button>
                          <button className="btn-delete" onClick={() => deleteRow(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                });

                // subtotal
                const subtotal = rows.reduce(
                  (acc, s) => ({ hours: acc.hours + Number(s.hours_worked || 0), pay: acc.pay + calcPay(s).pay }),
                  { hours: 0, pay: 0 }
                );
                const foot = (
                  <tr className="subtotal" key={`${uid}-foot`}>
                    <td colSpan={5} style={{ textAlign: 'right' }}>Total — {name}</td>
                    <td>{subtotal.hours.toFixed(2)}</td>
                    <td>${subtotal.pay.toFixed(2)}</td>
                    <td colSpan={3}></td>
                  </tr>
                );

                return [head, ...body, foot];
              })}

              {!loading && shifts.length === 0 && (
                <tr><td colSpan={10} className="muted center">No shifts.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={10} className="center">Loading…</td></tr>
              )}
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
