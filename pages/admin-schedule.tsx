// pages/admin-schedule.tsx
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { get, post, patch, del, ApiError } from '../lib/api';
import {
  combineLocalWithTz,
  extractDateInTz,
  extractTimeInTz,
  formatForDisplay
} from '../lib/timezone';
import { User, Calendar, LogOut, Plus, BarChart3, Clock, RefreshCw, FileText, Zap, MapPin, Settings, DollarSign } from 'lucide-react';

type Emp = {
  id: string;
  full_name?: string | null;
};

type JobType = 'setup' | 'lights' | 'breakdown' | 'other';
const JOB_TYPES: JobType[] = ['setup', 'lights', 'breakdown', 'other'];

const JOB_LABELS: Record<JobType, string> = {
  setup: 'Setup',
  lights: 'Lights',
  breakdown: 'Breakdown',
  other: 'Shop',
};

type SRow = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: JobType | null;
  notes?: string | null;
};

type Profile = { id: string; role: 'admin' | 'employee'; full_name?: string } | null;

// ---------------- DATE/TIME HELPERS ----------------

/**
 * Convert ISO string to datetime-local input value in user's timezone
 */
const toLocalInput = (isoString: string) => {
  const date = extractDateInTz(isoString);
  const time = extractTimeInTz(isoString);
  return `${date}T${time}`;
};

/**
 * Combine date and time strings to ISO timestamp
 * Falls back to 09:00 if no time provided
 */
const combineLocalDateTime = (date: string, time: string | undefined) => {
  const t = time && time.length >= 5 ? time : '09:00';
  return combineLocalWithTz(date, t).toISOString();
};

const getEmpInitials = (e: Emp) => {
  const name = e.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  }
  return e.id.slice(0, 2).toUpperCase();
};

// ---------------- GOOGLE MAPS LOADER ----------------

declare global {
  interface Window {
    google?: any;
  }
}

