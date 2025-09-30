// pages/admin.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type Tab = 'unpaid' | 'paid' | 'all';
type SortBy = 'name' | 'hours' | 'pay' | 'unpaid';
type SortDir = 'asc' | 'desc';

type Profile = { id: string; role: 'admin' | 'employee' } | null;
type Shift = {
  id: string;
  user_id: string;
  shift_date: string;       // YYYY-MM-DD
  shift_type: string;
  time_in?: string | null;  // ISO
  time_out?: string | null; // ISO
  hours_worked?: number | null;
  pay_due?: number | null;
  is_paid?: boolean | null;
  paid_at?: string | null;  // ISO
  paid_by?: string | null;

  // admin-only metadata
  admin_flag?: boolean | null;
  admin_note?: string | null;
};

// ---- Helpers ----
function payInfo(s: Shift): { pay: number; minApplied: boolean; base: number } {
  const rate = Number((s as any).pay_rate ?? 25);
  const hours = Number(s.hours_worked ?? 0);
  const base = s.pay_due != null ? Number(s.pay_due) : hours * rate;
  const isBreakdown = s.shift_type === 'Breakdown';
  const pay = isBreakdown ? Math.max(base, 50) : base;
  return { pay, minApplied: isBreakdown && base < 50, base };
}
function venmoHref(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.startsWith('@') ? v.slice(1) : v;
  return `https://venmo.com/u/${encodeURIComponent(handle)}`;
}
function isAutoFlag(s: Shift): boolean {
  const isBreakdown = (s.shift_type || '').toLowerCase() === 'breakdown';
  const hrs = Number(s.hours_worked ?? 0);
  return isBreakdown && hrs >= 3;
}

// date helpers
function toYMD(d: Date) { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function startOfWeek(d: Date) { const t=new Date(d); const day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); t.setHours(0,0,0,0); return t; }
function addDays(d: Date, n: number) { const t=new Date(d); t.setDate(t.getDate()+n); return t; }
function stripTime(d: Date) { const t=new Date(d); t.setHours(0,0,0,0); return t; }

