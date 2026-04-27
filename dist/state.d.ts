import type { PersistedState, PullRequestSummary, ViewName, WatchedAuthorState } from "./types.js";
export declare function loadState(filePath: string): Promise<PersistedState>;
export declare function saveState(filePath: string, state: PersistedState): Promise<void>;
export declare function updateWatchedAuthors(previous: WatchedAuthorState, login: string): WatchedAuthorState;
export declare function markSeen(state: PersistedState, pullRequests: PullRequestSummary[]): PersistedState;
export declare function isUnread(state: PersistedState, pullRequest: PullRequestSummary): boolean;
export declare function notificationKey(view: ViewName, pullRequest: PullRequestSummary): string;
