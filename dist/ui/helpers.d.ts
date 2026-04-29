import type { AlertSeverity, DiffFile, PullRequestSummary, SecurityAlert, SecuritySortMode } from "../types.js";
import type { AccessibleRepo } from "../github.js";
import type { RepoSortMode, RepoSummary } from "./types.js";
export declare const PR_VIEWS: readonly ["myPullRequests", "needsMyReview", "waitingOnOthers", "readyToMerge", "watchedAuthor"];
export declare const SEVERITY_RANK: Record<AlertSeverity, number>;
export declare const COMMON_WATCHED_AUTHORS: string[];
export declare function formatTimestamp(value: string): string;
export declare function htmlToText(html: string): string;
export declare function formatCiStatus(pr: PullRequestSummary): {
    symbol: string;
    color: string;
};
export declare function sortSecurityAlerts(alerts: SecurityAlert[], mode: SecuritySortMode): SecurityAlert[];
export declare function clampScroll(selectedRow: number, currentOffset: number, visibleRows: number): number;
export declare function pad(s: string, w: number): string;
export declare function formatReviewStatus(pr: PullRequestSummary): {
    symbol: string;
    color: string;
};
export declare function formatAge(isoDate: string): string;
export declare function parseDiff(raw: string): DiffFile[];
export declare function groupByRepo(prs: PullRequestSummary[], needsReview: PullRequestSummary[], alerts: SecurityAlert[], sort?: RepoSortMode, accessibleRepos?: AccessibleRepo[]): RepoSummary[];
