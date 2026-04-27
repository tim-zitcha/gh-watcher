import { spawn } from "node:child_process";

import type { ActivitySnapshot, AlertSeverity, ChangedFile, CheckRun, CheckCounts, CiStatus, PullRequestDetail, PullRequestSummary, ReviewSummary, SecurityAlert, TrackedAttentionState } from "./types.js";
import { isRequestedReviewer, shouldIncludePullRequest, shouldTrackWaitingOnOthers, sortPullRequests } from "./domain.js";

const SEARCH_PAGE_SIZE = 30; // GitHub recommends ≤30 for search; larger pages hit timeout limits
const ACTIVITY_CHUNK_SIZE = 12; // nodes(ids:) has a 100-node hard cap; 12 keeps queries small

function parseGraphQL<T>(payload: string, queryName: string): T {
  const json = JSON.parse(payload) as { errors?: Array<{ message: string }>; data?: T };
  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new Error(`GraphQL error in ${queryName}: ${messages}`);
  }
  return json as T;
}

const SEARCH_QUERY = `
  query SearchPullRequests($searchQuery: String!, $pageSize: Int!, $after: String) {
    search(query: $searchQuery, type: ISSUE, first: $pageSize, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          isDraft
          updatedAt
          reviewDecision
          repository {
            nameWithOwner
          }
          author {
            login
          }
          reviewRequests(first: 10) {
            nodes {
              requestedReviewer {
                __typename
                ... on User {
                  login
                }
                ... on Team {
                  slug
                  organization {
                    login
                  }
                }
                ... on Mannequin {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
`;

const VIEWER_QUERY = `
  query ViewerLogin {
    viewer {
      login
    }
  }
`;

const VIEWER_ORGANIZATIONS_QUERY = `
  query ViewerOrganizations {
    viewer {
      organizations(first: 100, orderBy: { field: LOGIN, direction: ASC }) {
        nodes {
          login
        }
      }
    }
  }
`;

const ORGANIZATION_MEMBERS_QUERY = `
  query OrganizationMembers($organization: String!) {
    organization(login: $organization) {
      membersWithRole(first: 100) {
        nodes {
          login
        }
      }
    }
  }
`;

export interface PullRequestNode {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  reviewDecision: PullRequestSummary["reviewDecision"];
  repository: {
    nameWithOwner: string;
  };
  author: {
    login: string;
  } | null;
  reviewRequests: {
    nodes: Array<{
      requestedReviewer:
        | {
            __typename: "User" | "Mannequin";
            login: string;
          }
        | {
            __typename: "Team";
            slug: string;
            organization: {
              login: string;
            } | null;
          }
        | null;
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
            nodes: Array<
              | { __typename: "CheckRun"; conclusion: string | null; status: string }
              | { __typename: "StatusContext"; state: string }
              | null
            >;
          };
        } | null;
      };
    }>;
  };
}

interface SearchResponse {
  data: {
    search: {
      issueCount: number;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: Array<PullRequestNode | null>;
    };
  };
}

interface ActivityResponse {
  data: {
    nodes: Array<
      | {
          id: string;
          updatedAt: string;
          comments: {
            nodes: Array<{
              createdAt: string;
              updatedAt: string;
            }>;
          };
          reviews: {
            nodes: Array<{
              submittedAt: string | null;
            }>;
          };
          commits: {
            nodes: Array<{
              commit: {
                oid: string;
                committedDate: string;
                statusCheckRollup: {
                  state: CiStatus;
                  contexts: {
                    nodes: Array<
                      | { __typename: "CheckRun"; conclusion: string | null; status: string }
                      | { __typename: "StatusContext"; state: string }
                      | null
                    >;
                  };
                } | null;
              };
            }>;
          };
        }
      | null
    >;
  };
}

interface ViewerResponse {
  data: {
    viewer: {
      login: string;
    };
  };
}

interface ViewerOrganizationsResponse {
  data: {
    viewer: {
      organizations: {
        nodes: Array<{
          login: string;
        } | null>;
      };
    };
  };
}

interface OrganizationMembersResponse {
  data: {
    organization: {
      membersWithRole: {
        nodes: Array<{
          login: string;
        } | null>;
      };
    } | null;
  };
}

