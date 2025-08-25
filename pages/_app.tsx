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
  const [authError, setAuthError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false); // UI never blocks; this only prevents early redirects

  const navLock = useRef(false);
  const isLogin = router.pathname === '/';

  function safeReplace(path: string) {
    if (navLock.current || router.asPath === path) return;
    navLock.current = true;
    router.replace(path).finally(() => setTimeout(() => (navLock.current = false), 120));
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

  // Initialize auth without ever blocking the page
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAuthError(null);

      // Race getUser() (fast, local) with a slow network getSession() — whichever wins sets state.
      const withTimeout = <T,>(p: Promise<T>, ms = 4000) =>
        Promise.race([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error('auth timeout')), ms)),
        ]);

      try {
        const { data: uData } = await withTimeout(supabase.auth.getUser());
        if (cancelled) return;

        const user = uData?.user ?? null;

        if (!user) {
          setProfile(null);
          setInitialized(true);
          // Only push to login if they landed on a protected route AND we aren’t already on /
          if (!isLogin) safeReplace('/');
          return;
        }

        await fetchProfile(user.id);
        setInitialized(true);
        if (isLogin) safeReplace('/dashboard');
      } catch (e: any) {
        if (cancelled) return;
        setProfile(null);
        setAuthError(e.message);
        setInitialized(true);
        if (!isLogin) safeReplace('/');
      }
    })();

    // Listen for real sign in/out events; do not treat refresh as state changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.user) {
          await fetchProfile(session.user.id);
          if (router.pathname === '/') safeReplace('/dashboard');
        }
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        if (router.pathname !== '/') safeReplace('/');
      }
      // ignore TOKEN_REFRESHED / INITIAL_SESSION etc. to avoid loops
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router.pathname, isLogin]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      // hard reload clears any transient auth storage issues
      window.location.href = '/';
    }
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
                {profile.role === 'admin' && <Link href="/admin" className="nav-link">Admin</Link>}
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

      {/* We don't block the UI anymore; pages handle their own loading/redirects */}
      <Component {...pageProps} />
    </>
  );
}
