import type { CiStatus, GitHubNotification, Mergeable, MergeStateStatus, PullRequestDetail, PullRequestSummary, SecurityAlert, TrackedAttentionState } from "./types.js";
export declare function clearFetchCache(): void;
export interface PullRequestNode {
    id: string;
    number: number;
    title: string;
    url: string;
    isDraft: boolean;
    updatedAt: string;
    reviewDecision: PullRequestSummary["reviewDecision"];
    mergeable: Mergeable;
    mergeStateStatus: MergeStateStatus;
    repository: {
        nameWithOwner: string;
    };
    author: {
        login: string;
    } | null;
    reviewRequests: {
        nodes: Array<{
            requestedReviewer: {
                __typename: "User" | "Mannequin";
                login: string;
            } | {
                __typename: "Team";
                slug: string;
                organization: {
                    login: string;
                } | null;
            } | null;
        }>;
    };
    comments?: {
        nodes: Array<{
            createdAt: string;
            updatedAt: string;
        }>;
    };
    reviews?: {
        nodes: Array<{
            submittedAt: string | null;
        }>;
    };
    commits?: {
        nodes: Array<{
            commit: {
                oid: string;
                committedDate: string;
                statusCheckRollup?: {
                    state: CiStatus;
                    contexts: {
                        nodes: Array<{
                            __typename: "CheckRun";
                            conclusion: string | null;
                            status: string;
                        } | {
                            __typename: "StatusContext";
                            state: string;
                        } | null>;
                    };
                } | null;
            };
        }>;
    };
}
export declare function mapPullRequestNode(node: PullRequestNode): PullRequestSummary;
export declare function parseSearchResponse(payload: string): PullRequestSummary[];
export declare function fetchViewerLogin(): Promise<string>;
export declare function fetchViewerOrganizations(): Promise<string[]>;
export declare function fetchOrganizationMembers(organization: string): Promise<string[]>;
export declare function fetchPullRequestsAuthoredBy(options: {
    author: string;
    includeDrafts: boolean;
    repositoryScope: string | null;
    cursor?: string | null;
}): Promise<{
    pullRequests: PullRequestSummary[];
    hasMore: boolean;
    nextCursor: string | null;
    totalCount: number;
}>;
export declare function fetchDependabotAlerts(org: string): Promise<{
    alerts: SecurityAlert[];
    total: number;
}>;
export declare function fetchPullRequestDetail(owner: string, repo: string, number: number): Promise<PullRequestDetail>;
export declare function extractOrgFromScope(repositoryScope: string | null): string | null;
export declare function fetchMyPrsData(options: {
    viewerLogin: string;
    includeDrafts: boolean;
    repositoryScope: string | null;
    cursor?: string | null;
}): Promise<{
    myPullRequests: PullRequestSummary[];
    waitingOnOthers: PullRequestSummary[];
    readyToMerge: PullRequestSummary[];
    hasMore: boolean;
    nextCursor: string | null;
    totalCount: number;
}>;
export declare function fetchNeedsMyReviewData(options: {
    viewerLogin: string;
    includeDrafts: boolean;
    repositoryScope: string | null;
    cursor?: string | null;
}): Promise<{
    needsMyReview: PullRequestSummary[];
    hasMore: boolean;
    nextCursor: string | null;
    totalCount: number;
}>;
export declare function fetchAllViews(options: {
    viewerLogin: string;
    includeDrafts: boolean;
    watchedAuthor: string | null;
    repositoryScope: string | null;
}): Promise<TrackedAttentionState>;
export declare function fetchPullRequestDiff(owner: string, repo: string, number: number): Promise<string>;
export declare function markNotificationRead(threadId: string): Promise<void>;
export declare function markAllNotificationsRead(): Promise<void>;
export declare function fetchNotifications(): Promise<GitHubNotification[]>;