function scopedSearchQuery(searchQuery: string, repositoryScope: string | null): string {
  return repositoryScope ? `${searchQuery} ${repositoryScope}` : searchQuery;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function spawnGhApi(
  query: string,
  variables: Record<string, string | number | null | undefined>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["api", "graphql", "-f", `query=${query}`];

    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined && value !== null) {
        args.push("-F", `${key}=${value}`);
      }
    }

    const child = spawn("gh", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `gh api graphql exited with code ${code}`));
        return;
      }

      resolve(stdout);
    });
  });
}

function isRateLimitError(message: string): boolean {
  return message.includes("API rate limit exceeded") || message.includes("secondary rate limit");
}

async function runGhApi(
  query: string,
  variables: Record<string, string | number | null | undefined> = {},
  attempt = 0
): Promise<string> {
  try {
    return await spawnGhApi(query, variables);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRateLimitError(message)) {
      throw new Error(`GitHub rate limit exceeded — wait a moment and try again. (${message})`);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      return runGhApi(query, variables, attempt + 1);
    }

    throw error;
  }
}

interface ActivityFields {
  updatedAt: string;
  comments?: PullRequestNode["comments"];
  reviews?: PullRequestNode["reviews"];
  commits?: PullRequestNode["commits"];
}

function computeActivitySnapshot(fields: ActivityFields): ActivitySnapshot {
  const latestCommentAt = (fields.comments?.nodes ?? [])
    .map((comment) => comment.updatedAt || comment.createdAt)
    .sort()
    .at(-1) ?? null;
  const latestReviewAt = (fields.reviews?.nodes ?? [])
    .map((review) => review.submittedAt)
    .filter((submittedAt): submittedAt is string => Boolean(submittedAt))
    .sort()
    .at(-1) ?? null;
  const latestCommit = fields.commits?.nodes.at(-1)?.commit;
  const latestCommitAt = latestCommit?.committedDate ?? null;
  const latestActivityAt = [latestCommentAt, latestReviewAt, latestCommitAt, fields.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? fields.updatedAt;
  const fingerprint = [
    latestCommentAt ?? "none",
    latestReviewAt ?? "none",
    latestCommit?.oid ?? "none",
    latestCommitAt ?? "none"
  ].join("|");

  return {
    latestActivityAt,
    latestCommentAt,
    latestReviewAt,
    latestCommitAt,
    fingerprint
  };
}

function computeCiStatus(fields: ActivityFields): CiStatus {
  return fields.commits?.nodes.at(-1)?.commit.statusCheckRollup?.state ?? "UNKNOWN";
}

function computeCheckCounts(fields: ActivityFields): CheckCounts {
  const contexts = fields.commits?.nodes.at(-1)?.commit.statusCheckRollup?.contexts.nodes ?? [];
  let passing = 0;
  let failing = 0;
  let pending = 0;

  for (const ctx of contexts) {
    if (!ctx) continue;
    if (ctx.__typename === "CheckRun") {
      if (ctx.status !== "COMPLETED") {
        pending++;
      } else if (ctx.conclusion === "SUCCESS" || ctx.conclusion === "NEUTRAL" || ctx.conclusion === "SKIPPED") {
        passing++;
      } else if (ctx.conclusion) {
        failing++;
      }
    } else {
      if (ctx.state === "SUCCESS") passing++;
      else if (ctx.state === "PENDING" || ctx.state === "EXPECTED") pending++;
      else failing++;
    }
  }

  return { passing, failing, pending };
}

function normalizeRequestedReviewer(
  reviewer: PullRequestNode["reviewRequests"]["nodes"][number]["requestedReviewer"]
): string | null {
  if (!reviewer) {
    return null;
  }

  if (reviewer.__typename === "Team") {
    return reviewer.organization ? `${reviewer.organization.login}/${reviewer.slug}` : reviewer.slug;
  }

  return reviewer.login;
}

export function mapPullRequestNode(node: PullRequestNode): PullRequestSummary {
  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    repository: node.repository.nameWithOwner,
    author: node.author?.login ?? "ghost",
    isDraft: node.isDraft,
    updatedAt: node.updatedAt,
    reviewDecision: node.reviewDecision,
    requestedReviewers: node.reviewRequests.nodes
      .map((item) => normalizeRequestedReviewer(item.requestedReviewer))
      .filter((reviewer): reviewer is string => Boolean(reviewer)),
    ciStatus: computeCiStatus(node),
    checkCounts: computeCheckCounts(node),
    activity: computeActivitySnapshot(node)
  };
}

