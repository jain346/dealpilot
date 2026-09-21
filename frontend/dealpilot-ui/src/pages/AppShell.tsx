/* ================================================================
   APP SHELL — Sidebar + Layout + Page Router
   ================================================================ */

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { User, Profile, Page, Conversation, PendingChatAction } from "../types";
import { useToast } from "../context/ToastContext";
import { ThemeToggle } from "../context/ThemeContext";
import { request, authHeaders } from "../api/client";
import { isProfileComplete } from "../utils/format";
import { Logo, Icon } from "../components";
import { OverviewPage } from "./OverviewPage";
import { OpportunitiesPage } from "./OpportunitiesPage";
import { ResearchPage } from "./ResearchPage";
import { FitPage } from "./FitPage";
import { ChatPage } from "./ChatPage";
import { ProfilePage } from "./ProfilePage";
import { SettingsPage } from "./SettingsPage";
import { storage } from "../api/client";

/* ── Sidebar ─────────────────────────────────── */

function Sidebar({
  page, setPage, user, profile, onLogout, onProfile,
}: {
  page: Page; setPage: (page: Page) => void; user: User; profile: Profile; onLogout: () => void; onProfile: () => void;
}) {
  const items: { id: Page; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "opportunities", label: "Opportunities", icon: "✦" },
    { id: "research", label: "Research", icon: "◌" },
    { id: "fit", label: "Fit", icon: "◒" },
    { id: "conversations", label: "Conversations", icon: "▤" },
  ];
  return (
    <aside className="product-sidebar">
      <Logo />
      <nav className="main-nav">
        {items.map((item) => (
          <button className={page === item.id ? "active" : ""} key={item.id} onClick={() => setPage(item.id)}>
            <Icon>{item.icon}</Icon>{item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <nav className="secondary-nav">
        <button className={page === "profile" ? "active" : ""} onClick={onProfile}><Icon>◎</Icon>Profile</button>
        <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}><Icon>⚙</Icon>Settings</button>
      </nav>
      <button className="user-chip" onClick={onProfile}>
        <span>{(profile.creator_name || user.username).slice(0, 1).toUpperCase()}</span>
        <div><strong>{profile.creator_name || user.username}</strong><small>{profile.niche || "Complete profile"}</small></div>
        <b>⌄</b>
      </button>
      <button className="sidebar-logout" onClick={onLogout}>Log out</button>
    </aside>
  );
}

/* ── App Shell ───────────────────────────────── */

export function AppShell({
  user, profile, setProfile, onLogout,
}: {
  user: User; profile: Profile; setProfile: (profile: Profile) => void; onLogout: () => void;
}) {
  const toast = useToast();
  const [page, setPageState] = useState<Page>(() => {
    if (!isProfileComplete(profile)) return "profile";
    const saved = localStorage.getItem(storage.page) as Page | null;
    if (saved && ["overview", "opportunities", "research", "fit", "conversations", "profile", "settings"].includes(saved)) return saved;
    return "conversations";
  });

  const setPage = (newPage: Page) => {
    if (!isProfileComplete(profile) && newPage !== "profile" && newPage !== "settings") {
      toast.warning("Please complete and save your creator profile before starting a conversation.");
      setPageState("profile");
      return;
    }
    localStorage.setItem(storage.page, newPage);
    setPageState(newPage);
  };

  useEffect(() => {
    if (!isProfileComplete(profile)) {
      if (page !== "profile" && page !== "settings") setPageState("profile");
    }
  }, [profile, page]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [targetResearchCompany, setTargetResearchCompany] = useState<string | null>(null);
  const [targetFitCompany, setTargetFitCompany] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pendingChatAction, setPendingChatAction] = useState<PendingChatAction>(null);
  const globalBusyRef = useRef(false);

  const handleStartChatAction = (action: PendingChatAction) => {
    if (!isProfileComplete(profile)) { toast.warning("Please complete and save your creator profile before starting a conversation."); setPage("profile"); return; }
    if (globalBusyRef.current) { toast.warning("DealPilot is currently processing a request. Please wait for it to complete before starting another action."); return; }
    setPendingChatAction(action);
    setPage("conversations");
  };

  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "opportunities", label: "Opportunities", icon: "✦" },
    { id: "research", label: "Research", icon: "◌" },
    { id: "fit", label: "Fit", icon: "◒" },
    { id: "conversations", label: "Chat", icon: "▤" },
  ];

  const handleNavigate = (targetPage: Page, company?: string) => {
    if (targetPage === "research" && company) setTargetResearchCompany(company);
    if (targetPage === "fit" && company) setTargetFitCompany(company);
    setPage(targetPage);
  };

  const refreshConversations = async () => {
    try { setConversations(await request<Conversation[]>("/agent/sessions", { headers: authHeaders() })); } catch { setConversations([]); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshConversations(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  let content: ReactNode;
  if (page === "overview") content = <OverviewPage profile={profile} onNavigate={handleNavigate} onStartChatAction={handleStartChatAction} />;
  if (page === "opportunities") content = <OpportunitiesPage onNavigate={handleNavigate} onStartChatAction={handleStartChatAction} />;
  if (page === "research") content = <ResearchPage targetCompany={targetResearchCompany} onNavigate={handleNavigate} onStartChatAction={handleStartChatAction} />;
  if (page === "fit") content = <FitPage targetCompany={targetFitCompany} />;
  if (page === "conversations") content = <ChatPage profile={profile} conversations={conversations} onRefresh={refreshConversations} pendingAction={pendingChatAction} onClearPendingAction={() => setPendingChatAction(null)} onNavigate={handleNavigate} globalBusyRef={globalBusyRef} />;
  if (page === "profile") content = <ProfilePage profile={profile} onChange={setProfile} onNavigate={handleNavigate} />;
  if (page === "settings") content = <SettingsPage user={user} />;

  return (
    <div className="product-shell">
      <Sidebar page={page} setPage={setPage} user={user} profile={profile} onLogout={onLogout} onProfile={() => setPage("profile")} />
      <main className="product-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-nav-toggle icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">☰</button>
            <div className="topbar-title"><span className="status-dot" /><span className="topbar-brand-label">DealPilot workspace</span></div>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <button className="top-avatar" onClick={() => setPage("profile")} aria-label="Creator profile" title="Creator profile">{(profile.creator_name || user.username).slice(0, 1).toUpperCase()}</button>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)}>
            <div className="mobile-nav-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-drawer-header"><Logo /><button className="icon-button close-drawer-btn" onClick={() => setMobileNavOpen(false)}>✕</button></div>
              <nav className="mobile-drawer-nav">
                {navItems.map((item) => (<button key={item.id} className={page === item.id ? "active" : ""} onClick={() => { setPage(item.id); setMobileNavOpen(false); }}><Icon>{item.icon}</Icon>{item.label}</button>))}
                <button className={page === "profile" ? "active" : ""} onClick={() => { setPage("profile"); setMobileNavOpen(false); }}><Icon>◎</Icon> Profile</button>
                <button className={page === "settings" ? "active" : ""} onClick={() => { setPage("settings"); setMobileNavOpen(false); }}><Icon>⚙</Icon> Settings</button>
              </nav>
              <div className="mobile-drawer-footer">
                <div className="user-chip-mobile"><span>{(profile.creator_name || user.username).slice(0, 1).toUpperCase()}</span><div><strong>{profile.creator_name || user.username}</strong><small>{profile.niche || "Creator profile"}</small></div></div>
                <button className="button secondary logout-btn-mobile" onClick={onLogout}>Log out</button>
              </div>
            </div>
          </div>
        )}

        {content}
      </main>
    </div>
  );
}
