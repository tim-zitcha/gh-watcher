import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSearchResponse } from "../src/github.js";

const fixturePath = path.join(import.meta.dirname, "fixtures", "search-response.json");

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
});
