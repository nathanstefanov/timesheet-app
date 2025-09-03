// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

// ---------- helpers to harden Chrome reload/tab-change ----------
async function waitForSessionReady(timeoutMs = 3500): Promise<Session | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    const session = data?.session ?? null;
    if (session?.user) return session;
    // short pause before next poll
    await new Promise((r) => setTimeout(r, 120));
  }
  return null; // listener will still handle SIGNED_IN later
}

async function fetchProfileWithRetry(userId: string, attempts = 5) {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single();

    if (!error && data) return { data, error: null };

    lastErr = error;
    // backoff helps if RLS denies until JWT is fully ready
    await new Promise((r) => setTimeout(r, 200 + i * 200));
  }
  return { data: null, error: lastErr };
}
// ----------------------------------------------------------------

function AppShell({
  Component,
  pageProps,
}: AppProps & { pageProps: { initialSession?: Session | null; initialProfile?: Profile } }) {
  const router = useRouter();
  const { initialSession, initialProfile } = pageProps;

  const [profile, setProfile] = useState<Profile>(initialProfile ?? null);
  const [loadingProfile, setLoadingProfile] = useState(!initialProfile);
  const [profileError, setProfileError] = useState<string | null>(null);

  const cancelledRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const syncingRef = useRef(false); // prevent overlapping /api/auth/set calls

  useEffect(() => {
    cancelledRef.current = false;
    hasRedirectedRef.current = false;

    (async () => {
      // Wait for a stable session (Chrome can briefly report null on reload)
      const session = (await waitForSessionReady(3500)) ?? initialSession ?? null;

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

      if (!initialProfile) {
        setLoadingProfile(true);
        const { data, error } = await fetchProfileWithRetry(session.user.id);
        if (cancelledRef.current) return;
        if (error) {
          setProfile(null);
          setProfileError('Failed to fetch profile: ' + error.message);
        } else {
          setProfile((data as any) ?? null);
          setProfileError(null);
        }
        setLoadingProfile(false);
      }

      if (!hasRedirectedRef.current && router.pathname === '/') {
        hasRedirectedRef.current = true;
        router.replace('/dashboard');
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (cancelledRef.current) return;
        if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

        // Fire-and-forget cookie mirror so UI never blocks
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
          const { data, error } = await fetchProfileWithRetry(session.user.id);
          if (!cancelledRef.current) {
            if (error) {
              setProfile(null);
              setProfileError('Failed to fetch profile: ' + error.message);
            } else {
              setProfile((data as any) ?? null);
              setProfileError(null);
            }
            setLoadingProfile(false);
          }

          if (!hasRedirectedRef.current && router.pathname === '/') {
            hasRedirectedRef.current = true;
            router.replace('/dashboard');
          }
          // Safety net: force nav if something silently failed
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace('/');
    }
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
                  <Link href="/dashboard" className="nav-link">
                    Dashboard
                  </Link>
                  <Link href="/new-shift" className="nav-link">
                    Log Shift
                  </Link>
                  {profile.role === 'admin' && (
                    <Link href="/admin" className="nav-link">
                      Admin
                    </Link>
                  )}
                  <button className="signout" onClick={handleSignOut}>
                    Sign out
                  </button>
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

export default function App(props: AppProps & { pageProps: { initialSession?: Session | null; initialProfile?: Profile } }) {
  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={props.pageProps.initialSession ?? null}>
      <AppShell {...props} />
    </SessionContextProvider>
  );
}
