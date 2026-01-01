// pages/admin-schedule-past.tsx
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { get, patch, del, ApiError } from '../lib/api';
import { User, Plus, Calendar, BarChart3, LogOut, RefreshCw, Trash2, Settings, DollarSign, Shield } from 'lucide-react';
import Head from 'next/head';

type Row = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: 'setup' | 'lights' | 'breakdown' | 'other' | null;
  notes?: string | null;
};
type Emp = { id: string; full_name?: string | null; email?: string | null };
type Profile = { id: string; role: 'admin' | 'employee'; full_name?: string } | null;

export default function AdminSchedulePast() {
  const router = useRouter();
  const [me, setMe] = useState<Profile>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, Emp[]>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 60s heartbeat so things auto-stay "past"
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      setMe(profile as Profile);
    })();
  }, [router]);

  async function loadRows() {
    setLoading(true);
    setErr(null);
    try {
      const data = await get<Row[]>('/api/schedule/shifts');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e instanceof ApiError && e.statusCode === 401) {
        router.push('/');
        return;
      }
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (me) {
      loadRows();
    }
  }, [me]);

  const past = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => {
        const s = r.start_time ? Date.parse(r.start_time) : NaN;
        const e = r.end_time ? Date.parse(r.end_time) : NaN;
        if (!isNaN(e)) return e < now;
        if (!isNaN(s)) return s < now;
        return false;
      })
      .sort((a, b) => {
        const ae = a.end_time
          ? Date.parse(a.end_time)
          : a.start_time
          ? Date.parse(a.start_time)
          : 0;
        const be = b.end_time
          ? Date.parse(b.end_time)
          : b.start_time
          ? Date.parse(b.start_time)
          : 0;
        return be - ae; // newest past first
      });
  }, [rows]);

  // load assigned employees for past rows
  useEffect(() => {
    (async () => {
      const ids = past.map((r) => r.id);
      if (ids.length === 0) {
        setAssignedMap({});
        return;
      }

      try {
        const { data: assignData } = await supabase
          .from('schedule_assignments')
          .select('schedule_shift_id, employee_id, profiles!inner(id, full_name, email)')
          .in('schedule_shift_id', ids);

        const map: Record<string, Emp[]> = {};
        (assignData || []).forEach((a: any) => {
          const sid = a.schedule_shift_id;
          if (!map[sid]) map[sid] = [];
          map[sid].push({
            id: a.profiles?.id ?? a.employee_id,
            full_name: a.profiles?.full_name,
            email: a.profiles?.email,
          });
        });

        setAssignedMap(map);
      } catch (e) {
        console.error('Failed to load assignments', e);
      }
    })();
  }, [past]);

  async function deleteRow(id: string) {
    if (!confirm('Delete this past shift?')) return;
    try {
      await del(`/api/schedule/shifts/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e.message || 'Failed to delete');
    }
  }

  async function deleteAllPast() {
    if (!confirm(`Delete all ${past.length} past shifts? This cannot be undone.`)) return;
    try {
      for (const r of past) {
        await del(`/api/schedule/shifts/${r.id}`);
      }
      setRows((prev) => prev.filter((r) => !past.includes(r)));
      alert('All past shifts deleted');
    } catch (e: any) {
      alert(e.message || 'Failed to delete all');
    }
  }

  if (!me) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Past Scheduled Shifts - Admin</title>
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
              <div className="sidebar-nav-label">Admin</div>
              <a href="/admin" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                <span>Admin Dashboard</span>
              </a>
              <a href="/admin-schedule" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Calendar size={18} /></span>
                <span>Schedule</span>
              </a>
              <a href="/admin-schedule-past" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
                <h1 className="header-title">Past Scheduled Shifts</h1>
                <p className="header-subtitle">View and manage completed shifts</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/admin-schedule" style={{
                  padding: '10px 20px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: '#334155',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  ← Back to Upcoming
                </Link>
                <button
                  onClick={loadRows}
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
                {past.length > 0 && (
                  <button
                    onClick={deleteAllPast}
                    style={{
                      padding: '10px 20px',
                      background: '#fee2e2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: '#dc2626',
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Trash2 size={16} />
                    Delete All Past
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="app-content">
            {err && (
              <div style={{
                padding: '16px',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                marginBottom: '20px'
              }}>
                {err}
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                Loading…
              </div>
            )}

            {!loading && past.length === 0 && !err && (
              <div style={{
                padding: '60px 20px',
                textAlign: 'center',
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                <div style={{ color: '#64748b', fontSize: '16px' }}>No past shifts yet.</div>
              </div>
            )}

            {past.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>START</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>END</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>JOB</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>LOCATION</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>ADDRESS</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>ASSIGNED</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>NOTES</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '14px' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {past.map((r) => {
                        const emps = assignedMap[r.id] || [];
                        const assignedLabel = emps.length
                          ? emps
                              .map(
                                (e) =>
                                  e.full_name || e.email || e.id.slice(0, 8)
                              )
                              .join(', ')
                          : '—';
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155' }}>{fmt(r.start_time)}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155' }}>{fmt(r.end_time)}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155' }}>{r.job_type}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155' }}>{r.location_name || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155' }}>{r.address || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#334155' }}>{assignedLabel}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: '#64748b' }}>{r.notes || '—'}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <Link
                                  href={`/admin-schedule?edit=${r.id}`}
                                  style={{
                                    padding: '6px 12px',
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    fontWeight: 500
                                  }}
                                >
                                  Edit
                                </Link>
                                <button
                                  onClick={() => deleteRow(r.id)}
                                  style={{
                                    padding: '6px 12px',
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    fontWeight: 500
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