export function parseSearchResponse(payload: string): PullRequestSummary[] {
  const parsed = parseGraphQL<SearchResponse>(payload, "SearchPullRequests");
  return parsed.data.search.nodes
    .filter((node): node is PullRequestNode => Boolean(node))
    .map(mapPullRequestNode);
}

function parseSearchPage(payload: string): {
  pullRequests: PullRequestSummary[];
  hasNextPage: boolean;
  endCursor: string | null;
  issueCount: number;
} {
  const parsed = parseGraphQL<SearchResponse>(payload, "SearchPullRequests");

  return {
    pullRequests: parsed.data.search.nodes
      .filter((node): node is PullRequestNode => Boolean(node))
      .map(mapPullRequestNode),
    hasNextPage: parsed.data.search.pageInfo.hasNextPage,
    endCursor: parsed.data.search.pageInfo.endCursor,
    issueCount: parsed.data.search.issueCount
  };
}

function buildActivityQuery(ids: string[]): string {
  const quotedIds = ids.map((id) => JSON.stringify(id)).join(", ");

  return `
    query PullRequestActivity {
      nodes(ids: [${quotedIds}]) {
        ... on PullRequest {
          id
          updatedAt
          comments(last: 5) {
            nodes {
              createdAt
              updatedAt
            }
          }
          reviews(last: 5) {
            nodes {
              submittedAt
            }
          }
          commits(last: 1) {
            nodes {
              commit {
                oid
                committedDate
                statusCheckRollup {
                  state
                  contexts(first: 100) {
                    nodes {
                      __typename
                      ... on CheckRun {
                        conclusion
                        status
                      }
                      ... on StatusContext {
                        state
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

function parseActivityResponse(payload: string): Map<string, Pick<PullRequestSummary, "activity" | "ciStatus" | "checkCounts">> {
  const parsed = parseGraphQL<ActivityResponse>(payload, "FetchActivitySnapshots");
  return new Map(
    parsed.data.nodes
      .filter((node): node is NonNullable<ActivityResponse["data"]["nodes"][number]> => Boolean(node))
      .map((node) => [
        node.id,
        {
          activity: computeActivitySnapshot(node),
          ciStatus: computeCiStatus(node),
          checkCounts: computeCheckCounts(node)
        }
      ])
  );
}

async function fetchActivitySnapshots(ids: string[]): Promise<Map<string, Pick<PullRequestSummary, "activity" | "ciStatus" | "checkCounts">>> {
  if (ids.length === 0) {
    return new Map();
  }

  const snapshots = new Map<string, Pick<PullRequestSummary, "activity" | "ciStatus" | "checkCounts">>();

  for (let index = 0; index < ids.length; index += ACTIVITY_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + ACTIVITY_CHUNK_SIZE);
    const payload = await runGhApi(buildActivityQuery(chunk));
    const chunkSnapshots = parseActivityResponse(payload);

    for (const [id, snapshot] of chunkSnapshots.entries()) {
      snapshots.set(id, snapshot);
    }
  }

  return snapshots;
}

async function fetchPrPage(
  searchQuery: string,
  cursor: string | null
): Promise<{ pullRequests: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null; totalCount: number }> {
  const payload = await runGhApi(SEARCH_QUERY, {
    searchQuery,
    pageSize: SEARCH_PAGE_SIZE,
    after: cursor
  });
  const page = parseSearchPage(payload);
  const activitySnapshots = await fetchActivitySnapshots(page.pullRequests.map((pr) => pr.id));
  const enriched = page.pullRequests.map((pr) => {
    const snap = activitySnapshots.get(pr.id);
    return snap ? { ...pr, activity: snap.activity, ciStatus: snap.ciStatus, checkCounts: snap.checkCounts } : pr;
  });
  return { pullRequests: enriched, hasMore: page.hasNextPage, nextCursor: page.endCursor, totalCount: page.issueCount };
}

export async function fetchViewerLogin(): Promise<string> {
  const payload = await runGhApi(VIEWER_QUERY);
  const parsed = parseGraphQL<ViewerResponse>(payload, "Viewer");
  return parsed.data.viewer.login;
}

export async function fetchViewerOrganizations(): Promise<string[]> {
  const payload = await runGhApi(VIEWER_ORGANIZATIONS_QUERY);
  const parsed = parseGraphQL<ViewerOrganizationsResponse>(payload, "ViewerOrganizations");

  return parsed.data.viewer.organizations.nodes
    .filter((organization): organization is { login: string } => Boolean(organization))
    .map((organization) => organization.login);
}

export async function fetchOrganizationMembers(organization: string): Promise<string[]> {
  const payload = await runGhApi(ORGANIZATION_MEMBERS_QUERY, {
    organization
  });
  const parsed = parseGraphQL<OrganizationMembersResponse>(payload, "OrganizationMembers");

  return parsed.data.organization?.membersWithRole.nodes
    .filter((member): member is { login: string } => Boolean(member))
    .map((member) => member.login)
    .sort((left, right) => left.localeCompare(right)) ?? [];
}

export async function fetchPullRequestsAuthoredBy(options: {
  author: string;
  includeDrafts: boolean;
  repositoryScope: string | null;
  cursor?: string | null;
}): Promise<{ pullRequests: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null; totalCount: number }> {
  const { pullRequests, hasMore, nextCursor, totalCount } = await fetchPrPage(
    scopedSearchQuery(
      `is:open is:pr archived:false sort:updated-desc author:${options.author}`,
      options.repositoryScope
    ),
    options.cursor ?? null
  );

  return {
    pullRequests: sortPullRequests(
      pullRequests.filter((pr) => shouldIncludePullRequest(pr, options.includeDrafts))
    ),
    hasMore,
    nextCursor,
    totalCount
  };
}

interface DependabotAlertResponse {
  number: number;
  html_url: string;
  created_at: string;
  dependency: {
    package: {
      ecosystem: string;
      name: string;
    };
    manifest_path: string;
  };
  security_advisory: {
    ghsa_id: string;
    cve_id: string | null;
    summary: string;
    severity: string;
  };
  repository: {
    full_name: string;
  };
}

const SECURITY_ALERT_LIMIT = 100;

function spawnGhRest(path: string, includeHeaders = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["api"];
    if (includeHeaders) args.push("--include");
    args.push(path);

    const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: string[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `gh api exited with code ${code}`));
        return;
      }

      resolve(chunks.join(""));
    });
  });
}

async function runGhRest(path: string, includeHeaders = false, attempt = 0): Promise<string> {
  try {
    return await spawnGhRest(path, includeHeaders);
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      return runGhRest(path, includeHeaders, attempt + 1);
    }

    throw error;
  }
}

function parseLinkHeaderTotal(raw: string): number {
  const match = raw.match(/link:.*?[?&]page=(\d+)[^>]*>;\s*rel="last"/i);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function normalizeSeverity(raw: string): AlertSeverity {
  if (raw === "critical" || raw === "high" || raw === "medium" || raw === "low") {
    return raw;
  }

  return "unknown";
}

async function fetchDependabotAlertTotal(org: string): Promise<number> {
  const raw = await runGhRest(
    `/orgs/${encodeURIComponent(org)}/dependabot/alerts?state=open&per_page=1`,
    true
  );
  const fromLink = parseLinkHeaderTotal(raw);
  if (fromLink > 0) return fromLink;

  const bodyMatch = raw.match(/\[[\s\S]*\]/);
  if (bodyMatch) {
    const items = JSON.parse(bodyMatch[0]) as unknown[];
    return items.length;
  }

  return 0;
}

async function fetchDependabotAlertPage(org: string): Promise<SecurityAlert[]> {
  const payload = await runGhRest(
    `/orgs/${encodeURIComponent(org)}/dependabot/alerts?state=open&per_page=${SECURITY_ALERT_LIMIT}&sort=created&direction=desc`
  );
  const raw = JSON.parse(payload) as DependabotAlertResponse[];

  return raw.map((alert) => ({
    number: alert.number,
    repository: alert.repository.full_name,
    package: alert.dependency.package.name,
    ecosystem: alert.dependency.package.ecosystem,
    severity: normalizeSeverity(alert.security_advisory.severity),
    summary: alert.security_advisory.summary,
    cveId: alert.security_advisory.cve_id,
    ghsaId: alert.security_advisory.ghsa_id,
    createdAt: alert.created_at,
    url: alert.html_url
  }));
}

export async function fetchDependabotAlerts(org: string): Promise<{ alerts: SecurityAlert[]; total: number }> {
  const [alerts, total] = await Promise.all([
    fetchDependabotAlertPage(org),
    fetchDependabotAlertTotal(org)
  ]);

  return { alerts, total };
}

const PULL_REQUEST_DETAIL_QUERY = `
  query PullRequestDetail($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        title
        url
        body
        isDraft
        createdAt
        additions
        deletions
        changedFiles
        author {
          login
        }
        repository {
          nameWithOwner
        }
        commits(last: 1) {
          nodes {
            commit {
              checkSuites(first: 10) {
                nodes {
                  checkRuns(first: 50) {
                    nodes {
                      name
                      conclusion
                      status
                    }
                  }
                }
              }
            }
          }
        }
        reviews(last: 20, states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]) {
          nodes {
            author {
              login
            }
            state
            submittedAt
          }
        }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User {
                login
              }
              ... on Team {
                slug
                organization {
                  login
                }
              }
              ... on Mannequin {
                login
              }
            }
          }
        }
        files(first: 50) {
          nodes {
            path
            additions
            deletions
          }
        }
      }
    }
  }
