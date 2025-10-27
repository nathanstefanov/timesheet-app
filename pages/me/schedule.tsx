// pages/me/schedule.tsx
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type RosterPerson = { id: string; full_name?: string | null };
type Shift = {
  id: string;
  time_in: string;
  time_out: string | null;
  notes?: string | null;
  location_name?: string | null;
  address?: string | null;
  job_type?: 'setup' | 'event' | 'breakdown' | 'other' | null;
  roster?: RosterPerson[];
};

const fetcher = (u: string) => fetch(u).then(r => r.json());
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');
const cap = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export default function MySchedulePage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
    })();
  }, []);

  const { data, error } = useSWR<Shift[]>(
    userId ? `/api/schedule/me?employee_id=${userId}` : null,
    fetcher
  );

  if (!userId) return <div className="page center">Loading…</div>;
  if (error) return <div className="page center">Error loading schedule.</div>;
  if (!data) return <div className="page center">Loading…</div>;

  return (
    <div className="page">
      <h1 className="page__title">My Schedule</h1>

      {data.length === 0 && (
        <div className="card" style={{ padding: 12 }}>
          No upcoming shifts.
        </div>
      )}

      <div className="mt-lg" style={{ display: 'grid', gap: 12 }}>
        {data.map((s) => (
          <div key={s.id} className="card" style={{ padding: 12 }}>
            {/* Time */}
            <div className="row wrap gap-md" style={{ alignItems: 'baseline' }}>
              <div className="font-medium">
                {fmt(s.time_in)} {s.time_out ? `– ${fmt(s.time_out)}` : '(start only)'}
              </div>
              <div className="muted">
                {s.job_type ? cap(s.job_type) : '—'}
                {s.location_name ? ` • ${s.location_name}` : ''}
              </div>
            </div>

            {/* Address + Maps */}
            {(s.address || s.location_name) && (
              <div className="row wrap gap-md mt-lg">
                <div className="muted">{s.address || s.location_name}</div>
                {s.address && (
                  <a
                    className="nav-link"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      s.address
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Maps
                  </a>
                )}
              </div>
            )}

            {s.notes && <div className="mt-lg">{s.notes}</div>}

            {/* Roster */}
            <div className="mt-lg">
              <span className="font-medium">Who’s on:</span>{' '}
              {(s.roster ?? []).length === 0
                ? '—'
                : (s.roster ?? []).map((p, i) => (
                    <span key={p.id}>
                      {i > 0 ? ', ' : ''}
                      {p.full_name || p.id.slice(0, 8)}
                    </span>
                  ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
