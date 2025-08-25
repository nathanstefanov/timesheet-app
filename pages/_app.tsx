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

  // avoid competing redirects
  const navLock = useRef(false);
  const isLogin = router.pathname === '/';

  const safeReplace = (path: string) => {
    if (navLock.current || router.asPath === path) return;
    navLock.current = true;
    router.replace(path).finally(() => setTimeout(() => (navLock.current = false), 120));
  };

  // ------- helpers
  async function fetchProfileSoft(userId: string) {
    // IMPORTANT: “no row found” should NOT be fatal — many prod loops are this.
    const { data, error, status } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle(); // <-- doesn't throw on 0 rows

    if (error && status !== 406) { // 406 = no rows; ignore
      throw error;
    }
    // allow null profile; navbar will still show
    setProfile((data as any) ?? { id: userId, role: 'employee' });
  }

  // ------- init (non-blocking)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAuthError(null);

      // Try local session quickly
      let sessionUser = null as any;
      try {
        const { data } = await supabase.auth.getUser();
        sessionUser = data?.user ?? null;
      } catch (e: any) {
        // ignore; we’ll try getSession next
      }

      // If still no user, try slower path with a timeout guard
      if (!sessionUser) {
        try {
          const { data } = await Promise.race([
            supabase.auth.getSession(),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('auth timeout')), 15000)),
          ]);
          sessionUser = data?.session?.user ?? null;
        } catch (e: any) {
          // don’t crash UI; just route to login if we’re not on it
          if (!isLogin) safeReplace('/');
          setAuthError(e?.message || 'Auth timeout');
          return;
        }
      }

      if (cancelled) return;

      if (!sessionUser) {
        // logged out
        setProfile(null);
        if (!isLogin) safeReplace('/');
        return;
      }

      // logged in — never redirect back to login if profile fetch fails
      try {
        await fetchProfileSoft(sessionUser.id);
      } catch (e: any) {
        setProfile({ id: sessionUser.id, role: 'employee' }); // fall back
        setAuthError(e?.message || 'Profile load failed');
      }
      if (isLogin) safeReplace('/dashboard');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        const u = session?.user;
        if (u) {
          try {
            await fetchProfileSoft(u.id);
          } catch { /* ignore */ }
          if (router.pathname === '/') safeReplace('/dashboard');
        }
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        if (router.pathname !== '/') safeReplace('/');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
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
          <span>{authError}</span>
          <button className="toast__dismiss" onClick={() => setAuthError(null)}>Dismiss</button>
        </div>
      )}

      <Component {...pageProps} />
    </>
  );
}
