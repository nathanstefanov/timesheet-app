<div className="font-medium">
  {fmt(s.time_in)} {s.time_out ? `– ${fmt(s.time_out)}` : '(start only)'}
</div>
<div className="text-sm muted">
  {s.job_type ? s.job_type[0].toUpperCase() + s.job_type.slice(1) : '—'}
  {s.location_name ? ` • ${s.location_name}` : '' }
</div>
<div className="text-sm">
  {s.address || ''}
</div>

{s.address && (
  <a
    className="nav-link"
    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`}
    target="_blank"
    rel="noreferrer"
  >
    Open in Maps
  </a>
)}
</div>
{s.notes && <div className="text-sm mt-1">{s.notes}</div>}
<div className="text-sm mt-2">
  <span className="font-semibold">Who’s on:</span>{' '}
  {(s.roster || []).map((p:any, i:number) => (
    <span key={p?.id}>{i>0?', ':''}{p?.full_name || p?.id?.slice(0,8)}</span>
  ))}
</div>