export default function Admin() {
  const router = useRouter();

  // auth / role
  const [me, setMe] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);

  // data
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [venmo, setVenmo] = useState<Record<string, string>>({});

  // ui state
  const [tab, setTab] = useState<Tab>('unpaid'); // default unpaid
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [userSorted, setUserSorted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});

  // week / range filters
  const today = useMemo(() => stripTime(new Date()), []);
  const [useWeek, setUseWeek] = useState<boolean>(false); // default ALL-TIME
  const [weekAnchor, setWeekAnchor] = useState<Date>(startOfWeek(today));
  const weekFrom = useMemo(() => toYMD(weekAnchor), [weekAnchor]);
  const weekTo = useMemo(() => toYMD(addDays(weekAnchor, 6)), [weekAnchor]);
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);

  // NOTE MODAL
  const [noteModal, setNoteModal] = useState<{ open: boolean; row: Shift | null }>({ open: false, row: null });
  const [noteDraft, setNoteDraft] = useState<string>('');
  function openNoteModal(row: Shift) { setNoteDraft(row.admin_note ?? ''); setNoteModal({ open: true, row }); }
  function closeNoteModal() { setNoteModal({ open: false, row: null }); }
  async function saveNoteModal() {
    if (!noteModal.row) return;
    const row = noteModal.row;
    const prev = row.admin_note ?? '';
    const next = noteDraft;
    setShifts(p => p.map(s => (s.id === row.id ? { ...s, admin_note: next } : s)));
    const { error } = await supabase.from('shifts').update({ admin_note: next }).eq('id', row.id);
    if (error) { alert(error.message); setShifts(p => p.map(s => (s.id === row.id ? { ...s, admin_note: prev } : s))); return; }
    closeNoteModal();
  }

  // ---- Auth + role check ----
  useEffect(() => {
    let alive = true;
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;

      if (!session?.user) { setMe(null); setChecking(false); router.replace('/'); return; }

      const { data, error } = await supabase.from('profiles').select('id, role').eq('id', session.user.id).single();
      if (!alive) return;
      if (error || !data) { setMe(null); setChecking(false); router.replace('/dashboard?msg=not_admin'); return; }

      setMe(data as any);
      setChecking(false);
      if ((data as any).role !== 'admin') router.replace('/dashboard?msg=not_admin');
    }
    loadProfile();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { setChecking(true); loadProfile(); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [router]);

  // ---- Auto sort per tab unless user overrides ----
  useEffect(() => {
    if (userSorted) return;
    if (tab === 'unpaid') { setSortBy('unpaid'); setSortDir('desc'); }
    else if (tab === 'paid') { setSortBy('pay'); setSortDir('desc'); }
    else { setSortBy('name'); setSortDir('asc'); }
  }, [tab, userSorted]);

  // ---- Load shifts + profiles (honor filters) ----
  const loadShifts = useCallback(async () => {
    if (checking) return;
    if (!me || me.role !== 'admin') return;

    setLoading(true);
    setErr(undefined);
    try {
      let q = supabase.from('shifts').select('*').order('shift_date', { ascending: false });
      if (tab === 'unpaid') q = q.eq('is_paid', false);
      if (tab === 'paid') q = q.eq('is_paid', true);

      const from = useWeek ? weekFrom : (rangeFrom || null);
      const to = useWeek ? weekTo : (rangeTo || null);
      if (from) q = q.gte('shift_date', from);
      if (to) q = q.lte('shift_date', to);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Shift[];
      setShifts(rows);

      const ids = Array.from(new Set(rows.map(s => s.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, venmo_url').in('id', ids);
        const nameMap: Record<string, string> = {};
        const venmoMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          nameMap[p.id] = p.full_name || '—';
          if (p.venmo_url) venmoMap[p.id] = p.venmo_url;
        });
        setNames(nameMap); setVenmo(venmoMap);
      } else { setNames({}); setVenmo({}); }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load shifts.');
    } finally { setLoading(false); }
  }, [checking, me, tab, useWeek, weekFrom, weekTo, rangeFrom, rangeTo]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // refresh on focus/visibility
  useEffect(() => {
    const onFocus = () => loadShifts();
    const onVisible = () => document.visibilityState === 'visible' && loadShifts();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadShifts]);

  // ---- Totals by employee (track MIN + FLAG counts) ----
  const totals = useMemo(() => {
    const m: Record<string, { id: string; name: string; hours: number; pay: number; unpaid: number; minCount: number; flagCount: number }> = {};
    for (const s of shifts) {
      const id = s.user_id;
      const name = names[id] || '—';
      m[id] ??= { id, name, hours: 0, pay: 0, unpaid: 0, minCount: 0, flagCount: 0 };
      const { pay, minApplied } = payInfo(s);
      const h = Number(s.hours_worked || 0);
      const flagged = Boolean(s.admin_flag) || isAutoFlag(s);
      m[id].hours += h;
      m[id].pay += pay;
      if (minApplied) m[id].minCount += 1;
      if (flagged) m[id].flagCount += 1;
      if (!Boolean(s.is_paid)) m[id].unpaid += pay;
    }
    return Object.values(m);
  }, [shifts, names]);

  const unpaidTotal = useMemo(() => totals.reduce((sum, t) => sum + t.unpaid, 0), [totals]);

  const sortedTotals = useMemo(() => {
    const a = [...totals];
    if (sortBy === 'name') {
      a.sort((x, y) => x.name.localeCompare(y.name) * (sortDir === 'asc' ? 1 : -1));
    } else {
      a.sort((x, y) => {
        const aa = (x as any)[sortBy] as number;
        const bb = (y as any)[sortBy] as number;
        return (bb - aa) * (sortDir === 'asc' ? -1 : 1);
      });
    }
    return a;
  }, [totals, sortBy, sortDir]);

  // ---- Group shifts by employee ----
  const groups = useMemo(() => {
    const m: Record<string, Shift[]> = {};
    for (const s of shifts) (m[s.user_id] ??= []).push(s);
    for (const id in m) {
      m[id].sort((a, b) => {
        if (a.shift_date < b.shift_date) return -1;
        if (a.shift_date > b.shift_date) return 1;
        return String(a.time_in || '').localeCompare(String(b.time_in || ''));
      });
    }
    return m;
  }, [shifts]);

  const sectionOrder = useMemo(() => sortedTotals.map(t => t.id), [sortedTotals]);

  // ---- Actions ----
  async function togglePaid(row: Shift, next: boolean) {
    const patch = { is_paid: next, paid_at: next ? new Date().toISOString() : null, paid_by: next ? (me as any)!.id : null };
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from('shifts').update(patch).eq('id', row.id);
    if (error) { alert(error.message); setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, is_paid: !next } : s))); }
  }

  async function bulkTogglePaidForEmployee(userId: string, next: boolean) {
    const rows = groups[userId] || [];
    const toChange = rows.filter(s => Boolean(s.is_paid) !== next).map(s => s.id);
    if (!toChange.length) return;

    const name = names[userId] || 'employee';
    const verb = next ? 'mark ALL shifts PAID' : 'mark ALL shifts UNPAID';
    if (!confirm(`Are you sure you want to ${verb} for ${name}? (${toChange.length} shift${toChange.length > 1 ? 's' : ''})`)) return;

    const patch = { is_paid: next, paid_at: next ? new Date().toISOString() : null, paid_by: next ? (me as any)!.id : null };
    setBulkBusy(b => ({ ...b, [userId]: true }));
    const prev = shifts;
    setShifts(prev => prev.map(s => (s.user_id === userId && toChange.includes(s.id) ? { ...s, ...patch } : s)));
    const { error } = await supabase.from('shifts').update(patch).in('id', toChange);
    if (error) { alert(error.message); setShifts(prev); }
    setBulkBusy(b => ({ ...b, [userId]: false }));
  }

  function editRow(row: Shift) { router.push(`/shift/${row.id}`); }
  async function deleteRow(row: Shift) {
    const name = names[row.user_id] || 'employee';
    if (!confirm(`Delete shift for ${name} on ${row.shift_date}?`)) return;
    const { error } = await supabase.from('shifts').delete().eq('id', row.id);
    if (error) return alert(error.message);
    setShifts(prev => prev.filter(s => s.id !== row.id));
  }
  async function toggleAdminFlag(row: Shift, next: boolean) {
    setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, admin_flag: next } : s)));
    const { error } = await supabase.from('shifts').update({ admin_flag: next }).eq('id', row.id);
    if (error) {
      alert(error.message);
      setShifts(prev => prev.map(s => (s.id === row.id ? { ...s, admin_flag: row.admin_flag ?? null } : s)));
    }
  }

  // constrain "Next ▶" to not go past the current calendar week
  const nextWeekAnchor = addDays(weekAnchor, 7);
  const nextWeekEnd = stripTime(addDays(nextWeekAnchor, 6));
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = stripTime(addDays(currentWeekStart, 6));
  const disableNextWeek = nextWeekEnd > currentWeekEnd;

  return (
    <main className="page page--center">
      <div className="container">
        <h1 className="page__title">Admin Dashboard</h1>
        {err && <div className="alert error" role="alert">Error: {err}</div>}

        {/* Summary — NOW FULLY CENTERED */}
        <div className="card summary">
          <div className="summary__row center-all">
            <span className="chip chip--xl">Total Unpaid: ${unpaidTotal.toFixed(2)}</span>
            <span className="meta">Employees with Unpaid: {totals.filter(t => t.unpaid > 0).length}</span>
          </div>
          <div className="summary__row center-all gap-lg">
            <span className="inline">
              <span className="badge badge-min">MIN $50</span>
              <span className="muted">Breakdown boosted to minimum</span>
            </span>
            <span className="inline">
              <span className="badge badge-flag">FLAGGED</span>
              <span className="muted">Auto if Breakdown ≥ 3h</span>
            </span>
          </div>
        </div>

        {/* Tabs — NOW FULLY CENTERED */}
        <div className="card">
          <div className="tabs center-all">
            <button className={`tab ${tab === 'unpaid' ? 'active' : ''}`} onClick={() => { setTab('unpaid'); setUserSorted(false); }}>Unpaid</button>
            <button className={`tab ${tab === 'paid' ? 'active' : ''}`} onClick={() => { setTab('paid'); setUserSorted(false); }}>Paid</button>
            <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => { setTab('all'); setUserSorted(false); }}>All</button>
          </div>
        </div>

        {/* Date / Week Filters — NO MORE SCROLL BOX; TWO CLEAN, CENTERED ROWS */}
        <div className="card">
          <div className="filters-col">
            {/* WEEK ROW */}
            <div className="filters-row">
              <label className="inline">
                <input type="radio" name="range-mode" checked={useWeek} onChange={() => setUseWeek(true)} />
                <span>Week</span>
              </label>
              <div className="inline btn-group">
                <button className="btn" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>◀ Prev</button>
                <button className="btn" onClick={() => setWeekAnchor(startOfWeek(today))}>This Week</button>
                <button className="btn" onClick={() => setWeekAnchor(nextWeekAnchor)} disabled={disableNextWeek}>Next ▶</button>
              </div>
              <div className="muted range-label">{weekFrom} – {weekTo}</div>
            </div>

            {/* DIVIDER */}
            <div className="filters-divider" />

            {/* RANGE / ALL-TIME ROW */}
            <div className="filters-row">
              <label className="inline">
                <input type="radio" name="range-mode" checked={!useWeek} onChange={() => setUseWeek(false)} />
                <span>Range / All-time</span>
              </label>
              <div className="inline">
                <input className="input" type="date" value={rangeFrom ?? ''} onChange={(e)=>setRangeFrom(e.target.value || null)} disabled={useWeek} aria-label="From"/>
                <span className="muted">to</span>
                <input className="input" type="date" value={rangeTo ?? ''} onChange={(e)=>setRangeTo(e.target.value || null)} disabled={useWeek} aria-label="To"/>
              </div>
              <button className="btn" onClick={()=>{ setRangeFrom(null); setRangeTo(null); }} title="Clear range (shows all time)" disabled={useWeek}>
                Clear (All-time)
              </button>
            </div>
          </div>
        </div>

        {/* Totals by Employee */}
        <div className="card">
          <div className="card__header">
            <h3>Totals by Employee</h3>
            <div className="sorter">
              <label className="sr-only" htmlFor="sort-by">Sort by</label>
              <select id="sort-by" className="input" value={sortBy} onChange={(e)=>{ setSortBy(e.target.value as SortBy); setUserSorted(true); }}>
                <option value="name">Name</option>
                <option value="hours">Hours</option>
                <option value="pay">Pay</option>
                <option value="unpaid">Unpaid</option>
              </select>
              <button className="btn" onClick={()=>{ setSortDir(d=> d==='asc'?'desc':'asc'); setUserSorted(true);}} aria-label="Toggle sort direction">
                {sortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Hours</th><th>Pay</th><th>Unpaid</th>
                </tr>
              </thead>
              <tbody>
                {sortedTotals.map((t) => {
                  const vHref = venmoHref(venmo[t.id]);
                  const hasUnpaid = t.unpaid > 0.0001;
                  const badges: string[] = [];
                  if (t.minCount > 0) badges.push(`${t.minCount}× MIN`);
                  if (t.flagCount > 0) badges.push(`${t.flagCount}× FLAG`);
                  return (
                    <tr key={t.id}>
                      <td data-label="Employee">
                        <span className="emp-name">{t.name}</span>
                        {badges.length > 0 && <span className="muted" style={{ marginLeft: 8 }}>({badges.join(', ')})</span>}
                      </td>
                      <td data-label="Hours">{t.hours.toFixed(2)}</td>
                      <td data-label="Pay">${t.pay.toFixed(2)}</td>
                      <td data-label="Unpaid">
                        ${t.unpaid.toFixed(2)}
                        {hasUnpaid && vHref && <a className="btn btn-venmo" href={vHref} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>Venmo</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Shifts */}
        <div className="card">
          <div className="card__header"><h3>Shifts</h3></div>
          {loading && <p className="center muted">Loading…</p>}
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Employee</th><th>Date</th><th>Type</th><th>In</th><th>Out</th><th>Hours</th><th>Pay</th><th>Paid?</th><th className="col-hide-md">Paid at</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sectionOrder.map((uid) => {
                  const rows = groups[uid] || [];
                  if (!rows.length) return null;

                  const name = names[uid] || '—';
                  const subtotal = rows.reduce((acc, s) => {
                    const info = payInfo(s);
                    acc.hours += Number(s.hours_worked || 0);
                    acc.pay += info.pay;
                    return acc;
                  }, { hours: 0, pay: 0 });

                  const unpaidCount = rows.filter(s => !s.is_paid).length;
                  const allPaid = unpaidCount === 0;

                  return (
                    <React.Fragment key={uid}>
                      <tr className="section-head">
                        <td colSpan={10}>
                          <div className="section-bar">
                            <div className="section-side">
                              <strong className="employee-name">{name}</strong>
                              <div className="pill" aria-label="Unpaid shifts">
                                <span className="pill__num">{unpaidCount}</span>
                                <span className="pill__label">unpaid</span>
                              </div>
                            </div>
                            <div className="section-side">
                              <button className="btn" disabled={bulkBusy[uid] || allPaid} onClick={()=>bulkTogglePaidForEmployee(uid, true)}>Mark ALL Paid</button>
                              <button className="btn" disabled={bulkBusy[uid] || rows.length === unpaidCount} onClick={()=>bulkTogglePaidForEmployee(uid, false)}>Mark ALL Unpaid</button>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {rows.map((s) => {
                        const { pay, minApplied, base } = payInfo(s);
                        const paid = Boolean(s.is_paid);
                        const hasNote = !!(s.admin_note && s.admin_note.trim());
                        const auto = isAutoFlag(s);
                        const combinedFlagged = Boolean(s.admin_flag) || auto;

                        return (
                          <tr key={s.id} className={combinedFlagged ? 'row-flagged' : ''}>
                            <td data-label="Employee">
                              <div className="emp-cell">
                                <span>{name}</span>
                                {hasNote && <button className="icon-btn" title="View note" onClick={()=>openNoteModal(s)} aria-label="View note">📝</button>}
                              </div>
                            </td>
                            <td data-label="Date">{s.shift_date}</td>
                            <td data-label="Type">{s.shift_type}</td>
                            <td data-label="In">{s.time_in ? new Date(s.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                            <td data-label="Out">{s.time_out ? new Date(s.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                            <td data-label="Hours">{Number(s.hours_worked ?? 0).toFixed(2)}</td>
                            <td data-label="Pay">
                              ${pay.toFixed(2)}{' '}
                              {minApplied && <span className="badge badge-min" title={`Breakdown minimum applied (base ${base.toFixed(2)} < $50)`} style={{ marginLeft: 6 }}>MIN $50</span>}
                              {combinedFlagged && <span className="badge badge-flag" title={auto ? 'Auto-flagged (Breakdown ≥ 3h)' : 'Manually flagged'} style={{ marginLeft: 6 }}>FLAG</span>}
                            </td>
                            <td data-label="Paid?">
                              <label className="inline-check">
                                <input type="checkbox" checked={paid} onChange={(e)=>togglePaid(s, e.target.checked)} disabled={bulkBusy[uid]} aria-label={paid ? 'Mark unpaid' : 'Mark paid'} />
                                <span className={paid ? 'badge badge-paid' : 'badge badge-unpaid'}>{paid ? 'PAID' : 'NOT PAID'}</span>
                              </label>
                            </td>
                            <td data-label="Paid at" className="col-hide-md">{s.paid_at ? new Date(s.paid_at).toLocaleString() : '—'}</td>
                            <td data-label="Actions">
                              <div className="actions">
                                <button className="btn" onClick={()=>editRow(s)}>Edit</button>
                                <button className="btn btn-danger" onClick={()=>deleteRow(s)}>Delete</button>
                                <button
                                  className={`btn ${combinedFlagged ? 'btn-flag-on' : 'btn-flag'}`}
                                  title={combinedFlagged ? (auto ? 'Auto-flagged (Breakdown ≥ 3h). Click to toggle manual flag.' : 'Manually flagged. Click to unflag.') : 'Flag for attention'}
                                  onClick={()=>toggleAdminFlag(s, !Boolean(s.admin_flag))}
                                  aria-pressed={combinedFlagged}
                                >
                                  {combinedFlagged ? '★ Flagged' : '☆ Flag'}
                                </button>
                                <button className="btn" onClick={()=>openNoteModal(s)} title={hasNote ? 'View / Edit note' : 'Add note'}>📝 Note</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      <tr className="subtotal">
                        <td colSpan={5} className="subtotal__label">Total — {name}</td>
                        <td>{subtotal.hours.toFixed(2)}</td>
                        <td>${subtotal.pay.toFixed(2)}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* NOTE MODAL */}
        {noteModal.open && noteModal.row && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div className="modal-header"><span className="modal-title">📝 Note — {names[noteModal.row.user_id] || '—'} · {noteModal.row.shift_date}</span></div>
              <div className="modal-body">
                <textarea value={noteDraft} onChange={(e)=>setNoteDraft(e.target.value)} placeholder="Add a private admin note…"/>
                <p className="muted" style={{ marginTop: 8 }}>Notes are only visible to admins on this page.</p>
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={closeNoteModal}>Close</button>
                <button className="btn btn-primary" onClick={saveNoteModal}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        /* Layout */
        .container{ width:min(1100px, 92vw); margin:0 auto; padding:12px 0 40px; }
        .page__title{ font-size: clamp(22px, 2.4vw, 28px); text-align:center; margin:6px 0 14px; }
        .center{ text-align:center; }

        /* Cards */
        .card{ background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:16px; padding:14px; margin:12px 0; box-shadow:0 1px 2px rgba(0,0,0,0.05); }
        .card__header{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .card__header h3{ margin:0; font-size: clamp(18px, 2vw, 20px); }

        /* Summary — centered */
        .summary{ padding:16px; }
        .summary__row{ display:flex; flex-wrap:wrap; gap:12px; }
        .center-all{ justify-content:center; align-items:center; text-align:center; }
        .gap-lg{ gap:20px; }

        /* Tabs — centered */
        .tabs{ display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; }
        .tab{ display:inline-flex; align-items:center; justify-content:center; height:40px; padding:0 16px; border-radius:12px; border:1px solid var(--border,#e5e7eb); background:#f8fafc; font-weight:700; cursor:pointer; }
        .tab.active{ background:#eef2ff; border-color:#c7d2fe; }

        /* Filters — two centered rows, no scrolling */
        .filters-col{ display:flex; flex-direction:column; gap:12px; }
        .filters-row{ display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; }
        .filters-divider{ width:100%; height:1px; background:var(--border,#e5e7eb); opacity:0.6; }
        .btn-group{ display:inline-flex; gap:8px; }
        .range-label{ white-space:nowrap; }

        /* Inputs & buttons */
        .input{ height:36px; padding:0 10px; border-radius:10px; border:1px solid var(--border,#e5e7eb); background:#fff; }
        .btn, .btn-venmo{ display:inline-flex; align-items:center; justify-content:center; height:36px; padding:0 14px; border-radius:10px; border:1px solid var(--border,#e5e7eb); background:#f8fafc; color:#111827; font-weight:600; cursor:pointer; text-decoration:none; white-space:nowrap; }
        .btn:hover, .btn-venmo:hover{ filter:brightness(0.98); }
        .btn:active{ transform: translateY(1px); }
        .btn-primary{ background:#e8f0ff; }
        .btn-danger{ background:#ffe8e8; }
        .btn-flag{ background:#fff; }
        .btn-flag-on{ background:#fff4e5; border-color:#f3d2a8; font-weight:800; }

        .icon-btn{ display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; margin-left:6px; border-radius:999px; border:1px solid var(--border,#e5e7eb); background:#fff; cursor:pointer; line-height:1; }
        .emp-cell{ display:flex; align-items:center; justify-content:center; gap:6px; }
        .emp-name{ font-weight:600; }

        /* Tables */
        .table-wrap{ width:100%; overflow:auto; }
        table{ width:100%; border-collapse:collapse; }
        .table th, .table td{ text-align:center; padding:10px 8px; border-top:1px solid #f1f5f9; vertical-align:middle; font-size:14px; }
        .table thead th{ position:sticky; top:0; background:#fafafa; z-index:1; font-weight:700; }
        .table--stack td::before{ display:none; font-weight:700; margin-right:6px; }

        @media (max-width: 680px){
          .table--stack thead{ display:none; }
          .table--stack, .table--stack tbody, .table--stack tr, .table--stack td{ display:block; width:100%; }
          .table--stack tr{ border:1px solid #f1f5f9; border-radius:12px; margin:10px 0; padding:8px; }
          .table--stack td{ display:flex; align-items:center; justify-content:space-between; border:none; padding:8px 4px; }
          .table--stack td::before{ display:inline-block; content:attr(data-label); color:#6b7280; }
          .section-head td, .subtotal td{ display:block; }
        }

        /* Section bar */
        .section-bar{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .section-side{ display:flex; align-items:center; gap:10px; }
        .pill{ display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#f3f4f6; border:1px solid var(--border,#e5e7eb); }
        .pill__num{ font-weight:800; }
        .subtotal__label{ text-align:center; }

        /* Badges */
        .badge-min{ display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid #f6ca00; background:#fffbe6; color:#6b5800; font-weight:700; }
        .badge-flag{ display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid #f3d2a8; background:#fff4e5; color:#7a4b14; font-weight:700; }
        .badge-paid{ display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid #16a34a; background:#ecfdf5; color:#065f46; font-weight:700; }
        .badge-unpaid{ display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid #ef4444; background:#fef2f2; color:#7f1d1d; font-weight:700; }

        /* Softer flagged row */
        .row-flagged{ background:#fff7ed; }

        /* Modal */
        .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:1000; padding:10px; }
        .modal{ width:min(640px, 100%); background:white; border-radius:16px; padding:16px; box-shadow:0 10px 25px rgba(0,0,0,0.2); display:flex; flex-direction:column; gap:12px; }
        .modal-header{ display:flex; align-items:center; justify-content:center; }
        .modal-title{ font-weight:800; text-align:center; }
        .modal-body textarea{ width:100%; min-height:140px; border-radius:12px; padding:10px; border:1px solid var(--border,#e5e7eb); resize:vertical; font:inherit; }
        .modal-actions{ display:flex; align-items:center; justify-content:center; gap:10px; }

        /* Utilities */
        .muted{ color:#6b7280; }
        .inline{ display:inline-flex; align-items:center; gap:6px; }
        .sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); border:0; }
        .alert.error{ background:#fef2f2; border:1px solid #fecaca; color:#7f1d1d; padding:10px 12px; border-radius:10px; }
      `}</style>
    </main>
  );
}

export async function getServerSideProps() { return { props: {} }; }
