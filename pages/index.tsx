import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type Mode = 'signin' | 'signup';

// 👉 drop your logo URL here (or leave blank to hide)
const LOGO_URL =
  "https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png";

export default function AuthPage() {
  const r = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  useEffect(() => {
    // Redirect to dashboard if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        r.replace('/dashboard');
      }
    });
  }, []);

  function clearAlerts() { setErr(undefined); setMsg(undefined); }

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
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        r.push('/dashboard');
      }
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
    } finally { setLoading(false); }
  }

  async function sendMagicLink() {
    clearAlerts(); setLoading(true);
    try {
      if (!email) throw new Error('Enter your email');
      const redirectTo = typeof window !== 'undefined' ? `${location.origin}/dashboard` : undefined;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setMsg('Check your email for a login link.');
    } catch (e: any) { setErr(e.message || 'Could not send link'); }
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
    } catch (e: any) { setErr(e.message || 'Could not send reset email'); }
    finally { setLoading(false); }
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card" aria-labelledby="timesheet-auth-heading">
        <div className="center">
          <div className="brand-wrap brand-wrap--column">
            {LOGO_URL ? <img src={LOGO_URL} alt="Timesheet" className="logo auth-logo" /> : null}
            <span className="brand brand--auth">Timesheet</span>
          </div>
        </div>

        <h1 id="timesheet-auth-heading" className="auth-title">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>

        <div className="tabs tabs--center" role="tablist" aria-label="Authentication mode">
          <button
            className={`tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => setMode('signin')}
            aria-pressed={mode === 'signin'}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => setMode('signup')}
            aria-pressed={mode === 'signup'}
            type="button"
          >
            Create account
          </button>
        </div>

        <form onSubmit={onFormSubmit} autoComplete="on" className="auth-form">
          <div className="auth-input-row">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              ref={emailRef}
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-input-row">
            <label className="label" htmlFor="password">Password {mode === 'signup' ? '(min 8 chars)' : ''}</label>
            <div className="pwrow">
              <input
                id="password"
                name="password"
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signin' ? 'Your password' : 'Create a password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label className="auth-showpw" htmlFor="showPw">
                <input id="showPw" type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
                Show
              </label>
            </div>
          </div>

          {err && <div className="alert error auth-alert">{err}</div>}
          {msg && <div className="alert ok auth-alert">{msg}</div>}

          <button className="auth-btn primary" type="submit" disabled={loading}>
            {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-actions">
          <button className="link" onClick={sendMagicLink} disabled={loading} type="button">
            Email me a login link
          </button>
          <span className="sep" aria-hidden="true">•</span>
          <button className="link" onClick={sendReset} disabled={loading} type="button">
            Forgot password?
          </button>
        </div>
      </section>
    </main>
  );
}
