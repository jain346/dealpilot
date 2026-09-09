import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import "./App.css";

/* ================================================================
   TYPES
   ================================================================ */

type User = { username: string; email?: string | null };
type Profile = {
  creator_name: string | null;
  niche: string | null;
  platforms: string[];
  region: string | null;
  languages?: string[];
  audience_description?: string | null;
  audience_size: number | null;
  average_views: number | null;
  engagement_rate: number | null;
};
type Conversation = { session_id: string; created_at: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};
type ResponsePayload = { text?: string; markdown?: string; links?: string[] };
type Opportunity = {
  id: number;
  company_name: string;
  company_url?: string | null;
  signal_type: string;
  opportunity_description: string;
  requirements: string[];
  is_explicit_opportunity: boolean;
  why_relevant: string;
  why_now?: string | null;
  confidence: number;
  confidence_level: string;
  source_urls: string[];
  status: string;
  created_at: string;
  updated_at: string;
};
type Research = {
  id: number;
  opportunity_id?: number | null;
  company_name: string;
  company_url?: string | null;
  status: string;
  summary?: string | null;
  products: string[];
  target_markets: string[];
  target_customers: string[];
  recent_activity: string[];
  creator_partnership_signals: string[];
  partnership_requirements: string[];
  why_now: string[];
  evidence: { [key: string]: unknown }[];
  risks_or_unknowns: string[];
  confidence?: number | null;
  created_at: string;
  updated_at: string;
};
type FitResult = {
  id: number;
  opportunity_id?: number | null;
  research_id?: number | null;
  company_name: string;
  overall_score: number;
  audience_fit: number;
  content_fit: number;
  market_fit: number;
  partnership_fit: number;
  timing_fit: number;
  recommendation: string;
  strengths: string[];
  concerns: string[];
  reasoning: string;
  created_at: string;
  updated_at: string;
};
type PendingChatAction = {
  type: "research" | "fit";
  opportunityId?: number;
  researchId?: number;
  companyName: string;
} | null;
type ToastSeverity = "success" | "error" | "warning" | "info";
type Toast = {
  id: number;
  severity: ToastSeverity;
  message: string;
  duration: number;
  exiting?: boolean;
};
type Page =
  | "overview"
  | "opportunities"
  | "research"
  | "fit"
  | "conversations"
  | "profile"
  | "settings";

/* ================================================================
   API ERROR
   ================================================================ */

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ================================================================
   CONSTANTS
   ================================================================ */

const storage = {
  token: "dealpilot.token",
  session: "dealpilot.session",
  page: "dealpilot.current_page",
};
const emptyProfile: Profile = {
  creator_name: "",
  niche: "",
  platforms: [],
  region: "",
  audience_size: null,
  average_views: null,
  engagement_rate: null,
};
const TOAST_ICONS: Record<ToastSeverity, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};
const TOAST_TITLES: Record<ToastSeverity, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

/* ================================================================
   THEME SYSTEM
   ================================================================ */

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
});

function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
    >
      <span className="theme-toggle-icon">{theme === "dark" ? "☀️" : "🌙"}</span>
      <span className="theme-toggle-text">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );
}

/* ================================================================
   TOAST SYSTEM
   ================================================================ */

let toastIdCounter = 0;
type ToastApi = {
  show: (severity: ToastSeverity, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};
const ToastContext = createContext<ToastApi | null>(null);

function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const show = useCallback(
    (severity: ToastSeverity, message: string) => {
      const id = ++toastIdCounter;
      const duration =
        severity === "error" ? 0 : severity === "warning" ? 8000 : 5000;
      setToasts((prev) => {
        const next = [...prev, { id, severity, message, duration }];
        return next.slice(-3); // max 3 visible
      });
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const api: ToastApi = {
    show,
    success: (msg) => show("success", msg),
    error: (msg) => show("error", msg),
    warning: (msg) => show("warning", msg),
    info: (msg) => show("info", msg),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.severity}${t.exiting ? " exiting" : ""}`}
            role="alert"
            style={
              t.duration
                ? ({ "--toast-duration": `${t.duration}ms` } as React.CSSProperties)
                : undefined
            }
          >
            <span className="toast-icon">{TOAST_ICONS[t.severity]}</span>
            <div className="toast-body">
              <span className="toast-title">{TOAST_TITLES[t.severity]}</span>
              <span className="toast-text">{t.message}</span>
            </div>
            <button
              className="toast-dismiss"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
            {t.duration > 0 && <span className="toast-progress" />}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ================================================================
   UTILITIES
   ================================================================ */

const AUTH_EXPIRED_EVENT = "dealpilot:auth-expired";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      body.detail || "Something went wrong. Please try again.",
    );
  }
  return body as T;
}

function toastForError(toast: ToastApi, error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      toast.error("Your session expired — logging you out.");
      return;
    }
    if (error.status === 404) {
      toast.info("This record is no longer available.");
      return;
    }
    if (error.status === 409) {
      toast.warning(error.message);
      return;
    }
    if (error.status >= 500) {
      toast.error(
        "DealPilot could not complete that request. Please try again.",
      );
      return;
    }
  }
  toast.error(
    error instanceof Error ? error.message : fallback,
  );
}

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem(storage.token) || ""}`,
  };
}

function responseText(payload: ResponsePayload | string) {
  return typeof payload === "string"
    ? payload
    : payload.markdown || payload.text || "";
}

function formatConfidence(c?: number | null): string {
  if (c == null || Number.isNaN(c)) return "—";
  const pct = c <= 1.0 ? c * 100 : c;
  return `${Math.round(pct)}%`;
}

function isProfileComplete(p: Profile): boolean {
  return Boolean(
    p.niche &&
      p.niche.trim() !== "" &&
      p.region &&
      p.region.trim() !== "" &&
      p.platforms &&
      p.platforms.length > 0 &&
      p.audience_size !== null &&
      p.audience_size !== undefined &&
      p.audience_size > 0,
  );
}

function profileForForm(profile: Profile): Profile {
  return {
    ...profile,
    creator_name: profile.creator_name || "",
    niche: profile.niche || "",
    region: profile.region || "",
    platforms: profile.platforms || [],
  };
}

/**
 * Return the single most-recently-updated record per company_name.
 * The backend already does this at query time, but this guard handles
 * any stale data that may have arrived before the migration ran.
 */
function dedupeByCompany<T extends { company_name: string; updated_at: string }>(
  items: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = item.company_name.toLowerCase();
    const existing = seen.get(key);
    if (!existing || item.updated_at > existing.updated_at) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => b.updated_at.localeCompare(a.updated_at),
  );
}

function relativeTime(dateString: string | undefined): string {
  if (!dateString) return "";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkdown(value: string) {
  let text = escapeHtml(value);

  // Replace Markdown links [text](url) FIRST with temporary token
  const links: string[] = [];
  text = text.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/#?|#)[^\s)]+)\)/g,
    (_, linkText, url) => {
      const idx = links.length;
      if (url.startsWith("#research/") || url.startsWith("#fit/")) {
        const hashStr = url.slice(1);
        const slashIdx = hashStr.indexOf("/");
        const page = slashIdx !== -1 ? hashStr.slice(0, slashIdx) : hashStr;
        const company = slashIdx !== -1 ? decodeURIComponent(hashStr.slice(slashIdx + 1)) : "";
        links.push(
          `<a class="md-link nav-internal-link" data-page="${page}" data-company="${escapeHtml(company)}" href="${url}">${linkText} <span class="ext-icon">→</span></a>`,
        );
      } else {
        links.push(
          `<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer">${linkText} <span class="ext-icon">↗</span></a>`,
        );
      }
      return `___MD_LINK_${idx}___`;
    },
  );

  // Replace numeric citation badges like [1], [2]
  text = text.replace(/\[(\d+)\]/g, '<sup class="citation-badge">$1</sup>');

  // Replace inline code `code`
  text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Replace bold **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Replace italic *text*
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Restore Markdown links
  text = text.replace(/___MD_LINK_(\d+)___/g, (_, idx) => links[parseInt(idx, 10)] || "");

  return text;
}

function renderMarkdownTable(rows: string[]) {
  if (rows.length < 2) return rows.join("\n");
  const cleanRows = rows.map((r) =>
    r
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );

  const headers = cleanRows[0];
  const bodyRows = cleanRows.slice(2);

  const headerHtml = `<thead><tr>${headers.map((h) => `<th>${inlineMarkdown(h)}</th>`).join("")}</tr></thead>`;
  const bodyHtml = `<tbody>${bodyRows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody>`;

  return `<div class="md-table-wrapper"><table class="md-table">${headerHtml}${bodyHtml}</table></div>`;
}

