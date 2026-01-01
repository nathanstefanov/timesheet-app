// pages/me/schedule.tsx
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { get, ApiError } from '../../lib/api';
import Head from 'next/head';
import { Search, Settings, RefreshCw, AlertTriangle, Calendar, User, Plus, LogOut, Clock, DollarSign, BarChart3, Shield } from 'lucide-react';

type Mate = { id: string; full_name?: string | null };

type JobType = 'setup' | 'lights' | 'breakdown' | 'other';

type Shift = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  job_type?: JobType | null;
  location_name?: string | null;
  address?: string | null;
  mates?: Mate[];
  notes?: string | null; // ✅ notes
};

// Map internal job_type to display label
const JOB_LABELS: Record<JobType, string> = {
  setup: 'Setup',
  lights: 'Lights',
  breakdown: 'Breakdown',
  other: 'Shop', // 👈 show Shop instead of "other"
};

// Detects Apple devices and builds correct map link
function getMapLink(address: string) {
  const encoded = encodeURIComponent(address);

  const isApple =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

  if (isApple) {
    return `https://maps.apple.com/?q=${encoded}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

export default function MySchedule() {
  const router = useRouter();
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<Mate | null>(null);
  const [userRole, setUserRole] = useState<string>('employee');

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] =
    useState<'all' | JobType>('all');

  const [showPast, setShowPast] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const fmtDate = (s?: string | null) =>
    s
      ? new Date(s).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : '';

  const fmtDateLong = (s: string) =>
    new Date(s).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

  const fmtTime = (s?: string | null) =>
    s
      ? new Date(s).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

  const JobBadgeXL = ({ text }: { text?: string | null }) => {
    if (!text) return null;
    const label = text[0].toUpperCase() + text.slice(1);
    return <span className="badge job-badge-xl">{label}</span>;
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // Get and verify current session
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      console.log('[Schedule] Session check:', session ? 'Active' : 'None');

      if (!session) {
        console.log('[Schedule] No session found, redirecting to login');
        router.push('/');
        return;
      }

      // Verify the session is actually valid by trying to refresh it
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[Schedule] Session refresh failed:', refreshError.message);
        console.log('[Schedule] Invalid session detected, clearing and redirecting');
        await supabase.auth.signOut();
        router.push('/');
        return;
      }

      console.log('[Schedule] Session is valid');

      if (session?.user) {
        const { data: meProfile } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (meProfile) {
          setMe({ id: meProfile.id, full_name: meProfile.full_name });
          setUserRole(meProfile.role || 'employee');
        }
      }

      // Fetch schedule using authenticated API helper
      console.log('[Schedule] Fetching schedule data...');
      const scheduleData = await get<Shift[]>('/api/schedule/me');
      console.log('[Schedule] Schedule data loaded:', scheduleData?.length || 0, 'shifts');
      setRows(Array.isArray(scheduleData) ? scheduleData : []);
    } catch (e: any) {
      console.error('[Schedule] Load error:', e);
      if (e instanceof ApiError) {
        if (e.statusCode === 401) {
          // Auth error - clear session and redirect
          console.log('[Schedule] Auth error (401), clearing session and redirecting');
          await supabase.auth.signOut();
          router.push('/');
          return;
        } else {
          console.error('[Schedule] API error:', e.statusCode, e.message);
          setErr(`Error: ${e.message}`);
        }
      } else {
        console.error('[Schedule] Unexpected error:', e);
        setErr(e.message || 'Failed to load schedule');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.job_type !== typeFilter) return false;
      if (!text) return true;
      const hay = [
        r.location_name ?? '',
        r.address ?? '',
        r.job_type ?? '',
        r.notes ?? '',
        ...(r.mates || []).map((m) => m.full_name ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q, typeFilter]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const u: Shift[] = [];
    const p: Shift[] = [];

    filtered.forEach((s) => {
      const sMs = s.start_time ? Date.parse(s.start_time) : 0;
      const eMs = s.end_time ? Date.parse(s.end_time) : 0;
      const isPast = eMs ? eMs < now : sMs < now;
      (isPast ? p : u).push(s);
    });

    u.sort(
      (a, b) =>
        (Date.parse(a.start_time ?? '') || 0) -
        (Date.parse(b.start_time ?? '') || 0),
    );
    p.sort(
      (a, b) =>
        (Date.parse(b.end_time ?? '') || 0) -
        (Date.parse(a.end_time ?? '') || 0),
    );

    return { upcoming: u, past: p };
  }, [filtered]);

  const upcomingGroups = useMemo(() => {
    const map = new Map<string, Shift[]>();
    upcoming.forEach((s) => {
      const key = s.start_time ? new Date(s.start_time).toDateString() : 'TBD';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });

    return Array.from(map.entries()).sort(
      (a, b) => (Date.parse(a[0]) || 0) - (Date.parse(b[0]) || 0),
    );
  }, [upcoming]);

  // teammates pill
  const Teammates = ({ mates, me }: { mates?: Mate[]; me: Mate | null }) => {
    const list: Mate[] = [];

    if (me) list.push(me);
    if (mates) {
      mates.forEach((m) => {
        if (!list.some((x) => x.id === m.id)) list.push(m);
      });
    }

    if (list.length === 0) {
      return <span className="muted">Just you</span>;
    }

    return (
      <div className="row wrap gap-sm teammates-row">
        {list.map((m) => {
          const name = m.full_name || 'Teammate';
          const initials = name
            .split(' ')
            .filter(Boolean)
            .map((p) => p[0].toUpperCase() + '.')
            .join('');

          return (
            <div key={m.id} className="pill teammate-pill" title={name}>
              <span className="pill__num teammate-initials">{initials}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const ShiftCard = ({ s, me }: { s: Shift; me: Mate | null }) => {
    const dayShort = fmtDate(s.start_time);
    const start = fmtTime(s.start_time);
    const end = fmtTime(s.end_time);

    const jobLabel = s.job_type ? JOB_LABELS[s.job_type] : '';

    return (
      <div className="card shift-card">
        <div className="shift-card-job">
          <div className="row wrap gap-md shift-card-job">
            <span className="shift-type-pill">
              {jobLabel ? jobLabel.toUpperCase() : ''}
            </span>
          </div>
        </div>

        {/* everything lined up inside this column */}
        <div className="shift-card-main">
          <div className="row wrap gap-md shift-card-datetime">
            <strong className="shift-card-day">{dayShort}</strong>
            <span className="muted shift-card-time">
              {start}
              {end ? ` – ${end}` : ''}
            </span>
          </div>

          <div className="row wrap gap-md shift-card-location">
            {s.address ? (
              <a
                href={getMapLink(s.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="shift-card-location-link"
              >
                <strong className="shift-card-location-name">
                  {s.location_name || 'Location'}
                </strong>
                <div className="muted shift-card-location-address">
                  {s.address}
                </div>
              </a>
            ) : (
              <strong>{s.location_name || 'Location TBD'}</strong>
            )}
          </div>

          {s.notes && (
            <div className="row wrap gap-md shift-card-notes">
              <span className="shift-card-notes-label">
                <strong>Notes:</strong>
              </span>
              <span className="shift-card-notes-text">{s.notes}</span>
            </div>
          )}

          <div className="shift-card-teammates">
            <Teammates mates={s.mates} me={me} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>My Schedule - Timesheet</title>
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
              <a href="/me/schedule" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
                  <span className="sidebar-nav-icon"><User size={18} /></span>
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
              <div className="sidebar-user-avatar">
                {me?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{me?.full_name || 'User'}</div>
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
                <h1 className="header-title">My Schedule</h1>
                <p className="header-subtitle">View your upcoming and past scheduled shifts</p>
              </div>
            </div>
          </header>

          <div className="app-content">
            <div className="me-schedule-inner">

        {/* ENHANCED TOOLBAR */}
        <div className="schedule-toolbar">
          <div
            className="schedule-toolbar-header"
            onClick={() => setToolbarExpanded(!toolbarExpanded)}
          >
            <span className="schedule-toolbar-title">
              Search & Filters <span className="mobile-toolbar-arrow">{toolbarExpanded ? '▼' : '▶'}</span>
            </span>
          </div>
          {toolbarExpanded && (
            <>
              <div className="schedule-toolbar-search">
                <span className="schedule-search-icon"><Search size={18} /></span>
                <input
                  className="schedule-search-input"
                  placeholder="Search location, address, teammates…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="schedule-toolbar-filters">
                <div className="schedule-filter-group">
                  <span className="schedule-filter-icon"><Settings size={18} /></span>
                  <select
                    className="schedule-filter-select"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as any)}
                  >
                    <option value="all">All types</option>
                    <option value="setup">Setup</option>
                    <option value="lights">Lights</option>
                    <option value="breakdown">Breakdown</option>
                    <option value="other">Shop</option>
                  </select>
                </div>
                <button className="schedule-refresh-btn" onClick={load}>
                  <span className="schedule-btn-icon"><RefreshCw size={16} /></span>
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>

        {err && (
          <div className="schedule-alert error">
            <span className="schedule-alert-icon"><AlertTriangle size={18} /></span>
            <span>{err}</span>
          </div>
        )}
        {loading && (
          <div className="schedule-loading">
            <span className="schedule-loading-icon"><Clock size={18} /></span>
            <span>Loading…</span>
          </div>
        )}

        {/* UPCOMING SECTION */}
        <section className="schedule-section">
          <div className="schedule-section-header">
            <div className="schedule-section-title-group">
              <h2 className="schedule-section-title">Upcoming Shifts</h2>
              <span className="schedule-badge">{upcoming.length}</span>
            </div>
          </div>

          {!loading && upcoming.length === 0 && (
            <div className="schedule-empty-state">
              <div className="schedule-empty-icon">📅</div>
              <div className="schedule-empty-title">No upcoming shifts</div>
              <div className="schedule-empty-subtitle">Your scheduled shifts will appear here</div>
            </div>
          )}

          <div className="schedule-groups">
            {upcomingGroups.map(([dayKey, list]) => (
              <div key={dayKey} className="schedule-day-group">
                <div className="schedule-day-header">
                  <div className="schedule-day-title">
                    {dayKey === 'TBD' ? '📌 Date TBD' : `📅 ${fmtDateLong(dayKey)}`}
                  </div>
                  <div className="schedule-day-count">
                    {list.length} shift{list.length > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="schedule-shifts-grid">
                  {list.map((s) => (
                    <ShiftCard key={s.id} s={s} me={me} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PAST SECTION */}
        <section className="schedule-section past">
          <button
            type="button"
            className="schedule-past-toggle"
            onClick={() => {
              if (past.length === 0) return;
              setShowPast((prev) => !prev);
            }}
            disabled={past.length === 0}
          >
            <div className="schedule-section-title-group">
              <div className="schedule-past-toggle-content">
                <span className="schedule-toggle-chevron">
                  {showPast ? '▾' : '▸'}
                </span>
                <h2 className="schedule-section-title">Past Shifts</h2>
              </div>
              <span className="schedule-badge">{past.length}</span>
            </div>
          </button>

          {!loading && past.length === 0 && (
            <div className="schedule-empty-state">
              <div className="schedule-empty-icon">📦</div>
              <div className="schedule-empty-title">No past shifts yet</div>
              <div className="schedule-empty-subtitle">Completed shifts will appear here</div>
            </div>
          )}

          {showPast && past.length > 0 && (
            <div className="schedule-past-grid">
              {past.map((s) => (
                <ShiftCard key={s.id} s={s} me={me} />
              ))}
            </div>
          )}
        </section>

            <div className="schedule-footer-note">
              <span className="schedule-note-icon">ℹ️</span>
              <span>
                Scheduling is separate from payroll. You still log your own hours on{' '}
                <strong>Log Shift</strong>.
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>

      {/* Scoped layout + responsive styles */}
      <style jsx>{`
        .me-schedule-inner {
          width: 100%;
        }

        /* TOOLBAR */
        .me-schedule-toolbar {
          display: flex;
          gap: 12px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .me-schedule-search {
          box-sizing: border-box;
          display: block;
          width: 100%;
          max-width: 380px;
          min-width: 0;
          padding: 10px 16px !important;
          border-radius: 999px !important;
          border: 1px solid #e5e7eb !important;
          background: #f9fafb !important;
          font-size: 14px !important;
          line-height: 1.2 !important;
          height: 44px !important;
          max-height: 44px !important;
          aspect-ratio: auto !important;
        }

        .me-schedule-filter {
          flex: 0 0 auto;
          min-width: 150px;
          padding: 10px 14px;
          border-radius: 999px;
        }

        .me-schedule-refresh {
          flex: 0 0 auto;
          padding-inline: 20px;
        }

        /* SECTIONS */
        .me-schedule-sectionbar {
          padding: 10px 14px;
        }

        .me-schedule-empty {
          padding: 12px;
          margin-top: 8px;
          text-align: center;
        }

        .me-schedule-groups {
          display: grid;
          gap: 16px;
          margin-top: 10px;
        }

        .me-schedule-group-card {
          padding: 12px 14px 14px;
        }

        .me-schedule-group-header {
          align-items: center;
          gap: 8px;
        }

        .me-schedule-group-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
          margin-top: 10px;
        }

        /* SHIFT CARD */
        .job-badge-xl {
          display: inline-flex;
          font-size: 16px;
          font-weight: 900;
          padding: 8px 16px;
          letter-spacing: 0.3px;
          text-transform: none;
          box-shadow: var(--shadow-sm);
        }

        .shift-card {
          padding: 16px 20px;
        }

        .shift-card-job {
          margin-bottom: 6px;
        }

        .shift-card-main {
          text-align: left;
          padding-left: 2px; /* tiny indent for everything, including notes */
        }

        .shift-card-datetime {
          margin-top: 4px;
          gap: 8px;
        }

        .shift-card-day {
          font-size: 16px;
        }

        .shift-card-time {
          font-size: 14px;
        }

        .shift-card-location {
          margin-top: 8px;
        }

        .shift-card-location-link {
          text-decoration: none;
        }

        .shift-card-location-name {
          color: #007aff;
        }

        .shift-card-location-address {
          max-width: 320px;
          margin: 2px 0 0;
        }

        .shift-card-notes {
          margin-top: 10px;
          font-size: 13px;
        }

        .shift-card-teammates {
          margin-top: 14px;
        }

        .teammates-row {
          justify-content: flex-start;
        }

        .teammate-pill {
          padding-inline: 10px;
        }

        .teammate-initials {
          min-width: 22px;
          text-align: center;
        }

        /* PAST */
        .me-schedule-past-toggle {
          width: 100%;
          text-align: left;
        }

        .me-schedule-past-header {
          align-items: center;
        }

        .me-schedule-past-chevron {
          display: inline-flex;
          margin-right: 8px;
          font-size: 18px;
        }

        .me-schedule-past-pill {
          margin-left: 8px;
        }

        .me-schedule-past-grid {
          display: grid;
          gap: 12px;
          margin-top: 8px;
        }

        .me-schedule-footer {
          font-size: 12px;
          text-align: center;
        }

        /* MOBILE */
        @media (max-width: 768px) {
          .me-schedule-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .me-schedule-search {
            width: 100%;
            max-width: 100%;
          }

          .me-schedule-filter,
          .me-schedule-refresh {
            width: 100%;
            justify-content: center;
          }

          .me-schedule-sectionbar {
            padding-inline: 12px;
          }

          .me-schedule-group-grid {
            grid-template-columns: 1fr;
          }

          .shift-card-location-address {
            max-width: 100%;
          }
        }
      `}</style>
    </>
  );
}
