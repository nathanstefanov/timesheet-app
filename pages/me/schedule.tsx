import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const fetcher = (u:string)=>fetch(u).then(r=>r.json());
const fmt = (s?:string|null)=> s ? new Date(s).toLocaleString() : '';

export default function MySchedule() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
    })();
  }, []);

  const { data, error } = useSWR(
    userId ? `/api/schedule/me?employee_id=${userId}` : null,
    fetcher
  );

  if (!userId) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6">Error loading schedule</div>;
  if (!data) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-2xl font-semibold">My Schedule</h1>
      {data.length === 0 && <div>No upcoming shifts.</div>}
      {data.map((s:any)=>(
        <div key={s.id} className="border rounded-xl p-4">
          <div className="font-medium">
            {fmt(s.time_in)} {s.time_out ? `– ${fmt(s.time_out)}` : '(start only)'}
          </div>
          {s.notes && <div className="text-sm mt-1">{s.notes}</div>}
          <div className="text-sm mt-2">
            <span className="font-semibold">Who’s on:</span>{' '}
            {(s.roster_employee_ids||[]).map((id:string,i:number)=>
              <span key={id}>{i>0?', ':''}{id.slice(0,8)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
