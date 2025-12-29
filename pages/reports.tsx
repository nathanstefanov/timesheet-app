// pages/reports.tsx
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, LogOut, Settings, DollarSign, TrendingUp, Clock, Users, PieChart } from 'lucide-react';

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
  pay_rate?: number | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'employee';
};

type EmployeeStats = {
  id: string;
  name: string;
  totalHours: number;
  totalPay: number;
  paidAmount: number;
  unpaidAmount: number;
  shiftCount: number;
};

export default function Reports() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [allProfiles, setAllProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year' | 'all'>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;

      setProfile(profileData as Profile);

      // Fetch shifts based on role
      let shiftsQuery = supabase
        .from('shifts')
        .select('*')
        .order('shift_date', { ascending: false });

      if (profileData.role !== 'admin') {
        shiftsQuery = shiftsQuery.eq('user_id', session.user.id);
      }

      const { data: shiftsData, error: shiftsError } = await shiftsQuery;
      if (shiftsError) throw shiftsError;

      setShifts(shiftsData || []);

      // If admin, fetch all profiles for names
      if (profileData.role === 'admin') {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name');

        const profileMap: Record<string, string> = {};
        (profilesData || []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || 'Unknown';
        });
        setAllProfiles(profileMap);
      }
    } catch (error: any) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter shifts by date range
  const filteredShifts = useMemo(() => {
    if (dateRange === 'all') return shifts;

    const now = new Date();
    const cutoff = new Date();

    switch (dateRange) {
      case 'week':
        cutoff.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        cutoff.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
    }

    return shifts.filter(s => new Date(s.shift_date) >= cutoff);
  }, [shifts, dateRange]);

  // Personal stats (for employees)
  const personalStats = useMemo(() => {
    const totalHours = filteredShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
    const totalPay = filteredShifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const paidShifts = filteredShifts.filter(s => s.is_paid);
    const unpaidShifts = filteredShifts.filter(s => !s.is_paid);
    const paidAmount = paidShifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);
    const unpaidAmount = unpaidShifts.reduce((sum, s) => sum + (s.pay_due || 0), 0);

    // By shift type
    const byType: Record<string, { hours: number; pay: number; count: number }> = {};
    filteredShifts.forEach(s => {
      if (!byType[s.shift_type]) {
        byType[s.shift_type] = { hours: 0, pay: 0, count: 0 };
      }
      byType[s.shift_type].hours += s.hours_worked || 0;
      byType[s.shift_type].pay += s.pay_due || 0;
      byType[s.shift_type].count += 1;
    });

    return {
      totalHours,
      totalPay,
      paidAmount,
      unpaidAmount,
      paidCount: paidShifts.length,
      unpaidCount: unpaidShifts.length,
      avgHoursPerShift: filteredShifts.length > 0 ? totalHours / filteredShifts.length : 0,
      avgPayPerShift: filteredShifts.length > 0 ? totalPay / filteredShifts.length : 0,
      byType,
    };
  }, [filteredShifts]);

  // Admin stats (for admins)
  const adminStats = useMemo(() => {
    if (profile?.role !== 'admin') return null;

    const employeeMap: Record<string, EmployeeStats> = {};

    filteredShifts.forEach(s => {
      if (!employeeMap[s.user_id]) {
        employeeMap[s.user_id] = {
          id: s.user_id,
          name: allProfiles[s.user_id] || 'Unknown',
          totalHours: 0,
          totalPay: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          shiftCount: 0,
        };
      }

      const emp = employeeMap[s.user_id];
      emp.totalHours += s.hours_worked || 0;
      emp.totalPay += s.pay_due || 0;
      emp.shiftCount += 1;

      if (s.is_paid) {
        emp.paidAmount += s.pay_due || 0;
      } else {
        emp.unpaidAmount += s.pay_due || 0;
      }
    });

    const employees = Object.values(employeeMap).sort((a, b) => b.totalPay - a.totalPay);

    return {
      totalLaborCost: filteredShifts.reduce((sum, s) => sum + (s.pay_due || 0), 0),
      totalHours: filteredShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0),
      totalShifts: filteredShifts.length,
      activeEmployees: employees.length,
      averagePayPerEmployee: employees.length > 0 ? employees.reduce((sum, e) => sum + e.totalPay, 0) / employees.length : 0,
      averageHoursPerEmployee: employees.length > 0 ? employees.reduce((sum, e) => sum + e.totalHours, 0) / employees.length : 0,
      employees,
    };
  }, [filteredShifts, profile, allProfiles]);

  if (loading || !profile) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ color: '#64748b' }}>Loading...</div>
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';

  return (
    <>
      <Head>
        <title>Reports & Analytics - Timesheet</title>
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
              <a href="/calendar" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                <span>Calendar</span>
              </a>
              <a href="/reports" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                <span>Reports</span>
              </a>
              <a href="/settings" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Settings size={18} /></span>
                <span>Settings</span>
              </a>
            </div>

            {isAdmin && (
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
                <a href="/employees" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="sidebar-nav-icon"><User size={18} /></span>
                  <span>Employees</span>
                </a>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {profile.full_name?.charAt(0) || 'U'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{profile.full_name || 'User'}</div>
                <div className="sidebar-user-role">{isAdmin ? 'Administrator' : 'Employee'}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/';
            }}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="app-main">
          <header className="app-header">
            <div className="header-content">
              <div>
                <h1 className="header-title">Reports & Analytics</h1>
                <p className="header-subtitle">
                  {isAdmin ? 'Team performance and labor cost insights' : 'Your earnings and work history'}
                </p>
              </div>
              <div>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as any)}
                  style={{
                    padding: '10px 16px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last Month</option>
                  <option value="quarter">Last 3 Months</option>
                  <option value="year">Last Year</option>
                  <option value="all">All Time</option>
                </select>
              </div>
            </div>
          </header>

          <div className="app-content">
            {!isAdmin ? (
              // EMPLOYEE VIEW
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '24px',
                    borderRadius: '12px',
                    color: 'white',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <DollarSign size={24} />
                      <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Earnings</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700 }}>${personalStats.totalPay.toFixed(2)}</div>
                    <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
                      ${personalStats.avgPayPerShift.toFixed(2)} avg per shift
                    </div>
                  </div>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <Clock size={24} style={{ color: '#667eea' }} />
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Total Hours</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>{personalStats.totalHours.toFixed(1)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      {personalStats.avgHoursPerShift.toFixed(1)} avg per shift
                    </div>
                  </div>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <TrendingUp size={24} style={{ color: '#10b981' }} />
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Paid</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>${personalStats.paidAmount.toFixed(2)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      {personalStats.paidCount} shifts
                    </div>
                  </div>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <Clock size={24} style={{ color: '#f59e0b' }} />
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Pending</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>${personalStats.unpaidAmount.toFixed(2)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      {personalStats.unpaidCount} shifts
                    </div>
                  </div>
                </div>

                {/* Breakdown by Shift Type */}
                <div style={{
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  padding: '24px',
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '20px' }}>
                    Breakdown by Shift Type
                  </h2>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {Object.entries(personalStats.byType).map(([type, data]) => (
                      <div
                        key={type}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '16px',
                          background: '#f8fafc',
                          borderRadius: '8px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{type}</div>
                          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                            {data.count} shifts • {data.hours.toFixed(1)} hours
                          </div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#667eea' }}>
                          ${data.pay.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              // ADMIN VIEW
              <>
                {/* Admin Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '24px',
                    borderRadius: '12px',
                    color: 'white',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <DollarSign size={24} />
                      <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Labor Cost</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700 }}>${adminStats!.totalLaborCost.toFixed(2)}</div>
                    <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
                      {adminStats!.totalShifts} shifts
                    </div>
                  </div>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <Users size={24} style={{ color: '#667eea' }} />
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Active Employees</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>{adminStats!.activeEmployees}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      ${adminStats!.averagePayPerEmployee.toFixed(2)} avg per employee
                    </div>
                  </div>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <Clock size={24} style={{ color: '#10b981' }} />
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Total Hours</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>{adminStats!.totalHours.toFixed(1)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      {adminStats!.averageHoursPerEmployee.toFixed(1)} avg per employee
                    </div>
                  </div>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <TrendingUp size={24} style={{ color: '#f59e0b' }} />
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Avg Cost/Shift</div>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>
                      ${adminStats!.totalShifts > 0 ? (adminStats!.totalLaborCost / adminStats!.totalShifts).toFixed(2) : '0.00'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      Across all employees
                    </div>
                  </div>
                </div>

                {/* Employee Performance Table */}
                <div style={{
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                      Employee Performance
                    </h2>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>EMPLOYEE</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: '14px' }}>SHIFTS</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: '14px' }}>HOURS</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: '14px' }}>TOTAL PAY</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: '14px' }}>PAID</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: '14px' }}>PENDING</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminStats!.employees.map((emp) => (
                          <tr key={emp.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155', fontWeight: 500 }}>
                              {emp.name}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155', textAlign: 'right' }}>
                              {emp.shiftCount}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155', textAlign: 'right' }}>
                              {emp.totalHours.toFixed(1)}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155', textAlign: 'right', fontWeight: 600 }}>
                              ${emp.totalPay.toFixed(2)}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#10b981', textAlign: 'right', fontWeight: 500 }}>
                              ${emp.paidAmount.toFixed(2)}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#f59e0b', textAlign: 'right', fontWeight: 500 }}>
                              ${emp.unpaidAmount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
