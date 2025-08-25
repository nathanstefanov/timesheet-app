// pages/admin.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';
type Profile = { id: string; role: 'admin' | 'employee' } | null;

/** Compute pay with Breakdown $50 minimum (uses DB pay_due if present). */
function payFor(s: any): number {
  const rate = Number(s.pay_rate ?? 25);
  const hours = Number(s.hours_worked ?? 0);
  const base = s.pay_due != null ? Number(s.pay_due) : hours * rate;
  return s.shift_type === 'Breakdown' ? Math.max(base, 50) : base;
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
    const m: Record<string, { id: string; name: string; hours: number; pay: number; unpaid: number }> = {};
    for (const s of shifts) {
      const id = s.user_id;
      const name = names[id] || '—';
      m[id] ??= { id, name, hours: 0, pay: 0, unpaid: 0 };
      const h = Number(s.hours_worked || 0), p = payFor(s);
      m[id].hours += h;
      m[id].pay += p;
      if (!Boolean((s as any).is_paid)) m[id].unpaid += p;
    }
    return Object.values(m);
  }, [shifts, names]);

  const unpaidTotal = useMemo(() => {
    return totals.reduce((sum, t) => sum + t.unpaid, 0);
  }, [totals]);

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
      {err && <p className="error">Error: {err}</p>}

      {/* Summary bar */}
      <div style={{ margin: '16px 0', padding: 12, background: '#f0f0f0', borderRadius: 6, fontWeight: 'bold' }}>
        Total Unpaid: ${unpaidTotal.toFixed(2)}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('unpaid')} className={tab==='unpaid' ? 'active' : ''}>Unpaid</button>
        <button onClick={() => setTab('paid')} className={tab==='paid' ? 'active' : ''}>Paid</button>
        <button onClick={() => setTab('all')} className={tab==='all' ? 'active' : ''}>All</button>
      </div>

      {/* Totals by employee */}
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
                <td>{t.name}</td>
                <td>{t.hours.toFixed(2)}</td>
                <td>${t.pay.toFixed(2)}</td>
                <td>${t.unpaid.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
                  acc.hours += Number(s.hours_worked || 0);
                  acc.pay += payFor(s);
                  return acc;
                },
                { hours: 0, pay: 0 }
              );

              return (
                <React.Fragment key={uid}>
                  <tr className="section-head">
                    <td colSpan={10}>{name}</td>
                  </tr>
                  {rows.map((s) => {
                    const paid = Boolean((s as any).is_paid);
                    const pay = payFor(s);
                    return (
                      <tr key={s.id}>
                        <td>{name}</td>
                        <td>{s.shift_date}</td>
                        <td>{s.shift_type}</td>
                        <td>{new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{Number(s.hours_worked).toFixed(2)}</td>
                        <td>${pay.toFixed(2)}</td>
                        <td>
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
                        <td>{(s as any).paid_at ? new Date((s as any).paid_at).toLocaleString() : '—'}</td>
                        <td>
                          <div className="actions">
                            <button className="btn-edit" onClick={() => editRow(s)} style={{ marginRight: 8 }}>Edit</button>
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
