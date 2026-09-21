import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import type { User } from "../types";
import { Logo } from "../components";
import { request, authHeaders, storage } from "../api/client";

export function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleModal, setGoogleModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");

  const handleGoogleAuth = async (email: string, name?: string, credential?: string) => {
    setBusy(true);
    setError("");
    try {
      const login = await request<{ access_token: string }>("/auth/google", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim() || undefined,
          name: name || undefined,
          credential: credential || undefined,
        }),
      });
      localStorage.setItem(storage.token, login.access_token);
      onLogin(await request<User>("/auth/me", { headers: authHeaders() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google authentication failed");
    } finally {
      setBusy(false);
      setGoogleModal(false);
    }
  };

  const GOOGLE_CLIENT_ID =
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
    ((typeof window !== "undefined" && (window as any).__GOOGLE_CLIENT_ID__) as string | undefined);

  const triggerGoogleSignIn = () => {
    setError("");
    if (GOOGLE_CLIENT_ID && typeof window !== "undefined" && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setGoogleModal(true);
          }
        });
        return;
      } catch (e) {
        // fallback to modal
      }
    }
    setGoogleModal(true);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !GOOGLE_CLIENT_ID) return;

    const initGoogleIdentity = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: any) => {
            if (response.credential) {
              let parsedEmail = "";
              let parsedName = "";
              try {
                const parts = response.credential.split(".");
                if (parts.length >= 2) {
                  const base64Url = parts[1];
                  const base64Str = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                  const jsonPayload = decodeURIComponent(
                    atob(base64Str)
                      .split("")
                      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                      .join("")
                  );
                  const parsed = JSON.parse(jsonPayload);
                  parsedEmail = parsed.email || "";
                  parsedName = parsed.name || parsed.given_name || "";
                }
              } catch (e) {}
              void handleGoogleAuth(parsedEmail, parsedName, response.credential);
            }
          },
        });

        const container = document.getElementById("google-signin-btn-container");
        if (container) {
          try {
            const containerWidth = container.offsetWidth || (typeof window !== "undefined" ? window.innerWidth - 64 : 320);
            const btnWidth = Math.max(200, Math.min(Math.floor(containerWidth), 380));
            (window as any).google.accounts.id.renderButton(container, {
              theme: "outline",
              size: "large",
              width: btnWidth,
              text: "continue_with",
              shape: "rectangular",
            });
          } catch (e) {}
        }
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGoogleIdentity();
    } else {
      const timer = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(timer);
          initGoogleIdentity();
        }
      }, 300);
      return () => clearInterval(timer);
    }
  }, [GOOGLE_CLIENT_ID]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (mode === "signup") {
      if (!username || username.length < 3) { setError("Username must be at least 3 characters long."); setBusy(false); return; }
      if (!email) { setError("Please enter your email address."); setBusy(false); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters long."); setBusy(false); return; }
    }

    try {
      if (mode === "signup") {
        await request("/auth/signup", {
          method: "POST",
          body: JSON.stringify({ username, email, password }),
        });
      }
      const login = await request<{ access_token: string }>("/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }),
      });
      localStorage.setItem(storage.token, login.access_token);
      onLogin(await request<User>("/auth/me", { headers: authHeaders() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-visual">
        <Logo />
        <div className="visual-copy">
          <span className="kicker">Creator partnership intelligence</span>
          <h1>Find the next right deal.</h1>
          <p>
            Research brands, surface timely opportunities, and make confident
            partnership decisions from one focused deal desk.
          </p>
        </div>
        <span className="visual-foot">Private, account-based workspace</span>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card">
          <div className="auth-mobile-logo"><Logo /></div>
          <div className="auth-tabs">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
          </div>
          <div className="auth-header-copy">
            <span className="auth-kicker">{mode === "signup" ? "Get started" : "Welcome back"}</span>
            <h2 className="auth-title">{mode === "signup" ? "Create your workspace" : "Pick up where you left off"}</h2>
            <p className="auth-subtitle">{mode === "signup" ? "Your profile will power every recommendation." : "Your research history and creator profile are ready."}</p>
          </div>
          <div id="google-signin-btn-container" className="google-btn-container">
            <button type="button" className="button google-button" disabled={busy} onClick={triggerGoogleSignIn}>
              <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
          <div className="auth-divider"><span>or with credentials</span></div>
          <form onSubmit={submit} className="auth-form-fields">
            <label className="auth-field">
              <span className="auth-field-label">{mode === "signup" ? "Username" : "Email or Username"}</span>
              <input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" placeholder={mode === "signup" ? "Choose a username" : "you@example.com or username"} />
            </label>
            {mode === "signup" && (
              <label className="auth-field">
                <span className="auth-field-label">Email Address</span>
                <input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" placeholder="name@example.com" />
                <span style={{ fontSize: "12px", color: "var(--color-text-muted, #8b949e)", marginTop: "2px" }}>Use any valid email address</span>
              </label>
            )}
            <label className="auth-field">
              <span className="auth-field-label">Password</span>
              <input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="••••••••" />
            </label>
            {mode === "signup" && form.password.length > 0 && form.password.length < 8 && (
              <p className="auth-password-hint">Password must be at least 8 characters</p>
            )}
            <button className="button primary auth-submit-btn" disabled={busy}>
              {busy ? "Working…" : mode === "signup" ? "Create account" : "Log in"}
            </button>
            {error && (
              <div className="auth-alert" role="alert">
                <span className="auth-alert-icon">✕</span>
                <span className="auth-alert-text">{error}</span>
                <button type="button" className="auth-alert-dismiss" onClick={() => setError("")} aria-label="Dismiss error">×</button>
              </div>
            )}
          </form>
        </div>
      </section>
      {googleModal && (
        <div className="confirm-backdrop">
          <div className="confirm-modal" style={{ width: "min(100%, 420px)" }}>
            <div style={{ margin: "0 auto 12px", width: 44, height: 44, display: "grid", placeItems: "center" }}>
              <svg viewBox="0 0 24 24" width="36" height="36">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            <h3>Sign in with Google</h3>
            <p>Enter your Google Account email to authorize dealdesk access:</p>
            <form onSubmit={(e) => { e.preventDefault(); void handleGoogleAuth(googleEmail); }}>
              <input type="email" required placeholder="your.email@gmail.com" value={googleEmail} onChange={(e) => setGoogleEmail(e.target.value)} style={{ marginBottom: 16 }} autoFocus />
              <div className="confirm-actions">
                <button type="button" className="button secondary" onClick={() => setGoogleModal(false)}>Cancel</button>
                <button type="submit" className="button primary" disabled={busy || !googleEmail.trim()}>{busy ? "Signing in…" : "Continue"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
