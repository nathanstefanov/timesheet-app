// pages/employees.tsx
/**
 * EMPLOYEE MANAGEMENT - Admin page to manage all employees
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, DollarSign, LogOut, Settings, Search, Edit2, UserX, UserCheck, Mail, Phone, X } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'admin' | 'employee';
  phone?: string | null;
  venmo_url?: string | null;
  pay_rate?: number | null;
  is_active?: boolean;
  created_at?: string;
};

type Employee = Profile & {
  email: string | null;
};

export default function Employees() {
  const router = useRouter();
  const { toasts, closeToast, success, error } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'employee'>('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields for add employee
  const [newEmail, setNewEmail] = useState('');
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newVenmo, setNewVenmo] = useState('');
  const [newPayRate, setNewPayRate] = useState('25');
  const [newRole, setNewRole] = useState<'admin' | 'employee'>('employee');

  // Form fields for edit employee
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVenmo, setEditVenmo] = useState('');
  const [editPayRate, setEditPayRate] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'employee'>('employee');

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadEmployees();
    }
  }, [profile]);

  useEffect(() => {
    filterEmployees();
  }, [employees, searchQuery, statusFilter, roleFilter]);

  async function loadProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone, venmo_url')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;

      if (profileData.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      setProfile({
        ...profileData,
        email: session.user.email || null,
      } as Profile);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployees() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/employees', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch employees');

      const data = await response.json();
      setEmployees(data);
    } catch (err: any) {
      console.error('Failed to load employees:', err);
      error('Failed to load employees');
    }
  }

  function filterEmployees() {
    let filtered = [...employees];

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(emp => emp.is_active !== false);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(emp => emp.is_active === false);
    }

    // Role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(emp => emp.role === roleFilter);
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.full_name?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q) ||
        emp.phone?.toLowerCase().includes(q) ||
        emp.venmo_url?.toLowerCase().includes(q)
      );
    }

    setFilteredEmployees(filtered);
  }

  function openAddModal() {
    setNewEmail('');
    setNewFullName('');
    setNewPhone('');
    setNewVenmo('');
    setNewPayRate('25');
    setNewRole('employee');
    setSendInviteEmail(true);
    setShowAddModal(true);
  }

  function openEditModal(emp: Employee) {
    setEditingEmployee(emp);
    setEditFullName(emp.full_name || '');
    setEditPhone(emp.phone || '');
    setEditVenmo(emp.venmo_url || '');
    setEditPayRate(String(emp.pay_rate || 25));
    setEditRole(emp.role);
    setShowEditModal(true);
  }

  async function handleAddEmployee() {
    if (!newEmail || !newFullName) {
      error('Email and full name are required');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: newEmail,
          full_name: newFullName,
          phone: newPhone || null,
          venmo_url: newVenmo || null,
          pay_rate: parseFloat(newPayRate) || 25,
          role: newRole,
          send_invite_email: sendInviteEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create employee');
      }

      const result = await response.json();

      if (result.reactivated) {
        if (result.invite_sent) {
          success('Employee reactivated and invite email sent!');
        } else {
          success('Employee reactivated successfully!');
        }
      } else {
        if (result.invite_sent) {
          success('Employee created and invite email sent!');
        } else {
          success('Employee created successfully!');
        }
      }

      setShowAddModal(false);
      setNewEmail('');
      setNewFullName('');
      setNewPhone('');
      setNewVenmo('');
      setNewPayRate('25');
      setNewRole('employee');
      setSendInviteEmail(true);
      await loadEmployees();
    } catch (err: any) {
      console.error('Failed to add employee:', err);
      error(err.message || 'Failed to add employee');
    } finally {
      setSaving(false);
    }
  }

  async function handleEditEmployee() {
    if (!editingEmployee) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          full_name: editFullName,
          phone: editPhone || null,
          venmo_url: editVenmo || null,
          pay_rate: parseFloat(editPayRate) || 25,
          role: editRole,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update employee');
      }

      success('Employee updated successfully!');
      setShowEditModal(false);
      await loadEmployees();
    } catch (err: any) {
      console.error('Failed to update employee:', err);
      error(err.message || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(emp: Employee) {
    const newStatus = !emp.is_active;
    const action = newStatus ? 'reactivate' : 'deactivate';

    if (!confirm(`Are you sure you want to ${action} ${emp.full_name}?`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`/api/employees/${emp.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          is_active: newStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} employee`);
      }

      success(`Employee ${newStatus ? 'reactivated' : 'deactivated'} successfully!`);
      await loadEmployees();
    } catch (err: any) {
      console.error(`Failed to ${action} employee:`, err);
      error(err.message || `Failed to ${action} employee`);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading || !profile) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Employee Management - Timesheet</title>
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
              <a href="/reports" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                <span>Reports</span>
              </a>
              <a href="/settings" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Settings size={18} /></span>
                <span>Settings</span>
              </a>
            </div>

            {profile.role === 'admin' && (
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
                <a href="/employees" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
                <div className="sidebar-user-role">{profile.role}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="app-main">
          <header className="app-header">
            <div>
              <h1 className="header-title">Employee Management</h1>
              <p className="header-subtitle">Manage employees, roles, and pay rates</p>
            </div>
            <button
              onClick={openAddModal}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Plus size={18} />
              Add Employee
            </button>
          </header>

          <div className="app-content">
            {/* Filters */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Search
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name, email, phone..."
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 40px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Role
                  </label>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as any)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Employee Count */}
            <div style={{ marginBottom: '16px', fontSize: '14px', color: '#64748b' }}>
              Showing {filteredEmployees.length} of {employees.length} employees
            </div>

            {/* Employees Table */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Name</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Email</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Phone</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Pay Rate</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Role</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#1e293b', fontWeight: 500 }}>
                          {emp.full_name || 'No name'}
                        </td>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Mail size={14} />
                            {emp.email || 'No email'}
                          </div>
                        </td>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={14} />
                            {emp.phone || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>
                          ${emp.pay_rate || 25}/hr
                        </td>
                        <td style={{ padding: '16px', fontSize: '13px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: emp.role === 'admin' ? '#fef3c7' : '#dbeafe',
                            color: emp.role === 'admin' ? '#92400e' : '#1e40af',
                          }}>
                            {emp.role}
                          </span>
                        </td>
                        <td style={{ padding: '16px', fontSize: '13px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: emp.is_active !== false ? '#d1fae5' : '#fee2e2',
                            color: emp.is_active !== false ? '#065f46' : '#991b1b',
                          }}>
                            {emp.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => openEditModal(emp)}
                              style={{
                                padding: '6px 12px',
                                background: '#f1f5f9',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#475569',
                              }}
                            >
                              <Edit2 size={14} />
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(emp)}
                              style={{
                                padding: '6px 12px',
                                background: emp.is_active !== false ? '#fee2e2' : '#d1fae5',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: emp.is_active !== false ? '#991b1b' : '#065f46',
                              }}
                            >
                              {emp.is_active !== false ? <UserX size={14} /> : <UserCheck size={14} />}
                              {emp.is_active !== false ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                          No employees found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }} onClick={() => setShowAddModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                Add New Employee
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Email <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="employee@example.com"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{
                padding: '12px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#475569',
                }}>
                  <input
                    type="checkbox"
                    checked={sendInviteEmail}
                    onChange={(e) => setSendInviteEmail(e.target.checked)}
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer',
                    }}
                  />
                  Send invite email (recommended)
                </label>
                <p style={{
                  fontSize: '12px',
                  color: '#64748b',
                  margin: '6px 0 0 24px',
                }}>
                  Employee will receive an email to set their password
                </p>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Full Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="John Doe"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+15551234567"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Venmo Username
                </label>
                <input
                  type="text"
                  value={newVenmo}
                  onChange={(e) => setNewVenmo(e.target.value)}
                  placeholder="@username"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Pay Rate ($/hour)
                </label>
                <input
                  type="number"
                  value={newPayRate}
                  onChange={(e) => setNewPayRate(e.target.value)}
                  placeholder="25"
                  min="0"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEmployee}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && editingEmployee && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }} onClick={() => setShowEditModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                Edit Employee
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={editingEmployee.email || ''}
                  disabled
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: '#f8fafc',
                    color: '#94a3b8',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Email cannot be changed
                </p>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Full Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="John Doe"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+15551234567"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Venmo Username
                </label>
                <input
                  type="text"
                  value={editVenmo}
                  onChange={(e) => setEditVenmo(e.target.value)}
                  placeholder="@username"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Pay Rate ($/hour)
                </label>
                <input
                  type="number"
                  value={editPayRate}
                  onChange={(e) => setEditPayRate(e.target.value)}
                  placeholder="25"
                  min="0"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowEditModal(false)}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditEmployee}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={closeToast} />
    </>
  );
}
