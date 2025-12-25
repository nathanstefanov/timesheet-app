// pages/admin.tsx
/**
 * ADMIN DASHBOARD - Brand New SaaS Design
 * Completely redesigned with sidebar navigation and modern interface
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';

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
  admin_flag?: boolean | null;
  admin_note?: string | null;
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
  const t = new Date(d);
  const day = t.getDay();
  const diff = (day + 6) % 7;
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

  const [me, setMe] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [venmo, setVenmo] = useState<Record<string, string>>({});

  const [tab, setTab] = useState<Tab>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [userSorted, setUserSorted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  const today = useMemo(() => stripTime(new Date()), []);
  const [useWeek, setUseWeek] = useState<boolean>(false);
  const [weekAnchor, setWeekAnchor] = useState<Date>(startOfWeek(today));
  const weekFrom = useMemo(() => toYMD(weekAnchor), [weekAnchor]);
  const weekTo = useMemo(() => toYMD(addDays(weekAnchor, 6)), [weekAnchor]);

  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);

  const [noteModal, setNoteModal] = useState<{ open: boolean; row: Shift | null }>({
    open: false,
    row: null,
  });
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

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (!profile || profile.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setMe(profile);
      setChecking(false);
    }

    checkAuth();
  }, [router]);

  // Auto sort defaults per tab
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
    if (checking || !me) return;

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

  const stats = useMemo(() => {
    const totalHours = shifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
    const totalPay = shifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const unpaidCount = shifts.filter(s => !s.is_paid).length;
    const flaggedCount = shifts.filter(s => Boolean(s.admin_flag) || isAutoFlag(s)).length;

    return {
      totalShifts: shifts.length,
      totalHours: totalHours.toFixed(1),
      totalPay: totalPay.toFixed(2),
      unpaidPay: unpaidTotal.toFixed(2),
      unpaidCount,
      flaggedCount,
    };
  }, [shifts, unpaidTotal]);

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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const nextWeekAnchor = addDays(weekAnchor, 7);
  const nextWeekEnd = stripTime(addDays(nextWeekAnchor, 6));
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = stripTime(addDays(currentWeekStart, 6));
  const disableNextWeek = nextWeekEnd > currentWeekEnd;

  if (checking) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Admin Dashboard - Timesheet</title>
        <link rel="stylesheet" href="/styles/new-saas-design.css" />
      </Head>

      <div className="app-container">
        {/* SIDEBAR */}
        <aside className="app-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">T</div>
              <div className="sidebar-logo-text">Timesheet</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-nav-section">
              <div className="sidebar-nav-label">Main</div>
              <a href="/admin" className="sidebar-nav-item active">
                <span className="sidebar-nav-icon">📊</span>
                <span>Dashboard</span>
              </a>
              <a href="/dashboard" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">👤</span>
                <span>My Shifts</span>
              </a>
              <a href="/new-shift" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">➕</span>
                <span>Log Shift</span>
              </a>
            </div>

            <div className="sidebar-nav-section">
              <div className="sidebar-nav-label">Management</div>
              <a href="#" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">👥</span>
                <span>Employees</span>
              </a>
              <a href="#" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">💰</span>
                <span>Payroll</span>
              </a>
              <a href="#" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">📈</span>
                <span>Reports</span>
              </a>
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {me?.full_name?.charAt(0) || 'A'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{me?.full_name || 'Admin'}</div>
                <div className="sidebar-user-role">Administrator</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="app-main">
          <header className="app-header">
            <div className="header-content">
              <div>
                <h1 className="header-title">Dashboard</h1>
                <p className="header-subtitle">Manage employee shifts and payroll</p>
              </div>
              <div className="header-actions">
                <button className="btn-new btn-secondary-new">Export</button>
                <button className="btn-new btn-primary-new" onClick={() => router.push('/new-shift')}>
                  + New Shift
                </button>
              </div>
            </div>
          </header>

          <div className="app-content">
            {err && (
              <div className="alert-new alert-error-new">
                Error: {err}
              </div>
            )}

            {/* STATS CARDS */}
            <div className="dashboard-stats">
              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Unpaid</div>
                  </div>
                  <div className="stat-card-icon">💰</div>
                </div>
                <div className="stat-card-value gradient-text">${stats.unpaidPay}</div>
                <div className="stat-card-change">
                  {stats.unpaidCount} unpaid shifts
                </div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Shifts</div>
                  </div>
                  <div className="stat-card-icon">📋</div>
                </div>
                <div className="stat-card-value">{stats.totalShifts}</div>
                <div className="stat-card-change">
                  {useWeek ? `${weekFrom} to ${weekTo}` : rangeFrom || rangeTo ? 'Custom range' : 'All time'}
                </div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Hours</div>
                  </div>
                  <div className="stat-card-icon">⏰</div>
                </div>
                <div className="stat-card-value">{stats.totalHours}</div>
                <div className="stat-card-change">Across all employees</div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Flagged Shifts</div>
                  </div>
                  <div className="stat-card-icon">⚠️</div>
                </div>
                <div className="stat-card-value">{stats.flaggedCount}</div>
                <div className="stat-card-change">Need attention</div>
              </div>
            </div>

            {/* FILTERS */}
            <div className="filters-card">
              <div className="filters-header">
                <h3 className="filters-title">Filters</h3>
              </div>
              <div className="filters-content">
                <div className="filter-row">
                  <label className="filter-label">
                    <input
                      type="radio"
                      name="range-mode"
                      checked={useWeek}
                      onChange={() => setUseWeek(true)}
                    />
                    <span>Week View</span>
                  </label>
                  <div className="filter-controls">
                    <button
                      className="btn-new btn-sm-new"
                      onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                    >
                      ◀ Prev
                    </button>
                    <button
                      className="btn-new btn-sm-new"
                      onClick={() => setWeekAnchor(startOfWeek(today))}
                    >
                      This Week
                    </button>
                    <button
                      className="btn-new btn-sm-new"
                      onClick={() => setWeekAnchor(nextWeekAnchor)}
                      disabled={disableNextWeek}
                    >
                      Next ▶
                    </button>
                    <span className="filter-range">{weekFrom} → {weekTo}</span>
                  </div>
                </div>

                <div className="filter-row">
                  <label className="filter-label">
                    <input
                      type="radio"
                      name="range-mode"
                      checked={!useWeek}
                      onChange={() => setUseWeek(false)}
                    />
                    <span>Custom Range</span>
                  </label>
                  <div className="filter-controls">
                    <input
                      type="date"
                      className="input-new"
                      value={rangeFrom ?? ''}
                      onChange={e => setRangeFrom(e.target.value || null)}
                      disabled={useWeek}
                    />
                    <span>to</span>
                    <input
                      type="date"
                      className="input-new"
                      value={rangeTo ?? ''}
                      onChange={e => setRangeTo(e.target.value || null)}
                      disabled={useWeek}
                    />
                    <button
                      className="btn-new btn-sm-new"
                      onClick={() => {
                        setRangeFrom(null);
                        setRangeTo(null);
                      }}
                      disabled={useWeek}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* EMPLOYEE TOTALS */}
            <div className="data-table-container">
              <div className="data-table-header">
                <h2 className="data-table-title">Employee Totals</h2>
                <div className="data-table-filters">
                  <select
                    className="select-new"
                    value={sortBy}
                    onChange={e => {
                      setSortBy(e.target.value as SortBy);
                      setUserSorted(true);
                    }}
                  >
                    <option value="name">Sort by Name</option>
                    <option value="hours">Sort by Hours</option>
                    <option value="pay">Sort by Pay</option>
                    <option value="unpaid">Sort by Unpaid</option>
                  </select>
                  <button
                    className="btn-new btn-sm-new"
                    onClick={() => {
                      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                      setUserSorted(true);
                    }}
                  >
                    {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                  </button>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Hours</th>
                    <th>Total Pay</th>
                    <th>Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTotals.map(t => {
                    const vHref = venmoHref(venmo[t.id]);
                    const hasUnpaid = t.unpaid > 0.0001;

                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>
                          {t.name}
                          {t.minCount > 0 && (
                            <span className="badge-new badge-neutral-new ml-sm">
                              {t.minCount}× MIN
                            </span>
                          )}
                          {t.flaggedCount > 0 && (
                            <span className="badge-new badge-warning-new ml-sm">
                              {t.flaggedCount}× FLAG
                            </span>
                          )}
                        </td>
                        <td>{t.hours.toFixed(2)} hrs</td>
                        <td style={{ fontWeight: 600 }}>${t.pay.toFixed(2)}</td>
                        <td>
                          <span style={{ fontWeight: 600 }}>${t.unpaid.toFixed(2)}</span>
                          {vHref && hasUnpaid && (
                            <a
                              className="btn-new btn-sm-new btn-venmo ml-sm"
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

            {/* SHIFT DETAILS */}
            <div className="data-table-container">
              <div className="data-table-header">
                <h2 className="data-table-title">Shift Details</h2>
                <div className="data-table-filters">
                  <div className="tabs-new">
                    <button
                      className={`tab-new ${tab === 'unpaid' ? 'active' : ''}`}
                      onClick={() => {
                        setTab('unpaid');
                        setUserSorted(false);
                      }}
                    >
                      Unpaid ({shifts.filter(s => !s.is_paid).length})
                    </button>
                    <button
                      className={`tab-new ${tab === 'paid' ? 'active' : ''}`}
                      onClick={() => {
                        setTab('paid');
                        setUserSorted(false);
                      }}
                    >
                      Paid ({shifts.filter(s => s.is_paid).length})
                    </button>
                    <button
                      className={`tab-new ${tab === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setTab('all');
                        setUserSorted(false);
                      }}
                    >
                      All ({shifts.length})
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  Loading shifts...
                </div>
              ) : shifts.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  No shifts found
                </div>
              ) : (
                <div className="shift-groups">
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
                      <div key={uid} className="shift-group">
                        <div className="shift-group-header">
                          <div className="shift-group-info">
                            <span className="shift-group-name">{name}</span>
                            <span className="shift-group-stats">
                              {rows.length} shifts · {subtotal.hours.toFixed(1)}h · ${subtotal.pay.toFixed(2)}
                            </span>
                          </div>
                          <div className="shift-group-actions">
                            <button
                              className="btn-new btn-sm-new btn-success-new"
                              disabled={bulkBusy[uid] || allPaid}
                              onClick={() => bulkTogglePaidForEmployee(uid, true)}
                            >
                              Mark All Paid
                            </button>
                            <button
                              className="btn-new btn-sm-new"
                              disabled={bulkBusy[uid] || rows.length === unpaidCount}
                              onClick={() => bulkTogglePaidForEmployee(uid, false)}
                            >
                              Mark All Unpaid
                            </button>
                          </div>
                        </div>

                        <table className="data-table shift-detail-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Type</th>
                              <th>In</th>
                              <th>Out</th>
                              <th>Hours</th>
                              <th>Pay</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(s => {
                              const { pay, minApplied } = payInfo(s);
                              const paid = Boolean(s.is_paid);
                              const hasNote = !!(s.admin_note && s.admin_note.trim());
                              const autoFlag = isAutoFlag(s);
                              const isFlagged = Boolean(s.admin_flag) || autoFlag;

                              return (
                                <tr key={s.id} className={isFlagged ? 'row-flagged' : ''}>
                                  <td>{s.shift_date}</td>
                                  <td>
                                    <span className="badge-new badge-neutral-new">
                                      {s.shift_type}
                                    </span>
                                  </td>
                                  <td>
                                    {s.time_in
                                      ? new Date(s.time_in).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '—'}
                                  </td>
                                  <td>
                                    {s.time_out
                                      ? new Date(s.time_out).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '—'}
                                  </td>
                                  <td>{(s.hours_worked || 0).toFixed(1)} hrs</td>
                                  <td style={{ fontWeight: 600 }}>
                                    ${pay.toFixed(2)}
                                    {minApplied && (
                                      <span className="badge-new badge-info-new ml-sm" title="$50 minimum applied">
                                        MIN
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {paid ? (
                                      <span className="badge-new badge-success-new">Paid</span>
                                    ) : (
                                      <span className="badge-new badge-warning-new">Unpaid</span>
                                    )}
                                    {isFlagged && (
                                      <span className="badge-new badge-danger-new ml-sm">
                                        FLAG
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <div className="action-buttons">
                                      {!paid && (
                                        <button
                                          className="btn-new btn-sm-new btn-success-new"
                                          onClick={() => togglePaid(s, true)}
                                        >
                                          Mark Paid
                                        </button>
                                      )}
                                      {paid && (
                                        <button
                                          className="btn-new btn-sm-new"
                                          onClick={() => togglePaid(s, false)}
                                        >
                                          Mark Unpaid
                                        </button>
                                      )}
                                      <button
                                        className="btn-new btn-sm-new"
                                        onClick={() => editRow(s)}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        className="btn-new btn-sm-new btn-danger-new"
                                        onClick={() => deleteRow(s)}
                                      >
                                        Delete
                                      </button>
                                      <button
                                        className={isFlagged ? 'btn-new btn-sm-new btn-warning-new' : 'btn-new btn-sm-new'}
                                        onClick={() => toggleAdminFlag(s, !Boolean(s.admin_flag))}
                                      >
                                        {isFlagged ? '★' : 'Flag'}
                                      </button>
                                      <button
                                        className="btn-new btn-sm-new"
                                        onClick={() => openNoteModal(s)}
                                        title={hasNote ? 'View note' : 'Add note'}
                                      >
                                        📝
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* NOTE MODAL */}
      {noteModal.open && noteModal.row && (
        <div className="modal-backdrop-new" onClick={closeNoteModal}>
          <div className="modal-new" onClick={e => e.stopPropagation()}>
            <div className="modal-header-new">
              <h3 className="modal-title-new">
                📝 Note — {names[noteModal.row.user_id] || '—'} · {noteModal.row.shift_date}
              </h3>
              <button className="modal-close-new" onClick={closeNoteModal}>×</button>
            </div>
            <div className="modal-body-new">
              <textarea
                className="textarea-new"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Add a private admin note..."
                rows={5}
              />
              <p className="modal-hint">Notes are only visible to admins.</p>
            </div>
            <div className="modal-footer-new">
              <button className="btn-new btn-secondary-new" onClick={closeNoteModal}>
                Cancel
              </button>
              <button className="btn-new btn-primary-new" onClick={saveNoteModal}>
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
