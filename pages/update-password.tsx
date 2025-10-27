// pages/update-password.tsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function UpdatePassword() {
  const r = useRouter();
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function save() {
    setErr(undefined); setMsg(undefined); setLoading(true);
    try {
      if (pw.length < 8) throw new Error('Password must be at least 8 characters');
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setMsg('Password updated. Redirecting…');
      setTimeout(() => r.replace('/dashboard'), 800);
    } catch (e: any) {
      setErr(e.message || 'Could not update password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Set New Password</h1>
        <div className="auth-input-row">
          <input
            className="auth-input"
            type={show ? 'text' : 'password'}
            placeholder="New password (min 8 chars)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <label className="auth-showpw">
            <input type="checkbox" checked={show} onChange={(e)=>setShow(e.target.checked)} />
            Show
          </label>
        </div>
        {err && <div className="auth-alert error">{err}</div>}
        {msg && <div className="auth-alert ok">{msg}</div>}
        <button className="auth-btn primary" onClick={save} disabled={loading}>
          {loading ? 'Saving…' : 'Save Password'}
        </button>
      </div>
    </main>
  );
}
