// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient'; // keep using your browser client
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
  }

  useEffect(() => {
    let cancelled = false;
    let hasRedirected = false;

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

      setLoadingProfile(true);
      await fetchProfile(session.user.id);
      if (!cancelled) setLoadingProfile(false);

      if (!hasRedirected && router.pathname === '/') {
        hasRedirected = true;
        router.replace('/dashboard');
      }
    })();

    // ✅ Main auth subscription
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      // --- NEW: mirror auth events to server cookies ---
      await fetch('/api/auth/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, session }),
      });

      // --- Your existing logic ---
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoadingProfile(false);
        if (!hasRedirected && router.pathname !== '/') {
          hasRedirected = true;
          router.replace('/');
        }
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (!cancelled) setLoadingProfile(false);

        if (!hasRedirected && router.pathname === '/') {
          hasRedirected = true;
          router.replace('/dashboard');
        }
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router]);

  async function handleSignOut() {
    try { await supabase.auth.signOut(); }
    finally { router.replace('/'); }
  }

  const errorBanner = profileError ? (
    <div className="alert error">Profile error: {profileError}. You can try again or sign out.</div>
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

      {errorBanner}
      <Component {...pageProps} />
    </>
  );
}
