// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Refs to avoid double-effects / race conditions in Strict Mode and multi-tab quirks
  const cancelledRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const syncingRef = useRef(false); // prevent overlapping /api/auth/set calls

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
    cancelledRef.current = false;
    hasRedirectedRef.current = false;

    (async () => {
      // ✅ simple, typed 2-step read (avoids destructure typo & implicit any)
      const { data } = await supabase.auth.getSession();
      const session: Session | null = data?.session ?? null;

      if (cancelledRef.current) return;

      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (!hasRedirectedRef.current && router.pathname !== '/') {
          hasRedirectedRef.current = true;
          router.replace('/');
        }
        return;
      }

      setLoadingProfile(true);
      await fetchProfile(session.user.id);
      if (!cancelledRef.current) setLoadingProfile(false);

      if (!hasRedirectedRef.current && router.pathname === '/') {
        hasRedirectedRef.current = true;
        router.replace('/dashboard');
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (cancelledRef.current) return;

        // Only act on the two important events
        if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

        // Fire-and-forget cookie sync so UI never blocks (prevents Chrome “freeze”)
        if (!syncingRef.current) {
          syncingRef.current = true;
          void fetch('/api/auth/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, session }),
          }).finally(() => {
            syncingRef.current = false;
          });
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoadingProfile(false);
          if (!hasRedirectedRef.current && router.pathname !== '/') {
            hasRedirectedRef.current = true;
            router.replace('/');
          }
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          setLoadingProfile(true);
          await fetchProfile(session.user.id);
          if (!cancelledRef.current) setLoadingProfile(false);

          if (!hasRedirectedRef.current && router.pathname === '/') {
            hasRedirectedRef.current = true;
            router.replace('/dashboard');
          }

          // Safety net in case navigation didn’t happen for some reason
          setTimeout(() => {
            if (!hasRedirectedRef.current && router.pathname === '/') {
              hasRedirectedRef.current = true;
              router.replace('/dashboard');
            }
          }, 3000);
        }
      }
    );

    return () => {
      cancelledRef.current = true;
      sub.subscription.unsubscribe();
    };
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
