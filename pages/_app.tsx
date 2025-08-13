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
            <img src="https://sdmntprwestus2.oaiusercontent.com/files/00000000-ad4c-61f8-abc5-60eb97f8bbe6/raw?se=2025-08-13T22%3A07%3A48Z&sp=r&sv=2024-08-04&sr=b&scid=f162bcf4-d7b7-57b9-905c-fb668c920def&skoid=ea1de0bc-0467-43d6-873a-9a5cf0a9f835&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2025-08-13T20%3A18%3A15Z&ske=2025-08-14T20%3A18%3A15Z&sks=b&skv=2024-08-04&sig=pD2CU2t/KcUSFrrJ%2BwdD4fBp%2B%2BkS88pqcAnlWmk%2Bq7E%3D" alt="Logo" className="logo" />
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
