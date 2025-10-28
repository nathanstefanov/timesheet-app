// pages/me/schedule.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'; // NOTE: path from /pages/me/* -> /lib

type Mate = { id: string; full_name?: string | null };
type Shift = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  job_type?: 'setup' | 'event' | 'breakdown' | 'other' | null;
  location_name?: string | null;
  address?: string | null;
  status?: 'draft' | 'confirmed' | 'changed' | null;
  mates?: Mate[];
};

export default function MySchedule() {
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // small 60s heartbeat so shifts “roll” to Past automatically
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  function fmtDate(s?: string | null) {
    return s ? new Date(s).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }) : '';
  }
  function fmtTime(s?: string | null) {
    return s ? new Date(s).toLocaleTimeString(undefined, { hour: 'numeric', minute:'2-digit' }) : '';
  }
  function badge(text: string | undefined | null) {
    if (!text) return null;
    const label = text[0].toUpperCase() + text.slice(1);
    return <span className="badge" style={{ minWidth: 0 }}>{label}</span>;
  }

  async function parseMaybeJson(r: Response) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { return await r.json(); } catch {}
    }
    const raw = await r.text();
    return { raw };
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const r = await fetch('/api/schedule/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw || `HTTP ${r.status}`);
      setRows(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const u: Shift[] = [];
    const p: Shift[] = [];
    rows.forEach(s => {
      const sMs = s.start_time ? Date.parse(s.start_time) : NaN;
      const eMs = s.end_time ? Date.parse(s.end_time) : NaN;
      const isPast = !isNaN(eMs) ? eMs < now : (!isNaN(sMs) ? sMs < now : false);
      (isPast ? p : u).push(s);
    });
    u.sort((a,b) => (Date.parse(a.start_time ?? '') || 0) - (Date.parse(b.start_time ?? '') || 0));
    p.sort((a,b) => (Date.parse(b.end_time ?? b.start_time ?? '') || 0) - (Date.parse(a.end_time ?? a.start_time ?? '') || 0));
    return { upcoming: u, past: p };
  }, [rows]);

  function Teammates({ mates }: { mates?: Mate[] }) {
    if (!mates || mates.length === 0) return <span className="muted">Just you</span>;
    return (
      <div className="row wrap gap-sm" aria-label="Teammates">
        {mates.map(m => {
          const name = m.full_name || 'Teammate';
          const initials = name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
          return (
            <div key={m.id} className="pill" title={name}>
              <span className="pill__num" style={{ minWidth: 22, textAlign:'center' }}>{initials}</span>
              <span className="pill__label">{name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function ShiftCard({ s }: { s: Shift }) {
    const day = fmtDate(s.start_time);
    const start = fmtTime(s.start_time);
    const end = fmtTime(s.end_time);
    return (
      <div className="card" style={{ padding: 14 }}>
        {/* Top row: date/time + job/status badges */}
        <div className="row between wrap">
          <div className="row wrap gap-md">
            <strong style={{ fontSize: 16 }}>{day}</strong>
            <span className="muted">{start}{end ? ` – ${end}` : ''}</span>
          </div>
          <div className="row gap-sm">
            {badge(s.job_type)}
            {s.status && <span className="badge" style={{ background:'#eef2ff', borderColor:'var(--brand-border)', color:'#3730a3' }}>
              {s.status[0].toUpperCase()+s.status.slice(1)}
            </span>}
          </div>
        </div>

        {/* Location */}
        <div className="row wrap gap-md" style={{ marginTop: 8 }}>
          <div><strong>{s.location_name || 'Location TBD'}</strong></div>
          {s.address && <div className="muted">• {s.address}</div>}
        </div>

        {/* Teammates */}
        <div className="mt-lg">
          <Teammates mates={s.mates} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">My Schedule</h1>

      <div className="center" style={{ marginBottom: 12 }}>
        <button className="topbar-btn" onClick={load}>Refresh</button>
      </div>

      {err && <div className="alert error">{err}</div>}
      {loading && <div className="toast">Loading…</div>}

      {/* UPCOMING */}
      <section className="mt-lg">
        <div className="section-bar card" style={{ padding: 10 }}>
          <div className="section-bar__left">
            <span className="employee-name">Upcoming</span>
            <span className="pill"><span className="pill__num">{upcoming.length}</span><span className="pill__label">shifts</span></span>
          </div>
        </div>
        <div style={{ display:'grid', gap: 12, marginTop: 8 }}>
          {!loading && upcoming.length === 0 && <div className="card" style={{ padding: 12 }}><span className="muted">No upcoming shifts.</span></div>}
          {upcoming.map(s => <ShiftCard key={s.id} s={s} />)}
        </div>
      </section>

      {/* PAST */}
      <section className="mt-lg">
        <div className="section-bar card" style={{ padding: 10 }}>
          <div className="section-bar__left">
            <span className="employee-name">Past</span>
            <span className="pill"><span className="pill__num">{past.length}</span><span className="pill__label">shifts</span></span>
          </div>
        </div>
        <div style={{ display:'grid', gap: 12, marginTop: 8 }}>
          {!loading && past.length === 0 && <div className="card" style={{ padding: 12 }}><span className="muted">No past shifts yet.</span></div>}
          {past.map(s => <ShiftCard key={s.id} s={s} />)}
        </div>
      </section>

      {/* Footnote: clarify separation from payroll */}
      <div className="mt-lg center muted" style={{ fontSize: 12 }}>
        Scheduling is separate from payroll. You still log your own hours on <strong>Log Shift</strong>.
      </div>
    </div>
  );
}
