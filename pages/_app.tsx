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
      setTimeout(() => {
        redirectingRef.current = false;
      }, 100);
    });
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingProfile(true);
      setAuthError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (router.pathname !== '/') safeReplace('/');
        return;
      }

      await fetchProfile(session.user.id);

      if (router.pathname === '/') safeReplace('/dashboard');
    })();

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
        default:
          break;
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = '/';
    }
  }

  const isActive = (href: string) =>
    router.pathname === href || router.pathname.startsWith(`${href}/`);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="topbar" role="banner">
        <div className="shell">
          <div className="brand-wrap">
            <img
              src="https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png"
              alt="Timesheet logo"
              className="logo"
              height={60}
            />
            <span className="brand">Timesheet</span>
          </div>

          <nav className="nav" aria-label="Primary">
            {!loadingProfile && profile && (
              <>
                <Link
                  href="/dashboard"
                  className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                  aria-current={isActive('/dashboard') ? 'page' : undefined}
                >
                  Dashboard
                </Link>
                <Link
                  href="/new-shift"
                  className={`nav-link ${isActive('/new-shift') ? 'active' : ''}`}
                  aria-current={isActive('/new-shift') ? 'page' : undefined}
                >
                  Log Shift
                </Link>
                {profile.role === 'admin' && (
                  <Link
                    href="/admin"
                    className={`nav-link ${isActive('/admin') ? 'active' : ''}`}
                    aria-current={isActive('/admin') ? 'page' : undefined}
                  >
                    Admin
                  </Link>
                )}
                <button className="topbar-btn" onClick={handleSignOut}>Sign out</button>
              </>
            )}
          </nav>
        </div>
      </header>

      {authError && (
        <div className="toast toast--error" role="alert">
          <span>Auth error: {authError}</span>
          <button className="toast__dismiss" onClick={() => setAuthError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <main id="main" className="page" role="main" aria-live="polite">
        <Component {...pageProps} />
      </main>
    </>
  );
}
