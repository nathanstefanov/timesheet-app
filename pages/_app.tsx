// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' };

const LOGO_DATA_URL =
  'data:image/png;base64,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';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const subRef = useRef<{ unsubscribe(): void } | null>(null);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    // If anything goes wrong with profile/role, force logout + relogin
    if (error || !data) {
      console.error('Failed to load profile for user', userId, error);
      setErr('Session error. Please sign in again.');
      setProfile(null);

      await supabase.auth.signOut();
      router.replace('/');
      return;
    }

    setErr(null);
    setProfile(data as Profile);
  }

  function handleSession(session: import('@supabase/supabase-js').Session | null) {
    if (!session?.user) {
      setProfile(null);
      if (!checking && router.pathname !== '/') router.replace('/');
      return;
    }

    fetchProfile(session.user.id);

    if (!checking && router.pathname === '/') {
      router.replace('/dashboard');
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      handleSession(data?.session ?? null);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;

      if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        handleSession(session ?? null);
      }
    });

    subRef.current = sub?.subscription ?? null;

    return () => {
      alive = false;
      subRef.current?.unsubscribe();
    };
  }, [router.pathname]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  // Track route changes to prevent navbar flash during navigation
  const [isChangingRoute, setIsChangingRoute] = useState(false);

  useEffect(() => {
    const handleStart = () => setIsChangingRoute(true);
    const handleComplete = () => setIsChangingRoute(false);

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [router]);

  // Pages that use the new SaaS design with sidebar (no topbar needed)
  const newDesignPages = ['/admin', '/dashboard', '/new-shift', '/me/schedule', '/admin-schedule', '/admin-schedule-past', '/settings', '/payroll', '/reports', '/employees', '/calendar'];
  const useNewDesign = newDesignPages.includes(router.pathname);

  return (
    <>
      {/* ✅ Favicon + title using the same base64 image */}
      <Head>
        <title>Timesheet</title>
        <link rel="icon" href={LOGO_DATA_URL} />
        {/* Preload CSS to prevent flash of unstyled content */}
        <link rel="preload" href="/styles/combined.css" as="style" />
        {/* Load combined CSS for all pages - contains both old and new styles */}
        <link rel="stylesheet" href="/styles/combined.css" />
        {/* Prevent FOUC by hiding body until CSS loads */}
        <style dangerouslySetInnerHTML={{__html: `
          body { visibility: hidden; }
          body.css-loaded { visibility: visible; }
        `}} />
        <script dangerouslySetInnerHTML={{__html: `
          document.addEventListener('DOMContentLoaded', function() {
            document.body.classList.add('css-loaded');
          });
        `}} />
      </Head>

      {!useNewDesign && !isChangingRoute && (
        <header className="topbar">
          <div className="shell">
            <div className="brand-wrap">
              {/* ✅ Header logo uses the same image */}
              <img
                src={LOGO_DATA_URL}
                alt="Logo"
                className="logo"
              />
              <span className="brand">Timesheet</span>
            </div>

            {!checking && profile && (
              <nav className="nav">
                {/* Everyone */}
                <Link href="/dashboard" className="nav-link">
                  Dashboard
                </Link>
                <Link href="/new-shift" className="nav-link">
                  Log Shift
                </Link>
                <Link href="/me/schedule" className="nav-link">
                  My Schedule
                </Link>

                {/* Admin-only */}
                {profile.role === 'admin' && (
                  <>
                    <Link href="/admin" className="nav-link">
                      Admin Dashboard
                    </Link>
                    <Link href="/admin-schedule" className="nav-link">
                      Schedule
                    </Link>
                  </>
                )}

                <button className="signout" onClick={handleSignOut}>
                  Sign out
                </button>
              </nav>
            )}
          </div>
        </header>
      )}

      <main>
        {err && !useNewDesign && (
          <div className="wrap">
            <div className="alert error">Profile error: {err}</div>
          </div>
        )}
        <Component {...pageProps} />
      </main>
    </>
  );
}
