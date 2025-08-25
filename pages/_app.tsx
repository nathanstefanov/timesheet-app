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

  // prevent duplicate redirects
  const navLock = useRef(false);
  const isLogin = router.pathname === '/';

  const safeReplace = (path: string) => {
    if (navLock.current || router.asPath === path) return;
    navLock.current = true;
    router.replace(path).finally(() => setTimeout(() => (navLock.current = false), 120));
  };

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

  // Initialize auth, tolerant of slow storage/network. Never blocks UI.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAuthError(null);

      // 1) Try fast local state
      try {
        const { data: uData } = await supabase.auth.getUser();
        if (cancelled) return;

        if (uData?.user) {
          await fetchProfile(uData.user.id);
          if (isLogin) safeReplace('/dashboard');
          return;
        }
      } catch { /* ignore and keep trying */ }

      // 2) Slow path with generous timeout (cold start/private mode can be slow)
      const withTimeout = <T,>(p: Promise<T>, ms = 15000) =>
        Promise.race([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error('auth timeout')), ms)),
        ]);

      try {
        const { data: sData } = await withTimeout(supabase.auth.getSession(), 15000);
        if (cancelled) return;

        const user = sData?.session?.user ?? null;
        if (user) {
          await fetchProfile(user.id);
          if (isLogin) safeReplace('/dashboard');
        } else if (!isLogin) {
          setProfile(null);
          safeReplace('/');
        }
      } catch (e: any) {
        if (cancelled) return;
        // We still render the page; just surface the error and route to login if protected.
        setProfile(null);
        setAuthError(e.message || 'Authentication took too long');
        if (!isLogin) safeReplace('/');
      }
    })();

    // Auth state changes (ignore refresh noise)
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      switch (event) {
        case 'SIGNED_IN':
        case 'USER_UPDATED':
          if (session?.user) {
            await fetchProfile(session.user.id);
            if (router.pathname === '/') safeReplace('/dashboard');
          }
          break;
        case 'SIGNED_OUT':
          setProfile(null);
          if (router.pathname !== '/') safeReplace('/');
          break;
        default:
          // ignore TOKEN_REFRESHED, INITIAL_SESSION, etc.
          break;
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname]); // keep deps minimal; don't include isLogin (derived)

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      // full reload clears any transient IndexedDB/localStorage issues
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

      <Component {...pageProps} />
    </>
  );
}
