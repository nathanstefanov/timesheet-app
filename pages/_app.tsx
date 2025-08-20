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

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setLoadingProfile(false);
      // If they’re on a protected page, send them to sign in
      if (router.pathname !== '/') router.replace('/');
      return;
    }
    const { data: p } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', user.id)
      .single();
    setProfile((p as any) ?? null);
    setLoadingProfile(false);
  }

  useEffect(() => {
    let mounted = true;
    (async () => { if (mounted) await loadProfile(); })();

    // React to login/logout from any tab
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoadingProfile(true);
      if (!session) {
        // Logged out -> go to sign in
        setProfile(null);
        setLoadingProfile(false);
        if (router.pathname !== '/') router.replace('/');
      } else {
        await loadProfile();
        // If they’re on "/" and just logged in, go to dashboard
        if (router.pathname === '/') router.replace('/dashboard');
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      // Hard redirect to guarantee it
      router.replace('/');
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <div className="brand-wrap">
            {/* your logo */}
            <img
              src="https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png"
              alt="Logo"
              className="logo"
            />
            <span className="brand">Timesheet</span>
          </div>

          <nav className="nav">
            <Link href="/dashboard" className="nav-link">Dashboard</Link>
            <Link href="/new-shift" className="nav-link">Log Shift</Link>

            {/* Only show Admin when we know profile.role */}
            {!loadingProfile && profile?.role === 'admin' && (
              <Link href="/admin" className="nav-link">Admin</Link>
            )}

            {/* Only show Sign out when a user is signed in */}
            {!loadingProfile && profile && (
              <button className="signout" onClick={handleSignOut}>Sign out</button>
            )}
          </nav>
        </div>
      </header>

      <Component {...pageProps} />
    </>
  );
}
