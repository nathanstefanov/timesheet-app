// pages/admin.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';

type Profile = { id: string; role: 'admin' | 'employee' } | null;
type Shift = {
  id: string;
  user_id: string;
  shift_date: string; // YYYY-MM-DD
  shift_type: string;
  time_in?: string | null; // ISO
  time_out?: string | null; // ISO
  hours_worked?: number | null;
  pay_due?: number | null;
  is_paid?: boolean | null;
  paid_at?: string | null; // ISO
  paid_by?: string | null;

  // admin-only metadata
  admin_flag?: boolean | null;
  admin_note?: string | null;

  // optional pay_rate in row (if present)
  pay_rate?: number | null;
};

type TotalRow = {
  id: string;
  name: string;
  hours: number;
  pay: number;
  unpaid: number;
  minCount: number;
  flaggedCount: number;
};

// ---- Helpers ----
function payInfo(s: Shift): { pay: number; minApplied: boolean; base: number } {
  const rate = Number((s as any).pay_rate ?? 25);
  const hours = Number(s.hours_worked ?? 0);
  const base = s.pay_due != null ? Number(s.pay_due) : hours * rate;
  const isBreakdown = String(s.shift_type || '').toLowerCase() === 'breakdown';
  const pay = isBreakdown ? Math.max(base, 50) : base;
  return { pay, minApplied: isBreakdown && base < 50, base };
}

function isAutoFlag(s: Shift) {
  const isBreakdown = String(s.shift_type || '').toLowerCase() === 'breakdown';
  const h = Number(s.hours_worked || 0);
  return isBreakdown && h >= 3;
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
  // Monday start
  const t = new Date(d);
  const day = t.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  t.setDate(t.getDate() - diff);
  t.setHours(0, 0, 0, 0);
  return t;
}

function stripTime(d: Date) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

