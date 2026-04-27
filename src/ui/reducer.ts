import type { Action, AppState } from "./types.js";

export function reducer(state: AppState, action: Action): AppState {
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
      return { ...state, detailOpen: true, detailPr: action.pr, detailData: null, detailLoading: true, detailScrollOffset: 0, detailDiff: null, detailDiffVisible: false, detailDiffFileIndex: 0 };
    case "SET_DETAIL_DATA":
      return { ...state, detailData: action.data, detailLoading: false };
    case "SET_DETAIL_SCROLL":
      return { ...state, detailScrollOffset: Math.max(0, action.offset) };
    case "CLOSE_DETAIL":
      return { ...state, detailOpen: false, detailPr: null, detailData: null, detailLoading: false, detailScrollOffset: 0, detailDiff: null, detailDiffVisible: false, detailDiffFileIndex: 0 };
    case "SET_DETAIL_DIFF":
      return { ...state, detailDiff: action.diff };
    case "TOGGLE_DETAIL_DIFF":
      return { ...state, detailDiffVisible: !state.detailDiffVisible, detailDiffFileIndex: 0, detailScrollOffset: 0 };
    case "SET_DIFF_FILE_INDEX":
      return { ...state, detailDiffFileIndex: action.index };
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
