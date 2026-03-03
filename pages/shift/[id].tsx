// Force SSR so Vercel does not emit static HTML for dynamic route
export async function getServerSideProps() {
  return { props: {} };
}
// pages/shift/[id].tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { logShiftUpdated, logShiftDeleted } from '../../lib/auditLog';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, LogOut, Settings, DollarSign, Shield } from 'lucide-react';

type ShiftType = 'Setup' | 'Breakdown' | 'Shop';

function fmtTimeLocal(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function buildLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export default function EditShift() {
  const r = useRouter();
  const id = r.query.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('employee');

  const [date, setDate] = useState('');
  const [type, setType] = useState<ShiftType>('Setup');
  const [tin, setTin] = useState('');
  const [tout, setTout] = useState('');
  const [notes, setNotes] = useState('');
  const [endsNextDay, setEndsNextDay] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { r.replace('/'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .single();

      setUserId(user.id);
      setUserName(profile?.full_name || 'User');
      setUserRole(profile?.role || 'employee');

      const { data, error } = await supabase.from('shifts').select('*').eq('id', id).single();
      if (error || !data) { setErr(error?.message || 'Shift not found'); setLoading(false); return; }

      setDate(data.shift_date);
      setType(data.shift_type);
      setTin(fmtTimeLocal(data.time_in));
      setTout(fmtTimeLocal(data.time_out));
      setNotes(data.notes || '');

      const inD = new Date(data.time_in);
      const outD = new Date(data.time_out);
      setEndsNextDay(outD.toDateString() !== inD.toDateString());

      setLoading(false);
    })();
  }, [id, r]);

  async function save() {
    setErr(undefined);
    setSaving(true);
    try {
      if (!date || !tin || !tout) throw new Error('Date, Time In, and Time Out are required.');
      if (!userId) throw new Error('User not authenticated');

      const inDt = buildLocal(date, tin);
      let outDt = buildLocal(date, tout);
      if (endsNextDay || outDt <= inDt) outDt.setDate(outDt.getDate() + 1);

      if (outDt.getTime() - inDt.getTime() < 60_000) throw new Error('Time Out must be after Time In.');

      const patch = {
        shift_date: date,
        shift_type: type,
        time_in: inDt.toISOString(),
        time_out: outDt.toISOString(),
        notes,
      };

      const { error } = await supabase.from('shifts').update(patch).eq('id', id!);
      if (error) throw error;

      const changes = Object.keys(patch)
        .map(key => `${key}: ${patch[key as keyof typeof patch]}`)
        .join(', ');
      await logShiftUpdated(userId, id!, changes);

      r.back();
    } catch (e: any) {
      setErr(e.message || 'Failed to save shift.');
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!userId) return;
    setDeleting(true);
    const { error } = await supabase.from('shifts').delete().eq('id', id!);
    if (error) { setErr(error.message); setDeleting(false); return; }
    await logShiftDeleted(userId, id!, type);
    r.push('/dashboard');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    r.push('/login');
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading-text">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Edit Shift - Timesheet</title>
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

            {userRole === 'admin' && (
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
              <div className="sidebar-user-avatar">{userName.charAt(0) || 'U'}</div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{userName}</div>
                <div className="sidebar-user-role">{userRole === 'admin' ? 'Administrator' : 'Employee'}</div>
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
                <h1 className="header-title">Edit Shift</h1>
                <p className="header-subtitle">Update your shift details</p>
              </div>
            </div>
            <button
              className={`mobile-menu-toggle${mobileMenuOpen ? ' menu-open' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            ><span></span></button>
          </header>

          <div className="app-content">
            <div className="log-shift-layout">
              <div className="log-shift-form-section">
                <div className="log-shift-form-card">
                  <div className="log-shift-form-header">
                    <h2 className="log-shift-form-title">Shift Details</h2>
                    <p className="log-shift-form-subtitle">Update the fields below and save</p>
                  </div>

                  {err && (
                    <div className="log-shift-alert error">
                      <span className="log-shift-alert-icon">⚠️</span>
                      <span className="log-shift-alert-text">{err}</span>
                    </div>
                  )}

                  <div className="log-shift-form-body">
                    <div className="log-shift-form-row">
                      <div className="log-shift-form-group">
                        <label className="log-shift-label">
                          <span className="log-shift-label-text">Shift Date</span>
                          <span className="log-shift-label-required">*</span>
                        </label>
                        <div className="log-shift-input-wrapper">
                          <input
                            className="log-shift-input"
                            type="date"
                            title="Shift date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="log-shift-form-group">
                        <label className="log-shift-label">
                          <span className="log-shift-label-text">Shift Type</span>
                          <span className="log-shift-label-required">*</span>
                        </label>
                        <div className="log-shift-input-wrapper">
                          <select
                            className="log-shift-select"
                            title="Shift type"
                            value={type}
                            onChange={e => setType(e.target.value as ShiftType)}
                          >
                            <option value="Setup">Setup</option>
                            <option value="Breakdown">Breakdown</option>
                            <option value="Shop">Shop</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="log-shift-form-row">
                      <div className="log-shift-form-group">
                        <label className="log-shift-label">
                          <span className="log-shift-label-text">Time In</span>
                          <span className="log-shift-label-required">*</span>
                        </label>
                        <div className="log-shift-input-wrapper">
                          <input
                            className="log-shift-input"
                            type="time"
                            title="Time in"
                            value={tin}
                            onChange={e => setTin(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="log-shift-form-group">
                        <label className="log-shift-label">
                          <span className="log-shift-label-text">Time Out</span>
                          <span className="log-shift-label-required">*</span>
                        </label>
                        <div className="log-shift-input-wrapper">
                          <input
                            className="log-shift-input"
                            type="time"
                            title="Time out"
                            value={tout}
                            onChange={e => setTout(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <label className="log-shift-checkbox-row">
                      <input
                        type="checkbox"
                        checked={endsNextDay}
                        onChange={e => setEndsNextDay(e.target.checked)}
                      />
                      <span>Ends after midnight (next day)</span>
                    </label>

                    <div className="log-shift-form-group full-width">
                      <label className="log-shift-label">
                        <span className="log-shift-label-text">Notes</span>
                        <span className="log-shift-label-optional">(Optional)</span>
                      </label>
                      <div className="log-shift-textarea-wrapper">
                        <textarea
                          className="log-shift-textarea"
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder="Add any additional details about this shift..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="log-shift-form-footer">
                    <button
                      type="button"
                      className="log-shift-btn cancel"
                      onClick={() => r.back()}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="log-shift-btn submit"
                      onClick={save}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : '✓ Save Changes'}
                    </button>
                  </div>
                </div>

                {/* DELETE SECTION */}
                <div className="edit-shift-danger-zone">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      className="edit-shift-delete-btn"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete this shift
                    </button>
                  ) : (
                    <div className="edit-shift-delete-confirm">
                      <p>Are you sure? This cannot be undone.</p>
                      <div className="edit-shift-delete-actions">
                        <button type="button" className="log-shift-btn cancel" onClick={() => setConfirmDelete(false)}>
                          Keep it
                        </button>
                        <button type="button" className="edit-shift-delete-confirm-btn" onClick={del} disabled={deleting}>
                          {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
