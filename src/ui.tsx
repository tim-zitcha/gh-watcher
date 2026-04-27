import React, { useCallback, useEffect, useReducer, useRef } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import open from "open";

import { buildNotifications } from "./domain.js";
import {
  extractOrgFromScope, fetchDependabotAlerts, fetchMyPrsData,
  fetchNeedsMyReviewData, fetchOrganizationMembers, fetchPullRequestDetail,
  fetchPullRequestsAuthoredBy
} from "./github.js";
import { sendNotifications } from "./notify.js";
import { isUnread, markSeen, saveState, updateWatchedAuthors } from "./state.js";
import type {
  AlertSeverity, AppConfig, PersistedState, PullRequestDetail,
  PullRequestSummary, SecurityAlert, SecuritySortMode,
  TrackedAttentionState, ViewName
} from "./types.js";

// ── Constants ────────────────────────────────────────────────────────────────

const PR_VIEWS: ViewName[] = ["myPullRequests", "needsMyReview", "waitingOnOthers", "watchedAuthor"];
const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
const COMMON_WATCHED_AUTHORS = ["dependabot[bot]"];

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function htmlToText(html: string): string {
  return html
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
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();
}

function formatCiStatus(pr: PullRequestSummary): { symbol: string; color: string } {
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
  const parts: string[] = [];
  if (passing > 0) parts.push(`✓${passing}`);
  if (failing > 0) parts.push(`✗${failing}`);
  if (pending > 0) parts.push(`●${pending}`);
  return { symbol: parts.join(" "), color: failing > 0 ? "red" : pending > 0 ? "yellow" : "green" };
}

