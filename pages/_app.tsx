// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // prevent multiple redirects during a single transition
  const navigating = useRef(false);

  const isLoginRoute = router.pathname === '/';
  const isReady = router.isReady;

  function safeReplace(path: string) {
    if (navigating.current || router.asPath === path) return;
    navigating.current = true;
    router.replace(path).finally(() => {
      setTimeout(() => (navigating.current = false), 100);
    });
  }

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile((data as any) ?? null);
    } catch (e: any) {
      setProfile(null);
      setAuthError(e.message || 'Failed to load profile');
    }
  }

  // initial session load
  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setAuthError(null);

      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setProfile(null);
        setLoading(false);
        return;
      }

      if (!session?.user) {
        setProfile(null);
        setLoading(false);
        // only redirect to login if we're on a protected route
        if (!isLoginRoute) safeReplace('/');
        return;
      }

      await fetchProfile(session.user.id);
      setLoading(false);

      // if already signed in and sitting on login, go to dashboard
      if (isLoginRoute) safeReplace('/dashboard');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      // ignore noise events to avoid loops
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return;

      setLoading(true);
      setAuthError(null);

      if (session?.user) {
        await fetchProfile(session.user.id);
        setLoading(false);
        if (isLoginRoute) safeReplace('/dashboard');
      } else {
        setProfile(null);
        setLoading(false);
        if (!isLoginRoute) safeReplace('/');
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [isReady, isLoginRoute]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      // hard reload to clear any cached state
      window.location.href = '/';
    }
  }

  // simple loading screen to avoid “blank” flashes
  if (!isReady || loading) {
    return (
      <>
        <header className="topbar">
          <div className="shell">
            <div className="brand-wrap">
              <img
                src="https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png"
                alt="Logo"
                className="logo"
              />
              <span className="brand">Timesheet</span>
            </div>
          </div>
        </header>
        <main className="page" style={{ textAlign:'center', padding:'32px 0' }}>
          <div className="chip">Loading…</div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <div className="brand-wrap">
            <img
              src="https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png"
              alt="Logo"
              className="logo"
            />
            <span className="brand">Timesheet</span>
          </div>

          <nav className="nav">
            {profile && (
              <>
                <Link href="/dashboard" className="nav-link">Dashboard</Link>
                <Link href="/new-shift" className="nav-link">Log Shift</Link>
                {profile.role === 'admin' && (
                  <Link href="/admin" className="nav-link">Admin</Link>
                )}
                <button className="topbar-btn" onClick={handleSignOut}>Sign out</button>
              </>
            )}
          </nav>
        </div>
      </header>

      {authError && (
        <div className="toast toast--error">
          <span>Auth error: {authError}</span>
          <button className="toast__dismiss" onClick={() => setAuthError(null)}>Dismiss</button>
        </div>
      )}

      <Component {...pageProps} />
    </>
  );
}
