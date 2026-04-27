import React, { useCallback, useEffect, useReducer, useRef } from "react";
import { Box, render, useApp, useInput, useStdout } from "ink";
import open from "open";

import { buildNotifications, sortPullRequests } from "../domain.js";
import {
  extractOrgFromScope, fetchDependabotAlerts, fetchMyPrsData,
  fetchNeedsMyReviewData, fetchPullRequestDetail, fetchPullRequestDiff,
  fetchPullRequestsAuthoredBy
} from "../github.js";
import { sendNotifications } from "../notify.js";
import { isUnread, markSeen, saveState, updateWatchedAuthors } from "../state.js";
import type { PersistedState, PullRequestSummary, TrackedAttentionState } from "../types.js";
import { PR_VIEWS, COMMON_WATCHED_AUTHORS, clampScroll, formatTimestamp, parseDiff, sortSecurityAlerts } from "./helpers.js";
import { reducer } from "./reducer.js";
import type { ActiveOverlay, AppMode, AppState, DashboardOptions, ViewKey, WatchedAuthorOption } from "./types.js";
import { Footer } from "./components/Footer.js";
import { Header } from "./components/Header.js";
import { Overlays } from "./components/Overlays.js";
import { PrDetail } from "./components/PrDetail.js";
import { PrList } from "./components/PrList.js";
import { SecurityList } from "./components/SecurityList.js";

export { DashboardOptions };

export async function runDashboard(options: DashboardOptions): Promise<void> {
  const { waitUntilExit } = render(<Dashboard options={options} />);
  await waitUntilExit();
}

