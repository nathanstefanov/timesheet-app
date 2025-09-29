// pages/admin.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';

type Profile = { id: string; role: 'admin' | 'employee' } | null;
type Shift = {
  id: string;
  user_id: string;
  shift_date: string;       // YYYY-MM-DD
  shift_type: string;
  time_in?: string | null;  // ISO
  time_out?: string | null; // ISO
  hours_worked?: number | null;
  pay_due?: number | null;
  is_paid?: boolean | null;
  paid_at?: string | null;  // ISO
  paid_by?: string | null;

  // NEW: admin-only metadata
  admin_flag?: boolean | null;
  admin_note?: string | null;
};

// ---- Helpers ----
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

// date helpers
function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function startOfWeek(d: Date) {
  // Monday start; change if you prefer Sunday
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7; // 0..6 where 0 = Monday
  t.setDate(t.getDate() - day);
  t.setHours(0, 0, 0, 0);
  return t;
}
function addDays(d: Date, n: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}
function stripTime(d: Date) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

export default function Admin() {
  const router = useRouter();

  // auth / role
  const [me, setMe] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);

  // data
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [venmo, setVenmo] = useState<Record<string, string>>({});

  // ui state
  const [tab, setTab] = useState<Tab>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  // NEW: week / range filters
  const today = useMemo(() => stripTime(new Date()), []);
  const [useWeek, setUseWeek] = useState<boolean>(true);
  const [weekAnchor, setWeekAnchor] = useState<Date>(startOfWeek(today)); // always Monday of current week
  const weekFrom = useMemo(() => toYMD(weekAnchor), [weekAnchor]);
  const weekTo = useMemo(() => toYMD(addDays(weekAnchor, 6)), [weekAnchor]);

  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);

  // ---- Auth + role check (react only to sign-in/out) ----
  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;

      if (!session?.user) {
        setMe(null);
        setChecking(false);
        router.replace('/');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .single();

      if (!alive) return;
      if (error || !data) {
        setMe(null);
        setChecking(false);
        router.replace('/dashboard?msg=not_admin');
        return;
      }

      setMe(data as any);
      setChecking(false);
      if ((data as any).role !== 'admin') {
        router.replace('/dashboard?msg=not_admin');
      }
    }

    loadProfile();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setChecking(true);
        loadProfile();
      }
      // ignore TOKEN_REFRESHED/USER_UPDATED
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [router]);

  // ---- Load shifts (+ related profile info), honoring tab + date filters ----
  const loadShifts = useCallback(async () => {
    if (checking) return;
    if (!me || me.role !== 'admin') return;

    setLoading(true);
    setErr(undefined);
    try {
      let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
      if (tab === 'unpaid') q = q.eq('is_paid', false);
      if (tab === 'paid') q = q.eq('is_paid', true);

      // Date filtering
      const from = useWeek ? weekFrom : (rangeFrom || null);
      const to = useWeek ? weekTo : (rangeTo || null);
      if (from) q = q.gte('shift_date', from);
      if (to) q = q.lte('shift_date', to);

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
  }, [checking, me, tab, useWeek, weekFrom, weekTo, rangeFrom, rangeTo]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // refresh on focus/visibility
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

  const unpaidTotal = useMemo(
    () => totals.reduce((sum, t) => sum + t.unpaid, 0),
    [totals]
  );

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

  // ---- Actions ----
  async function togglePaid(row: Shift, next: boolean) {
    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
      paid_by: next ? (me as any)!.id : null,
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
      paid_by: next ? (me as any)!.id : null,
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

  function editRow(row: Shift) { router.push(`/shift/${row.id}`); }

  async function deleteRow(row: Shift) {
    const name = names[row.user_id] || 'employee';
    if (!confirm(`Delete shift for ${name} on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(s => s.id !== row.id));
  }

  // NEW: admin-only helpers
  async function toggleAdminFlag(row: Shift, next: boolean) {
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, admin_flag: next } : s)));
    const { error } = await supabase.from('shifts').update({ admin_flag: next }).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, admin_flag: row.admin_flag ?? null } : s)));
    }
  }

  async function editAdminNote(row: Shift) {
    const current = row.admin_note ?? '';
    const next = window.prompt('Admin note (only visible to admins):', current);
    if (next === null) return; // cancel
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, admin_note: next } : s)));
    const { error } = await supabase.from('shifts').update({ admin_note: next }).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, admin_note: current } : s)));
    }
  }

  if (checking) {
    return (
      <main className="page page--center">
        <h1 className="page__title">Admin Dashboard</h1>
        <p>Loading…</p>
      </main>
    );
  }
  if (!me || me.role !== 'admin') return null;

  // constrain "Next ▶" to not go past the current calendar week
  const nextWeekAnchor = addDays(weekAnchor, 7);
  const nextWeekEnd = stripTime(addDays(nextWeekAnchor, 6));
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = stripTime(addDays(currentWeekStart, 6));
  const disableNextWeek = nextWeekEnd > currentWeekEnd;

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

      {/* Date / Week Filters */}
      <div className="card card--tight full" style={{ marginTop: 10, padding: 10 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
          <label className="inline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="range-mode"
              checked={useWeek}
              onChange={() => setUseWeek(true)}
            />
            Week
          </label>
          <div className="inline" aria-label="Week controls" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button className="topbar-btn" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>◀ Prev</button>
            <button className="topbar-btn" onClick={() => setWeekAnchor(startOfWeek(today))}>This Week</button>
            <button
              className="topbar-btn"
              onClick={() => setWeekAnchor(nextWeekAnchor)}
              disabled={disableNextWeek}
            >
              Next ▶
            </button>
            <span className="muted" style={{ marginLeft: 8 }}>
              {weekFrom} – {weekTo}
            </span>
          </div>

          <span className="divider" style={{ width: 1, height: 24, background: 'var(--border)' }}></span>

          <label className="inline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="range-mode"
              checked={!useWeek}
              onChange={() => setUseWeek(false)}
            />
            Range
          </label>
          <div className="inline" aria-label="Custom range" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              type="date"
              value={rangeFrom ?? ''}
              onChange={(e) => setRangeFrom(e.target.value || null)}
              disabled={useWeek}
              aria-label="From"
            />
            <span>to</span>
            <input
              type="date"
              value={rangeTo ?? ''}
              onChange={(e) => setRangeTo(e.target.value || null)}
              disabled={useWeek}
              aria-label="To"
            />
            <button
              className="topbar-btn"
              onClick={() => { setRangeFrom(null); setRangeTo(null); }}
              disabled={useWeek && !rangeFrom && !rangeTo}
              title="Clear range"
            >
              Clear
            </button>
          </div>
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
                        <tr key={s.id} className={s.admin_flag ? 'row-flagged' : ''}>
                          <td data-label="Employee">
                            {name}
                            {s.admin_note && (
                              <span className="muted" title={s.admin_note} style={{ marginLeft: 6 }}>📝</span>
                            )}
                          </td>
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

                              {/* NEW: admin-only controls (this page is admin-gated) */}
                              <button
                                className="btn-flag"
                                title={s.admin_flag ? 'Unflag' : 'Flag for attention'}
                                onClick={() => toggleAdminFlag(s, !Boolean(s.admin_flag))}
                                aria-pressed={Boolean(s.admin_flag)}
                              >
                                {s.admin_flag ? '★ Flagged' : '☆ Flag'}
                              </button>
                              <button
                                className="btn-note"
                                title={s.admin_note ? `Edit note: ${s.admin_note}` : 'Add note'}
                                onClick={() => editAdminNote(s)}
                              >
                                📝 Note
                              </button>
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

        /* NEW: flagged row highlight */
        .row-flagged {
          background: #fffbea; /* soft yellow */
        }

        /* NEW: small admin buttons */
        .btn-flag, .btn-note {
          margin-left: 6px;
          height: 28px;
          padding: 0 10px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: #f8fafc;
          cursor: pointer;
        }
        .btn-flag[aria-pressed="true"] {
          background: #fff3c4;
          font-weight: 700;
        }

        /* divider used in date filter card */
        .divider { opacity: 0.5; }
      `}</style>
    </main>
  );
}

/** Force SSR so Vercel does not emit /admin/index static HTML */
export async function getServerSideProps() {
  return { props: {} };
}
