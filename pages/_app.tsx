// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const mountedRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single();
    setProfile((data as any) ?? null);
    setLoadingProfile(false);
  }, []);

  const hydrateAuthThenProfile = useCallback(async () => {
    // Always re-pull session on resume (works after bfcache restore too)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setProfile(null);
      setLoadingProfile(false);
      if (router.pathname !== '/') router.replace('/');
      return;
    }
    setLoadingProfile(true);
    await fetchProfile(session.user.id);
    if (router.pathname === '/') router.replace('/dashboard');
  }, [fetchProfile, router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await hydrateAuthThenProfile();
      mountedRef.current = true;
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        router.replace('/');
      } else {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (router.pathname === '/') router.replace('/dashboard');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile, hydrateAuthThenProfile, router]);

  // Rehydrate when returning to the tab / navigating back (bfcache)
  useEffect(() => {
    const onFocus = () => hydrateAuthThenProfile();
    const onVisible = () => {
      if (document.visibilityState === 'visible') hydrateAuthThenProfile();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // If the page was restored from the back/forward cache, rehydrate
      if ((e as any).persisted) hydrateAuthThenProfile();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow as any);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow as any);
    };
  }, [hydrateAuthThenProfile]);

  async function handleSignOut() {
    try { await supabase.auth.signOut(); }
    finally { window.location.href = '/'; }
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
            {!loadingProfile && profile && (
              <>
                <Link href="/dashboard" className="nav-link">Dashboard</Link>
                <Link href="/new-shift" className="nav-link">Log Shift</Link>
                {profile.role === 'admin' && (
                  <Link href="/admin" className="nav-link">Admin</Link>
                )}
                <button className="signout" onClick={handleSignOut}>Sign out</button>
              </>
            )}
          </nav>
        </div>
      </header>

      <Component {...pageProps} />
    </>
  );
}
