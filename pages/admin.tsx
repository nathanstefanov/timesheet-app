// pages/admin.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import {
  startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths,
  format
} from 'date-fns';

type Mode = 'week' | 'month' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';
type Profile = { id: string; role: 'admin' | 'employee' } | null;

export default function Admin() {
  const r = useRouter();

  const [me, setMe] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);

  const [shifts, setShifts] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  // ---- Auth + role check (fixes the "need to refresh" issue) ----
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

      // Decide access ONLY after we know the role
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

  // ---- Range builder ----
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

  // ---- Load shifts after role is known ----
  useEffect(() => {
    if (checking) return;
    if (!me || me.role !== 'admin') return;

    (async () => {
      setLoading(true);
      setErr(undefined);
      try {
        let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
        if (mode !== 'all') {
          q = q
            .gte('shift_date', format(range.start, 'yyyy-MM-dd'))
            .lte('shift_date', format(range.end, 'yyyy-MM-dd'));
        }
        if (unpaidOnly) q = q.eq('is_paid', false);

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
  }, [checking, me, mode, offset, unpaidOnly, range]);

  // ---- Totals by employee ----
  const totals = useMemo(() => {
    const m: Record<string, { id: string; name: string; hours: number; pay: number; unpaid: number }> = {};
    for (const s of shifts) {
      const id = s.user_id;
      const name = names[id] || '—';
      m[id] ??= { id, name, hours: 0, pay: 0, unpaid: 0 };
      const h = Number(s.hours_worked || 0), p = Number(s.pay_due || 0);
      m[id].hours += h;
      m[id].pay += p;
      if (!Boolean((s as any).is_paid)) m[id].unpaid += p;
    }
    return Object.values(m);
  }, [shifts, names]);

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

  // Order employee sections following totals sort
  const sectionOrder = useMemo(() => sortedTotals.map(t => t.id), [sortedTotals]);

  // ---- Actions ----
  async function togglePaid(row: any, next: boolean) {
    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? (me as any)!.id : null,
    };
    // optimistic update
    setShifts(prev => prev.map(s => s.id === row.id ? { ...s, ...patch } : s));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => s.id === row.id ? { ...s, is_paid: !next } : s));
    }
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
      <h1>Admin</h1>
      {err && <p className="error">Error: {err}</p>}

      {/* Controls */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
        <select value={mode} onChange={e => { setMode(e.target.value as Mode); setOffset(0); }}>
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

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={unpaidOnly} onChange={e => setUnpaidOnly(e.target.checked)} />
          Unpaid only
        </label>

        {/* Sort controls for totals table */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <label>Sort totals by</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}>
            <option value="name">Name (A–Z)</option>
            <option value="hours">Hours</option>
            <option value="pay">Pay</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select value={sortDir} onChange={e => setSortDir(e.target.value as SortDir)}>
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </div>

      {/* Totals by employee (mobile stacked) */}
      <h3>Totals by Employee</h3>
      <div className="table-wrap">
        <table className="table table--center table--stack" style={{ marginBottom: 16 }}>
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
                <td data-label="Employee">{t.name}</td>
                <td data-label="Hours">{t.hours.toFixed(2)}</td>
                <td data-label="Pay">${t.pay.toFixed(2)}</td>
                <td data-label="Unpaid">${t.unpaid.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Grouped shifts with per-employee subtotals (mobile stacked) */}
      <h3>All Shifts — Grouped by Employee</h3>
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
                  acc.hours += Number(s.hours_worked || 0);
                  acc.pay += Number(s.pay_due || 0);
                  return acc;
                },
                { hours: 0, pay: 0 }
              );

              return (
                <React.Fragment key={uid}>
                  {/* Section header row */}
                  <tr className="section-head">
                    <td colSpan={10}>{name}</td>
                  </tr>

                  {rows.map((s) => {
                    const paid = Boolean((s as any).is_paid);
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
                        <td data-label="Pay">${Number(s.pay_due).toFixed(2)}</td>
                        <td data-label="Paid?">
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={paid}
                              onChange={(e) => togglePaid(s, e.target.checked)}
                            />
                            <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>
                              {paid ? 'PAID' : 'NOT PAID'}
                            </span>
                          </label>
                        </td>
                        <td data-label="Paid at">
                          {(s as any).paid_at ? new Date((s as any).paid_at).toLocaleString() : '—'}
                        </td>
                        <td data-label="Actions">
                          <div className="actions">
                            <button className="btn-edit" onClick={() => editRow(s)} style={{ marginRight: 8 }}>
                              Edit
                            </button>
                            <button className="btn-delete" onClick={() => deleteRow(s)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal row */}
                  <tr className="subtotal">
                    <td colSpan={5} data-label="Subtotal" style={{ textAlign: 'right' }}>
                      Total — {name}
                    </td>
                    <td data-label="Hours">{subtotal.hours.toFixed(2)}</td>
                    <td data-label="Pay">${subtotal.pay.toFixed(2)}</td>
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
