// pages/index.tsx
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Mode = 'signin' | 'signup';
const LOGO_URL =
  'https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, [mode]);
  const clearAlerts = () => { setErr(undefined); setMsg(undefined); };

  async function submit() {
    clearAlerts();
    setLoading(true);
    try {
      if (!email) throw new Error('Enter your email');
      if (mode === 'signup' && password.length < 8) throw new Error('Password must be at least 8 characters');
      if (mode === 'signin' && !password) throw new Error('Enter your password');

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created. You can sign in now.');
        setMode('signin');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Force a clean navigation so the cookie-backed session is read immediately
      window.location.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    clearAlerts(); setLoading(true);
    try {
      if (!email) throw new Error('Enter your email');
      const redirectTo = typeof window !== 'undefined' ? `${location.origin}/dashboard` : undefined;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setMsg('Check your email for a login link.');
    } catch (e: any) { setErr(e?.message || 'Could not send link'); }
    finally { setLoading(false); }
  }

  async function sendReset() {
    clearAlerts(); setLoading(true);
    try {
      if (!email) throw new Error('Enter your email first');
      const redirectTo = typeof window !== 'undefined' ? `${location.origin}/update-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMsg('Password reset email sent. Check your inbox.');
    } catch (e: any) { setErr(e?.message || 'Could not send reset email'); }
    finally { setLoading(false); }
  }

  function onKeyDown(e: React.KeyboardEvent) { if (e.key === 'Enter') submit(); }

  return (
    <div className="wrap">
      <div className="card">
        <div className="title-row">
          {LOGO_URL ? <img src={LOGO_URL} alt="Logo" className="logo" /> : null}
          <h1 className="title">Timesheet</h1>
        </div>

        <div className="tabs">
          <button className={`tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => setMode('signin')}>Sign In</button>
          <button className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>Create Account</button>
        </div>

        <label className="label">Email</label>
        <input
          ref={emailRef}
          className="input"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <label className="label">Password {mode === 'signup' ? '(min 8 chars)' : ''}</label>
        <div className="pwrow">
          <input
            className="input"
            type={showPw ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signin' ? 'Your password' : 'Create a password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <label className="show">
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            Show
          </label>
        </div>

        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}

        <button className="btn primary" onClick={submit} disabled={loading}>
          {loading ? 'Working…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>

        <div className="actions">
          <button className="link" onClick={sendMagicLink} disabled={loading}>Email me a login link</button>
          <span className="sep">•</span>
          <button className="link" onClick={sendReset} disabled={loading}>Forgot password?</button>
        </div>
      </div>

      <style jsx>{`
        .wrap { min-height: 100svh; display:flex; align-items:center; justify-content:center; padding: clamp(16px,4vw,32px); background:#f7f8fc; }
        .card { width:min(520px,94vw); background:#fff; border:1px solid #e6e8ee; border-radius:16px; padding:22px 18px; box-shadow:0 10px 30px rgba(0,0,0,.05); }
        .title-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
        .logo { width:28px; height:28px; object-fit:contain; }
        .title { margin:0; font-size:22px; font-weight:700; }
        .tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0 14px; }
        .tab { height:44px; border-radius:10px; border:1px solid #d9dce6; background:#f3f5fb; color:#1f2a44; font-weight:600; cursor:pointer; }
        .tab.active { background:#4f46e5; color:#fff; border-color:#4f46e5; }
        .label { display:block; margin:8px 0 6px; font-size:14px; color:#374151; }
        .input { width:100%; height:44px; padding:0 12px; border-radius:10px; border:1px solid #d1d5db; background:#fff; }
        .input:focus { border-color:#4f46e5; box-shadow:0 0 0 3px rgba(79,70,229,.15); outline:none; }
        .pwrow { display:flex; gap:8px; align-items:center; }
        .show { font-size:13px; color:#555; display:inline-flex; align-items:center; gap:6px; user-select:none; }
        .btn { width:100%; margin-top:12px; height:46px; border-radius:12px; border:0; color:#fff; font-weight:700; background:#4f46e5; }
        .btn:disabled { opacity:.6; cursor:not-allowed; }
        .actions { display:flex; justify-content:center; gap:12px; margin-top: 12px; flex-wrap:wrap; }
        .link { background:none; border:none; color:#4f46e5; text-decoration:underline; cursor:pointer; padding:0; }
        .sep { opacity:.6; }
        .alert { margin-top:10px; padding:10px 12px; border-radius:10px; font-size:14px; }
        .alert.error { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
        .alert.ok { background:#dcfce7; color:#065f46; border:1px solid #bbf7d0; }
      `}</style>
    </div>
  );
}
