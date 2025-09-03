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

  // Seed from localStorage to avoid nav flicker
  const seedProfile: Profile = (() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('lastProfile') || 'null'); }
    catch { return null; }
  })();

  const [profile, setProfile] = useState<Profile>(seedProfile);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const cancelled = useRef(false);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single();
      if (error) {
        setProfileError('Failed to fetch profile: ' + error.message);
        setProfile(null);
        localStorage.removeItem('lastProfile');
      } else {
        const p = (data as any) ?? null;
        setProfile(p);
        setProfileError(null);
        localStorage.setItem('lastProfile', JSON.stringify(p));
      }
    } catch (err) {
      setProfileError('Unexpected error: ' + (err instanceof Error ? err.message : String(err)));
      setProfile(null);
      localStorage.removeItem('lastProfile');
    }
  }

  // On mount: get current session and (if any) fetch profile once
  useEffect(() => {
    cancelled.current = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled.current) return;

      if (!session?.user) {
        setProfile(null);
        localStorage.removeItem('lastProfile');
        return; // do not auto-redirect; let pages decide
      }

      // Only fetch if we don’t already have a seeded profile for this user
      if (!profile || profile?.id !== session.user.id) {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (!cancelled.current) setLoadingProfile(false);
      }
    })();

    // Only react to SIGNED_IN / SIGNED_OUT. Ignore refresh events.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled.current) return;
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        localStorage.removeItem('lastProfile');
        // Only navigate away if you’re on protected pages; otherwise do nothing.
        if (router.pathname.startsWith('/admin') || router.pathname.startsWith('/dashboard')) {
          router.push('/');
        }
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (!cancelled.current) setLoadingProfile(false);
        // If you’re sitting on the login page, move to dashboard once.
        if (router.pathname === '/') router.push('/dashboard');
      }
    });

    return () => {
      cancelled.current = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname]);

  async function handleSignOut() {
    try { await supabase.auth.signOut(); }
    finally {
      // Don’t hard-reload; go to login
      router.push('/');
    }
  }

  const errorBanner = profileError ? (
    <div className="alert error">Profile error: {profileError}</div>
  ) : null;

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

          {/* Don’t render nav until we’ve tried at least one profile fetch OR had a seed */}
          <nav className="nav">
            {profile ? (
              <>
                <Link href="/dashboard" className="nav-link">Dashboard</Link>
                <Link href="/new-shift" className="nav-link">Log Shift</Link>
                {profile.role === 'admin' && <Link href="/admin" className="nav-link">Admin</Link>}
                <button className="signout" onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              // When logged out, no links; keep header stable to avoid “blinking”
              <span style={{ opacity: 0.6, fontSize: 13 }}>
                {loadingProfile ? 'Loading…' : ''}
              </span>
            )}
          </nav>
        </div>
      </header>

      {errorBanner}
      <Component {...pageProps} />
    </>
  );
}
