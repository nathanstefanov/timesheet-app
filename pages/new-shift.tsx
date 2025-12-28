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
import { User, Plus, Calendar, BarChart3, LogOut, Settings } from 'lucide-react';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              <a href="/new-shift" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
              <LogOut size={16} /> Logout
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
            <div className="log-shift-layout">
              {/* MAIN FORM */}
              <div className="log-shift-form-section">
                <div className="log-shift-form-card">
                  <div className="log-shift-form-header">
                    <h2 className="log-shift-form-title">Shift Details</h2>
                    <p className="log-shift-form-subtitle">Fill in all required fields to log your shift</p>
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
                            value={tout}
                            onChange={e => setTout(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>

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
                          rows={4}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="log-shift-form-footer">
                    <button
                      className="log-shift-btn cancel"
                      onClick={() => r.push('/dashboard')}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      className="log-shift-btn submit"
                      onClick={submit}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="log-shift-btn-spinner">⏳</span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <span className="log-shift-btn-icon">✓</span>
                          Save Shift
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* HELP SIDEBAR */}
              <div className="log-shift-help-section">
                <div className="log-shift-help-card">
                  <div className="log-shift-help-icon">💡</div>
                  <h3 className="log-shift-help-title">Quick Tips</h3>
                  <ul className="log-shift-help-list">
                    <li>
                      <span className="help-item-icon">✓</span>
                      <span>Make sure to select the correct shift type (Setup, Breakdown, or Shop)</span>
                    </li>
                    <li>
                      <span className="help-item-icon">✓</span>
                      <span>If your shift goes past midnight, the Time Out will automatically be set to the next day</span>
                    </li>
                    <li>
                      <span className="help-item-icon">✓</span>
                      <span>Your hours and pay will be calculated automatically based on your times</span>
                    </li>
                    <li>
                      <span className="help-item-icon">✓</span>
                      <span>You can edit or delete shifts later from your dashboard</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