`;

interface PullRequestDetailResponse {
  data: {
    repository: {
      pullRequest: {
        number: number;
        title: string;
        url: string;
        body: string | null;
        isDraft: boolean;
        createdAt: string;
        additions: number;
        deletions: number;
        changedFiles: number;
        author: { login: string } | null;
        repository: { nameWithOwner: string };
        commits: {
          nodes: Array<{
            commit: {
              checkSuites: {
                nodes: Array<{
                  checkRuns: {
                    nodes: Array<{
                      name: string;
                      conclusion: string | null;
                      status: string;
                    }>;
                  };
                } | null>;
              };
            };
          }>;
        };
        reviews: {
          nodes: Array<{
            author: { login: string } | null;
            state: string;
            submittedAt: string | null;
          }>;
        };
        reviewRequests: {
          nodes: Array<{
            requestedReviewer:
              | {
                  __typename: "User" | "Mannequin";
                  login: string;
                }
              | {
                  __typename: "Team";
                  slug: string;
                  organization: {
                    login: string;
                  } | null;
                }
              | null;
          }>;
        };
        files: {
          nodes: Array<{
            path: string;
            additions: number;
            deletions: number;
          }>;
        };
      } | null;
    } | null;
  };
}

export async function fetchPullRequestDetail(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestDetail> {
  const payload = await runGhApi(PULL_REQUEST_DETAIL_QUERY, { owner, repo, number });
  const parsed = parseGraphQL<PullRequestDetailResponse>(payload, "PullRequestDetail");
  const pr = parsed.data.repository?.pullRequest;

  if (!pr) {
    throw new Error(`Pull request ${owner}/${repo}#${number} not found`);
  }

  const checkRuns: CheckRun[] = (pr.commits.nodes.at(0)?.commit.checkSuites.nodes ?? [])
    .flatMap((suite) => suite?.checkRuns.nodes ?? [])
    .map((run) => ({
      name: run.name,
      conclusion: run.conclusion,
      status: run.status
    }));

  const reviews: ReviewSummary[] = pr.reviews.nodes.map((review) => ({
    author: review.author?.login ?? "ghost",
    state: review.state,
    submittedAt: review.submittedAt
  }));

  const requestedReviewers: string[] = pr.reviewRequests.nodes
    .map((request) => normalizeRequestedReviewer(request.requestedReviewer))
    .filter((reviewer): reviewer is string => Boolean(reviewer));

  const files: ChangedFile[] = pr.files.nodes.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions
  }));

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    body: pr.body ?? "",
    isDraft: pr.isDraft,
    author: pr.author?.login ?? "ghost",
    repository: pr.repository.nameWithOwner,
    createdAt: pr.createdAt,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    checkRuns,
    reviews,
    requestedReviewers,
    files
  };
}

