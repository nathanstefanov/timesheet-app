// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

type MyPageProps = {
  initialSession?: any | null;
  initialProfile?: Profile;
};

export default function App({ Component, pageProps }: AppProps<MyPageProps>) {
  const router = useRouter();

  // Seed from SSR so the nav renders correctly immediately
  const [profile, setProfile] = useState<Profile>(pageProps.initialProfile ?? null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(!pageProps.initialProfile);
  const [profileError, setProfileError] = useState<string | null>(null);

  const cancelled = useRef(false);
  const hasRedirected = useRef(false);

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
    cancelled.current = false;

    (async () => {
      // If SSR already gave us a profile, don’t refetch on mount.
      if (pageProps.initialProfile) {
        setLoadingProfile(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled.current) return;

      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        // Only redirect off the login page if needed
        if (!hasRedirected.current && router.pathname !== '/') {
          hasRedirected.current = true;
          router.replace('/');
        }
        return;
      }

      setLoadingProfile(true);
      await fetchProfile(session.user.id);
      if (!cancelled.current) setLoadingProfile(false);

      if (!hasRedirected.current && router.pathname === '/') {
        hasRedirected.current = true;
        router.replace('/dashboard');
      }
    })();

    // Only care about explicit sign-in/out events (ignore token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled.current) return;
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoadingProfile(false);
        if (!hasRedirected.current && router.pathname !== '/') {
          hasRedirected.current = true;
          router.replace('/');
        }
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (!cancelled.current) setLoadingProfile(false);
        if (!hasRedirected.current && router.pathname === '/') {
          hasRedirected.current = true;
          router.replace('/dashboard');
        }
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

          {/* Render nav only once we’ve decided the profile state */}
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
