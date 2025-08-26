// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const initialSessionChecked = useRef(false);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single();
    setProfile((data as any) ?? null);
    setLoadingProfile(false);
  }

  useEffect(() => {
    let cancelled = false;

    // Wait for Supabase to restore session before rendering
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (cancelled) return;
      initialSessionChecked.current = true;
      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (router.pathname !== '/') router.replace('/');
      } else {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (router.pathname === '/') router.replace('/dashboard');
      }
    });

    // On mount, check session (in case already available)
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        setProfile(null);
        setLoadingProfile(false);
        if (router.pathname !== '/') router.replace('/');
      } else {
        setLoadingProfile(true);
        await fetchProfile(session.user.id);
        if (router.pathname === '/') router.replace('/dashboard');
      }
      initialSessionChecked.current = true;
    })();

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router]);

  async function handleSignOut() {
    try { await supabase.auth.signOut(); }
    finally {
      // Hard redirect avoids Safari/Chrome cache weirdness after refreshes.
      window.location.href = '/';
    }
  }

  if (loadingProfile) {
    return (
      <main className="page page--center">
        <h1>Loading…</h1>
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

          <nav className="nav">
            {/* Only render app links when a user is loaded */}
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
        </div>
      </header>

      <Component {...pageProps} />
    </>
  );
}
