// pages/admin-schedule-past.tsx
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Row = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: 'setup' | 'Lights' | 'breakdown' | 'other' | null;
  notes?: string | null;
};
type Emp = { id: string; full_name?: string | null; email?: string | null };

export default function AdminSchedulePast() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, Emp[]>>({});

  // inline edit
  const [edit, setEdit] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  // 60s heartbeat so things auto-stay “past”
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        return await r.json();
      } catch {}
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
      setRows(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadRows();
  }, []);

  const past = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => {
        const s = r.start_time ? Date.parse(r.start_time) : NaN;
        const e = r.end_time ? Date.parse(r.end_time) : NaN;
        if (!isNaN(e)) return e < now;
        if (!isNaN(s)) return s < now;
        return false;
      })
      .sort((a, b) => {
        const ae = a.end_time
          ? Date.parse(a.end_time)
          : a.start_time
          ? Date.parse(a.start_time)
          : 0;
        const be = b.end_time
          ? Date.parse(b.end_time)
          : b.start_time
          ? Date.parse(b.start_time)
          : 0;
        return be - ae; // newest past first
      });
  }, [rows]);

  // load assigned employees for past rows
  useEffect(() => {
    (async () => {
      const ids = past.map((r) => r.id);
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
  }, [past.length]);

  function openEdit(row: Row) {
    setEdit({ ...row });
    setTimeout(
      () =>
        document
          .getElementById('edit-panel')
          ?.scrollIntoView({ behavior: 'smooth' }),
      0
    );
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
      // normalize to ISO if user typed local
      if (body.start_time && !String(body.start_time).endsWith('Z')) {
        body.start_time = new Date(body.start_time).toISOString();
      }
      if (body.end_time && !String(body.end_time).endsWith('Z')) {
        body.end_time = new Date(body.end_time).toISOString();
      }

      const r = await fetch(`/api/schedule/shifts/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    if (!confirm('Delete this past shift?')) return;
    const r = await fetch(`/api/schedule/shifts/${id}`, { method: 'DELETE' });
    const j: any = await parseMaybeJson(r);
    if (!r.ok) return alert(j?.error || j?.raw || `HTTP ${r.status}`);
    await loadRows();
    alert('Shift deleted.');
  }

  async function deleteAllPast() {
    if (past.length === 0) return;
    if (
      !confirm(
        `Delete ALL ${past.length} past shifts? This cannot be undone.`
      )
    )
      return;
    const batchSize = 10;
    try {
      for (let i = 0; i < past.length; i += batchSize) {
        const slice = past.slice(i, i + batchSize);
        await Promise.all(
          slice.map((s) =>
            fetch(`/api/schedule/shifts/${s.id}`, { method: 'DELETE' })
          )
        );
      }
      await loadRows();
      alert('All past shifts deleted.');
    } catch (e: any) {
      alert(e.message || 'Failed to delete all past shifts.');
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Past Scheduled Shifts</h1>

      {/* Top controls row (no inline styles) */}
      <div className="center past-controls-row">
        <Link href="/admin-schedule" className="nav-link">
          ← Back to Upcoming
        </Link>
        <button className="topbar-btn" onClick={loadRows}>
          Refresh
        </button>
        {past.length > 0 && (
          <button className="topbar-btn" onClick={deleteAllPast}>
            Delete All Past
          </button>
        )}
      </div>

      {err && <div className="alert error">{err}</div>}

      {loading && <div className="toast">Loading…</div>}

      {!loading && past.length === 0 && !err && (
        <div className="card card-empty-past">
          <div className="muted">No past shifts yet.</div>
        </div>
      )}

      {past.length > 0 && (
        <div className="table-wrap">
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
              {past.map((r) => {
                const emps = assignedMap[r.id] || [];
                const assignedLabel = emps.length
                  ? emps
                      .map(
                        (e) =>
                          e.full_name || e.email || e.id.slice(0, 8)
                      )
                      .join(', ')
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
                        <button
                          type="button"
                          className="btn-edit"
                          onClick={() => openEdit(r)}
                        >
                          Edit
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline Edit Panel */}
      {edit && (
        <div id="edit-panel" className="card mt-lg edit-panel-past">
          <div className="row between">
            <strong>Edit Past Shift</strong>
            <button
              type="button"
              className="topbar-btn"
              onClick={() => setEdit(null)}
            >
              Close
            </button>
          </div>

          <label className="mt-lg">Start</label>
          <input
            type="datetime-local"
            value={
              edit.start_time
                ? new Date(edit.start_time).toISOString().slice(0, 16)
                : ''
            }
            onChange={(e) =>
              setEdit({ ...edit, start_time: e.target.value })
            }
          />

          <label className="mt-lg">End (optional)</label>
          <input
            type="datetime-local"
            value={
              edit.end_time
                ? new Date(edit.end_time).toISOString().slice(0, 16)
                : ''
            }
            onChange={(e) =>
              setEdit({ ...edit, end_time: e.target.value })
            }
          />

          <label className="mt-lg">Location Name</label>
          <input
            value={edit.location_name ?? ''}
            onChange={(e) =>
              setEdit({ ...edit, location_name: e.target.value })
            }
          />

          <label className="mt-lg">Address</label>
          <input
            value={edit.address ?? ''}
            onChange={(e) =>
              setEdit({ ...edit, address: e.target.value })
            }
          />

          <label className="mt-lg">Job Type</label>
          <select
            value={edit.job_type ?? 'setup'}
            onChange={(e) =>
              setEdit({
                ...edit,
                job_type: e.target.value as Row['job_type'],
              })
            }
          >
            <option value="setup">Setup</option>
            <option value="Lights">Lights</option>
            <option value="breakdown">Breakdown</option>
            <option value="other">Other</option>
          </select>

          <label className="mt-lg">Notes</label>
          <textarea
            value={edit.notes ?? ''}
            onChange={(e) =>
              setEdit({ ...edit, notes: e.target.value })
            }
          />

          <div className="mt-lg">
            <button
              type="button"
              className="btn-primary"
              onClick={saveEdit}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
