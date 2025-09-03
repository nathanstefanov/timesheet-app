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

  const [profile, setProfile] = useState<Profile>(null);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const mounted = useRef(false);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single();
    if (error) {
      setErr(error.message);
      setProfile(null);
    } else {
      setErr(null);
      setProfile((data as any) ?? null);
    }
  }

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    let unsub: { subscription: { unsubscribe(): void } } | null = null;
    let alive = true;

    (async () => {
      // First bootstrap read from safe storage
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      if (!alive) return;

      if (!session?.user) {
        setProfile(null);
        setChecking(false);
        if (router.pathname !== '/') router.replace('/');
      } else {
        await loadProfile(session.user.id);
        setChecking(false);
        if (router.pathname === '/') router.replace('/dashboard');
      }
    })();

    unsub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        if (router.pathname !== '/') router.replace('/');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        await loadProfile(session.user.id);
        if (router.pathname === '/') router.replace('/dashboard');
      }
    });

    return () => {
      alive = false;
      unsub?.subscription.unsubscribe();
    };
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
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

          {!checking && profile && (
            <nav className="nav">
              <Link href="/dashboard" className="nav-link">Dashboard</Link>
              <Link href="/new-shift" className="nav-link">Log Shift</Link>
              {profile.role === 'admin' && (
                <Link href="/admin" className="nav-link">Admin</Link>
              )}
              <button className="signout" onClick={signOut}>Sign out</button>
            </nav>
          )}
        </div>
      </header>

      {err && <div className="alert error">Profile error: {err}</div>}
      <Component {...pageProps} />
    </>
  );
}
