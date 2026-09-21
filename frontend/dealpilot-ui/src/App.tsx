/* ================================================================
   APP ROOT — Slim entry point
   ================================================================

   This file is the application entry point. All page components,
   types, API client, and utilities have been decomposed into:

   src/types/index.ts        — All TypeScript type definitions
   src/api/client.ts         — API request, auth, error handling
   src/utils/format.ts       — Formatting, profile, dedup utilities
   src/utils/markdown.ts     — Markdown rendering utilities
   src/context/ThemeContext.tsx — Theme provider and toggle
   src/context/ToastContext.tsx — Toast notification provider
   src/components/index.tsx   — All shared UI components
   src/pages/                 — Individual page components
   ================================================================ */

import { useCallback, useEffect, useState } from "react";
import "./App.css";

import type { User, Profile } from "./types";
import { ThemeContext } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { request, authHeaders, storage, AUTH_EXPIRED_EVENT } from "./api/client";
import { emptyProfile, profileForForm } from "./utils/format";
import { LandingPage, AuthScreen, AppShell } from "./pages";

import type { Theme } from "./types";

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("dealpilot_theme") as Theme) || "dark";
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("dealpilot_theme", next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setProfile(emptyProfile);
  }, []);

  // Auto-logout on 401 from any API call
  useEffect(() => {
    const handler = () => { logout(); };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [logout]);

  const loadProfile = async (): Promise<Profile> => {
    try {
      const data = await request<Profile>("/agent/profile", { headers: authHeaders() });
      const p = profileForForm(data);
      setProfile(p);
      return p;
    } catch {
      setProfile(emptyProfile);
      return emptyProfile;
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!localStorage.getItem(storage.token)) {
        setLoading(false);
        return;
      }
      request<User>("/auth/me", { headers: authHeaders() })
        .then(async (current) => {
          await loadProfile();
          setUser(current);
        })
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading)
    return <div className="loading-screen">Loading DealPilot…</div>;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ToastProvider>
        {user ? (
          <AppShell
            user={user}
            profile={profile}
            setProfile={setProfile}
            onLogout={logout}
          />
        ) : showAuth ? (
          <AuthScreen
            onLogin={async (current) => {
              await loadProfile();
              setUser(current);
            }}
          />
        ) : (
          <LandingPage onLaunch={() => setShowAuth(true)} />
        )}
      </ToastProvider>
    </ThemeContext.Provider>
  );
}
