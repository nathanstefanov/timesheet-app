// pages/_app.tsx
import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

type Profile = { id: string; full_name?: string | null; role: 'employee' | 'admin' };

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const subRef = useRef<{ unsubscribe(): void } | null>(null);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    // 🔥 If anything goes wrong with profile/role, force logout + relogin
    if (error || !data) {
      console.error('Failed to load profile for user', userId, error);
      setErr('Session error. Please sign in again.');
      setProfile(null);

      await supabase.auth.signOut();
      router.replace('/'); // send them back to login
      return;
    }

    setErr(null);
    setProfile(data as Profile);
  }

  function handleSession(session: import('@supabase/supabase-js').Session | null) {
    if (!session?.user) {
      setProfile(null);
      if (!checking && router.pathname !== '/') router.replace('/');
      return;
    }
    fetchProfile(session.user.id);
    if (!checking && router.pathname === '/') router.replace('/dashboard');
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      handleSession(data?.session ?? null);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        handleSession(session ?? null);
      }
    });

    subRef.current = sub?.subscription ?? null;

    return () => {
      alive = false;
      subRef.current?.unsubscribe();
    };
  }, [router.pathname]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <div className="brand-wrap">
            <img
              src="https://https://img-cache.oppcdn.com/img/v1.0/s:19132/t:QkxBTksrVEVYVCtIRVJF/p:12/g:tl/o:2.5/a:50/q:90/1088x638-4m6ylFaGtDF4CWYS.jpg/1088x638/f1fcd04d418588c0d21fb3b36a70f9af.jpg"
              alt="Logo"
              className="logo"
            />
            <span className="brand">Timesheet</span>
          </div>

          {/* While checking, don't render nav to avoid flicker */}
          {!checking && profile && (
            <nav className="nav">
              {/* Everyone */}
              <Link href="/dashboard" className="nav-link">
                Dashboard
              </Link>
              <Link href="/new-shift" className="nav-link">
                Log Shift
              </Link>
              <Link href="/me/schedule" className="nav-link">
                My Schedule
              </Link>

              {/* Admin-only */}
              {profile.role === 'admin' && (
                <>
                  <Link href="/admin" className="nav-link">
                    Admin Dashboard
                  </Link>
                  <Link href="/admin-schedule" className="nav-link">
                    Schedule
                  </Link>
                </>
              )}

              <button className="signout" onClick={handleSignOut}>
                Sign out
              </button>
            </nav>
          )}
        </div>
      </header>

      {err && <div className="alert error">Profile error: {err}</div>}
      <Component {...pageProps} />
    </>
  );
}