function addDays(d: Date, n: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
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
  const [tab, setTab] = useState<Tab>('unpaid'); // default unpaid
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [userSorted, setUserSorted] = useState(false); // whether user touched sort controls

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  // week / range filters
  const today = useMemo(() => stripTime(new Date()), []);
  const [useWeek, setUseWeek] = useState<boolean>(false); // default OFF → all-time
  const [weekAnchor, setWeekAnchor] = useState<Date>(startOfWeek(today));
  const weekFrom = useMemo(() => toYMD(weekAnchor), [weekAnchor]);
  const weekTo = useMemo(() => toYMD(addDays(weekAnchor, 6)), [weekAnchor]);

  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);

  // NOTE MODAL (admin only)
  const [noteModal, setNoteModal] = useState<{ open: boolean; row: Shift | null }>(
    {
      open: false,
      row: null,
    },
  );
  const [noteDraft, setNoteDraft] = useState<string>('');

  function openNoteModal(row: Shift) {
    setNoteDraft(row.admin_note ?? '');
    setNoteModal({ open: true, row });
  }

  function closeNoteModal() {
    setNoteModal({ open: false, row: null });
  }

  const saveNoteModal = useCallback(async () => {
    if (!noteModal.row) return;
    const row = noteModal.row;
    const patch = { admin_note: noteDraft.trim() || null };

    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, ...patch } : s)));
    closeNoteModal();

    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev =>
        prev.map(s =>
          s.id === row.id ? { ...s, admin_note: row.admin_note ?? null } : s,
        ),
      );
    }
  }, [noteDraft, noteModal.row]);

  // auth: ensure admin
  useEffect(() => {
    let alive = true;

    async function fetchProfileAndCheck() {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) {
        setErr(error.message);
        setChecking(false);
        return;
      }
      const session = data?.session;
      if (!session?.user) {
        setMe(null);
        setChecking(false);
        router.replace('/');
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .single();

      if (!alive) return;

      if (profileErr || !profile) {
        setErr(profileErr?.message || 'No profile');
        setChecking(false);
        return;
      }

      if (profile.role !== 'admin') {
        setErr('You must be an admin to view this page.');
        setChecking(false);
        router.replace('/dashboard');
        return;
      }

      setMe(profile as Profile);
      setChecking(false);
    }

    fetchProfileAndCheck();
    return () => {
      alive = false;
    };
  }, [router]);

  // Auto sort defaults per tab unless user overrides
  useEffect(() => {
    if (userSorted) return;
    if (tab === 'unpaid') {
      setSortBy('unpaid');
      setSortDir('desc');
    } else if (tab === 'paid') {
      setSortBy('pay');
      setSortDir('desc');
    } else {
      setSortBy('name');
      setSortDir('asc');
    }
  }, [tab, userSorted]);

  // Load shifts
  useEffect(() => {
    if (checking) return;
    if (!me) return;

    async function load() {
      setLoading(true);
      setErr(undefined);

      try {
        let q = supabase
          .from('shifts')
          .select('*')
          .order('shift_date', { ascending: true })
          .order('time_in', { ascending: true });

        if (tab === 'unpaid') q = q.eq('is_paid', false);
        else if (tab === 'paid') q = q.eq('is_paid', true);

        if (useWeek) {
          q = q.gte('shift_date', weekFrom).lte('shift_date', weekTo);
        } else {
          if (rangeFrom) q = q.gte('shift_date', rangeFrom);
          if (rangeTo) q = q.lte('shift_date', rangeTo);
        }

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
    }

    load();
  }, [checking, me, tab, useWeek, weekFrom, weekTo, rangeFrom, rangeTo]);

  const groups = useMemo(() => {
    const m: Record<string, Shift[]> = {};
    for (const s of shifts) {
      (m[s.user_id] ??= []).push(s);
    }
    for (const id in m) {
      m[id].sort((a, b) => {
        if (a.shift_date < b.shift_date) return -1;
        if (a.shift_date > b.shift_date) return 1;
        return String(a.time_in || '').localeCompare(String(b.time_in || ''));
      });
    }
    return m;
  }, [shifts]);

  const totals = useMemo<TotalRow[]>(() => {
    const m: Record<string, TotalRow> = {};
    for (const s of shifts) {
      const id = s.user_id;
      const name = names[id] || '—';
      const { pay, minApplied } = payInfo(s);
      const h = Number(s.hours_worked || 0);
      const autoFlag = isAutoFlag(s);
      const isFlagged = Boolean(s.admin_flag) || autoFlag;

      if (!m[id]) {
        m[id] = {
          id,
          name,
          hours: 0,
          pay: 0,
          unpaid: 0,
          minCount: 0,
          flaggedCount: 0,
        };
      }

      m[id].hours += h;
      m[id].pay += pay;
      if (!Boolean(s.is_paid)) m[id].unpaid += pay;
      if (minApplied) m[id].minCount += 1;
      if (isFlagged) m[id].flaggedCount += 1;
    }
    return Object.values(m);
  }, [shifts, names]);

  const totalsById = useMemo(
    () => Object.fromEntries(totals.map(t => [t.id, t] as const)),
    [totals],
  );

  const unpaidTotal = useMemo(
    () => totals.reduce((sum, t) => sum + t.unpaid, 0),
    [totals],
  );

  const sortedTotals = useMemo(() => {
    const a = [...totals];
    if (sortBy === 'name') {
      a.sort((x, y) => x.name.localeCompare(y.name) * (sortDir === 'asc' ? 1 : -1));
    } else if (sortBy === 'hours') {
      a.sort((x, y) => (x.hours - y.hours) * (sortDir === 'asc' ? 1 : -1));
    } else if (sortBy === 'pay') {
      a.sort((x, y) => (x.pay - y.pay) * (sortDir === 'asc' ? 1 : -1));
    } else if (sortBy === 'unpaid') {
      a.sort((x, y) => (x.unpaid - y.unpaid) * (sortDir === 'asc' ? 1 : -1));
    }
    return a;
  }, [totals, sortBy, sortDir]);

  const sectionOrder = useMemo(() => sortedTotals.map(t => t.id), [sortedTotals]);

  async function togglePaid(row: Shift, next: boolean) {
    const patch = {
      is_paid: next,
      paid_at: next ? new Date().toISOString() : null,
    };
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev =>
        prev.map(s =>
          s.id === row.id
            ? { ...s, is_paid: row.is_paid ?? null, paid_at: row.paid_at ?? null }
            : s,
        ),
      );
    }
  }

  async function bulkTogglePaidForEmployee(userId: string, next: boolean) {
    const rows = groups[userId] || [];
    const toChange = rows.filter(s => Boolean(s.is_paid) !== next).map(s => s.id);
    if (!toChange.length) return;

    const name = names[userId] || 'employee';
    if (!confirm(`Mark ${toChange.length} shift(s) for ${name} as ${next ? 'PAID' : 'UNPAID'}?`)) {
      return;
    }

    setBulkBusy(b => ({ ...b, [userId]: true }));
    const prev = [...shifts];

    const now = new Date().toISOString();
    const patch = next ? { is_paid: true, paid_at: now } : { is_paid: false, paid_at: null };

    setShifts(prev =>
      prev.map(s => (toChange.includes(s.id) ? { ...s, ...patch } : s)),
    );

    const { error } = await supabase.from('shifts').update(patch).in('id', toChange);
    if (error) {
      alert(error.message);
      setShifts(prev);
    }
    setBulkBusy(b => ({ ...b, [userId]: false }));
  }

  function editRow(row: Shift) {
    router.push(`/shift/${row.id}`);
  }

  async function deleteRow(row: Shift) {
    const name = names[row.user_id] || 'employee';
    if (!confirm(`Delete shift for ${name} on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) {
      alert(error.message);
      return;
    }
    setShifts(prev => prev.filter(s => s.id !== row.id));
  }

  async function toggleAdminFlag(row: Shift, next: boolean) {
    const patch = { admin_flag: next };
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev =>
        prev.map(s =>
          s.id === row.id ? { ...s, admin_flag: row.admin_flag ?? null } : s,
        ),
      );
    }
  }

  // limit Next ▶ so you can't go past current week
  const nextWeekAnchor = addDays(weekAnchor, 7);
  const nextWeekEnd = stripTime(addDays(nextWeekAnchor, 6));
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = stripTime(addDays(currentWeekStart, 6));
  const disableNextWeek = nextWeekEnd > currentWeekEnd;

  if (checking) {
    return (
      <main className="page page--center page--admin">
        <h1 className="page__title">Admin Dashboard</h1>
        <p className="center">Checking permissions…</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="page page--center page--admin">
        <h1 className="page__title">Admin Dashboard</h1>
        <p className="center">You must be an admin to view this page.</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Admin Dashboard - Timesheet</title>
        <link rel="stylesheet" href="/styles/admin-improvements.css" />
      </Head>
      <main className="page page--center page--admin">
        <h1 className="page__title">Admin Dashboard</h1>
      {err && (
        <div className="alert error" role="alert">
          Error: {err}
        </div>
      )}

      {/* Summary Stats */}
      <div className="summary-bar">
        <div className="summary-bar__item">
          <div className="summary-bar__label">Total Unpaid</div>
          <div className="summary-bar__value summary-bar__value--warning">
            ${unpaidTotal.toFixed(2)}
          </div>
        </div>
        <div className="summary-bar__item">
          <div className="summary-bar__label">Employees w/ Unpaid</div>
          <div className="summary-bar__value summary-bar__value--primary">
            {totals.filter(t => t.unpaid > 0).length}
          </div>
        </div>
        <div className="summary-bar__item">
          <div className="summary-bar__label">Total Shifts</div>
          <div className="summary-bar__value">
            {shifts.length}
          </div>
        </div>
        <div className="summary-bar__item">
          <div className="summary-bar__label">Total Hours</div>
          <div className="summary-bar__value">
            {shifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0).toFixed(1)}
          </div>
        </div>
      </div>

      {/* Info Badges */}
      <div className="card card--tight full">
        <div className="summary-grid" style={{ display: 'flex', gap: '2rem', justifyContent: 'center', padding: '1rem' }}>
          <div className="summary-badges">
            <span className="badge badge-min">MIN $50</span>
            <span className="muted">Breakdown boosted to minimum</span>
          </div>

          <div className="summary-badges">
            <span className="badge badge-flag">FLAGGED</span>
            <span className="muted">Auto if Breakdown ≥ 3h</span>
          </div>
        </div>
      </div>

      {/* Tabs for Unpaid / Paid / All */}
      <div className="card card--tight full center">
        <div className="tabs tabs--center">
          <button
            className={tab === 'unpaid' ? 'active' : ''}
            onClick={() => {
              setTab('unpaid');
              setUserSorted(false);
            }}
          >
            Unpaid
          </button>
          <button
            className={tab === 'paid' ? 'active' : ''}
            onClick={() => {
              setTab('paid');
              setUserSorted(false);
            }}
          >
            Paid
          </button>
          <button
            className={tab === 'all' ? 'active' : ''}
            onClick={() => {
              setTab('all');
              setUserSorted(false);
            }}
          >
            All
          </button>
        </div>
      </div>

      {/* Date / Week Filters */}
      <div className="card card--tight full mt-lg">
        <div className="filters">
          <div className="filters-row">
            <label className="inline">
              <input
                type="radio"
                name="range-mode"
                checked={useWeek}
                onChange={() => setUseWeek(true)}
              />
              <span>Week</span>
            </label>

            <div className="inline week-controls" aria-label="Week controls">
              <button
                className="topbar-btn"
                onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
              >
                ◀ Prev
              </button>
              <button
                className="topbar-btn"
                onClick={() => setWeekAnchor(startOfWeek(today))}
              >
                This Week
              </button>
              <button
                className="topbar-btn"
                onClick={() => setWeekAnchor(nextWeekAnchor)}
                disabled={disableNextWeek}
              >
                Next ▶
              </button>
            </div>

            <span className="toolbar-range-label">
              {weekFrom} → {weekTo}
            </span>
          </div>

          <div className="filters-row">
            <label className="inline">
              <input
                type="radio"
                name="range-mode"
                checked={!useWeek}
                onChange={() => setUseWeek(false)}
              />
              <span>Custom Range</span>
            </label>

            <div className="inline range-controls" aria-label="Custom range">
              <input
                type="date"
                value={rangeFrom ?? ''}
                onChange={e => setRangeFrom(e.target.value || null)}
                disabled={useWeek}
                aria-label="From"
              />
              <span>to</span>
              <input
                type="date"
                value={rangeTo ?? ''}
                onChange={e => setRangeTo(e.target.value || null)}
                disabled={useWeek}
                aria-label="To"
              />
              <button
                className="topbar-btn clear-btn"
                onClick={() => {
                  setRangeFrom(null);
                  setRangeTo(null);
                }}
                title="Clear range (shows all time)"
                disabled={useWeek}
              >
                Clear (All-time)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Totals by Employee – table */}
      <div className="card card--tight full mt-lg">
        <div className="card__header center-header">
          <h3 className="center-text">Totals by Employee</h3>
          <div className="toolbar-center">
            <label className="sr-only" htmlFor="sort-by">
              Sort by
            </label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={e => {
                setSortBy(e.target.value as SortBy);
                setUserSorted(true);
              }}
            >
              <option value="name">Name</option>
              <option value="hours">Hours</option>
              <option value="pay">Pay</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <button
              className="topbar-btn"
              onClick={() => {
                setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                setUserSorted(true);
              }}
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
              {sortedTotals.map(t => {
                const vHref = venmoHref(venmo[t.id]);
                const hasUnpaid = t.unpaid > 0.0001;

                return (
                  <tr key={t.id}>
                    <td data-label="Employee">
                      {t.name}
                      {t.minCount > 0 && (
                        <span className="muted"> ({t.minCount}× MIN)</span>
                      )}
                      {t.flaggedCount > 0 && (
                        <span className="muted"> ({t.flaggedCount}× Flagged)</span>
                      )}
                    </td>
                    <td data-label="Hours">{t.hours.toFixed(2)}</td>
                    <td data-label="Pay">${t.pay.toFixed(2)}</td>
                    <td data-label="Unpaid">
                      ${t.unpaid.toFixed(2)}
                      {vHref && hasUnpaid && (
                        <a
                          className="btn btn-venmo"
                          href={vHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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

      {/* Shifts grouped by employee (detail table) */}
      <div className="card card--tight full mt-lg">
        <div className="card__header">
          <h3>Shifts (Details)</h3>
        </div>

        {loading && <p className="center">Loading…</p>}

        {!loading && !shifts.length && (
          <div className="card-empty-past">
            <p className="muted">No shifts match this filter yet.</p>
          </div>
        )}

        {!loading && shifts.length > 0 && (
          <div className="table-wrap">
            <table className="table table--compact table--stack">
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
                {sectionOrder.map(uid => {
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
                    { hours: 0, pay: 0 },
                  );

                  const unpaidCount = rows.filter(s => !s.is_paid).length;
                  const allPaid = unpaidCount === 0;

                  return (
                    <React.Fragment key={uid}>
                      {/* NEW clean employee header bar */}
                      <tr className="section-head">
                        <td colSpan={10}>
                          <div className="section-bar">
                            <div className="section-bar__left">
                              <span className="section-bar__name">{name}</span>

                              <div className="section-bar__center">
                                <button
                                  className="section-action-btn"
                                  disabled={bulkBusy[uid] || allPaid}
                                  onClick={() => bulkTogglePaidForEmployee(uid, true)}
                                >
                                  Mark ALL Paid
                                </button>
                                <button
                                  className="section-action-btn"
                                  disabled={bulkBusy[uid] || rows.length === unpaidCount}
                                  onClick={() =>
                                    bulkTogglePaidForEmployee(uid, false)
                                  }
                                >
                                  Mark ALL Unpaid
                                </button>
                              </div>
                            </div>

                            <div className="section-bar__right">
                              <span className="section-pill">
                                {unpaidCount} Unpaid Shifts
                              </span>

                              {totalsById[uid]?.minCount > 0 && (
                                <span className="badge-min">
                                  {totalsById[uid].minCount}× MIN
                                </span>
                              )}

                              {totalsById[uid]?.flaggedCount > 0 && (
                                <span className="badge-flag">
                                  {totalsById[uid].flaggedCount}× Flagged
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {rows.map(s => {
                        const { pay, minApplied, base } = payInfo(s);
                        const paid = Boolean(s.is_paid);
                        const hasNote = !!(s.admin_note && s.admin_note.trim());
                        const autoFlag = isAutoFlag(s);
                        const isFlagged = Boolean(s.admin_flag) || autoFlag;

                        return (
                          <tr
                            key={s.id}
                            className={isFlagged ? 'row-flagged' : ''}
                          >
                            <td data-label="Employee">
                              <div className="emp-cell">
                                <span>{name}</span>
                                {hasNote && (
                                  <button
                                    className="icon-btn"
                                    title="View note"
                                    onClick={() => openNoteModal(s)}
                                    aria-label="View note"
                                  >
                                    📝
                                  </button>
                                )}
                                {autoFlag && (
                                  <span
                                    className="badge badge-flag ml-1"
                                    title="Auto-flagged: Breakdown ≥ 3h"
                                  >
                                    FLAG
                                  </span>
                                )}
                                {Boolean(s.admin_flag) && !autoFlag && (
                                  <span
                                    className="badge badge-flag ml-1"
                                    title="Manually flagged"
                                  >
                                    FLAG
                                  </span>
                                )}
                              </div>
                            </td>
                            <td data-label="Date">{s.shift_date}</td>
                            <td data-label="Type">{s.shift_type}</td>
                            <td data-label="In">
                              {s.time_in
                                ? new Date(s.time_in).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td data-label="Out">
                              {s.time_out
                                ? new Date(s.time_out).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td data-label="Hours">
                              {Number(s.hours_worked ?? 0).toFixed(2)}
                            </td>
                            <td data-label="Pay">
                              ${pay.toFixed(2)}{' '}
                              {minApplied && (
                                <span
                                  className="badge badge-min"
                                  title={`Breakdown minimum applied (base ${base.toFixed(
                                    2,
                                  )} < $50)`}
                                >
                                  MIN $50
                                </span>
                              )}
                            </td>
                            <td data-label="Paid?">
                              <label className="inline">
                                <input
                                  type="checkbox"
                                  checked={paid}
                                  onChange={e =>
                                    togglePaid(s, e.target.checked)
                                  }
                                  disabled={bulkBusy[uid]}
                                  aria-label={paid ? 'Mark unpaid' : 'Mark paid'}
                                />
                                <span
                                  className={
                                    paid
                                      ? 'badge badge-paid'
                                      : 'badge badge-unpaid'
                                  }
                                >
                                  {paid ? 'PAID' : 'NOT PAID'}
                                </span>
                              </label>
                            </td>
                            <td data-label="Paid at" className="col-hide-md">
                              {s.paid_at
                                ? new Date(s.paid_at).toLocaleString()
                                : '—'}
                            </td>
                            <td data-label="Actions">
                              <div className="actions">
                                <button
                                  className="btn"
                                  onClick={() => editRow(s)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-delete"
                                  onClick={() => deleteRow(s)}
                                >
                                  Delete
                                </button>
                                <button
                                  className={
                                    isFlagged ? 'btn btn-flag-on' : 'btn btn-flag'
                                  }
                                  title={
                                    isFlagged
                                      ? 'Unflag (manual flag only)'
                                      : 'Flag for attention'
                                  }
                                  onClick={() =>
                                    toggleAdminFlag(
                                      s,
                                      !Boolean(s.admin_flag),
                                    )
                                  }
                                  aria-pressed={isFlagged}
                                >
                                  {isFlagged ? '★ Flagged' : 'Flag'}
                                </button>
                                <button
                                  className="btn"
                                  onClick={() => openNoteModal(s)}
                                  title={
                                    hasNote ? 'View / Edit note' : 'Add note'
                                  }
                                >
                                Note
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Subtotal row per employee */}
                      <tr className="subtotal">
                        <td colSpan={5}>Total — {name}</td>
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
        )}
      </div>

      {/* NOTE MODAL */}
      {noteModal.open && noteModal.row && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">
                📝 Note — {names[noteModal.row.user_id] || '—'} ·{' '}
                {noteModal.row.shift_date}
              </span>
            </div>
            <div className="modal-body">
              <textarea
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Add a private admin note…"
              />
              <p className="muted">
                Notes are only visible to admins on this page.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={closeNoteModal}>
                Close
              </button>
              <button className="btn btn-primary" onClick={saveNoteModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </>
  );
}

/** Force SSR so Vercel does not emit /admin/index static HTML */
export async function getServerSideProps() {
  return { props: {} };
}
