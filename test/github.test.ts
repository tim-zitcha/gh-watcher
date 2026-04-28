import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractOrgFromScope, mapPullRequestNode, parseSearchResponse } from "../src/github.js";
import type { PullRequestNode } from "../src/github.js";

const fixturePath = path.join(import.meta.dirname, "fixtures", "search-response.json");

// ── Minimal PullRequestNode factory ──────────────────────────────────────────

function makeNode(overrides: Partial<PullRequestNode> = {}): PullRequestNode {
  return {
    id: "PR_1",
    number: 1,
    title: "Test PR",
    url: "https://github.com/acme/repo/pull/1",
    isDraft: false,
    updatedAt: "2026-04-24T00:00:00Z",
    reviewDecision: "REVIEW_REQUIRED",
    mergeable: "UNKNOWN",
    mergeStateStatus: "UNKNOWN",
    repository: { nameWithOwner: "acme/repo" },
    author: { login: "alice" },
    reviewRequests: { nodes: [] },
    comments: { nodes: [] },
    reviews: { nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            oid: "abc",
            committedDate: "2026-04-24T00:00:00Z",
            statusCheckRollup: null
          }
        }
      ]
    },
    ...overrides
  };
}

// ── parseSearchResponse ───────────────────────────────────────────────────────

describe("parseSearchResponse", () => {
  it("maps GraphQL pull request search results into summaries", () => {
    const payload = readFileSync(fixturePath, "utf8");
    const pullRequests = parseSearchResponse(payload);

    expect(pullRequests).toHaveLength(2);
    expect(pullRequests[0]).toMatchObject({
      id: "PR_kwDOA1",
      number: 42,
      repository: "acme/widgets",
      author: "dependabot[bot]",
      requestedReviewers: ["alice"]
    });
    expect(pullRequests[0]?.activity).toMatchObject({
      latestCommentAt: "2026-04-24T00:10:00Z",
      latestReviewAt: "2026-04-24T00:30:00Z",
      latestCommitAt: "2026-04-24T00:50:00Z",
      latestActivityAt: "2026-04-24T01:00:00Z",
      fingerprint: "2026-04-24T00:10:00Z|2026-04-24T00:30:00Z|abc123|2026-04-24T00:50:00Z"
    });
    expect(pullRequests[1]?.requestedReviewers).toEqual(["acme/platform"]);
  });

  it("throws a named error when GraphQL returns an errors field", () => {
    const errorPayload = JSON.stringify({
      errors: [{ message: "Field 'badField' doesn't exist on type 'PullRequest'" }]
    });
    expect(() => parseSearchResponse(errorPayload)).toThrowError(
      /GraphQL error in SearchPullRequests/
    );
  });

  it("filters out null nodes without crashing", () => {
    const payloadWithNull = JSON.stringify({
      data: {
        search: {
          issueCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [null, makeNode({ id: "PR_real" })]
        }
      }
    });
    const result = parseSearchResponse(payloadWithNull);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("PR_real");
  });
});

// ── Activity snapshot extraction ──────────────────────────────────────────────

