// pages/admin-schedule.tsx
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Emp = { id: string; full_name?: string | null; email?: string | null };

// Strong job-type union
type JobType = 'setup' | 'Lights' | 'breakdown' | 'other';
const JOB_TYPES: JobType[] = ['setup', 'Lights', 'breakdown', 'other'];

type SRow = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: JobType | null;
  notes?: string | null;
};

// ---------- Small date/time helpers ----------
const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const combineLocalDateTime = (date: string, time: string | undefined) => {
  const t = time && time.length >= 5 ? time : '09:00';
  return `${date}T${t}`;
};

const addHoursToLocalInput = (localDateTime: string, hours: number) => {
  const d = new Date(localDateTime);
  d.setHours(d.getHours() + hours);
  return toLocalInput(d).slice(0, 16);
};

// ---- Google Maps loader (script tag; no @googlemaps/js-api-loader) ----
declare global { interface Window { google?: any } }

const loadGoogleMaps = (() => {
  let promise: Promise<any> | null = null;

  return () => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.google?.maps?.places) return Promise.resolve(window.google.maps);

    if (!promise) {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));

      promise = new Promise((resolve, reject) => {
        const id = 'gmaps-js';
        if (document.getElementById(id)) return resolve(window.google?.maps);

        const s = document.createElement('script');
        s.id = id;
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          key
        )}&libraries=places&v=weekly&loading=async`;
        s.async = true;
        s.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
        s.onload = () => resolve(window.google?.maps);
        document.head.appendChild(s);
      });
    }
    return promise;
  };
})();

// --- LocationPicker: uses AutocompleteService + PlacesService.getDetails ---
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

        // Initialize classical Places services used by this picker (AutocompleteService + PlacesService).
        // Prefer the already-attached `window.google.maps.places` namespace; if it's not present
        // but the new loader's importLibrary is available, try to obtain constructors from it.
        if ((window as any).google?.maps?.places) {
          svcRef.current = new (window as any).google.maps.places.AutocompleteService();
          const dummy = document.createElement('div');
          detailsSvcRef.current = new (window as any).google.maps.places.PlacesService(dummy);
          setReady(true);
        } else if ((window as any).google?.maps?.importLibrary) {
          try {
            const placesModule = await (window as any).google.maps.importLibrary('places');
            const AutocompleteServiceCtor = placesModule?.AutocompleteService ?? (window as any).google?.maps?.places?.AutocompleteService;
            const PlacesServiceCtor = placesModule?.PlacesService ?? (window as any).google?.maps?.places?.PlacesService;
            if (AutocompleteServiceCtor && PlacesServiceCtor) {
              svcRef.current = new AutocompleteServiceCtor();
              const dummy = document.createElement('div');
              detailsSvcRef.current = new PlacesServiceCtor(dummy);
              setReady(true);
            } else {
              // importLibrary didn't provide constructors — fall back to manual entry mode with a helpful error
              const msg = 'Google Maps Places API constructors unavailable via importLibrary; falling back to manual location entry. Check API key, enabled Places API, and that the loader exposes the places library.';
              console.warn(msg, { google: !!(window as any).google, importLibrary: !!(window as any).google?.maps?.importLibrary });
              setErrorText(msg);
              setReady(false);
            }
          } catch (ex: any) {
            const msg = `Failed to import Places via importLibrary: ${ex?.message || String(ex)}; falling back to manual location entry.`;
            console.warn(msg, ex);
            setErrorText(msg);
            setReady(false);
          }
        } else {
          // Places API not available on the page (neither global nor importLibrary)
          const msg = 'Google Maps Places API not available; falling back to manual location entry. Ensure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the Places API is enabled in Google Cloud, billing is active, and the script is loaded with &libraries=places.';
          console.warn(msg, { google: !!(window as any).google, importLibrary: !!(window as any).google?.maps?.importLibrary });
          setErrorText(msg);
          setReady(false);
        }
      } catch (err: any) {
        setErrorText(
          err?.message ||
            'Could not initialize Google Places. Check API key, enabled APIs, billing, and referrers.'
        );
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Throttled fetch for predictions
  useEffect(() => {
    if (!ready || !q.trim()) { setPreds([]); return; }
    const handle = setTimeout(() => {
      svcRef.current.getPlacePredictions(
        {
          input: q.trim(),
          componentRestrictions: { country: 'us' }, // adjust/remove as needed
          types: ['establishment', 'geocode'],
        },
        (res: any, status: any) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !res) {
            setPreds([]);
            return (
              <div className="page">
                <h1 className="page__title">Admin – Scheduling (separate from payroll)</h1>

                <div className="center mb-12">
                  <Link href="/admin-schedule-past" className="nav-link">View Past Shifts</Link>
                  <button type="button" className="topbar-btn ml-8" onClick={loadRows}>Refresh</button>
                </div>

  function pickPlace(placeId: string) {
    detailsSvcRef.current.getDetails(
      {
        placeId,
        fields: ['name', 'formatted_address'],
      },
      (place: any, status: any) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) return;
        const name = place.name || '';
        const addr = place.formatted_address || '';
        onSelect({ name, address: addr });
        setQ(place.name || place.formatted_address || '');
        setPreds([]);
      }
    );
  }

  return (
    <div className="grid gap-10">
      <label>Search Location</label>
      <input
        aria-label="Location search"
        placeholder="Type a place or address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!ready && !errorText && (
        <div className="muted fs-12">Loading Places…</div>
      )}
      {errorText && <div className="alert error fs-12">{errorText}</div>}

      {preds.length > 0 && (
        <div className="card p-6 maxh-220 ovf-y-auto">
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

      <div className="row wrap gap-10">
        <div className="flex-1-min220">
          <label>Location Name</label>
          <input aria-label="Location name" value={valueName} readOnly />
        </div>
        <div className="flex-1-min220">
          <label>Address</label>
          <input aria-label="Address" value={valueAddr} readOnly />
        </div>
      </div>
    </div>
  );
}

export default function AdminSchedule() {
  // ---------- Auth ----------
  const [adminId, setAdminId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAdminId(data.session?.user?.id ?? null);
    })();
  }, []);

  // ---------- Data ----------
  const [rows, setRows] = useState<SRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, Emp[]>>({});

  // ---------- Create form (refined state) ----------
  const [form, setForm] = useState<{
    start_date: string;
    start_time: string;
    use_duration: boolean;
    duration_hours: number;
    end_date: string;
    end_time: string;
    location_name: string;
    address: string;
    job_type: JobType;
    notes: string;
  }>(() => {
    const now = new Date();
    const defaultDate = toLocalInput(now).slice(0, 10);
    const defaultTime = toLocalInput(now).slice(11, 16);
    return {
      start_date: defaultDate,
      start_time: defaultTime,
      use_duration: true,
      duration_hours: 2,
      end_date: defaultDate,
      end_time: '',
      location_name: '',
      address: '',
      job_type: 'setup',
      notes: '',
    };
  });

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ---------- Edit panel ----------
  const [edit, setEdit] = useState<SRow | null>(null);
  const [saving, setSaving] = useState(false);

  // ---------- Assign panel ----------
  const [assignShift, setAssignShift] = useState<SRow | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Heartbeat (auto-roll to past)
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ---------- Helpers ----------
  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { return await r.json(); } catch {}
    }
    const raw = await r.text();
    return { raw };
  }

  // ---------- Load shifts ----------
  async function loadRows() {
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
  useEffect(() => { loadRows(); }, []);

  // ---------- Employees list for assignments ----------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });
      if (!error) setEmployees((data as Emp[]) || []);
    })();
  }, []);

  const filteredEmps = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.full_name ?? '', e.email ?? '', e.id].some((v) => v?.toLowerCase().includes(q))
    );
  }, [employees, search]);

  // ---------- Upcoming subset ----------
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

  // Load assignments for visible upcoming shifts
  useEffect(() => {
    (async () => {
      const ids = upcoming.map((r) => r.id);
      if (ids.length === 0) { setAssignedMap({}); return; }
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
  }, [upcoming.length]);

  // ---------- Actions ----------
  function validateForm() {
    if (!form.start_date) return 'Start date is required.';
    if (!form.use_duration) {
      if (!form.end_date || !form.end_time) return 'End date and time are required.';
      const startLocal = combineLocalDateTime(form.start_date, form.start_time);
      const endLocal = combineLocalDateTime(form.end_date, form.end_time);
      if (new Date(endLocal) <= new Date(startLocal)) return 'End time must be after start time.';
    } else {
      if (form.duration_hours <= 0) return 'Duration must be greater than 0 hours.';
    }
    return null;
  }

  async function createShift() {
    if (!adminId) return alert('Sign in as admin first.');
    const v = validateForm();
    setFormError(v);
    if (v) return;

    setCreating(true);
    try {
      const startLocal = combineLocalDateTime(form.start_date, form.start_time);
      let endLocal: string | null = null;

      if (form.use_duration) {
        endLocal = addHoursToLocalInput(startLocal, form.duration_hours).slice(0, 16);
      } else {
        endLocal = combineLocalDateTime(form.end_date, form.end_time);
      }

      const body = {
        start_time: new Date(startLocal).toISOString(),
        end_time: endLocal ? new Date(endLocal).toISOString() : null,
        location_name: form.location_name || undefined,
        address: form.address || undefined,
        job_type: form.job_type || undefined,
        notes: form.notes || undefined,
        created_by: adminId,
      };

      const r = await fetch('/api/schedule/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);

      const now = new Date();
      const defaultDate = toLocalInput(now).slice(0, 10);
      const defaultTime = toLocalInput(now).slice(11, 16);
      setForm({
        start_date: defaultDate,
        start_time: defaultTime,
        use_duration: true,
        duration_hours: 2,
        end_date: defaultDate,
        end_time: '',
        location_name: '',
        address: '',
        job_type: 'setup',
        notes: '',
      });
      setFormError(null);
      await loadRows();
      alert('Scheduled shift created.');
    } catch (e: any) {
      alert(e.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(row: SRow) {
    setEdit({ ...row });
    setTimeout(() => document.getElementById('edit-panel')?.scrollIntoView({ behavior: 'smooth' }), 0);
  }

  async function saveEdit() {
    if (!edit?.id) return;
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
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setEdit(null);
      await loadRows();
      alert('Shift updated.');
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
    alert('Shift deleted.');
  }

  async function openAssign(row: SRow) {
    setAssignShift(row);
    setSearch('');
    const { data, error } = await supabase
      .from('schedule_assignments')
      .select('employee_id')
      .eq('schedule_shift_id', row.id);
    if (!error) {
      const ids = (data || []).map((r: any) => r.employee_id as string);
      setCurrentAssignees(ids);
      setAssignees(ids);
    } else {
      setCurrentAssignees([]);
      setAssignees([]);
    }
    setTimeout(() => document.getElementById('assign-panel')?.scrollIntoView({ behavior: 'smooth' }), 0);
  }
  function toggleEmp(id: string) {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  async function saveAssignments() {
    if (!assignShift?.id) return;
    const add = assignees.filter((x) => !currentAssignees.includes(x));
    const remove = currentAssignees.filter((x) => !assignees.includes(x));
    if (add.length) {
      const r = await fetch(`/api/schedule/shifts/${assignShift.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_ids: add }),
      });
      if (!r.ok) return alert('Failed to add assignments');
    }
    if (remove.length) {
      const r = await fetch(`/api/schedule/shifts/${assignShift.id}/assign`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_ids: remove }),
      });
      if (!r.ok) return alert('Failed to remove assignments');
    }
    setAssignShift(null);
    alert('Assignments updated.');
    setAssignedMap((prev) => ({
      ...prev,
      [assignShift.id!]: employees.filter((e) => assignees.includes(e.id)),
    }));
  }

  // ---------- UI ----------
  return (
    <div className="page">
      <h1 className="page__title">Admin – Scheduling (separate from payroll)</h1>

      {/* Top actions */}
      <div className="center" style={{ marginBottom: 12 }}>
        <Link href="/admin-schedule-past" className="nav-link">View Past Shifts</Link>
        <button type="button" className="topbar-btn" style={{ marginLeft: 8 }} onClick={loadRows}>
          Refresh
        </button>
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* Two-column: Form | Upcoming */}
  <div className="row wrap gap-md">
        {/* Create form */}
        <div className="card p-14 flex-1-380 maxw-620">
          <div className="row between wrap align-items-center">
            <strong className="fs-16">Create Scheduled Shift</strong>
            <div className="row gap-sm">
              <button
                type="button"
                className="topbar-btn"
                onClick={() => {
                  const now = new Date();
                  setForm((f) => ({
                    ...f,
                    start_date: toLocalInput(now).slice(0, 10),
                    start_time: toLocalInput(now).slice(11, 16),
                  }));
                }}
              >
                Start Now
              </button>
            </div>
          </div>

          {/* Time grid */}
          <div className="mt-lg grid-auto-fit-160">
            <div>
              <label>Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label>Start Time</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="align-self-end">
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={form.use_duration}
                  onChange={(e) => setForm({ ...form, use_duration: e.target.checked })}
                />
                <span>Use duration</span>
              </label>
            </div>
            {form.use_duration ? (
              <div>
                <label>Duration (hours)</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={form.duration_hours}
                  onChange={(e) => setForm({ ...form, duration_hours: Number(e.target.value || 0) })}
                />
                <div className="row gap-sm mt-6">
                  {[2, 3, 4].map((h) => (
                    <button key={h} type="button" className="pill" onClick={() => setForm({ ...form, duration_hours: h })}>
                      <span className="pill__label">+{h}h</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label>End Date</label>
                  <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
                <div>
                  <label>End Time</label>
                  <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </>
            )}
          </div>

          {/* Location search with autofill */}
          <div className="mt-lg">
            <LocationPicker
              valueName={form.location_name}
              valueAddr={form.address}
              onSelect={({ name, address }) => setForm((f) => ({ ...f, location_name: name, address }))}
            />
          </div>

          {/* Job type pills */}
            <div className="mt-lg">
            <label>Job Type</label>
            <div className="row wrap gap-sm mt-6">
              {JOB_TYPES.map(jt => (
                <button
                  key={jt}
                  type="button"
                  className={`pill ${form.job_type === jt ? 'pill-active' : ''}`}
                  onClick={() => setForm({ ...form, job_type: jt })}
                >
                  <span className="pill__label">{jt[0].toUpperCase() + jt.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mt-lg">
            <label>Notes</label>
            <textarea
              placeholder="Optional instructions (e.g., bring ladder; load truck)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {formError && <div className="alert error mt-lg">{formError}</div>}

          <div className="mt-lg row gap-sm">
            <button type="button" className="btn-primary" onClick={createShift} disabled={creating || !adminId}>
              {creating ? 'Creating…' : 'Create Scheduled Shift'}
            </button>
            <button
              type="button"
              className="topbar-btn"
              onClick={() => {
                const now = new Date();
                const defaultDate = toLocalInput(now).slice(0, 10);
                const defaultTime = toLocalInput(now).slice(11, 16);
                setForm({
                  start_date: defaultDate,
                  start_time: defaultTime,
                  use_duration: true,
                  duration_hours: 2,
                  end_date: defaultDate,
                  end_time: '',
                  location_name: '',
                  address: '',
                  job_type: 'setup',
                  notes: '',
                });
                setFormError(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Upcoming table */}
        <div className="card" style={{ padding: 12, flex: '2 1 520px' }}>
          <div className="row between">
            <strong>Upcoming Scheduled Shifts</strong>
            <span className="pill">
              <span className="pill__num">{upcoming.length}</span>
              <span className="pill__label">total</span>
            </span>
          </div>

          {loading && <div className="toast" style={{ marginTop: 10 }}>Loading…</div>}

          {!loading && upcoming.length === 0 && !err && (
            <div className="card" style={{ padding: 12, marginTop: 10 }}>
              <div className="muted">No upcoming scheduled shifts.</div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="table table--admin">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Job</th>
                    <th>Location</th>
                    <th>Address</th>
                    <th>Assigned</th>
                    <th className="col-hide-md">Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((r) => {
                    const emps = assignedMap[r.id] || [];
                    const assignedLabel = emps.length
                      ? emps.map((e) => e.full_name || e.email || e.id.slice(0, 8)).join(', ')
                      : '—';
                    return (
                      <tr key={r.id}>
                        <td>{fmt(r.start_time)}</td>
                        <td>{fmt(r.end_time)}</td>
                        <td>{r.job_type}</td>
                        <td>{r.location_name}</td>
                        <td>{r.address}</td>
                        <td>{assignedLabel}</td>
                        <td className="col-hide-md">{r.notes}</td>
                        <td>
                          <div className="actions">
                            <button type="button" className="btn-edit" onClick={() => openEdit(r)}>Edit</button>
                            <button type="button" className="btn-edit" onClick={() => openAssign(r)}>Assign</button>
                            <button type="button" className="btn-delete" onClick={() => deleteRow(r.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit panel */}
      {edit && (
        <div id="edit-panel" className="card mt-lg" style={{ padding: 16 }}>
          <div className="row between">
            <strong>Edit Scheduled Shift</strong>
            <button type="button" className="topbar-btn" onClick={() => setEdit(null)}>Close</button>
          </div>

          <div className="mt-lg" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
            <div>
              <label>Start</label>
              <input
                type="datetime-local"
                value={edit.start_time ? toLocalInput(new Date(edit.start_time)) : ''}
                onChange={(e) => setEdit({ ...edit, start_time: e.target.value })}
              />
            </div>
            <div>
              <label>End (optional)</label>
              <input
                type="datetime-local"
                value={edit.end_time ? toLocalInput(new Date(edit.end_time)) : ''}
                onChange={(e) => setEdit({ ...edit, end_time: e.target.value })}
              />
            </div>
            <div>
              <label>Location Name</label>
              <input value={edit.location_name ?? ''} onChange={(e) => setEdit({ ...edit, location_name: e.target.value })} />
            </div>
            <div>
              <label>Address</label>
              <input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Job Type</label>
              <select value={edit.job_type ?? 'setup'} onChange={(e) => setEdit({ ...edit, job_type: e.target.value as JobType })}>
                <option value="setup">Setup</option>
                <option value="Lights">Lights</option>
                <option value="breakdown">Breakdown</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>
          </div>

          <div className="mt-lg">
            <button type="button" className="btn-primary" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Assign panel */}
      {assignShift && (
        <div id="assign-panel" className="card mt-lg" style={{ padding: 16 }}>
          <div className="row between">
            <strong>
              Assign Employees — {assignShift.location_name || 'Shift'} ({fmt(assignShift.start_time)})
            </strong>
            <button type="button" className="topbar-btn" onClick={() => setAssignShift(null)}>Close</button>
          </div>

          <input className="mt-lg" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />

          <div className="mt-lg" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {filteredEmps.map((e) => (
              <label key={e.id} className="inline-check card" style={{ padding: 10 }}>
                <input type="checkbox" checked={assignees.includes(e.id)} onChange={() => toggleEmp(e.id)} />
                <span>{e.full_name || e.email || e.id.slice(0, 8)}</span>
              </label>
            ))}
          </div>

          <div className="mt-lg">
            <button type="button" className="btn-primary" onClick={saveAssignments}>Save Assignments</button>
          </div>
        </div>
      )}
    </div>
  );
}
