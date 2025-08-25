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
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Prevent duplicate router.replace calls (StrictMode, rapid events, etc.)
  const redirectingRef = useRef(false);

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
    } finally {
      setLoadingProfile(false);
    }
  }

  // Centralized redirect helper (debounced)
  function safeReplace(path: string) {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    router.replace(path).finally(() => {
      // allow future redirects after the current navigation settles
      setTimeout(() => { redirectingRef.current = false; }, 100);
    });
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingProfile(true);
      setAuthError(null);

      // Prefer local session first to avoid a network race
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (router.pathname !== '/') safeReplace('/');
        return;
      }

      await fetchProfile(session.user.id);

      // If already on the login page, go to dashboard
      if (router.pathname === '/') safeReplace('/dashboard');
    })();

    // Only respond to meaningful events (avoid refresh loops on TOKEN_REFRESHED / PASSWORD_RECOVERY etc.)
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      switch (event) {
        case 'SIGNED_IN':
        case 'USER_UPDATED': {
          setLoadingProfile(true);
          setAuthError(null);
          if (session?.user) {
            await fetchProfile(session.user.id);
            if (router.pathname === '/') safeReplace('/dashboard');
          } else {
            setProfile(null);
            setLoadingProfile(false);
            safeReplace('/');
          }
          break;
        }
        case 'SIGNED_OUT': {
          setProfile(null);
          setLoadingProfile(false);
          safeReplace('/');
          break;
        }
        // ignore refresh/noise events
        case 'TOKEN_REFRESHED':
        case 'PASSWORD_RECOVERY':
        default:
          break;
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      // Hard navigation to wipe any odd caches/state
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

      {/* Small toast for auth/profile errors (optional) */}
      {authError && (
        <div style={{
          margin: '8px auto',
          maxWidth: 840,
          background: '#fff4f4',
          border: '1px solid #ffd7d7',
          color: '#7a1f1f',
          padding: 10,
          borderRadius: 6
        }}>
          Auth error: {authError} <button onClick={() => setAuthError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      <Component {...pageProps} />
    </>
  );
}