describe("activity snapshot", () => {
  it("picks updatedAt as fallback when no comments, reviews, or commits exist", () => {
    const node = makeNode({
      updatedAt: "2026-04-20T12:00:00Z",
      comments: { nodes: [] },
      reviews: { nodes: [] },
      commits: { nodes: [] }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.activity.latestActivityAt).toBe("2026-04-20T12:00:00Z");
    expect(pr.activity.latestCommentAt).toBeNull();
    expect(pr.activity.latestReviewAt).toBeNull();
    expect(pr.activity.latestCommitAt).toBeNull();
    expect(pr.activity.fingerprint).toBe("none|none|none|none");
  });

  it("selects the latest of comment, review, and commit timestamps", () => {
    const node = makeNode({
      updatedAt: "2026-04-20T00:00:00Z",
      comments: { nodes: [{ createdAt: "2026-04-20T01:00:00Z", updatedAt: "2026-04-20T01:00:00Z" }] },
      reviews: { nodes: [{ submittedAt: "2026-04-20T02:00:00Z" }] },
      commits: {
        nodes: [{
          commit: {
            oid: "abc",
            committedDate: "2026-04-20T03:00:00Z",
            statusCheckRollup: null
          }
        }]
      }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.activity.latestActivityAt).toBe("2026-04-20T03:00:00Z");
    expect(pr.activity.latestCommentAt).toBe("2026-04-20T01:00:00Z");
    expect(pr.activity.latestReviewAt).toBe("2026-04-20T02:00:00Z");
    expect(pr.activity.latestCommitAt).toBe("2026-04-20T03:00:00Z");
  });

  it("builds fingerprint from all four activity fields", () => {
    const node = makeNode({
      comments: { nodes: [{ createdAt: "2026-04-20T01:00:00Z", updatedAt: "2026-04-20T01:00:00Z" }] },
      reviews: { nodes: [{ submittedAt: "2026-04-20T02:00:00Z" }] },
      commits: {
        nodes: [{
          commit: {
            oid: "sha999",
            committedDate: "2026-04-20T03:00:00Z",
            statusCheckRollup: null
          }
        }]
      }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.activity.fingerprint).toBe(
      "2026-04-20T01:00:00Z|2026-04-20T02:00:00Z|sha999|2026-04-20T03:00:00Z"
    );
  });
});

// ── CI status aggregation ─────────────────────────────────────────────────────

describe("CI status aggregation", () => {
  it("returns UNKNOWN when there are no check runs", () => {
    const node = makeNode({
      commits: {
        nodes: [{
          commit: { oid: "abc", committedDate: "2026-04-24T00:00:00Z", statusCheckRollup: null }
        }]
      }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.ciStatus).toBe("UNKNOWN");
    expect(pr.checkCounts).toEqual({ passing: 0, failing: 0, pending: 0 });
  });

  it("aggregates CheckRun nodes into passing/failing/pending counts", () => {
    const node = makeNode({
      commits: {
        nodes: [{
          commit: {
            oid: "abc",
            committedDate: "2026-04-24T00:00:00Z",
            statusCheckRollup: {
              state: "FAILURE",
              contexts: {
                nodes: [
                  { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
                  { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "FAILURE" },
                  { __typename: "CheckRun", name: "build", status: "IN_PROGRESS", conclusion: null }
                ] as any
              }
            }
          }
        }]
      }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.ciStatus).toBe("FAILURE");
    expect(pr.checkCounts).toEqual({ passing: 1, failing: 1, pending: 1 });
  });

  it("counts NEUTRAL and SKIPPED conclusions as passing", () => {
    const node = makeNode({
      commits: {
        nodes: [{
          commit: {
            oid: "abc",
            committedDate: "2026-04-24T00:00:00Z",
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: {
                nodes: [
                  { __typename: "CheckRun", name: "skipped", status: "COMPLETED", conclusion: "SKIPPED" },
                  { __typename: "CheckRun", name: "neutral", status: "COMPLETED", conclusion: "NEUTRAL" }
                ] as any
              }
            }
          }
        }]
      }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.checkCounts).toEqual({ passing: 2, failing: 0, pending: 0 });
  });

  it("handles StatusContext nodes (non-CheckRun)", () => {
    const node = makeNode({
      commits: {
        nodes: [{
          commit: {
            oid: "abc",
            committedDate: "2026-04-24T00:00:00Z",
            statusCheckRollup: {
              state: "PENDING",
              contexts: {
                nodes: [
                  { __typename: "StatusContext", state: "SUCCESS" },
                  { __typename: "StatusContext", state: "PENDING" },
                  { __typename: "StatusContext", state: "FAILURE" }
                ] as any
              }
            }
          }
        }]
      }
    });
    const pr = mapPullRequestNode(node);
    expect(pr.checkCounts).toEqual({ passing: 1, failing: 1, pending: 1 });
  });
});

// ── Requested reviewer normalization ─────────────────────────────────────────

describe("requested reviewer normalization", () => {
  it("uses login for User reviewers", () => {
    const node = makeNode({
      reviewRequests: {
        nodes: [{
          requestedReviewer: { __typename: "User", login: "bob" }
        }]
      }
    });
    expect(mapPullRequestNode(node).requestedReviewers).toEqual(["bob"]);
  });

  it("formats Team reviewers as org/slug", () => {
    const node = makeNode({
      reviewRequests: {
        nodes: [{
          requestedReviewer: {
            __typename: "Team",
            slug: "platform",
            organization: { login: "acme" }
          }
        }]
      }
    });
    expect(mapPullRequestNode(node).requestedReviewers).toEqual(["acme/platform"]);
  });

  it("falls back to slug when Team has no organization", () => {
    const node = makeNode({
      reviewRequests: {
        nodes: [{
          requestedReviewer: {
            __typename: "Team",
            slug: "platform",
            organization: null
          }
        }]
      }
    });
    expect(mapPullRequestNode(node).requestedReviewers).toEqual(["platform"]);
  });

  it("filters out null reviewers", () => {
    const node = makeNode({
      reviewRequests: {
        nodes: [{ requestedReviewer: null }]
      }
    });
    expect(mapPullRequestNode(node).requestedReviewers).toEqual([]);
  });
});

// ── extractOrgFromScope ───────────────────────────────────────────────────────

describe("extractOrgFromScope", () => {
  it("returns null for null input", () => {
    expect(extractOrgFromScope(null)).toBeNull();
  });

  it("returns null when scope has no org: prefix", () => {
    expect(extractOrgFromScope("user:alice")).toBeNull();
    expect(extractOrgFromScope("acme")).toBeNull();
  });

  it("extracts org name from org: prefix", () => {
    expect(extractOrgFromScope("org:acme")).toBe("acme");
  });

  it("handles org names with hyphens and dots", () => {
    expect(extractOrgFromScope("org:my-company.io")).toBe("my-company.io");
  });
});

import { parseDiff } from "../src/ui/helpers.js";

describe("parseDiff", () => {
  it("splits a unified diff into per-file sections", () => {
    const raw = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,4 @@",
      " context line",
      "-deleted line",
      "+added line",
      "+another add",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0]!.header).toBe("foo.ts");
    expect(files[0]!.lines).toEqual([
      { type: "file", text: "diff --git a/foo.ts b/foo.ts" },
      { type: "file", text: "--- a/foo.ts" },
      { type: "file", text: "+++ b/foo.ts" },
      { type: "hunk", text: "@@ -1,3 +1,4 @@" },
      { type: "ctx",  text: " context line" },
      { type: "del",  text: "-deleted line" },
      { type: "add",  text: "+added line" },
      { type: "add",  text: "+another add" },
    ]);
  });

  it("handles multiple files", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -0,0 +1 @@",
      "+hello",
      "diff --git a/b.ts b/b.ts",
      "@@ -0,0 +1 @@",
      "+world",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0]!.header).toBe("a.ts");
    expect(files[1]!.header).toBe("b.ts");
  });

  it("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   \n  ")).toEqual([]);
  });
});
