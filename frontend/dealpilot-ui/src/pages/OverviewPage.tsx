/* ================================================================
   OVERVIEW PAGE
   ================================================================ */

import { useState, useEffect } from "react";
import type { Profile, Page, Opportunity, Research, FitResult, PendingChatAction } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders } from "../api/client";
import { dedupeByCompany } from "../utils/format";
import { PageFrame, StatCard, SignalCard, SkeletonCard, DetailDrawer } from "../components";

export function OverviewPage({
  profile,
  onNavigate,
  onStartChatAction,
}: {
  profile: Profile;
  onNavigate: (page: Page, company?: string) => void;
  onStartChatAction?: (action: PendingChatAction) => void;
}) {
  const toast = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [researchList, setResearchList] = useState<Research[]>([]);
  const [fitList, setFitList] = useState<FitResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const isOpportunityResearched = (opp: Opportunity | null | undefined): boolean => {
    if (!opp) return false;
    return researchList.some(
      (r) =>
        (r.opportunity_id === opp.id ||
          (r.company_name && opp.company_name && r.company_name.trim().toLowerCase() === opp.company_name.trim().toLowerCase())) &&
        (r.status === "COMPLETED" || r.status === "DONE" || Boolean(r.summary) || (r.products && r.products.length > 0))
    );
  };

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      request<Opportunity[]>("/agent/opportunities", { headers: authHeaders() }),
      request<Research[]>("/agent/research", { headers: authHeaders() }),
      request<FitResult[]>("/agent/fit", { headers: authHeaders() }),
    ])
      .then(([oppRes, resRes, fitRes]) => {
        if (oppRes.status === "fulfilled") setOpportunities(dedupeByCompany(oppRes.value));
        if (resRes.status === "fulfilled") setResearchList(resRes.value);
        if (fitRes.status === "fulfilled") setFitList(fitRes.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const strongFitsCount = fitList.filter(
    (f) => (f.overall_score ?? 0) >= 70 || (f.recommendation && f.recommendation.toLowerCase().includes("strong")),
  ).length;
  const highConfOppsCount = opportunities.filter(
    (item) =>
      item.confidence_level.toLowerCase().includes("high") ||
      item.confidence_level.toLowerCase().includes("strong"),
  ).length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const featuredSignal = [...opportunities].sort((a, b) => {
    const scoreA = typeof a.confidence === "number" ? a.confidence : 0;
    const scoreB = typeof b.confidence === "number" ? b.confidence : 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const isHighA = a.confidence_level.toLowerCase().includes("high") || a.confidence_level.toLowerCase().includes("strong");
    const isHighB = b.confidence_level.toLowerCase().includes("high") || b.confidence_level.toLowerCase().includes("strong");
    return (isHighB ? 1 : 0) - (isHighA ? 1 : 0);
  })[0];

  const handleAction = (type: "research" | "fit", item: Opportunity) => {
    if (onStartChatAction) {
      onStartChatAction({ type, opportunityId: item.id, companyName: item.company_name });
    } else {
      onNavigate(type === "research" ? "research" : "fit", item.company_name);
    }
  };

  const handleQuickPrompt = () => { onNavigate("conversations"); };

  return (
    <PageFrame
      eyebrow={`${greeting}, ${profile.creator_name || "Creator"}`}
      title="Commercial Deal Desk"
      subtitle="Overview of market signals, brand research, and active commercial opportunities."
    >
      {/* Profile Summary Badge Row */}
      <div className="profile-badge-row">
        {profile.niche && (<span className="profile-badge-pill">🎯 Niche: <strong>{profile.niche}</strong></span>)}
        {profile.platforms && profile.platforms.length > 0 && (<span className="profile-badge-pill">📱 Platform: <strong>{profile.platforms.join(", ")}</strong></span>)}
        {profile.audience_size && (<span className="profile-badge-pill">👥 Audience: <strong>{profile.audience_size.toLocaleString()}</strong></span>)}
        {profile.region && (<span className="profile-badge-pill">📍 Region: <strong>{profile.region}</strong></span>)}
      </div>

      {/* KPI Dashboard */}
      <div className="stats-grid">
        <StatCard value={String(opportunities.length)} label="Active Signals" tone="blue" />
        <StatCard value={String(researchList.length)} label="Researched Brands" tone="blue" />
        <StatCard value={String(strongFitsCount || highConfOppsCount)} label="High-Fit Brands" tone="green" />
      </div>

      {/* Needs Your Attention Hero Section */}
      <section className="attention panel">
        <div className="panel-heading">
          <div><span className="kicker">Needs your attention</span><h2>Top Brand Signal</h2></div>
          <button className="text-button" onClick={() => onNavigate("opportunities")}>View all signals ({opportunities.length}) →</button>
        </div>
        {loading ? (
          <SkeletonCard />
        ) : featuredSignal ? (
          <SignalCard
            opportunity={featuredSignal}
            onResearch={() => handleAction("research", featuredSignal)}
            onFit={() => handleAction("fit", featuredSignal)}
            isResearched={isOpportunityResearched(featuredSignal)}
            onFitDisabled={() => toast.info("Firstly research has to be performed, after that fit analysis will be done.")}
          />
        ) : (
          <p className="muted">Use DealPilot Chat to discover brand partnership opportunities for your niche.</p>
        )}
      </section>

      {/* Quick Launchpad Section */}
      <div className="section-heading page-section-heading" style={{ marginTop: 28 }}>
        <div><span className="kicker dark">DealPilot Launchpad</span><h2>What would you like to do?</h2></div>
      </div>
      <div className="launchpad-grid">
        <div className="launchpad-card" onClick={handleQuickPrompt}><div className="launchpad-icon">🚀</div><div className="launchpad-title">Discover New Signals</div><div className="launchpad-desc">Ask AI DealPilot to discover live brand opportunities in your niche.</div></div>
        <div className="launchpad-card" onClick={() => onNavigate("fit")}><div className="launchpad-icon">🎯</div><div className="launchpad-title">Evaluate Brand Fit</div><div className="launchpad-desc">Calculate brand alignment scores and target audience synergy.</div></div>
        <div className="launchpad-card" onClick={() => onNavigate("research")}><div className="launchpad-icon">🔍</div><div className="launchpad-title">Explore Research Hub</div><div className="launchpad-desc">Access financial metrics, campaign budgets, and contact info.</div></div>
        <div className="launchpad-card" onClick={() => onNavigate("profile")}><div className="launchpad-icon">👤</div><div className="launchpad-title">Commercial Profile</div><div className="launchpad-desc">Refine your niche, audience size, and platform channels.</div></div>
      </div>

      {/* Recent Signals Feed */}
      <div className="section-heading page-section-heading" style={{ marginTop: 28 }}>
        <div><span className="kicker dark">Recent Signals</span><h2>Commercial pipeline activity</h2></div>
        <button className="button button-primary" onClick={handleQuickPrompt}>Discover new signals 🚀</button>
      </div>

      <div className="table-list">
        {loading ? (
          <div style={{ padding: 14 }}><div className="skeleton skeleton-line" style={{ height: 14 }} /></div>
        ) : opportunities.length === 0 ? (
          <p className="muted" style={{ padding: 14 }}>No opportunity records found. Use the DealPilot Chat to generate brand opportunities.</p>
        ) : (
          opportunities.slice(0, 4).map((item) => (
            <div key={item.id} className="clickable-row" onClick={() => setSelectedOpp(item)}>
              <span className="company-mark small">{item.company_name.slice(0, 1)}</span>
              <strong>{item.company_name}</strong>
              <span>{item.signal_type}</span>
              <span className="confidence green">{item.confidence_level}</span>
              <time>{new Date(item.updated_at).toLocaleDateString()}</time>
            </div>
          ))
        )}
      </div>

      {/* Side Drawer for Selected Opportunity */}
      <DetailDrawer isOpen={Boolean(selectedOpp)} onClose={() => setSelectedOpp(null)}>
        {selectedOpp && (
          <div style={{ padding: 24 }}>
            <div className="drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="company-mark">{selectedOpp.company_name.slice(0, 1)}</span>
                <div><h2 style={{ margin: 0 }}>{selectedOpp.company_name}</h2><span className="kicker">{selectedOpp.signal_type}</span></div>
              </div>
              <button className="icon-button" onClick={() => setSelectedOpp(null)}>✕</button>
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <span className="confidence green">Confidence: {selectedOpp.confidence_level}</span>
                {selectedOpp.source_urls && selectedOpp.source_urls.length > 0 && (
                  <a href={selectedOpp.source_urls[0]} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)" }}>🔗 View Source</a>
                )}
              </div>
              <h3>Signal Description</h3>
              <p style={{ color: "var(--fg-muted)", lineHeight: 1.6 }}>{selectedOpp.opportunity_description}</p>
              {selectedOpp.why_relevant && (<p style={{ marginTop: 12 }}>💡 Relevance: <strong>{selectedOpp.why_relevant}</strong></p>)}
              <div className="hero-action-buttons" style={{ marginTop: 24 }}>
                <button className="hero-action-btn primary" onClick={() => { const opp = selectedOpp!; setSelectedOpp(null); handleAction("research", opp); }}>⚡ Run Deep Research</button>
                <button
                  className={`hero-action-btn secondary ${!isOpportunityResearched(selectedOpp) ? "disabled" : ""}`}
                  aria-disabled={!isOpportunityResearched(selectedOpp)}
                  title={!isOpportunityResearched(selectedOpp) ? "Research must be performed before fit analysis" : "Evaluate fit"}
                  onClick={() => { const opp = selectedOpp!; if (!isOpportunityResearched(opp)) { toast.info("Firstly research has to be performed, after that fit analysis will be done."); return; } setSelectedOpp(null); handleAction("fit", opp); }}
                >🎯 Evaluate Fit</button>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}
