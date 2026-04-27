import type { AppConfig, PersistedState, PullRequestDetail, PullRequestSummary, SecuritySortMode, TrackedAttentionState } from "../types.js";

export type AppMode = "pr" | "security" | "messages";
export type ActiveOverlay = "author" | "scope" | "custom" | null;
export type ViewKey = "myPrs" | "needsMyReview" | "watchedAuthor" | "security" | "messages";

export interface WatchedAuthorOption { label: string; value: string | null; custom: boolean; }

export interface DashboardOptions {
  config: AppConfig;
  organizations: string[];
  initialState: PersistedState;
  initialAttentionState: TrackedAttentionState;
}

export interface AppState {
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
  isLoadingMore: boolean;
  detailOpen: boolean;
  detailPr: PullRequestSummary | null;
  detailData: PullRequestDetail | null;
  detailLoading: boolean;
  detailScrollOffset: number;
  detailDiff: string | null;
  detailDiffVisible: boolean;
  detailDiffFileIndex: number;
  focusedPanel: "list" | "detail";
  messagesShowAll: boolean;
}

export type Action =
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
  | { type: "APPEND_MY_PRS"; pullRequests: PullRequestSummary[]; waitingOnOthers: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null }
  | { type: "APPEND_NEEDS_MY_REVIEW"; pullRequests: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null }
  | { type: "APPEND_WATCHED_AUTHOR"; pullRequests: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null }
  | { type: "SET_LOADING_MORE"; value: boolean }
  | { type: "SET_DETAIL_DIFF"; diff: string | null }
  | { type: "TOGGLE_DETAIL_DIFF" }
  | { type: "SET_DIFF_FILE_INDEX"; index: number }
  | { type: "SET_FOCUSED_PANEL"; panel: "list" | "detail" }
  | { type: "SET_MESSAGES_SHOW_ALL"; value: boolean }
  | { type: "MARK_NOTIFICATION_READ"; threadId: string }
  | { type: "MARK_ALL_NOTIFICATIONS_READ" };
