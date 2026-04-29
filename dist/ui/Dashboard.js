import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { Box, render, useApp, useInput } from "ink";
import { useTerminalSize } from "./useTerminalSize.js";
import open from "open";
import { buildNotifications } from "../domain.js";
import { clearFetchCache, extractOrgFromScope, fetchAccessibleRepos, fetchDependabotAlerts, fetchMyPrsData, fetchNeedsMyReviewData, fetchNotifications, fetchPullRequestDetail, fetchPullRequestDiff, fetchPullRequestsAuthoredBy, fetchRepoPullRequests, markNotificationRead, markAllNotificationsRead, } from "../github.js";
import { sendNotifications } from "../notify.js";
import { markSeen, saveState, updateWatchedAuthors } from "../state.js";
import { saveSettings } from "../settings.js";
import { PR_VIEWS, COMMON_WATCHED_AUTHORS, clampScroll, formatTimestamp, groupByRepo, parseDiff, sortSecurityAlerts } from "./helpers.js";
import { reducer } from "./reducer.js";
import { Footer } from "./components/Footer.js";
import { Header } from "./components/Header.js";
import { Overlays } from "./components/Overlays.js";
import { PrDetail } from "./components/PrDetail.js";
import { PrList } from "./components/PrList.js";
import { SecurityList } from "./components/SecurityList.js";
import { MessagesList } from "./components/MessagesList.js";
import { RepoList } from "./components/RepoList.js";
import { RepoDetail } from "./components/RepoDetail.js";
export async function runDashboard(options) {
    const { waitUntilExit } = render(_jsx(Dashboard, { options: options }));
    await waitUntilExit();
}
function Dashboard({ options }) {
    const { exit } = useApp();
    const { rows: termRows } = useTerminalSize();
    const [state, dispatch] = useReducer(reducer, null, () => ({
        mode: "pr",
        currentPrViewIndex: 0,
        selectedRowIndex: 0,
        tableScrollOffset: 0,
        activeOverlay: null,
        securitySortMode: "severity",
        attentionState: options.initialAttentionState,
        persistedState: options.initialState,
        isRefreshing: false,
        queuedRefresh: null,
        loadedViews: new Set(),
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
        focusedPanel: "list",
        messagesShowAll: false,
        includeDraftsOverride: null,
        viewScrollState: {},
        repoListIndex: 0,
        repoDetailRepo: null,
        repoSortMode: "activity",
        repoDetailPrs: [],
        repoDetailPrsLoading: false,
        accessibleRepos: [],
        userSettings: options.userSettings,
    }));
    const isRefreshingRef = useRef(false);
    const isLoadingMoreRef = useRef(false);
    const detailPrRef = useRef(null);
    const previousAttentionRef = useRef(options.initialAttentionState);
    const userSettingsRef = useRef(options.userSettings);
    const lastRefreshedAt = useRef({});
    const isInitialSettingsRender = useRef(true);
    // Live-value refs read inside doRefresh so the timer-driven callback never
    // becomes stale. Updated every render by the effect below.
    const attentionStateRef = useRef(state.attentionState);
    const persistedStateRef = useRef(state.persistedState);
    const securitySortModeRef = useRef(state.securitySortMode);
    const currentPrViewIndexRef = useRef(state.currentPrViewIndex);
    const modeRef = useRef(state.mode);
    const queuedRefreshRef = useRef(null);
    const includeDraftsOverrideRef = useRef(null);
    // Incremented on each new refresh; stale async callbacks check this to self-abort
    const refreshGenerationRef = useRef(0);
    useEffect(() => {
        attentionStateRef.current = state.attentionState;
        persistedStateRef.current = state.persistedState;
        securitySortModeRef.current = state.securitySortMode;
        currentPrViewIndexRef.current = state.currentPrViewIndex;
        modeRef.current = state.mode;
        includeDraftsOverrideRef.current = state.includeDraftsOverride;
        userSettingsRef.current = state.userSettings;
    });
    const doRefresh = useCallback(async (target) => {
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
        const effectiveIncludeDrafts = includeDraftsOverrideRef.current ?? cfg.includeDrafts;
        const current = attentionStateRef.current;
        const viewerLogin = current.viewerLogin;
        const repositoryScope = current.repositoryScope;
        const watchedAuthor = current.watchedAuthor;
        try {
            let next = { ...current };
            if (target === "myPrs" || (target === "all" && userSettingsRef.current.sources.pr.enabled)) {
                const data = await fetchMyPrsData({
                    viewerLogin,
                    includeDrafts: effectiveIncludeDrafts,
                    repositoryScope,
                });
                next = {
                    ...next,
                    myPullRequests: data.myPullRequests,
                    myPullRequestsHasMore: data.hasMore,
                    myPullRequestsNextCursor: data.nextCursor,
                    myPullRequestsTotalCount: data.totalCount,
                    waitingOnOthers: data.waitingOnOthers,
                    readyToMerge: data.readyToMerge,
                };
            }
            if (target === "needsMyReview" || (target === "all" && userSettingsRef.current.sources.pr.enabled)) {
                const data = await fetchNeedsMyReviewData({
                    viewerLogin,
                    includeDrafts: effectiveIncludeDrafts,
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
                    includeDrafts: effectiveIncludeDrafts,
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
            if (target === "security" || (target === "all" && userSettingsRef.current.sources.security.enabled)) {
                // Prefer the explicitly-scoped org; otherwise query all known orgs in parallel
                const scopedOrg = extractOrgFromScope(repositoryScope);
                const orgsToQuery = scopedOrg ? [scopedOrg] : options.organizations;
                if (orgsToQuery.length > 0) {
                    const results = await Promise.all(orgsToQuery.map((o) => fetchDependabotAlerts(o)));
                    const alerts = results.flatMap((r) => r.alerts);
                    const total = results.reduce((sum, r) => sum + r.total, 0);
                    next = { ...next, securityAlerts: alerts, securityAlertTotal: total };
                }
            }
            if (target === "messages" || (target === "all" && userSettingsRef.current.sources.messages.enabled)) {
                try {
                    const notifications = await fetchNotifications();
                    const unreadCount = notifications.filter(n => n.unread).length;
                    next = { ...next, notifications, notificationUnreadCount: unreadCount };
                }
                catch {
                    // notifications fetch failure is non-fatal
                }
            }
            if (target === "repos" || (target === "all" && userSettingsRef.current.sources.repos.enabled)) {
                try {
                    const repos = await fetchAccessibleRepos(options.organizations, repositoryScope);
                    // Dispatch separately so this never gets wiped by stale UPDATE_ATTENTION_STATE calls
                    if (refreshGenerationRef.current === generation) {
                        dispatch({ type: "SET_ACCESSIBLE_REPOS", repos });
                    }
                }
                catch {
                    // repo list fetch failure is non-fatal
                }
            }
            next = { ...next, refreshedAt: new Date().toISOString() };
            const view = PR_VIEWS[currentPrViewIndexRef.current];
            const itemCount = modeRef.current === "security"
                ? next.securityAlerts.length
                : modeRef.current === "messages"
                    ? next.notifications.length
                    : modeRef.current === "repos"
                        ? 0
                        : view === "myPullRequests"
                            ? next.myPullRequests.length
                            : view === "needsMyReview"
                                ? next.needsMyReview.length
                                : view === "waitingOnOthers"
                                    ? next.waitingOnOthers.length
                                    : view === "readyToMerge"
                                        ? next.readyToMerge.length
                                        : next.watchedAuthorPullRequests.length;
            // Discard results if a newer refresh (e.g. author change) has superseded this one
            if (refreshGenerationRef.current !== generation)
                return;
            dispatch({ type: "UPDATE_ATTENTION_STATE", state: next, itemCount });
            if (userSettingsRef.current.notifications.enabled) {
                const events = buildNotifications(previousAttentionRef.current, next, persistedStateRef.current);
                if (events.length > 0)
                    void sendNotifications(events);
            }
            previousAttentionRef.current = next;
            dispatch({ type: "SET_STATUS", status: `Updated ${formatTimestamp(next.refreshedAt)}` });
            // Silently re-fetch open PR detail so it reflects any new CI/review state
            const openPr = detailPrRef.current;
            if (openPr) {
                const [owner, repo] = openPr.repository.split("/");
                void Promise.all([
                    fetchPullRequestDetail(owner, repo, openPr.number),
                    fetchPullRequestDiff(owner, repo, openPr.number).catch(() => null),
                ]).then(([data, diff]) => {
                    // Only apply if the same PR is still open
                    if (detailPrRef.current !== openPr)
                        return;
                    dispatch({ type: "SET_DETAIL_DATA", data });
                    dispatch({ type: "SET_DETAIL_DIFF", diff });
                }).catch(() => { });
            }
        }
        catch (err) {
            if (refreshGenerationRef.current !== generation)
                return;
            dispatch({ type: "SET_STATUS", status: `Error: ${err instanceof Error ? err.message : String(err)}` });
        }
        finally {
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
    // Initial fetch on mount: load current tab first, then everything else
    useEffect(() => {
        const initialTarget = modeRef.current === "security" ? "security"
            : modeRef.current === "messages" ? "messages"
                : modeRef.current === "repos" ? "repos"
                    : "myPrs";
        void doRefresh(initialTarget).then(() => void doRefresh("all"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Persist settings whenever they change, but skip the initial mount
    // (initial state may include session-only CLI overrides that must not be written to disk)
    useEffect(() => {
        if (isInitialSettingsRender.current) {
            isInitialSettingsRender.current = false;
            return;
        }
        const settingsPath = join(dirname(options.config.stateFilePath), "settings.json");
        void saveSettings(settingsPath, state.userSettings);
    }, [state.userSettings, options.config.stateFilePath]);
    // If active mode is disabled in settings, switch to first enabled mode
    useEffect(() => {
        const modes = ["pr", "security", "messages", "repos"];
        if (!state.userSettings.sources[state.mode].enabled) {
            const first = modes.find(m => state.userSettings.sources[m].enabled);
            if (first)
                dispatch({ type: "SET_MODE", mode: first });
        }
    }, [state.userSettings, state.mode]);
    // Per-source polling heartbeat — ticks every minute, each source fires on its own cadence
    useEffect(() => {
        const REFRESH_FOR_MODE = {
            pr: "all",
            security: "security",
            messages: "messages",
            repos: "repos",
        };
        const id = setInterval(() => {
            const settings = userSettingsRef.current;
            const modes = ["pr", "security", "messages", "repos"];
            for (const mode of modes) {
                const src = settings.sources[mode];
                if (!src.enabled)
                    continue;
                const last = lastRefreshedAt.current[mode] ?? 0;
                if (Date.now() - last >= src.pollMinutes * 60_000) {
                    lastRefreshedAt.current[mode] = Date.now();
                    void doRefresh(REFRESH_FOR_MODE[mode]);
                }
            }
        }, 60_000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    async function openRepoDetail(nameWithOwner) {
        dispatch({ type: "OPEN_REPO_DETAIL", repo: nameWithOwner });
        const [owner, repo] = nameWithOwner.split("/");
        try {
            const prs = await fetchRepoPullRequests(owner, repo);
            dispatch({ type: "SET_REPO_DETAIL_PRS", prs });
        }
        catch {
            dispatch({ type: "SET_REPO_DETAIL_PRS_LOADING", value: false });
        }
    }
    async function openDetail(pr) {
        detailPrRef.current = pr;
        dispatch({ type: "OPEN_DETAIL", pr });
        const [owner, repo] = pr.repository.split("/");
        try {
            const [result, diff] = await Promise.all([
                fetchPullRequestDetail(owner, repo, pr.number),
                fetchPullRequestDiff(owner, repo, pr.number).catch(() => null),
            ]);
            if (detailPrRef.current !== pr)
                return;
            dispatch({ type: "SET_DETAIL_DATA", data: result });
            dispatch({ type: "SET_DETAIL_DIFF", diff });
        }
        catch {
            if (detailPrRef.current !== pr)
                return;
            dispatch({ type: "SET_DETAIL_DATA", data: null });
        }
    }
    async function loadMore(viewKey) {
        if (isLoadingMoreRef.current || isRefreshingRef.current)
            return;
        const current = attentionStateRef.current;
        const cfg = options.config;
        const repositoryScope = current.repositoryScope;
        if (viewKey === "myPrs") {
            const cursor = current.myPullRequestsNextCursor ?? null;
            if (!current.myPullRequestsHasMore || !cursor)
                return;
            isLoadingMoreRef.current = true;
            dispatch({ type: "SET_LOADING_MORE", value: true });
            try {
                const data = await fetchMyPrsData({ viewerLogin: current.viewerLogin, includeDrafts: cfg.includeDrafts, repositoryScope, cursor });
                dispatch({ type: "APPEND_MY_PRS", pullRequests: data.myPullRequests, waitingOnOthers: data.waitingOnOthers, readyToMerge: data.readyToMerge, hasMore: data.hasMore, nextCursor: data.nextCursor });
            }
            catch (err) {
                dispatch({ type: "SET_STATUS", status: `Load-more failed: ${err instanceof Error ? err.message : String(err)}` });
            }
            finally {
                isLoadingMoreRef.current = false;
                dispatch({ type: "SET_LOADING_MORE", value: false });
            }
        }
        else if (viewKey === "needsMyReview") {
            const cursor = current.needsMyReviewNextCursor ?? null;
            if (!current.needsMyReviewHasMore || !cursor)
                return;
            isLoadingMoreRef.current = true;
            dispatch({ type: "SET_LOADING_MORE", value: true });
            try {
                const data = await fetchNeedsMyReviewData({ viewerLogin: current.viewerLogin, includeDrafts: cfg.includeDrafts, repositoryScope, cursor });
                dispatch({ type: "APPEND_NEEDS_MY_REVIEW", pullRequests: data.needsMyReview, hasMore: data.hasMore, nextCursor: data.nextCursor });
            }
            catch (err) {
                dispatch({ type: "SET_STATUS", status: `Load-more failed: ${err instanceof Error ? err.message : String(err)}` });
            }
            finally {
                isLoadingMoreRef.current = false;
                dispatch({ type: "SET_LOADING_MORE", value: false });
            }
        }
        else if (viewKey === "watchedAuthor" && current.watchedAuthor) {
            const cursor = current.watchedAuthorNextCursor ?? null;
            if (!current.watchedAuthorHasMore || !cursor)
                return;
            isLoadingMoreRef.current = true;
            dispatch({ type: "SET_LOADING_MORE", value: true });
            const authorScope = repositoryScope ??
                (options.organizations.length > 0 ? options.organizations.map((o) => `org:${o}`).join(" ") : null);
            try {
                const data = await fetchPullRequestsAuthoredBy({ author: current.watchedAuthor, includeDrafts: cfg.includeDrafts, repositoryScope: authorScope, cursor });
                dispatch({ type: "APPEND_WATCHED_AUTHOR", pullRequests: data.pullRequests, hasMore: data.hasMore, nextCursor: data.nextCursor });
            }
            catch (err) {
                dispatch({ type: "SET_STATUS", status: `Load-more failed: ${err instanceof Error ? err.message : String(err)}` });
            }
            finally {
                isLoadingMoreRef.current = false;
                dispatch({ type: "SET_LOADING_MORE", value: false });
            }
        }
    }
    function getPrsForCurrentView() {
        switch (PR_VIEWS[state.currentPrViewIndex]) {
            case "myPullRequests": return state.attentionState.myPullRequests;
            case "needsMyReview": return state.attentionState.needsMyReview;
            case "waitingOnOthers": return state.attentionState.waitingOnOthers;
            case "readyToMerge": return state.attentionState.readyToMerge;
            case "watchedAuthor": return state.attentionState.watchedAuthorPullRequests;
            default: return [];
        }
    }
    function currentViewKey() {
        switch (PR_VIEWS[state.currentPrViewIndex]) {
            case "myPullRequests": return "myPrs";
            case "needsMyReview": return "needsMyReview";
            case "watchedAuthor": return "watchedAuthor";
            case "waitingOnOthers": return "myPrs";
            case "readyToMerge": return "myPrs";
            default: return "myPrs";
        }
    }
    function moveSelection(offset, repos) {
        const visibleRows = Math.max(1, (termRows) - 9);
        if (state.mode === "repos") {
            if (state.repoDetailRepo) {
                const prs = state.repoDetailPrs;
                if (prs.length === 0)
                    return;
                const newIdx = Math.max(0, Math.min(state.selectedRowIndex + offset, prs.length - 1));
                const newScroll = clampScroll(newIdx, state.tableScrollOffset, visibleRows);
                dispatch({ type: "SET_SELECTED_ROW", index: newIdx, scrollOffset: newScroll });
            }
            else {
                if (repos.length === 0)
                    return;
                const newIdx = Math.max(0, Math.min(state.repoListIndex + offset, repos.length - 1));
                dispatch({ type: "SET_REPO_LIST_INDEX", index: newIdx });
            }
            return;
        }
        if (state.mode === "security") {
            const alerts = sortSecurityAlerts(state.attentionState.securityAlerts, state.securitySortMode);
            if (alerts.length === 0)
                return;
            const newIdx = Math.max(0, Math.min(state.selectedRowIndex + offset, alerts.length - 1));
            const newScroll = clampScroll(newIdx, state.tableScrollOffset, visibleRows);
            dispatch({ type: "SET_SELECTED_ROW", index: newIdx, scrollOffset: newScroll });
            return;
        }
        if (state.mode === "messages") {
            const items = state.messagesShowAll
                ? state.attentionState.notifications
                : state.attentionState.notifications.filter(n => n.unread);
            if (items.length === 0)
                return;
            const newIdx = Math.max(0, Math.min(state.selectedRowIndex + offset, items.length - 1));
            const newScroll = clampScroll(newIdx, state.tableScrollOffset, visibleRows);
            dispatch({ type: "SET_SELECTED_ROW", index: newIdx, scrollOffset: newScroll });
            return;
        }
        const prs = getPrsForCurrentView();
        if (prs.length === 0)
            return;
        const newIdx = Math.max(0, Math.min(state.selectedRowIndex + offset, prs.length - 1));
        const newScroll = clampScroll(newIdx, state.tableScrollOffset, visibleRows);
        dispatch({ type: "SET_SELECTED_ROW", index: newIdx, scrollOffset: newScroll });
        if (state.detailOpen && !state.detailLoading) {
            const pr = prs[newIdx];
            if (pr)
                void openDetail(pr);
        }
        // Trigger load-more when within 5 rows of the end
        if (newIdx >= prs.length - 5) {
            void loadMore(currentViewKey());
        }
    }
    function buildScopeOptions() {
        return [
            { label: "All accessible repos", value: null },
            ...options.organizations.map((org) => ({ label: `org:${org}`, value: `org:${org}` })),
        ];
    }
    function buildAuthorOptions() {
        const recent = state.persistedState.watchedAuthors.recent;
        const seen = new Set([...COMMON_WATCHED_AUTHORS, ...recent]);
        return [
            ...COMMON_WATCHED_AUTHORS.filter((a) => !seen.has(a)).map((a) => ({ label: a, value: a, custom: false })),
            ...recent.map((a) => ({ label: a, value: a, custom: false })),
            { label: "Custom...", value: null, custom: true },
        ];
    }
    function handleSettingsChange(settings) {
        dispatch({ type: "UPDATE_SETTINGS", settings });
    }
    function closeOverlay() {
        dispatch({ type: "SET_OVERLAY", overlay: null });
    }
    function openScopePicker() {
        dispatch({ type: "SET_OVERLAY", overlay: "scope" });
    }
    async function openAuthorPicker() {
        dispatch({ type: "SET_OVERLAY", overlay: "author" });
    }
    function applyWatchedAuthor(login) {
        const newWatched = updateWatchedAuthors(state.persistedState.watchedAuthors, login);
        const newPersisted = { ...state.persistedState, watchedAuthors: newWatched };
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
    async function handleAuthorSelect(opt) {
        if (opt.custom) {
            dispatch({ type: "SET_OVERLAY", overlay: "custom" });
            return;
        }
        closeOverlay();
        if (opt.value)
            applyWatchedAuthor(opt.value);
    }
    async function handleCustomUser(username) {
        closeOverlay();
        const trimmed = username.trim();
        if (trimmed)
            applyWatchedAuthor(trimmed);
    }
    async function handleScopeSelect(value) {
        closeOverlay();
        const newAttention = { ...state.attentionState, repositoryScope: value };
        dispatch({ type: "UPDATE_ATTENTION_STATE", state: newAttention, itemCount: 0 });
        attentionStateRef.current = newAttention;
        void doRefresh("all");
    }
    const repos = groupByRepo([
        ...state.attentionState.myPullRequests,
        ...state.attentionState.needsMyReview,
        ...state.attentionState.waitingOnOthers,
        ...state.attentionState.readyToMerge,
    ], state.attentionState.needsMyReview, state.attentionState.securityAlerts, state.repoSortMode, state.accessibleRepos);
    useInput((input, key) => {
        if (state.activeOverlay)
            return;
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
            }
            else {
                moveSelection(-1, repos);
                if (state.detailOpen) {
                    const pr = getPrsForCurrentView()[Math.max(0, state.selectedRowIndex - 1)];
                    if (pr)
                        void openDetail(pr);
                }
            }
            return;
        }
        if (key.downArrow) {
            if (state.detailOpen && state.focusedPanel === "detail") {
                dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset + 1 });
            }
            else {
                moveSelection(1, repos);
                if (state.detailOpen) {
                    const prs = getPrsForCurrentView();
                    const pr = prs[Math.min(prs.length - 1, state.selectedRowIndex + 1)];
                    if (pr)
                        void openDetail(pr);
                }
            }
            return;
        }
        if (input === "k") {
            moveSelection(-1, repos);
            if (state.detailOpen && state.focusedPanel === "list") {
                const pr = getPrsForCurrentView()[Math.max(0, state.selectedRowIndex - 1)];
                if (pr)
                    void openDetail(pr);
            }
            return;
        }
        if (input === "j") {
            moveSelection(1, repos);
            if (state.detailOpen && state.focusedPanel === "list") {
                const prs = getPrsForCurrentView();
                const pr = prs[Math.min(prs.length - 1, state.selectedRowIndex + 1)];
                if (pr)
                    void openDetail(pr);
            }
            return;
        }
        if (key.pageUp || (key.ctrl && input === "u")) {
            if (state.detailOpen)
                dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset - 10 });
            else
                moveSelection(-10, repos);
            return;
        }
        if (key.pageDown || (key.ctrl && input === "d")) {
            if (state.detailOpen)
                dispatch({ type: "SET_DETAIL_SCROLL", offset: state.detailScrollOffset + 10 });
            else
                moveSelection(10, repos);
            return;
        }
        if (input === "g") {
            dispatch({ type: "SET_SELECTED_ROW", index: 0, scrollOffset: 0 });
            return;
        }
        if (input === "G") {
            const n = getPrsForCurrentView().length - 1;
            const visibleRows = Math.max(1, (termRows) - 9);
            dispatch({ type: "SET_SELECTED_ROW", index: Math.max(0, n), scrollOffset: Math.max(0, n - (visibleRows - 1)) });
            return;
        }
        if (key.return) {
            if (state.mode === "repos") {
                if (state.repoDetailRepo) {
                    const pr = state.repoDetailPrs[state.selectedRowIndex];
                    if (pr)
                        void openDetail(pr);
                }
                else {
                    const repo = repos[state.repoListIndex];
                    if (repo)
                        void openRepoDetail(repo.nameWithOwner);
                }
                return;
            }
            if (state.mode === "messages") {
                const items = state.messagesShowAll
                    ? state.attentionState.notifications
                    : state.attentionState.notifications.filter(n => n.unread);
                const n = items[state.selectedRowIndex];
                if (n) {
                    let webUrl = null;
                    if (n.subject.url) {
                        const converted = n.subject.url
                            .replace("https://api.github.com/repos/", "https://github.com/")
                            .replace(/\/pulls\/(\d+)$/, "/pull/$1")
                            .replace(/\/commits\/([0-9a-f]+)$/, "/commit/$1")
                            // CheckSuite has no direct web URL — redirect to Actions tab
                            .replace(/\/check-suites\/\d+$/, "/actions");
                        webUrl = converted;
                    }
                    // Fall back to the repository page
                    if (!webUrl)
                        webUrl = `https://github.com/${n.repository}`;
                    execFile("open", ["-u", webUrl]);
                }
                return;
            }
            if (state.mode === "security") {
                const alert = sortSecurityAlerts(state.attentionState.securityAlerts, state.securitySortMode)[state.selectedRowIndex];
                if (alert)
                    void open(alert.url);
                return;
            }
            const pr = getPrsForCurrentView()[state.selectedRowIndex];
            if (pr)
                void openDetail(pr);
            return;
        }
        if (key.escape) {
            if (state.mode === "repos" && state.repoDetailRepo) {
                dispatch({ type: "CLOSE_REPO_DETAIL" });
                return;
            }
            if (state.detailOpen)
                dispatch({ type: "CLOSE_DETAIL" });
            return;
        }
        if (key.tab && state.mode === "pr") {
            if (key.shift) {
                const prev = (state.currentPrViewIndex - 1 + PR_VIEWS.length) % PR_VIEWS.length;
                if (state.detailOpen)
                    dispatch({ type: "CLOSE_DETAIL" });
                dispatch({ type: "SET_VIEW_INDEX", index: prev });
            }
            else {
                const next = (state.currentPrViewIndex + 1) % PR_VIEWS.length;
                if (state.detailOpen)
                    dispatch({ type: "CLOSE_DETAIL" });
                dispatch({ type: "SET_VIEW_INDEX", index: next });
            }
            return;
        }
        // Numeric keys switch to the Nth enabled mode
        {
            const enabledModes = ["pr", "security", "messages", "repos"]
                .filter(m => state.userSettings.sources[m].enabled);
            const numIdx = ["1", "2", "3", "4"].indexOf(input);
            if (numIdx >= 0 && numIdx < enabledModes.length) {
                const targetMode = enabledModes[numIdx];
                dispatch({ type: "SET_MODE", mode: targetMode });
                if (targetMode === "repos" && state.accessibleRepos.length === 0 && !state.isRefreshing) {
                    void doRefresh("repos");
                }
                return;
            }
        }
        if (input === "p") {
            dispatch({ type: "SET_MODE", mode: "repos" });
            if (state.accessibleRepos.length === 0 && !state.isRefreshing) {
                void doRefresh("repos");
            }
            return;
        }
        if (input === "a" && state.mode === "messages") {
            dispatch({ type: "SET_MESSAGES_SHOW_ALL", value: !state.messagesShowAll });
            return;
        }
        if (input === "s" && state.mode === "security") {
            dispatch({ type: "SET_SECURITY_SORT", sort: state.securitySortMode === "severity" ? "age" : "severity" });
            return;
        }
        if (input === "s" && state.mode === "repos") {
            const next = state.repoSortMode === "activity" ? "alerts" : state.repoSortMode === "alerts" ? "name" : "activity";
            dispatch({ type: "SET_REPO_SORT", sort: next });
            return;
        }
        if (input === "/") {
            void openAuthorPicker();
            return;
        }
        if (input === "b" && state.mode === "pr") {
            if (state.detailOpen) {
                const pr = state.detailPr;
                if (pr)
                    void open(pr.url);
            }
            else {
                const pr = getPrsForCurrentView()[state.selectedRowIndex];
                if (pr)
                    void open(pr.url);
            }
            return;
        }
        if (input === "D" && state.mode === "pr") {
            dispatch({ type: "TOGGLE_DRAFTS_OVERRIDE" });
            const next = state.includeDraftsOverride === null ? true : state.includeDraftsOverride === true ? false : null;
            const label = next === null ? "default" : next ? "shown" : "hidden";
            dispatch({ type: "SET_STATUS", status: `Draft PRs: ${label}` });
            includeDraftsOverrideRef.current = next;
            void doRefresh("myPrs");
            void doRefresh("needsMyReview");
            void doRefresh("watchedAuthor");
            return;
        }
        if (input === "o") {
            if (state.detailOpen) {
                const pr = state.detailPr;
                if (pr)
                    void open(pr.url);
            }
            else {
                openScopePicker();
            }
            return;
        }
        if (input === "r") {
            clearFetchCache();
            const target = modeRef.current === "security" ? "security"
                : modeRef.current === "messages" ? "messages"
                    : modeRef.current === "repos" ? "repos"
                        : currentViewKey();
            void doRefresh(target);
            return;
        }
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
        if (input === "m" && state.mode === "messages") {
            const items = state.messagesShowAll
                ? state.attentionState.notifications
                : state.attentionState.notifications.filter(n => n.unread);
            const n = items[state.selectedRowIndex];
            if (n?.unread) {
                dispatch({ type: "MARK_NOTIFICATION_READ", threadId: n.id });
                void markNotificationRead(n.id).catch(() => { });
            }
            return;
        }
        if (input === "M" && state.mode === "messages") {
            dispatch({ type: "MARK_ALL_NOTIFICATIONS_READ" });
            void markAllNotificationsRead().catch(() => { });
            return;
        }
        if (input === "d" && state.detailOpen) {
            dispatch({ type: "TOGGLE_DETAIL_DIFF" });
            return;
        }
        if (input === "<" && state.detailOpen && state.detailDiffVisible && state.detailDiff) {
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
        if (input === ",") {
            dispatch({ type: "SET_OVERLAY", overlay: state.activeOverlay === "settings" ? null : "settings" });
            return;
        }
        if (input === "q" || (key.ctrl && input === "c")) {
            exit();
            return;
        }
    });
    const showOverlay = state.activeOverlay !== null;
    return (_jsxs(Box, { flexDirection: "column", height: termRows, children: [_jsx(Header, { state: state }), showOverlay ? (_jsx(Box, { flexGrow: 1, flexDirection: "column", paddingX: 2, paddingY: 1, children: _jsx(Overlays, { state: state, authorOptions: buildAuthorOptions(), scopeOptions: buildScopeOptions(), onAuthorSelect: handleAuthorSelect, onScopeSelect: handleScopeSelect, onCustomUser: handleCustomUser, onCancel: closeOverlay, userSettings: state.userSettings, onSettingsChange: handleSettingsChange, onSettingsClose: closeOverlay }) })) : (_jsxs(Box, { flexDirection: "row", flexGrow: 1, children: [state.mode === "pr" && _jsx(PrList, { state: state, narrow: state.detailOpen }), state.mode === "security" && _jsx(SecurityList, { state: state, hasOrgs: options.organizations.length > 0 }), state.mode === "messages" && _jsx(MessagesList, { state: state }), state.mode === "repos" && !state.repoDetailRepo && _jsx(RepoList, { state: state, repos: repos }), state.mode === "repos" && state.repoDetailRepo && (() => {
                        const repo = repos.find(r => r.nameWithOwner === state.repoDetailRepo);
                        return repo ? _jsx(RepoDetail, { state: state, repo: repo }) : null;
                    })(), state.detailOpen && _jsx(PrDetail, { state: state })] })), _jsx(Footer, { state: state })] }));
}
