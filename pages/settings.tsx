// pages/settings.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { User, Plus, Calendar, BarChart3, LogOut, Save, Mail, Phone, Key, DollarSign, Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'admin' | 'employee';
  phone?: string | null;
  venmo_url?: string | null;
};

export default function Settings() {
  const router = useRouter();
  const { toasts, closeToast, success, error } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [venmo, setVenmo] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Format phone number for display (555) 555-5555
  function formatPhoneDisplay(value: string): string {
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length === 0) return '';
    if (cleaned.length <= 3) return `(${cleaned}`;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    if (cleaned.length <= 10) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;

    // Handle 11 digits (with country code)
    const withoutCountry = cleaned.startsWith('1') ? cleaned.slice(1) : cleaned.slice(0, 10);
    return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3, 6)}-${withoutCountry.slice(6, 10)}`;
  }

  // Format phone number to E.164 format for storage (+1XXXXXXXXXX)
  function formatPhoneE164(value: string): string {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 0) return '';
    if (cleaned.length === 11 && cleaned.startsWith('1')) return '+' + cleaned;
    if (cleaned.length === 10) return '+1' + cleaned;
    return '+1' + cleaned.slice(-10); // Take last 10 digits
  }

  function handlePhoneChange(value: string) {
    // Format as user types
    const formatted = formatPhoneDisplay(value);
    setPhone(formatted);
  }

  function handlePhoneBlur() {
    // Convert to E.164 on blur for validation
    if (phone) {
      const e164 = formatPhoneE164(phone);
      // Show display format but store E.164
      setPhone(formatPhoneDisplay(phone));
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone, venmo_url')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      setProfile({
        ...profileData,
        email: session.user.email || null,
      } as Profile);

      setFullName(profileData.full_name || '');
      setPhone(profileData.phone ? formatPhoneDisplay(profileData.phone) : '');
      setVenmo(profileData.venmo_url || '');
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!profile) return;

    // Validation
    if (!fullName.trim()) {
      error('Please enter your full name');
      return;
    }

    if (phone && phone.replace(/\D/g, '').length !== 10 && phone.replace(/\D/g, '').length !== 11) {
      error('Please enter a valid 10-digit phone number');
      return;
    }

    setSaving(true);

    try {
      const phoneE164 = phone ? formatPhoneE164(phone) : null;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phoneE164,
          venmo_url: venmo.trim() || null,
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      success('Profile updated successfully!');
      setProfile({ ...profile, full_name: fullName.trim(), phone: phoneE164, venmo_url: venmo.trim() || null });
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      error(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!newPassword || !confirmPassword) {
      error('Please enter both new password and confirmation');
      return;
    }

    if (newPassword !== confirmPassword) {
      error('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      error('Password must be at least 6 characters');
      return;
    }

    setSaving(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Failed to change password:', err);
      error(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading || !profile) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Settings - Timesheet</title>
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
              <a href="/settings" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><SettingsIcon size={18} /></span>
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
                <div className="sidebar-user-role">{profile.role === 'admin' ? 'Administrator' : 'Employee'}</div>
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
                <h1 className="header-title">Settings</h1>
                <p className="header-subtitle">Manage your account and preferences</p>
              </div>
            </div>
          </header>

          <div className="app-content">
            {/* Profile Information Section */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              marginBottom: '24px'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <User size={20} />
                Profile Information
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                    marginBottom: '6px'
                  }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      maxWidth: '400px'
                    }}
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Mail size={16} />
                    Email
                  </label>
                  <input
                    type="email"
                    value={profile.email || ''}
                    disabled
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      maxWidth: '400px',
                      background: '#f8fafc',
                      color: '#64748b'
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Email cannot be changed
                  </p>
                </div>

                <div>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Phone size={16} />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onBlur={handlePhoneBlur}
                    maxLength={14}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      maxWidth: '400px'
                    }}
                    placeholder="(555) 555-1234"
                  />
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Will be formatted to +1XXXXXXXXXX for SMS
                  </p>
                </div>

                <div>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <DollarSign size={16} />
                    Venmo Username
                  </label>
                  <input
                    type="text"
                    value={venmo}
                    onChange={(e) => setVenmo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      maxWidth: '400px'
                    }}
                    placeholder="@username"
                  />
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Enter your Venmo username for payments (include the @)
                  </p>
                </div>

                <div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    style={{
                      padding: '10px 24px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>

            {/* Change Password Section */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '24px'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Key size={20} />
                Change Password
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                    marginBottom: '6px'
                  }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      maxWidth: '400px'
                    }}
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#475569',
                    marginBottom: '6px'
                  }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      maxWidth: '400px'
                    }}
                    placeholder="Confirm new password"
                  />
                </div>

                <div>
                  <button
                    onClick={handleChangePassword}
                    disabled={saving || !newPassword || !confirmPassword}
                    style={{
                      padding: '10px 24px',
                      background: !newPassword || !confirmPassword ? '#e2e8f0' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: (saving || !newPassword || !confirmPassword) ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Key size={16} />
                    {saving ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <ToastContainer toasts={toasts} onClose={closeToast} />
    </>
  );
}
