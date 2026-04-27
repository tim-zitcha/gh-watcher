export type ViewName = "myPullRequests" | "needsMyReview" | "waitingOnOthers" | "watchedAuthor" | "security";

export type AlertSeverity = "critical" | "high" | "medium" | "low" | "unknown";
export type SecuritySortMode = "severity" | "age";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
export type CiStatus = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | "UNKNOWN";

export interface ActivitySnapshot {
  latestActivityAt: string;
  latestCommentAt: string | null;
  latestReviewAt: string | null;
  latestCommitAt: string | null;
  fingerprint: string;
}

export interface CheckCounts {
  passing: number;
  failing: number;
  pending: number;
}

export interface PullRequestSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  author: string;
  isDraft: boolean;
  updatedAt: string;
  reviewDecision: ReviewDecision;
  requestedReviewers: string[];
  ciStatus: CiStatus;
  checkCounts: CheckCounts;
  activity: ActivitySnapshot;
}

export interface TrackedAttentionState {
  viewerLogin: string;
  repositoryScope: string | null;
  watchedAuthor: string | null;
  myPullRequests: PullRequestSummary[];
  myPullRequestsHasMore?: boolean;
  myPullRequestsNextCursor?: string | null;
  myPullRequestsTotalCount?: number;
  needsMyReview: PullRequestSummary[];
  needsMyReviewHasMore?: boolean;
  needsMyReviewNextCursor?: string | null;
  needsMyReviewTotalCount?: number;
  waitingOnOthers: PullRequestSummary[];
  watchedAuthorPullRequests: PullRequestSummary[];
  watchedAuthorHasMore?: boolean;
  watchedAuthorNextCursor?: string | null;
  watchedAuthorTotalCount?: number;
  securityAlerts: SecurityAlert[];
  securityAlertTotal: number;
  refreshedAt: string;
}

export interface WatchedAuthorState {
  current: string | null;
  recent: string[];
}

export interface RepositoryScopeOption {
  label: string;
  value: string | null;
}

export interface PersistedState {
  seenActivityAtByPrId: Record<string, string>;
  notificationFingerprintByKey: Record<string, string>;
  watchedAuthors: WatchedAuthorState;
}

export interface AppConfig {
  refreshMinutes: number;
  notificationsEnabled: boolean;
  includeDrafts: boolean;
  initialWatchedAuthor: string | null;
  repositoryScope: string | null;
  stateFilePath: string;
}

export interface PullRequestRow {
  badge: string;
  repository: string;
  pr: string;
  author: string;
  reviewers: string;
  ci: string;
  activity: string;
  title: string;
}

export interface NotificationEvent {
  dedupeKey: string;
  title: string;
  message: string;
}

export interface SecurityAlert {
  number: number;
  repository: string;
  package: string;
  ecosystem: string;
  severity: AlertSeverity;
  summary: string;
  cveId: string | null;
  ghsaId: string;
  createdAt: string;
  url: string;
}

export interface CheckRun {
  name: string;
  conclusion: string | null; // SUCCESS, FAILURE, NEUTRAL, CANCELLED, SKIPPED, TIMED_OUT, ACTION_REQUIRED, null (in progress)
  status: string; // QUEUED, IN_PROGRESS, COMPLETED
}

export interface ReviewSummary {
  author: string;
  state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED, PENDING, DISMISSED
  submittedAt: string | null;
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PullRequestDetail {
  number: number;
  title: string;
  url: string;
  body: string;
  isDraft: boolean;
  author: string;
  repository: string;
  createdAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  checkRuns: CheckRun[];
  reviews: ReviewSummary[];
  requestedReviewers: string[];
  files: ChangedFile[];
}

export interface DiffLine {
  type: "add" | "del" | "hunk" | "file" | "ctx";
  text: string;
}

export interface DiffFile {
  header: string;
  lines: DiffLine[];
}