export function extractOrgFromScope(repositoryScope: string | null): string | null {
  const prefix = "org:";
  return repositoryScope?.startsWith(prefix) ? repositoryScope.slice(prefix.length) : null;
}

export async function fetchMyPrsData(options: {
  viewerLogin: string;
  includeDrafts: boolean;
  repositoryScope: string | null;
  cursor?: string | null;
}): Promise<{ myPullRequests: PullRequestSummary[]; waitingOnOthers: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null; totalCount: number }> {
  const { viewerLogin, includeDrafts, repositoryScope } = options;
  const { pullRequests, hasMore, nextCursor, totalCount } = await fetchPrPage(
    scopedSearchQuery(
      `is:open is:pr archived:false sort:updated-desc author:${viewerLogin}`,
      repositoryScope
    ),
    options.cursor ?? null
  );
  const myPullRequests = sortPullRequests(
    pullRequests.filter((pr) => shouldIncludePullRequest(pr, includeDrafts))
  );
  const waitingOnOthers = sortPullRequests(
    myPullRequests.filter((pr) => shouldTrackWaitingOnOthers(pr, viewerLogin))
  );
  return { myPullRequests, waitingOnOthers, hasMore, nextCursor, totalCount };
}

export async function fetchNeedsMyReviewData(options: {
  viewerLogin: string;
  includeDrafts: boolean;
  repositoryScope: string | null;
  cursor?: string | null;
}): Promise<{ needsMyReview: PullRequestSummary[]; hasMore: boolean; nextCursor: string | null; totalCount: number }> {
  const { viewerLogin, includeDrafts, repositoryScope } = options;
  const { pullRequests, hasMore, nextCursor, totalCount } = await fetchPrPage(
    scopedSearchQuery(
      `is:open is:pr archived:false sort:updated-desc review-requested:${viewerLogin}`,
      repositoryScope
    ),
    options.cursor ?? null
  );
  return {
    needsMyReview: sortPullRequests(
      pullRequests.filter(
        (pr) => shouldIncludePullRequest(pr, includeDrafts) && isRequestedReviewer(pr, viewerLogin)
      )
    ),
    hasMore,
    nextCursor,
    totalCount
  };
}