function Dashboard({ options }: { options: DashboardOptions }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, dispatch] = useReducer(reducer, null, () => ({
    mode: "pr" as AppMode,
    currentPrViewIndex: 0,
    selectedRowIndex: 0,
    tableScrollOffset: 0,
    activeOverlay: null as ActiveOverlay,
    securitySortMode: "severity" as AppState["securitySortMode"],
    attentionState: options.initialAttentionState,
    persistedState: options.initialState,
    isRefreshing: false,
    queuedRefresh: null,
    loadedViews: new Set<ViewKey>(),
    lastStatus: "Starting",
    loadingMessage: null,
    isLoadingMore: false,
    detailOpen: false,
    detailPr: null,
    detailData: null,
    detailLoading: false,
    detailScrollOffset: 0,
    detailDiff: null,
    detailDiffVisible: false,
    detailDiffFileIndex: 0,
    focusedPanel: "list" as AppState["focusedPanel"],
  }));

  const isRefreshingRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const detailPrRef = useRef<PullRequestSummary | null>(null);
  const previousAttentionRef = useRef<TrackedAttentionState>(options.initialAttentionState);

  // Live-value refs read inside doRefresh so the timer-driven callback never
  // becomes stale. Updated every render by the effect below.
  const attentionStateRef = useRef(state.attentionState);
  const persistedStateRef = useRef(state.persistedState);
  const securitySortModeRef = useRef(state.securitySortMode);
  const currentPrViewIndexRef = useRef(state.currentPrViewIndex);
  const modeRef = useRef(state.mode);
  const queuedRefreshRef = useRef<ViewKey | "all" | null>(null);
  // Incremented on each new refresh; stale async callbacks check this to self-abort
  const refreshGenerationRef = useRef(0);

  useEffect(() => {
    attentionStateRef.current = state.attentionState;
    persistedStateRef.current = state.persistedState;
    securitySortModeRef.current = state.securitySortMode;
    currentPrViewIndexRef.current = state.currentPrViewIndex;
    modeRef.current = state.mode;
  });

  const doRefresh = useCallback(async (target: ViewKey | "all"): Promise<void> => {
    if (isRefreshingRef.current) {
      queuedRefreshRef.current = target;
      dispatch({ type: "SET_QUEUED_REFRESH", target });
      return;
    }
    isRefreshingRef.current = true;
    const generation = ++refreshGenerationRef.current;
    dispatch({ type: "SET_REFRESHING", value: true });
    dispatch({ type: "SET_STATUS", status: `Refreshing ${target}…` });

    const cfg = options.config;
    const current = attentionStateRef.current;
    const viewerLogin = current.viewerLogin;
    const repositoryScope = current.repositoryScope;
    const watchedAuthor = current.watchedAuthor;

    try {
      let next: TrackedAttentionState = { ...current };

      if (target === "myPrs" || target === "all") {
        const data = await fetchMyPrsData({
          viewerLogin,
          includeDrafts: cfg.includeDrafts,
          repositoryScope,
        });
        next = {
          ...next,
          myPullRequests: data.myPullRequests,
          myPullRequestsHasMore: data.hasMore,
          myPullRequestsNextCursor: data.nextCursor,
          myPullRequestsTotalCount: data.totalCount,
          waitingOnOthers: data.waitingOnOthers,
        };
      }
      if (target === "needsMyReview" || target === "all") {
        const data = await fetchNeedsMyReviewData({
          viewerLogin,
          includeDrafts: cfg.includeDrafts,
          repositoryScope,
        });
        next = {
          ...next,
          needsMyReview: data.needsMyReview,
          needsMyReviewHasMore: data.hasMore,
          needsMyReviewNextCursor: data.nextCursor,
          needsMyReviewTotalCount: data.totalCount,
        };
      }
      if ((target === "watchedAuthor" || target === "all") && watchedAuthor) {
        // If no explicit scope set, default to the user's known orgs so results
        // aren't pulled from all of public GitHub
        const authorScope = repositoryScope ??
          (options.organizations.length > 0
            ? options.organizations.map((o) => `org:${o}`).join(" ")
            : null);
        const data = await fetchPullRequestsAuthoredBy({
          author: watchedAuthor,
          includeDrafts: cfg.includeDrafts,
          repositoryScope: authorScope,
        });
        next = {
          ...next,
          watchedAuthorPullRequests: data.pullRequests,
          watchedAuthorHasMore: data.hasMore,
          watchedAuthorNextCursor: data.nextCursor,
          watchedAuthorTotalCount: data.totalCount,
        };
      }
      if (target === "security" || target === "all") {
        const org = extractOrgFromScope(repositoryScope);
        if (org) {
          const data = await fetchDependabotAlerts(org);
          next = { ...next, securityAlerts: data.alerts, securityAlertTotal: data.total };
        }
      }

      next = { ...next, refreshedAt: new Date().toISOString() };

      const view = PR_VIEWS[currentPrViewIndexRef.current]!;
      const itemCount =
        modeRef.current === "security"
          ? next.securityAlerts.length
          : view === "myPullRequests"
          ? next.myPullRequests.length
          : view === "needsMyReview"
          ? next.needsMyReview.length
          : view === "waitingOnOthers"
          ? next.waitingOnOthers.length
          : next.watchedAuthorPullRequests.length;

      // Discard results if a newer refresh (e.g. author change) has superseded this one
      if (refreshGenerationRef.current !== generation) return;

      dispatch({ type: "UPDATE_ATTENTION_STATE", state: next, itemCount });

      if (cfg.notificationsEnabled) {
        const events = buildNotifications(previousAttentionRef.current, next, persistedStateRef.current);
        if (events.length > 0) void sendNotifications(events);
      }
      previousAttentionRef.current = next;

      dispatch({ type: "SET_STATUS", status: `Updated ${formatTimestamp(next.refreshedAt)}` });

      // Silently re-fetch open PR detail so it reflects any new CI/review state
      const openPr = detailPrRef.current;
      if (openPr) {
        const [owner, repo] = openPr.repository.split("/");
        void Promise.all([
          fetchPullRequestDetail(owner!, repo!, openPr.number),
          fetchPullRequestDiff(owner!, repo!, openPr.number).catch(() => null),
        ]).then(([data, diff]) => {
          // Only apply if the same PR is still open
          if (detailPrRef.current !== openPr) return;
          dispatch({ type: "SET_DETAIL_DATA", data });
          dispatch({ type: "SET_DETAIL_DIFF", diff });
        }).catch(() => { /* detail refresh failure is silent */ });
      }
    } catch (err) {
      if (refreshGenerationRef.current !== generation) return;
      dispatch({ type: "SET_STATUS", status: `Error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      // Only release the lock if we're still the active refresh generation
      if (refreshGenerationRef.current === generation) {
        isRefreshingRef.current = false;
        dispatch({ type: "SET_REFRESHING", value: false });
        const queued = queuedRefreshRef.current;
        if (queued) {
          queuedRefreshRef.current = null;
          dispatch({ type: "SET_QUEUED_REFRESH", target: null });
          void doRefresh(queued);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    void doRefresh("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll timer
  useEffect(() => {
    const id = setInterval(() => void doRefresh("all"), options.config.refreshMinutes * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetail(pr: PullRequestSummary): Promise<void> {
    detailPrRef.current = pr;
    dispatch({ type: "OPEN_DETAIL", pr });
    const [owner, repo] = pr.repository.split("/");
    try {
      const [result, diff] = await Promise.all([
        fetchPullRequestDetail(owner!, repo!, pr.number),
        fetchPullRequestDiff(owner!, repo!, pr.number).catch(() => null),
      ]);
      if (detailPrRef.current !== pr) return;
      dispatch({ type: "SET_DETAIL_DATA", data: result });
      dispatch({ type: "SET_DETAIL_DIFF", diff });
    } catch {
      if (detailPrRef.current !== pr) return;
      dispatch({ type: "SET_DETAIL_DATA", data: null });
    }
  }

  async function loadMore(viewKey: ViewKey): Promise<void> {
    if (isLoadingMoreRef.current || isRefreshingRef.current) return;
    const current = attentionStateRef.current;
    const cfg = options.config;
    const repositoryScope = current.repositoryScope;

    if (viewKey === "myPrs") {
      const cursor = current.myPullRequestsNextCursor ?? null;
      if (!current.myPullRequestsHasMore || !cursor) return;
      isLoadingMoreRef.current = true;
      dispatch({ type: "SET_LOADING_MORE", value: true });
      try {
        const data = await fetchMyPrsData({ viewerLogin: current.viewerLogin, includeDrafts: cfg.includeDrafts, repositoryScope, cursor });
        dispatch({ type: "APPEND_MY_PRS", pullRequests: data.myPullRequests, waitingOnOthers: data.waitingOnOthers, hasMore: data.hasMore, nextCursor: data.nextCursor });
      } catch (err) {
        dispatch({ type: "SET_STATUS", status: `Load-more failed: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        isLoadingMoreRef.current = false;
        dispatch({ type: "SET_LOADING_MORE", value: false });
      }
    } else if (viewKey === "needsMyReview") {
      const cursor = current.needsMyReviewNextCursor ?? null;
      if (!current.needsMyReviewHasMore || !cursor) return;
      isLoadingMoreRef.current = true;
      dispatch({ type: "SET_LOADING_MORE", value: true });
      try {
        const data = await fetchNeedsMyReviewData({ viewerLogin: current.viewerLogin, includeDrafts: cfg.includeDrafts, repositoryScope, cursor });
        dispatch({ type: "APPEND_NEEDS_MY_REVIEW", pullRequests: data.needsMyReview, hasMore: data.hasMore, nextCursor: data.nextCursor });
      } catch (err) {
        dispatch({ type: "SET_STATUS", status: `Load-more failed: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        isLoadingMoreRef.current = false;
        dispatch({ type: "SET_LOADING_MORE", value: false });
      }
    } else if (viewKey === "watchedAuthor" && current.watchedAuthor) {
      const cursor = current.watchedAuthorNextCursor ?? null;
      if (!current.watchedAuthorHasMore || !cursor) return;
      isLoadingMoreRef.current = true;
      dispatch({ type: "SET_LOADING_MORE", value: true });
      const authorScope = repositoryScope ??
        (options.organizations.length > 0 ? options.organizations.map((o) => `org:${o}`).join(" ") : null);
      try {
        const data = await fetchPullRequestsAuthoredBy({ author: current.watchedAuthor, includeDrafts: cfg.includeDrafts, repositoryScope: authorScope, cursor });
        dispatch({ type: "APPEND_WATCHED_AUTHOR", pullRequests: data.pullRequests, hasMore: data.hasMore, nextCursor: data.nextCursor });
      } catch (err) {
        dispatch({ type: "SET_STATUS", status: `Load-more failed: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        isLoadingMoreRef.current = false;
        dispatch({ type: "SET_LOADING_MORE", value: false });
      }
    }
  }

  function getPrsForCurrentView(): PullRequestSummary[] {
    switch (PR_VIEWS[state.currentPrViewIndex]!) {
      case "myPullRequests": return state.attentionState.myPullRequests;
      case "needsMyReview": return state.attentionState.needsMyReview;
      case "waitingOnOthers": return state.attentionState.waitingOnOthers;
      case "watchedAuthor": return state.attentionState.watchedAuthorPullRequests;
      default: return [];
    }
  }

  function currentViewKey(): ViewKey {
    switch (PR_VIEWS[state.currentPrViewIndex]!) {
      case "myPullRequests": return "myPrs";
      case "needsMyReview": return "needsMyReview";
      case "watchedAuthor": return "watchedAuthor";
      default: return "myPrs";
    }
  }

  function moveSelection(offset: number): void {
    const prs = getPrsForCurrentView();
    if (prs.length === 0) return;
    const newIdx = Math.max(0, Math.min(state.selectedRowIndex + offset, prs.length - 1));
    const visibleRows = Math.max(1, (stdout?.rows ?? 24) - 9);
    const newScroll = clampScroll(newIdx, state.tableScrollOffset, visibleRows);
    dispatch({ type: "SET_SELECTED_ROW", index: newIdx, scrollOffset: newScroll });
    if (state.detailOpen && !state.detailLoading) {
      const pr = prs[newIdx];
      if (pr) void openDetail(pr);
    }
    // Trigger load-more when within 5 rows of the end
    if (newIdx >= prs.length - 5) {
      void loadMore(currentViewKey());
    }
  }

  function buildScopeOptions(): Array<{ label: string; value: string | null }> {
    return [
      { label: "All accessible repos", value: null },
      ...options.organizations.map((org) => ({ label: `org:${org}`, value: `org:${org}` })),
    ];
  }

  function buildAuthorOptions(): WatchedAuthorOption[] {
    const recent = state.persistedState.watchedAuthors.recent;
    const orgPrefixed = options.organizations.map((org) => `org:${org}`);
    const seen = new Set([...COMMON_WATCHED_AUTHORS, ...recent, ...orgPrefixed]);
    return [
      ...orgPrefixed.map((o) => ({ label: o, value: o, custom: false })),
      ...COMMON_WATCHED_AUTHORS.filter((a) => !seen.has(a)).map((a) => ({ label: a, value: a, custom: false })),
      ...recent.filter((a) => !orgPrefixed.includes(a)).map((a) => ({ label: a, value: a, custom: false })),
      { label: "Custom...", value: null, custom: true },
    ];
  }

  function closeOverlay(): void {
    dispatch({ type: "SET_OVERLAY", overlay: null });
  }

  function openScopePicker(): void {
    dispatch({ type: "SET_OVERLAY", overlay: "scope" });
  }

  async function openAuthorPicker(): Promise<void> {
    dispatch({ type: "SET_OVERLAY", overlay: "author" });
  }

  function applyWatchedAuthor(login: string): void {
    const newWatched = updateWatchedAuthors(state.persistedState.watchedAuthors, login);
    const newPersisted: PersistedState = { ...state.persistedState, watchedAuthors: newWatched };
    dispatch({ type: "SET_PERSISTED_STATE", state: newPersisted });
    void saveState(options.config.stateFilePath, newPersisted);
    // Reflect new author in attentionState and update ref immediately so doRefresh picks it up
    const newAttention = { ...state.attentionState, watchedAuthor: login, watchedAuthorPullRequests: [], watchedAuthorHasMore: false, watchedAuthorNextCursor: null };
    dispatch({ type: "UPDATE_ATTENTION_STATE", state: newAttention, itemCount: 0 });
    attentionStateRef.current = newAttention;
    // Cancel any in-flight refresh so it won't overwrite with stale author results
    refreshGenerationRef.current++;
    isRefreshingRef.current = false;
    queuedRefreshRef.current = null;
    void doRefresh("watchedAuthor");
  }

  async function handleAuthorSelect(opt: WatchedAuthorOption): Promise<void> {
    if (opt.custom) {
      dispatch({ type: "SET_OVERLAY", overlay: "custom" });
      return;
    }
    closeOverlay();
    if (opt.value) applyWatchedAuthor(opt.value);
  }

  async function handleCustomUser(username: string): Promise<void> {
    closeOverlay();
    const trimmed = username.trim();
    if (trimmed) applyWatchedAuthor(trimmed);
  }

  async function handleScopeSelect(value: string | null): Promise<void> {
    closeOverlay();
    const newAttention = { ...state.attentionState, repositoryScope: value };
    dispatch({ type: "UPDATE_ATTENTION_STATE", state: newAttention, itemCount: 0 });
    attentionStateRef.current = newAttention;
    void doRefresh("all");
  }

  useInput((input, key) => {
    if (state.activeOverlay) return;

    if (key.leftArrow && state.detailOpen) {
      dispatch({ type: "SET_FOCUSED_PANEL", panel: "list" });
      return;
    }
    if (key.rightArrow && state.detailOpen) {
      dispatch({ type: "SET_FOCUSED_PANEL", panel: "detail" });
      return;
    }
    if (key.upArrow) {
      if (state.detailOpen && state.focusedPanel === "detail") {
        dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset - 1 });
      } else {
        moveSelection(-1);
        if (state.detailOpen) {
          const pr = getPrsForCurrentView()[Math.max(0, state.selectedRowIndex - 1)];
          if (pr) void openDetail(pr);
        }
      }
      return;
    }
    if (key.downArrow) {
      if (state.detailOpen && state.focusedPanel === "detail") {
        dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset + 1 });
      } else {
        moveSelection(1);
        if (state.detailOpen) {
          const prs = getPrsForCurrentView();
          const pr = prs[Math.min(prs.length - 1, state.selectedRowIndex + 1)];
          if (pr) void openDetail(pr);
        }
      }
      return;
    }
    if (input === "k") {
      moveSelection(-1);
      if (state.detailOpen && state.focusedPanel === "list") {
        const pr = getPrsForCurrentView()[Math.max(0, state.selectedRowIndex - 1)];
        if (pr) void openDetail(pr);
      }
      return;
    }
    if (input === "j") {
      moveSelection(1);
      if (state.detailOpen && state.focusedPanel === "list") {
        const prs = getPrsForCurrentView();
        const pr = prs[Math.min(prs.length - 1, state.selectedRowIndex + 1)];
        if (pr) void openDetail(pr);
      }
      return;
    }
    if (key.pageUp || (key.ctrl && input === "u")) {
      if (state.detailOpen) dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset - 10 });
      else moveSelection(-10);
      return;
    }
    if (key.pageDown || (key.ctrl && input === "d")) {
      if (state.detailOpen) dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset + 10 });
      else moveSelection(10);
      return;
    }
    if (input === "g") {
      dispatch({ type: "SET_SELECTED_ROW", index: 0, scrollOffset: 0 });
      return;
    }
    if (input === "G") {
      const n = getPrsForCurrentView().length - 1;
      const visibleRows = Math.max(1, (stdout?.rows ?? 24) - 9);
      dispatch({ type: "SET_SELECTED_ROW", index: Math.max(0, n), scrollOffset: Math.max(0, n - (visibleRows - 1)) });
      return;
    }

    if (key.return) {
      if (state.mode === "security") {
        const alert = sortSecurityAlerts(state.attentionState.securityAlerts, state.securitySortMode)[state.selectedRowIndex];
        if (alert) void open(alert.url);
        return;
      }
      const pr = getPrsForCurrentView()[state.selectedRowIndex];
      if (pr) void openDetail(pr);
      return;
    }
    if (key.escape) {
      if (state.detailOpen) dispatch({ type: "CLOSE_DETAIL" });
      return;
    }
    if (key.tab && state.mode === "pr") {
      const next = (state.currentPrViewIndex + 1) % PR_VIEWS.length;
      if (state.detailOpen) dispatch({ type: "CLOSE_DETAIL" });
      dispatch({ type: "SET_VIEW_INDEX", index: next });
      return;
    }
    if (input === "S") {
      dispatch({ type: "SET_MODE", mode: state.mode === "security" ? "pr" : "security" });
      return;
    }
    if (input === "s" && state.mode === "security") {
      dispatch({ type: "SET_SECURITY_SORT", sort: state.securitySortMode === "severity" ? "age" : "severity" });
      return;
    }
    if (input === "/") { void openAuthorPicker(); return; }
    if (input === "o") {
      if (state.detailOpen) {
        const pr = state.detailPr;
        if (pr) void open(pr.url);
      } else {
        openScopePicker();
      }
      return;
    }
    if (input === "r") { void doRefresh(modeRef.current === "security" ? "security" : currentViewKey()); return; }
    if (input === "m" && state.mode === "pr") {
      const pr = getPrsForCurrentView()[state.selectedRowIndex];
      if (pr) {
        const newState = markSeen(state.persistedState, [pr]);
        dispatch({ type: "SET_PERSISTED_STATE", state: newState });
        void saveState(options.config.stateFilePath, newState);
      }
      return;
    }
    if (input === "M" && state.mode === "pr") {
      const prs = getPrsForCurrentView();
      const newState = markSeen(state.persistedState, prs);
      dispatch({ type: "SET_PERSISTED_STATE", state: newState });
      void saveState(options.config.stateFilePath, newState);
      return;
    }
    if (input === "d" && state.detailOpen) {
      dispatch({ type: "TOGGLE_DETAIL_DIFF" });
      return;
    }
    if (input === "<" && state.detailOpen && state.detailDiffVisible && state.detailDiff) {
      const files = parseDiff(state.detailDiff);
      const next = Math.max(0, state.detailDiffFileIndex - 1);
      dispatch({ type: "SET_DIFF_FILE_INDEX", index: next });
      return;
    }
    if (input === ">" && state.detailOpen && state.detailDiffVisible && state.detailDiff) {
      const files = parseDiff(state.detailDiff);
      const next = Math.min(files.length - 1, state.detailDiffFileIndex + 1);
      dispatch({ type: "SET_DIFF_FILE_INDEX", index: next });
      return;
    }
    if (input === "q" || (key.ctrl && input === "c")) { exit(); return; }
  });

  const showOverlay = state.activeOverlay !== null;

  return (
    <Box flexDirection="column" height={stdout?.rows ?? 24}>
      <Header state={state} />
      {showOverlay ? (
        <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          <Overlays
            state={state}
            authorOptions={buildAuthorOptions()}
            scopeOptions={buildScopeOptions()}
            onAuthorSelect={handleAuthorSelect}
            onScopeSelect={handleScopeSelect}
            onCustomUser={handleCustomUser}
            onCancel={closeOverlay}
          />
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          {state.mode === "pr" && <PrList state={state} narrow={state.detailOpen} />}
          {state.mode === "security" && <SecurityList state={state} />}
          {state.detailOpen && <PrDetail state={state} />}
        </Box>
      )}
      <Footer state={state} />
    </Box>
  );
}
