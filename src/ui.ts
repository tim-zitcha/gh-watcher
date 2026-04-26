import blessed from "blessed";
import open from "open";

import { buildNotifications } from "./domain.js";
import { extractOrgFromScope, fetchAllViews, fetchDependabotAlerts, fetchMyPrsData, fetchNeedsMyReviewData, fetchOrganizationMembers, fetchPullRequestDetail, fetchPullRequestsAuthoredBy } from "./github.js";
import { sendNotifications } from "./notify.js";
import { isUnread, markSeen, saveState, updateWatchedAuthors } from "./state.js";
import type {
  AlertSeverity,
  AppConfig,
  PersistedState,
  PullRequestDetail,
  PullRequestRow,
  PullRequestSummary,
  RepositoryScopeOption,
  SecurityAlert,
  SecuritySortMode,
  TrackedAttentionState,
  ViewName
} from "./types.js";

const PR_VIEWS: ViewName[] = ["myPullRequests", "needsMyReview", "waitingOnOthers", "watchedAuthor"];

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unknown: 4
};

const COMMON_WATCHED_AUTHORS = ["dependabot[bot]"];

type AppMode = "pr" | "security";

interface WatchedAuthorOption {
  label: string;
  value: string | null;
  custom: boolean;
}

interface DashboardOptions {
  config: AppConfig;
  organizations: string[];
  initialState: PersistedState;
  initialAttentionState: TrackedAttentionState;
}

