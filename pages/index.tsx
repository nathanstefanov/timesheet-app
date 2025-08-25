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
  const [initialized, setInitialized] = useState(false); // we never block rendering

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

  // ---- helpers: tolerant getUser with timeout + retry ----
  const withTimeout = <T,>(p: Promise<T>, ms = 12000) =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('auth timeout')), ms)),
    ]);

  async function getUserWithRetry() {
    try {
      return await withTimeout(supabase.auth.getUser(), 12000);
    } catch {
      // quick retry for transient delays (service worker, tracker, first-load, etc.)
      return await withTimeout(supabase.auth.getUser(), 12000);
    }
  }

  // ---- Initialize auth (non-blocking UI) ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAuthError(null);
      try {
        // Fast local check (with our timeout guard)
        const { data: uData } = await getUserWithRetry();
        if (cancelled) return;

        const user = uData?.user ?? null;

        if (!user) {
          setProfile(null);
          setInitialized(true);
          if (!isLogin) safeReplace('/');
          return;
        }

        await fetchProfile(user.id);
        setInitialized(true);
        if (isLogin) safeReplace('/dashboard');
      } catch (e: any) {
        if (cancelled) return;
        // Soft-fail: show toast, keep UI usable
        setProfile(null);
        setAuthError(e?.message || 'Auth check failed');
        setInitialized(true);
        if (!isLogin) safeReplace('/');
      }
    })();

    // Real auth events (sign in/out). Ignore refresh-related events to avoid loops.
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
      // ignore TOKEN_REFRESHED / INITIAL_SESSION
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
          <span>
            {authError === 'auth timeout'
              ? 'Auth request took too long. If this persists, refresh or try a private window.'
              : `Auth error: ${authError}`}
          </span>
          <button className="toast__dismiss" onClick={() => setAuthError(null)}>Dismiss</button>
        </div>
      )}

      {/* Never block page rendering; every page handles its own loading */}
      <Component {...pageProps} />
    </>
  );
}
