import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Emp = { id: string; full_name?: string | null; email?: string | null };

export default function AdminSchedule() {
  const [creatorId, setCreatorId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setCreatorId(data.session?.user?.id ?? null);
    })();
  }, []);

  const [form, setForm] = useState({
    start_time: '',
    end_time: '',
    location_name: '',
    address: '',
    job_type: 'setup',
    notes: '',
    status: 'draft',
  });

  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Emp[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });
      if (!error) setEmployees((data as Emp[]) || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return employees;
    const needle = q.toLowerCase();
    return employees.filter((e) =>
      [e.full_name ?? '', e.email ?? '', e.id].some((v) => v?.toLowerCase().includes(needle))
    );
  }, [q, employees]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { return await r.json(); } catch {}
    }
    const raw = await r.text();
    return { raw };
  }

  async function createShift() {
    setErrorMsg(null);
    if (!form.start_time) return setErrorMsg('Start time is required');
    if (!creatorId) return setErrorMsg('You must be signed in');

    setCreating(true);
    try {
      const body = {
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        location_name: form.location_name || undefined,
        address: form.address || undefined,
        job_type: form.job_type || undefined,
        notes: form.notes || undefined,
        status: form.status,
        created_by: creatorId,
      };

      const r = await fetch('/api/schedule/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      if (!j?.id) throw new Error('API did not return schedule id');

      setScheduleId(j.id);
      setSelected([]);
      alert('Shift created for scheduling (not payroll).');
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to create schedule shift');
    } finally {
      setCreating(false);
    }
  }

  async function assignEmployees() {
    setErrorMsg(null);
    if (!scheduleId) return setErrorMsg('Create a scheduled shift first');
    if (selected.length === 0) return setErrorMsg('Select at least one employee');

    setAssigning(true);
    try {
      const r = await fetch(`/api/schedule/shifts/${scheduleId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: selected }),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      alert('Assigned on the schedule only (not payroll).');
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to assign');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Scheduling (separate from payroll)</h1>
      {errorMsg && <div className="alert error">{errorMsg}</div>}

      <div className="card" style={{ padding: 12 }}>
        <label>Start</label>
        <input type="datetime-local" value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })} />

        <label className="mt-lg">End (optional)</label>
        <input type="datetime-local" value={form.end_time}
          onChange={(e) => setForm({ ...form, end_time: e.target.value })} />

        <label className="mt-lg">Location Name</label>
        <input placeholder="e.g. Party Setup – Warehouse"
          value={form.location_name}
          onChange={(e) => setForm({ ...form, location_name: e.target.value })} />

        <label className="mt-lg">Address</label>
        <input placeholder="123 Main St, City"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })} />

        <label className="mt-lg">Job Type</label>
        <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>
          <option value="setup">Setup</option>
          <option value="event">Event</option>
          <option value="breakdown">Breakdown</option>
          <option value="other">Other</option>
        </select>

        <label className="mt-lg">Notes</label>
        <textarea placeholder="Bring ladder; load truck"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />

        <label className="mt-lg">Status</label>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="changed">Changed</option>
        </select>

        <div className="mt-lg">
          <button className="btn-primary" onClick={createShift} disabled={creating || !form.start_time}>
            {creating ? 'Creating…' : 'Create Scheduled Shift'}
          </button>
        </div>
      </div>

      <div className="card mt-lg" style={{ padding: 12 }}>
        <div className="row between wrap">
          <strong>Assign Employees</strong>
          <span className="muted">
            {scheduleId ? `Schedule ID: ${scheduleId.slice(0, 8)}…` : 'Create a scheduled shift first'}
          </span>
        </div>

        <div className="mt-lg">
          <input placeholder="Search by name or email…"
            value={q} onChange={(e) => setQ(e.target.value)} disabled={!scheduleId} />
        </div>

        <div
          className="mt-lg"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
            opacity: scheduleId ? 1 : 0.5,
            pointerEvents: scheduleId ? 'auto' : 'none',
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
          <button className="btn-primary" onClick={assignEmployees}
            disabled={!scheduleId || assigning || selected.length === 0}>
            {assigning ? 'Assigning…' : `Assign ${selected.length ? `(${selected.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
