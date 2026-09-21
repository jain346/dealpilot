/* ================================================================
   SHARED COMPONENTS
   ================================================================ */

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { Page, Opportunity } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders, toastForError } from "../api/client";
import { relativeTime, formatConfidence } from "../utils/format";
import { markdownHtml } from "../utils/markdown";

/* ── Logo ──────────────────────────────────────── */

export function Logo() {
  return (
    <div className="logo">
      Deal<span>Pilot</span>
    </div>
  );
}

/* ── Icon ──────────────────────────────────────── */

export function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="nav-icon" aria-hidden="true">
      {children}
    </span>
  );
}

/* ── DisabledButton ──────────────────────────── */

export function DisabledButton({
  children,
  className = "button secondary",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={className}
      disabled
      title="This action will be connected to the backend later"
    >
      {children}
    </button>
  );
}

/* ── InlineError ─────────────────────────────── */

export function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="inline-error-card panel">
      <div className="error-text">
        <strong style={{ color: "var(--danger)" }}>⚠ Unable to load data</strong>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>{message}</p>
      </div>
      <button className="button secondary retry-btn" onClick={onRetry}>
        Retry ↻
      </button>
    </div>
  );
}

/* ── Skeleton Loaders ────────────────────────── */

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-row">
        <div className="skeleton skeleton-avatar" />
        <div className="skeleton-lines">
          <div className="skeleton skeleton-line medium" />
          <div className="skeleton skeleton-line short" />
        </div>
      </div>
      <div className="skeleton-actions">
        <div className="skeleton skeleton-btn" />
        <div className="skeleton skeleton-btn" />
      </div>
    </div>
  );
}