const loadGoogleMaps = (() => {
  let promise: Promise<any> | null = null;

  return async () => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.google?.maps) return Promise.resolve(window.google.maps);

    if (!promise) {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));

      promise = (async () => {
        try {
          // Use new functional API for @googlemaps/js-api-loader v2+
          const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');

          setOptions({
            key: key,
            v: 'weekly',
          });

          await importLibrary('places');
          return window.google?.maps;
        } catch {
          // Fallback to direct script loading
          const id = 'gmaps-js';
          if (document.getElementById(id)) return window.google?.maps;

          const s = document.createElement('script');
          s.id = id;
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
            key
          )}&libraries=places&v=weekly`;
          s.async = true;

          await new Promise<void>((resolve, reject) => {
            s.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
            s.onload = () => resolve();
            document.head.appendChild(s);
          });

          return window.google?.maps;
        }
      })();
    }

    return promise;
  };
})();

// ---------------- LOCATION PICKER (EDITABLE) ----------------

function LocationPicker({
  label,
  name,
  address,
  onChangeName,
  onChangeAddress,
  onSelect,
}: {
  label?: string;
  name: string;
  address: string;
  onChangeName: (v: string) => void;
  onChangeAddress: (v: string) => void;
  onSelect: (payload: { name: string; address: string }) => void;
}) {
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState('');
  const [preds, setPreds] = useState<Array<{ description: string; place_id: string }>>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const svcRef = useRef<any>(null);
  const detailsSvcRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled) return;

        if ((window as any).google?.maps?.places) {
          svcRef.current = new (window as any).google.maps.places.AutocompleteService();
          const dummy = document.createElement('div');
          detailsSvcRef.current = new (window as any).google.maps.places.PlacesService(dummy);
          setReady(true);
          return;
        }

        if ((window as any).google?.maps?.importLibrary) {
          const placesModule = await (window as any).google.maps.importLibrary('places');
          const AutoCtor =
            (placesModule as any)?.AutocompleteService ??
            (window as any).google?.maps?.places?.AutocompleteService;
          const PlacesCtor =
            (placesModule as any)?.PlacesService ??
            (window as any).google?.maps?.places?.PlacesService;

          if (AutoCtor && PlacesCtor) {
            svcRef.current = new AutoCtor();
            const dummy = document.createElement('div');
            detailsSvcRef.current = new PlacesCtor(dummy);
            setReady(true);
            return;
          }

          setErrorText('Google Places constructors unavailable.');
          setReady(false);
          return;
        }

        setErrorText('Google Places API not available.');
        setReady(false);
      } catch (err: any) {
        setErrorText(err?.message || 'Could not initialize Google Places.');
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !q.trim()) {
      setPreds([]);
      return;
    }

    const handle = setTimeout(() => {
      try {
        svcRef.current.getPlacePredictions(
          {
            input: q.trim(),
            componentRestrictions: { country: 'us' },
            types: ['establishment', 'geocode'],
          },
          (res: any, status: any) => {
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !res) {
              setPreds([]);
              return;
            }

            // If you truly only want IL, keep this filter. Otherwise remove it.
            const ilOnly = res
              .filter((p: any) => p.description?.includes(', IL'))
              .map((p: any) => ({ description: p.description, place_id: p.place_id }));

            setPreds(ilOnly);
          }
        );
      } catch {
        setPreds([]);
      }
    }, 150);

    return () => clearTimeout(handle);
  }, [q, ready]);

  function pickPlace(placeId: string) {
    detailsSvcRef.current.getDetails(
      { placeId, fields: ['name', 'formatted_address'] },
      (place: any, status: any) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) return;

        const pickedName = (place.name || '').toString();
        const pickedAddr = (place.formatted_address || '').toString();

        // Auto-fill both, but still editable afterward
        onSelect({ name: pickedName, address: pickedAddr });
        onChangeName(pickedName);
        onChangeAddress(pickedAddr);

        setQ(pickedName || pickedAddr);
        setPreds([]);
      }
    );
  }

  return (
    <div className="location-picker-card card p-18">
      {label && <div className="mb-sm"><strong>{label}</strong></div>}

      <div className="location-picker-section">
        <label className="location-picker-label">Search Location</label>
        <input
          aria-label="Location search"
          className="location-picker-input"
          placeholder="Type a place or address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!ready && !errorText && <div className="muted fs-12">Loading Places…</div>}
        {errorText && <div className="alert error fs-12">{errorText}</div>}

        {preds.length > 0 && (
          <div className="card p-6 maxh-220 ovf-y-auto location-picker-preds">
            {preds.map((p) => (
              <button
                key={p.place_id}
                type="button"
                className="list-item btn-list"
                onClick={() => pickPlace(p.place_id)}
              >
                {p.description}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="location-picker-fields">
        <div className="location-picker-field">
          <label className="location-picker-label">Location Name</label>
          <input
            className="location-picker-input"
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g., Country Club"
          />
        </div>

        <div className="location-picker-field">
          <label className="location-picker-label">Address</label>
          <input
            className="location-picker-input"
            value={address}
            onChange={(e) => onChangeAddress(e.target.value)}
            placeholder="Street, City, State"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------- REDIRECT COMPONENT ----------------

function RedirectTo({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return (
    <main className="page page--center">
      <p>Redirecting…</p>
      <p>
        <a href={to}>Click here if not redirected.</a>
      </p>
    </main>
  );
}

// ---------------- MAIN COMPONENT ----------------

export default function AdminSchedule() {
  const router = useRouter();

  const [me, setMe] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);

  const [rows, setRows] = useState<SRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, Emp[]>>({});

  const [form, setForm] = useState(() => {
    const now = new Date().toISOString();
    const d = toLocalInput(now);
    return {
      start_date: d.slice(0, 10),
      start_time: d.slice(11, 16),
      end_date: d.slice(0, 10),
      end_time: '',
      location_name: '',
      address: '',
      job_type: 'setup' as JobType,
      notes: '',
    };
  });

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<SRow | null>(null);

  const [edit, setEdit] = useState<SRow | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [assignShift, setAssignShift] = useState<SRow | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [, setTick] = useState(0);

  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [assignSourceId, setAssignSourceId] = useState<string | null>(null);

  function scrollToShiftRow(id: string | null) {
    if (!id) return;
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const row = document.getElementById(`shift-row-${id}`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  // ---------- AUTH ----------
  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (!session?.user) {
        setMe(null);
        setChecking(false);
        router.replace('/');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .single();

      if (!alive) return;

      if (error || !data) {
        setMe(null);
        setChecking(false);
        router.replace('/dashboard?msg=not_admin');
        return;
      }

      setMe(data as any);
      setChecking(false);

      if ((data as any).role !== 'admin') {
        router.replace('/dashboard?msg=not_admin');
      }
    }

    loadProfile();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setChecking(true);
      loadProfile();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  // ---------- HEARTBEAT ----------
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const fmtDate = (s?: string | null) =>
    s ? formatForDisplay(s, 'M/d/yy h:mm a') : '';

  const fmtTimeOnly = (s?: string | null) =>
    s ? formatForDisplay(s, 'h:mm a') : '';

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        return await r.json();
      } catch {}
    }
    return { raw: await r.text() };
  }

  // ---------- LOAD SHIFTS ----------
  async function loadRows() {
    if (!(me && me.role === 'admin')) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await get<SRow[]>('/api/schedule/shifts');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e instanceof ApiError && e.statusCode === 401) {
        router.push('/login');
        return;
      }
      setErr(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (me?.role === 'admin') loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // ---------- EMPLOYEES ----------
  useEffect(() => {
    (async () => {
      if (!(me && me.role === 'admin')) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      if (!error) setEmployees((data as Emp[]) || []);
    })();
  }, [me]);

  // ---------- UPCOMING ----------
  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => {
        const s = r.start_time ? Date.parse(r.start_time) : NaN;
        const e = r.end_time ? Date.parse(r.end_time) : NaN;
        if (!isNaN(e)) return e >= now;
        if (!isNaN(s)) return s >= now;
        return false;
      })
      .sort((a, b) => (Date.parse(a.start_time ?? '') || 0) - (Date.parse(b.start_time ?? '') || 0));
  }, [rows]);

  // ---------- LOAD ASSIGNMENTS ----------
  useEffect(() => {
    (async () => {
      if (!(me && me.role === 'admin')) return;

      const ids = upcoming.map((r) => r.id);
      if (ids.length === 0) {
        setAssignedMap({});
        return;
      }

      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('schedule_shift_id, profiles:employee_id ( id, full_name )')
        .in('schedule_shift_id', ids);

      if (error) return;

      const map: Record<string, Emp[]> = {};
      (data || []).forEach((row: any) => {
        const pid = row.schedule_shift_id as string;
        const emp: Emp = row.profiles;
        if (!map[pid]) map[pid] = [];
        map[pid].push(emp);
      });
      setAssignedMap(map);
    })();
  }, [me, upcoming]);

  // ---------- FORM VALIDATION ----------
  function validateForm() {
    if (!form.start_date) return 'Start date required.';
    if (form.end_date && form.end_time) {
      const s = combineLocalDateTime(form.start_date, form.start_time);
      const e = combineLocalDateTime(form.end_date, form.end_time);
      if (new Date(e) <= new Date(s)) return 'End time must be after start.';
    }
    return null;
  }

  // ---------- CREATE SHIFT ----------
  async function createShift() {
    if (!(me && me.role === 'admin')) return;

    const v = validateForm();
    setFormError(v);
    if (v) return;

    setCreating(true);
    try {
      const startLocal = combineLocalDateTime(form.start_date, form.start_time);
      const endLocal =
        form.end_date && form.end_time
          ? combineLocalDateTime(form.end_date, form.end_time)
          : null;

      const body = {
        start_time: startLocal,
        end_time: endLocal,
        location_name: form.location_name || undefined,
        address: form.address || undefined,
        job_type: form.job_type,
        notes: form.notes || undefined,
      };

      await post('/api/schedule/shifts', body);

      const now = new Date().toISOString();
      const d = toLocalInput(now);
      setForm({
        start_date: d.slice(0, 10),
        start_time: d.slice(11, 16),
        end_date: d.slice(0, 10),
        end_time: '',
        location_name: '',
        address: '',
        job_type: 'setup',
        notes: '',
      });

      setFormError(null);
      setDuplicateFrom(null);
      await loadRows();
    } catch (e: any) {
      alert(e.message || 'Failed to create.');
    } finally {
      setCreating(false);
    }
  }

  // ---------- OPEN EDIT ----------
  function openEdit(row: SRow) {
    setEdit({ ...row });
    setEditingSourceId(row.id);
  }

  useEffect(() => {
    if (!edit) return;
    const el = document.getElementById('edit-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [edit]);

  function prefillFormFromShift(row: SRow) {
    const startTime = row.start_time || new Date().toISOString();
    const d = toLocalInput(startTime);
    const start_date = d.slice(0, 10);

    let end_date = start_date;
    if (row.end_time) {
      const ed = toLocalInput(row.end_time);
      end_date = ed.slice(0, 10);
    }

    setForm({
      start_date,
      start_time: '',
      end_date,
      end_time: '',
      location_name: row.location_name ?? '',
      address: row.address ?? '',
      job_type: (row.job_type as JobType) || 'setup',
      notes: row.notes ?? '',
    });

    setDuplicateFrom(row);

    setTimeout(() => {
      document.querySelector('.form-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  async function saveEdit() {
    if (!edit?.id) return;
    const shiftId = edit.id;

    setSaving(true);
    try {
      const body: any = {
        start_time: edit.start_time || undefined,
        end_time: edit.end_time ?? null,
        location_name: edit.location_name ?? undefined,
        address: edit.address ?? undefined,
        job_type: edit.job_type ?? undefined,
        notes: edit.notes ?? undefined,
      };

      // Convert datetime-local format to ISO if needed
      if (body.start_time && !body.start_time.endsWith?.('Z')) {
        const [date, time] = body.start_time.split('T');
        body.start_time = combineLocalWithTz(date, time).toISOString();
      }
      if (body.end_time && !body.end_time.endsWith?.('Z')) {
        const [date, time] = body.end_time.split('T');
        body.end_time = combineLocalWithTz(date, time).toISOString();
      }

      await patch(`/api/schedule/shifts/${shiftId}`, body);

      setEdit(null);
      await loadRows();
      scrollToShiftRow(shiftId);
    } catch (e: any) {
      alert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this scheduled shift?')) return;
    try {
      await del(`/api/schedule/shifts/${id}`);
      await loadRows();
    } catch (e: any) {
      alert(e.message || 'Failed to delete');
    }
  }

  // ---------- OPEN ASSIGN ----------
  async function openAssign(row: SRow) {
    setAssignShift(row);
    setAssignSourceId(row.id);
    setSearch('');

    setCurrentAssignees([]);
    setAssignees([]);

    const { data } = await supabase
      .from('schedule_assignments')
      .select('employee_id')
      .eq('schedule_shift_id', row.id);

    const ids = (data || []).map((r: any) => r.employee_id as string);
    setCurrentAssignees(ids);
    setAssignees(ids);
  }

  useEffect(() => {
    if (!assignShift) return;
    const el = document.getElementById('assign-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [assignShift]);

  function toggleEmp(id: string) {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveAssignments() {
    if (!assignShift?.id) return;

    const shiftId = assignShift.id;

    const add = assignees.filter((x) => !currentAssignees.includes(x));
    const remove = currentAssignees.filter((x) => !assignees.includes(x));

    try {
      if (add.length) {
        await post(`/api/schedule/shifts/${shiftId}/assign`, { employee_ids: add });
      }

      if (remove.length) {
        await del(`/api/schedule/shifts/${shiftId}/assign`, { employee_ids: remove });
      }
    } catch (e: any) {
      return alert(e.message || 'Failed to update assignments');
    }

    setAssignShift(null);

    setAssignedMap((prev) => ({
      ...prev,
      [shiftId]: employees.filter((e) => assignees.includes(e.id)),
    }));

    setCurrentAssignees(assignees);

    scrollToShiftRow(shiftId);
  }

  // ---------- RENDER GUARD ----------
  if (checking) {
    return (
      <main className="page page--center page--admin">
        <p>Checking access…</p>
      </main>
    );
  }

  if (!me || me.role !== 'admin') {
    const target = me ? '/dashboard?msg=not_admin' : '/';
    return <RedirectTo to={target} />;
  }

  // ---------- MAIN UI ----------
  return (
    <>
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
              <a href="/admin-schedule" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
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
              window.location.href = '/login';
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
                <h1 className="header-title">Admin Scheduling</h1>
                <p className="header-subtitle">Create shifts, assign employees, and manage upcoming schedule</p>
              </div>
              <div className="header-actions">
                <button className="btn-new btn-secondary-new" onClick={loadRows}>
                  <RefreshCw size={16} /> Refresh
                </button>
                <Link href="/admin-schedule-past" className="btn-new btn-secondary-new">
                  <FileText size={16} /> View Past Shifts
                </Link>
              </div>
            </div>
          </header>

          <div className="app-content">
            {err && (
              <div className="schedule-alert error">
                <span className="schedule-alert-icon">⚠️</span>
                <span>{err}</span>
              </div>
            )}

      <div className="admin-schedule-layout">
        {/* FORM */}
        <div className="form-container">
          <div className="admin-shift-form-card">
            <div className="admin-shift-form-header">
              <div>
                <h2 className="admin-shift-form-title">
                  {duplicateFrom
                    ? `Create Scheduled Shift (duplicating ${duplicateFrom.location_name || 'shift'})`
                    : 'Create Scheduled Shift'}
                </h2>
                <p className="admin-shift-form-subtitle">Fill in the details to create a new scheduled shift</p>
              </div>
              <button
                type="button"
                className="admin-shift-btn-quick"
                onClick={() => {
                  const now = new Date().toISOString();
                  const d = toLocalInput(now);
                  setForm((f) => ({
                    ...f,
                    start_date: d.slice(0, 10),
                    start_time: d.slice(11, 16),
                  }));
                  setDuplicateFrom(null);
                }}
              >
                <Zap size={16} />
                Start Now
              </button>
            </div>

            {formError && (
              <div className="admin-shift-alert error">
                <span className="admin-shift-alert-icon">⚠️</span>
                <span className="admin-shift-alert-text">{formError}</span>
              </div>
            )}

            <div className="admin-shift-form-body">
              {/* Date & Time Section */}
              <div className="admin-shift-form-section">
                <h3 className="admin-shift-section-title">Date & Time</h3>
                <div className="admin-shift-form-row">
                  <div className="admin-shift-form-group">
                    <label className="admin-shift-label">
                      <span className="admin-shift-label-text">Start Date</span>
                      <span className="admin-shift-label-required">*</span>
                    </label>
                    <div className="admin-shift-input-wrapper">
                      <span className="admin-shift-input-icon"><Calendar size={18} /></span>
                      <input
                        className="admin-shift-input"
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="admin-shift-form-group">
                    <label className="admin-shift-label">
                      <span className="admin-shift-label-text">Start Time</span>
                      <span className="admin-shift-label-required">*</span>
                    </label>
                    <div className="admin-shift-input-wrapper">
                      <span className="admin-shift-input-icon"><Clock size={18} /></span>
                      <input
                        className="admin-shift-input"
                        type="time"
                        value={form.start_time}
                        onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-shift-form-row">
                  <div className="admin-shift-form-group">
                    <label className="admin-shift-label">
                      <span className="admin-shift-label-text">End Date</span>
                      <span className="admin-shift-label-required">*</span>
                    </label>
                    <div className="admin-shift-input-wrapper">
                      <span className="admin-shift-input-icon"><Calendar size={18} /></span>
                      <input
                        className="admin-shift-input"
                        type="date"
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="admin-shift-form-group">
                    <label className="admin-shift-label">
                      <span className="admin-shift-label-text">End Time</span>
                      <span className="admin-shift-label-optional">(Optional)</span>
                    </label>
                    <div className="admin-shift-input-wrapper">
                      <span className="admin-shift-input-icon"><Clock size={18} /></span>
                      <input
                        className="admin-shift-input"
                        type="time"
                        value={form.end_time}
                        onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Section */}
              <div className="admin-shift-form-section">
                <h3 className="admin-shift-section-title">Location</h3>
                <div className="admin-shift-form-group full-width">
                  <LocationPicker
                    label="Location"
                    name={form.location_name}
                    address={form.address}
                    onChangeName={(v) => setForm((f) => ({ ...f, location_name: v }))}
                    onChangeAddress={(v) => setForm((f) => ({ ...f, address: v }))}
                    onSelect={({ name, address }) => setForm((f) => ({ ...f, location_name: name, address }))}
                  />
                </div>
              </div>

              {/* Job Type Section */}
              <div className="admin-shift-form-section">
                <h3 className="admin-shift-section-title">Job Type <span className="admin-shift-label-required">*</span></h3>
                <div className="admin-shift-job-types">
                  {JOB_TYPES.map((jt) => (
                    <button
                      key={jt}
                      type="button"
                      className={`admin-shift-job-btn ${form.job_type === jt ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, job_type: jt })}
                    >
                      {JOB_LABELS[jt]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes Section */}
              <div className="admin-shift-form-section">
                <h3 className="admin-shift-section-title">Notes <span className="admin-shift-label-optional">(Optional)</span></h3>
                <div className="admin-shift-textarea-wrapper">
                  <textarea
                    className="admin-shift-textarea"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Add any special instructions or details..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <div className="admin-shift-form-footer">
              <button
                type="button"
                className="admin-shift-btn cancel"
                onClick={() => {
                  const now = new Date().toISOString();
                  const d = toLocalInput(now);
                  setForm({
                    start_date: d.slice(0, 10),
                    start_time: d.slice(11, 16),
                    end_date: d.slice(0, 10),
                    end_time: '',
                    location_name: '',
                    address: '',
                    job_type: 'setup',
                    notes: '',
                  });
                  setFormError(null);
                  setDuplicateFrom(null);
                }}
                disabled={creating}
              >
                Clear
              </button>
              <button
                type="button"
                className="admin-shift-btn submit"
                onClick={createShift}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <span className="admin-shift-btn-spinner">⏳</span>
                    Creating...
                  </>
                ) : (
                  <>
                    <span className="admin-shift-btn-icon">✓</span>
                    Create Shift
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* UPCOMING TABLE */}
        <div className="card card--tight full admin-upcoming-table-card">
          <div className="upcoming-table-header row between wrap align-items-center">
            <strong className="fs-16">Upcoming Scheduled Shifts</strong>
            <span className="pill">
              <span className="pill__num">{upcoming.length}</span>
              <span className="pill__label">total</span>
            </span>
          </div>

          {loading && <div className="toast mt-sm">Loading…</div>}

          {!loading && upcoming.length === 0 && !err && (
            <div className="card upcoming-table-empty mt-sm">
              <div className="muted">No upcoming scheduled shifts.</div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="admin-upcoming-table-wrap table-wrap mt-sm">
              <table className="table table--admin table--compact upcoming-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Job</th>
                    <th>Location</th>
                    <th>Assigned</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {upcoming.map((r, i) => {
                    const emps = assignedMap[r.id] || [];

                    const assignedLabelFull =
                      emps.length > 0
                        ? emps.map((e) => e.full_name || e.id.slice(0, 8)).join(', ')
                        : '—';

                    const assignedLabelInitials =
                      emps.length > 0 ? emps.map((e) => getEmpInitials(e)).join(', ') : '—';

                    const jobLabel = r.job_type ? JOB_LABELS[r.job_type] : '—';

                    return (
                      <Fragment key={r.id}>
                        <tr id={`shift-row-${r.id}`} className={i % 2 === 1 ? 'row-alt' : ''}>
                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-when">
                            <div className="upcoming-table-cell-main">
                              <div>{fmtDate(r.start_time)}</div>
                              {r.end_time && (
                                <div className="muted fs-12">Ends {fmtTimeOnly(r.end_time)}</div>
                              )}
                            </div>
                          </td>

                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-job">
                            <span className="badge badge-job">{jobLabel}</span>
                          </td>

                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-location">
                            <div className="upcoming-table-cell-main">
                              <div>{r.location_name}</div>
                              {r.address && <div className="muted fs-12">{r.address}</div>}
                              {r.notes && <div className="muted fs-12">Notes: {r.notes}</div>}
                            </div>
                          </td>

                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-assigned">
                            {emps.length > 0 ? (
                              <span className="badge badge-assigned upcoming-table-assigned-badge-wrap">
                                <span className="assigned-label-full">{assignedLabelFull}</span>
                                <span className="assigned-label-initials">{assignedLabelInitials}</span>
                              </span>
                            ) : (
                              <span className="badge badge-unassigned">—</span>
                            )}
                          </td>

                          <td className="upcoming-table-td upcoming-table-td-actions upcoming-actions-desktop">
                            <div className="upcoming-table-actions-vert">
                              <button type="button" className="btn-edit" onClick={() => openEdit(r)}>
                                Edit
                              </button>
                              <button type="button" className="btn-edit" onClick={() => openAssign(r)}>
                                Assign
                              </button>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => prefillFormFromShift(r)}
                              >
                                Duplicate
                              </button>
                              <button type="button" className="btn-delete" onClick={() => deleteRow(r.id)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>

                        <tr className="upcoming-row-actions-mobile">
                          <td colSpan={5}>
                            <div className="upcoming-row-actions-mobile-inner">
                              <button type="button" className="btn-edit" onClick={() => openEdit(r)}>
                                Edit
                              </button>
                              <button type="button" className="btn-edit" onClick={() => openAssign(r)}>
                                Assign
                              </button>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => prefillFormFromShift(r)}
                              >
                                Duplicate
                              </button>
                              <button type="button" className="btn-delete" onClick={() => deleteRow(r.id)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* EDIT PANEL */}
      {edit && (
        <div id="edit-panel" className="card card--tight full mt-lg">
          <div className="row between wrap align-items-center mb-md">
            <strong>Edit Scheduled Shift</strong>
            <button
              type="button"
              className="topbar-btn"
              onClick={() => {
                const id = editingSourceId;
                setEdit(null);
                scrollToShiftRow(id);
              }}
            >
              Close
            </button>
          </div>

          <div className="edit-grid">
            <div>
              <label>Start</label>
              <input
                type="datetime-local"
                value={edit.start_time ? toLocalInput(edit.start_time) : ''}
                onChange={(e) => setEdit({ ...edit, start_time: e.target.value })}
              />
            </div>

            <div>
              <label>End (optional)</label>
              <input
                type="datetime-local"
                value={edit.end_time ? toLocalInput(edit.end_time) : ''}
                onChange={(e) => setEdit({ ...edit, end_time: e.target.value })}
              />
            </div>

            <div className="edit-full">
              {/* EDIT: editable + Google search */}
              <LocationPicker
                label="Location"
                name={edit.location_name ?? ''}
                address={edit.address ?? ''}
                onChangeName={(v) => setEdit((prev) => (prev ? { ...prev, location_name: v } : prev))}
                onChangeAddress={(v) => setEdit((prev) => (prev ? { ...prev, address: v } : prev))}
                onSelect={({ name, address }) =>
                  setEdit((prev) => (prev ? { ...prev, location_name: name, address } : prev))
                }
              />
            </div>

            <div className="edit-full">
              <label>Job Type</label>
              <select
                value={edit.job_type ?? 'setup'}
                onChange={(e) => setEdit({ ...edit, job_type: e.target.value as JobType })}
              >
                <option value="setup">Setup</option>
                <option value="lights">Lights</option>
                <option value="breakdown">Breakdown</option>
                <option value="other">Shop</option>
              </select>
            </div>

            <div className="edit-full">
              <label>Notes</label>
              <textarea
                value={edit.notes ?? ''}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </div>
          </div>

          <button type="button" className="btn-primary mt-md" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* ASSIGN PANEL */}
      {assignShift && (
        <div id="assign-panel" className="card card--tight full mt-lg">
          <div className="row between wrap align-items-center mb-md">
            <strong>
              Assign Employees — {assignShift.location_name || 'Shift'} ({fmtDate(assignShift.start_time)})
            </strong>
            <button
              type="button"
              className="topbar-btn"
              onClick={() => {
                const id = assignSourceId;
                setAssignShift(null);
                scrollToShiftRow(id);
              }}
            >
              Close
            </button>
          </div>

          <input
            className="mt-sm"
            placeholder="Search name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="assign-grid mt-md">
            {employees
              .filter((e) =>
                [e.full_name ?? '', e.id].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
              )
              .map((e) => (
                <label key={e.id} className="inline-check card">
                  <input
                    type="checkbox"
                    checked={assignees.includes(e.id)}
                    onChange={() => toggleEmp(e.id)}
                  />
                  <span>{e.full_name || e.id.slice(0, 8)}</span>
                </label>
              ))}
          </div>

          <button type="button" className="btn-primary mt-md" onClick={saveAssignments}>
            Save Assignments
          </button>
        </div>
      )}
          </div>
        </main>
      </div>
    </>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
