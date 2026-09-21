/* ================================================================
   FIT PAGE
   ================================================================ */

import { useState, useEffect } from "react";
import type { FitResult } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders, toastForError } from "../api/client";
import { dedupeByCompany, ITEMS_PER_PAGE } from "../utils/format";
import {
  PageFrame, SkeletonStack, InlineError, EmptyState,
  DetailDrawer, DeleteAction, DetailList,
} from "../components";

export function FitPage({ targetCompany }: { targetCompany?: string | null }) {
  const toast = useToast();
  const [items, setItems] = useState<FitResult[]>([]);
  const [selected, setSelected] = useState<FitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "high" | "moderate">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchItems = () => {
    setLoading(true);
    setErrorStr(null);
    void request<FitResult[]>("/agent/fit", { headers: authHeaders() })
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
        const msg = err instanceof Error ? err.message : "Unable to load fit analyses";
        setErrorStr(msg);
        toastForError(toast, err, "Unable to load fit analyses");
      });
  };

  useEffect(() => { fetchItems(); }, [targetCompany]);

  const select = async (id: number) => {
    try {
      setSelected(await request<FitResult>(`/agent/fit/${id}`, { headers: authHeaders() }));
    } catch (err) { toastForError(toast, err, "Unable to load fit analysis"); }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = !searchQuery.trim() || item.company_name.toLowerCase().includes(searchQuery.toLowerCase()) || item.recommendation.toLowerCase().includes(searchQuery.toLowerCase()) || item.reasoning.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === "high") return item.overall_score >= 80;
    if (activeFilter === "moderate") return item.overall_score < 80;
    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <PageFrame eyebrow="Creator ↔ brand" title="Fit analysis" subtitle="Compare audience, content, market, partnership, and timing fit.">
      <div className="toolbar-controls">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search company, recommendation, or reasoning..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
          {searchQuery && (<button className="clear-search" onClick={() => setSearchQuery("")}>✕</button>)}
        </div>
        <div className="filter-pills">
          <button className={`filter-pill ${activeFilter === "all" ? "active" : ""}`} onClick={() => { setActiveFilter("all"); setCurrentPage(1); }}>All ({items.length})</button>
          <button className={`filter-pill ${activeFilter === "high" ? "active" : ""}`} onClick={() => { setActiveFilter("high"); setCurrentPage(1); }}>Strong Fit (80%+)</button>
          <button className={`filter-pill ${activeFilter === "moderate" ? "active" : ""}`} onClick={() => { setActiveFilter("moderate"); setCurrentPage(1); }}>Moderate / Alignment</button>
        </div>
      </div>

      {loading ? (
        <SkeletonStack count={2} />
      ) : errorStr ? (
        <InlineError message={errorStr} onRetry={fetchItems} />
      ) : filteredItems.length === 0 ? (
        <EmptyState icon="◒" title="No fit analyses found" description={searchQuery || activeFilter !== "all" ? "No fit records match your current filter criteria." : "Evaluate fit for a researched opportunity to see your compatibility scores here."} />
      ) : (
        <>
          <div className="signal-stack">
            {paginatedItems.map((item) => (
              <div className="unstyled-card" role="button" tabIndex={0} key={item.id} onClick={() => void select(item.id)} onKeyDown={(event) => { if (event.key === "Enter") void select(item.id); }}>
                <section className="fit-hero panel">
                  <div className="fit-score">{Math.round(item.overall_score)}</div>
                  <div>
                    <span className="kicker dark">{item.recommendation}</span>
                    <h2>{item.company_name}</h2>
                    <div className="fit-bars">
                      <span>Audience fit <i style={{ width: `${item.audience_fit}%` }} /></span>
                      <span>Content fit <i style={{ width: `${item.content_fit}%` }} /></span>
                      <span>Market fit <i style={{ width: `${item.market_fit}%` }} /></span>
                      <span>Timing fit <i style={{ width: `${item.timing_fit}%` }} /></span>
                    </div>
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

      {/* Side Drawer for Selected Fit Detail */}
      <DetailDrawer isOpen={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="drawer-header">
              <div className="drawer-title-area">
                <div className="fit-score" style={{ width: 64, height: 64, fontSize: 20, borderWidth: 4 }}>{Math.round(selected.overall_score)}</div>
                <div><span className="kicker dark">{selected.recommendation}</span><h3 style={{ margin: 0 }}>{selected.company_name} Compatibility</h3></div>
              </div>
              <div className="drawer-actions">
                <DeleteAction path={`/agent/fit/${selected.id}`} label={selected.company_name} onDeleted={() => { setItems((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); }} />
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>Close ✕</button>
              </div>
            </div>
            <div className="drawer-content">
              <div>
                <strong className="detail-section-title">Fit Breakdown Scores</strong>
                <div className="fit-bars" style={{ marginTop: 10 }}>
                  <span>Audience Fit ({Math.round(selected.audience_fit)}%) <i style={{ width: `${selected.audience_fit}%` }} /></span>
                  <span>Content Fit ({Math.round(selected.content_fit)}%) <i style={{ width: `${selected.content_fit}%` }} /></span>
                  <span>Market Fit ({Math.round(selected.market_fit)}%) <i style={{ width: `${selected.market_fit}%` }} /></span>
                  <span>Partnership Fit ({Math.round(selected.partnership_fit)}%) <i style={{ width: `${selected.partnership_fit}%` }} /></span>
                  <span>Timing Fit ({Math.round(selected.timing_fit)}%) <i style={{ width: `${selected.timing_fit}%` }} /></span>
                </div>
              </div>
              <div style={{ marginTop: 20 }}><strong className="detail-section-title">AI Compatibility Rationale</strong><p className="detail-text">{selected.reasoning}</p></div>
              <div className="two-column" style={{ marginTop: 18 }}>
                <div className="panel" style={{ padding: 16 }}><strong className="detail-section-title" style={{ color: "var(--green)" }}>✓ Key Strengths</strong><DetailList label="" items={selected.strengths} /></div>
                <div className="panel" style={{ padding: 16 }}><strong className="detail-section-title" style={{ color: "var(--amber)" }}>⚠ Potential Concerns</strong><DetailList label="" items={selected.concerns} /></div>
              </div>
              <div style={{ marginTop: 20, fontSize: "11px", color: "var(--muted)", textAlign: "right" }}><span>Evaluated: {new Date(selected.updated_at || selected.created_at).toLocaleDateString()}</span></div>
            </div>
          </>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}
