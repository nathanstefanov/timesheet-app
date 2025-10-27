// pages/admin-schedule.tsx
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Emp = { id: string; full_name?: string | null; email?: string | null };
type SRow = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: 'setup' | 'event' | 'breakdown' | 'other' | null;
  status?: 'draft' | 'confirmed' | 'changed' | null;
  notes?: string | null;
};

export default function AdminSchedule() {
  const [adminId, setAdminId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAdminId(data.session?.user?.id ?? null);
    })();
  }, []);

  const [rows, setRows] = useState<SRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    start_time: '',
    end_time: '',
    location_name: '',
    address: '',
    job_type: 'setup',
    status: 'draft',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState<SRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignShiftId, setAssignShiftId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // tick every 60s so a shift automatically moves from Upcoming -> Past without manual refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { return await r.json(); } catch {}
    }
    const raw = await r.text();
    return { raw };
  }

  async function loadRows() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/schedule/shifts');
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      const list: SRow[] = Array.isArray(j) ? j : [];
      setRows(list);
    } catch (e: any) {
      setErr(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

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
    const n = search.toLowerCase();
    if (!n) return employees;
    return employees.filter(e =>
      [e.full_name ?? '', e.email ?? '', e.id].some(v => v?.toLowerCase().includes(n))
    );
  }, [employees, search]);

  function fmt(s?: string | null) {
    return s ? new Date(s).toLocaleString() : '';
  }

  // ✅ Upcoming filter:
  // upcoming if (end_time > now) OR (no end_time AND start_time >= now)
  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter(r => {
        const start = r.start_time ? Date.parse(r.start_time) : NaN;
        const end   = r.end_time   ? Date.parse(r.end_time)   : NaN;
        if (!isNaN(end))   return end   >= now;
        if (!isNaN(start)) return start >= now;
        return false;
      })
      .sort((a, b) => {
        const as = a.start_time ? Date.parse(a.start_time) : 0;
        const bs = b.start_time ? Date.parse(b.start_time) : 0;
        return as - bs; // soonest first
      });
  }, [rows]);

  async function createShift() {
    if (!adminId) return alert('Sign in as admin first.');
    if (!form.start_time) return alert('Start time is required.');
    setCreating(true);
    try {
      const body = {
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        location_name: form.location_name || undefined,
        address: form.address || undefined,
        job_type: form.job_type || undefined,
        status: form.status || undefined,
        notes: form.notes || undefined,
        created_by: adminId,
      };
      const r = await fetch('/api/schedule/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);

      setForm({
        start_time: '',
        end_time: '',
        location_name: '',
        address: '',
        job_type: 'setup',
        status: 'draft',
        notes: '',
      });
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
    setDrawerOpen(true);
  }

  async function saveEdit() {
    if (!edit?.id) return;
    setSaving(true);
    try {
      const body: any = {
        start_time: edit.start_time || undefined,
        end_time: edit.end_time || null,
        location_name: edit.location_name ?? undefined,
        address: edit.address ?? undefined,
        job_type: edit.job_type ?? undefined,
        status: edit.status ?? undefined,
        notes: edit.notes ?? undefined,
      };
      if (body.start_time && !body.start_time.endsWith('Z')) {
        body.start_time = new Date(body.start_time).toISOString();
      }
      if (body.end_time && !body.end_time.endsWith('Z')) {
        body.end_time = new Date(body.end_time).toISOString();
      }

      const r = await fetch(`/api/schedule/shifts/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);

      setDrawerOpen(false);
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
    setDeleting(true);
    try {
      const r = await fetch(`/api/schedule/shifts/${id}`, { method: 'DELETE' });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      await loadRows();
      alert('Shift deleted.');
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function openAssign(row: SRow) {
    setAssignShiftId(row.id);
    setAssignOpen(true);
    setSearch('');
    try {
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
    } catch {
      setCurrentAssignees([]);
      setAssignees([]);
    }
  }

  function toggleEmp(id: string) {
    setAssignees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function saveAssignments() {
    if (!assignShiftId) return;
    try {
      const add = assignees.filter(x => !currentAssignees.includes(x));
      const remove = currentAssignees.filter(x => !assignees.includes(x));

      if (add.length) {
        await fetch(`/api/schedule/shifts/${assignShiftId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_ids: add }),
        });
      }
      if (remove.length) {
        await fetch(`/api/schedule/shifts/${assignShiftId}/assign`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_ids: remove }),
        });
      }

      setAssignOpen(false);
      setAssignShiftId(null);
      alert('Assignments updated.');
    } catch (e: any) {
      alert(e.message || 'Failed to update assignments');
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Admin – Scheduling (separate from payroll)</h1>

      <div className="center" style={{ marginBottom: 12 }}>
        <Link href="/admin-schedule-past" className="nav-link">View Past Shifts</Link>
        <button className="topbar-btn" style={{ marginLeft: 8 }} onClick={loadRows}>Refresh</button>
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* Create Shift */}
      <div className="card" style={{ padding: 12 }}>
        <strong>Create Scheduled Shift</strong>
        <label className="mt-lg">Start</label>
        <input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })}/>
        <label className="mt-lg">End (optional)</label>
        <input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })}/>
        <label className="mt-lg">Location Name</label>
        <input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })}/>
        <label className="mt-lg">Address</label>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}/>
        <label className="mt-lg">Job Type</label>
        <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value as any })}>
          <option value="setup">Setup</option>
          <option value="event">Event</option>
          <option value="breakdown">Breakdown</option>
          <option value="other">Other</option>
        </select>
        <label className="mt-lg">Status</label>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="changed">Changed</option>
        </select>
        <label className="mt-lg">Notes</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/>
        <div className="mt-lg">
          <button className="btn-primary" onClick={createShift} disabled={creating || !form.start_time || !adminId}>
            {creating ? 'Creating…' : 'Create Scheduled Shift'}
          </button>
        </div>
      </div>

      {/* Upcoming Shifts (auto-filters by time) */}
      <div className="mt-lg">
        <h2 className="center" style={{ fontSize: 18, marginBottom: 8 }}>Upcoming Scheduled Shifts</h2>
        {loading && <div className="toast">Loading…</div>}
        {!loading && upcoming.length === 0 && !err && (
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">No upcoming scheduled shifts.</div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="table-wrap">
            <table className="table table--admin">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th>Job</th>
                  <th>Location</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th className="col-hide-md">Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(r => (
                  <tr key={r.id}>
                    <td>{fmt(r.start_time)}</td>
                    <td>{fmt(r.end_time)}</td>
                    <td>{r.job_type}</td>
                    <td>{r.location_name}</td>
                    <td>{r.address}</td>
                    <td>{r.status}</td>
                    <td className="col-hide-md">{r.notes}</td>
                    <td>
                      <div className="actions">
                        <button className="btn-edit" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn-edit" onClick={() => openAssign(r)}>Assign</button>
                        <button className="btn-delete" onClick={() => deleteRow(r.id)} disabled={deleting}>
                          {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Drawer */}
      {drawerOpen && edit && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)',
            display: 'flex', justifyContent: 'flex-end', zIndex: 50
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="card"
            style={{ width: 'min(520px, 96vw)', height: '100%', padding: 16, overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="row between">
              <strong>Edit Scheduled Shift</strong>
              <button className="topbar-btn" onClick={() => setDrawerOpen(false)}>Close</button>
            </div>

            <label className="mt-lg">Start</label>
            <input
              type="datetime-local"
              value={edit.start_time ? new Date(edit.start_time).toISOString().slice(0,16) : ''}
              onChange={(e) => setEdit({ ...edit, start_time: e.target.value })}
            />

            <label className="mt-lg">End (optional)</label>
            <input
              type="datetime-local"
              value={edit.end_time ? new Date(edit.end_time).toISOString().slice(0,16) : ''}
              onChange={(e) => setEdit({ ...edit, end_time: e.target.value })}
            />

            <label className="mt-lg">Location Name</label>
            <input
              value={edit.location_name ?? ''}
              onChange={(e) => setEdit({ ...edit, location_name: e.target.value })}
            />

            <label className="mt-lg">Address</label>
            <input
              value={edit.address ?? ''}
              onChange={(e) => setEdit({ ...edit, address: e.target.value })}
            />

            <label className="mt-lg">Job Type</label>
            <select
              value={edit.job_type ?? 'setup'}
              onChange={(e) => setEdit({ ...edit, job_type: e.target.value as any })}
            >
              <option value="setup">Setup</option>
              <option value="event">Event</option>
              <option value="breakdown">Breakdown</option>
              <option value="other">Other</option>
            </select>

            <label className="mt-lg">Status</label>
            <select
              value={edit.status ?? 'draft'}
              onChange={(e) => setEdit({ ...edit, status: e.target.value as any })}
            >
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="changed">Changed</option>
            </select>

            <label className="mt-lg">Notes</label>
            <textarea
              value={edit.notes ?? ''}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />

            <div className="mt-lg">
              <button className="btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Panel */}
      {assignOpen && assignShiftId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50
          }}
          onClick={() => setAssignOpen(false)}
        >
          <div
            className="card"
            style={{ width: 'min(760px, 96vw)', maxHeight: '92vh', padding: 16, overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="row between">
              <strong>Assign Employees</strong>
              <button className="topbar-btn" onClick={() => setAssignOpen(false)}>Close</button>
            </div>

            <input
              className="mt-lg"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div
              className="mt-lg"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}
            >
              {filteredEmps.map(e => (
                <label key={e.id} className="inline-check card" style={{ padding: 10 }}>
                  <input
                    type="checkbox"
                    checked={assignees.includes(e.id)}
                    onChange={() => toggleEmp(e.id)}
                  />
                  <span>
                    {e.full_name || e.id.slice(0, 8)}
                    {e.email ? <span className="muted"> • {e.email}</span> : null}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-lg">
              <button className="btn-primary" onClick={saveAssignments}>
                Save Assignments
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