export async function runDashboard(options: DashboardOptions): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "gh-watcher",
    fullUnicode: true
  });

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 4,
    tags: true,
    border: "line",
    style: { border: { fg: "cyan" } }
  });

  const table = blessed.box({
    parent: screen,
    top: 4,
    left: 0,
    width: "100%",
    height: "100%-7",
    border: "line",
    mouse: true,
    tags: true,
    style: { border: { fg: "cyan" } }
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: "line",
    style: { border: { fg: "cyan" } }
  });

  const detailBox = blessed.box({
    parent: screen,
    top: 4,
    right: 0,
    width: "62%",
    height: "100%-7",
    border: "line",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    hidden: true,
    style: { border: { fg: "yellow" } },
    padding: { left: 1, right: 1 }
  });

  const userPicker = blessed.list({
    parent: screen,
    border: "line",
    height: 12,
    width: "60%",
    top: "center",
    left: "center",
    label: " Select Author ",
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    hidden: true,
    style: {
      selected: { bg: "blue" },
      border: { fg: "cyan" }
    }
  });

  const scopePicker = blessed.list({
    parent: screen,
    border: "line",
    height: 14,
    width: "60%",
    top: "center",
    left: "center",
    label: " Select Org Scope ",
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    hidden: true,
    style: {
      selected: { bg: "blue" },
      border: { fg: "cyan" }
    }
  });

  const customUserBox = blessed.textbox({
    parent: screen,
    border: "line",
    height: 7,
    width: "50%",
    top: "center",
    left: "center",
    label: " Custom Author ",
    inputOnFocus: true,
    keys: true,
    vi: true,
    hidden: true,
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "cyan" },
      focus: { fg: "black", bg: "white" }
    }
  });

  type ViewKey = "myPrs" | "needsMyReview" | "watchedAuthor" | "security";

  let detailOpen = false;
  let detailPr: PullRequestSummary | null = null;
  let detailData: PullRequestDetail | null = null;
  let detailLoading = false;

  let mode: AppMode = "pr";
  let currentPrViewIndex = 0;
  let persistedState = options.initialState;
  let attentionState = options.initialAttentionState;
  let isRefreshing = false;
  let queuedRefresh: ViewKey | "all" | null = null;
  let loadedViews = new Set<ViewKey>();
  let lastStatus = "Starting";
  let loadingMessage: string | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let selectedRowIndex = 0;
  let tableScrollOffset = 0;
  let activeOverlay: "author" | "scope" | "custom" | null = null;
  let securitySortMode: SecuritySortMode = "severity";
  const organizationMembersByScope = new Map<string, string[]>();

  function getCurrentPrView(): ViewName {
    return PR_VIEWS[currentPrViewIndex]!;
  }

  function currentViewKey(): ViewKey {
    if (mode === "security") return "security";
    const view = getCurrentPrView();
    if (view === "myPullRequests" || view === "waitingOnOthers") return "myPrs";
    if (view === "needsMyReview") return "needsMyReview";
    return "watchedAuthor";
  }

  function getPullRequestsForView(view: ViewName): PullRequestSummary[] {
    switch (view) {
      case "myPullRequests": return attentionState.myPullRequests;
      case "needsMyReview": return attentionState.needsMyReview;
      case "waitingOnOthers": return attentionState.waitingOnOthers;
      case "watchedAuthor": return attentionState.watchedAuthorPullRequests;
      case "security": return [];
    }
  }

  function currentItemCount(): number {
    if (mode === "security") return attentionState.securityAlerts.length;
    return getPullRequestsForView(getCurrentPrView()).length;
  }

  function getSelectedPullRequest(): PullRequestSummary | null {
    if (mode === "security") return null;
    return getPullRequestsForView(getCurrentPrView())[selectedRowIndex] ?? null;
  }

  function getSelectedSecurityAlert(): SecurityAlert | null {
    if (mode !== "security") return null;
    return sortSecurityAlerts(attentionState.securityAlerts, securitySortMode)[selectedRowIndex] ?? null;
  }

  function moveSelection(offset: number): void {
    if (activeOverlay) return;
    const count = currentItemCount();
    if (count === 0) return;
    selectedRowIndex = Math.max(0, Math.min(selectedRowIndex + offset, count - 1));
    render();
    if (detailOpen && mode === "pr" && !detailLoading) {
      const pr = getSelectedPullRequest();
      if (pr) void openDetail(pr);
    }
  }

  function jumpSelection(position: "first" | "last"): void {
    if (activeOverlay) return;
    const count = currentItemCount();
    if (count === 0) return;
    selectedRowIndex = position === "first" ? 0 : count - 1;
    render();
  }

  async function openSelected(): Promise<void> {
    if (activeOverlay) return;

    if (mode === "security") {
      const alert = getSelectedSecurityAlert();
      if (!alert) { lastStatus = "No alert selected"; render(); return; }
      await open(alert.url);
      lastStatus = `Opened ${alert.repository} alert #${alert.number}`;
      render();
      return;
    }

    const pr = getSelectedPullRequest();
    if (!pr) { lastStatus = "No PR selected"; render(); return; }
    await open(pr.url);
    lastStatus = `Opened ${pr.repository} #${pr.number}`;
    render();
  }

  function switchMode(next: AppMode): void {
    mode = next;
    selectedRowIndex = 0;
    tableScrollOffset = 0;
    render();
    const key = currentViewKey();
    if (!loadedViews.has(key)) refresh(key);
  }

  // ─── Formatting helpers ──────────────────────────────────────────────────────

  function formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function stripBlessedTags(value: string): string {
    return value.replace(/\{\/?[\w-]+}/g, "");
  }

  function padCell(value: string, width: number): string {
    const normalized = value.replace(/[{}]/g, "").replace(/\s+/g, " ");
    if (normalized.length > width) return `${normalized.slice(0, Math.max(width - 3, 0))}...`.padEnd(width);
    return normalized.padEnd(width);
  }

  function padTaggedCell(value: string, width: number): string {
    const plain = stripBlessedTags(value).replace(/\s+/g, " ");
    const clippedPlain = plain.length > width ? `${plain.slice(0, Math.max(width - 3, 0))}...` : plain;
    const openTags = value.match(/\{[\w-]+}/g) ?? [];
    const closeTags = value.match(/\{\/[\w-]+}/g) ?? [];
    const display = openTags.length > 0
      ? `${openTags.join("")}${clippedPlain}${closeTags.join("")}`
      : clippedPlain;
    return `${display}${" ".repeat(Math.max(width - clippedPlain.length, 0))}`;
  }

  function formatCiStatus(pr: PullRequestSummary): string {
    const { passing, failing, pending } = pr.checkCounts;
    const total = passing + failing + pending;

    if (total === 0) {
      switch (pr.ciStatus) {
        case "SUCCESS": return "{green-fg}✓{/green-fg}";
        case "FAILURE":
        case "ERROR": return "{red-fg}✗{/red-fg}";
        case "PENDING":
        case "EXPECTED": return "{yellow-fg}●{/yellow-fg}";
        default: return "{gray-fg}-{/gray-fg}";
      }
    }

    const parts: string[] = [];
    if (passing > 0) parts.push(`{green-fg}✓${passing}{/green-fg}`);
    if (failing > 0) parts.push(`{red-fg}✗${failing}{/red-fg}`);
    if (pending > 0) parts.push(`{yellow-fg}●${pending}{/yellow-fg}`);
    return parts.join(" ");
  }

  function formatSeverity(severity: AlertSeverity): string {
    switch (severity) {
      case "critical": return "{red-fg}CRIT{/red-fg}";
      case "high":     return "{magenta-fg}HIGH{/magenta-fg}";
      case "medium":   return "{yellow-fg}MED{/yellow-fg}";
      case "low":      return "{cyan-fg}LOW{/cyan-fg}";
      case "unknown":  return "{gray-fg}-{/gray-fg}";
    }
  }

  // ─── PR table ────────────────────────────────────────────────────────────────

  function buildPrTableContent(pullRequests: PullRequestSummary[]): string {
    const screenWidth = typeof screen.width === "number"
      ? (detailOpen ? Math.floor(screen.width * 0.38) : screen.width)
      : 200;
    const fixedCols = { state: 5, repo: 26, pr: 6, author: 14, ci: 10, reviewers: 22, activity: 14 };
    const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 7; // 7 spaces
    const titleWidth = Math.max(20, screenWidth - fixedTotal - 4); // 4 = border+padding
    const columns = [
      { label: "State", width: fixedCols.state },
      { label: "Repo", width: fixedCols.repo },
      { label: "PR", width: fixedCols.pr },
      { label: "Author", width: fixedCols.author },
      { label: "CI", width: fixedCols.ci },
      { label: "Reviewers", width: fixedCols.reviewers },
      { label: "Activity", width: fixedCols.activity },
      { label: "Title", width: titleWidth }
    ];
    const headerRow = columns.map((c) => padCell(c.label, c.width)).join(" ");

    if (loadingMessage) return [headerRow, "", `  LOAD  ${loadingMessage}`].join("\n");
    if (pullRequests.length === 0) {
      const key = getCurrentPrView() === "needsMyReview" ? "needsMyReview"
        : getCurrentPrView() === "watchedAuthor" ? "watchedAuthor" : "myPrs";
      return [headerRow, "", `  ${loadedViews.has(key) ? "No pull requests in this view" : "Waiting to refresh..."}`].join("\n");
    }

    const rows: PullRequestRow[] = pullRequests.map((pr) => ({
      badge: isUnread(persistedState, pr) ? "NEW" : "SEEN",
      repository: pr.repository,
      pr: `#${pr.number}`,
      author: pr.author,
      reviewers: pr.requestedReviewers.join(", ") || "-",
      ci: formatCiStatus(pr),
      activity: formatTimestamp(pr.activity.latestActivityAt),
      title: pr.title
    }));

    const screenHeight = typeof screen.height === "number" ? screen.height : 24;
    const visibleRows = Math.max(1, screenHeight - 9);
    if (selectedRowIndex < tableScrollOffset) tableScrollOffset = selectedRowIndex;
    if (selectedRowIndex >= tableScrollOffset + visibleRows) tableScrollOffset = selectedRowIndex - visibleRows + 1;
    tableScrollOffset = Math.max(0, Math.min(tableScrollOffset, Math.max(rows.length - visibleRows, 0)));

    const visible = rows.slice(tableScrollOffset, tableScrollOffset + visibleRows);
    const body = visible.map((row, i) => {
      const content = [
        padCell(row.badge, fixedCols.state),
        padCell(row.repository, fixedCols.repo),
        padCell(row.pr, fixedCols.pr),
        padCell(row.author, fixedCols.author),
        padTaggedCell(row.ci, fixedCols.ci),
        padCell(row.reviewers, fixedCols.reviewers),
        padCell(row.activity, fixedCols.activity),
        padCell(row.title, titleWidth)
      ].join(" ");
      return tableScrollOffset + i === selectedRowIndex ? `{inverse}${content}{/inverse}` : content;
    });

    const position = `Showing ${tableScrollOffset + 1}-${tableScrollOffset + visible.length} of ${rows.length}`;
    return [headerRow, position, ...body].join("\n");
  }

  // ─── Security table ──────────────────────────────────────────────────────────

  function sortSecurityAlerts(alerts: SecurityAlert[], sortMode: SecuritySortMode): SecurityAlert[] {
    return [...alerts].sort((a, b) => {
      if (sortMode === "severity") {
        const diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (diff !== 0) return diff;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  function buildSecurityTableContent(alerts: SecurityAlert[]): string {
    const screenWidth = typeof screen.width === "number" ? screen.width : 200;
    const fixedCols = { severity: 5, repo: 28, pkg: 20, ecosystem: 10, cve: 20, opened: 12 };
    const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 6;
    const summaryWidth = Math.max(20, screenWidth - fixedTotal - 4);
    const columns = [
      { label: "Sev", width: fixedCols.severity },
      { label: "Repo", width: fixedCols.repo },
      { label: "Package", width: fixedCols.pkg },
      { label: "Ecosystem", width: fixedCols.ecosystem },
      { label: "CVE/GHSA", width: fixedCols.cve },
      { label: "Opened", width: fixedCols.opened },
      { label: "Summary", width: summaryWidth }
    ];
    const headerRow = columns.map((c) => padCell(c.label, c.width)).join(" ");

    if (loadingMessage) return [headerRow, "", `  LOAD  ${loadingMessage}`].join("\n");

    const org = attentionState.repositoryScope?.startsWith("org:")
      ? attentionState.repositoryScope.slice(4)
      : null;

    if (!org) {
      return [headerRow, "", "  Select an org scope (press o) to view Dependabot security alerts"].join("\n");
    }

    if (alerts.length === 0) {
      return [headerRow, "", `  ${loadedViews.has("security") ? `No open Dependabot alerts in ${org}` : "Waiting to refresh..."}`].join("\n");
    }

    const sorted = sortSecurityAlerts(alerts, securitySortMode);
    const screenHeight = typeof screen.height === "number" ? screen.height : 24;
    const visibleRows = Math.max(1, screenHeight - 9);
    if (selectedRowIndex < tableScrollOffset) tableScrollOffset = selectedRowIndex;
    if (selectedRowIndex >= tableScrollOffset + visibleRows) tableScrollOffset = selectedRowIndex - visibleRows + 1;
    tableScrollOffset = Math.max(0, Math.min(tableScrollOffset, Math.max(sorted.length - visibleRows, 0)));

    const visible = sorted.slice(tableScrollOffset, tableScrollOffset + visibleRows);
    const body = visible.map((alert, i) => {
      const identifier = alert.cveId ?? alert.ghsaId;
      const content = [
        padTaggedCell(formatSeverity(alert.severity), fixedCols.severity),
        padCell(alert.repository, fixedCols.repo),
        padCell(alert.package, fixedCols.pkg),
        padCell(alert.ecosystem, fixedCols.ecosystem),
        padCell(identifier, fixedCols.cve),
        padCell(formatTimestamp(alert.createdAt), fixedCols.opened),
        padCell(alert.summary, summaryWidth)
      ].join(" ");
      return tableScrollOffset + i === selectedRowIndex ? `{inverse}${content}{/inverse}` : content;
    });

    const position = `Sort: ${securitySortMode} (s to toggle)  Showing ${tableScrollOffset + 1}-${tableScrollOffset + visible.length} of ${sorted.length}`;
    return [headerRow, position, ...body].join("\n");
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  function buildSeveritySummary(alerts: SecurityAlert[]): string {
    const counts: Record<AlertSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    for (const alert of alerts) counts[alert.severity]++;
    const total = attentionState.securityAlertTotal;
    const shown = alerts.length;
    const totalLabel = total > shown ? `${total} total, showing ${shown}` : `${shown} open`;
    return [
      `{bold}${totalLabel}{/bold}`,
      `{red-fg}CRIT: ${counts.critical}{/red-fg}`,
      `{magenta-fg}HIGH: ${counts.high}{/magenta-fg}`,
      `{yellow-fg}MED: ${counts.medium}{/yellow-fg}`,
      `{cyan-fg}LOW: ${counts.low}{/cyan-fg}`,
      `{gray-fg}s=sort  S=PRs{/gray-fg}`
    ].join("   ");
  }

  function render(): void {
    const scopeLabel = attentionState.repositoryScope ?? "all accessible repos";
    const refreshedLabel = `Refreshed: ${formatTimestamp(attentionState.refreshedAt)}`;

    if (mode === "security") {
      const org = attentionState.repositoryScope?.startsWith("org:")
        ? attentionState.repositoryScope.slice(4)
        : null;

      const orgLabel = org ? ` — ${org}` : "";
      header.setContent([
        `{bold}gh-watcher{/bold}  {inverse} ⚠ SECURITY${orgLabel} {/inverse}   Scope: ${scopeLabel}   ${refreshedLabel}   Status: ${lastStatus}`,
        buildSeveritySummary(attentionState.securityAlerts)
      ].join("\n"));

      const count = attentionState.securityAlerts.length;
      if (count === 0) { selectedRowIndex = 0; tableScrollOffset = 0; }
      else selectedRowIndex = Math.min(selectedRowIndex, count - 1);

      table.setContent(buildSecurityTableContent(attentionState.securityAlerts));
      footer.setContent("j/k move  Enter open  s sort by severity/age  o org  r refresh  S back to PRs  q quit");
    } else {
      const view = getCurrentPrView();
      const pullRequests = getPullRequestsForView(view);

      const securityBadge = attentionState.securityAlerts.some((a) => a.severity === "critical")
        ? " {red-fg}⚠ CRIT{/red-fg}"
        : attentionState.securityAlerts.some((a) => a.severity === "high")
          ? " {magenta-fg}⚠ HIGH{/magenta-fg}"
          : "";

      const viewLabels = [
        `${view === "myPullRequests" ? "{inverse}" : ""}My PRs (${attentionState.myPullRequests.length})${view === "myPullRequests" ? "{/inverse}" : ""}`,
        `${view === "needsMyReview" ? "{inverse}" : ""}Needs My Review (${attentionState.needsMyReview.length})${view === "needsMyReview" ? "{/inverse}" : ""}`,
        `${view === "waitingOnOthers" ? "{inverse}" : ""}Waiting On Others (${attentionState.waitingOnOthers.length})${view === "waitingOnOthers" ? "{/inverse}" : ""}`,
        `${view === "watchedAuthor" ? "{inverse}" : ""}Authored By ${attentionState.watchedAuthor ?? "User"} (${attentionState.watchedAuthorTotal > attentionState.watchedAuthorPullRequests.length ? `${attentionState.watchedAuthorPullRequests.length}+` : String(attentionState.watchedAuthorPullRequests.length)})${view === "watchedAuthor" ? "{/inverse}" : ""}`
      ];

      const recentUsers = persistedState.watchedAuthors.recent.length > 0
        ? persistedState.watchedAuthors.recent.join(", ")
        : "none";

      header.setContent([
        `{bold}gh-watcher{/bold}   S → Security${securityBadge}`,
        viewLabels.join("  "),
        `Author: ${attentionState.watchedAuthor ?? "none"}  Scope: ${scopeLabel}  ${refreshedLabel}  Status: ${lastStatus}`,
        `Recent watched: ${recentUsers}`
      ].join("\n"));

      const count = pullRequests.length;
      if (count === 0) { selectedRowIndex = 0; tableScrollOffset = 0; }
      else selectedRowIndex = Math.min(selectedRowIndex, count - 1);

      table.setContent(buildPrTableContent(pullRequests));
      footer.setContent(detailOpen
        ? "j/k move  o open in GitHub  Esc close detail  q quit"
        : "j/k move  Enter open detail  m mark seen  M mark all  Tab views  / author  o org  r refresh  S security  q quit"
      );
    }

    screen.render();
    if (!activeOverlay) table.focus();
  }

  function renderDetailPane(): void {
    if (!detailPr) return;

    const pr = detailPr;
    const createdAtStr = detailData?.createdAt ?? pr.activity.latestActivityAt;
    const openedDate = new Date(createdAtStr);
    const openedLabel = Number.isNaN(openedDate.valueOf()) ? createdAtStr : new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(openedDate);

    const lines: string[] = [
      `{bold}#${pr.number} — ${pr.title}{/bold}`,
      `${pr.repository} · ${pr.author} · opened ${openedLabel}`,
      ""
    ];

    if (detailLoading) {
      lines.push("{yellow-fg}Loading...{/yellow-fg}");
    } else if (detailData) {
      const d = detailData;

      // Description
      lines.push("── Description ──────────────────");
      lines.push(d.body.trim() || "(no description)");
      lines.push("");

      // CI Checks
      const passing = d.checkRuns.filter((c) => c.conclusion === "SUCCESS").length;
      const failing = d.checkRuns.filter((c) => c.conclusion !== null && c.conclusion !== "SUCCESS" && c.conclusion !== "NEUTRAL" && c.conclusion !== "SKIPPED").length;
      lines.push(`── CI Checks (${passing} passing / ${failing} failing) ──`);
      for (const check of d.checkRuns) {
        if (check.conclusion === "SUCCESS") {
          lines.push(`{green-fg}✓{/green-fg} ${check.name}`);
        } else if (check.conclusion === null) {
          lines.push(`{yellow-fg}●{/yellow-fg} ${check.name}`);
        } else {
          lines.push(`{red-fg}✗{/red-fg} ${check.name}`);
        }
      }
      lines.push("");

      // Reviews
      lines.push("── Reviews ──────────────────────");
      const reviewedAuthors = new Set(d.reviews.map((r) => r.author));
      for (const review of d.reviews) {
        if (review.state === "APPROVED") {
          lines.push(`{green-fg}✓{/green-fg} ${review.author} — APPROVED`);
        } else if (review.state === "CHANGES_REQUESTED") {
          lines.push(`{red-fg}✗{/red-fg} ${review.author} — CHANGES_REQUESTED`);
        } else {
          lines.push(`${review.author} — ${review.state}`);
        }
      }
      for (const reviewer of d.requestedReviewers) {
        if (!reviewedAuthors.has(reviewer)) {
          lines.push(`{yellow-fg}⏳{/yellow-fg} ${reviewer} — PENDING`);
        }
      }
      lines.push("");

      // Files Changed
      const totalAdditions = d.files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = d.files.reduce((sum, f) => sum + f.deletions, 0);
      lines.push(`── Files Changed (${d.files.length} files, +${totalAdditions} −${totalDeletions}) ──`);
      for (const file of d.files) {
        lines.push(`${file.path}   {green-fg}+${file.additions}{/green-fg} {red-fg}−${file.deletions}{/red-fg}`);
      }
    }

    detailBox.setContent(lines.join("\n"));
  }

  async function openDetail(pr: PullRequestSummary): Promise<void> {
    detailOpen = true;
    detailPr = pr;
    detailData = null;
    detailLoading = true;
    detailBox.hidden = false;
    (table as any).width = "38%";
    renderDetailPane();
    screen.render();

    const [owner, repo] = pr.repository.split("/");
    try {
      const result = await fetchPullRequestDetail(owner!, repo!, pr.number);
      if (detailPr !== pr) return;
      detailData = result;
    } catch {
      if (detailPr !== pr) return;
      detailData = null;
    }
    detailLoading = false;
    renderDetailPane();
    screen.render();
  }

  function closeDetail(): void {
    detailOpen = false;
    detailPr = null;
    detailData = null;
    detailLoading = false;
    detailBox.hidden = true;
    (table as any).width = "100%";
    render();
  }

  // ─── State helpers ───────────────────────────────────────────────────────────

  async function persistAndRender(nextState: PersistedState): Promise<void> {
    persistedState = nextState;
    await saveState(options.config.stateFilePath, persistedState);
    render();
  }

  function drainQueue(): void {
    if (queuedRefresh) {
      const next = queuedRefresh;
      queuedRefresh = null;
      void doRefresh(next);
    }
  }

  async function doRefresh(target: ViewKey | "all"): Promise<void> {
    if (isRefreshing) {
      queuedRefresh = target === "all" || queuedRefresh === "all" ? "all" : target;
      lastStatus = "Queued refresh";
      render();
      return;
    }

    isRefreshing = true;
    const requestedScope = attentionState.repositoryScope;
    const requestedAuthor = attentionState.watchedAuthor;
    const fetchAll = target === "all";

    const fetchMyPrs    = fetchAll || target === "myPrs";
    const fetchNeeds    = fetchAll || target === "needsMyReview";
    const fetchWatched  = fetchAll || target === "watchedAuthor";
    const fetchSecurity = fetchAll || target === "security";

    loadingMessage = "Fetching from GitHub...";
    lastStatus = fetchAll ? "Refreshing all" : `Refreshing ${target}`;
    render();

    try {
      const [myPrsResult, needsResult, watchedResult, securityResult] = await Promise.all([
        fetchMyPrs
          ? fetchMyPrsData({
              viewerLogin: attentionState.viewerLogin,
              includeDrafts: options.config.includeDrafts,
              repositoryScope: requestedScope
            })
          : null,
        fetchNeeds
          ? fetchNeedsMyReviewData({
              viewerLogin: attentionState.viewerLogin,
              includeDrafts: options.config.includeDrafts,
              repositoryScope: requestedScope
            })
          : null,
        fetchWatched && requestedAuthor
          ? fetchPullRequestsAuthoredBy({
              author: requestedAuthor,
              includeDrafts: options.config.includeDrafts,
              repositoryScope: requestedScope
            })
          : null,
        fetchSecurity
          ? (() => {
              const org = extractOrgFromScope(requestedScope);
              return org ? fetchDependabotAlerts(org) : Promise.resolve({ alerts: [], total: 0 });
            })()
          : null
      ]);

      if (attentionState.repositoryScope !== requestedScope || attentionState.watchedAuthor !== requestedAuthor) {
        return;
      }

      const next = { ...attentionState, refreshedAt: new Date().toISOString() };

      if (myPrsResult) {
        next.myPullRequests = myPrsResult.myPullRequests;
        next.waitingOnOthers = myPrsResult.waitingOnOthers;
        loadedViews.add("myPrs");
      }
      if (needsResult) {
        next.needsMyReview = needsResult.needsMyReview;
        loadedViews.add("needsMyReview");
      }
      if (watchedResult) {
        next.watchedAuthorPullRequests = watchedResult.pullRequests;
        next.watchedAuthorTotal = watchedResult.hasMore
          ? watchedResult.pullRequests.length + 1
          : watchedResult.pullRequests.length;
        loadedViews.add("watchedAuthor");
      }
      if (securityResult) {
        next.securityAlerts = securityResult.alerts;
        next.securityAlertTotal = securityResult.total;
        loadedViews.add("security");
      }

      const prevState = attentionState;
      attentionState = next;

      if (options.config.notificationsEnabled && target !== "all") {
        const notifications = buildNotifications(prevState, next, persistedState);
        if (notifications.length > 0) {
          await sendNotifications(notifications);
          const notificationFingerprintByKey = { ...persistedState.notificationFingerprintByKey };
          for (const event of notifications) {
            const [view, id] = event.dedupeKey.split(":");
            const pr = getPullRequestsForView(view as ViewName).find((c) => c.id === id);
            if (pr) notificationFingerprintByKey[event.dedupeKey] = pr.activity.fingerprint;
          }
          persistedState = { ...persistedState, notificationFingerprintByKey };
          await saveState(options.config.stateFilePath, persistedState);
        }
      }

      lastStatus = `Refreshed ${target === "all" ? "all" : target} ${formatTimestamp(next.refreshedAt)}`;
    } catch (error) {
      lastStatus = `Refresh failed: ${(error as Error).message}`;
    } finally {
      isRefreshing = false;
      loadingMessage = null;
      render();
      drainQueue();
    }
  }

  function refresh(target: ViewKey | "all"): void {
    void doRefresh(target);
  }

  // ─── Overlays ────────────────────────────────────────────────────────────────

  async function promptForWatchedUser(): Promise<void> {
    customUserBox.setLabel(` Custom Author in ${attentionState.repositoryScope ?? "all accessible repos"} `);
    customUserBox.setValue(attentionState.watchedAuthor ?? attentionState.viewerLogin);
    activeOverlay = "custom";
    customUserBox.show();
    customUserBox.focus();
    screen.render();
  }

  async function setWatchedAuthor(nextLogin: string): Promise<void> {
    persistedState = {
      ...persistedState,
      watchedAuthors: updateWatchedAuthors(persistedState.watchedAuthors, nextLogin)
    };
    await saveState(options.config.stateFilePath, persistedState);
    attentionState = {
      ...attentionState,
      watchedAuthor: nextLogin,
      watchedAuthorPullRequests: [],
      watchedAuthorTotal: 0
    };
    loadedViews.delete("watchedAuthor");
    currentPrViewIndex = PR_VIEWS.indexOf("watchedAuthor");
    selectedRowIndex = 0;
    tableScrollOffset = 0;
    lastStatus = `Selected author ${nextLogin}`;
    render();
    refresh("watchedAuthor");
  }

  function selectedOrganizationLogin(): string | null {
    const prefix = "org:";
    return attentionState.repositoryScope?.startsWith(prefix)
      ? attentionState.repositoryScope.slice(prefix.length)
      : null;
  }

  async function getAuthorCandidatesForScope(): Promise<string[]> {
    const organization = selectedOrganizationLogin();
    if (!organization) return [];
    const cached = organizationMembersByScope.get(organization);
    if (cached) return cached;
    const members = await fetchOrganizationMembers(organization);
    organizationMembersByScope.set(organization, members);
    return members;
  }

  function buildWatchedAuthorOptions(authorCandidates: string[]): WatchedAuthorOption[] {
    const seen = new Set<string>();
    const entries: WatchedAuthorOption[] = [];

    function add(label: string, value: string): void {
      if (seen.has(value)) return;
      seen.add(value);
      entries.push({ label, value, custom: false });
    }

    add(`${attentionState.viewerLogin} (you)`, attentionState.viewerLogin);
    if (attentionState.watchedAuthor && attentionState.watchedAuthor !== attentionState.viewerLogin) {
      add(`${attentionState.watchedAuthor} (current)`, attentionState.watchedAuthor);
    }
    for (const author of authorCandidates) add(author, author);
    for (const recent of persistedState.watchedAuthors.recent) add(recent, recent);
    for (const common of COMMON_WATCHED_AUTHORS) add(common, common);
    entries.push({ label: "Type another GitHub username...", value: null, custom: true });
    return entries;
  }

  async function openWatchedAuthorPicker(): Promise<void> {
    const organization = selectedOrganizationLogin();
    activeOverlay = "author";
    userPicker.setItems([organization ? `Loading ${organization} members...` : "No org selected; using recent authors"]);
    userPicker.show();
    userPicker.focus();
    userPicker.select(0);
    screen.render();

    let authorCandidates: string[] = [];
    try {
      authorCandidates = await getAuthorCandidatesForScope();
    } catch (error) {
      lastStatus = `Author list failed: ${(error as Error).message}`;
    }

    if (activeOverlay !== "author") return;

    const pickerOptions = buildWatchedAuthorOptions(authorCandidates);
    userPicker.setItems(pickerOptions.map((o) => o.label));
    userPicker.show();
    userPicker.focus();
    userPicker.select(0);
    screen.render();

    userPicker.removeAllListeners("select");
    userPicker.on("select", (_item, index) => {
      const option = pickerOptions[index];
      if (!option) { userPicker.hide(); activeOverlay = null; render(); return; }
      if (option.custom) { userPicker.hide(); activeOverlay = null; void promptForWatchedUser(); return; }
      userPicker.hide();
      activeOverlay = null;
      void setWatchedAuthor(option.value!);
    });
  }

  function buildScopeOptions(): RepositoryScopeOption[] {
    return [
      { label: "All accessible repos", value: null },
      ...options.organizations.map((org) => ({ label: org, value: `org:${org}` }))
    ];
  }

  function openScopePicker(): void {
    const scopeOptions = buildScopeOptions();
    scopePicker.setItems(scopeOptions.map((o) => o.label));
    activeOverlay = "scope";
    scopePicker.show();
    scopePicker.focus();
    scopePicker.select(Math.max(scopeOptions.findIndex((o) => o.value === attentionState.repositoryScope), 0));
    screen.render();

    scopePicker.removeAllListeners("select");
    scopePicker.on("select", (_item, index) => {
      const option = scopeOptions[index];
      if (!option) { scopePicker.hide(); activeOverlay = null; render(); return; }

      scopePicker.hide();
      activeOverlay = null;
      const scopeLabel = option.value ?? "all accessible repos";
      attentionState = {
        ...attentionState,
        repositoryScope: option.value,
        myPullRequests: [],
        needsMyReview: [],
        waitingOnOthers: [],
        watchedAuthorPullRequests: [],
        securityAlerts: [],
        securityAlertTotal: 0
      };
      loadedViews.clear();
      selectedRowIndex = 0;
      tableScrollOffset = 0;
      lastStatus = `Selected scope ${scopeLabel}`;
      currentPrViewIndex = 0;
      render();
      refresh("myPrs");
    });
  }

  // ─── Key bindings ────────────────────────────────────────────────────────────

  screen.key("enter", () => {
    if (activeOverlay) return;
    if (mode === "security") { void openSelected(); return; }
    const pr = getSelectedPullRequest();
    if (pr) void openDetail(pr);
  });
  screen.key(["down", "j"], () => moveSelection(1));
  screen.key(["up", "k"], () => moveSelection(-1));
  screen.key(["pagedown", "C-d"], () => moveSelection(10));
  screen.key(["pageup", "C-u"], () => moveSelection(-10));
  screen.key(["home", "g"], () => jumpSelection("first"));
  screen.key(["end", "G"], () => jumpSelection("last"));

  screen.key("tab", () => {
    if (mode !== "pr") return;
    currentPrViewIndex = (currentPrViewIndex + 1) % PR_VIEWS.length;
    selectedRowIndex = 0;
    tableScrollOffset = 0;
    render();
    const key = currentViewKey();
    if (!loadedViews.has(key)) refresh(key);
  });

  screen.key(["s", "S", "S-s"], (_ch, key) => {
    if (key.shift) {
      switchMode(mode === "pr" ? "security" : "pr");
      return;
    }
    if (mode !== "security") return;
    securitySortMode = securitySortMode === "severity" ? "age" : "severity";
    selectedRowIndex = 0;
    tableScrollOffset = 0;
    render();
  });

  screen.key("/", () => { void openWatchedAuthorPicker(); });
  screen.key("o", () => {
    if (activeOverlay) return;
    if (mode === "pr" && detailOpen) {
      const pr = detailPr ?? getSelectedPullRequest();
      if (pr) void open(pr.url);
      return;
    }
    openScopePicker();
  });

  screen.key("escape", () => {
    if (detailOpen) { closeDetail(); return; }
  });
  screen.key("r", () => { refresh(currentViewKey()); });

  screen.key(["m", "M", "S-m"], (_ch, key) => {
    if (mode !== "pr") return;
    if (key.shift) {
      const pullRequests = getPullRequestsForView(getCurrentPrView());
      lastStatus = `Marked ${pullRequests.length} PRs as seen`;
      void persistAndRender(markSeen(persistedState, pullRequests));
    } else {
      const pr = getSelectedPullRequest();
      if (!pr) return;
      lastStatus = `Marked seen: ${pr.repository} #${pr.number}`;
      void persistAndRender(markSeen(persistedState, [pr]));
    }
  });

  userPicker.key(["escape", "q"], () => {
    userPicker.hide();
    activeOverlay = null;
    table.focus();
    render();
  });

  scopePicker.key(["escape", "q"], () => {
    scopePicker.hide();
    activeOverlay = null;
    table.focus();
    render();
  });

  customUserBox.key(["escape", "C-c"], () => {
    customUserBox.hide();
    activeOverlay = null;
    table.focus();
    render();
  });

  customUserBox.on("submit", (value) => {
    const nextLogin = value.trim() || attentionState.viewerLogin;
    customUserBox.hide();
    activeOverlay = null;
    void setWatchedAuthor(nextLogin);
  });

  screen.key(["q", "C-c"], () => {
    if (pollTimer) clearInterval(pollTimer);
    screen.destroy();
    process.exit(0);
  });

  pollTimer = setInterval(() => {
    refresh("all");
  }, options.config.refreshMinutes * 60 * 1000);

  render();
  refresh("myPrs");
}
