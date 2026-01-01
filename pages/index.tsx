// pages/index.tsx
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { logLogin } from '../lib/auditLog';

type Mode = 'signin';

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) r.replace('/dashboard');
    });
  }, []);

  function clearAlerts() {
    setErr(undefined);
    setMsg(undefined);
  }

  async function submit() {
    clearAlerts();
    setLoading(true);
    try {
      if (!email) throw new Error('Enter your email');
      if (!password) throw new Error('Enter your password');

      // Sign in with password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Log the login event
      if (data.user) {
        await logLogin(data.user.id);
      }

      r.push('/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    clearAlerts();
    setLoading(true);
    try {
      if (!email) throw new Error('Enter your email');
      const redirectTo =
        typeof window !== 'undefined'
          ? `${location.origin}/dashboard`
          : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMsg('Check your email for a login link.');
    } catch (e: any) {
      setErr(e.message || 'Could not send link');
    } finally {
      setLoading(false);
    }
  }

  async function sendReset() {
    clearAlerts();
    setLoading(true);
    try {
      if (!email) throw new Error('Enter your email first');
      const redirectTo =
        typeof window !== 'undefined'
          ? `${location.origin}/update-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      setMsg('Password reset email sent. Check your inbox.');
    } catch (e: any) {
      setErr(e.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <>
      <div className="wrap">
        <div className="card">
          <div className="title-row">
            {LOGO_URL ? (
              <img src={LOGO_URL} alt="Logo" className="logo" />
            ) : null}
            <h1 className="title">Timesheet</h1>
          </div>


          <form onSubmit={onFormSubmit} autoComplete="on">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              ref={emailRef}
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="pwrow">
              <input
                id="password"
                name="password"
                className="input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label className="show" htmlFor="showPw">
                <input
                  id="showPw"
                  type="checkbox"
                  checked={showPw}
                  onChange={(e) => setShowPw(e.target.checked)}
                />
                Show
              </label>
            </div>

            {err && <div className="alert error">{err}</div>}
            {msg && <div className="alert ok">{msg}</div>}

            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? 'Working…' : 'Sign In'}
            </button>
          </form>

          <div className="actions">
            <button className="link" onClick={sendMagicLink} disabled={loading}>
              Email me a login link
            </button>
            <span className="sep">•</span>
            <button className="link" onClick={sendReset} disabled={loading}>
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