function sortSecurityAlerts(alerts: SecurityAlert[], mode: SecuritySortMode): SecurityAlert[] {
  return [...alerts].sort((a, b) => {
    if (mode === "severity") {
      const diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (diff !== 0) return diff;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function clampScroll(selectedRow: number, currentOffset: number, visibleRows: number): number {
  if (selectedRow < currentOffset) return selectedRow;
  if (selectedRow >= currentOffset + visibleRows) return selectedRow - visibleRows + 1;
  return currentOffset;
}

// ── Shared types ─────────────────────────────────────────────────────────────

type AppMode = "pr" | "security";
type ActiveOverlay = "author" | "scope" | "custom" | null;
type ViewKey = "myPrs" | "needsMyReview" | "watchedAuthor" | "security";

interface WatchedAuthorOption { label: string; value: string | null; custom: boolean; }

export interface DashboardOptions {
  config: AppConfig;
  organizations: string[];
  initialState: PersistedState;
  initialAttentionState: TrackedAttentionState;
}

// ── App state ─────────────────────────────────────────────────────────────────

interface AppState {
  mode: AppMode;
  currentPrViewIndex: number;
  selectedRowIndex: number;
  tableScrollOffset: number;
  activeOverlay: ActiveOverlay;
  securitySortMode: SecuritySortMode;
  attentionState: TrackedAttentionState;
  persistedState: PersistedState;
  isRefreshing: boolean;
  queuedRefresh: ViewKey | "all" | null;
  loadedViews: Set<ViewKey>;
  lastStatus: string;
  loadingMessage: string | null;
  detailOpen: boolean;
  detailPr: PullRequestSummary | null;
  detailData: PullRequestDetail | null;
  detailLoading: boolean;
  detailScrollOffset: number;
  orgMembers: Map<string, string[]>;
  authorCandidates: string[];
}

type Action =
  | { type: "SET_MODE"; mode: AppMode }
  | { type: "SET_VIEW_INDEX"; index: number }
  | { type: "SET_SELECTED_ROW"; index: number; scrollOffset: number }
  | { type: "SET_TABLE_SCROLL"; offset: number }
  | { type: "SET_OVERLAY"; overlay: ActiveOverlay }
  | { type: "SET_SECURITY_SORT"; sort: SecuritySortMode }
  | { type: "UPDATE_ATTENTION_STATE"; state: TrackedAttentionState; itemCount: number }
  | { type: "SET_PERSISTED_STATE"; state: PersistedState }
  | { type: "SET_REFRESHING"; value: boolean }
  | { type: "SET_QUEUED_REFRESH"; target: ViewKey | "all" | null }
  | { type: "ADD_LOADED_VIEW"; key: ViewKey }
  | { type: "CLEAR_LOADED_VIEWS" }
  | { type: "SET_STATUS"; status: string }
  | { type: "SET_LOADING_MESSAGE"; message: string | null }
  | { type: "OPEN_DETAIL"; pr: PullRequestSummary }
  | { type: "SET_DETAIL_DATA"; data: PullRequestDetail | null }
  | { type: "SET_DETAIL_SCROLL"; offset: number }
  | { type: "CLOSE_DETAIL" }
  | { type: "SET_ORG_MEMBERS"; org: string; members: string[] }
  | { type: "SET_AUTHOR_CANDIDATES"; candidates: string[] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, selectedRowIndex: 0, tableScrollOffset: 0 };
    case "SET_VIEW_INDEX":
      return { ...state, currentPrViewIndex: action.index, selectedRowIndex: 0, tableScrollOffset: 0 };
    case "SET_SELECTED_ROW":
      return { ...state, selectedRowIndex: action.index, tableScrollOffset: action.scrollOffset };
    case "SET_TABLE_SCROLL":
      return { ...state, tableScrollOffset: action.offset };
    case "SET_OVERLAY":
      return { ...state, activeOverlay: action.overlay };
    case "SET_SECURITY_SORT":
      return { ...state, securitySortMode: action.sort, selectedRowIndex: 0, tableScrollOffset: 0 };
    case "UPDATE_ATTENTION_STATE": {
      const maxIdx = Math.max(0, action.itemCount - 1);
      return {
        ...state,
        attentionState: action.state,
        selectedRowIndex: Math.min(state.selectedRowIndex, maxIdx),
      };
    }
    case "SET_PERSISTED_STATE":
      return { ...state, persistedState: action.state };
    case "SET_REFRESHING":
      return { ...state, isRefreshing: action.value };
    case "SET_QUEUED_REFRESH":
      return { ...state, queuedRefresh: action.target };
    case "ADD_LOADED_VIEW":
      return { ...state, loadedViews: new Set([...state.loadedViews, action.key]) };
    case "CLEAR_LOADED_VIEWS":
      return { ...state, loadedViews: new Set() };
    case "SET_STATUS":
      return { ...state, lastStatus: action.status };
    case "SET_LOADING_MESSAGE":
      return { ...state, loadingMessage: action.message };
    case "OPEN_DETAIL":
      return { ...state, detailOpen: true, detailPr: action.pr, detailData: null, detailLoading: true, detailScrollOffset: 0 };
    case "SET_DETAIL_DATA":
      return { ...state, detailData: action.data, detailLoading: false };
    case "SET_DETAIL_SCROLL":
      return { ...state, detailScrollOffset: Math.max(0, action.offset) };
    case "CLOSE_DETAIL":
      return { ...state, detailOpen: false, detailPr: null, detailData: null, detailLoading: false, detailScrollOffset: 0 };
    case "SET_ORG_MEMBERS": {
      const m = new Map(state.orgMembers); m.set(action.org, action.members);
      return { ...state, orgMembers: m };
    }
    case "SET_AUTHOR_CANDIDATES":
      return { ...state, authorCandidates: action.candidates };
    default: return state;
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ state }: { state: AppState }) {
  const { attentionState, persistedState, mode, lastStatus } = state;
  const scopeLabel = attentionState.repositoryScope ?? "all accessible repos";
  const refreshedLabel = `Refreshed: ${formatTimestamp(attentionState.refreshedAt)}`;
  const alerts = attentionState.securityAlerts;
  const hasCrit = alerts.some(a => a.severity === "critical");
  const hasHigh = alerts.some(a => a.severity === "high");
  const alertCounts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const a of alerts) alertCounts[a.severity]++;
  const total = attentionState.securityAlertTotal;
  const shown = alerts.length;
  const totalLabel = total > shown ? `${total} total, showing ${shown}` : `${shown} open`;

  if (mode === "security") {
    const org = attentionState.repositoryScope?.startsWith("org:")
      ? attentionState.repositoryScope.slice(4) : null;
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text>
          <Text bold>gh-watcher</Text>{"  "}
          <Text inverse> ⚠ SECURITY{org ? ` — ${org}` : ""} </Text>
          {"  "}Scope: {scopeLabel}{"  "}{refreshedLabel}{"  "}Status: {lastStatus}
        </Text>
        <Text>
          <Text bold>{totalLabel}</Text>
          {"   "}<Text color="red">CRIT: {alertCounts.critical}</Text>
          {"  "}<Text color="magenta">HIGH: {alertCounts.high}</Text>
          {"  "}<Text color="yellow">MED: {alertCounts.medium}</Text>
          {"  "}<Text color="cyan">LOW: {alertCounts.low}</Text>
          {"   "}<Text dimColor>s=sort  S=PRs</Text>
        </Text>
      </Box>
    );
  }

  const view = PR_VIEWS[state.currentPrViewIndex]!;
  const { myPullRequests, needsMyReview, waitingOnOthers, watchedAuthorPullRequests, watchedAuthorTotal, watchedAuthor } = attentionState;
  const recentUsers = persistedState.watchedAuthors.recent.join(", ") || "none";

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box gap={2}>
        <Text bold>gh-watcher</Text>
        <Text dimColor>S → Security</Text>
        {hasCrit && <Text color="red">⚠ CRIT</Text>}
        {!hasCrit && hasHigh && <Text color="magenta">⚠ HIGH</Text>}
      </Box>
      <Box gap={2}>
        {(["myPullRequests", "needsMyReview", "waitingOnOthers", "watchedAuthor"] as ViewName[]).map((v) => {
          const count = v === "myPullRequests" ? myPullRequests.length
            : v === "needsMyReview" ? needsMyReview.length
            : v === "waitingOnOthers" ? waitingOnOthers.length
            : watchedAuthorTotal > watchedAuthorPullRequests.length
              ? `${watchedAuthorPullRequests.length}+` : watchedAuthorPullRequests.length;
          const label = v === "myPullRequests" ? "My PRs"
            : v === "needsMyReview" ? "Needs My Review"
            : v === "waitingOnOthers" ? "Waiting On Others"
            : `Authored By ${watchedAuthor ?? "User"}`;
          return <Text key={v} inverse={view === v}>{label} ({count})</Text>;
        })}
      </Box>
      <Text>Author: {watchedAuthor ?? "none"}{"  "}Scope: {scopeLabel}{"  "}{refreshedLabel}{"  "}Status: {lastStatus}</Text>
      <Text dimColor>Recent watched: {recentUsers}</Text>
    </Box>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({ state }: { state: AppState }) {
  if (state.mode === "security") {
    return <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text dimColor>j/k move  Enter open  s sort severity/age  o org  r refresh  S back to PRs  q quit</Text>
    </Box>;
  }
  return <Box borderStyle="single" borderColor="cyan" paddingX={1}>
    <Text dimColor>{state.detailOpen
      ? "j/k navigate  ↑↓ scroll detail  o open in GitHub  Esc close detail  q quit"
      : "j/k move  Enter open detail  m mark seen  M mark all  Tab views  / author  o org  r refresh  S security  q quit"
    }</Text>
  </Box>;
}

// ── PrList ────────────────────────────────────────────────────────────────────

function PrList({ state, narrow }: { state: AppState; narrow: boolean }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 200;
  const rows = stdout?.rows ?? 24;
  const visibleRows = Math.max(1, rows - 9);

  const pullRequests = (() => {
    switch (PR_VIEWS[state.currentPrViewIndex]!) {
      case "myPullRequests": return state.attentionState.myPullRequests;
      case "needsMyReview": return state.attentionState.needsMyReview;
      case "waitingOnOthers": return state.attentionState.waitingOnOthers;
      case "watchedAuthor": return state.attentionState.watchedAuthorPullRequests;
      default: return [];
    }
  })();

  function pad(s: string, w: number) {
    if (s.length > w) return s.slice(0, Math.max(w - 3, 0)) + "...";
    return s.padEnd(w);
  }

  const { selectedRowIndex } = state;
  const scrollOffset = clampScroll(selectedRowIndex, state.tableScrollOffset, visibleRows);
  const visible = pullRequests.slice(scrollOffset, scrollOffset + visibleRows);

  if (narrow) {
    const availWidth = Math.floor(cols * 0.38) - 4;
    const prCol = 6; const ciCol = 5;
    const titleWidth = Math.max(8, availWidth - prCol - ciCol - 2);
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" width="38%">
        <Text bold>{pad("PR", prCol)} {pad("CI", ciCol)} {pad("Title", titleWidth)}</Text>
        <Text dimColor>Showing {scrollOffset + 1}-{scrollOffset + visible.length} of {pullRequests.length}</Text>
        {visible.map((pr, i) => {
          const ci = formatCiStatus(pr);
          const selected = scrollOffset + i === selectedRowIndex;
          return (
            <Text key={pr.id} inverse={selected}>
              {pad(`#${pr.number}`, prCol)}{" "}
              <Text color={ci.color}>{pad(ci.symbol, ciCol)}</Text>
              {pad(pr.title, titleWidth)}
            </Text>
          );
        })}
      </Box>
    );
  }

  const availWidth = cols - 4;
  const fixedCols = { state: 5, repo: 26, pr: 6, author: 14, ci: 10, reviewers: 22, activity: 14 };
  const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 7;
  const titleWidth = Math.max(20, availWidth - fixedTotal);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" flexGrow={1}>
      <Text bold>
        {pad("State", fixedCols.state)} {pad("Repo", fixedCols.repo)} {pad("PR", fixedCols.pr)} {pad("Author", fixedCols.author)} {pad("CI", fixedCols.ci)} {pad("Reviewers", fixedCols.reviewers)} {pad("Activity", fixedCols.activity)} {pad("Title", titleWidth)}
      </Text>
      <Text dimColor>Showing {scrollOffset + 1}-{scrollOffset + visible.length} of {pullRequests.length}</Text>
      {visible.map((pr, i) => {
        const selected = scrollOffset + i === selectedRowIndex;
        const badge = isUnread(state.persistedState, pr) ? "NEW" : "SEEN";
        const ci = formatCiStatus(pr);
        return (
          <Text key={pr.id} inverse={selected}>
            {pad(badge, fixedCols.state)} {pad(pr.repository, fixedCols.repo)} {pad(`#${pr.number}`, fixedCols.pr)} {pad(pr.author, fixedCols.author)}{" "}
            <Text color={ci.color}>{pad(ci.symbol, fixedCols.ci)}</Text>
            {" "}{pad(pr.requestedReviewers.join(", ") || "-", fixedCols.reviewers)} {pad(formatTimestamp(pr.activity.latestActivityAt), fixedCols.activity)} {pad(pr.title, titleWidth)}
          </Text>
        );
      })}
    </Box>
  );
}

