// pages/me/schedule.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Mate = { id: string; full_name?: string | null };
type Row = {
  id: string;
  time_in: string | null;
  time_out: string | null;
  job_type?: string | null;
  location_name?: string | null;
  address?: string | null;
  status?: string | null;
  mates?: Mate[];
};

export default function MySchedule() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/schedule/me');
        // Always try JSON, but fall back to []
        let j: any = [];
        try { j = await res.json(); } catch { j = []; }
        const list: Row[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
        if (!alive) return;
        setRows(list);
      } catch (e: any) {
        if (!alive) return;
        setErr(e.message || 'Failed to load schedule');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');

  return (
    <div className="page">
      <h1 className="page__title">My Schedule</h1>
      {err && <div className="alert error">{err}</div>}
      {loading ? <div className="toast">Loading…</div> : null}

      {!loading && rows.length === 0 && !err && (
        <div className="card" style={{ padding: 12 }}>
          <div className="muted">No assigned shifts yet.</div>
        </div>
      )}

      <div className="mt-lg" style={{ display: 'grid', gap: 12 }}>
        {rows.map((s) => (
          <div key={s.id} className="card" style={{ padding: 12 }}>
            {/* Time + job/location */}
            <div className="row wrap gap-md" style={{ alignItems: 'baseline' }}>
              <strong>{fmt(s.time_in)}</strong>
              {s.time_out ? <span className="muted">→ {fmt(s.time_out)}</span> : null}
              {s.job_type ? <span className="chip">{s.job_type}</span> : null}
              {s.status ? <span className="badge">{s.status}</span> : null}
            </div>

            {(s.location_name || s.address) && (
              <div className="muted" style={{ marginTop: 6 }}>
                {s.location_name ? <span>{s.location_name}</span> : null}
                {s.location_name && s.address ? ' • ' : null}
                {s.address ? <span>{s.address}</span> : null}
              </div>
            )}

            {/* Mates */}
            {s.mates && s.mates.length > 0 && (
              <div className="mt-lg">
                <div className="muted" style={{ marginBottom: 6 }}>Who’s on:</div>
                <div className="row wrap gap-sm">
                  {s.mates.map((m) => (
                    <span key={m.id} className="pill">{m.full_name || m.id.slice(0, 6)}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
