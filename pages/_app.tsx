// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      } else {
        setProfile((data as any) ?? null);
        setProfileError(null);
      }
    } catch (err) {
      setProfileError('Unexpected error: ' + (err instanceof Error ? err.message : String(err)));
      setProfile(null);
    }
    setLoadingProfile(false);
  }

  useEffect(() => {
    let cancelled = false;
    let hasRedirected = false;
    const timeout = setTimeout(() => {
      if (loadingProfile) {
        setProfileError('Session/profile load timed out. This may be a Supabase RLS or network issue.');
        setLoadingProfile(false);
      }
    }, 8000); // 8 seconds

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (!hasRedirected && router.pathname !== '/') {
          hasRedirected = true;
          router.replace('/');
        }
        return;
      }

      try {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
      } catch (e) {
        setProfileError('Error fetching profile.');
      }
      if (!hasRedirected && router.pathname === '/') {
        hasRedirected = true;
        router.replace('/dashboard');
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (!hasRedirected && router.pathname !== '/') {
          hasRedirected = true;
          router.replace('/');
        }
      } else {
        setLoadingProfile(true);
        try {
          await fetchProfile(session.user.id);
        } catch (e) {
          setProfileError('Error fetching profile.');
        }
        if (!hasRedirected && router.pathname === '/') {
          hasRedirected = true;
          router.replace('/dashboard');
        }
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [router]);

  async function handleSignOut() {
    try { await supabase.auth.signOut(); }
    finally {
      // Hard redirect avoids Safari/Chrome cache weirdness after refreshes.
      window.location.href = '/';
    }
  }

  if (profileError) {
    return (
      <main className="page page--center">
        <h1>Error loading profile/session</h1>
        <pre style={{ color: 'red', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{profileError}</pre>
        <p>Please check your Supabase RLS policies, network connection, and that your user exists in the profiles table.</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </main>
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

          {/* Only render nav after loadingProfile is false to prevent flicker */}
          {!loadingProfile && (
            <nav className="nav">
              {profile && (
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
          )}
        </div>
      </header>

      <Component {...pageProps} />
    </>
  );
}
