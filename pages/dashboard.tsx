// pages/dashboard.tsx
/**
 * EMPLOYEE DASHBOARD - Brand New SaaS Design
 * Completely redesigned with sidebar navigation and modern interface
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, DollarSign, Clock, LogOut } from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  startOfMonth,
  endOfMonth,
  addMonths,
  format,
} from 'date-fns';
import { formatForDisplay } from '../lib/timezone';

type Mode = 'week' | 'month' | 'all';

type Shift = {
  id: string;
  user_id: string;
  shift_date: string;
  shift_type: string;
  time_in: string;
  time_out: string;
  hours_worked: number;
  pay_due: number;
  is_paid?: boolean;
  paid_at?: string | null;
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; full_name?: string; role?: string } | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('all');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | undefined>();

  const [unpaidAllTime, setUnpaidAllTime] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewOptionsExpanded, setViewOptionsExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', session.user.id)
        .single();

      setUser({ id: session.user.id, full_name: profile?.full_name, role: profile?.role });
    })();
  }, []);

  const range = useMemo(() => {
    const now = new Date();
    if (mode === 'week') {
      const base = addWeeks(now, offset);
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return {
        start,
        end,
        label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
        kind: 'week' as const,
      };
    }
    if (mode === 'month') {
      const base = addMonths(now, offset);
      const start = startOfMonth(base);
      const end = endOfMonth(base);
      return {
        start,
        end,
        label: format(start, 'MMMM yyyy'),
        kind: 'month' as const,
      };
    }
    return {
      start: null as any,
      end: null as any,
      label: 'All time',
      kind: 'all' as const,
    };
  }, [mode, offset]);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      setErr(undefined);
      setLoading(true);
      try {
        let q = supabase
          .from('shifts')
          .select('*')
          .eq('user_id', user.id)
          .order('shift_date', { ascending: false });

        if (mode !== 'all') {
          q = q
            .gte('shift_date', format(range.start, 'yyyy-MM-dd'))
            .lte('shift_date', format(range.end, 'yyyy-MM-dd'));
        }

        const { data, error } = await q;
        if (error) throw error;
        if (!alive) return;
        setShifts((data ?? []) as Shift[]);

        const { data: unpaidData, error: unpaidError } = await supabase
          .from('shifts')
          .select('pay_due, is_paid')
          .eq('user_id', user.id);

        if (!alive) return;

        if (!unpaidError && unpaidData) {
          const totalUnpaid = unpaidData.reduce((sum, row: any) => {
            const isPaid = !!row.is_paid;
            const pay = Number(row.pay_due ?? 0);
            return sum + (isPaid ? 0 : pay);
          }, 0);
          setUnpaidAllTime(totalUnpaid);
        }
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'Failed to load shifts.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user, mode, offset, range.start, range.end]);

  const totals = useMemo(() => {
    const hours = shifts.reduce((s, x) => s + Number(x.hours_worked || 0), 0);
    const pay = shifts.reduce((s, x) => s + Number(x.pay_due || 0), 0);
    const unpaidInRange = shifts
      .filter(s => !s.is_paid)
      .reduce((sum, x) => sum + Number(x.pay_due || 0), 0);
    return { hours, pay, unpaidInRange, count: shifts.length };
  }, [shifts]);

  // Sort shifts with unpaid at the top
  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => {
      // Unpaid shifts come first
      if (!a.is_paid && b.is_paid) return -1;
      if (a.is_paid && !b.is_paid) return 1;
      // Within same payment status, sort by date (newest first)
      return b.shift_date.localeCompare(a.shift_date);
    });
  }, [shifts]);

  async function delShift(id: string) {
    if (!confirm('Delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    setShifts(prev => prev.filter(x => x.id !== id));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (!user) return null;

  return (
    <>
      <Head>
        <title>My Shifts - Timesheet</title>
      </Head>

      <div className="app-container">
        {/* MOBILE MENU BUTTON */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          ☰
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
              <a href="/dashboard" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
            </div>

            {user?.role === 'admin' && (
              <div className="sidebar-nav-section">
                <div className="sidebar-nav-label">Admin</div>
                <a href="/admin" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                  <span>Admin Dashboard</span>
                </a>
                <a href="/admin-schedule" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                  <span>Schedule</span>
                </a>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.full_name || 'User'}</div>
                <div className="sidebar-user-role">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</div>
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
                <h1 className="header-title">My Shifts</h1>
                <p className="header-subtitle">View and manage your work shifts</p>
              </div>
              <div className="header-actions">
                <button className="btn-new btn-primary-new" onClick={() => router.push('/new-shift')}>
                  + Log New Shift
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
                  <div className="stat-card-icon"><DollarSign size={20} /></div>
                </div>
                <div className="stat-card-value gradient-text">${unpaidAllTime.toFixed(2)}</div>
                <div className="stat-card-change">All time balance</div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Shifts</div>
                  </div>
                  <div className="stat-card-icon"><BarChart3 size={20} /></div>
                </div>
                <div className="stat-card-value">{totals.count}</div>
                <div className="stat-card-change">All time</div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Hours</div>
                  </div>
                  <div className="stat-card-icon"><Clock size={20} /></div>
                </div>
                <div className="stat-card-value">{totals.hours.toFixed(1)}</div>
                <div className="stat-card-change">All time</div>
              </div>

              <div className="stat-card-new">
                <div className="stat-card-header">
                  <div>
                    <div className="stat-card-label">Total Pay</div>
                  </div>
                  <div className="stat-card-icon"><DollarSign size={20} /></div>
                </div>
                <div className="stat-card-value">${totals.pay.toFixed(2)}</div>
                <div className="stat-card-change">All time</div>
              </div>
            </div>

            {/* FILTERS - Enhanced Design */}
            <div className="view-options-section">
              <div
                className="view-options-header"
                onClick={() => setViewOptionsExpanded(!viewOptionsExpanded)}
              >
                <div>
                  <h3 className="view-options-title">
                    View Options <span className="mobile-toggle-arrow">{viewOptionsExpanded ? '▼' : '▶'}</span>
                  </h3>
                  <p className="view-options-subtitle">Filter your shift history by time range</p>
                </div>
              </div>
              {viewOptionsExpanded && (
                <div className="view-options-content">
                <div className="time-range-controls">
                  <label className="time-range-label">Time Range</label>
                  <div className="time-range-buttons">
                    <select
                      className="time-range-select"
                      value={mode}
                      onChange={e => {
                        setMode(e.target.value as Mode);
                        setOffset(0);
                      }}
                    >
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
                      <option value="all">All Time</option>
                    </select>

                    {mode !== 'all' && (
                      <>
                        <button
                          className="time-nav-btn"
                          onClick={() => setOffset(n => n - 1)}
                        >
                          ◀ Prev
                        </button>
                        <button className="time-nav-btn time-nav-current" onClick={() => setOffset(0)}>
                          Current
                        </button>
                        <button
                          className="time-nav-btn"
                          onClick={() => setOffset(n => n + 1)}
                          disabled={offset >= 0}
                        >
                          Next ▶
                        </button>
                        <span className="time-range-display">{range.label}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* SHIFTS TABLE - Enhanced Design */}
            <div className="shift-history-section">
              <div className="shift-history-header">
                <div>
                  <h2 className="shift-history-title">Shift History</h2>
                  <p className="shift-history-subtitle">
                    {loading ? 'Loading...' : `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'} found`}
                  </p>
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
                  <div className="empty-title">No shifts in this range</div>
                  <div className="empty-subtitle">Log your first shift to get started!</div>
                </div>
              ) : (
                <div className="shift-history-table-wrapper">
                  <table className="shift-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Time In</th>
                        <th>Time Out</th>
                        <th>Hours</th>
                        <th>Pay</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedShifts.map(s => {
                        const paid = Boolean(s.is_paid);
                        return (
                          <tr key={s.id}>
                            <td className="shift-date">{s.shift_date}</td>
                            <td>
                              <span className="shift-type-badge">
                                {s.shift_type}
                              </span>
                            </td>
                            <td className="shift-time">
                              {s.time_in
                                ? formatForDisplay(s.time_in, 'h:mm a')
                                : '—'}
                            </td>
                            <td className="shift-time">
                              {s.time_out
                                ? formatForDisplay(s.time_out, 'h:mm a')
                                : '—'}
                            </td>
                            <td className="shift-hours">{Number(s.hours_worked ?? 0).toFixed(1)} hrs</td>
                            <td className="shift-pay">
                              ${Number(s.pay_due ?? 0).toFixed(2)}
                            </td>
                            <td>
                              {paid ? (
                                <span className="shift-status-badge paid">✓ Paid</span>
                              ) : (
                                <span className="shift-status-badge unpaid">⏱ Unpaid</span>
                              )}
                              {s.paid_at && (
                                <div className="shift-paid-date">
                                  {formatForDisplay(s.paid_at, 'MMM d, yyyy')}
                                </div>
                              )}
                            </td>
                            <td>
                              <div className="shift-actions">
                                <Link
                                  href={`/shift/${s.id}`}
                                  className="shift-action-btn edit"
                                >
                                  ✏️ Edit
                                </Link>
                                <button
                                  className="shift-action-btn delete"
                                  onClick={() => delShift(s.id)}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
