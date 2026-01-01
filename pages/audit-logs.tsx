// pages/audit-logs.tsx
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { Shield, Download, Search, Filter, User, Calendar, DollarSign, LogOut, Settings, BarChart3, Plus } from 'lucide-react';
import { useToast } from '../hooks/useToast';

type AuditLog = {
  id: string;
  user_id: string;
  action_type: string;
  action_description: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'employee';
};

export default function AuditLogs() {
  const router = useRouter();
  const { success, error } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminSectionExpanded, setAdminSectionExpanded] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (profile) {
      if (profile.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      loadAuditLogs();
    }
  }, [profile]);

  async function loadProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(data);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      error('Failed to load profile');
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs() {
    try {
      const { data: logsData, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (logsError) throw logsError;

      if (!logsData || logsData.length === 0) {
        setLogs([]);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(logsData.map(log => log.user_id))];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, Email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const profileMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = { name: p.full_name || 'Unknown', email: (p as any).Email };
        return acc;
      }, {} as Record<string, { name: string; email: string | null }>);

      const enrichedLogs = logsData.map(log => ({
        ...log,
        user_name: profileMap[log.user_id]?.name || 'Unknown',
        user_email: profileMap[log.user_id]?.email || null,
      }));

      setLogs(enrichedLogs);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      error('Failed to load audit logs');
    }
  }

  function exportToCSV() {
    const headers = ['Timestamp', 'User', 'Email', 'Action Type', 'Description', 'Resource Type', 'Resource ID', 'IP Address'];
    const rows = filteredLogs.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.user_name,
      log.user_email || '',
      log.action_type,
      log.action_description,
      log.resource_type || '',
      log.resource_id || '',
      log.ip_address || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    success('Audit logs exported to CSV');
  }

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesUser = log.user_name?.toLowerCase().includes(query);
        const matchesEmail = log.user_email?.toLowerCase().includes(query);
        const matchesAction = log.action_description.toLowerCase().includes(query);
        if (!matchesUser && !matchesEmail && !matchesAction) return false;
      }

      if (actionTypeFilter && log.action_type !== actionTypeFilter) return false;
      if (userFilter && log.user_id !== userFilter) return false;
      if (startDate && log.created_at < startDate) return false;
      if (endDate && log.created_at > endDate) return false;

      return true;
    });
  }, [logs, searchQuery, actionTypeFilter, userFilter, startDate, endDate]);

  const actionTypes = useMemo(() => {
    return [...new Set(logs.map(log => log.action_type))].sort();
  }, [logs]);

  const uniqueUsers = useMemo(() => {
    const users = logs.reduce((acc, log) => {
      if (!acc.find(u => u.id === log.user_id)) {
        acc.push({ id: log.user_id, name: log.user_name || 'Unknown' });
      }
      return acc;
    }, [] as { id: string; name: string }[]);
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  function getActionBadgeColor(actionType: string) {
    if (actionType === 'login') return '#10b981';
    if (actionType.includes('payment') || actionType.includes('paid')) return '#f59e0b';
    if (actionType.includes('delete') || actionType.includes('undo')) return '#ef4444';
    if (actionType.includes('create') || actionType.includes('add')) return '#3b82f6';
    if (actionType.includes('update') || actionType.includes('edit')) return '#8b5cf6';
    return '#64748b';
  }

  if (loading || !profile) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  if (profile.role !== 'admin') {
    return null;
  }

  return (
    <>
      <Head>
        <title>Audit Logs - Timesheet</title>
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

            <div className="sidebar-nav-section">
              <div
                className="sidebar-nav-label"
                onClick={() => setAdminSectionExpanded(!adminSectionExpanded)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>Admin</span>
                <span style={{ fontSize: '12px' }}>{adminSectionExpanded ? '−' : '+'}</span>
              </div>
              {adminSectionExpanded && (
                <>
                  <a href="/admin" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                    <span className="sidebar-nav-icon"><User size={18} /></span>
                    <span>All Shifts</span>
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
                  <a href="/audit-logs" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
                    <span className="sidebar-nav-icon"><Shield size={18} /></span>
                    <span>Audit Logs</span>
                  </a>
                </>
              )}
            </div>
          </nav>

          <div className="sidebar-footer">
            <button
              className="sidebar-footer-button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/');
              }}
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="app-main">
          <div className="page-header">
            <div>
              <h1 className="page-title">Audit Logs</h1>
              <p className="page-subtitle">Track all admin actions and employee logins for compliance</p>
            </div>
            <button
              onClick={exportToCSV}
              className="button-primary"
              disabled={filteredLogs.length === 0}
            >
              <Download size={18} />
              Export to CSV
            </button>
          </div>

          {/* FILTERS */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Filter size={20} style={{ color: '#64748b' }} />
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Filters</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Search
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Name, email, or action..."
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 40px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Action Type
                </label>
                <select
                  value={actionTypeFilter}
                  onChange={(e) => setActionTypeFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">All Actions</option>
                  {actionTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  User
                </label>
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">All Users</option>
                  {uniqueUsers.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>

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
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Total Events</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>{filteredLogs.length}</div>
            </div>

            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Unique Users</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>
                {new Set(filteredLogs.map(log => log.user_id)).size}
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Action Types</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>
                {new Set(filteredLogs.map(log => log.action_type)).size}
              </div>
            </div>
          </div>

          {/* LOGS TABLE */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            {filteredLogs.length === 0 ? (
              <div style={{
                padding: '80px 20px',
                textAlign: 'center',
                color: '#94a3b8',
              }}>
                <Shield size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  No audit logs found
                </h3>
                <p style={{ fontSize: '14px' }}>
                  Audit logs will appear here as actions are performed
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Timestamp
                      </th>
                      <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        User
                      </th>
                      <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Action Type
                      </th>
                      <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Description
                      </th>
                      <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Resource
                      </th>
                      <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        IP Address
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#1e293b' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{log.user_name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{log.user_email}</div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: `${getActionBadgeColor(log.action_type)}20`,
                            color: getActionBadgeColor(log.action_type),
                          }}>
                            {log.action_type}
                          </span>
                        </td>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#475569' }}>
                          {log.action_description}
                        </td>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                          {log.resource_type && (
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 500 }}>{log.resource_type}</div>
                              {log.resource_id && (
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                  {log.resource_id.substring(0, 8)}...
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#64748b', fontFamily: 'monospace' }}>
                          {log.ip_address || '—'}
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
