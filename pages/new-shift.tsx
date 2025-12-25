// pages/new-shift.tsx
/**
 * LOG NEW SHIFT - Brand New SaaS Design
 * Completely redesigned with sidebar navigation and modern interface
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { combineLocalWithTz, calculateHours } from '../lib/timezone';
import Head from 'next/head';

type ShiftType = 'Setup' | 'Breakdown' | 'Shop';

export default function NewShift() {
  const r = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('employee');

  const [date, setDate] = useState('');
  const [type, setType] = useState<ShiftType>('Setup');
  const [tin, setTin] = useState('');
  const [tout, setTout] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        r.replace('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .single();

      setUserId(user.id);
      setUserName(profile?.full_name || 'User');
      setUserRole(profile?.role || 'employee');
    })();
  }, [r]);

  async function submit() {
    setErr(undefined);
    if (!userId) return;

    try {
      if (!date || !tin || !tout)
        throw new Error('Date, Time In and Time Out are required.');

      let timeIn = combineLocalWithTz(date, tin);
      let timeOut = combineLocalWithTz(date, tout);

      if (timeOut <= timeIn) {
        timeOut = new Date(timeOut.getTime() + 24 * 60 * 60 * 1000);
      }

      const hours = calculateHours(timeIn.toISOString(), timeOut.toISOString());
      if (hours <= 0 || hours > 18) {
        throw new Error('Please double-check your times (shift length seems off).');
      }

      setSaving(true);

      const { error } = await supabase.from('shifts').insert({
        user_id: userId,
        shift_date: date,
        shift_type: type,
        time_in: timeIn.toISOString(),
        time_out: timeOut.toISOString(),
        notes,
      });

      if (error) throw error;

      r.push('/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Could not save shift');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    r.push('/login');
  }

  return (
    <>
      <Head>
        <title>Log New Shift - Timesheet</title>
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
              <a href="/dashboard" className="sidebar-nav-item">
                <span className="sidebar-nav-icon">👤</span>
                <span>My Shifts</span>
              </a>
              <a href="/new-shift" className="sidebar-nav-item active">
                <span className="sidebar-nav-icon">➕</span>
                <span>Log Shift</span>
              </a>
            </div>

            {userRole === 'admin' && (
              <div className="sidebar-nav-section">
                <div className="sidebar-nav-label">Admin</div>
                <a href="/admin" className="sidebar-nav-item">
                  <span className="sidebar-nav-icon">📊</span>
                  <span>Admin Dashboard</span>
                </a>
                <a href="/admin-schedule" className="sidebar-nav-item">
                  <span className="sidebar-nav-icon">📅</span>
                  <span>Schedule</span>
                </a>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {userName.charAt(0) || 'U'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{userName}</div>
                <div className="sidebar-user-role">{userRole === 'admin' ? 'Administrator' : 'Employee'}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="app-main">
          <header className="app-header">
            <div className="header-content">
              <div>
                <h1 className="header-title">Log New Shift</h1>
                <p className="header-subtitle">Enter your shift details to record your work hours</p>
              </div>
            </div>
          </header>

          <div className="app-content">
            <div className="form-container">
              <div className="form-card">
                {err && (
                  <div className="alert-new alert-error-new">
                    {err}
                  </div>
                )}

                <div className="form-grid">
                  <div className="form-field">
                    <label className="form-label">Shift Date</label>
                    <input
                      className="input-new"
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Shift Type</label>
                    <select
                      className="select-new"
                      value={type}
                      onChange={e => setType(e.target.value as ShiftType)}
                    >
                      <option>Setup</option>
                      <option>Breakdown</option>
                      <option>Shop</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Time In</label>
                    <input
                      className="input-new"
                      type="time"
                      value={tin}
                      onChange={e => setTin(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Time Out</label>
                    <input
                      className="input-new"
                      type="time"
                      value={tout}
                      onChange={e => setTout(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field form-field-full">
                  <label className="form-label">Notes (Optional)</label>
                  <textarea
                    className="textarea-new"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add any additional details about this shift..."
                    rows={4}
                  />
                </div>

                <div className="form-actions">
                  <button
                    className="btn-new btn-secondary-new"
                    onClick={() => r.push('/dashboard')}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-new btn-primary-new btn-large"
                    onClick={submit}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Shift'}
                  </button>
                </div>
              </div>

              {/* HELP CARD */}
              <div className="help-card">
                <div className="help-card-icon">💡</div>
                <h3 className="help-card-title">Quick Tips</h3>
                <ul className="help-card-list">
                  <li>Make sure to select the correct shift type (Setup, Breakdown, or Shop)</li>
                  <li>If your shift goes past midnight, the Time Out will automatically be set to the next day</li>
                  <li>Your hours and pay will be calculated automatically based on your times</li>
                  <li>You can edit or delete shifts later from your dashboard</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
