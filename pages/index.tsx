// pages/index.tsx
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const r = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

  function clearAlerts() {
    setErr(undefined);
    setMsg(undefined);
  }

  async function submit() {
    clearAlerts();
    setLoading(true);
    try {
      if (!email) throw new Error("Enter your email");
      if (mode === "signup" && password.length < 8)
        throw new Error("Password must be at least 8 characters");
      if (mode === "signin" && !password) throw new Error("Enter your password");

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        r.push("/dashboard");
      }
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function sendReset() {
    clearAlerts();
    setLoading(true);
    try {
      if (!email) throw new Error("Enter your email first");
      const redirectTo =
        typeof window !== "undefined"
          ? `${location.origin}/update-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      setMsg("Password reset email sent. Check your inbox.");
    } catch (e: any) {
      setErr(e.message || "Could not send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1 className="title">Timesheet Login</h1>

        <div className="tabs">
          <button
            className={`tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => setMode("signin")}
          >
            Sign In
          </button>
          <button
            className={`tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => setMode("signup")}
          >
            Create Account
          </button>
        </div>

        <label>Email</label>
        <input
          ref={emailRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />

        <label>Password</label>
        <div>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <label>
            <input
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
            />{" "}
            Show
          </label>
        </div>

        {err && <div style={{ color: "red" }}>{err}</div>}
        {msg && <div style={{ color: "green" }}>{msg}</div>}

        <button onClick={submit} disabled={loading}>
          {loading ? "Working…" : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        <div style={{ marginTop: "10px" }}>
          <button onClick={sendReset} disabled={loading}>
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
}
