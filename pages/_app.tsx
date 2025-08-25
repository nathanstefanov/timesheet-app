// pages/_app.tsx
import type { AppProps } from "next/app";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import "../styles/globals.css";

type Profile =
  | { id: string; full_name?: string | null; role: "employee" | "admin" }
  | null;

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const navLock = useRef(false);
  const isLogin = router.pathname === "/";

  function safeReplace(path: string) {
    if (navLock.current || router.asPath === path) return;
    navLock.current = true;
    router
      .replace(path)
      .finally(() => setTimeout(() => (navLock.current = false), 120));
  }

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .single();
      if (error) throw error;
      setProfile((data as any) ?? null);
    } catch (e: any) {
      setProfile(null);
      setAuthError(e.message || "Failed to load profile");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: uData } = await supabase.auth.getUser();
        if (cancelled) return;

        if (uData?.user) {
          await fetchProfile(uData.user.id);
          if (isLogin) safeReplace("/dashboard");
        } else if (!isLogin) {
          setProfile(null);
          safeReplace("/");
        }
      } catch (e: any) {
        if (!cancelled) {
          setProfile(null);
          setAuthError(e.message || "Auth check failed");
          if (!isLogin) safeReplace("/");
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          if (session?.user) {
            await fetchProfile(session.user.id);
            if (router.pathname === "/") safeReplace("/dashboard");
          }
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          if (router.pathname !== "/") safeReplace("/");
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router.pathname]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/";
    }
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
            {profile && (
              <>
                <Link legacyBehavior href="/dashboard">
                  <a className="nav-link">Dashboard</a>
                </Link>
                <Link legacyBehavior href="/new-shift">
                  <a className="nav-link">Log Shift</a>
                </Link>
                {profile.role === "admin" && (
                  <Link legacyBehavior href="/admin">
                    <a className="nav-link">Admin</a>
                  </Link>
                )}
                <button className="topbar-btn" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {authError && (
        <div className="toast toast--error">
          <span>Auth error: {authError}</span>
          <button className="toast__dismiss" onClick={() => setAuthError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <Component {...pageProps} />
    </>
  );
}
