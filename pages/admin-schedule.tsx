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
  job_type?: 'setup' | 'Lights' | 'breakdown' | 'other' | null;
  notes?: string | null;
};

export default function AdminSchedule() {
  const [adminId, setAdminId] = useState<string | null>(null);
  useEffect(() => { (async () => {
    const { data } = await supabase.auth.getSession();
    setAdminId(data.session?.user?.id ?? null);
  })(); }, []);

  const [rows, setRows] = useState<SRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [assignedMap, setAssignedMap] = useState<Record<string, Emp[]>>({});

  // Create form state
  const [form, setForm] = useState({
    start_time: '', end_time: '',
    location_name: '', address: '',
    job_type: 'setup' as 'setup' | 'Lights' | 'breakdown' | 'other',
    notes: ''
  });
  const [creating, setCreating] = useState(false);

  // Edit panel
  const [edit, setEdit] = useState<SRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Assignment panel
  const [assignShift, setAssignShift] = useState<SRow | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // 60s heartbeat to auto-roll to past
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(id); }, []);

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) { try { return await r.json(); } catch {} }
    const raw = await r.text(); return { raw };
  }

  async function loadRows() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/schedule/shifts');
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setRows(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load schedule');
    } finally { setLoading(false); }
  }
  useEffect(() => { loadRows(); }, []);

  // Employees list for assignments
  useEffect(() => { (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true });
    if (!error) setEmployees((data as Emp[]) || []);
  })(); }, []);

  const filteredEmps = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      [e.full_name ?? '', e.email ?? '', e.id].some(v => v?.toLowerCase().includes(q))
    );
  }, [employees, search]);

  // Upcoming subset
  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter(r => {
        const s = r.start_time ? Date.parse(r.start_time) : NaN;
        const e = r.end_time ? Date.parse(r.end_time) : NaN;
        if (!isNaN(e)) return e >= now;
        if (!isNaN(s)) return s >= now;
        return false;
      })
      .sort((a, b) => (Date.parse(a.start_time ?? '') || 0) - (Date.parse(b.start_time ?? '') || 0));
  }, [rows]);

  // Load assignments for visible upcoming shifts
  useEffect(() => { (async () => {
    const ids = upcoming.map(r => r.id);
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
  })(); }, [upcoming.length]);

  // Actions
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
        notes: form.notes || undefined,
        created_by: adminId
      };
      const r = await fetch('/api/schedule/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setForm({ start_time:'', end_time:'', location_name:'', address:'', job_type:'setup', notes:'' });
      await loadRows(); alert('Scheduled shift created.');
    } catch (e:any) { alert(e.message || 'Failed to create'); }
    finally { setCreating(false); }
  }

  function openEdit(row:SRow) {
    setEdit({ ...row });
    setTimeout(()=>document.getElementById('edit-panel')?.scrollIntoView({behavior:'smooth'}),0);
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
        notes: edit.notes ?? undefined
      };
      if (body.start_time && !body.start_time.endsWith?.('Z')) body.start_time = new Date(body.start_time).toISOString();
      if (body.end_time && !body.end_time.endsWith?.('Z')) body.end_time = new Date(body.end_time).toISOString();

      const r = await fetch(`/api/schedule/shifts/${edit.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      const j:any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setEdit(null); await loadRows(); alert('Shift updated.');
    } catch(e:any){ alert(e.message || 'Failed to save'); }
    finally{ setSaving(false); }
  }

  async function deleteRow(id:string) {
    if (!confirm('Delete this scheduled shift?')) return;
    const r = await fetch(`/api/schedule/shifts/${id}`, { method:'DELETE' });
    const j:any = await parseMaybeJson(r);
    if (!r.ok) return alert(j?.error || j?.raw || `HTTP ${r.status}`);
    await loadRows(); alert('Shift deleted.');
  }

  async function openAssign(row:SRow) {
    setAssignShift(row); setSearch('');
    const { data, error } = await supabase
      .from('schedule_assignments')
      .select('employee_id')
      .eq('schedule_shift_id', row.id);
    if (!error) {
      const ids = (data || []).map((r:any)=>r.employee_id as string);
      setCurrentAssignees(ids); setAssignees(ids);
    } else { setCurrentAssignees([]); setAssignees([]); }
    setTimeout(()=>document.getElementById('assign-panel')?.scrollIntoView({behavior:'smooth'}),0);
  }
  function toggleEmp(id:string){ setAssignees(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]); }
  async function saveAssignments() {
    if (!assignShift?.id) return;
    const add = assignees.filter(x => !currentAssignees.includes(x));
    const remove = currentAssignees.filter(x => !assignees.includes(x));
    if (add.length){
      const r = await fetch(`/api/schedule/shifts/${assignShift.id}/assign`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ employee_ids: add })
      }); if (!r.ok) return alert('Failed to add assignments');
    }
    if (remove.length){
      const r = await fetch(`/api/schedule/shifts/${assignShift.id}/assign`, {
        method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ employee_ids: remove })
      }); if (!r.ok) return alert('Failed to remove assignments');
    }
    setAssignShift(null); alert('Assignments updated.');
    setAssignedMap(prev => ({ ...prev, [assignShift.id!]:
      employees.filter(e => assignees.includes(e.id)) }));
  }

  return (
    <div className="page">
      <h1 className="page__title">Admin – Scheduling (separate from payroll)</h1>

      {/* Top actions */}
      <div className="center" style={{ marginBottom: 12 }}>
        <Link href="/admin-schedule-past" className="nav-link">View Past Shifts</Link>
        <button type="button" className="topbar-btn" style={{ marginLeft: 8 }} onClick={loadRows}>Refresh</button>
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* Two-up layout on wider screens */}
      <div className="row wrap" style={{ gap: 16 }}>
        {/* Create form */}
        <div className="card" style={{ padding: 12, flex: '1 1 320px', maxWidth: 520 }}>
          <strong>Create Scheduled Shift</strong>

          <label className="mt-lg">Start</label>
          <input type="datetime-local" value={form.start_time} onChange={(e)=>setForm({...form,start_time:e.target.value})}/>

          <label className="mt-lg">End (optional)</label>
          <input type="datetime-local" value={form.end_time} onChange={(e)=>setForm({...form,end_time:e.target.value})}/>

          <label className="mt-lg">Location Name</label>
          <input value={form.location_name} onChange={(e)=>setForm({...form,location_name:e.target.value})}/>

          <label className="mt-lg">Address</label>
          <input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})}/>

          <label className="mt-lg">Job Type</label>
          <select value={form.job_type} onChange={(e)=>setForm({...form,job_type:e.target.value as any})}>
            <option value="setup">Setup</option>
            <option value="Lights">Lights</option>
            <option value="breakdown">Breakdown</option>
            <option value="other">Other</option>
          </select>

          <label className="mt-lg">Notes</label>
          <textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/>

          <div className="mt-lg">
            <button
              type="button"
              className="btn-primary"
              onClick={createShift}
              disabled={creating || !form.start_time || !adminId}
            >
              {creating ? 'Creating…' : 'Create Scheduled Shift'}
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
                  {upcoming.map(r => {
                    const emps = assignedMap[r.id] || [];
                    const assignedLabel = emps.length
                      ? emps.map(e => e.full_name || e.email || e.id.slice(0, 8)).join(', ')
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

          <label className="mt-lg">Start</label>
          <input type="datetime-local"
            value={edit.start_time ? new Date(edit.start_time).toISOString().slice(0,16) : ''}
            onChange={(e)=>setEdit({...edit, start_time:e.target.value})}/>

          <label className="mt-lg">End (optional)</label>
          <input type="datetime-local"
            value={edit.end_time ? new Date(edit.end_time).toISOString().slice(0,16) : ''}
            onChange={(e)=>setEdit({...edit, end_time:e.target.value})}/>

          <label className="mt-lg">Location Name</label>
          <input value={edit.location_name ?? ''} onChange={(e)=>setEdit({...edit,location_name:e.target.value})}/>

          <label className="mt-lg">Address</label>
          <input value={edit.address ?? ''} onChange={(e)=>setEdit({...edit,address:e.target.value})}/>

          <label className="mt-lg">Job Type</label>
          <select value={edit.job_type ?? 'setup'} onChange={(e)=>setEdit({...edit,job_type:e.target.value as any})}>
            <option value="setup">Setup</option>
            <option value="Lights">Lights</option>
            <option value="breakdown">Breakdown</option>
            <option value="other">Other</option>
          </select>

          <label className="mt-lg">Notes</label>
          <textarea value={edit.notes ?? ''} onChange={(e)=>setEdit({...edit,notes:e.target.value})}/>

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

          <input
            className="mt-lg"
            placeholder="Search name or email…"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
          />

          <div className="mt-lg" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
            {filteredEmps.map(e => (
              <label key={e.id} className="inline-check card" style={{ padding: 10 }}>
                <input
                  type="checkbox"
                  checked={assignees.includes(e.id)}
                  onChange={()=>toggleEmp(e.id)}
                />
                <span>{e.full_name || e.email || e.id.slice(0,8)}</span>
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
