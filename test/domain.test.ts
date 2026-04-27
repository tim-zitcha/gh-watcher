import { describe, expect, it } from "vitest";

import { buildNotifications, isRequestedReviewer, shouldTrackWaitingOnOthers, sortPullRequests } from "../src/domain.js";
import type { PersistedState, PullRequestSummary, TrackedAttentionState } from "../src/types.js";

function createPullRequest(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    id: overrides.id ?? "PR_1",
    number: overrides.number ?? 1,
    title: overrides.title ?? "Example PR",
    url: overrides.url ?? "https://github.com/acme/repo/pull/1",
    repository: overrides.repository ?? "acme/repo",
    author: overrides.author ?? "alice",
    isDraft: overrides.isDraft ?? false,
    updatedAt: overrides.updatedAt ?? "2026-04-24T00:00:00Z",
    reviewDecision: overrides.reviewDecision ?? "REVIEW_REQUIRED",
    requestedReviewers: overrides.requestedReviewers ?? [],
    ciStatus: overrides.ciStatus ?? "UNKNOWN",
    checkCounts: overrides.checkCounts ?? { passing: 0, failing: 0, pending: 0 },
    activity: overrides.activity ?? {
      latestActivityAt: "2026-04-24T00:00:00Z",
      latestCommentAt: null,
      latestReviewAt: null,
      latestCommitAt: "2026-04-24T00:00:00Z",
      fingerprint: "none|none|oid-1|2026-04-24T00:00:00Z"
    }
  };
}

function createTrackedState(overrides: Partial<TrackedAttentionState> = {}): TrackedAttentionState {
  return {
    viewerLogin: "alice",
    repositoryScope: "org:acme",
    watchedAuthor: "dependabot[bot]",
    myPullRequests: [],
    needsMyReview: [],
    waitingOnOthers: [],
    watchedAuthorPullRequests: [],
    securityAlerts: [],
    securityAlertTotal: 0,
    refreshedAt: "2026-04-24T00:00:00Z",
    ...overrides
  };
}

function createPersistedState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    seenActivityAtByPrId: {},
    notificationFingerprintByKey: {},
    watchedAuthors: {
      current: null,
      recent: []
    },
    ...overrides
  };
}

describe("domain classification", () => {
  it("recognizes requested reviewer entries", () => {
    const pullRequest = createPullRequest({
      requestedReviewers: ["alice", "acme/platform"]
    });

    expect(isRequestedReviewer(pullRequest, "alice")).toBe(true);
    expect(isRequestedReviewer(pullRequest, "someone-else")).toBe(false);
  });

  it("tracks authored PRs that are still waiting on other reviewers", () => {
    const requestedReviewerPr = createPullRequest({
      requestedReviewers: ["jane-dev"],
      reviewDecision: "APPROVED"
    });
    const reviewRequiredPr = createPullRequest({
      requestedReviewers: [],
      reviewDecision: "REVIEW_REQUIRED"
    });
    const changesRequestedPr = createPullRequest({
      requestedReviewers: [],
      reviewDecision: "CHANGES_REQUESTED"
    });

    expect(shouldTrackWaitingOnOthers(requestedReviewerPr, "alice")).toBe(true);
    expect(shouldTrackWaitingOnOthers(reviewRequiredPr, "alice")).toBe(true);
    expect(shouldTrackWaitingOnOthers(changesRequestedPr, "alice")).toBe(false);
  });

  it("keeps activity-sorted PR lists newest first", () => {
    const older = createPullRequest({
      id: "PR_older",
      number: 2,
      activity: {
        latestActivityAt: "2026-04-24T00:00:00Z",
        latestCommentAt: null,
        latestReviewAt: null,
        latestCommitAt: null,
        fingerprint: "older"
      }
    });
    const newer = createPullRequest({
      id: "PR_newer",
      number: 3,
      activity: {
        latestActivityAt: "2026-04-24T05:00:00Z",
        latestCommentAt: null,
        latestReviewAt: null,
        latestCommitAt: null,
        fingerprint: "newer"
      }
    });

    expect(sortPullRequests([older, newer]).map((pullRequest) => pullRequest.id)).toEqual([
      "PR_newer",
      "PR_older"
    ]);
  });
});

describe("notification dedupe", () => {
  it("notifies when a PR newly enters the review queue", () => {
    const nextState = createTrackedState({
      needsMyReview: [createPullRequest({ id: "PR_new" })]
    });

    const events = buildNotifications(null, nextState, createPersistedState());
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toContain("needs your review");
  });

  it("notifies once when a waiting PR gets new activity", () => {
    const previous = createTrackedState({
      waitingOnOthers: [
        createPullRequest({
          id: "PR_waiting",
          activity: {
            latestActivityAt: "2026-04-24T00:00:00Z",
            latestCommentAt: "2026-04-24T00:00:00Z",
            latestReviewAt: null,
            latestCommitAt: null,
            fingerprint: "comment-1"
          }
        })
      ]
    });
    const next = createTrackedState({
      waitingOnOthers: [
        createPullRequest({
          id: "PR_waiting",
          activity: {
            latestActivityAt: "2026-04-24T01:00:00Z",
            latestCommentAt: "2026-04-24T01:00:00Z",
            latestReviewAt: null,
            latestCommitAt: null,
            fingerprint: "comment-2"
          }
        })
      ]
    });

    const firstRun = buildNotifications(previous, next, createPersistedState());
    expect(firstRun).toHaveLength(1);

    const dedupedRun = buildNotifications(
      previous,
      next,
      createPersistedState({
        notificationFingerprintByKey: {
          "waitingOnOthers:PR_waiting": "comment-2"
        }
      })
    );
    expect(dedupedRun).toHaveLength(0);
  });
});
