// pages/admin.tsx
/**
 * ADMIN DASHBOARD - Brand New SaaS Design
 * Completely redesigned with sidebar navigation and modern interface
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, DollarSign, CheckCircle, Clock, LogOut, Settings } from 'lucide-react';

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
  unpaidHours: number;
  minCount: number;
  flaggedCount: number;
  unpaidMinCount: number;
  unpaidFlaggedCount: number;
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
  const [totalsFilter, setTotalsFilter] = useState<'unpaid' | 'all'>('unpaid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [userSorted, setUserSorted] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [allTimeStatsExpanded, setAllTimeStatsExpanded] = useState(false);

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

        // Don't filter by tab at query level - we'll filter in the UI
        // This ensures Employee Totals always has access to all shifts

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
  }, [checking, me, useWeek, weekFrom, weekTo, rangeFrom, rangeTo]);

  // Filter shifts for Shift Details section based on tab
  const filteredShifts = useMemo(() => {
    if (tab === 'unpaid') return shifts.filter(s => !s.is_paid);
    if (tab === 'paid') return shifts.filter(s => s.is_paid);
    return shifts; // 'all' shows everything
  }, [shifts, tab]);

  const groups = useMemo(() => {
    const m: Record<string, Shift[]> = {};
    for (const s of filteredShifts) {
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
  }, [filteredShifts]);

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
          unpaidHours: 0,
          minCount: 0,
          flaggedCount: 0,
          unpaidMinCount: 0,
          unpaidFlaggedCount: 0,
        };
      }

      const isPaid = Boolean(s.is_paid);

      m[id].hours += h;
      m[id].pay += pay;

      if (!isPaid) {
        m[id].unpaid += pay;
        m[id].unpaidHours += h;
        if (minApplied) m[id].unpaidMinCount += 1;
        if (isFlagged) m[id].unpaidFlaggedCount += 1;
      }

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
    // First filter based on totalsFilter
    let filtered = [...totals];
    if (totalsFilter === 'unpaid') {
      // Show only employees who have unpaid amounts
      filtered = filtered.filter(t => t.unpaid > 0.0001);
    }
    // 'all' shows all employees with their all-time totals (hours, pay, etc.)

    // Then sort
    if (sortBy === 'name') {
      filtered.sort((x, y) => x.name.localeCompare(y.name) * (sortDir === 'asc' ? 1 : -1));
    } else if (sortBy === 'hours') {
      filtered.sort((x, y) => (x.hours - y.hours) * (sortDir === 'asc' ? 1 : -1));
    } else if (sortBy === 'pay') {
      filtered.sort((x, y) => (x.pay - y.pay) * (sortDir === 'asc' ? 1 : -1));
    } else if (sortBy === 'unpaid') {
      filtered.sort((x, y) => (x.unpaid - y.unpaid) * (sortDir === 'asc' ? 1 : -1));
    }
    return filtered;
  }, [totals, totalsFilter, sortBy, sortDir]);

  const sectionOrder = useMemo(() => sortedTotals.map(t => t.id), [sortedTotals]);

  const stats = useMemo(() => {
    const totalHours = shifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
    const totalPay = shifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const unpaidShifts = shifts.filter(s => !s.is_paid);
    const paidShifts = shifts.filter(s => s.is_paid);
    const unpaidCount = unpaidShifts.length;
    const unpaidHours = unpaidShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
    const paidAmount = paidShifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);

    return {
      totalShifts: shifts.length,
      totalHours: totalHours.toFixed(1),
      totalPay: totalPay.toFixed(2),
      unpaidPay: unpaidTotal.toFixed(2),
      paidPay: paidAmount.toFixed(2),
      unpaidCount,
      unpaidHours: unpaidHours.toFixed(1),
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
      </Head>

      <div className="app-container">
        {/* MOBILE MENU BUTTON */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
        </button>

        {/* MOBILE OVERLAY */}
        <div
          className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* SIDEBAR */}
        <aside className={`app-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">T</div>
              <div className="sidebar-logo-text">Timesheet</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-nav-section">
              <div className="sidebar-nav-label">Main</div>
              <a href="/admin" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                <span>Admin Dashboard</span>
              </a>
              <a href="/dashboard" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><User size={18} /></span>
                <span>My Shifts</span>
              </a>
              <a href="/new-shift" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Plus size={18} /></span>
                <span>Log Shift</span>
              </a>
              <a href="/me/schedule" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                <span>My Schedule</span>
              </a>
              <a href="/settings" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Settings size={18} /></span>
                <span>Settings</span>
              </a>
            </div>

            <div className="sidebar-nav-section">
              <div className="sidebar-nav-label">Admin</div>
              <a href="/admin-schedule" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                <span>Schedule</span>
              </a>
              <a href="/admin-schedule-past" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                <span>Past Schedule</span>
              </a>
              <a href="/payroll" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><DollarSign size={18} /></span>
                <span>Payroll</span>
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
              <LogOut size={16} /> Logout
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
              {/* UNPAID STATS - Top Row */}
              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Unpaid</div>
                  </div>
                  <div className="stat-card-icon"><DollarSign size={20} /></div>
                </div>
                <div className="stat-card-value gradient-text">${stats.unpaidPay}</div>
                <div className="stat-card-change">
                  {stats.unpaidCount} unpaid shifts
                </div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Unpaid Shifts</div>
                  </div>
                  <div className="stat-card-icon"><BarChart3 size={20} /></div>
                </div>
                <div className="stat-card-value">{stats.unpaidCount}</div>
                <div className="stat-card-change">Not yet paid</div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Unpaid Hours</div>
                  </div>
                  <div className="stat-card-icon"><Clock size={20} /></div>
                </div>
                <div className="stat-card-value">{stats.unpaidHours}</div>
                <div className="stat-card-change">Hours unpaid</div>
              </div>

              {/* ALL TIME STATS - Collapsible on mobile */}
              <div
                className="all-time-stats-toggle"
                onClick={() => setAllTimeStatsExpanded(!allTimeStatsExpanded)}
              >
                <span>All Time Stats {allTimeStatsExpanded ? '▼' : '▶'}</span>
              </div>

              <div className={`all-time-stats-container ${allTimeStatsExpanded ? 'expanded' : ''}`}>
                <div className="stat-card-new">
                  <div className="stat-card-header">
                    <div>
                      <div className="stat-card-label">Total Paid</div>
                    </div>
                    <div className="stat-card-icon"><CheckCircle size={20} /></div>
                  </div>
                  <div className="stat-card-value">${Number(stats.paidPay).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="stat-card-change">All time</div>
                </div>

                <div className="stat-card-new">
                  <div className="stat-card-header">
                    <div>
                      <div className="stat-card-label">Total Shifts</div>
                    </div>
                    <div className="stat-card-icon"><BarChart3 size={20} /></div>
                  </div>
                  <div className="stat-card-value">{Number(stats.totalShifts).toLocaleString('en-US')}</div>
                  <div className="stat-card-change">All time</div>
                </div>

                <div className="stat-card-new">
                  <div className="stat-card-header">
                    <div>
                      <div className="stat-card-label">Total Hours</div>
                    </div>
                    <div className="stat-card-icon"><Clock size={20} /></div>
                  </div>
                  <div className="stat-card-value">{Number(stats.totalHours).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
                  <div className="stat-card-change">All time</div>
                </div>
              </div>
            </div>

            {/* FILTERS - Enhanced Design */}
            <div className="view-options-section">
              <div
                className="view-options-header"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                style={{ cursor: 'pointer' }}
              >
                <div>
                  <h3 className="view-options-title">
                    Date Range Filters {filtersExpanded ? '▼' : '▶'}
                  </h3>
                  <p className="view-options-subtitle">Filter shifts by time period</p>
                </div>
              </div>
              {filtersExpanded && (
                <div className="view-options-content">
                <div className="admin-filter-mode">
                  <label className="admin-filter-mode-option">
                    <input
                      type="radio"
                      name="range-mode"
                      checked={useWeek}
                      onChange={() => setUseWeek(true)}
                      className="admin-filter-radio"
                    />
                    <span className="admin-filter-mode-label">Week View</span>
                  </label>
                  {useWeek && (
                    <div className="admin-week-controls">
                      <button
                        className="time-nav-btn"
                        onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                      >
                        ◀ Prev
                      </button>
                      <button
                        className="time-nav-btn time-nav-current"
                        onClick={() => setWeekAnchor(startOfWeek(today))}
                      >
                        This Week
                      </button>
                      <button
                        className="time-nav-btn"
                        onClick={() => setWeekAnchor(nextWeekAnchor)}
                        disabled={disableNextWeek}
                      >
                        Next ▶
                      </button>
                      <span className="time-range-display">{weekFrom} → {weekTo}</span>
                    </div>
                  )}
                </div>

                <div className="admin-filter-mode">
                  <label className="admin-filter-mode-option">
                    <input
                      type="radio"
                      name="range-mode"
                      checked={!useWeek}
                      onChange={() => setUseWeek(false)}
                      className="admin-filter-radio"
                    />
                    <span className="admin-filter-mode-label">Custom Range</span>
                  </label>
                  {!useWeek && (
                    <div className="admin-custom-controls">
                      <input
                        type="date"
                        className="admin-date-input"
                        value={rangeFrom ?? ''}
                        onChange={e => setRangeFrom(e.target.value || null)}
                      />
                      <span className="admin-range-separator">to</span>
                      <input
                        type="date"
                        className="admin-date-input"
                        value={rangeTo ?? ''}
                        onChange={e => setRangeTo(e.target.value || null)}
                      />
                      <button
                        className="time-nav-btn"
                        onClick={() => {
                          setRangeFrom(null);
                          setRangeTo(null);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>

            {/* EMPLOYEE TOTALS */}
            <div className="shift-history-section">
              <div className="shift-history-header">
                <div>
                  <h2 className="shift-history-title">Employee Totals</h2>
                  <p className="shift-history-subtitle">Aggregated payroll data per employee</p>
                </div>
                <div className="tabs-new">
                  <button
                    className={`tab-new ${totalsFilter === 'unpaid' ? 'active' : ''}`}
                    onClick={() => setTotalsFilter('unpaid')}
                  >
                    Unpaid ({totals.filter(t => t.unpaid > 0.0001).length})
                  </button>
                  <button
                    className={`tab-new ${totalsFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setTotalsFilter('all')}
                  >
                    All ({totals.length})
                  </button>
                </div>
              </div>

              <div className="shift-history-table-wrapper employee-totals-wrapper">
                <table className="shift-history-table employee-totals-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      {totalsFilter === 'unpaid' ? (
                        <>
                          <th>Unpaid Hours</th>
                          <th>Unpaid Pay</th>
                        </>
                      ) : (
                        <>
                          <th>Hours</th>
                          <th>Total Pay</th>
                          <th>Unpaid</th>
                        </>
                      )}
                      <th className="th-action">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTotals.map(t => {
                      const vHref = venmoHref(venmo[t.id]);
                      const hasUnpaid = t.unpaid > 0.0001;

                      // Use unpaid-specific counts when filtering by unpaid
                      const displayMinCount = totalsFilter === 'unpaid' ? t.unpaidMinCount : t.minCount;
                      const displayFlaggedCount = totalsFilter === 'unpaid' ? t.unpaidFlaggedCount : t.flaggedCount;

                      return (
                        <>
                          <tr key={t.id}>
                            <td className="shift-date" style={{ fontWeight: 600 }}>
                              <div className="employee-name">{t.name}</div>
                              {(displayMinCount > 0 || displayFlaggedCount > 0) && (
                                <div className="employee-badges">
                                  {displayMinCount > 0 && (
                                    <span className="badge-new badge-neutral-new ml-sm">
                                      {displayMinCount}× MIN
                                    </span>
                                  )}
                                  {displayFlaggedCount > 0 && (
                                    <span className="badge-new badge-warning-new ml-sm">
                                      {displayFlaggedCount}× FLAG
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {totalsFilter === 'unpaid' ? (
                              <>
                                <td className="shift-hours"><div className="td-value">{t.unpaidHours.toFixed(1)} hrs</div></td>
                                <td className="shift-pay"><div className="td-value">${t.unpaid.toFixed(2)}</div></td>
                              </>
                            ) : (
                              <>
                                <td className="shift-hours"><div className="td-value">{t.hours.toFixed(1)} hrs</div></td>
                                <td className="shift-pay"><div className="td-value">${t.pay.toFixed(2)}</div></td>
                                <td className="shift-pay">
                                  <div className="td-value">${t.unpaid.toFixed(2)}</div>
                                </td>
                              </>
                            )}
                            <td className="td-action td-action-desktop">
                              {vHref && hasUnpaid && (
                                <a
                                  className="btn-new btn-sm-new btn-venmo"
                                  href={vHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  💸 Venmo
                                </a>
                              )}
                            </td>
                          </tr>
                          {vHref && hasUnpaid && (
                            <tr key={`${t.id}-venmo`} className="mobile-venmo-row">
                              <td className="shift-venmo-row" colSpan={totalsFilter === 'unpaid' ? 4 : 5}>
                                <a
                                  className="btn-new btn-sm-new btn-venmo"
                                  href={vHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  💸 Venmo
                                </a>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SHIFT DETAILS */}
            <div className="shift-history-section">
              <div className="shift-history-header">
                <div>
                  <h2 className="shift-history-title">Shift Details</h2>
                  <p className="shift-history-subtitle">
                    {loading ? 'Loading...' : `${filteredShifts.length} ${filteredShifts.length === 1 ? 'shift' : 'shifts'} found`}
                  </p>
                </div>
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

              {loading ? (
                <div className="shift-history-empty">
                  <div className="empty-icon"><Clock size={48} /></div>
                  <div className="empty-title">Loading shifts...</div>
                  <div className="empty-subtitle">Please wait while we fetch your data</div>
                </div>
              ) : shifts.length === 0 ? (
                <div className="shift-history-empty">
                  <div className="empty-icon"><BarChart3 size={48} /></div>
                  <div className="empty-title">No shifts found</div>
                  <div className="empty-subtitle">Try adjusting your filters or date range</div>
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
                                    <div className="admin-shift-actions">
                                      <div className="admin-shift-actions-primary">
                                        {!paid && (
                                          <button
                                            className="admin-action-btn admin-action-paid"
                                            onClick={() => togglePaid(s, true)}
                                            title="Mark as paid"
                                          >
                                            ✓
                                          </button>
                                        )}
                                        {paid && (
                                          <button
                                            className="admin-action-btn admin-action-unpaid"
                                            onClick={() => togglePaid(s, false)}
                                            title="Mark as unpaid"
                                          >
                                            ↶
                                          </button>
                                        )}
                                        <button
                                          className="admin-action-btn"
                                          onClick={() => editRow(s)}
                                          title="Edit shift"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          className={`admin-action-btn ${isFlagged ? 'admin-action-flagged' : ''}`}
                                          onClick={() => toggleAdminFlag(s, !Boolean(s.admin_flag))}
                                          title={isFlagged ? 'Remove flag' : 'Flag shift'}
                                        >
                                          {isFlagged ? '★' : '☆'}
                                        </button>
                                        <button
                                          className={`admin-action-btn ${hasNote ? 'admin-action-has-note' : ''}`}
                                          onClick={() => openNoteModal(s)}
                                          title={hasNote ? 'View note' : 'Add note'}
                                        >
                                          📝
                                        </button>
                                      </div>
                                      <div className="admin-shift-actions-secondary">
                                        <button
                                          className="admin-action-btn admin-action-delete"
                                          onClick={() => deleteRow(s)}
                                          title="Delete shift"
                                        >
                                          🗑️
                                        </button>
                                      </div>
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
