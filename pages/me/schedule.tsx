// pages/admin-schedule.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Emp = { id: string; full_name?: string | null; email?: string | null };

export default function AdminSchedule() {
  const [form, setForm] = useState({
    start_time: '',
    end_time: '',
    location_name: '',
    address: '',
    job_type: 'setup',
    task_notes: '',
    status: 'draft',
  });

  const [creating, setCreating] = useState(false);
  const [shiftId, setShiftId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Emp[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  // 1) Load employees from profiles (id + name + email)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });
      if (!error) setEmployees((data as Emp[]) || []);
    })();
  }, []);

  // 2) Filter employees by search query
  const filtered = useMemo(() => {
    if (!q.trim()) return employees;
    const needle = q.toLowerCase();
    return employees.filter((e) =>
      [e.full_name ?? '', e.email ?? '', e.id].some((v) =>
        v?.toLowerCase().includes(needle)
      )
    );
  }, [q, employees]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // 3) Create shift (end time optional)
  async function createShift() {
    if (!form.start_time) return alert('Start time is required');
    setCreating(true);
    try {
      const body = {
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        location_name: form.location_name || undefined,
        address: form.address || undefined,
        job_type: form.job_type || undefined,
        task_notes: form.task_notes || undefined,
        status: form.status,
      };

      const r = await fetch('/api/schedule/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error creating shift');
      setShiftId(j.id);
    } catch (e: any) {
      alert(e.message || 'Failed to create shift');
    } finally {
      setCreating(false);
    }
  }

  // 4) Assign selected employees to the created shift
  async function assignEmployees() {
    if (!shiftId || selected.length === 0) return;
    setAssigning(true);
    try {
      const r = await fetch(`/api/schedule/shifts/${shiftId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: selected }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error assigning employees');
      alert('Assigned!');
    } catch (e: any) {
      alert(e.message || 'Failed to assign');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Scheduling</h1>

      {/* Create Shift */}
      <div className="card" style={{ padding: 12 }}>
        <label>Start</label>
        <input
          className="full"
          type="datetime-local"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
        />

        <label className="mt-lg">End (optional)</label>
        <input
          className="full"
          type="datetime-local"
          value={form.end_time}
          onChange={(e) => setForm({ ...form, end_time: e.target.value })}
        />

        <label className="mt-lg">Location Name</label>
        <input
          className="full"
          placeholder="e.g. Party Setup – Warehouse"
          value={form.location_name}
          onChange={(e) => setForm({ ...form, location_name: e.target.value })}
        />

        <label className="mt-lg">Address</label>
        <input
          className="full"
          placeholder="123 Main St, City"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <label className="mt-lg">Job Type</label>
        <select
          className="full"
          value={form.job_type}
          onChange={(e) => setForm({ ...form, job_type: e.target.value })}
        >
          <option value="setup">Setup</option>
          <option value="event">Event</option>
          <option value="breakdown">Breakdown</option>
          <option value="other">Other</option>
        </select>

        <label className="mt-lg">Notes</label>
        <textarea
          className="full"
          placeholder="Bring ladder; load truck"
          value={form.task_notes}
          onChange={(e) => setForm({ ...form, task_notes: e.target.value })}
        />

        <label className="mt-lg">Status</label>
        <select
          className="full"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        >
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="changed">Changed</option>
        </select>

        <div className="mt-lg">
          <button className="btn-primary" onClick={createShift} disabled={creating || !form.start_time}>
            {creating ? 'Creating…' : 'Create Shift'}
          </button>
        </div>
      </div>

      {/* Assign Employees (appears after shift is created) */}
      {shiftId && (
        <div className="card mt-lg" style={{ padding: 12 }}>
          <div className="row between wrap">
            <strong>Assign Employees</strong>
            <span className="muted">Shift: {shiftId.slice(0, 8)}…</span>
          </div>

          {/* Search */}
          <div className="mt-lg">
            <input
              className="full"
              placeholder="Search by name or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Grid of checkboxes */}
          <div
            className="mt-lg"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {filtered.map((e) => (
              <label key={e.id} className="inline-check card" style={{ padding: 10 }}>
                <input
                  type="checkbox"
                  checked={selected.includes(e.id)}
                  onChange={() => toggle(e.id)}
                />
                <span>
                  {e.full_name || e.id.slice(0, 8)}
                  {e.email ? <span className="muted"> • {e.email}</span> : null}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-lg">
            <button
              className="btn-primary"
              onClick={assignEmployees}
              disabled={assigning || selected.length === 0}
            >
              {assigning ? 'Assigning…' : `Assign ${selected.length ? `(${selected.length})` : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
