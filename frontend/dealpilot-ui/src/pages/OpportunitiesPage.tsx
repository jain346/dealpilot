/* ================================================================
   OPPORTUNITIES PAGE
   ================================================================ */

import { useState, useEffect } from "react";
import type { Opportunity, Page, PendingChatAction, Research } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders, toastForError } from "../api/client";
import { formatConfidence, ITEMS_PER_PAGE } from "../utils/format";
import {
  PageFrame, SkeletonStack, InlineError, EmptyState,
  SignalCard, DetailDrawer, DeleteAction,
} from "../components";

export function OpportunitiesPage({
  onNavigate,
  onStartChatAction,
}: {
  onNavigate?: (page: Page, company?: string) => void;
  onStartChatAction?: (action: PendingChatAction) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "high" | "direct">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [researchedCompanies, setResearchedCompanies] = useState<Set<string>>(new Set());
  const [researchedOppIds, setResearchedOppIds] = useState<Set<number>>(new Set());

  const fetchItems = async () => {
    setLoading(true);
    setErrorStr(null);
    try {
      const opportunities = await request<Opportunity[]>("/agent/opportunities", { headers: authHeaders() });
      setItems(opportunities);
      const researchResults = await request<Research[]>("/agent/research", { headers: authHeaders() }).catch(() => []);
      const compSet = new Set<string>();
      const idSet = new Set<number>();
      for (const r of researchResults) {
        if (r.status === "COMPLETED" || r.status === "DONE" || r.summary || (r.products && r.products.length > 0)) {
          if (r.company_name) compSet.add(r.company_name.trim().toLowerCase());
          if (r.opportunity_id) idSet.add(r.opportunity_id);
        }
      }
      setResearchedCompanies(compSet);
      setResearchedOppIds(idSet);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Unable to load opportunities";
      setErrorStr(msg);
      toastForError(toast, err, "Unable to load opportunities");
    }
  };

  useEffect(() => { void fetchItems(); }, []);

  const isOpportunityResearched = (opp: Opportunity | null | undefined): boolean => {
    if (!opp) return false;
    if (researchedOppIds.has(opp.id)) return true;
    if (opp.company_name && researchedCompanies.has(opp.company_name.trim().toLowerCase())) return true;
    return false;
  };

  const select = async (id: number) => {
    try {
      setSelected(await request<Opportunity>(`/agent/opportunities/${id}`, { headers: authHeaders() }));
    } catch (err) { toastForError(toast, err, "Unable to load opportunity"); }
  };

  const runAction = (type: "research" | "fit", item: Opportunity) => {
    onStartChatAction?.({ type, opportunityId: item.id, companyName: item.company_name });
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = !searchQuery.trim() || item.company_name.toLowerCase().includes(searchQuery.toLowerCase()) || item.opportunity_description.toLowerCase().includes(searchQuery.toLowerCase()) || item.signal_type.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === "high") return item.confidence_level.toLowerCase().includes("high") || item.confidence_level.toLowerCase().includes("strong");
    if (activeFilter === "direct") return item.is_explicit_opportunity;
    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <PageFrame eyebrow="Commercial signals" title="Opportunities" subtitle="Find timely companies and partnership signals matched to your creator profile.">
      <div className="toolbar-controls">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search company, signal, niche..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
          {searchQuery && (<button className="clear-search" onClick={() => setSearchQuery("")}>✕</button>)}
        </div>
        <div className="filter-pills">
          <button className={`filter-pill ${activeFilter === "all" ? "active" : ""}`} onClick={() => { setActiveFilter("all"); setCurrentPage(1); }}>All ({items.length})</button>
          <button className={`filter-pill ${activeFilter === "high" ? "active" : ""}`} onClick={() => { setActiveFilter("high"); setCurrentPage(1); }}>High Confidence</button>
          <button className={`filter-pill ${activeFilter === "direct" ? "active" : ""}`} onClick={() => { setActiveFilter("direct"); setCurrentPage(1); }}>Direct Rec ✓</button>
        </div>
      </div>

      {loading ? (
        <SkeletonStack count={3} />
      ) : errorStr ? (
        <InlineError message={errorStr} onRetry={fetchItems} />
      ) : filteredItems.length === 0 ? (
        <EmptyState icon="✦" title="No opportunities found" description={searchQuery || activeFilter !== "all" ? "No signals match your current search or filter criteria." : "Start a conversation with DealPilot to discover partnership signals for your niche."} />
      ) : (
        <>
          <div className="signal-stack">
            {paginatedItems.map((item) => (
              <div className="unstyled-card" role="button" tabIndex={0} key={item.id} onClick={() => void select(item.id)} onKeyDown={(event) => { if (event.key === "Enter") void select(item.id); }}>
                <SignalCard opportunity={item} onResearch={() => runAction("research", item)} onFit={() => runAction("fit", item)} isResearched={isOpportunityResearched(item)} onFitDisabled={() => toast.info("Firstly research has to be performed, after that fit analysis will be done.")} />
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length} records</span>
              <div className="pagination-buttons">
                <button className="pagination-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}>← Previous</button>
                <span className="page-indicator">Page {currentPage} of {totalPages}</span>
                <button className="pagination-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}>Next →</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Side Drawer for Selected Detail */}
      <DetailDrawer isOpen={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="drawer-header">
              <div className="drawer-title-area">
                <div className="company-mark">{selected.company_name.slice(0, 1)}</div>
                <div><span className="kicker dark">Opportunity Detail</span><h3 style={{ margin: 0 }}>{selected.company_name}</h3></div>
              </div>
              <div className="drawer-actions">
                {(selected.source_urls?.[0] || selected.company_url) && (
                  <a className="button secondary" style={{ textDecoration: "none", fontSize: "11px", padding: "6px 12px" }} href={selected.source_urls?.[0] || selected.company_url || "#"} target="_blank" rel="noreferrer">{selected.source_urls?.[0] ? "Program Link ↗" : "Website ↗"}</a>
                )}
                <DeleteAction path={`/agent/opportunities/${selected.id}`} label={selected.company_name} onDeleted={() => { setItems((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); }} />
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>Close ✕</button>
              </div>
            </div>
            <div className="drawer-content">
              <div className="detail-grid-layout">
                <div>
                  <strong className="detail-section-title">Overview & Match Rationale</strong>
                  <p className="detail-text">{selected.opportunity_description || selected.why_relevant}</p>
                  {selected.opportunity_description && selected.why_relevant && (<p className="detail-subtext"><strong>Why Relevant:</strong> {selected.why_relevant}</p>)}
                  {selected.why_now && (<p className="detail-subtext"><strong>Why Now Signal:</strong> {selected.why_now}</p>)}
                </div>
                <div>
                  <strong className="detail-section-title">Opportunity Metadata</strong>
                  <div className="detail-meta-tags">
                    <span className="tag">Signal: {selected.signal_type}</span>
                    <span className={`confidence ${selected.confidence_level?.toLowerCase().includes("high") ? "green" : "amber"}`}>{selected.confidence_level} ({formatConfidence(selected.confidence)})</span>
                    {selected.is_explicit_opportunity && (<span className="tag" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--green)" }}>Direct Rec ✓</span>)}
                    {selected.status && <span className="status-pill">{selected.status}</span>}
                  </div>
                  <div style={{ marginTop: 12, fontSize: "11px", color: "var(--muted)" }}>
                    <span>Created: {new Date(selected.created_at).toLocaleDateString()}</span>
                    {selected.updated_at && (<span style={{ marginLeft: 14 }}>Updated: {new Date(selected.updated_at).toLocaleDateString()}</span>)}
                  </div>
                </div>
              </div>
              {selected.requirements && selected.requirements.length > 0 && (
                <div className="detail-list" style={{ marginTop: 18 }}>
                  <strong className="detail-section-title">Creator Requirements</strong>
                  <ul>{selected.requirements.map((req, idx) => (<li key={idx}>{req}</li>))}</ul>
                </div>
              )}
              {selected.source_urls && selected.source_urls.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <strong className="detail-section-title">Sources & References</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {selected.source_urls.map((url, idx) => (
                      <a key={idx} className="source-card" href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        <span className="source-num">#{idx + 1}</span><span className="source-title">{url}</span><span className="source-arrow">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="button secondary" onClick={() => { const item = selected; setSelected(null); runAction("research", item); }}>Research brand</button>
                <button className={`button primary ${!isOpportunityResearched(selected) ? "disabled-btn" : ""}`} aria-disabled={!isOpportunityResearched(selected)} title={!isOpportunityResearched(selected) ? "Research must be performed before fit analysis" : "Evaluate fit"} onClick={() => { const item = selected; if (!isOpportunityResearched(item)) { toast.info("Firstly research has to be performed, after that fit analysis will be done."); return; } setSelected(null); runAction("fit", item); }}>Evaluate fit</button>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}