function markdownHtml(markdown: string) {
  if (!markdown) return "";

  let text = markdown.replace(/\r\n/g, "\n").trim();

  // Code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cleanLang = lang || "code";
    const rawCode = code.trim();
    const escapedCode = escapeHtml(rawCode);
    codeBlocks.push(
      `<div class="md-code-block">` +
        `<div class="md-code-header">` +
          `<span class="md-code-lang">${escapeHtml(cleanLang)}</span>` +
          `<button class="md-code-copy" onclick="navigator.clipboard.writeText(\`${rawCode.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`).then(() => { this.innerText='Copied!'; setTimeout(() => this.innerText='Copy', 2000); })">Copy</button>` +
        `</div>` +
        `<pre><code>${escapedCode}</code></pre>` +
      `</div>`,
    );
    return `___CODE_BLOCK_${idx}___`;
  });

  // Table handling
  const lines = text.split("\n");
  const processedLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        processedLines.push(renderMarkdownTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      processedLines.push(line);
    }
  }
  if (inTable) {
    processedLines.push(renderMarkdownTable(tableRows));
  }

  text = processedLines.join("\n");

  const blocks = text.split(/\n{2,}/);

  return (
    blocks
      .filter(Boolean)
      .map((block) => {
        const trimmed = block.trim();

        if (trimmed.startsWith("___CODE_BLOCK_") && trimmed.endsWith("___")) {
          const idx = parseInt(trimmed.replace("___CODE_BLOCK_", "").replace("___", ""), 10);
          return codeBlocks[idx] || "";
        }

        if (trimmed.startsWith('<div class="md-table-wrapper">')) {
          return trimmed;
        }

        const h1Match = trimmed.match(/^#\s+(.+)$/m);
        if (h1Match) return `<h1 class="md-h1">${inlineMarkdown(h1Match[1])}</h1>`;

        const h2Match = trimmed.match(/^##\s+(.+)$/m);
        if (h2Match) return `<h2 class="md-h2">${inlineMarkdown(h2Match[1])}</h2>`;

        const h3Match = trimmed.match(/^###\s+(.+)$/m);
        if (h3Match) return `<h3 class="md-h3">${inlineMarkdown(h3Match[1])}</h3>`;

        const h4Match = trimmed.match(/^####\s+(.+)$/m);
        if (h4Match) return `<h4 class="md-h4">${inlineMarkdown(h4Match[1])}</h4>`;

        if (/^---+$/.test(trimmed)) return `<hr class="md-hr" />`;

        if (trimmed.startsWith(">")) {
          const quoteContent = trimmed
            .split("\n")
            .map((l) => l.replace(/^>\s?/, ""))
            .join("<br />");
          return `<blockquote class="md-blockquote">${inlineMarkdown(quoteContent)}</blockquote>`;
        }

        const blockLines = trimmed.split("\n");
        if (blockLines.every((l) => /^[-*]\s+/.test(l.trim()))) {
          return `<ul class="md-ul">${blockLines.map((l) => `<li>${inlineMarkdown(l.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
        }
        if (blockLines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
          return `<ol class="md-ol">${blockLines.map((l) => `<li>${inlineMarkdown(l.trim().replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
        }

        return `<p class="md-p">${inlineMarkdown(trimmed)}</p>`;
      })
      .join("") || "<p></p>"
  );
}

/* ================================================================
   SHARED COMPONENTS
   ================================================================ */

function Logo() {
  return (
    <div className="logo">
      Deal<span>Pilot</span>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="nav-icon" aria-hidden="true">
      {children}
    </span>
  );
}

function DisabledButton({
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

  // Helper to test if an array looks like ExtractedOpportunity list
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

  // 1. Check code blocks with json
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

  // 2. Check top-level or embedded raw JSON objects
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
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === "\\") {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") openBraces++;
          else if (char === "}") {
            openBraces--;
            if (openBraces === 0) {
              endIdx = j;
              break;
            }
          }
        }
      }

      if (endIdx !== -1) {
        const jsonCandidate = cleaned.slice(i, endIdx + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (parsed && typeof parsed === "object") {
            let found = false;
            if (Array.isArray(parsed.opportunities)) {
              extractFromArr(parsed.opportunities);
              found = true;
            } else if (parsed.company_name) {
              extractFromArr([parsed]);
              found = true;
            }
            if (found) {
              i = endIdx + 1;
              continue;
            }
          }
        } catch {
          // not valid JSON, keep iterating
        }
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

  // Extract <think>...</think> tag if present
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    think = thinkMatch[1].trim();
    body = content.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
  } else {
    // Extract Reasoning/Thinking header at top if present
    const reasoningMatch = content.match(/^(?:\*\*Thinking:\*\*|\*\*Thought Process:\*\*|\*Thinking:\*|Thinking Process:)\s*\n([\s\S]*?)(?=\n\n|\n#)/i);
    if (reasoningMatch) {
      think = reasoningMatch[1].trim();
      body = content.replace(reasoningMatch[0], "").trim();
    }
  }

  // Parse structured JSON opportunities out of the message body & return extracted data
  const { cleanedText, opportunities } = parseOpportunityJson(body);

  // Extract sources from original content + opportunity source URLs
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

function ThinkingAccordion({ content }: { content: string }) {
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

function SourcesSection({ sources }: { sources: { title: string; url: string }[] }) {
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
          try {
            hostname = new URL(src.url).hostname.replace(/^www\./, "");
          } catch {
            hostname = src.url;
          }
          return (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-card"
              title={src.title || src.url}
            >
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
          const affiliateUrl =
            opp.source_urls && opp.source_urls.length > 0
              ? opp.source_urls[0]
              : null;
          const targetUrl = affiliateUrl || opp.company_url;
          const urlLabel = affiliateUrl
            ? "Affiliate / Program Link ↗"
            : "Website ↗";

          return (
            <div className="chat-opp-card" key={idx}>
              <div className="chat-opp-top">
                <div className="chat-opp-mark">{opp.company_name.slice(0, 1)}</div>
                <div className="chat-opp-title-area">
                  <div className="chat-opp-title-row">
                    <h4>{opp.company_name}</h4>
                    {targetUrl && (
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-opp-link"
                        title={targetUrl}
                      >
                        {urlLabel}
                      </a>
                    )}
                  </div>
                  <span className="chat-opp-signal">{opp.signal_type}</span>
                </div>
                <span
                  className={`chat-opp-confidence ${
                    opp.confidence_level?.toLowerCase() === "high" ? "high" : "med"
                  }`}
                >
                  {opp.confidence_level || "HIGH"}
                </span>
              </div>

            <p className="chat-opp-desc">{opp.opportunity_description}</p>

            {opp.why_relevant && (
              <div className="chat-opp-meta-row">
                <span className="chat-opp-label">Why Relevant:</span>
                <span>{opp.why_relevant}</span>
              </div>
            )}

            {opp.why_now && (
              <div className="chat-opp-meta-row">
                <span className="chat-opp-label">Why Now:</span>
                <span>{opp.why_now}</span>
              </div>
            )}

            {opp.requirements && opp.requirements.length > 0 && (
              <div className="chat-opp-reqs">
                <span className="chat-opp-label">Requirements:</span>
                <ul>
                  {opp.requirements.map((req, rIdx) => (
                    <li key={rIdx}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}

function InlineError({
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

function ActionNavigationButtons({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate?: (page: Page, company?: string) => void;
}) {
  if (!onNavigate) return null;
  const navMatches = Array.from(
    content.matchAll(/\[([^\]]+)\]\(#(research|fit)\/([^)]+)\)/g),
  );
  if (navMatches.length === 0) return null;

  return (
    <div className="chat-action-nav-cards">
      {navMatches.map((m, idx) => {
        const label = m[1];
        const page = m[2] as Page;
        const company = decodeURIComponent(m[3]);
        return (
          <button
            key={idx}
            className="button primary"
            onClick={() => onNavigate(page, company)}
          >
            🔗 {label} →
          </button>
        );
      })}
    </div>
  );
}

function AssistantMessage({
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
      if (page) {
        onNavigate(page, company);
      }
    }
  };

  return (
    <article className="chat-message assistant">
      <div className="message-header">
        <span className="message-author">DealPilot</span>
        <span className="search-powered-badge">⚡ Search powered by Parallel</span>
        <button
          className="copy-msg-btn"
          onClick={handleCopy}
          title="Copy response markdown text"
        >
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
      </div>

      <div className="message-body">
        {think && <ThinkingAccordion content={think} />}
        {opportunities.length > 0 && <ExtractedOpportunitiesCards opportunities={opportunities} />}
        {body && (
          <div
            className="markdown-content"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: markdownHtml(body) }}
          />
        )}
        <ActionNavigationButtons content={content} onNavigate={onNavigate} />
        {sources.length > 0 && <SourcesSection sources={sources} />}
      </div>

      {createdAt && (
        <span className="message-timestamp">{relativeTime(createdAt)}</span>
      )}
    </article>
  );
}

function TypingIndicator({ statusLabel }: { statusLabel?: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = [
    statusLabel || "Researching brand and gathering data...",
    "Querying Parallel Search MCP engine…",
    "Extracting brand signals & opportunity intelligence…",
    "Evaluating creator profile alignment & metrics…",
    "Synthesizing structured response…",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

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
            <span className="thinking-title">
              {statusLabel ? statusLabel : "Thinking process…"}
            </span>
            <span className="live-pulse-dot" />
          </summary>
          <div className="thinking-steps">
            {steps.map((s, idx) => (
              <div
                key={s}
                className={`thinking-step ${
                  idx < stepIndex
                    ? "done"
                    : idx === stepIndex
                    ? "active"
                    : "pending"
                }`}
              >
                <span className="step-status-icon">
                  {idx < stepIndex ? "✓" : idx === stepIndex ? "⚡" : "○"}
                </span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

/* ── Skeleton Loader ──────────────────────────────── */

function SkeletonCard() {
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

function SkeletonStack({ count = 3 }: { count?: number }) {
  return (
    <div className="signal-stack">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* ── Empty State ──────────────────────────────────── */

function EmptyState({
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

/* ── Confirm Modal ──────────────────────────────── */

function ConfirmModal({
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

/* ================================================================
   AUTH SCREEN
   ================================================================ */

function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
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
            (window as any).google.accounts.id.renderButton(container, {
              theme: "outline",
              size: "large",
              width: 380,
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
    try {
      if (mode === "signup")
        await request("/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            username: form.username.trim(),
            email: form.email.trim() || null,
            password: form.password,
          }),
        });
      const login = await request<{ access_token: string }>("/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: form.username.trim(),
          password: form.password,
        }),
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
          <div className="auth-mobile-logo">
            <Logo />
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => { setMode("login"); setError(""); }}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => { setMode("signup"); setError(""); }}
            >
              Create account
            </button>
          </div>

          <div className="auth-header-copy">
            <span className="auth-kicker">
              {mode === "signup" ? "Get started" : "Welcome back"}
            </span>
            <h2 className="auth-title">
              {mode === "signup"
                ? "Create your workspace"
                : "Pick up where you left off"}
            </h2>
            <p className="auth-subtitle">
              {mode === "signup"
                ? "Your profile will power every recommendation."
                : "Your research history and creator profile are ready."}
            </p>
          </div>

          <div id="google-signin-btn-container" className="google-btn-container">
            <button
              type="button"
              className="button google-button"
              disabled={busy}
              onClick={triggerGoogleSignIn}
            >
              <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>

          <div className="auth-divider">
            <span>or with credentials</span>
          </div>

          <form onSubmit={submit} className="auth-form-fields">
            <label className="auth-field">
              <span className="auth-field-label">Username</span>
              <input
                required
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                autoComplete="username"
                placeholder="Enter your username"
              />
            </label>
            {mode === "signup" && (
              <label className="auth-field">
                <span className="auth-field-label">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  autoComplete="email"
                  placeholder="name@example.com"
                />
              </label>
            )}
            <label className="auth-field">
              <span className="auth-field-label">Password</span>
              <input
                required
                minLength={8}
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder="••••••••"
              />
            </label>
            {mode === "signup" && form.password.length > 0 && form.password.length < 8 && (
              <p className="auth-password-hint">
                Password must be at least 8 characters
              </p>
            )}
            <button className="button primary auth-submit-btn" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "signup"
                  ? "Create account"
                  : "Log in"}
            </button>
            {error && (
              <div className="auth-alert" role="alert">
                <span className="auth-alert-icon">✕</span>
                <span className="auth-alert-text">{error}</span>
                <button
                  type="button"
                  className="auth-alert-dismiss"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleGoogleAuth(googleEmail);
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="your.email@gmail.com"
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  style={{ marginBottom: 16 }}
                  autoFocus
                />
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setGoogleModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="button primary" disabled={busy || !googleEmail.trim()}>
                    {busy ? "Signing in…" : "Continue"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </main>
  );
}

/* ================================================================
   PROFILE
   ================================================================ */

function ProfileForm({
  profile,
  onChange,
  onNavigate,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onNavigate?: (page: Page) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const complete = [
    profile.niche && profile.niche.trim() !== "",
    profile.platforms && profile.platforms.length > 0,
    profile.region && profile.region.trim() !== "",
    profile.audience_size !== null && profile.audience_size !== undefined && profile.audience_size > 0,
  ].filter(Boolean).length;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await request<Profile>("/agent/profile", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          ...profile,
          creator_name: profile.creator_name || null,
          niche: profile.niche || null,
          region: profile.region || null,
        }),
      });
      const updated = profileForForm(saved);
      onChange(updated);
      toast.success("Profile saved successfully.");
      if (isProfileComplete(updated) && onNavigate) {
        toast.info("Profile complete! Ready to converse with DealPilot Agent.");
      }
    } catch (err) {
      toastForError(toast, err, "Unable to save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="profile-fields">
      <div className="profile-completion">
        <span>Profile completeness</span>
        <strong className={complete === 4 ? "complete" : ""}>
          {complete}/4 required
        </strong>
      </div>
      <label>
        Creator name
        <input
          value={profile.creator_name || ""}
          onChange={(event) =>
            onChange({ ...profile, creator_name: event.target.value })
          }
          placeholder="Optional"
        />
      </label>
      <label>
        Niche *
        <input
          value={profile.niche || ""}
          onChange={(event) =>
            onChange({ ...profile, niche: event.target.value })
          }
          placeholder="AI, fitness, finance..."
          required
        />
      </label>
      <label>
        Platforms *
        <input
          value={profile.platforms.join(", ")}
          onChange={(event) =>
            onChange({
              ...profile,
              platforms: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder="YouTube, Instagram, TikTok"
          required
        />
      </label>
      <label>
        Region / Location *
        <input
          value={profile.region || ""}
          onChange={(event) =>
            onChange({ ...profile, region: event.target.value })
          }
          placeholder="India, United States..."
          required
        />
      </label>
      <div className="field-row">
        <label>
          Audience size *
          <input
            type="number"
            min="1"
            value={profile.audience_size ?? ""}
            onChange={(event) =>
              onChange({
                ...profile,
                audience_size:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            placeholder="e.g. 50000"
            required
          />
        </label>
        <label>
          Average views
          <input
            type="number"
            min="0"
            value={profile.average_views ?? ""}
            onChange={(event) =>
              onChange({
                ...profile,
                average_views:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <div className="field-row">
        <label>
          Engagement rate (%)
          <input
            type="number"
            min="0"
            step="0.01"
            value={profile.engagement_rate ?? ""}
            onChange={(event) =>
              onChange({
                ...profile,
                engagement_rate:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            placeholder="e.g. 4.2"
          />
        </label>
        <div className="profile-form-hint-box">
          <span className="hint-title">Signal Optimization</span>
          <p>Audience & engagement numbers calibrate deal pricing and sponsor tier suggestions.</p>
        </div>
      </div>
      <div className="profile-form-actions">
        <button className="button primary profile-save-btn" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function ProfilePage({
  profile,
  onChange,
  onNavigate,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onNavigate?: (page: Page) => void;
}) {
  const ready = isProfileComplete(profile);

  return (
    <PageFrame
      eyebrow="Your signal source"
      title="Creator profile"
      subtitle="This profile persists across every conversation and shapes opportunity relevance."
    >
      {ready && (
        <div className="profile-complete-banner">
          <div>
            <span className="banner-badge">✓ Profile Set Up Complete</span>
            <p>Your profile is fully configured. Start chatting with DealPilot Agent to evaluate sponsor opportunities.</p>
          </div>
          {onNavigate && (
            <button
              className="button primary hero-chat-button"
              onClick={() => onNavigate("conversations")}
            >
              Converse with Agent →
            </button>
          )}
        </div>
      )}
      <div className="profile-layout">
        <section className="panel profile-about">
          <span className="profile-avatar large">
            {(profile.creator_name || "A").slice(0, 1).toUpperCase()}
          </span>
          <h3>{profile.creator_name || "Your creator identity"}</h3>
          <p>{profile.niche || "Add your niche to start tailoring signals."}</p>
          <div className="tag-row">
            {profile.platforms.map((platform) => (
              <span className="tag" key={platform}>
                {platform}
              </span>
            ))}
          </div>
          {profile.audience_size && (
            <div style={{ marginTop: 12, fontSize: "12px", color: "var(--muted)" }}>
              Audience size: <strong>{profile.audience_size.toLocaleString()}</strong>
            </div>
          )}
          {ready && onNavigate && (
            <button
              className="button primary"
              style={{ marginTop: 16, width: "100%" }}
              onClick={() => onNavigate("conversations")}
            >
              Converse with Agent →
            </button>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="kicker">Persistent state</span>
              <h3>Edit your profile</h3>
            </div>
          </div>
          <ProfileForm profile={profile} onChange={onChange} onNavigate={onNavigate} />
        </section>
      </div>
    </PageFrame>
  );
}

/* ================================================================
   PAGE FRAME & STAT CARD
   ================================================================ */

function PageFrame({
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

function StatCard({
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

/* ================================================================
   DELETE ACTION (with confirm modal)
   ================================================================ */

function DeleteAction({
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
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
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

/* ================================================================
   SIGNAL CARD
   ================================================================ */

function SignalCard({
  opportunity,
  onResearch,
  onFit,
}: {
  opportunity: Opportunity;
  onResearch?: () => void;
  onFit?: () => void;
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
              className="btn-evaluate-fit"
              onClick={(e) => {
                e.stopPropagation();
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

/* ================================================================
   OVERVIEW PAGE
   ================================================================ */

function OverviewPage({
  profile,
  onNavigate,
  onStartChatAction,
}: {
  profile: Profile;
  onNavigate: (page: Page, company?: string) => void;
  onStartChatAction?: (action: PendingChatAction) => void;
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [researchList, setResearchList] = useState<Research[]>([]);
  const [fitList, setFitList] = useState<FitResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

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
    // Sort by confidence score descending, fallback to confidence_level text
    const scoreA = typeof a.confidence === "number" ? a.confidence : 0;
    const scoreB = typeof b.confidence === "number" ? b.confidence : 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    // High-confidence text comes first
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

  const handleQuickPrompt = () => {
    onNavigate("conversations");
  };

  return (
    <PageFrame
      eyebrow={`${greeting}, ${profile.creator_name || "Creator"}`}
      title="Commercial Deal Desk"
      subtitle="Overview of market signals, brand research, and active commercial opportunities."
    >
      {/* Profile Summary Badge Row */}
      <div className="profile-badge-row">
        {profile.niche && (
          <span className="profile-badge-pill">
            🎯 Niche: <strong>{profile.niche}</strong>
          </span>
        )}
        {profile.platforms && profile.platforms.length > 0 && (
          <span className="profile-badge-pill">
            📱 Platform: <strong>{profile.platforms.join(", ")}</strong>
          </span>
        )}
        {profile.audience_size && (
          <span className="profile-badge-pill">
            👥 Audience: <strong>{profile.audience_size.toLocaleString()}</strong>
          </span>
        )}
        {profile.region && (
          <span className="profile-badge-pill">
            📍 Region: <strong>{profile.region}</strong>
          </span>
        )}
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
          <div>
            <span className="kicker">Needs your attention</span>
            <h2>Top Brand Signal</h2>
          </div>
          <button className="text-button" onClick={() => onNavigate("opportunities")}>
            View all signals ({opportunities.length}) →
          </button>
        </div>

        {loading ? (
          <SkeletonCard />
        ) : featuredSignal ? (
          <SignalCard
            opportunity={featuredSignal}
            onResearch={() => handleAction("research", featuredSignal)}
            onFit={() => handleAction("fit", featuredSignal)}
          />
        ) : (
          <p className="muted">
            Use DealPilot Chat to discover brand partnership opportunities for your niche.
          </p>
        )}
      </section>

      {/* Quick Launchpad Section */}
      <div className="section-heading page-section-heading" style={{ marginTop: 28 }}>
        <div>
          <span className="kicker dark">DealPilot Launchpad</span>
          <h2>What would you like to do?</h2>
        </div>
      </div>
      <div className="launchpad-grid">
        <div className="launchpad-card" onClick={handleQuickPrompt}>
          <div className="launchpad-icon">🚀</div>
          <div className="launchpad-title">Discover New Signals</div>
          <div className="launchpad-desc">Ask AI DealPilot to discover live brand opportunities in your niche.</div>
        </div>

        <div className="launchpad-card" onClick={() => onNavigate("fit")}>
          <div className="launchpad-icon">🎯</div>
          <div className="launchpad-title">Evaluate Brand Fit</div>
          <div className="launchpad-desc">Calculate brand alignment scores and target audience synergy.</div>
        </div>

        <div className="launchpad-card" onClick={() => onNavigate("research")}>
          <div className="launchpad-icon">🔍</div>
          <div className="launchpad-title">Explore Research Hub</div>
          <div className="launchpad-desc">Access financial metrics, campaign budgets, and contact info.</div>
        </div>

        <div className="launchpad-card" onClick={() => onNavigate("profile")}>
          <div className="launchpad-icon">👤</div>
          <div className="launchpad-title">Commercial Profile</div>
          <div className="launchpad-desc">Refine your niche, audience size, and platform channels.</div>
        </div>
      </div>

      {/* Recent Signals Feed */}
      <div className="section-heading page-section-heading" style={{ marginTop: 28 }}>
        <div>
          <span className="kicker dark">Recent Signals</span>
          <h2>Commercial pipeline activity</h2>
        </div>
        <button className="button button-primary" onClick={handleQuickPrompt}>
          Discover new signals 🚀
        </button>
      </div>

      <div className="table-list">
        {loading ? (
          <div style={{ padding: 14 }}>
            <div className="skeleton skeleton-line" style={{ height: 14 }} />
          </div>
        ) : opportunities.length === 0 ? (
          <p className="muted" style={{ padding: 14 }}>
            No opportunity records found. Use the DealPilot Chat to generate brand opportunities.
          </p>
        ) : (
          opportunities.slice(0, 4).map((item) => (
            <div
              key={item.id}
              className="clickable-row"
              onClick={() => setSelectedOpp(item)}
            >
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
                <div>
                  <h2 style={{ margin: 0 }}>{selectedOpp.company_name}</h2>
                  <span className="kicker">{selectedOpp.signal_type}</span>
                </div>
              </div>
              <button className="icon-button" onClick={() => setSelectedOpp(null)}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <span className="confidence green">Confidence: {selectedOpp.confidence_level}</span>
                {selectedOpp.source_urls && selectedOpp.source_urls.length > 0 && (
                  <a
                    href={selectedOpp.source_urls[0]}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: "var(--accent)" }}
                  >
                    🔗 View Source
                  </a>
                )}
              </div>

              <h3>Signal Description</h3>
              <p style={{ color: "var(--fg-muted)", lineHeight: 1.6 }}>{selectedOpp.opportunity_description}</p>

              {selectedOpp.why_relevant && (
                <p style={{ marginTop: 12 }}>
                  💡 Relevance: <strong>{selectedOpp.why_relevant}</strong>
                </p>
              )}

              <div className="hero-action-buttons" style={{ marginTop: 24 }}>
                <button
                  className="hero-action-btn primary"
                  onClick={() => {
                    const opp = selectedOpp!;
                    setSelectedOpp(null);
                    handleAction("research", opp);
                  }}
                >
                  ⚡ Run Deep Research
                </button>
                <button
                  className="hero-action-btn secondary"
                  onClick={() => {
                    const opp = selectedOpp!;
                    setSelectedOpp(null);
                    handleAction("fit", opp);
                  }}
                >
                  🎯 Evaluate Fit
                </button>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}

/* ================================================================
   SIDE DRAWER (SLIDE-OVER PANEL)
   ================================================================ */

function DetailDrawer({
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

/* ================================================================
   OPPORTUNITIES PAGE
   ================================================================ */

const ITEMS_PER_PAGE = 6;

function OpportunitiesPage({
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

  // Search, Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "high" | "direct">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchItems = () => {
    setLoading(true);
    setErrorStr(null);
    void request<Opportunity[]>("/agent/opportunities", {
      headers: authHeaders(),
    })
      .then((result) => {
        setItems(dedupeByCompany(result));
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        const msg = err instanceof Error ? err.message : "Unable to load opportunities";
        setErrorStr(msg);
        toastForError(toast, err, "Unable to load opportunities");
      });
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const select = async (id: number) => {
    try {
      setSelected(
        await request<Opportunity>(`/agent/opportunities/${id}`, {
          headers: authHeaders(),
        }),
      );
    } catch (err) {
      toastForError(toast, err, "Unable to load opportunity");
    }
  };

  const runAction = (type: "research" | "fit", item: Opportunity) => {
    onStartChatAction?.({
      type,
      opportunityId: item.id,
      companyName: item.company_name,
    });
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.opportunity_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.signal_type.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeFilter === "high") {
      return (
        item.confidence_level.toLowerCase().includes("high") ||
        item.confidence_level.toLowerCase().includes("strong")
      );
    }
    if (activeFilter === "direct") {
      return item.is_explicit_opportunity;
    }
    return true;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <PageFrame
      eyebrow="Commercial signals"
      title="Opportunities"
      subtitle="Find timely companies and partnership signals matched to your creator profile."
    >
      <div className="toolbar-controls">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search company, signal, niche..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        <div className="filter-pills">
          <button
            className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("all");
              setCurrentPage(1);
            }}
          >
            All ({items.length})
          </button>
          <button
            className={`filter-pill ${activeFilter === "high" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("high");
              setCurrentPage(1);
            }}
          >
            High Confidence
          </button>
          <button
            className={`filter-pill ${activeFilter === "direct" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("direct");
              setCurrentPage(1);
            }}
          >
            Direct Rec ✓
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonStack count={3} />
      ) : errorStr ? (
        <InlineError message={errorStr} onRetry={fetchItems} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="✦"
          title="No opportunities found"
          description={
            searchQuery || activeFilter !== "all"
              ? "No signals match your current search or filter criteria."
              : "Start a conversation with DealPilot to discover partnership signals for your niche."
          }
        />
      ) : (
        <>
          <div className="signal-stack">
            {paginatedItems.map((item) => (
              <div
                className="unstyled-card"
                role="button"
                tabIndex={0}
                key={item.id}
                onClick={() => void select(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void select(item.id);
                }}
              >
                <SignalCard
                  opportunity={item}
                  onResearch={() => runAction("research", item)}
                  onFit={() => runAction("fit", item)}
                />
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of{" "}
                {filteredItems.length} records
              </span>
              <div className="pagination-buttons">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                >
                  ← Previous
                </button>
                <span className="page-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                >
                  Next →
                </button>
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
                <div className="company-mark">
                  {selected.company_name.slice(0, 1)}
                </div>
                <div>
                  <span className="kicker dark">Opportunity Detail</span>
                  <h3 style={{ margin: 0 }}>{selected.company_name}</h3>
                </div>
              </div>
              <div className="drawer-actions">
                {(selected.source_urls?.[0] || selected.company_url) && (
                  <a
                    className="button secondary"
                    style={{ textDecoration: "none", fontSize: "11px", padding: "6px 12px" }}
                    href={selected.source_urls?.[0] || selected.company_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selected.source_urls?.[0] ? "Program Link ↗" : "Website ↗"}
                  </a>
                )}
                <DeleteAction
                  path={`/agent/opportunities/${selected.id}`}
                  label={selected.company_name}
                  onDeleted={() => {
                    setItems((current) =>
                      current.filter((item) => item.id !== selected.id),
                    );
                    setSelected(null);
                  }}
                />
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>
                  Close ✕
                </button>
              </div>
            </div>

            <div className="drawer-content">
              <div className="detail-grid-layout">
                <div>
                  <strong className="detail-section-title">Overview & Match Rationale</strong>
                  <p className="detail-text">{selected.opportunity_description || selected.why_relevant}</p>
                  {selected.opportunity_description && selected.why_relevant && (
                    <p className="detail-subtext"><strong>Why Relevant:</strong> {selected.why_relevant}</p>
                  )}
                  {selected.why_now && (
                    <p className="detail-subtext"><strong>Why Now Signal:</strong> {selected.why_now}</p>
                  )}
                </div>

                <div>
                  <strong className="detail-section-title">Opportunity Metadata</strong>
                  <div className="detail-meta-tags">
                    <span className="tag">Signal: {selected.signal_type}</span>
                    <span className={`confidence ${selected.confidence_level?.toLowerCase().includes("high") ? "green" : "amber"}`}>
                      {selected.confidence_level} ({formatConfidence(selected.confidence)})
                    </span>
                    {selected.is_explicit_opportunity && (
                      <span className="tag" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--green)" }}>
                        Direct Rec ✓
                      </span>
                    )}
                    {selected.status && <span className="status-pill">{selected.status}</span>}
                  </div>
                  <div style={{ marginTop: 12, fontSize: "11px", color: "var(--muted)" }}>
                    <span>Created: {new Date(selected.created_at).toLocaleDateString()}</span>
                    {selected.updated_at && (
                      <span style={{ marginLeft: 14 }}>Updated: {new Date(selected.updated_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>

              {selected.requirements && selected.requirements.length > 0 && (
                <div className="detail-list" style={{ marginTop: 18 }}>
                  <strong className="detail-section-title">Creator Requirements</strong>
                  <ul>
                    {selected.requirements.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.source_urls && selected.source_urls.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <strong className="detail-section-title">Sources & References</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {selected.source_urls.map((url, idx) => (
                      <a
                        key={idx}
                        className="source-card"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: "none" }}
                      >
                        <span className="source-num">#{idx + 1}</span>
                        <span className="source-title">{url}</span>
                        <span className="source-arrow">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  className="button secondary"
                  onClick={() => {
                    const item = selected;
                    setSelected(null);
                    runAction("research", item);
                  }}
                >
                  Research brand
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    const item = selected;
                    setSelected(null);
                    runAction("fit", item);
                  }}
                >
                  Evaluate fit
                </button>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}

/* ================================================================
   DETAIL LIST
   ================================================================ */

function DetailList({ label, items }: { label: string; items: string[] }) {
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

/* ================================================================
   RESEARCH PAGE
   ================================================================ */

function ResearchPage({
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

  // Search, Filter & Pagination State
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
          const match = deduped.find(
            (i) => i.company_name.toLowerCase() === targetCompany.toLowerCase(),
          );
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

  useEffect(() => {
    fetchItems();
  }, [targetCompany]);

  const select = async (id: number) => {
    try {
      setSelected(
        await request<Research>(`/agent/research/${id}`, {
          headers: authHeaders(),
        }),
      );
    } catch (err) {
      toastForError(toast, err, "Unable to load research");
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === "completed") return item.status === "COMPLETED";
    if (activeFilter === "in_progress") return item.status === "IN_PROGRESS";
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <PageFrame
      eyebrow="Deep brand intelligence"
      title="Research"
      subtitle="Research jobs and completed brand intelligence from your saved opportunities."
    >
      <div className="toolbar-controls">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search company or research summary..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        <div className="filter-pills">
          <button
            className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("all");
              setCurrentPage(1);
            }}
          >
            All ({items.length})
          </button>
          <button
            className={`filter-pill ${activeFilter === "completed" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("completed");
              setCurrentPage(1);
            }}
          >
            Completed
          </button>
          <button
            className={`filter-pill ${activeFilter === "in_progress" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("in_progress");
              setCurrentPage(1);
            }}
          >
            In Progress
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonStack count={2} />
      ) : errorStr ? (
        <InlineError message={errorStr} onRetry={fetchItems} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="◌"
          title="No research records found"
          description={
            searchQuery || activeFilter !== "all"
              ? "No research records match your filter criteria."
              : "Research a brand from the Opportunities page to see detailed intelligence here."
          }
        />
      ) : (
        <>
          <div className="signal-stack">
            {paginatedItems.map((item) => (
              <div
                className="unstyled-card"
                role="button"
                tabIndex={0}
                key={item.id}
                onClick={() => void select(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void select(item.id);
                }}
              >
                <section className="research-card panel">
                  <div className="research-brand">
                    <div className="company-mark large-mark">
                      {item.company_name.slice(0, 1)}
                    </div>
                    <div>
                      <h2>{item.company_name}</h2>
                      <p>{item.summary || "Brand research record"}</p>
                    </div>
                    <span className="status-pill">{item.status}</span>
                  </div>
                  <div className="research-grid">
                    <div>
                      <span className="kicker dark">Research details</span>
                      <p>
                        {item.creator_partnership_signals.slice(0, 2).join(" ") ||
                          "Creator activity and partnership signals."}
                      </p>
                    </div>
                    <div>
                      <span className="kicker dark">Confidence</span>
                      <strong>{formatConfidence(item.confidence)}</strong>
                    </div>
                  </div>
                </section>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of{" "}
                {filteredItems.length} records
              </span>
              <div className="pagination-buttons">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                >
                  ← Previous
                </button>
                <span className="page-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                >
                  Next →
                </button>
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
                <div className="company-mark large-mark">
                  {selected.company_name.slice(0, 1)}
                </div>
                <div>
                  <span className="kicker dark">Brand Intelligence Research</span>
                  <h3 style={{ margin: 0 }}>{selected.company_name}</h3>
                </div>
              </div>
              <div className="drawer-actions">
                {selected.company_url && (
                  <a
                    className="button secondary"
                    style={{ textDecoration: "none", fontSize: "11px", padding: "6px 12px" }}
                    href={selected.company_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website ↗
                  </a>
                )}
                <DeleteAction
                  path={`/agent/research/${selected.id}`}
                  label={selected.company_name}
                  onDeleted={() => {
                    setItems((current) =>
                      current.filter((item) => item.id !== selected.id),
                    );
                    setSelected(null);
                  }}
                />
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>
                  Close ✕
                </button>
              </div>
            </div>

            <div className="drawer-content">
              <div>
                <strong className="detail-section-title">Executive Summary</strong>
                <p className="detail-text">{selected.summary || "No summary available."}</p>
              </div>

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
                  <span style={{ marginLeft: 14 }}>
                    Confidence: <strong>{formatConfidence(selected.confidence)}</strong>
                  </span>
                  <span style={{ marginLeft: 14 }}>
                    Updated: {new Date(selected.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    const brand = selected.company_name;
                    const researchId = selected.id;
                    setSelected(null);
                    onStartChatAction?.({
                      type: "fit",
                      researchId,
                      companyName: brand,
                    });
                  }}
                >
                  Evaluate fit for {selected.company_name}
                </button>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}

/* ================================================================
   FIT PAGE
   ================================================================ */

function FitPage({ targetCompany }: { targetCompany?: string | null }) {
  const toast = useToast();
  const [items, setItems] = useState<FitResult[]>([]);
  const [selected, setSelected] = useState<FitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStr, setErrorStr] = useState<string | null>(null);

  // Search, Filter & Pagination State
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
          const match = deduped.find(
            (i) => i.company_name.toLowerCase() === targetCompany.toLowerCase(),
          );
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

  useEffect(() => {
    fetchItems();
  }, [targetCompany]);

  const select = async (id: number) => {
    try {
      setSelected(
        await request<FitResult>(`/agent/fit/${id}`, {
          headers: authHeaders(),
        }),
      );
    } catch (err) {
      toastForError(toast, err, "Unable to load fit analysis");
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.recommendation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reasoning.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeFilter === "high") return item.overall_score >= 80;
    if (activeFilter === "moderate") return item.overall_score < 80;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <PageFrame
      eyebrow="Creator ↔ brand"
      title="Fit analysis"
      subtitle="Compare audience, content, market, partnership, and timing fit."
    >
      <div className="toolbar-controls">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search company, recommendation, or reasoning..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        <div className="filter-pills">
          <button
            className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("all");
              setCurrentPage(1);
            }}
          >
            All ({items.length})
          </button>
          <button
            className={`filter-pill ${activeFilter === "high" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("high");
              setCurrentPage(1);
            }}
          >
            Strong Fit (80%+)
          </button>
          <button
            className={`filter-pill ${activeFilter === "moderate" ? "active" : ""}`}
            onClick={() => {
              setActiveFilter("moderate");
              setCurrentPage(1);
            }}
          >
            Moderate / Alignment
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonStack count={2} />
      ) : errorStr ? (
        <InlineError message={errorStr} onRetry={fetchItems} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="◒"
          title="No fit analyses found"
          description={
            searchQuery || activeFilter !== "all"
              ? "No fit records match your current filter criteria."
              : "Evaluate fit for a researched opportunity to see your compatibility scores here."
          }
        />
      ) : (
        <>
          <div className="signal-stack">
            {paginatedItems.map((item) => (
              <div
                className="unstyled-card"
                role="button"
                tabIndex={0}
                key={item.id}
                onClick={() => void select(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void select(item.id);
                }}
              >
                <section className="fit-hero panel">
                  <div className="fit-score">
                    {Math.round(item.overall_score)}
                  </div>
                  <div>
                    <span className="kicker dark">{item.recommendation}</span>
                    <h2>{item.company_name}</h2>
                    <div className="fit-bars">
                      <span>
                        Audience fit{" "}
                        <i style={{ width: `${item.audience_fit}%` }} />
                      </span>
                      <span>
                        Content fit{" "}
                        <i style={{ width: `${item.content_fit}%` }} />
                      </span>
                      <span>
                        Market fit{" "}
                        <i style={{ width: `${item.market_fit}%` }} />
                      </span>
                      <span>
                        Timing fit{" "}
                        <i style={{ width: `${item.timing_fit}%` }} />
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of{" "}
                {filteredItems.length} records
              </span>
              <div className="pagination-buttons">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                >
                  ← Previous
                </button>
                <span className="page-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                >
                  Next →
                </button>
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
                <div className="fit-score" style={{ width: 64, height: 64, fontSize: 20, borderWidth: 4 }}>
                  {Math.round(selected.overall_score)}
                </div>
                <div>
                  <span className="kicker dark">{selected.recommendation}</span>
                  <h3 style={{ margin: 0 }}>{selected.company_name} Compatibility</h3>
                </div>
              </div>
              <div className="drawer-actions">
                <DeleteAction
                  path={`/agent/fit/${selected.id}`}
                  label={selected.company_name}
                  onDeleted={() => {
                    setItems((current) =>
                      current.filter((item) => item.id !== selected.id),
                    );
                    setSelected(null);
                  }}
                />
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>
                  Close ✕
                </button>
              </div>
            </div>

            <div className="drawer-content">
              <div>
                <strong className="detail-section-title">Fit Breakdown Scores</strong>
                <div className="fit-bars" style={{ marginTop: 10 }}>
                  <span>
                    Audience Fit ({Math.round(selected.audience_fit)}%)
                    <i style={{ width: `${selected.audience_fit}%` }} />
                  </span>
                  <span>
                    Content Fit ({Math.round(selected.content_fit)}%)
                    <i style={{ width: `${selected.content_fit}%` }} />
                  </span>
                  <span>
                    Market Fit ({Math.round(selected.market_fit)}%)
                    <i style={{ width: `${selected.market_fit}%` }} />
                  </span>
                  <span>
                    Partnership Fit ({Math.round(selected.partnership_fit)}%)
                    <i style={{ width: `${selected.partnership_fit}%` }} />
                  </span>
                  <span>
                    Timing Fit ({Math.round(selected.timing_fit)}%)
                    <i style={{ width: `${selected.timing_fit}%` }} />
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <strong className="detail-section-title">AI Compatibility Rationale</strong>
                <p className="detail-text">{selected.reasoning}</p>
              </div>

              <div className="two-column" style={{ marginTop: 18 }}>
                <div className="panel" style={{ padding: 16 }}>
                  <strong className="detail-section-title" style={{ color: "var(--green)" }}>✓ Key Strengths</strong>
                  <DetailList label="" items={selected.strengths} />
                </div>
                <div className="panel" style={{ padding: 16 }}>
                  <strong className="detail-section-title" style={{ color: "var(--amber)" }}>⚠ Potential Concerns</strong>
                  <DetailList label="" items={selected.concerns} />
                </div>
              </div>

              <div style={{ marginTop: 20, fontSize: "11px", color: "var(--muted)", textAlign: "right" }}>
                <span>Evaluated: {new Date(selected.updated_at || selected.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </PageFrame>
  );
}

/* ================================================================
   CHAT PAGE
   ================================================================ */

const SUGGESTIONS = [
  "Find sponsors for my niche",
  "Research a trending brand",
  "Evaluate a partnership opportunity",
  "What deals should I pursue this week?",
];

function ChatPage({
  conversations,
  onRefresh,
  pendingAction,
  onClearPendingAction,
  onNavigate,
  globalBusyRef,
}: {
  conversations: Conversation[];
  onRefresh: () => void;
  pendingAction?: PendingChatAction;
  onClearPendingAction?: () => void;
  onNavigate?: (page: Page, company?: string) => void;
  globalBusyRef?: React.MutableRefObject<boolean>;
}) {
  const toast = useToast();
  const [session, setSession] = useState<string | null>(
    localStorage.getItem(storage.session),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // busyRef mirrors busy state to avoid stale closures in useEffect
  const busyRef = useRef(false);
  const [mobileRecentsOpen, setMobileRecentsOpen] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setIsBusy = (val: boolean) => {
    busyRef.current = val;
    if (globalBusyRef) globalBusyRef.current = val;
    setBusy(val);
  };

  // Listen for busy-warning event dispatched from app level (cross-page guard)
  useEffect(() => {
    const handler = () => {
      toast.warning("A request is already in progress. Please wait for it to complete before starting another.");
    };
    window.addEventListener("dealpilot:busy-warning", handler);
    return () => window.removeEventListener("dealpilot:busy-warning", handler);
  }, []);

  const scrollToBottom = () => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy]);

  useEffect(() => {
    if (!pendingAction) return;
    // Use busyRef to avoid stale closure
    if (busyRef.current) {
      toast.warning("A request is already in progress. Please wait for it to complete before starting another.");
      onClearPendingAction?.();
      return;
    }
    const action = pendingAction;
    onClearPendingAction?.();

    const executePendingAction = async () => {
      setIsBusy(true);
      // Clear old messages and show typing indicator immediately
      setMessages([]);
      const actionLabel = action.type === "research"
        ? `Researching ${action.companyName}…`
        : `Evaluating fit for ${action.companyName}…`;
      setStatusLabel(actionLabel);

      try {
        const created = await request<{ session_id: string }>(
          "/agent/sessions",
          { method: "POST", headers: authHeaders() },
        );
        const activeSessionId = created.session_id;
        setSession(activeSessionId);
        localStorage.setItem(storage.session, activeSessionId);

        const userPrompt =
          action.type === "research"
            ? `Research brand: ${action.companyName}`
            : `Evaluate fit for brand: ${action.companyName}`;

        setMessages([
          { role: "user", content: userPrompt, created_at: new Date().toISOString() },
        ]);

        await request(`/agent/sessions/${encodeURIComponent(activeSessionId)}/custom_message`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ role: "user", content: userPrompt }),
        }).catch(() => {});

        let assistantContent = "";
        if (action.type === "research" && action.opportunityId) {
          setStatusLabel(`Researching ${action.companyName} — gathering brand signals…`);
          const res = await request<Research>(
            `/agent/opportunities/${action.opportunityId}/research?session_id=${encodeURIComponent(activeSessionId)}`,
            { method: "POST", headers: authHeaders() },
          );
          assistantContent =
            `### ◌ Brand Intelligence Research: ${res.company_name}\n\n` +
            `**Executive Summary:** ${res.summary || "Brand research job completed successfully."}\n\n` +
            `**Products & Offerings:** ${(res.products || []).join(", ") || "N/A"}\n` +
            `**Target Markets:** ${(res.target_markets || []).join(", ") || "N/A"}\n` +
            `**Partnership Signals:** ${(res.creator_partnership_signals || []).join("; ") || "N/A"}\n\n` +
            `🔗 [View full Research Page for ${res.company_name}](#research/${encodeURIComponent(res.company_name)})`;
        } else if (action.type === "fit" && action.opportunityId) {
          setStatusLabel(`Evaluating brand fit for ${action.companyName}…`);
          const res = await request<FitResult>(
            `/agent/opportunities/${action.opportunityId}/fit?session_id=${encodeURIComponent(activeSessionId)}`,
            { method: "POST", headers: authHeaders() },
          );
          assistantContent =
            `### ◒ Creator-Brand Fit Analysis: ${res.company_name}\n\n` +
            `**Overall Fit Score:** ${Math.round(res.overall_score)}%\n` +
            `**Recommendation:** ${res.recommendation}\n\n` +
            `**Reasoning:** ${res.reasoning}\n\n` +
            `**Key Strengths:** ${(res.strengths || []).join(", ") || "N/A"}\n\n` +
            `🔗 [View full Fit Analysis Page for ${res.company_name}](#fit/${encodeURIComponent(res.company_name)})`;
        } else if (action.type === "fit" && action.researchId) {
          setStatusLabel(`Evaluating brand fit for ${action.companyName}…`);
          const res = await request<FitResult>(
            `/agent/research/${action.researchId}/fit?session_id=${encodeURIComponent(activeSessionId)}`,
            { method: "POST", headers: authHeaders() },
          );
          assistantContent =
            `### ◒ Creator-Brand Fit Analysis: ${res.company_name}\n\n` +
            `**Overall Fit Score:** ${Math.round(res.overall_score)}%\n` +
            `**Recommendation:** ${res.recommendation}\n\n` +
            `**Reasoning:** ${res.reasoning}\n\n` +
            `**Key Strengths:** ${(res.strengths || []).join(", ") || "N/A"}\n\n` +
            `🔗 [View full Fit Analysis Page for ${res.company_name}](#fit/${encodeURIComponent(res.company_name)})`;
        }

        if (assistantContent) {
          setMessages((current) => [
            ...current,
            { role: "assistant", content: assistantContent, created_at: new Date().toISOString() },
          ]);
          await request(`/agent/sessions/${encodeURIComponent(activeSessionId)}/custom_message`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ role: "assistant", content: assistantContent }),
          }).catch(() => {});
          setSessionTitles((prev) => ({
            ...prev,
            [activeSessionId]: userPrompt,
          }));
          onRefresh();
        }
      } catch (err) {
        toastForError(toast, err, `${action.type === "research" ? "Research" : "Fit evaluation"} failed`);
      } finally {
        setIsBusy(false);
        setStatusLabel("");
      }
    };

    void executePendingAction();
  }, [pendingAction]);

  const loadMessages = async (id: string | null) => {
    if (!id) {
      setMessages([]);
      return;
    }
    try {
      const msgs = await request<Message[]>(
        `/agent/sessions/${encodeURIComponent(id)}/messages`,
        { headers: authHeaders() },
      );
      setMessages(msgs);
      const firstUserMsg = msgs.find((m) => m.role === "user");
      if (firstUserMsg && firstUserMsg.content) {
        setSessionTitles((prev) => ({
          ...prev,
          [id]: firstUserMsg.content,
        }));
      }
    } catch {
      localStorage.removeItem(storage.session);
      setSession(null);
    }
  };

  useEffect(() => {
    void loadMessages(localStorage.getItem(storage.session));
  }, []);

  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    const unmapped = conversations.filter((c) => !sessionTitles[c.session_id]);
    if (unmapped.length === 0) return;

    void (async () => {
      for (const conv of unmapped) {
        try {
          const msgs = await request<Message[]>(
            `/agent/sessions/${encodeURIComponent(conv.session_id)}/messages`,
            { headers: authHeaders() },
          );
          const firstUserMsg = msgs.find((m) => m.role === "user");
          if (firstUserMsg && firstUserMsg.content) {
            setSessionTitles((prev) => ({
              ...prev,
              [conv.session_id]: firstUserMsg.content,
            }));
          }
        } catch {
          // Ignore failed session load
        }
      }
    })();
  }, [conversations]);

  const select = (id: string) => {
    if (busyRef.current) {
      toast.warning("A research or fit evaluation is currently in progress. Please wait for it to complete.");
      return;
    }
    localStorage.setItem(storage.session, id);
    setSession(id);
    setMobileRecentsOpen(false);
    void loadMessages(id);
  };

  const newChat = () => {
    if (busyRef.current) {
      toast.warning("A research or fit evaluation is currently in progress. Please wait for it to complete.");
      return;
    }
    localStorage.removeItem(storage.session);
    setSession(null);
    setMessages([]);
    setMobileRecentsOpen(false);
    toast.info("New conversation started.");
  };

  const deleteSession = async (id: string) => {
    try {
      await request<void>(`/agent/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      toast.success("Conversation deleted.");
      if (session === id) {
        newChat();
      }
      onRefresh();
    } catch (err) {
      toastForError(toast, err, "Unable to delete conversation");
    }
  };

  const send = async (value: string) => {
    if (busyRef.current) {
      toast.warning("A request is already in progress. Please wait for it to complete before starting another.");
      return;
    }
    const message = value.trim();
    if (!message) return;
    setInput("");
    setIsBusy(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setMessages((current) => [
      ...current,
      { role: "user", content: message, created_at: new Date().toISOString() },
    ]);

    try {
      let id = session;
      if (!id) {
        const created = await request<{ session_id: string }>(
          "/agent/sessions",
          { method: "POST", headers: authHeaders() },
        );
        id = created.session_id;
        setSession(id);
        localStorage.setItem(storage.session, id);
      }
      const result = await request<{ response: ResponsePayload }>(
        `/agent/sessions/${encodeURIComponent(id)}/messages`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ message }),
        },
      );
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: responseText(result.response),
          created_at: new Date().toISOString(),
        },
      ]);
      setSessionTitles((prev) => ({
        ...prev,
        [id]: message,
      }));
      onRefresh();
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Unable to reach DealPilot. Please try again.";
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `__ERROR__${errMsg}`,
          created_at: new Date().toISOString(),
        },
      ]);
      toastForError(toast, err, "Message failed");
    } finally {
      setIsBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const snippet = (sessionTitles[c.session_id] || "").toLowerCase();
    const dateStr = new Date(c.created_at).toLocaleDateString().toLowerCase();
    return (
      c.session_id.toLowerCase().includes(q) ||
      dateStr.includes(q) ||
      snippet.includes(q)
    );
  });

  return (
    <div className="chat-layout-wrapper">
      {mobileRecentsOpen && (
        <div
          className="chat-recents-backdrop"
          onClick={() => setMobileRecentsOpen(false)}
        />
      )}
      <aside className={`chat-recents-sidebar ${mobileRecentsOpen ? "mobile-open" : ""}`}>
        <div className="recents-top-actions">
          <div className="recents-header-mobile">
            <span>Recent Chats</span>
            <button
              className="clear-search-btn"
              onClick={() => setMobileRecentsOpen(false)}
            >
              ✕
            </button>
          </div>
          <button className="new-chat-btn" onClick={newChat}>
            <span className="icon">✏</span>
            <span>New chat</span>
          </button>

          <div className="search-chats-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="recents-header">
          <span>Recents</span>
          <span className="recents-count">{filteredConversations.length}</span>
        </div>

        <div className="recents-list">
          {filteredConversations.length === 0 ? (
            <div className="empty-recents">No recent chats</div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conv.session_id === session;
              const dateObj = new Date(conv.created_at);
              const formattedDate = dateObj.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const rawTitle = sessionTitles[conv.session_id];
              const titleSnippet = rawTitle
                ? rawTitle.length > 26
                  ? rawTitle.slice(0, 26) + "…"
                  : rawTitle
                : `Chat · ${formattedDate}`;

              return (
                <div
                  key={conv.session_id}
                  className={`recent-chat-item ${isActive ? "active" : ""}`}
                  onClick={() => select(conv.session_id)}
                >
                  <span className="chat-icon">💬</span>
                  <div className="chat-info">
                    <span className="chat-title" title={rawTitle || "Chat session"}>
                      {titleSnippet}
                    </span>
                    <span className="chat-date">{formattedDate}</span>
                  </div>
                  <button
                    className="delete-chat-btn"
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteSession(conv.session_id);
                    }}
                  >
                    🗑
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="chat-main-pane">
        <div className="chat-toolbar">
          <div>
            <span className="kicker dark">Conversation workspace</span>
            <h2>Ask DealPilot</h2>
          </div>
          <button
            className="mobile-recents-toggle-btn button secondary"
            onClick={() => setMobileRecentsOpen(true)}
          >
            💬 Recents ({conversations.length})
          </button>
        </div>

        <div className="chat-history" ref={historyRef}>
          {messages.length === 0 && !busy ? (
            <div className="chat-empty">
              <span className="kicker dark">Your deal desk</span>
              <h1>What should we explore next?</h1>
              <p>
                Ask about sponsors, brands, creator campaigns, affiliate programs,
                or partnership fit.
              </p>
              <div className="suggestion-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={() => void send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => {
                const isError =
                  message.role === "assistant" &&
                  message.content.startsWith("__ERROR__");
                const displayContent = isError
                  ? message.content.replace("__ERROR__", "")
                  : message.content;

                if (isError) {
                  return (
                    <div
                      className="chat-error-bubble"
                      key={`${message.created_at || index}-${index}`}
                    >
                      <span className="message-author">DealPilot</span>
                      <div className="message-body">
                        <span className="chat-error-icon">✕</span>
                        <div>{displayContent}</div>
                      </div>
                      {message.created_at && (
                        <span className="message-timestamp">
                          {relativeTime(message.created_at)}
                        </span>
                      )}
                    </div>
                  );
                }

                if (message.role === "assistant") {
                  return (
                    <AssistantMessage
                      key={`${message.created_at || index}-${index}`}
                      content={message.content}
                      createdAt={message.created_at}
                      onNavigate={onNavigate}
                    />
                  );
                }

                return (
                  <article
                    className="chat-message user"
                    key={`${message.created_at || index}-${index}`}
                  >
                    <div className="message-header">
                      <span className="message-author">You</span>
                    </div>
                    <div className="message-body">{message.content}</div>
                    {message.created_at && (
                      <span className="message-timestamp">
                        {relativeTime(message.created_at)}
                      </span>
                    )}
                  </article>
                );
              })}
              {busy && <TypingIndicator statusLabel={statusLabel} />}
            </>
          )}
          {/* Show typing indicator even when no messages yet (pending action started) */}
          {busy && messages.length === 0 && (
            <div style={{ padding: "0 24px" }}>
              <TypingIndicator statusLabel={statusLabel} />
            </div>
          )}
        </div>

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            placeholder="Ask DealPilot anything… (Shift+Enter for new line)"
            rows={1}
          />
          <button className="send-button" disabled={!input.trim()}>
            ↑
          </button>
        </form>
      </main>
    </div>
  );
}

/* ================================================================
   SETTINGS PAGE
   ================================================================ */

function SettingsPage({ user }: { user: User }) {
  const toast = useToast();

  return (
    <PageFrame
      eyebrow="Workspace controls"
      title="Settings"
      subtitle="Manage your DealPilot account, intelligence preferences, and workspace configuration."
    >
      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="settings-card-header">
            <span className="kicker">Account & Identity</span>
            <h3>Creator Account</h3>
          </div>
          <div className="settings-user-preview">
            <div className="settings-avatar">
              {(user.username || "U").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="settings-user-name">@{user.username}</div>
              <div className="settings-user-role">DealPilot Creator Workspace</div>
            </div>
          </div>
          <div className="settings-form">
            <label>
              Username
              <input disabled value={user.username} />
            </label>
            <label>
              Email address
              <input disabled value={user.email || "No email linked (Local Workspace)"} />
            </label>
            <label>
              Account status
              <input disabled value="Active • Creator Deal Desk Initialized" />
            </label>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card-header">
            <span className="kicker">Intelligence & Deals</span>
            <h3>DealDesk Preferences</h3>
          </div>
          <div className="settings-form">
            <label>
              Target Currency
              <input disabled value="USD ($) • Normalized Global Deals" />
            </label>
            <label>
              Intelligence Engine
              <input disabled value="DealPilot Multi-Agent (Director + Opportunity + Research + Fit)" />
            </label>
            <label>
              Signal Source
              <input disabled value="Live Commercial Radar & Creator Direct Programs" />
            </label>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => toast.info("Cache refreshed with latest signals.")}
            >
              Refresh Workspace Cache
            </button>
          </div>
        </section>

        <section className="panel settings-card settings-danger-zone">
          <div className="settings-card-header">
            <span className="kicker danger-kicker">Security & Access</span>
            <h3>Session Management</h3>
          </div>
          <p className="settings-danger-desc">
            Manage your account credentials and active authentication sessions.
          </p>
          <div className="settings-actions">
            <DisabledButton>Change password</DisabledButton>
            <DisabledButton>Sign out other sessions</DisabledButton>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

/* ================================================================
   SIDEBAR
   ================================================================ */

function Sidebar({
  page,
  setPage,
  user,
  profile,
  onLogout,
  onProfile,
}: {
  page: Page;
  setPage: (page: Page) => void;
  user: User;
  profile: Profile;
  onLogout: () => void;
  onProfile: () => void;
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
          <button
            className={page === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setPage(item.id)}
          >
            <Icon>{item.icon}</Icon>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <nav className="secondary-nav">
        <button
          className={page === "profile" ? "active" : ""}
          onClick={onProfile}
        >
          <Icon>◎</Icon>Profile
        </button>
        <button
          className={page === "settings" ? "active" : ""}
          onClick={() => setPage("settings")}
        >
          <Icon>⚙</Icon>Settings
        </button>
      </nav>
      <button className="user-chip" onClick={onProfile}>
        <span>
          {(profile.creator_name || user.username).slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{profile.creator_name || user.username}</strong>
          <small>{profile.niche || "Complete profile"}</small>
        </div>
        <b>⌄</b>
      </button>
      <button className="sidebar-logout" onClick={onLogout}>
        Log out
      </button>
    </aside>
  );
}

/* ================================================================
   APP SHELL
   ================================================================ */

function AppShell({
  user,
  profile,
  setProfile,
  onLogout,
}: {
  user: User;
  profile: Profile;
  setProfile: (profile: Profile) => void;
  onLogout: () => void;
}) {
  const toast = useToast();
  const [page, setPageState] = useState<Page>(() => {
    const saved = localStorage.getItem(storage.page) as Page | null;
    const validPages: Page[] = [
      "overview",
      "opportunities",
      "research",
      "fit",
      "conversations",
      "profile",
      "settings",
    ];
    if (saved && validPages.includes(saved)) {
      return saved;
    }
    return isProfileComplete(profile) ? "conversations" : "profile";
  });

  const setPage = (newPage: Page) => {
    localStorage.setItem(storage.page, newPage);
    setPageState(newPage);
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [targetResearchCompany, setTargetResearchCompany] = useState<string | null>(null);
  const [targetFitCompany, setTargetFitCompany] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pendingChatAction, setPendingChatAction] = useState<PendingChatAction>(null);
  // App-level ref to track if a chat action is currently being processed
  // This prevents double-clicks or cross-page concurrent action initiations
  const globalBusyRef = useRef(false);

  const handleStartChatAction = (action: PendingChatAction) => {
    if (globalBusyRef.current) {
      toast.warning("A research or fit evaluation is currently in progress. Please wait for it to complete.");
      return;
    }
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
    if (targetPage === "research" && company) {
      setTargetResearchCompany(company);
    }
    if (targetPage === "fit" && company) {
      setTargetFitCompany(company);
    }
    setPage(targetPage);
  };

  const refreshConversations = async () => {
    try {
      setConversations(
        await request<Conversation[]>("/agent/sessions", {
          headers: authHeaders(),
        }),
      );
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshConversations();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  let content: ReactNode;
  if (page === "overview")
    content = (
      <OverviewPage
        profile={profile}
        onNavigate={handleNavigate}
        onStartChatAction={handleStartChatAction}
      />
    );
  if (page === "opportunities")
    content = (
      <OpportunitiesPage
        onNavigate={handleNavigate}
        onStartChatAction={handleStartChatAction}
      />
    );
  if (page === "research")
    content = (
      <ResearchPage
        targetCompany={targetResearchCompany}
        onNavigate={handleNavigate}
        onStartChatAction={handleStartChatAction}
      />
    );
  if (page === "fit")
    content = <FitPage targetCompany={targetFitCompany} />;
  if (page === "conversations")
    content = (
      <ChatPage
        conversations={conversations}
        onRefresh={refreshConversations}
        pendingAction={pendingChatAction}
        onClearPendingAction={() => setPendingChatAction(null)}
        onNavigate={handleNavigate}
        globalBusyRef={globalBusyRef}
      />
    );
  if (page === "profile")
    content = (
      <ProfilePage
        profile={profile}
        onChange={setProfile}
        onNavigate={handleNavigate}
      />
    );
  if (page === "settings") content = <SettingsPage user={user} />;

  const isTailored = isProfileComplete(profile);

  return (
    <div className="product-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        user={user}
        profile={profile}
        onLogout={onLogout}
        onProfile={() => setPage("profile")}
      />
      <main className="product-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-nav-toggle icon-button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <div className="topbar-title">
              <span className="status-dot" />
              <span className="topbar-brand-label">DealPilot workspace</span>
              {isTailored && (
                <span className="status-badge-tailored">AI Tailored ✓</span>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <button
              className="top-avatar"
              onClick={() => setPage("profile")}
              aria-label="Creator profile"
              title="Creator profile"
            >
              {(profile.creator_name || user.username)
                .slice(0, 1)
                .toUpperCase()}
            </button>
          </div>
        </header>


        {mobileNavOpen && (
          <div
            className="mobile-nav-backdrop"
            onClick={() => setMobileNavOpen(false)}
          >
            <div
              className="mobile-nav-drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mobile-drawer-header">
                <Logo />
                <button
                  className="icon-button close-drawer-btn"
                  onClick={() => setMobileNavOpen(false)}
                >
                  ✕
                </button>
              </div>
              <nav className="mobile-drawer-nav">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    className={page === item.id ? "active" : ""}
                    onClick={() => {
                      setPage(item.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    <Icon>{item.icon}</Icon>
                    {item.label}
                  </button>
                ))}
                <button
                  className={page === "profile" ? "active" : ""}
                  onClick={() => {
                    setPage("profile");
                    setMobileNavOpen(false);
                  }}
                >
                  <Icon>◎</Icon> Profile
                </button>
                <button
                  className={page === "settings" ? "active" : ""}
                  onClick={() => {
                    setPage("settings");
                    setMobileNavOpen(false);
                  }}
                >
                  <Icon>⚙</Icon> Settings
                </button>
              </nav>
              <div className="mobile-drawer-footer">
                <div className="user-chip-mobile">
                  <span>
                    {(profile.creator_name || user.username)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>{profile.creator_name || user.username}</strong>
                    <small>{profile.niche || "Creator profile"}</small>
                  </div>
                </div>
                <button
                  className="button secondary logout-btn-mobile"
                  onClick={onLogout}
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}

        {content}
      </main>
    </div>
  );
}

/* ================================================================
   APP ROOT
   ================================================================ */

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
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setProfile(emptyProfile);
  }, []);

  // Auto-logout on 401 from any API call
  useEffect(() => {
    const handler = () => {
      logout();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [logout]);

  const loadProfile = async () => {
    try {
      setProfile(
        profileForForm(
          await request<Profile>("/agent/profile", { headers: authHeaders() }),
        ),
      );
    } catch {
      setProfile(emptyProfile);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!localStorage.getItem(storage.token)) {
        setLoading(false);
        return;
      }
      request<User>("/auth/me", { headers: authHeaders() })
        .then((current) => {
          setUser(current);
          return loadProfile();
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
        ) : (
          <AuthScreen
            onLogin={(current) => {
              setUser(current);
              void loadProfile();
            }}
          />
        )}
      </ToastProvider>
    </ThemeContext.Provider>
  );
}
