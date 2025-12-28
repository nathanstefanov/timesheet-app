// pages/payroll.tsx
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, LogOut, DollarSign, CheckCircle, RefreshCw, Settings } from 'lucide-react';

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
  admin_note?: string | null;
};

type EmployeePayroll = {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  venmo: string | null;
  shifts: Shift[];
  totalHours: number;
  totalPay: number;
};

type Profile = {
  id: string;
  role: 'admin' | 'employee';
  full_name?: string | null;
};

export default function Payroll() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; email: string | null; phone: string | null; venmo: string | null }>>({});
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        router.push('/');
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
    })();
  }, [router]);

  useEffect(() => {
    if (me) {
      loadPayroll();
    }
  }, [me]);

  async function loadPayroll() {
    setLoading(true);
    try {
      // Fetch all unpaid shifts
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('is_paid', false)
        .order('shift_date', { ascending: false });

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError);
        throw shiftsError;
      }

      console.log('Unpaid shifts loaded:', shiftsData?.length || 0);
      setShifts(shiftsData || []);

      // Get unique user IDs
      const userIds = [...new Set((shiftsData || []).map((s: Shift) => s.user_id))];
      console.log('Unique user IDs:', userIds.length);

      if (userIds.length > 0) {
        // Fetch profiles for all employees with unpaid shifts
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, phone, venmo_url')
          .in('id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          throw profilesError;
        }

        console.log('Profiles loaded:', profilesData?.length || 0);

        const profileMap: Record<string, { name: string; email: string | null; phone: string | null; venmo: string | null }> = {};
        (profilesData || []).forEach((p: any) => {
          profileMap[p.id] = {
            name: p.full_name || 'Unknown',
            email: null, // Email not stored in profiles table
            phone: p.phone || null,
            venmo: p.venmo_url || null,
          };
        });

        console.log('Profile map created:', Object.keys(profileMap).length);
        setProfiles(profileMap);
      }
    } catch (error) {
      console.error('Failed to load payroll:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredShifts = useMemo(() => {
    let result = shifts;

    // Date range filter
    if (startDate) {
      result = result.filter(s => s.shift_date >= startDate);
    }
    if (endDate) {
      result = result.filter(s => s.shift_date <= endDate);
    }

    return result;
  }, [shifts, startDate, endDate]);

  const employeePayrolls = useMemo(() => {
    const map = new Map<string, EmployeePayroll>();

    filteredShifts.forEach(shift => {
      if (!map.has(shift.user_id)) {
        const profile = profiles[shift.user_id] || { name: 'Unknown', email: null, phone: null, venmo: null };
        map.set(shift.user_id, {
          userId: shift.user_id,
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          venmo: profile.venmo,
          shifts: [],
          totalHours: 0,
          totalPay: 0,
        });
      }

      const emp = map.get(shift.user_id)!;
      emp.shifts.push(shift);
      emp.totalHours += shift.hours_worked || 0;
      emp.totalPay += shift.pay_due || 0;
    });

    let result = Array.from(map.values());

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(emp =>
        emp.name.toLowerCase().includes(q) ||
        emp.phone?.toLowerCase().includes(q) ||
        emp.venmo?.toLowerCase().includes(q)
      );
    }

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [filteredShifts, profiles, searchQuery]);

  function toggleEmployee(userId: string) {
    const newSelected = new Set(selectedEmployees);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
      // Also deselect all shifts for this employee
      const emp = employeePayrolls.find(e => e.userId === userId);
      if (emp) {
        emp.shifts.forEach(s => selectedShifts.delete(s.id));
        setSelectedShifts(new Set(selectedShifts));
      }
    } else {
      newSelected.add(userId);
      // Also select all shifts for this employee
      const emp = employeePayrolls.find(e => e.userId === userId);
      if (emp) {
        emp.shifts.forEach(s => selectedShifts.add(s.id));
        setSelectedShifts(new Set(selectedShifts));
      }
    }
    setSelectedEmployees(newSelected);
  }

  function toggleShift(shiftId: string, userId: string) {
    const newSelected = new Set(selectedShifts);
    if (newSelected.has(shiftId)) {
      newSelected.delete(shiftId);
    } else {
      newSelected.add(shiftId);
    }
    setSelectedShifts(newSelected);

    // Update employee selection status
    const emp = employeePayrolls.find(e => e.userId === userId);
    if (emp) {
      const allSelected = emp.shifts.every(s => newSelected.has(s.id));
      const newEmpSelected = new Set(selectedEmployees);
      if (allSelected) {
        newEmpSelected.add(userId);
      } else {
        newEmpSelected.delete(userId);
      }
      setSelectedEmployees(newEmpSelected);
    }
  }

  async function markAsPaid() {
    if (selectedShifts.size === 0) {
      alert('Please select shifts to mark as paid');
      return;
    }

    const count = selectedShifts.size;
    if (!confirm(`Mark ${count} shift${count > 1 ? 's' : ''} as paid?`)) {
      return;
    }

    setProcessing(true);
    try {
      const now = new Date().toISOString();
      const shiftIds = Array.from(selectedShifts);

      const { error } = await supabase
        .from('shifts')
        .update({
          is_paid: true,
          paid_at: now,
          paid_by: me?.id,
        })
        .in('id', shiftIds);

      if (error) throw error;

      // Remove paid shifts from the list
      setShifts(shifts.filter(s => !selectedShifts.has(s.id)));
      setSelectedShifts(new Set());
      setSelectedEmployees(new Set());

      alert(`Successfully marked ${count} shift${count > 1 ? 's' : ''} as paid!`);
    } catch (error: any) {
      console.error('Failed to mark shifts as paid:', error);
      alert(error.message || 'Failed to mark shifts as paid');
    } finally {
      setProcessing(false);
    }
  }

  function selectAll() {
    const allShiftIds = new Set(employeePayrolls.flatMap(emp => emp.shifts.map(s => s.id)));
    const allEmployeeIds = new Set(employeePayrolls.map(emp => emp.userId));
    setSelectedShifts(allShiftIds);
    setSelectedEmployees(allEmployeeIds);
  }

  function deselectAll() {
    setSelectedShifts(new Set());
    setSelectedEmployees(new Set());
  }

  function venmoLink(venmoUrl?: string | null): string | null {
    if (!venmoUrl) return null;
    const v = venmoUrl.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    const handle = v.startsWith('@') ? v.slice(1) : v;
    return `https://venmo.com/u/${encodeURIComponent(handle)}`;
  }

  const selectedTotal = useMemo(() => {
    return Array.from(selectedShifts).reduce((sum, shiftId) => {
      const shift = shifts.find(s => s.id === shiftId);
      return sum + (shift?.pay_due || 0);
    }, 0);
  }, [selectedShifts, shifts]);

  const selectedHours = useMemo(() => {
    return Array.from(selectedShifts).reduce((sum, shiftId) => {
      const shift = shifts.find(s => s.id === shiftId);
      return sum + (shift?.hours_worked || 0);
    }, 0);
  }, [selectedShifts, shifts]);

  if (!me) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Payroll - Admin</title>
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
              <a href="/settings" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Settings size={18} /></span>
                <span>Settings</span>
              </a>
            </div>

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
              <a href="/payroll" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
                <h1 className="header-title">Payroll Processing</h1>
                <p className="header-subtitle">Review and process employee payments</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={loadPayroll}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
            </div>
          </header>

          <div className="app-content">
            {/* FILTERS */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
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
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
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
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Search Employees
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Name or phone..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SUMMARY BAR */}
            {selectedShifts.size > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Selected Shifts</div>
                    <div style={{ fontSize: '24px', fontWeight: 600 }}>{selectedShifts.size}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Total Hours</div>
                    <div style={{ fontSize: '24px', fontWeight: 600 }}>{selectedHours.toFixed(1)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Total Amount</div>
                    <div style={{ fontSize: '24px', fontWeight: 600 }}>${selectedTotal.toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={deselectAll}
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(255,255,255,0.2)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={markAsPaid}
                    disabled={processing}
                    style={{
                      padding: '10px 20px',
                      background: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#667eea',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <CheckCircle size={18} />
                    {processing ? 'Processing...' : 'Mark as Paid'}
                  </button>
                </div>
              </div>
            )}

            {/* BULK ACTIONS */}
            {employeePayrolls.length > 0 && selectedShifts.size === 0 && (
              <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                <button
                  onClick={selectAll}
                  style={{
                    padding: '8px 16px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  Select All
                </button>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                Loading payroll data...
              </div>
            )}

            {!loading && employeePayrolls.length === 0 && (
              <div style={{
                padding: '60px 20px',
                textAlign: 'center',
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
                <div style={{ color: '#64748b', fontSize: '16px', marginBottom: '8px' }}>No unpaid shifts found</div>
                <div style={{ color: '#94a3b8', fontSize: '14px' }}>All employees have been paid!</div>
              </div>
            )}

            {/* EMPLOYEE PAYROLL LIST */}
            {employeePayrolls.map((emp) => {
              const isSelected = selectedEmployees.has(emp.userId);
              const vLink = venmoLink(emp.venmo);

              return (
                <div
                  key={emp.userId}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: `2px solid ${isSelected ? '#667eea' : '#e2e8f0'}`,
                    marginBottom: '16px',
                    overflow: 'hidden'
                  }}
                >
                  {/* Employee Header */}
                  <div
                    style={{
                      padding: '16px 20px',
                      background: isSelected ? '#f0f4ff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleEmployee(emp.userId)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                          {emp.name}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                          {emp.phone || 'No phone number'}
                          {emp.venmo && ` • ${emp.venmo}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>
                          {emp.shifts.length} shift{emp.shifts.length > 1 ? 's' : ''} • {emp.totalHours.toFixed(1)} hrs
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#10b981' }}>
                          ${emp.totalPay.toFixed(2)}
                        </div>
                      </div>
                      {vLink && (
                        <a
                          href={vLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '8px 16px',
                            background: '#00D9FF',
                            color: 'white',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontSize: '14px',
                            fontWeight: 600
                          }}
                        >
                          Pay on Venmo
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Shifts Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', width: '40px' }}></th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>DATE</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>TYPE</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>HOURS</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>PAY</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>NOTES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emp.shifts.map((shift) => {
                          const isShiftSelected = selectedShifts.has(shift.id);
                          return (
                            <tr
                              key={shift.id}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: isShiftSelected ? '#fefce8' : 'white'
                              }}
                            >
                              <td style={{ padding: '12px' }}>
                                <input
                                  type="checkbox"
                                  checked={isShiftSelected}
                                  onChange={() => toggleShift(shift.id, emp.userId)}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '12px', fontSize: '14px', color: '#334155' }}>
                                {new Date(shift.shift_date).toLocaleDateString()}
                              </td>
                              <td style={{ padding: '12px', fontSize: '14px', color: '#334155' }}>
                                {shift.shift_type}
                              </td>
                              <td style={{ padding: '12px', fontSize: '14px', color: '#334155' }}>
                                {shift.hours_worked?.toFixed(1) || '0.0'}
                              </td>
                              <td style={{ padding: '12px', fontSize: '14px', fontWeight: 600, color: '#10b981' }}>
                                ${(shift.pay_due || 0).toFixed(2)}
                              </td>
                              <td style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>
                                {shift.admin_note || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </>
  );
}
