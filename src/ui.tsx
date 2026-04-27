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