export function SkeletonStack({ count = 3 }: { count?: number }) {
  return (
    <div className="signal-stack">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* ── Empty State ─────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

/* ── Confirm Modal ───────────────────────────── */

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">⚠</div>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="confirm-actions">
          <button className="button secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="button danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Detail Drawer ───────────────────────────── */

export function DetailDrawer({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel" role="dialog" aria-modal="true">
        {children}
      </div>
    </>
  );
}

/* ── Stat Card ───────────────────────────────── */

export function StatCard({
  value,
  label,
  tone = "",
}: {
  value: string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <strong className={tone}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/* ── Page Frame ──────────────────────────────── */

export function PageFrame({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="page-content">
      <span className="kicker dark">{eyebrow}</span>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
      {children}
    </div>
  );
}

/* ── Delete Action ───────────────────────────── */

export function DeleteAction({
  path,
  label,
  onDeleted,
}: {
  path: string;
  label?: string;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await request<void>(path, { method: "DELETE", headers: authHeaders() });
      setShowConfirm(false);
      toast.success(label ? `${label} deleted.` : "Record deleted.");
      onDeleted();
    } catch (err) {
      setShowConfirm(false);
      toastForError(toast, err, "Unable to delete record");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="text-button danger-button"
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          setShowConfirm(true);
        }}
      >
        Delete
      </button>
      {showConfirm && (
        <ConfirmModal
          title="Delete this record?"
          description="This action cannot be undone. All associated data will be permanently removed."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

/* ── Detail List ─────────────────────────────── */

export function DetailList({ label, items }: { label: string; items: string[] }) {
  return items.length ? (
    <div className="detail-list">
      <strong>{label}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  ) : null;
}

/* ── Signal Card ─────────────────────────────── */

export function SignalCard({
  opportunity,
  onResearch,
  onFit,
  isResearched = false,
  onFitDisabled,
}: {
  opportunity: Opportunity;
  onResearch?: () => void;
  onFit?: () => void;
  isResearched?: boolean;
  onFitDisabled?: () => void;
}) {
  const tone =
    opportunity.confidence_level.toLowerCase().includes("high") ||
    opportunity.confidence_level.toLowerCase().includes("strong")
      ? "green"
      : "amber";

  const truncate = (str: string, max: number) =>
    str && str.length > max ? str.slice(0, max) + "…" : str;

  const getDomain = () => {
    if (opportunity.company_url) {
      try {
        const raw = opportunity.company_url.startsWith("http")
          ? opportunity.company_url
          : `https://${opportunity.company_url}`;
        return new URL(raw).hostname.replace(/^www\./, "");
      } catch {
        // fallback
      }
    }
    return `${opportunity.company_name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
  };

  const domain = getDomain();
  const score =
    typeof opportunity.confidence === "number"
      ? Math.round(
          opportunity.confidence <= 1 ? opportunity.confidence * 100 : opportunity.confidence
        )
      : 90;
  const confText = (opportunity.confidence_level || "HIGH").toUpperCase();

  return (
    <article className="signal-card">
      <div className="signal-top">
        <div className="signal-brand-group">
          <div className="company-mark-box">
            <img
              src={`https://logo.clearbit.com/${domain}`}
              alt={opportunity.company_name}
              className="company-logo-img"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <span className="company-monogram" style={{ display: "none" }}>
              {opportunity.company_name.slice(0, 2).toUpperCase()}
            </span>
          </div>

          <div className="signal-brand-info">
            <h3 className="signal-company-name">{opportunity.company_name}</h3>
            {opportunity.opportunity_description && (
              <p className="signal-company-desc">
                {truncate(opportunity.opportunity_description, 64)}
              </p>
            )}
            <p className="signal-company-status">
              {truncate(opportunity.signal_type || "Creator partnership activity detected", 64)}
            </p>
          </div>
        </div>

        <div className="signal-score-badge">
          <span className={`signal-confidence-pill ${tone}`}>{confText}</span>
          <span className="signal-score-num">{score}</span>
        </div>
      </div>

      <div className="signal-reasons-grid">
        <div className="signal-reason-col">
          <div className="signal-reason-pill">Why you</div>
          <p className="signal-reason-text">
            {truncate(opportunity.why_relevant || "High affinity audience match", 120)}
          </p>
        </div>
        <div className="signal-reason-col">
          <div className="signal-reason-label">Why now</div>
          <p className="signal-reason-text">
            {truncate(
              opportunity.why_now ||
                opportunity.signal_type ||
                "Recent product activity • creator ecosystem",
              120,
            )}
          </p>
        </div>
      </div>

      {(onResearch || onFit) && (
        <div className="signal-actions">
          {onResearch && (
            <button
              type="button"
              className="btn-research-brand"
              onClick={(e) => {
                e.stopPropagation();
                onResearch();
              }}
            >
              Research brand
            </button>
          )}
          {onFit && (
            <button
              type="button"
              className={`btn-evaluate-fit ${!isResearched ? "disabled" : ""}`}
              aria-disabled={!isResearched}
              title={
                !isResearched
                  ? "Research must be performed before fit analysis"
                  : "Evaluate partnership fit"
              }
              onClick={(e) => {
                e.stopPropagation();
                if (!isResearched) {
                  onFitDisabled?.();
                  return;
                }
                onFit();
              }}
            >
              Evaluate fit
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/* ── Assistant Message Components ────────────── */

interface ExtractedOpportunity {
  company_name: string;
  company_url?: string;
  signal_type: string;
  opportunity_description: string;
  why_relevant?: string;
  why_now?: string;
  confidence_level?: string;
  confidence?: number;
  requirements?: string[];
  source_urls?: string[];
}

function parseOpportunityJson(text: string): { cleanedText: string; opportunities: ExtractedOpportunity[] } {
  const opportunities: ExtractedOpportunity[] = [];
  if (!text) return { cleanedText: "", opportunities };

  let cleaned = text.trim();

  const extractFromArr = (arr: any[]) => {
    for (const item of arr) {
      if (item && typeof item === "object" && item.company_name) {
        opportunities.push({
          company_name: String(item.company_name),
          company_url: item.company_url ? String(item.company_url) : undefined,
          signal_type: item.signal_type ? String(item.signal_type) : "Commercial Signal",
          opportunity_description: item.opportunity_description ? String(item.opportunity_description) : "",
          why_relevant: item.why_relevant ? String(item.why_relevant) : undefined,
          why_now: item.why_now ? String(item.why_now) : undefined,
          confidence_level: item.confidence_level ? String(item.confidence_level) : "HIGH",
          confidence: typeof item.confidence === "number" ? item.confidence : 0.9,
          requirements: Array.isArray(item.requirements) ? item.requirements.map(String) : undefined,
          source_urls: Array.isArray(item.source_urls) ? item.source_urls.map(String) : undefined,
        });
      }
    }
  };

  cleaned = cleaned.replace(/```json\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/gi, (match, jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) extractFromArr(parsed);
      else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.opportunities)) extractFromArr(parsed.opportunities);
      }
      return "";
    } catch {
      return match;
    }
  });

  let result = "";
  let i = 0;
  while (i < cleaned.length) {
    if (cleaned[i] === "{") {
      let openBraces = 0;
      let endIdx = -1;
      let inString = false;
      let escapeNext = false;

      for (let j = i; j < cleaned.length; j++) {
        const char = cleaned[j];
        if (escapeNext) { escapeNext = false; continue; }
        if (char === "\\") { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === "{") openBraces++;
          else if (char === "}") {
            openBraces--;
            if (openBraces === 0) { endIdx = j; break; }
          }
        }
      }

      if (endIdx !== -1) {
        const jsonCandidate = cleaned.slice(i, endIdx + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (parsed && typeof parsed === "object") {
            let found = false;
            if (Array.isArray(parsed.opportunities)) { extractFromArr(parsed.opportunities); found = true; }
            else if (parsed.company_name) { extractFromArr([parsed]); found = true; }
            if (found) { i = endIdx + 1; continue; }
          }
        } catch { /* not valid JSON */ }
      }
    }
    result += cleaned[i];
    i++;
  }

  return { cleanedText: result.trim(), opportunities };
}

function parseAssistantMessage(content: string) {
  let think = "";
  let body = content;

  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    think = thinkMatch[1].trim();
    body = content.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
  } else {
    const reasoningMatch = content.match(/^(?:\*\*Thinking:\*\*|\*\*Thought Process:\*\*|\*Thinking:\*|Thinking Process:)\s*\n([\s\S]*?)(?=\n\n|\n#)/i);
    if (reasoningMatch) {
      think = reasoningMatch[1].trim();
      body = content.replace(reasoningMatch[0], "").trim();
    }
  }

  const { cleanedText, opportunities } = parseOpportunityJson(body);

  const sources: { title: string; url: string }[] = [];
  const seenUrls = new Set<string>();

  for (const opp of opportunities) {
    if (opp.source_urls) {
      for (const url of opp.source_urls) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          sources.push({ title: `${opp.company_name} Source`, url });
        }
      }
    }
  }

  const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      sources.push({ title, url });
    }
  }

  return { think, body: cleanedText, opportunities, sources };
}

export function ThinkingAccordion({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const steps = content.split("\n").filter((l) => l.trim().length > 0);

  return (
    <details
      className="thinking-accordion"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="thinking-summary">
        <span className="thinking-icon">🧠</span>
        <span className="thinking-title">
          Thought process ({steps.length} {steps.length === 1 ? "step" : "steps"})
        </span>
        <span className="thinking-chevron">{open ? "▲" : "▼"}</span>
      </summary>
      <div className="thinking-content">
        {steps.map((step, i) => (
          <div key={i} className="thinking-line">
            <span className="thinking-bullet">•</span>
            <span>{step.replace(/^[*-]\s+/, "")}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function SourcesSection({ sources }: { sources: { title: string; url: string }[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="sources-container">
      <div className="sources-header">
        <span className="sources-icon">🌐</span>
        <span>Sources & References ({sources.length})</span>
      </div>
      <div className="sources-grid">
        {sources.map((src, i) => {
          let hostname = "";
          try { hostname = new URL(src.url).hostname.replace(/^www\./, ""); } catch { hostname = src.url; }
          return (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" className="source-card" title={src.title || src.url}>
              <span className="source-num">[{i + 1}]</span>
              <span className="source-domain">{hostname}</span>
              <span className="source-title">{src.title || hostname}</span>
              <span className="source-arrow">↗</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function ExtractedOpportunitiesCards({ opportunities }: { opportunities: ExtractedOpportunity[] }) {
  if (opportunities.length === 0) return null;
  return (
    <div className="chat-extracted-opportunities">
      <div className="chat-extracted-header">
        <span className="extracted-icon">🎯</span>
        <span>Discovered Commercial Opportunities ({opportunities.length})</span>
      </div>
      <div className="chat-extracted-grid">
        {opportunities.map((opp, idx) => {
          const affiliateUrl = opp.source_urls && opp.source_urls.length > 0 ? opp.source_urls[0] : null;
          const targetUrl = affiliateUrl || opp.company_url;
          const urlLabel = affiliateUrl ? "Affiliate / Program Link ↗" : "Website ↗";
          return (
            <div className="chat-opp-card" key={idx}>
              <div className="chat-opp-top">
                <div className="chat-opp-mark">{opp.company_name.slice(0, 1)}</div>
                <div className="chat-opp-title-area">
                  <div className="chat-opp-title-row">
                    <h4>{opp.company_name}</h4>
                    {targetUrl && (<a href={targetUrl} target="_blank" rel="noopener noreferrer" className="chat-opp-link" title={targetUrl}>{urlLabel}</a>)}
                  </div>
                  <span className="chat-opp-signal">{opp.signal_type}</span>
                </div>
                <span className={`chat-opp-confidence ${opp.confidence_level?.toLowerCase() === "high" ? "high" : "med"}`}>{opp.confidence_level || "HIGH"}</span>
              </div>
              <p className="chat-opp-desc">{opp.opportunity_description}</p>
              {opp.why_relevant && (<div className="chat-opp-meta-row"><span className="chat-opp-label">Why Relevant:</span><span>{opp.why_relevant}</span></div>)}
              {opp.why_now && (<div className="chat-opp-meta-row"><span className="chat-opp-label">Why Now:</span><span>{opp.why_now}</span></div>)}
              {opp.requirements && opp.requirements.length > 0 && (
                <div className="chat-opp-reqs"><span className="chat-opp-label">Requirements:</span><ul>{opp.requirements.map((req, rIdx) => (<li key={rIdx}>{req}</li>))}</ul></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActionNavigationButtons({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate?: (page: Page, company?: string) => void;
}) {
  if (!onNavigate) return null;
  const navMatches = Array.from(content.matchAll(/\[([^\]]+)\]\(#(research|fit)\/([^)]+)\)/g));
  if (navMatches.length === 0) return null;
  return (
    <div className="chat-action-nav-cards">
      {navMatches.map((m, idx) => {
        const label = m[1];
        const page = m[2] as Page;
        const company = decodeURIComponent(m[3]);
        return (<button key={idx} className="button primary" onClick={() => onNavigate(page, company)}>🔗 {label} →</button>);
      })}
    </div>
  );
}

export function AssistantMessage({
  content,
  createdAt,
  onNavigate,
}: {
  content: string;
  createdAt?: string;
  onNavigate?: (page: Page, company?: string) => void;
}) {
  const { think, body, opportunities, sources } = parseAssistantMessage(content);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(body || content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("[data-page]");
    if (target && onNavigate) {
      e.preventDefault();
      const page = target.getAttribute("data-page") as Page;
      const company = target.getAttribute("data-company") || undefined;
      if (page) onNavigate(page, company);
    }
  };

  return (
    <article className="chat-message assistant">
      <div className="message-header">
        <span className="message-author">DealPilot</span>
        <span className="search-powered-badge">⚡ Search powered by Parallel</span>
        <button className="copy-msg-btn" onClick={handleCopy} title="Copy response markdown text">{copied ? "✓ Copied" : "📋 Copy"}</button>
      </div>
      <div className="message-body">
        {think && <ThinkingAccordion content={think} />}
        {opportunities.length > 0 && <ExtractedOpportunitiesCards opportunities={opportunities} />}
        {body && (<div className="markdown-content" onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: markdownHtml(body) }} />)}
        <ActionNavigationButtons content={content} onNavigate={onNavigate} />
        {sources.length > 0 && <SourcesSection sources={sources} />}
      </div>
      {createdAt && (<span className="message-timestamp">{relativeTime(createdAt)}</span>)}
    </article>
  );
}

export function TypingIndicator({
  statusLabel,
  isFinished = false,
}: {
  statusLabel?: string;
  isFinished?: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = [
    statusLabel || "Researching brand and gathering data...",
    "Querying Parallel Search MCP engine…",
    "Extracting brand signals & opportunity intelligence…",
    "Evaluating creator profile alignment & metrics…",
    "Synthesizing structured response…",
  ];

  useEffect(() => {
    if (isFinished) { setStepIndex(5); return; }
    const timer = setInterval(() => {
      setStepIndex((i) => { if (i < 3) return i + 1; return 3; });
    }, 2200);
    return () => clearInterval(timer);
  }, [isFinished]);

  return (
    <div className="typing-indicator-wrapper">
      <div className="message-header">
        <span className="typing-indicator-label">DealPilot</span>
        <span className="search-powered-badge pulse">⚡ Search powered by Parallel</span>
      </div>
      <div className="typing-box">
        <details className="thinking-accordion live-thinking" open>
          <summary className="thinking-summary">
            <span className="thinking-icon">🧠</span>
            <span className="thinking-title">{isFinished ? "Analysis complete ✓" : (statusLabel ? statusLabel : "Thinking process…")}</span>
            <span className={isFinished ? "done-dot" : "live-pulse-dot"} />
          </summary>
          <div className="thinking-steps">
            {steps.map((s, idx) => {
              const isDone = isFinished || idx < stepIndex;
              const isActive = !isFinished && idx === stepIndex;
              return (
                <div key={s} className={`thinking-step ${isDone ? "done" : isActive ? "active" : "pending"}`}>
                  <span className="step-status-icon">{isDone ? "✓" : isActive ? "⚡" : "○"}</span>
                  <span>{s}</span>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}