export async function fetchAllViews(options: {
  viewerLogin: string;
  includeDrafts: boolean;
  watchedAuthor: string | null;
  repositoryScope: string | null;
}): Promise<TrackedAttentionState> {
  const { viewerLogin, includeDrafts, watchedAuthor, repositoryScope } = options;
  const org = extractOrgFromScope(repositoryScope);

  const [myPrsData, needsMyReviewData, watchedAuthorSearch, securityAlerts] = await Promise.all([
    fetchMyPrsData({ viewerLogin, includeDrafts, repositoryScope }),
    fetchNeedsMyReviewData({ viewerLogin, includeDrafts, repositoryScope }),
    watchedAuthor
      ? fetchPullRequestsAuthoredBy({ author: watchedAuthor, includeDrafts, repositoryScope })
      : Promise.resolve({ pullRequests: [], hasMore: false, nextCursor: null, totalCount: 0 }),
    org ? fetchDependabotAlerts(org) : Promise.resolve({ alerts: [], total: 0 })
  ]);

  const watchedAuthorPullRequests = watchedAuthorSearch.pullRequests;

  return {
    viewerLogin,
    repositoryScope,
    watchedAuthor,
    myPullRequests: myPrsData.myPullRequests,
    myPullRequestsHasMore: myPrsData.hasMore,
    myPullRequestsNextCursor: myPrsData.nextCursor,
    myPullRequestsTotalCount: myPrsData.totalCount,
    needsMyReview: needsMyReviewData.needsMyReview,
    needsMyReviewHasMore: needsMyReviewData.hasMore,
    needsMyReviewNextCursor: needsMyReviewData.nextCursor,
    needsMyReviewTotalCount: needsMyReviewData.totalCount,
    waitingOnOthers: myPrsData.waitingOnOthers,
    watchedAuthorPullRequests,
    watchedAuthorHasMore: watchedAuthorSearch.hasMore,
    watchedAuthorNextCursor: watchedAuthorSearch.nextCursor,
    watchedAuthorTotalCount: watchedAuthorSearch.totalCount,
    securityAlerts: securityAlerts.alerts,
    securityAlertTotal: securityAlerts.total,
    notifications: [],
    notificationUnreadCount: 0,
    refreshedAt: new Date().toISOString()
  };
}

export async function fetchPullRequestDiff(
  owner: string,
  repo: string,
  number: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "gh",
      ["pr", "diff", String(number), "--repo", `${owner}/${repo}`],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `gh pr diff exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}
