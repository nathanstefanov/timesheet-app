// pages/admin-modern.tsx
/**
 * MODERN ADMIN DASHBOARD - Complete Redesign
 *
 * Features:
 * - Clean, modern interface
 * - Stats dashboard with key metrics
 * - Advanced filtering and search
 * - Card-based table design
 * - Responsive layout
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';

type Tab = 'unpaid' | 'paid' | 'all';
type Profile = { id: string; role: 'admin' | 'employee' } | null;

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
};

export default function AdminModern() {
  const router = useRouter();

  // Auth
  const [me, setMe] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);

  // Data
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  // UI State
  const [tab, setTab] = useState<Tab>('unpaid');
  const [searchQuery, setSearchQuery] = useState('');

  // Auth check
  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;

      if (error || !data?.session?.user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (!alive) return;

      if (!profile || profile.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setMe({ id: profile.id, role: profile.role });
      setChecking(false);
    }

    checkAuth();
    return () => { alive = false; };
  }, [router]);

  // Load shifts
  useEffect(() => {
    if (!me) return;

    async function loadShifts() {
      setLoading(true);
      setErr(undefined);

      try {
        // Fetch shifts
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('shifts')
          .select('*')
          .order('shift_date', { ascending: false });

        if (shiftsError) throw shiftsError;

        // Fetch user names
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name');

        if (profilesError) throw profilesError;

        const nameMap: Record<string, string> = {};
        (profilesData || []).forEach(p => {
          nameMap[p.id] = p.full_name || 'Unknown';
        });

        setShifts(shiftsData || []);
        setNames(nameMap);
      } catch (error: any) {
        setErr(error.message);
      } finally {
        setLoading(false);
      }
    }

    loadShifts();
  }, [me]);

  // Filter shifts
  const filteredShifts = useMemo(() => {
    let result = shifts;

    // Filter by tab
    if (tab === 'unpaid') {
      result = result.filter(s => !s.is_paid);
    } else if (tab === 'paid') {
      result = result.filter(s => s.is_paid);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => {
        const name = names[s.user_id]?.toLowerCase() || '';
        const type = s.shift_type?.toLowerCase() || '';
        const date = s.shift_date?.toLowerCase() || '';
        return name.includes(query) || type.includes(query) || date.includes(query);
      });
    }

    return result;
  }, [shifts, tab, searchQuery, names]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = shifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
    const totalPay = shifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const unpaidPay = shifts
      .filter(s => !s.is_paid)
      .reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const flaggedCount = shifts.filter(s => s.admin_flag).length;

    return {
      totalShifts: shifts.length,
      totalHours: totalHours.toFixed(1),
      totalPay: totalPay.toFixed(2),
      unpaidPay: unpaidPay.toFixed(2),
      flaggedCount,
    };
  }, [shifts]);

  // Group by employee
  const employeeTotals = useMemo(() => {
    const map = new Map<string, TotalRow>();

    filteredShifts.forEach(s => {
      const existing = map.get(s.user_id);
      const hours = s.hours_worked || 0;
      const pay = s.pay_due || 0;
      const unpaid = s.is_paid ? 0 : pay;

      if (existing) {
        existing.hours += hours;
        existing.pay += pay;
        existing.unpaid += unpaid;
      } else {
        map.set(s.user_id, {
          id: s.user_id,
          name: names[s.user_id] || 'Unknown',
          hours,
          pay,
          unpaid,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredShifts, names]);

  // Mark as paid handler
  const handleMarkAsPaid = async (shiftId: string) => {
    if (!confirm('Mark this shift as paid?')) return;

    const { error } = await supabase
      .from('shifts')
      .update({ is_paid: true, paid_at: new Date().toISOString(), paid_by: me?.id })
      .eq('id', shiftId);

    if (error) {
      alert(error.message);
    } else {
      setShifts(prev => prev.map(s =>
        s.id === shiftId
          ? { ...s, is_paid: true, paid_at: new Date().toISOString(), paid_by: me?.id }
          : s
      ));
    }
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Admin Dashboard - Timesheet</title>
        <link rel="stylesheet" href="/styles/modern-theme.css" />
      </Head>

      <div className="dashboard">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar__logo">
            <div className="sidebar__logo-icon">T</div>
            <div className="sidebar__logo-text">Timesheet</div>
          </div>

          <nav className="sidebar__nav">
            <a href="/admin-modern" className="sidebar__link sidebar__link--active">
              <span className="sidebar__link-icon">📊</span>
              <span>Dashboard</span>
            </a>
            <a href="/admin-schedule" className="sidebar__link">
              <span className="sidebar__link-icon">📅</span>
              <span>Schedule</span>
            </a>
            <a href="/admin" className="sidebar__link">
              <span className="sidebar__link-icon">👥</span>
              <span>Employees</span>
            </a>
            <a href="/dashboard" className="sidebar__link">
              <span className="sidebar__link-icon">🏠</span>
              <span>My Dashboard</span>
            </a>
            <a href="/api/auth/logout" className="sidebar__link">
              <span className="sidebar__link-icon">🚪</span>
              <span>Logout</span>
            </a>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header__top">
              <div>
                <h1 className="page-header__title">Admin Dashboard</h1>
                <p className="page-header__subtitle">
                  Manage employee shifts and payroll
                </p>
              </div>

              <div className="page-header__actions">
                <button className="btn btn-secondary">Export</button>
                <button className="btn btn-primary">+ New Shift</button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-card__label">Total Shifts</div>
                <div className="stat-card__value">{stats.totalShifts}</div>
                <div className="stat-card__change text-muted">All time</div>
              </div>

              <div className="stat-card">
                <div className="stat-card__label">Total Hours</div>
                <div className="stat-card__value">{stats.totalHours}</div>
                <div className="stat-card__change text-muted">Across all employees</div>
              </div>

              <div className="stat-card">
                <div className="stat-card__label">Total Pay</div>
                <div className="stat-card__value">${stats.totalPay}</div>
                <div className="stat-card__change text-muted">All shifts</div>
              </div>

              <div className="stat-card">
                <div className="stat-card__label">Unpaid</div>
                <div className="stat-card__value" style={{ color: 'var(--color-warning)' }}>
                  ${stats.unpaidPay}
                </div>
                <div className="stat-card__change text-muted">Pending payment</div>
              </div>

              {stats.flaggedCount > 0 && (
                <div className="stat-card">
                  <div className="stat-card__label">Flagged</div>
                  <div className="stat-card__value" style={{ color: 'var(--color-danger)' }}>
                    {stats.flaggedCount}
                  </div>
                  <div className="stat-card__change text-muted">Needs attention</div>
                </div>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="search-input">
              <span className="search-input__icon">🔍</span>
              <input
                type="text"
                className="search-input__field"
                placeholder="Search by name, type, or date..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-tabs">
              <button
                className={`filter-tabs__tab ${tab === 'unpaid' ? 'filter-tabs__tab--active' : ''}`}
                onClick={() => setTab('unpaid')}
              >
                Unpaid ({shifts.filter(s => !s.is_paid).length})
              </button>
              <button
                className={`filter-tabs__tab ${tab === 'paid' ? 'filter-tabs__tab--active' : ''}`}
                onClick={() => setTab('paid')}
              >
                Paid ({shifts.filter(s => s.is_paid).length})
              </button>
              <button
                className={`filter-tabs__tab ${tab === 'all' ? 'filter-tabs__tab--active' : ''}`}
                onClick={() => setTab('all')}
              >
                All ({shifts.length})
              </button>
            </div>
          </div>

          {/* Error */}
          {err && (
            <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)' }}>
              <p style={{ color: 'var(--color-danger)', margin: 0 }}>{err}</p>
            </div>
          )}

          {/* Employee Summary Table */}
          {!loading && employeeTotals.length > 0 && (
            <div className="table-container" style={{ marginBottom: 'var(--space-8)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th style={{ textAlign: 'right' }}>Hours</th>
                    <th style={{ textAlign: 'right' }}>Total Pay</th>
                    <th style={{ textAlign: 'right' }}>Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeTotals.map(emp => (
                    <tr key={emp.id}>
                      <td>
                        <div style={{ fontWeight: 'var(--font-medium)' }}>{emp.name}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {emp.hours.toFixed(1)} hrs
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        ${emp.pay.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {emp.unpaid > 0 ? (
                          <span style={{ color: 'var(--color-warning)', fontWeight: 'var(--font-semibold)' }}>
                            ${emp.unpaid.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>$0.00</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Shifts Details Table */}
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Shift Details</h2>
                <p className="card__subtitle">{filteredShifts.length} shifts</p>
              </div>
            </div>

            {loading ? (
              <div className="card__body">
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading shifts...</p>
              </div>
            ) : filteredShifts.length === 0 ? (
              <div className="card__body">
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No shifts found</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Hours</th>
                      <th style={{ textAlign: 'right' }}>Pay</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShifts.map(shift => (
                      <tr key={shift.id}>
                        <td>
                          <div style={{ fontWeight: 'var(--font-medium)' }}>
                            {names[shift.user_id] || 'Unknown'}
                          </div>
                        </td>
                        <td>{shift.shift_date}</td>
                        <td>
                          <span className="badge badge-neutral">
                            {shift.shift_type}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {(shift.hours_worked || 0).toFixed(1)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-semibold)' }}>
                          ${(shift.pay_due || 0).toFixed(2)}
                        </td>
                        <td>
                          {shift.is_paid ? (
                            <span className="badge badge-success badge--dot">Paid</span>
                          ) : (
                            <span className="badge badge-warning badge--dot">Unpaid</span>
                          )}
                        </td>
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            {!shift.is_paid && (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => handleMarkAsPaid(shift.id)}
                              >
                                Mark Paid
                              </button>
                            )}
                            <button className="btn btn-sm btn-ghost">Edit</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
