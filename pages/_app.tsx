import type { AppProps } from 'next/app';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const r = useRouter();
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) { setProfile(null); setLoading(false); } return; }
      const { data: p } = await supabase.from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .single();
      if (alive) { setProfile(p || null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function signOut() {
    try { await supabase.auth.signOut(); }
    finally { r.replace('/'); }
  }

  const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
    const active = r.pathname === href;
    return <Link href={href} className={`nav-link${active ? ' active' : ''}`}>{children}</Link>;
  };

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <div className="brand-wrap">
            <img src="https://cdn.prod.website-files.com/67c10208e6e94bb6c9fba39b/689d0fe09b90825b708049a1_ChatGPT%20Image%20Aug%2013%2C%202025%2C%2005_18_33%20PM.png" alt="Logo" className="logo" />
            <span className="brand">Timesheet</span>
          </div>

          <nav className="nav">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/new-shift">Log Shift</NavLink>
            {!loading && profile?.role === 'admin' && <NavLink href="/admin">Admin</NavLink>}
          </nav>

          <button className="topbar-btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {r.query.msg === 'not_admin' && (
        <div className="banner-error">Access denied: Admins only.</div>
      )}

      <Component {...pageProps} />
    </>
  );
}
