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
  job_type?: 'setup' | 'event' | 'breakdown' | 'other' | null;
  status?: 'draft' | 'confirmed' | 'changed' | null;
  notes?: string | null;
};
type Emp = { id: string; full_name?: string | null; email?: string | null };

export default function AdminSchedulePast() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, Emp[]>>({});

  // 60s heartbeat
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(()=>setTick(t=>t+1),60000); return ()=>clearInterval(id); }, []);

  function fmt(s?: string | null) { return s ? new Date(s).toLocaleString() : ''; }

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) { try { return await r.json(); } catch {} }
    const raw = await r.text(); return { raw };
  }

  async function loadRows() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/schedule/shifts');
      const j:any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setRows(Array.isArray(j) ? j : []);
    } catch(e:any){ setErr(e.message || 'Failed to load'); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ loadRows(); },[]);

  const past = useMemo(() => {
    const now = Date.now();
    return rows.filter(r => {
      const s = r.start_time ? Date.parse(r.start_time) : NaN;
      const e = r.end_time ? Date.parse(r.end_time) : NaN;
      if (!isNaN(e)) return e < now;
      if (!isNaN(s)) return s < now;
      return false;
    }).sort((a,b) => {
      const ae = a.end_time ? Date.parse(a.end_time) : (a.start_time ? Date.parse(a.start_time) : 0);
      const be = b.end_time ? Date.parse(b.end_time) : (b.start_time ? Date.parse(b.start_time) : 0);
      return be - ae; // newest past first
    });
  }, [rows]);

  // 🔎 load assigned employees for the past set
  useEffect(() => {
    (async () => {
      const ids = past.map(r => r.id);
      if (ids.length === 0) { setAssignedMap({}); return; }
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('schedule_shift_id, profiles:employee_id ( id, full_name, email )')
        .in('schedule_shift_id', ids);
      if (error) return;
      const map: Record<string, Emp[]> = {};
      (data || []).forEach((row:any) => {
        const pid = row.schedule_shift_id as string;
        const emp: Emp = row.profiles;
        if (!map[pid]) map[pid] = [];
        map[pid].push(emp);
      });
      setAssignedMap(map);
    })();
  }, [past.length]);

  return (
    <div className="page">
      <h1 className="page__title">Past Scheduled Shifts</h1>

      <div className="center" style={{ marginBottom: 12 }}>
        <Link href="/admin-schedule" className="nav-link">← Back to Upcoming</Link>
        <button className="topbar-btn" style={{ marginLeft: 8 }} onClick={loadRows}>Refresh</button>
      </div>

      {err && <div className="alert error">{err}</div>}

      {loading && <div className="toast">Loading…</div>}
      {!loading && past.length === 0 && !err && (
        <div className="card" style={{ padding: 12 }}>
          <div className="muted">No past shifts yet.</div>
        </div>
      )}

      {past.length > 0 && (
        <div className="table-wrap">
          <table className="table table--admin">
            <thead>
              <tr>
                <th>Start</th><th>End</th><th>Job</th><th>Location</th><th>Address</th>
                <th>Assigned</th><th>Status</th><th className="col-hide-md">Notes</th>
              </tr>
            </thead>
            <tbody>
              {past.map(r => {
                const emps = assignedMap[r.id] || [];
                const assignedLabel = emps.length
                  ? emps.map(e => e.full_name || e.email || e.id.slice(0,8)).join(', ')
                  : '—';
                return (
                  <tr key={r.id}>
                    <td>{fmt(r.start_time)}</td>
                    <td>{fmt(r.end_time)}</td>
                    <td>{r.job_type}</td>
                    <td>{r.location_name}</td>
                    <td>{r.address}</td>
                    <td>{assignedLabel}</td>
                    <td>{r.status}</td>
                    <td className="col-hide-md">{r.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
