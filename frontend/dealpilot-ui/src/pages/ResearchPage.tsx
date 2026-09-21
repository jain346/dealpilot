/* ================================================================
   RESEARCH PAGE
   ================================================================ */

import { useState, useEffect } from "react";
import type { Research, Page, PendingChatAction } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders, toastForError } from "../api/client";
import { dedupeByCompany, formatConfidence, ITEMS_PER_PAGE } from "../utils/format";
import {
  PageFrame, SkeletonStack, InlineError, EmptyState,
  DetailDrawer, DeleteAction, DetailList,
} from "../components";

export function ResearchPage({
  targetCompany,
  onStartChatAction,
}: {
  targetCompany?: string | null;
  onNavigate?: (page: Page, company?: string) => void;
  onStartChatAction?: (action: PendingChatAction) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Research[]>([]);
  const [selected, setSelected] = useState<Research | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchItems = () => {
    setLoading(true);
    setErrorStr(null);
    void request<Research[]>("/agent/research", { headers: authHeaders() })
      .then((result) => {
        const deduped = dedupeByCompany(result);
        setItems(deduped);
        setLoading(false);
        if (targetCompany) {
          const match = deduped.find((i) => i.company_name.toLowerCase() === targetCompany.toLowerCase());
          if (match) void select(match.id);
        }
      })
      .catch((err) => {
        setLoading(false);
        const msg = err instanceof Error ? err.message : "Unable to load research";
        setErrorStr(msg);
        toastForError(toast, err, "Unable to load research");
      });
  };

  useEffect(() => { fetchItems(); }, [targetCompany]);

  const select = async (id: number) => {
    try {
      setSelected(await request<Research>(`/agent/research/${id}`, { headers: authHeaders() }));
    } catch (err) { toastForError(toast, err, "Unable to load research"); }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = !searchQuery.trim() || item.company_name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (activeFilter === "completed") return item.status === "COMPLETED";
    if (activeFilter === "in_progress") return item.status === "IN_PROGRESS";
    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <PageFrame eyebrow="Deep brand intelligence" title="Research" subtitle="Research jobs and completed brand intelligence from your saved opportunities.">
      <div className="toolbar-controls">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search company or research summary..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
          {searchQuery && (<button className="clear-search" onClick={() => setSearchQuery("")}>✕</button>)}
        </div>
        <div className="filter-pills">
          <button className={`filter-pill ${activeFilter === "all" ? "active" : ""}`} onClick={() => { setActiveFilter("all"); setCurrentPage(1); }}>All ({items.length})</button>
          <button className={`filter-pill ${activeFilter === "completed" ? "active" : ""}`} onClick={() => { setActiveFilter("completed"); setCurrentPage(1); }}>Completed</button>
          <button className={`filter-pill ${activeFilter === "in_progress" ? "active" : ""}`} onClick={() => { setActiveFilter("in_progress"); setCurrentPage(1); }}>In Progress</button>
        </div>
      </div>

      {loading ? (
        <SkeletonStack count={2} />
      ) : errorStr ? (
        <InlineError message={errorStr} onRetry={fetchItems} />
      ) : filteredItems.length === 0 ? (
        <EmptyState icon="◌" title="No research records found" description={searchQuery || activeFilter !== "all" ? "No research records match your filter criteria." : "Research a brand from the Opportunities page to see detailed intelligence here."} />
      ) : (
        <>
          <div className="signal-stack">
            {paginatedItems.map((item) => (
              <div className="unstyled-card" role="button" tabIndex={0} key={item.id} onClick={() => void select(item.id)} onKeyDown={(event) => { if (event.key === "Enter") void select(item.id); }}>
                <section className="research-card panel">
                  <div className="research-brand">
                    <div className="company-mark large-mark">{item.company_name.slice(0, 1)}</div>
                    <div><h2>{item.company_name}</h2><p>{item.summary || "Brand research record"}</p></div>
                    <span className="status-pill">{item.status}</span>
                  </div>
                  <div className="research-grid">
                    <div><span className="kicker dark">Research details</span><p>{item.creator_partnership_signals.slice(0, 2).join(" ") || "Creator activity and partnership signals."}</p></div>
                    <div><span className="kicker dark">Confidence</span><strong>{formatConfidence(item.confidence)}</strong></div>
                  </div>
                </section>
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

      {/* Side Drawer for Selected Research Report */}
      <DetailDrawer isOpen={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="drawer-header">
              <div className="drawer-title-area">
                <div className="company-mark large-mark">{selected.company_name.slice(0, 1)}</div>
                <div><span className="kicker dark">Brand Intelligence Research</span><h3 style={{ margin: 0 }}>{selected.company_name}</h3></div>
              </div>
              <div className="drawer-actions">
                {selected.company_url && (<a className="button secondary" style={{ textDecoration: "none", fontSize: "11px", padding: "6px 12px" }} href={selected.company_url} target="_blank" rel="noreferrer">Website ↗</a>)}
                <DeleteAction path={`/agent/research/${selected.id}`} label={selected.company_name} onDeleted={() => { setItems((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); }} />
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>Close ✕</button>
              </div>
            </div>
            <div className="drawer-content">
              <div><strong className="detail-section-title">Executive Summary</strong><p className="detail-text">{selected.summary || "No summary available."}</p></div>
              <div className="research-grid" style={{ marginTop: 18 }}>
                <div>
                  <DetailList label="Products & Offerings" items={selected.products} />
                  <DetailList label="Target Markets" items={selected.target_markets} />
                  <DetailList label="Target Customers / Audience" items={selected.target_customers} />
                  <DetailList label="Recent News & Launches" items={selected.recent_activity} />
                </div>
                <div>
                  <DetailList label="Partnership Signals" items={selected.creator_partnership_signals} />
                  <DetailList label="Partnership Requirements" items={selected.partnership_requirements} />
                  <DetailList label="Timeliness / Why Now" items={selected.why_now} />
                  <DetailList label="Risks or Unknowns" items={selected.risks_or_unknowns} />
                </div>
              </div>
              <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                  <span>Status: <b className="status-pill">{selected.status}</b></span>
                  <span style={{ marginLeft: 14 }}>Confidence: <strong>{formatConfidence(selected.confidence)}</strong></span>
                  <span style={{ marginLeft: 14 }}>Updated: {new Date(selected.updated_at).toLocaleDateString()}</span>
                </div>
                <button className="button primary" onClick={() => { const brand = selected.company_name; const researchId = selected.id; setSelected(null); onStartChatAction?.({ type: "fit", researchId, companyName: brand }); }}>Evaluate fit for {selected.company_name}</button>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}
