// pages/admin-new.tsx
/**
 * BRAND NEW ADMIN DASHBOARD
 * Completely fresh design with sidebar navigation
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';

type Tab = 'unpaid' | 'paid' | 'all';

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
  admin_flag?: boolean | null;
};

export default function AdminNew() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('unpaid');

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

  // Load shifts
  useEffect(() => {
    if (!me) return;

    async function loadShifts() {
      setLoading(true);
      try {
        const { data: shiftsData } = await supabase
          .from('shifts')
          .select('*')
          .order('shift_date', { ascending: false });

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name');

        const nameMap: Record<string, string> = {};
        (profilesData || []).forEach(p => {
          nameMap[p.id] = p.full_name || 'Unknown';
        });

        setShifts(shiftsData || []);
        setNames(nameMap);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadShifts();
  }, [me]);

  // Filter shifts
  const filteredShifts = useMemo(() => {
    if (tab === 'unpaid') return shifts.filter(s => !s.is_paid);
    if (tab === 'paid') return shifts.filter(s => s.is_paid);
    return shifts;
  }, [shifts, tab]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = shifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
    const totalPay = shifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const unpaidPay = shifts
      .filter(s => !s.is_paid)
      .reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const unpaidCount = shifts.filter(s => !s.is_paid).length;

    return {
      totalShifts: shifts.length,
      totalHours: totalHours.toFixed(1),
      totalPay: totalPay.toFixed(2),
      unpaidPay: unpaidPay.toFixed(2),
      unpaidCount,
    };
  }, [shifts]);

  // Mark as paid
  const handleMarkPaid = async (shiftId: string) => {
    if (!confirm('Mark this shift as paid?')) return;

    const { error } = await supabase
      .from('shifts')
      .update({ is_paid: true, paid_at: new Date().toISOString(), paid_by: me?.id })
      .eq('id', shiftId);

    if (!error) {
      setShifts(prev => prev.map(s =>
        s.id === shiftId
          ? { ...s, is_paid: true, paid_at: new Date().toISOString() }
          : s
      ));
    }
  };

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
              <a href="/admin-new" className="sidebar-nav-item active">
                <span className="sidebar-nav-icon">📊</span>
                <span>Dashboard</span>
              </a>
              <a href="/admin-schedule" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">📅</span>
                <span>Schedule</span>
              </a>
              <a href="/dashboard" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">👤</span>
                <span>My Shifts</span>
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
                <button className="btn-new btn-primary-new">+ New Shift</button>
              </div>
            </div>
          </header>

          <div className="app-content">
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
                <div className="stat-card-change">All time</div>
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
                    <div className="stat-card-label">Total Pay</div>
                  </div>
                  <div className="stat-card-icon">💵</div>
                </div>
                <div className="stat-card-value">${stats.totalPay}</div>
                <div className="stat-card-change">All shifts</div>
              </div>
            </div>

            {/* DATA TABLE */}
            <div className="data-table-container">
              <div className="data-table-header">
                <h2 className="data-table-title">Recent Shifts</h2>
                <div className="data-table-filters">
                  <div className="tabs-new">
                    <button
                      className={`tab-new ${tab === 'unpaid' ? 'active' : ''}`}
                      onClick={() => setTab('unpaid')}
                    >
                      Unpaid ({shifts.filter(s => !s.is_paid).length})
                    </button>
                    <button
                      className={`tab-new ${tab === 'paid' ? 'active' : ''}`}
                      onClick={() => setTab('paid')}
                    >
                      Paid ({shifts.filter(s => s.is_paid).length})
                    </button>
                    <button
                      className={`tab-new ${tab === 'all' ? 'active' : ''}`}
                      onClick={() => setTab('all')}
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
              ) : filteredShifts.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  No shifts found
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Hours</th>
                      <th>Pay</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShifts.slice(0, 20).map(shift => (
                      <tr key={shift.id}>
                        <td style={{ fontWeight: 600 }}>{names[shift.user_id] || 'Unknown'}</td>
                        <td>{shift.shift_date}</td>
                        <td>
                          <span className="badge-new badge-neutral-new">
                            {shift.shift_type}
                          </span>
                        </td>
                        <td>{(shift.hours_worked || 0).toFixed(1)} hrs</td>
                        <td style={{ fontWeight: 600 }}>${(shift.pay_due || 0).toFixed(2)}</td>
                        <td>
                          {shift.is_paid ? (
                            <span className="badge-new badge-success-new">Paid</span>
                          ) : (
                            <span className="badge-new badge-warning-new">Unpaid</span>
                          )}
                        </td>
                        <td>
                          {!shift.is_paid && (
                            <button
                              className="btn-new btn-sm-new btn-success-new"
                              onClick={() => handleMarkPaid(shift.id)}
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