// ── SecurityList ──────────────────────────────────────────────────────────────

function SecurityList({ state }: { state: AppState }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 200;
  const rows = stdout?.rows ?? 24;
  const visibleRows = Math.max(1, rows - 9);

  const { attentionState, securitySortMode, selectedRowIndex } = state;

  if (!attentionState.repositoryScope?.startsWith("org:")) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" flexGrow={1} paddingX={1}>
        <Text>No org scope set. Press <Text bold>o</Text> to select an organization.</Text>
      </Box>
    );
  }

  const alerts = sortSecurityAlerts(attentionState.securityAlerts, securitySortMode);
  const scrollOffset = clampScroll(selectedRowIndex, state.tableScrollOffset, visibleRows);
  const visible = alerts.slice(scrollOffset, scrollOffset + visibleRows);

  function pad(s: string, w: number) {
    if (s.length > w) return s.slice(0, Math.max(w - 3, 0)) + "...";
    return s.padEnd(w);
  }

  const availWidth = cols - 4;
  const fixedCols = { severity: 8, repo: 28, pkg: 20, ecosystem: 10, cve: 20, opened: 12 };
  const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 5;
  const summaryWidth = Math.max(20, availWidth - fixedTotal);

  function severityColor(s: AlertSeverity): string {
    switch (s) {
      case "critical": return "red";
      case "high": return "magenta";
      case "medium": return "yellow";
      case "low": return "cyan";
      default: return "gray";
    }
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" flexGrow={1}>
      <Text bold>
        {pad("Severity", fixedCols.severity)} {pad("Repo", fixedCols.repo)} {pad("Package", fixedCols.pkg)} {pad("Ecosystem", fixedCols.ecosystem)} {pad("CVE", fixedCols.cve)} {pad("Opened", fixedCols.opened)} {pad("Summary", summaryWidth)}
      </Text>
      <Text dimColor>Showing {scrollOffset + 1}-{scrollOffset + visible.length} of {alerts.length} · sort: {securitySortMode}</Text>
      {visible.map((alert, i) => {
        const selected = scrollOffset + i === selectedRowIndex;
        return (
          <Text key={alert.ghsaId} inverse={selected}>
            <Text color={severityColor(alert.severity)}>{pad(alert.severity.toUpperCase(), fixedCols.severity)}</Text>
            {" "}{pad(alert.repository, fixedCols.repo)} {pad(alert.package, fixedCols.pkg)} {pad(alert.ecosystem ?? "-", fixedCols.ecosystem)} {pad(alert.cveId ?? "-", fixedCols.cve)} {pad(formatTimestamp(alert.createdAt), fixedCols.opened)} {pad(alert.summary ?? "-", summaryWidth)}
          </Text>
        );
      })}
    </Box>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runDashboard(options: DashboardOptions): Promise<void> {
  const { waitUntilExit } = render(<Dashboard options={options} />);
  await waitUntilExit();
}

// ── Dashboard (root component) ────────────────────────────────────────────────

function Dashboard({ options }: { options: DashboardOptions }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, dispatch] = useReducer(reducer, null, () => ({
    mode: "pr" as AppMode,
    currentPrViewIndex: 0,
    selectedRowIndex: 0,
    tableScrollOffset: 0,
    activeOverlay: null as ActiveOverlay,
    securitySortMode: "severity" as SecuritySortMode,
    attentionState: options.initialAttentionState,
    persistedState: options.initialState,
    isRefreshing: false,
    queuedRefresh: null,
    loadedViews: new Set<ViewKey>(),
    lastStatus: "Starting",
    loadingMessage: null,
    detailOpen: false,
    detailPr: null,
    detailData: null,
    detailLoading: false,
    detailScrollOffset: 0,
    orgMembers: new Map<string, string[]>(),
    authorCandidates: [],
  }));

  // TODO: keyboard handling, refresh logic, and child components in later tasks
  return (
    <Box flexDirection="column" height={stdout?.rows ?? 24}>
      <Text>gh-watcher loading...</Text>
    </Box>
  );
}
