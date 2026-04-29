import he from "he";
import type { AlertSeverity, DiffFile, DiffLine, PullRequestSummary, SecurityAlert, SecuritySortMode } from "../types.js";
import type { AccessibleRepo } from "../github.js";
import type { RepoSortMode, RepoSummary } from "./types.js";

export const PR_VIEWS = ["myPullRequests", "needsMyReview", "waitingOnOthers", "readyToMerge", "watchedAuthor"] as const;
export const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
export const COMMON_WATCHED_AUTHORS = ["dependabot[bot]"];

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/\r/g, "")
    .replace(/<details[^>]*>/gi, "").replace(/<\/details>/gi, "")
    .replace(/<summary[^>]*>(.*?)<\/summary>/gis, "[$1]")
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis, "\n## $1\n")
    .replace(/<li[^>]*>/gi, "\n  - ").replace(/<\/li>/gi, "")
    .replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, "")
    .replace(/<p[^>]*>/gi, "\n").replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, "*$1*")
    .replace(/<em[^>]*>(.*?)<\/em>/gis, "_$1_")
    .replace(/<code[^>]*>(.*?)<\/code>/gis, "`$1`")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, "$2 ($1)")
    .replace(/<blockquote[^>]*>/gi, "\n> ").replace(/<\/blockquote>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return he.decode(stripped);
}

export function formatCiStatus(pr: PullRequestSummary): { symbol: string; color: string } {
  const { passing, failing, pending } = pr.checkCounts;
  const total = passing + failing + pending;
  if (total === 0) {
    switch (pr.ciStatus) {
      case "SUCCESS": return { symbol: "✓", color: "green" };
      case "FAILURE": case "ERROR": return { symbol: "✗", color: "red" };
      case "PENDING": case "EXPECTED": return { symbol: "●", color: "yellow" };
      default: return { symbol: "-", color: "gray" };
    }
  }
  // Always return a compact ≤2 char symbol — show worst state first so it fits in the list column.
  // Full check detail is available in the PR detail panel.
  if (failing > 0) return { symbol: failing > 9 ? "✗!" : `✗${failing}`, color: "red" };
  if (pending > 0) return { symbol: "~", color: "yellow" };
  return { symbol: "✓", color: "green" };
}

export function sortSecurityAlerts(alerts: SecurityAlert[], mode: SecuritySortMode): SecurityAlert[] {
  return [...alerts].sort((a, b) => {
    if (mode === "severity") {
      const diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (diff !== 0) return diff;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function clampScroll(selectedRow: number, currentOffset: number, visibleRows: number): number {
  if (selectedRow < currentOffset) return selectedRow;
  if (selectedRow >= currentOffset + visibleRows) return selectedRow - visibleRows + 1;
  return currentOffset;
}

export function pad(s: string, w: number): string {
  if (s.length > w) return s.slice(0, Math.max(w - 3, 0)) + "...";
  return s.padEnd(w);
}

export function formatReviewStatus(pr: PullRequestSummary): { symbol: string; color: string } {
  switch (pr.reviewDecision) {
    case "APPROVED":           return { symbol: "✓", color: "green" };
    case "CHANGES_REQUESTED":  return { symbol: "✗", color: "red" };
    case "REVIEW_REQUIRED":    return { symbol: "◑", color: "cyan" };
    default:                   return { symbol: "·", color: "gray" };
  }
}

export function formatAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (const text of raw.split("\n")) {
    if (text.startsWith("diff --git ")) {
      const match = text.match(/diff --git a\/.+ b\/(.+)/);
      const header = match?.[1] ?? text;
      current = { header, lines: [] };
      files.push(current);
    }
    if (!current) continue;

    let type: DiffLine["type"];
    if (text.startsWith("diff ") || text.startsWith("--- ") || text.startsWith("+++ ")) {
      type = "file";
    } else if (text.startsWith("@@")) {
      type = "hunk";
    } else if (text.startsWith("+")) {
      type = "add";
    } else if (text.startsWith("-")) {
      type = "del";
    } else {
      type = "ctx";
    }

    current.lines.push({ type, text });
  }

  return files;
}

export function groupByRepo(
  prs: PullRequestSummary[],
  needsReview: PullRequestSummary[],
  alerts: SecurityAlert[],
  sort: RepoSortMode = "activity",
  accessibleRepos: AccessibleRepo[] = [],
): RepoSummary[] {
  const map = new Map<string, RepoSummary>();

  // Seed map with all known repos using their real total open PR count
  for (const repo of accessibleRepos) {
    map.set(repo.nameWithOwner, {
      nameWithOwner: repo.nameWithOwner,
      openPrCount: repo.openPrCount,
      needsReviewCount: 0,
      waitingCount: 0,
      alertCount: 0,
      criticalCount: 0,
      prs: [],
      alerts: [],
    });
  }

  const needsReviewSet = new Set(needsReview.map(p => `${p.repository}#${p.number}`));

  // Enrich with user-specific PR data (needs review counts, local PR list for detail drill-in)
  for (const pr of prs) {
    const key = pr.repository;
    if (!map.has(key)) {
      map.set(key, { nameWithOwner: key, openPrCount: 0, needsReviewCount: 0, waitingCount: 0, alertCount: 0, criticalCount: 0, prs: [], alerts: [] });
    }
    const entry = map.get(key)!;
    if (!entry.prs.find(p => p.number === pr.number)) {
      entry.prs.push(pr);
      // Only bump openPrCount if not seeded from accessibleRepos (avoid double-counting)
      if (accessibleRepos.length === 0) entry.openPrCount++;
      if (needsReviewSet.has(`${pr.repository}#${pr.number}`)) entry.needsReviewCount++;
    }
  }

  for (const alert of alerts) {
    const key = alert.repository;
    if (!map.has(key)) {
      map.set(key, { nameWithOwner: key, openPrCount: 0, needsReviewCount: 0, waitingCount: 0, alertCount: 0, criticalCount: 0, prs: [], alerts: [] });
    }
    const entry = map.get(key)!;
    entry.alerts.push(alert);
    entry.alertCount++;
    if (alert.severity === "critical") entry.criticalCount++;
  }

  const entries = [...map.values()];
  if (sort === "name") {
    return entries.sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));
  }
  if (sort === "alerts") {
    return entries.sort((a, b) => {
      if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
      if (b.alertCount !== a.alertCount) return b.alertCount - a.alertCount;
      return a.nameWithOwner.localeCompare(b.nameWithOwner);
    });
  }
  // activity (default): needs review → open PRs → alerts → name
  return entries.sort((a, b) => {
    if (b.needsReviewCount !== a.needsReviewCount) return b.needsReviewCount - a.needsReviewCount;
    if (b.openPrCount !== a.openPrCount) return b.openPrCount - a.openPrCount;
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    if (b.alertCount !== a.alertCount) return b.alertCount - a.alertCount;
    return a.nameWithOwner.localeCompare(b.nameWithOwner);
  });
}
