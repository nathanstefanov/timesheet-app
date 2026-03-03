// pages/dashboard.tsx
/**
 * EMPLOYEE DASHBOARD - Brand New SaaS Design
 * Completely redesigned with sidebar navigation and modern interface
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { logShiftDeleted } from '../lib/auditLog';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, DollarSign, Clock, LogOut, Settings, AlertCircle, X, Shield } from 'lucide-react';
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
  const [user, setUser] = useState<{ id: string; full_name?: string; role?: string; phone?: string | null; venmo_url?: string | null } | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('all');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | undefined>();

  const [unpaidAllTime, setUnpaidAllTime] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);

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
        .select('id, full_name, role, phone, venmo_url')
        .eq('id', session.user.id)
        .single();

      setUser({
        id: session.user.id,
        full_name: profile?.full_name,
        role: profile?.role,
        phone: profile?.phone,
        venmo_url: profile?.venmo_url
      });

      // Check if phone or venmo is missing and show prompt
      if (!profile?.phone || !profile?.venmo_url) {
        setShowProfilePrompt(true);
      }
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

  // Sort and filter shifts
  const sortedShifts = useMemo(() => {
    let filtered = [...shifts];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(shift => {
        // Search by date
        if (shift.shift_date.includes(query)) return true;
        // Search by type
        if (shift.shift_type?.toLowerCase().includes(query)) return true;
        // Search by payment status
        if (shift.is_paid && 'paid'.includes(query)) return true;
        if (!shift.is_paid && 'unpaid'.includes(query)) return true;
        return false;
      });
    }

    // Sort by payment status and date
    return filtered.sort((a, b) => {
      // Unpaid shifts come first
      if (!a.is_paid && b.is_paid) return -1;
      if (a.is_paid && !b.is_paid) return 1;
      // Within same payment status, sort by date (newest first)
      return b.shift_date.localeCompare(a.shift_date);
    });
  }, [shifts, searchQuery]);

  async function delShift(id: string) {
    if (!confirm('Delete this shift?')) return;
    if (!user?.id) return;

    // Find the shift to get its type before deleting
    const shift = shifts.find(s => s.id === id);

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }

    // Log the shift deletion
    if (shift) {
      await logShiftDeleted(user.id, id, shift.shift_type);
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
            <button className="sidebar-close-btn" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">✕</button>
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
              <a href="/calendar" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                <span>Calendar</span>
              </a>
              <a href="/reports" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                <span>Reports</span>
              </a>
              <a href="/settings" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Settings size={18} /></span>
                <span>Settings</span>
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
                <a href="/admin-schedule-past" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                  <span>Past Schedule</span>
                </a>
                <a href="/payroll" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><DollarSign size={18} /></span>
                  <span>Payroll</span>
                </a>
                <a href="/payment-history" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><DollarSign size={18} /></span>
                  <span>Payment History</span>
                </a>
                <a href="/employees" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><User size={18} /></span>
                  <span>Employees</span>
                </a>
                <a href="/audit-logs" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><Shield size={18} /></span>
                  <span>Audit Logs</span>
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
                      <button
              className={`mobile-menu-toggle${mobileMenuOpen ? ' menu-open' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            ><span></span></button>
</header>

          <div className="app-content">
            {err && (
              <div className="alert-new alert-error-new">
                Error: {err}
              </div>
            )}

            {/* PROFILE COMPLETION PROMPT */}
            {showProfilePrompt && (!user?.phone || !user?.venmo_url) && (
              <div className="profile-completion-prompt">
                <AlertCircle size={24} style={{ flexShrink: 0 }} />
                <div className="profile-prompt-text">
                  <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
                    Complete Your Profile
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.95 }}>
                    {!user?.phone && !user?.venmo_url && 'Please add your phone number and Venmo username to receive payments.'}
                    {!user?.phone && user?.venmo_url && 'Please add your phone number to stay connected.'}
                    {user?.phone && !user?.venmo_url && 'Please add your Venmo username to receive payments.'}
                  </div>
                </div>
                <button
                  onClick={() => router.push('/settings')}
                  className="profile-prompt-settings-btn"
                >
                  Go to Settings
                </button>
                <button
                  onClick={() => setShowProfilePrompt(false)}
                  className="profile-prompt-dismiss-btn"
                  aria-label="Dismiss"
                >
                  <X size={20} />
                </button>
              </div>
            )}

            {/* STATS */}
            <div className="stat-mini-grid">
              <div className="stat-mini">
                <div className="stat-mini-icon yellow"><DollarSign size={20} /></div>
                <div>
                  <div className="stat-mini-value">${unpaidAllTime.toFixed(2)}</div>
                  <div className="stat-mini-label">Total Unpaid</div>
                </div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-icon purple"><BarChart3 size={20} /></div>
                <div>
                  <div className="stat-mini-value">{totals.count}</div>
                  <div className="stat-mini-label">Total Shifts</div>
                </div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-icon blue"><Clock size={20} /></div>
                <div>
                  <div className="stat-mini-value">{totals.hours.toFixed(1)}h</div>
                  <div className="stat-mini-label">Total Hours</div>
                </div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-icon green"><DollarSign size={20} /></div>
                <div>
                  <div className="stat-mini-value">${totals.pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="stat-mini-label">Total Pay</div>
                </div>
              </div>
            </div>

            {/* FILTERS */}
            <div className="filter-bar">
              <input
                type="text"
                className="filter-bar-search"
                placeholder="Search by date, type, or status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search shifts"
              />
              <div className="filter-bar-divider" />
              <select
                value={mode}
                onChange={e => { setMode(e.target.value as Mode); setOffset(0); }}
                aria-label="Select time range"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>
              {mode !== 'all' && (
                <div className="filter-bar-nav">
                  <button type="button" onClick={() => setOffset(n => n - 1)}>◀ Prev</button>
                  <button type="button" className="current-btn" onClick={() => setOffset(0)}>Current</button>
                  <button type="button" onClick={() => setOffset(n => n + 1)} disabled={offset >= 0}>Next ▶</button>
                  <span className="filter-bar-range-label">{range.label}</span>
                </div>
              )}
              {searchQuery && (
                <button type="button" className="filter-bar-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
              )}
            </div>

            {/* SHIFTS TABLE */}
            <div className="table-card">
              <div className="table-card-header">
                <span className="table-card-title">Shift History</span>
                <span className="table-card-count">
                  {loading ? '…' : `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'}`}
                </span>
              </div>

              {loading ? (
                <div className="table-empty">
                  <div className="table-empty-icon"><Clock size={40} /></div>
                  <div className="table-empty-title">Loading shifts...</div>
                  <div className="table-empty-sub">Please wait while we fetch your data</div>
                </div>
              ) : shifts.length === 0 ? (
                <div className="table-empty">
                  <div className="table-empty-icon"><BarChart3 size={40} /></div>
                  <div className="table-empty-title">No shifts in this range</div>
                  <div className="table-empty-sub">Log your first shift to get started!</div>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th className="col-hide-mobile">Time In</th>
                        <th className="col-hide-mobile">Time Out</th>
                        <th className="col-right">Hours</th>
                        <th className="col-right">Pay</th>
                        <th>Status</th>
                        <th className="col-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedShifts.map(s => {
                        const paid = Boolean(s.is_paid);
                        return (
                          <tr key={s.id}>
                            <td className="cell-primary">{s.shift_date}</td>
                            <td><span className="pill pill-type">{s.shift_type}</span></td>
                            <td className="col-hide-mobile">{s.time_in ? formatForDisplay(s.time_in, 'h:mm a') : '—'}</td>
                            <td className="col-hide-mobile">{s.time_out ? formatForDisplay(s.time_out, 'h:mm a') : '—'}</td>
                            <td className="col-right">{Number(s.hours_worked ?? 0).toFixed(1)}h</td>
                            <td className="col-right amount-green">${Number(s.pay_due ?? 0).toFixed(2)}</td>
                            <td>
                              {paid ? (
                                <span className="pill pill-paid">✓ Paid</span>
                              ) : (
                                <span className="pill pill-unpaid">Unpaid</span>
                              )}
                              {s.paid_at && (
                                <div className="cell-secondary">{formatForDisplay(s.paid_at, 'MMM d, yyyy')}</div>
                              )}
                            </td>
                            <td className="col-center">
                              <div className="btn-group">
                                <Link href={`/shift/${s.id}`} className="icon-btn icon-btn-edit" aria-label="Edit shift">✏️</Link>
                                <button type="button" className="icon-btn icon-btn-delete" onClick={() => delShift(s.id)} aria-label="Delete shift">🗑️</button>
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
