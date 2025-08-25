import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function AuthDebug() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const withTimeout = <T,>(p: Promise<T>, ms = 10000) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Auth request timed out')), ms)),
    ]);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setMsg(null);

    console.log('[auth] start');
    try {
      console.log('[auth] env', {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      });

      console.log('[auth] pre getUser');
      const g1 = await withTimeout(supabase.auth.getUser(), 5000);
      console.log('[auth] getUser returned', g1);

      console.log('[auth] signInWithPassword →', email);
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password: pw }),
        10000
      );

      if (error) {
        console.error('[auth] error', error);
        throw error;
      }
      console.log('[auth] signIn data', data);

      console.log('[auth] post getUser');
      const g2 = await withTimeout(supabase.auth.getUser(), 5000);
      console.log('[auth] post getUser returned', g2);

      setMsg('Signed in! Redirecting…');
      await r.replace('/dashboard');
    } catch (e: any) {
      console.error('[auth] caught', e);
      setMsg(e?.message || 'Unknown auth error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', background: '#f7f8fc' }}>
      <div style={{ width: 'min(520px, 94vw)', background: '#fff', border: '1px solid #e6e8ee', borderRadius: 16, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Debug Sign In</h2>

        <label>Email</label>
        <input
          style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #d1d5db', padding: '0 12px' }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />

        <label style={{ display: 'block', marginTop: 10 }}>Password</label>
        <input
          style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #d1d5db', padding: '0 12px' }}
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
        />

        <button
          onClick={signIn}
          disabled={busy}
          style={{ width: '100%', height: 46, marginTop: 12, borderRadius: 12, border: 0, fontWeight: 700, color: '#fff', background: '#4f46e5', opacity: busy ? .7 : 1 }}
        >
          {busy ? 'Working…' : 'Sign In'}
        </button>

        {msg && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: msg.startsWith('Signed') ? '#dcfce7' : '#fee2e2', border: `1px solid ${msg.startsWith('Signed') ? '#bbf7d0' : '#fecaca'}`, color: msg.startsWith('Signed') ? '#065f46' : '#991b1b' }}>
            {msg}
          </div>
        )}

        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
          Open DevTools → Console to see step-by-step logs. If it times out, the issue is network / CORS / URL config.
        </p>
      </div>
    </main>
  );
}
