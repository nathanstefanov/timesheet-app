// pages/_app.tsx
import '../styles/tables.css';
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

  const mounted = useRef(false);
  const subRef = useRef<{ unsubscribe(): void } | null>(null);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setErr(error.message);
      setProfile(null);
      return;
    }
    if (!data) {
      setErr('Profile not found');
      setProfile(null);
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
    if (mounted.current) return;
    mounted.current = true;
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
    subRef.current = sub.subscription;

    return () => {
      alive = false;
      subRef.current?.unsubscribe();
    };
  }, [router, checking]);

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
              src="https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png"
              alt="Logo"
              className="logo"
            />
            <span className="brand">Timesheet</span>
          </div>

          {/* While checking, don't render nav to avoid flicker */}
          {!checking && profile && (
            <nav className="nav">
              <ul className="nav__list">
                {[
                  { href: '/dashboard', label: 'Dashboard' },
                  { href: '/new-shift', label: 'Log Shift' },
                  { href: '/me/schedule', label: 'My Schedule' },
                  ...(profile.role === 'admin'
                    ? [
                        { href: '/admin', label: 'Admin Dashboard' },
                        { href: '/admin-schedule', label: 'Schedule' },
                      ]
                    : []),
                ].map(({ href, label }) => {
                  const isActive =
                    router.pathname === href || router.pathname.startsWith(`${href}/`);
                  return (
                    <li key={href} className="nav__item">
                      <Link
                        href={href}
                        className={`nav-link${isActive ? ' nav-link--active' : ''}`}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <button className="signout nav__signout" onClick={handleSignOut}>
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
