import type { Action, AppState } from "./types.js";

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, selectedRowIndex: 0, tableScrollOffset: 0 };
    case "SET_VIEW_INDEX": {
      const oldKey = String(state.currentPrViewIndex);
      const newKey = String(action.index);
      const savedScroll = state.viewScrollState[newKey] ?? { selectedRowIndex: 0, tableScrollOffset: 0 };
      return {
        ...state,
        currentPrViewIndex: action.index,
        selectedRowIndex: savedScroll.selectedRowIndex,
        tableScrollOffset: savedScroll.tableScrollOffset,
        viewScrollState: {
          ...state.viewScrollState,
          [oldKey]: { selectedRowIndex: state.selectedRowIndex, tableScrollOffset: state.tableScrollOffset },
        },
      };
    }
    case "SET_SELECTED_ROW":
      return {
        ...state,
        selectedRowIndex: action.index,
        tableScrollOffset: action.scrollOffset,
        viewScrollState: {
          ...state.viewScrollState,
          [String(state.currentPrViewIndex)]: { selectedRowIndex: action.index, tableScrollOffset: action.scrollOffset },
        },
      };
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
      return { ...state, detailOpen: true, detailPr: action.pr, detailData: null, detailLoading: true, detailScrollOffset: 0, detailDiff: null, detailDiffVisible: false, detailDiffFileIndex: 0, focusedPanel: "detail" };
    case "SET_DETAIL_DATA":
      return { ...state, detailData: action.data, detailLoading: false };
    case "SET_DETAIL_SCROLL":
      return { ...state, detailScrollOffset: Math.max(0, action.offset) };
    case "CLOSE_DETAIL":
      return { ...state, detailOpen: false, detailPr: null, detailData: null, detailLoading: false, detailScrollOffset: 0, detailDiff: null, detailDiffVisible: false, detailDiffFileIndex: 0, focusedPanel: "list" };
    case "SET_DETAIL_DIFF":
      return { ...state, detailDiff: action.diff };
    case "TOGGLE_DETAIL_DIFF":
      return { ...state, detailDiffVisible: !state.detailDiffVisible, detailDiffFileIndex: 0, detailScrollOffset: 0 };
    case "SET_DIFF_FILE_INDEX":
      return { ...state, detailDiffFileIndex: action.index };
    case "SET_FOCUSED_PANEL":
      return { ...state, focusedPanel: action.panel };
    case "SET_MESSAGES_SHOW_ALL":
      return { ...state, messagesShowAll: action.value, selectedRowIndex: 0, tableScrollOffset: 0 };
    case "MARK_NOTIFICATION_READ": {
      const a = state.attentionState;
      const notifications = a.notifications.map(n =>
        n.id === action.threadId ? { ...n, unread: false } : n
      );
      const unreadCount = notifications.filter(n => n.unread).length;
      return { ...state, attentionState: { ...a, notifications, notificationUnreadCount: unreadCount } };
    }
    case "MARK_ALL_NOTIFICATIONS_READ": {
      const a = state.attentionState;
      const notifications = a.notifications.map(n => ({ ...n, unread: false }));
      return { ...state, attentionState: { ...a, notifications, notificationUnreadCount: 0 } };
    }
    case "TOGGLE_DRAFTS_OVERRIDE": {
      const cur = state.includeDraftsOverride;
      const next = cur === null ? true : cur === true ? false : null;
      return { ...state, includeDraftsOverride: next };
    }
    case "SET_LOADING_MORE":
      return { ...state, isLoadingMore: action.value };
    case "APPEND_MY_PRS": {
      const a = state.attentionState;
      return {
        ...state,
        attentionState: {
          ...a,
          myPullRequests: [...a.myPullRequests, ...action.pullRequests],
          myPullRequestsHasMore: action.hasMore,
          myPullRequestsNextCursor: action.nextCursor,
          waitingOnOthers: [...a.waitingOnOthers, ...action.waitingOnOthers],
          readyToMerge: [...a.readyToMerge, ...action.readyToMerge],
        },
      };
    }
    case "APPEND_NEEDS_MY_REVIEW": {
      const a = state.attentionState;
      return {
        ...state,
        attentionState: {
          ...a,
          needsMyReview: [...a.needsMyReview, ...action.pullRequests],
          needsMyReviewHasMore: action.hasMore,
          needsMyReviewNextCursor: action.nextCursor,
        },
      };
    }
    case "APPEND_WATCHED_AUTHOR": {
      const a = state.attentionState;
      const total = [...a.watchedAuthorPullRequests, ...action.pullRequests];
      return {
        ...state,
        attentionState: {
          ...a,
          watchedAuthorPullRequests: total,
          watchedAuthorHasMore: action.hasMore,
          watchedAuthorNextCursor: action.nextCursor,
        },
      };
    }
    default: return state;
  }
}
