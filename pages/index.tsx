// pages/index.tsx
import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clickLock = useRef(false);

  // small helper: race a promise with a timeout
  function withTimeout<T>(p: Promise<T>, ms = 8000) {
    return Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Timed out')), ms)),
    ]);
  }

  async function ensureProfile(uid: string) {
    // Try to read a profile row. If not found, create a minimal one.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', uid)
      .maybeSingle();

    if (error) throw error;
    if (data) return;

    // Insert a basic row; your RLS policies must allow user to insert/update own row or admin
    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert({ id: uid, role: 'employee', full_name: null }, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || clickLock.current) return;
    clickLock.current = true;
    setBusy(true);
    setMsg(null);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        12000
      );

      if (error) throw error;
      const user = data?.user;
      if (!user) throw new Error('No user in session');

      // make sure a profile row exists so the rest of the app doesn’t spin
      await withTimeout(ensureProfile(user.id), 10000);

      // hard replace to dashboard
      await r.replace('/dashboard');
    } catch (err: any) {
      setMsg(err?.message || 'Login failed');
    } finally {
      setBusy(false);
      // brief unlock after next tick (avoid rapid double submits)
      setTimeout(() => (clickLock.current = false), 150);
    }
  }

  return (
    <main className="page narrow mx-auto">
      <h1>Sign in</h1>
      {msg && (
        <div className="toast toast--error" role="alert">
          <span>{msg}</span>
          <button className="toast__dismiss" onClick={() => setMsg(null)}>Dismiss</button>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="topbar-btn" type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Sign in'}
          </button>
        </div>
      </form>
    </main>
  );
}
