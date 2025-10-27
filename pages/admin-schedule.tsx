import { useState } from 'react';

export default function AdminSchedule() {
  const [form, setForm] = useState({ start_time:'', end_time:'', task_notes:'', status:'draft' });
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [employeeIds, setEmployeeIds] = useState('');

  async function createShift() {
    const body = {
      start_time: new Date(form.start_time).toISOString(),
      end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
      task_notes: form.task_notes || undefined,
      status: form.status
    };
    const r = await fetch('/api/schedule/shifts', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'Error');
    setShiftId(j.id);
  }

  async function assign() {
    if (!shiftId) return;
    const ids = employeeIds.split(',').map(s=>s.trim()).filter(Boolean);
    const r = await fetch(`/api/schedule/shifts/${shiftId}/assign`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ employee_ids: ids })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'Error');
    alert('Assigned!');
  }

  return (
    <div className="p-6 max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold">Scheduling</h1>
      <input className="input" type="datetime-local"
        value={form.start_time} onChange={e=>setForm({...form, start_time:e.target.value})}/>
      <input className="input" type="datetime-local" placeholder="End (optional)"
        value={form.end_time} onChange={e=>setForm({...form, end_time:e.target.value})}/>
      <textarea className="input" placeholder="Notes"
        value={form.task_notes} onChange={e=>setForm({...form, task_notes:e.target.value})}/>
      <select className="input" value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>
        <option value="draft">Draft</option>
        <option value="confirmed">Confirmed</option>
        <option value="changed">Changed</option>
      </select>
      <button className="btn" onClick={createShift}>Create Shift</button>

      {shiftId && (
        <div className="space-y-2">
          <div className="text-sm">Shift ID: {shiftId}</div>
          <input className="input" placeholder="employee UUIDs, comma-separated"
            value={employeeIds} onChange={e=>setEmployeeIds(e.target.value)}/>
          <button className="btn" onClick={assign}>Assign Employees</button>
        </div>
      )}

      <style jsx>{`
        .input{width:100%;padding:.6rem;border:1px solid #ddd;border-radius:.5rem}
        .btn{padding:.6rem 1rem;border:1px solid #111;border-radius:.5rem}
      `}</style>
    </div>
  );
}
