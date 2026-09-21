/* ================================================================
   FORMAT UTILITIES
   ================================================================ */

import type { Profile } from "../types";

export const emptyProfile: Profile = {
  creator_name: "",
  niche: "",
  platforms: [],
  region: "",
  audience: [],
  audience_description: "",
  audience_size: null,
  average_views: null,
  engagement_rate: null,
};

export function formatConfidence(c?: number | null): string {
  if (c == null || Number.isNaN(c)) return "—";
  const pct = c <= 1.0 ? c * 100 : c;
  return `${Math.round(pct)}%`;
}

export function isProfileComplete(p: Profile): boolean {
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

export function profileForForm(profile: Profile): Profile {
  const fallbackAudience = profile.audience_description
    ?.match(/(?:^|\n)Audience: ([^\n]+)/)?.[1]
    ?.split(", ")
    .filter(Boolean) || [];

  return {
    ...profile,
    creator_name: profile.creator_name || "",
    niche: profile.niche || "",
    region: profile.region || "",
    platforms: profile.platforms || [],
    audience:
      profile.audience && profile.audience.length > 0
        ? profile.audience
        : fallbackAudience,
  };
}

/**
 * Return the single most-recently-updated record per company_name.
 * The backend already does this at query time, but this guard handles
 * any stale data that may have arrived before the migration ran.
 */
export function dedupeByCompany<T extends { company_name: string; updated_at: string }>(
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

export function relativeTime(dateString: string | undefined): string {
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

export const ITEMS_PER_PAGE = 6;
