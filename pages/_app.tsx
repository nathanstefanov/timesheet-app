// pages/_app.tsx
import type { AppProps } from 'next/app';
import Head from 'next/head';
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
  const lock = useRef(false);

  const safeReplace = (path: string) => {
    if (lock.current || router.asPath === path) return;
    lock.current = true;
    router.replace(path).finally(() => setTimeout(() => (lock.current = false), 120));
  };

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single();
      if (error) throw error;
      setProfile((data as any) ?? null);
    } finally {
      setLoadingProfile(false);
    }
  }

  // Initial auth + quick redirects
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingProfile(true);

      // Try local session first (fast, no network)
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      const user = session?.user ?? null;
      if (!user) {
        setProfile(null);
        setLoadingProfile(false);
        if (router.pathname !== '/') safeReplace('/');
        return;
      }

      await fetchProfile(user.id);
      if (router.pathname === '/') safeReplace('/dashboard');
    })();

    // Subscribe to sign-in/out changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;

      if (event === 'SIGNED_OUT' || !user) {
        setProfile(null);
        setLoadingProfile(false);
        safeReplace('/');
        return;
      }

      setLoadingProfile(true);
      await fetchProfile(user.id);
      if (router.pathname === '/') safeReplace('/dashboard');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      // hard reload avoids storage quirks
      window.location.href = '/';
    }
  }

  return (
    <>
      {/* Start slightly zoomed-out on iPhone but still allow pinch-zoom */}
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=0.85, user-scalable=yes, viewport-fit=cover"
        />
        <meta name="format-detection" content="telephone=no" />
        <title>Timesheet</title>
      </Head>

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
                <button className="topbar-btn" onClick={handleSignOut}>Sign out</button>
              </>
            )}
          </nav>
        </div>
      </header>

      <Component {...pageProps} />
    </>
  );
}
