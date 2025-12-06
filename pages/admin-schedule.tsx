// pages/admin-schedule.tsx
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type Emp = { id: string; full_name?: string | null; email?: string | null };

type JobType = 'setup' | 'lights' | 'breakdown' | 'other';
const JOB_TYPES: JobType[] = ['setup', 'lights', 'breakdown', 'other'];

type SRow = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: JobType | null;
  notes?: string | null;
};

type Profile = { id: string; role: 'admin' | 'employee' } | null;

const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

const combineLocalDateTime = (date: string, time: string | undefined) => {
  const t = time && time.length >= 5 ? time : '09:00';
  return `${date}T${t}`;
};

// ---- NEW: helper to get initials for an employee ----
const getEmpInitials = (e: Emp) => {
  const name = e.full_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  const email = e.email?.trim();
  if (email) return email[0]?.toUpperCase() ?? '';

  return e.id.slice(0, 2).toUpperCase();
};

declare global {
  interface Window {
    google?: any;
  }
}

// ---------------- GOOGLE MAPS LOADER ----------------

const loadGoogleMaps = (() => {
  let promise: Promise<any> | null = null;

  return async () => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.google?.maps) return Promise.resolve(window.google.maps);

    if (!promise) {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key)
        return Promise.reject(
          new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'),
        );

      promise = (async () => {
        try {
          const mod = await import('@googlemaps/js-api-loader');
          const Loader =
            (mod as any).Loader ??
            (mod as any).default?.Loader ??
            (mod as any).default;
          if (!Loader) throw new Error('Could not load @googlemaps/js-api-loader');

          const loader = new Loader({
            apiKey: key,
            libraries: ['places'],
            version: 'weekly',
          });
          await loader.load();
          return window.google?.maps;
        } catch {
          const id = 'gmaps-js';
          if (document.getElementById(id)) return window.google?.maps;

          const s = document.createElement('script');
          s.id = id;
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
            key,
          )}&libraries=places&v=weekly`;
          s.async = true;
          await new Promise<void>((resolve, reject) => {
            s.onerror = () =>
              reject(new Error('Failed to load Google Maps JS API'));
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

// ---------------- LOCATION PICKER ----------------

function LocationPicker({
  valueName,
  valueAddr,
  onSelect,
}: {
  valueName: string;
  valueAddr: string;
  onSelect: (payload: { name: string; address: string }) => void;
}) {
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState('');
  const [preds, setPreds] = useState<
    Array<{ description: string; place_id: string }>
  >([]);
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
          svcRef.current =
            new (window as any).google.maps.places.AutocompleteService();
          const dummy = document.createElement('div');
          detailsSvcRef.current =
            new (window as any).google.maps.places.PlacesService(dummy);
          setReady(true);
        } else if ((window as any).google?.maps?.importLibrary) {
          try {
            const placesModule = await (window as any).google.maps.importLibrary(
              'places',
            );
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
            } else {
              setErrorText('Google Places constructors unavailable.');
              setReady(false);
            }
          } catch (ex: any) {
            setErrorText(ex?.message || 'Failed to load Places library.');
            setReady(false);
          }
        } else {
          setErrorText('Google Places API not available.');
          setReady(false);
        }
      } catch (err: any) {
        setErrorText(err?.message || 'Could not initialize Google Places.');
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
      svcRef.current.getPlacePredictions(
        {
          input: q.trim(),
          componentRestrictions: { country: 'us' },
          types: ['establishment', 'geocode'],
        },
        (res: any, status: any) => {
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !res
          ) {
            setPreds([]);
            return;
          }
          const ilOnly = res
            .filter((p: any) => p.description?.includes(', IL'))
            .map((p: any) => ({
              description: p.description,
              place_id: p.place_id,
            }));
          setPreds(ilOnly);
        },
      );
    }, 150);
    return () => clearTimeout(handle);
  }, [q, ready]);

  function pickPlace(placeId: string) {
    detailsSvcRef.current.getDetails(
      { placeId, fields: ['name', 'formatted_address'] },
      (place: any, status: any) => {
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !place
        )
          return;
        const name = place.name || '';
        const addr = place.formatted_address || '';
        onSelect({ name, address: addr });
        setQ(name || addr);
        setPreds([]);
      },
    );
  }

  return (
    <div className="location-picker-card card p-18">
      <div className="location-picker-section">
        <label className="location-picker-label">Search Location</label>
        <input
          aria-label="Location search"
          className="location-picker-input"
          placeholder="Type a place or address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!ready && !errorText && (
          <div className="muted fs-12">Loading Places…</div>
        )}
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
          <input className="location-picker-input" value={valueName} readOnly />
        </div>
        <div className="location-picker-field">
          <label className="location-picker-label">Address</label>
          <input className="location-picker-input" value={valueAddr} readOnly />
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
    const now = new Date();
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
  const [saving, setSaving] = useState(false);

  const [assignShift, setAssignShift] = useState<SRow | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [, setTick] = useState(0);

  // which row opened the edit/assign panel (for scroll back)
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [assignSourceId, setAssignSourceId] = useState<string | null>(null);

  // helper: scroll back to a row by id
  function scrollToShiftRow(id: string | null) {
    if (!id) return;
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const row = document.getElementById(`shift-row-${id}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
    s
      ? new Date(s).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '';

  const fmtTimeOnly = (s?: string | null) =>
    s ? new Date(s).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '';

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
      const r = await fetch('/api/schedule/shifts');
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setRows(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (me?.role === 'admin') loadRows();
  }, [me]);

  // ---------- EMPLOYEES ----------
  useEffect(() => {
    (async () => {
      if (!(me && me.role === 'admin')) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
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
      .sort(
        (a, b) =>
          (Date.parse(a.start_time ?? '') || 0) -
          (Date.parse(b.start_time ?? '') || 0),
      );
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
        .select('schedule_shift_id, profiles:employee_id ( id, full_name, email )')
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
        start_time: new Date(startLocal).toISOString(),
        end_time: endLocal ? new Date(endLocal).toISOString() : null,
        location_name: form.location_name || undefined,
        address: form.address || undefined,
        job_type: form.job_type,
        notes: form.notes || undefined,
        created_by: (me as any).id,
      };

      const r = await fetch('/api/schedule/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);

      const now = new Date();
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

  // when edit panel is set, scroll to it
  useEffect(() => {
    if (!edit) return;
    const el = document.getElementById('edit-panel');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [edit]);

  function prefillFormFromShift(row: SRow) {
    const start = row.start_time ? new Date(row.start_time) : new Date();
    const d = toLocalInput(start);
    const start_date = d.slice(0, 10);

    let end_date = start_date;
    if (row.end_time) {
      const e = new Date(row.end_time);
      const ed = toLocalInput(e);
      end_date = ed.slice(0, 10);
    }

    setForm({
      start_date,
      start_time: '',
      end_date,
      end_time: '',
      location_name: row.location_name ?? '',
      address: row.address ?? '',
      job_type: 'setup',
      notes: row.notes ?? '',
    });

    setDuplicateFrom(row);
  }

  async function saveEdit() {
    if (!edit?.id) return;
    const shiftId = edit.id; // remember which row
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

      if (body.start_time && !body.start_time.endsWith?.('Z'))
        body.start_time = new Date(body.start_time).toISOString();

      if (body.end_time && !body.end_time.endsWith?.('Z'))
        body.end_time = new Date(body.end_time).toISOString();

      const r = await fetch(`/api/schedule/shifts/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);

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
    const r = await fetch(`/api/schedule/shifts/${id}`, { method: 'DELETE' });
    const j: any = await parseMaybeJson(r);
    if (!r.ok) return alert(j?.error || j?.raw || `HTTP ${r.status}`);

    await loadRows();
  }

  // ---------- OPEN ASSIGN ----------
  async function openAssign(row: SRow) {
    setAssignShift(row);
    setAssignSourceId(row.id);
    setSearch('');

    // reset lists immediately for clean UI
    setCurrentAssignees([]);
    setAssignees([]);

    const { data } = await supabase
      .from('schedule_assignments')
      .select('employee_id')
      .eq('schedule_shift_id', row.id);

    const ids = (data || []).map((r: any) => r.employee_id);
    setCurrentAssignees(ids);
    setAssignees(ids);
  }

  // when assign panel is set, scroll to it
  useEffect(() => {
    if (!assignShift) return;
    const el = document.getElementById('assign-panel');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [assignShift]);

  function toggleEmp(id: string) {
    setAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function saveAssignments() {
    if (!assignShift?.id) return;

    const shiftId = assignShift.id;

    const add = assignees.filter((x) => !currentAssignees.includes(x));
    const remove = currentAssignees.filter((x) => !assignees.includes(x));

    if (add.length) {
      const r = await fetch(`/api/schedule/shifts/${shiftId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: add }),
      });
      if (!r.ok) return alert('Failed to add assignments');
    }

    if (remove.length) {
      const r = await fetch(`/api/schedule/shifts/${shiftId}/assign`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: remove }),
      });
      if (!r.ok) return alert('Failed to remove assignments');
    }

    setAssignShift(null);
    setAssignedMap((prev) => ({
      ...prev,
      [shiftId]: employees.filter((e) => assignees.includes(e.id)),
    }));
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
    <main className="page page--center page--admin">
      {/* HEADER CARD */}
      <div className="card card--tight full">
        <div className="toolbar toolbar--center">
          <div className="toolbar__left">
            <h1 className="page__title">Admin – Scheduling</h1>
            <div className="muted fs-12">
              Create shifts, assign employees, and manage upcoming schedule.
            </div>
          </div>
          <div className="toolbar__left">
            <Link href="/admin-schedule-past" className="topbar-btn">
              View Past Shifts
            </Link>
            <button type="button" className="topbar-btn" onClick={loadRows}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* MAIN GRID: FORM + TABLE */}
      <div className="admin-schedule-layout">
        {/* FORM */}
        <div className="form-container">
          <div className="card card--tight full form-card">
            <div className="row between wrap align-items-center mb-md">
              <strong className="fs-16">
                {duplicateFrom
                  ? `Create Scheduled Shift (duplicating ${
                      duplicateFrom.location_name || 'shift'
                    })`
                  : 'Create Scheduled Shift'}
              </strong>

              <div className="row gap-sm">
                <button
                  type="button"
                  className="topbar-btn"
                  onClick={() => {
                    const now = new Date();
                    const d = toLocalInput(now);
                    setForm((f) => ({
                      ...f,
                      start_date: d.slice(0, 10),
                      start_time: d.slice(11, 16),
                    }));
                    setDuplicateFrom(null);
                  }}
                >
                  Start Now
                </button>
              </div>
            </div>

            <div className="grid-auto-fit-160 mb-md">
              <div>
                <label>Start Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm({ ...form, start_date: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Start Time</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm({ ...form, start_time: e.target.value })
                  }
                />
              </div>

              <div>
                <label>End Date</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) =>
                    setForm({ ...form, end_date: e.target.value })
                  }
                />
              </div>

              <div>
                <label>End Time (Optional)</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm({ ...form, end_time: e.target.value })
                  }
                />
              </div>
            </div>

            <LocationPicker
              valueName={form.location_name}
              valueAddr={form.address}
              onSelect={({ name, address }) =>
                setForm((f) => ({ ...f, location_name: name, address }))
              }
            />

            <div className="mt-md">
              <label>Job Type</label>
              <div className="row wrap gap-sm mt-xs">
                {JOB_TYPES.map((jt) => (
                  <button
                    key={jt}
                    type="button"
                    className={`pill ${
                      form.job_type === jt ? 'pill-active' : ''
                    }`}
                    onClick={() => setForm({ ...form, job_type: jt })}
                  >
                    <span className="pill__label">
                      {jt[0].toUpperCase() + jt.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-md">
              <label>Notes</label>
              <textarea
                placeholder="Optional instructions"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {formError && <div className="alert error mt-sm">{formError}</div>}

            <div className="form-actions mt-md">
              <button
                type="button"
                className="btn-primary"
                onClick={createShift}
                disabled={creating}
              >
                {creating ? 'Creating…' : 'Create Scheduled Shift'}
              </button>

              <button
                type="button"
                className="topbar-btn"
                onClick={() => {
                  const now = new Date();
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
              >
                Clear
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
                        ? emps
                            .map(
                              (e) =>
                                e.full_name ||
                                e.email ||
                                e.id.slice(0, 8),
                            )
                            .join(', ')
                        : '—';

                    const assignedLabelInitials =
                      emps.length > 0
                        ? emps.map((e) => getEmpInitials(e)).join(', ')
                        : '—';

                    return (
                      <Fragment key={r.id}>
                        {/* MAIN ROW */}
                        <tr
                          id={`shift-row-${r.id}`}
                          className={i % 2 === 1 ? 'row-alt' : ''}
                        >
                          {/* WHEN */}
                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-when">
                            <div className="upcoming-table-cell-main">
                              <div>{fmtDate(r.start_time)}</div>
                              {r.end_time && (
                                <div className="muted fs-12">
                                  Ends {fmtTimeOnly(r.end_time)}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* JOB */}
                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-job">
                            <span className="badge badge-job">{r.job_type}</span>
                          </td>

                          {/* LOCATION */}
                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-location">
                            <div className="upcoming-table-cell-main">
                              <div>{r.location_name}</div>
                              {r.address && (
                                <div className="muted fs-12">{r.address}</div>
                              )}
                              {r.notes && (
                                <div className="muted fs-12">
                                  Notes: {r.notes}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* ASSIGNED */}
                          <td className="upcoming-table-td upcoming-table-td-middle upcoming-col-assigned">
                            {emps.length > 0 ? (
                              <span className="badge badge-assigned upcoming-table-assigned-badge-wrap">
                                <span className="assigned-label-full">
                                  {assignedLabelFull}
                                </span>
                                <span className="assigned-label-initials">
                                  {assignedLabelInitials}
                                </span>
                              </span>
                            ) : (
                              <span className="badge badge-unassigned">—</span>
                            )}
                          </td>

                          {/* DESKTOP ACTIONS */}
                          <td className="upcoming-table-td upcoming-table-td-actions upcoming-actions-desktop">
                            <div className="upcoming-table-actions-vert">
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => openEdit(r)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => openAssign(r)}
                              >
                                Assign
                              </button>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => prefillFormFromShift(r)}
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                className="btn-delete"
                                onClick={() => deleteRow(r.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* MOBILE ACTIONS ROW */}
                        <tr className="upcoming-row-actions-mobile">
                          <td colSpan={5}>
                            <div className="upcoming-row-actions-mobile-inner">
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => openEdit(r)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => openAssign(r)}
                              >
                                Assign
                              </button>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => prefillFormFromShift(r)}
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                className="btn-delete"
                                onClick={() => deleteRow(r.id)}
                              >
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
                value={
                  edit.start_time ? toLocalInput(new Date(edit.start_time)) : ''
                }
                onChange={(e) =>
                  setEdit({ ...edit, start_time: e.target.value })
                }
              />
            </div>

            <div>
              <label>End (optional)</label>
              <input
                type="datetime-local"
                value={
                  edit.end_time ? toLocalInput(new Date(edit.end_time)) : ''
                }
                onChange={(e) =>
                  setEdit({ ...edit, end_time: e.target.value })
                }
              />
            </div>

            <div>
              <label>Location Name</label>
              <input
                value={edit.location_name ?? ''}
                onChange={(e) =>
                  setEdit({ ...edit, location_name: e.target.value })
                }
              />
            </div>

            <div>
              <label>Address</label>
              <input
                value={edit.address ?? ''}
                onChange={(e) =>
                  setEdit({ ...edit, address: e.target.value })
                }
              />
            </div>

            <div className="edit-full">
              <label>Job Type</label>
              <select
                value={edit.job_type ?? 'setup'}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    job_type: e.target.value as JobType,
                  })
                }
              >
                <option value="setup">Setup</option>
                <option value="lights">Lights</option>
                <option value="breakdown">Breakdown</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="edit-full">
              <label>Notes</label>
              <textarea
                value={edit.notes ?? ''}
                onChange={(e) =>
                  setEdit({ ...edit, notes: e.target.value })
                }
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-primary mt-md"
            onClick={saveEdit}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* ASSIGN PANEL */}
      {assignShift && (
        <div id="assign-panel" className="card card--tight full mt-lg">
          <div className="row between wrap align-items-center mb-md">
            <strong>
              Assign Employees — {assignShift.location_name || 'Shift'} (
              {fmtDate(assignShift.start_time)})
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
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="assign-grid mt-md">
            {employees
              .filter((e) =>
                [e.full_name ?? '', e.email ?? '', e.id].some((v) =>
                  v?.toLowerCase().includes(search.toLowerCase()),
                ),
              )
              .map((e) => (
                <label key={e.id} className="inline-check card">
                  <input
                    type="checkbox"
                    checked={assignees.includes(e.id)}
                    onChange={() => toggleEmp(e.id)}
                  />
                  <span>{e.full_name || e.email || e.id.slice(0, 8)}</span>
                </label>
              ))}
          </div>

          <button
            type="button"
            className="btn-primary mt-md"
            onClick={saveAssignments}
          >
            Save Assignments
          </button>
        </div>
      )}
    </main>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
