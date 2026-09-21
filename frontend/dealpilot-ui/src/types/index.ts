/* ================================================================
   TYPES
   ================================================================ */

export type User = { username: string; email?: string | null };

export type Profile = {
  creator_name: string | null;
  niche: string | null;
  platforms: string[];
  region: string | null;
  languages?: string[];
  audience?: string[];
  audience_description?: string | null;
  audience_size: number | null;
  average_views: number | null;
  engagement_rate: number | null;
};

export type Conversation = { session_id: string; created_at: string };

export type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export type ResponsePayload = { text?: string; markdown?: string; links?: string[] };

export type Opportunity = {
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

export type Research = {
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

export type FitResult = {
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

export type PendingChatAction = {
  type: "research" | "fit";
  opportunityId?: number;
  researchId?: number;
  companyName: string;
} | null;

export type ToastSeverity = "success" | "error" | "warning" | "info";

export type Toast = {
  id: number;
  severity: ToastSeverity;
  message: string;
  duration: number;
  exiting?: boolean;
};

export type Page =
  | "overview"
  | "opportunities"
  | "research"
  | "fit"
  | "conversations"
  | "profile"
  | "settings";

export type Theme = "dark" | "light";
