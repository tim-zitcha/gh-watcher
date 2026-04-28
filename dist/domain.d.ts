import type { NotificationEvent, PersistedState, PullRequestSummary, ReviewDecision, TrackedAttentionState } from "./types.js";
export declare function shouldIncludePullRequest(pullRequest: PullRequestSummary, includeDrafts: boolean): boolean;
export declare function isRequestedReviewer(pullRequest: PullRequestSummary, viewerLogin: string): boolean;
export declare function isReadyToMerge(pullRequest: PullRequestSummary): boolean;
export declare function shouldTrackWaitingOnOthers(pullRequest: PullRequestSummary, viewerLogin: string): boolean;
export declare function sortPullRequests(pullRequests: PullRequestSummary[]): PullRequestSummary[];
export declare function formatReviewDecision(reviewDecision: ReviewDecision): string;
export declare function buildNotifications(previousState: TrackedAttentionState | null, nextState: TrackedAttentionState, persistedState: PersistedState): NotificationEvent[];
