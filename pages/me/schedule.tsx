// pages/me/schedule.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Mate = { id: string; full_name?: string | null };
type Shift = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  job_type?: 'setup' | 'Lights' | 'breakdown' | 'other' | null;
  location_name?: string | null;
  address?: string | null;
  mates?: Mate[];
};

// Detects Apple devices and builds correct map link
function getMapLink(address: string) {
  const encoded = encodeURIComponent(address);

  const isApple =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

  if (isApple) {
    return `https://maps.apple.com/?q=${encoded}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

export default function MySchedule() {
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<Mate | null>(null);

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] =
    useState<'all' | 'setup' | 'Lights' | 'breakdown' | 'other'>('all');

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const fmtDate = (s?: string | null) =>
    s
      ? new Date(s).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : '';

  const fmtTime = (s?: string | null) =>
    s
      ? new Date(s).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

  const JobBadgeXL = ({ text }: { text?: string | null }) => {
    if (!text) return null;
    const label = text[0].toUpperCase() + text.slice(1);
    return (
      <span
        className="badge"
        style={{
          display: 'inline-flex',
          fontSize: 16,
          fontWeight: 900,
          padding: '8px 16px',
          letterSpacing: '.3px',
          textTransform: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {label}
      </span>
    );
  };

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

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (session?.user) {
        const { data: meProfile } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', session.user.id)
          .maybeSingle();

        if (meProfile) {
          setMe({ id: meProfile.id, full_name: meProfile.full_name });
        }
      }

      const r = await fetch('/api/schedule/me', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });

      const j: any = await parseMaybeJson(r);
      if (!r.ok) throw new Error(j?.error || j?.raw);

      setRows(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.job_type !== typeFilter) return false;
      if (!text) return true;
      const hay = [
        r.location_name ?? '',
        r.address ?? '',
        r.job_type ?? '',
        ...(r.mates || []).map(m => m.full_name ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q, typeFilter]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const u: Shift[] = [];
    const p: Shift[] = [];

    filtered.forEach(s => {
      const sMs = s.start_time ? Date.parse(s.start_time) : 0;
      const eMs = s.end_time ? Date.parse(s.end_time) : 0;
      const isPast = eMs ? eMs < now : sMs < now;
      (isPast ? p : u).push(s);
    });

    u.sort(
      (a, b) =>
        (Date.parse(a.start_time ?? '') || 0) -
        (Date.parse(b.start_time ?? '') || 0)
    );
    p.sort(
      (a, b) =>
        (Date.parse(b.end_time ?? '') || 0) -
        (Date.parse(a.end_time ?? '') || 0)
    );

    return { upcoming: u, past: p };
  }, [filtered]);

  const upcomingGroups = useMemo(() => {
    const map = new Map<string, Shift[]>();
    upcoming.forEach(s => {
      const key = s.start_time ? new Date(s.start_time).toDateString() : 'TBD';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });

    return Array.from(map.entries()).sort(
      (a, b) => (Date.parse(a[0]) || 0) - (Date.parse(b[0]) || 0)
    );
  }, [upcoming]);

  // ==== TEAMMATES PILL COMPONENT (initials only) ====
  const Teammates = ({ mates, me }: { mates?: Mate[]; me: Mate | null }) => {
    const list: Mate[] = [];

    if (me) list.push(me);
    if (mates) {
      mates.forEach(m => {
        if (!list.some(x => x.id === m.id)) list.push(m);
      });
    }

    if (list.length === 0) {
      return <span className="muted">Just you</span>;
    }

    return (
      <div
        className="row wrap gap-sm"
        style={{ justifyContent: 'center' }}
      >
        {list.map(m => {
          const name = m.full_name || 'Teammate';
          const initials = name
            .split(' ')
            .filter(Boolean)
            .map(p => p[0].toUpperCase() + '.')
            .join('');

          return (
            <div key={m.id} className="pill" title={name}>
              <span
                className="pill__num"
                style={{ minWidth: 22, textAlign: 'center' }}
              >
                {initials}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // ==== SHIFT CARD COMPONENT ====
  const ShiftCard = ({ s, me }: { s: Shift; me: Mate | null }) => {
    const day = fmtDate(s.start_time);
    const start = fmtTime(s.start_time);
    const end = fmtTime(s.end_time);

    return (
      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
        {/* Row 1: job type */}
        <div>
          <JobBadgeXL text={s.job_type ?? undefined} />
        </div>

        {/* Row 2: date/time */}
        <div
          className="row wrap gap-md"
          style={{ marginTop: 8, justifyContent: 'center' }}
        >
          <strong style={{ fontSize: 16 }}>{day}</strong>
          <span className="muted">
            {start}
            {end ? ` – ${end}` : ''}
          </span>
        </div>

        {/* Row 3: ⭐ CLICKABLE LOCATION */}
        <div
          className="row wrap gap-md"
          style={{ marginTop: 8, justifyContent: 'center', cursor: s.address ? 'pointer' : 'default' }}
        >
          {s.address ? (
            <a
              href={getMapLink(s.address)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', textAlign: 'center' }}
            >
              <strong style={{ color: '#007aff' }}>
                {s.location_name || 'Location'}
              </strong>
              <div className="muted">{s.address}</div>
            </a>
          ) : (
            <strong>{s.location_name || 'Location TBD'}</strong>
          )}
        </div>

        {/* Row 4: teammates */}
        <div className="mt-lg">
          <Teammates mates={s.mates} me={me} />
        </div>
      </div>
    );
  };

  return (
    <div className="page page--center">
      <h1 className="page__title">My Schedule</h1>

      {/* Toolbar */}
      <div className="toolbar">
        <input
          placeholder="Search location, address, teammates…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as any)}
        >
          <option value="all">All types</option>
          <option value="setup">Setup</option>
          <option value="Lights">Lights</option>
          <option value="breakdown">Breakdown</option>
          <option value="other">Other</option>
        </select>
        <button className="topbar-btn" onClick={load}>
          Refresh
        </button>
      </div>

      {err && <div className="alert error">{err}</div>}
      {loading && <div className="toast">Loading…</div>}

      {/* UPCOMING (grouped) */}
      <section className="mt-lg full">
        <div className="section-bar card" style={{ padding: 10 }}>
          <div className="section-bar__left">
            <span className="employee-name">Upcoming</span>
            <span className="pill">
              <span className="pill__num">{upcoming.length}</span>
              <span className="pill__label">shifts</span>
            </span>
          </div>
        </div>

        {!loading && upcoming.length === 0 && (
          <div
            className="card"
            style={{ padding: 12, marginTop: 8, textAlign: 'center' }}
          >
            <span className="muted">No upcoming shifts.</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: 16, marginTop: 10 }}>
          {upcomingGroups.map(([dayKey, list]) => (
            <div key={dayKey} className="card" style={{ padding: 12 }}>
              <div
                className="row between wrap"
                style={{ justifyContent: 'center', gap: 8 }}
              >
                <strong>
                  {dayKey === 'TBD'
                    ? 'Date TBD'
                    : new Date(dayKey).toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                </strong>
                <span className="muted">
                  {list.length} shift{list.length > 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                {list.map(s => (
                  <ShiftCard key={s.id} s={s} me={me} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PAST */}
      <section className="mt-lg full">
        <div className="section-bar card" style={{ padding: 10 }}>
          <div className="section-bar__left">
            <span className="employee-name">Past</span>
            <span className="pill">
              <span className="pill__num">{past.length}</span>
              <span className="pill__label">shifts</span>
            </span>
          </div>
        </div>

        {!loading && past.length === 0 && (
          <div
            className="card"
            style={{ padding: 12, marginTop: 8, textAlign: 'center' }}
          >
            <span className="muted">No past shifts yet.</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          {past.map(s => (
            <ShiftCard key={s.id} s={s} me={me} />
          ))}
        </div>
      </section>

      <div className="mt-lg center muted" style={{ fontSize: 12 }}>
        Scheduling is separate from payroll. You still log your own hours on{' '}
        <strong>Log Shift</strong>.
      </div>
    </div>
  );
}