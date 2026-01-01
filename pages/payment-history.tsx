// pages/payment-history.tsx
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Calendar, BarChart3, LogOut, Settings, DollarSign, Download, Search, X, RotateCcw, Filter } from 'lucide-react';
import { useToast } from '../hooks/useToast';

type PaidShift = {
  id: string;
  user_id: string;
  shift_date: string;
  shift_type: string;
  time_in?: string | null;
  time_out?: string | null;
  hours_worked?: number | null;
  pay_due?: number | null;
  is_paid: boolean;
  paid_at: string;
  admin_note?: string | null;
  employee_name: string;
  employee_email: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'employee';
};

export default function PaymentHistory() {
  const router = useRouter();
  const { success, error } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<PaidShift[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminSectionExpanded, setAdminSectionExpanded] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadPaidShifts();
    }
  }, [profile]);

  async function loadProfile() {
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

      if (profileData.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      setProfile(profileData);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function loadPaidShifts() {
    try {
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('is_paid', true)
        .order('shift_date', { ascending: false });

      if (shiftsError) {
        console.error('Error fetching paid shifts:', shiftsError);
        throw shiftsError;
      }

      console.log('Payment History - Raw shifts data:', shiftsData);
      console.log('Payment History - Number of paid shifts:', shiftsData?.length || 0);

      // If no shifts, set empty array and return
      if (!shiftsData || shiftsData.length === 0) {
        setShifts([]);
        return;
      }

      // Get employee names
      const userIds = [...new Set(shiftsData.map(s => s.user_id))];

      // Only query profiles if we have user IDs
      if (userIds.length === 0) {
        setShifts([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, Email')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }

      const profileMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = { name: p.full_name || 'Unknown', email: (p as any).Email };
        return acc;
      }, {} as Record<string, { name: string; email: string | null }>);

      const enrichedShifts = shiftsData.map(shift => ({
        ...shift,
        employee_name: profileMap[shift.user_id]?.name || 'Unknown',
        employee_email: profileMap[shift.user_id]?.email || null,
      }));

      setShifts(enrichedShifts);
    } catch (err: any) {
      console.error('Failed to load paid shifts:', err);
      error('Failed to load payment history');
    }
  }

  async function handleUndoPayment(shiftId: string, employeeName: string) {
    if (!confirm(`Are you sure you want to undo payment for ${employeeName}? This will mark the shift as unpaid.`)) {
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('shifts')
        .update({
          is_paid: false,
          paid_at: null,
        })
        .eq('id', shiftId);

      if (updateError) throw updateError;

      success('Payment undone successfully!');
      await loadPaidShifts();
    } catch (err: any) {
      console.error('Failed to undo payment:', err);
      error(err.message || 'Failed to undo payment');
    }
  }

  function exportToCSV() {
    const headers = ['Employee Name', 'Email', 'Date', 'Shift Type', 'Hours', 'Pay Amount', 'Paid At', 'Notes'];
    const rows = filteredShifts.map(shift => [
      shift.employee_name,
      shift.employee_email || '',
      shift.shift_date,
      shift.shift_type,
      shift.hours_worked?.toFixed(2) || '0.00',
      `$${(shift.pay_due || 0).toFixed(2)}`,
      shift.paid_at ? new Date(shift.paid_at).toLocaleString() : 'Not recorded',
      shift.admin_note || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    success('Payment history exported to CSV!');
  }

  const filteredShifts = useMemo(() => {
    return shifts.filter(shift => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = shift.employee_name.toLowerCase().includes(query);
        const matchesEmail = shift.employee_email?.toLowerCase().includes(query);
        const matchesType = shift.shift_type.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesType) return false;
      }

      // Employee filter
      if (selectedEmployee && shift.user_id !== selectedEmployee) {
        return false;
      }

      // Date range filter
      if (startDate && shift.shift_date < startDate) return false;
      if (endDate && shift.shift_date > endDate) return false;

      return true;
    });
  }, [shifts, searchQuery, selectedEmployee, startDate, endDate]);

  const totalPaid = useMemo(() => {
    return filteredShifts.reduce((sum, shift) => sum + (shift.pay_due || 0), 0);
  }, [filteredShifts]);

  const uniqueEmployees = useMemo(() => {
    const employees = shifts.reduce((acc, shift) => {
      if (!acc.find(e => e.id === shift.user_id)) {
        acc.push({ id: shift.user_id, name: shift.employee_name });
      }
      return acc;
    }, [] as { id: string; name: string }[]);
    return employees.sort((a, b) => a.name.localeCompare(b.name));
  }, [shifts]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading || !profile) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Payment History - Timesheet</title>
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
                <span className="sidebar-nav-icon">+</span>
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

            <div className="sidebar-nav-section">
              <div
                className="sidebar-nav-label"
                onClick={() => setAdminSectionExpanded(!adminSectionExpanded)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>Admin</span>
                <span style={{ fontSize: '12px', transition: 'transform 0.2s', transform: adminSectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {adminSectionExpanded && (
                <>
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
                  <a href="/payment-history" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
                    <span className="sidebar-nav-icon"><DollarSign size={18} /></span>
                    <span>Payment History</span>
                  </a>
                  <a href="/employees" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                    <span className="sidebar-nav-icon"><User size={18} /></span>
                    <span>Employees</span>
                  </a>
                </>
              )}
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {profile.full_name?.charAt(0) || 'A'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{profile.full_name || 'Admin'}</div>
                <div className="sidebar-user-role">Administrator</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="app-main">
          <header className="app-header">
            <div>
              <h1 className="header-title">Payment History</h1>
              <p className="header-subtitle">View all completed payments and export records</p>
            </div>
            <button
              onClick={exportToCSV}
              disabled={filteredShifts.length === 0}
              style={{
                padding: '10px 20px',
                background: filteredShifts.length === 0 ? '#94a3b8' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: filteredShifts.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              <Download size={18} />
              Export to CSV
            </button>
          </header>

          <div className="app-content">
            {/* STATS CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '20px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>
                  Total Payments
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>
                  {filteredShifts.length}
                </div>
              </div>
              <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '20px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>
                  Total Amount Paid
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>
                  ${totalPaid.toFixed(2)}
                </div>
              </div>
            </div>

            {/* FILTERS */}
            <div style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Filter size={18} style={{ color: '#64748b' }} />
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Filters</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                {/* Search */}
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Search
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Name, email, or shift type..."
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 38px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                    />
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '8px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          color: '#64748b',
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Employee Filter */}
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Employee
                  </label>
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">All Employees</option>
                    {uniqueEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* End Date */}
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              {(searchQuery || selectedEmployee || startDate || endDate) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedEmployee('');
                    setStartDate('');
                    setEndDate('');
                  }}
                  style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                  }}
                >
                  Clear All Filters
                </button>
              )}
            </div>

            {/* PAYMENTS TABLE */}
            <div style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              {filteredShifts.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <DollarSign size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                    No payment records found
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '14px' }}>
                    {shifts.length === 0 ? 'No payments have been made yet' : 'Try adjusting your filters'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Employee</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Shift Type</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Hours</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Amount</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Paid At</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShifts.map((shift) => (
                        <tr key={shift.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontWeight: 500, color: '#1e293b' }}>{shift.employee_name}</div>
                            {shift.employee_email && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>{shift.employee_email}</div>
                            )}
                          </td>
                          <td style={{ padding: '16px', color: '#475569' }}>
                            {new Date(shift.shift_date).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 500,
                              background: '#f1f5f9',
                              color: '#475569',
                            }}>
                              {shift.shift_type}
                            </span>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: '#475569' }}>
                            {shift.hours_worked?.toFixed(2) || '0.00'}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                            ${(shift.pay_due || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                            {shift.paid_at ? new Date(shift.paid_at).toLocaleString() : 'Not recorded'}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleUndoPayment(shift.id, shift.employee_name)}
                              style={{
                                padding: '8px',
                                background: '#fee2e2',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: '#991b1b',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Undo Payment"
                            >
                              <RotateCcw size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
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
