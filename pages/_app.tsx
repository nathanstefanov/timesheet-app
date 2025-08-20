import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' } | null;

export default function App({ Component, pageProps }: AppProps) {
  const [profile, setProfile] = useState<Profile>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setLoadingProfile(false);
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

    // Re-load whenever auth changes (sign in, sign out, token refresh, etc.)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setLoadingProfile(true);
      loadProfile();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setProfile(null);
    // optional: window.location.assign('/')  // if you want a hard redirect
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

            <button className="signout" onClick={handleSignOut}>Sign out</button>
          </nav>
        </div>
      </header>

      <Component {...pageProps} />
    </>
  );
}
