import { spawn } from "node:child_process";
import { isReadyToMerge, isRequestedReviewer, shouldIncludePullRequest, shouldTrackWaitingOnOthers, sortPullRequests } from "./domain.js";
const _cache = new Map();
const fetchCache = {
    get(key) {
        const entry = _cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            _cache.delete(key);
            return undefined;
        }
        return entry.value;
    },
    set(key, value, ttlMs) {
        _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear() {
        _cache.clear();
    }
};
export function clearFetchCache() {
    fetchCache.clear();
}
// ---------------------------------------------------------------------------
const SEARCH_PAGE_SIZE = 30; // GitHub recommends ≤30 for search; larger pages hit timeout limits
const ACTIVITY_CHUNK_SIZE = 12; // nodes(ids:) has a 100-node hard cap; 12 keeps queries small
function parseGraphQL(payload, queryName) {
    const json = JSON.parse(payload);
    if (json.errors && json.errors.length > 0) {
        const messages = json.errors.map((e) => e.message).join("; ");
        throw new Error(`GraphQL error in ${queryName}: ${messages}`);
    }
    return json;
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
          mergeable
          mergeStateStatus
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
function scopedSearchQuery(searchQuery, repositoryScope) {
    return repositoryScope ? `${searchQuery} ${repositoryScope}` : searchQuery;
}
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
function spawnGhApi(query, variables) {
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
function isRateLimitError(message) {
    return message.includes("API rate limit exceeded") || message.includes("secondary rate limit");
}
async function runGhApi(query, variables = {}, attempt = 0) {
    try {
        return await spawnGhApi(query, variables);
    }
    catch (error) {
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
function computeActivitySnapshot(fields) {
    const latestCommentAt = (fields.comments?.nodes ?? [])
        .map((comment) => comment.updatedAt || comment.createdAt)
        .sort()
        .at(-1) ?? null;
    const latestReviewAt = (fields.reviews?.nodes ?? [])
        .map((review) => review.submittedAt)
        .filter((submittedAt) => Boolean(submittedAt))
        .sort()
        .at(-1) ?? null;
    const latestCommit = fields.commits?.nodes.at(-1)?.commit;
    const latestCommitAt = latestCommit?.committedDate ?? null;
    const latestActivityAt = [latestCommentAt, latestReviewAt, latestCommitAt, fields.updatedAt]
        .filter((value) => Boolean(value))
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
function computeCiStatus(fields) {
    return fields.commits?.nodes.at(-1)?.commit.statusCheckRollup?.state ?? "UNKNOWN";
}
function computeCheckCounts(fields) {
    const contexts = fields.commits?.nodes.at(-1)?.commit.statusCheckRollup?.contexts.nodes ?? [];
    let passing = 0;
    let failing = 0;
    let pending = 0;
    for (const ctx of contexts) {
        if (!ctx)
            continue;
        if (ctx.__typename === "CheckRun") {
            if (ctx.status !== "COMPLETED") {
                pending++;
            }
            else if (ctx.conclusion === "SUCCESS" || ctx.conclusion === "NEUTRAL" || ctx.conclusion === "SKIPPED") {
                passing++;
            }
            else if (ctx.conclusion) {
                failing++;
            }
        }
        else {
            if (ctx.state === "SUCCESS")
                passing++;
            else if (ctx.state === "PENDING" || ctx.state === "EXPECTED")
                pending++;
            else
                failing++;
        }
    }
    return { passing, failing, pending };
}
function normalizeRequestedReviewer(reviewer) {
    if (!reviewer) {
        return null;
    }
    if (reviewer.__typename === "Team") {
        return reviewer.organization ? `${reviewer.organization.login}/${reviewer.slug}` : reviewer.slug;
    }
    return reviewer.login;
}
export function mapPullRequestNode(node) {
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
        mergeable: node.mergeable,
        mergeStateStatus: node.mergeStateStatus,
        requestedReviewers: node.reviewRequests.nodes
            .map((item) => normalizeRequestedReviewer(item.requestedReviewer))
            .filter((reviewer) => Boolean(reviewer)),
        ciStatus: computeCiStatus(node),
        checkCounts: computeCheckCounts(node),
        activity: computeActivitySnapshot(node)
    };
}
export function parseSearchResponse(payload) {
    const parsed = parseGraphQL(payload, "SearchPullRequests");
    return parsed.data.search.nodes
        .filter((node) => Boolean(node))
        .map(mapPullRequestNode);
}
function parseSearchPage(payload) {
    const parsed = parseGraphQL(payload, "SearchPullRequests");
    return {
        pullRequests: parsed.data.search.nodes
            .filter((node) => Boolean(node))
            .map(mapPullRequestNode),
        hasNextPage: parsed.data.search.pageInfo.hasNextPage,
        endCursor: parsed.data.search.pageInfo.endCursor,
        issueCount: parsed.data.search.issueCount
    };
}
function buildActivityQuery(ids) {
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
function parseActivityResponse(payload) {
    const parsed = parseGraphQL(payload, "FetchActivitySnapshots");
    return new Map(parsed.data.nodes
        .filter((node) => Boolean(node))
        .map((node) => [
        node.id,
        {
            activity: computeActivitySnapshot(node),
            ciStatus: computeCiStatus(node),
            checkCounts: computeCheckCounts(node)
        }
    ]));
}
async function fetchActivitySnapshots(ids) {
    if (ids.length === 0) {
        return new Map();
    }
    const snapshots = new Map();
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
async function fetchPrPage(searchQuery, cursor) {
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
export async function fetchViewerLogin() {
    const payload = await runGhApi(VIEWER_QUERY);
    const parsed = parseGraphQL(payload, "Viewer");
    return parsed.data.viewer.login;
}
export async function fetchViewerOrganizations() {
    const payload = await runGhApi(VIEWER_ORGANIZATIONS_QUERY);
    const parsed = parseGraphQL(payload, "ViewerOrganizations");
    return parsed.data.viewer.organizations.nodes
        .filter((organization) => Boolean(organization))
        .map((organization) => organization.login);
}
export async function fetchOrganizationMembers(organization) {
    const payload = await runGhApi(ORGANIZATION_MEMBERS_QUERY, {
        organization
    });
    const parsed = parseGraphQL(payload, "OrganizationMembers");
    return parsed.data.organization?.membersWithRole.nodes
        .filter((member) => Boolean(member))
        .map((member) => member.login)
        .sort((left, right) => left.localeCompare(right)) ?? [];
}
export async function fetchPullRequestsAuthoredBy(options) {
    const cacheKey = `fetchPullRequestsAuthoredBy:${options.author}:${options.repositoryScope ?? ""}:${options.includeDrafts}:${options.cursor ?? ""}`;
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    const { pullRequests, hasMore, nextCursor, totalCount } = await fetchPrPage(scopedSearchQuery(`is:open is:pr archived:false sort:updated-desc author:${options.author}`, options.repositoryScope), options.cursor ?? null);
    const result = {
        pullRequests: sortPullRequests(pullRequests.filter((pr) => shouldIncludePullRequest(pr, options.includeDrafts))),
        hasMore,
        nextCursor,
        totalCount
    };
    fetchCache.set(cacheKey, result, 2 * 60 * 1000);
    return result;
}
const SECURITY_ALERT_LIMIT = 100;
function spawnGhRest(path, includeHeaders = false) {
    return new Promise((resolve, reject) => {
        const args = ["api"];
        if (includeHeaders)
            args.push("--include");
        args.push(path);
        const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
        const chunks = [];
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
async function runGhRest(path, includeHeaders = false, attempt = 0) {
    try {
        return await spawnGhRest(path, includeHeaders);
    }
    catch (error) {
        if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
            return runGhRest(path, includeHeaders, attempt + 1);
        }
        throw error;
    }
}
function parseLinkHeaderTotal(raw) {
    const match = raw.match(/link:.*?[?&]page=(\d+)[^>]*>;\s*rel="last"/i);
    return match ? Number.parseInt(match[1], 10) : 0;
}
function normalizeSeverity(raw) {
    if (raw === "critical" || raw === "high" || raw === "medium" || raw === "low") {
        return raw;
    }
    return "unknown";
}
async function fetchDependabotAlertTotal(org) {
    const raw = await runGhRest(`/orgs/${encodeURIComponent(org)}/dependabot/alerts?state=open&per_page=1`, true);
    const fromLink = parseLinkHeaderTotal(raw);
    if (fromLink > 0)
        return fromLink;
    const bodyMatch = raw.match(/\[[\s\S]*\]/);
    if (bodyMatch) {
        const items = JSON.parse(bodyMatch[0]);
        return items.length;
    }
    return 0;
}
async function fetchDependabotAlertPage(org) {
    const payload = await runGhRest(`/orgs/${encodeURIComponent(org)}/dependabot/alerts?state=open&per_page=${SECURITY_ALERT_LIMIT}&sort=created&direction=desc`);
    const raw = JSON.parse(payload);
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
const ORG_REPOS_QUERY = `
  query OrgRepos($org: String!, $after: String) {
    organization(login: $org) {
      repositories(first: 100, after: $after, orderBy: { field: PUSHED_AT, direction: DESC }, isFork: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          nameWithOwner
          isArchived
          pullRequests(states: [OPEN]) { totalCount }
        }
      }
    }
  }
`;
const VIEWER_REPOS_QUERY = `
  query ViewerRepos($after: String) {
    viewer {
      repositories(first: 100, after: $after, orderBy: { field: PUSHED_AT, direction: DESC }, isFork: false, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
        pageInfo { hasNextPage endCursor }
        nodes {
          nameWithOwner
          isArchived
          pullRequests(states: [OPEN]) { totalCount }
        }
      }
    }
  }
`;
async function fetchOrgRepos(org) {
    const repos = [];
    let after = null;
    for (let page = 0; page < 10; page++) {
        const payload = await runGhApi(ORG_REPOS_QUERY, { org, after });
        const parsed = parseGraphQL(payload, "OrgRepos");
        const conn = parsed.data.organization?.repositories;
        if (!conn)
            break;
        for (const node of conn.nodes) {
            if (node && !node.isArchived)
                repos.push({ nameWithOwner: node.nameWithOwner, openPrCount: node.pullRequests.totalCount });
        }
        if (!conn.pageInfo.hasNextPage)
            break;
        after = conn.pageInfo.endCursor;
    }
    return repos;
}
async function fetchViewerRepos() {
    const repos = [];
    let after = null;
    for (let page = 0; page < 10; page++) {
        const payload = await runGhApi(VIEWER_REPOS_QUERY, { after });
        const parsed = parseGraphQL(payload, "ViewerRepos");
        const conn = parsed.data.viewer?.repositories;
        if (!conn)
            break;
        for (const node of conn.nodes) {
            if (node && !node.isArchived)
                repos.push({ nameWithOwner: node.nameWithOwner, openPrCount: node.pullRequests.totalCount });
        }
        if (!conn.pageInfo.hasNextPage)
            break;
        after = conn.pageInfo.endCursor;
    }
    return repos;
}
export async function fetchAccessibleRepos(orgs, repositoryScope) {
    const cacheKey = `fetchAccessibleRepos:${repositoryScope ?? "all"}:${orgs.join(",")}`;
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    let repos;
    const scopedOrg = repositoryScope?.startsWith("org:") ? repositoryScope.slice(4) : null;
    if (scopedOrg) {
        repos = await fetchOrgRepos(scopedOrg);
    }
    else if (orgs.length > 0) {
        const [orgResults, viewerRepos] = await Promise.all([
            Promise.all(orgs.map(fetchOrgRepos)),
            fetchViewerRepos(),
        ]);
        const seen = new Set();
        repos = [...orgResults.flat(), ...viewerRepos].filter(r => {
            if (seen.has(r.nameWithOwner))
                return false;
            seen.add(r.nameWithOwner);
            return true;
        });
    }
    else {
        repos = await fetchViewerRepos();
    }
    fetchCache.set(cacheKey, repos, 15 * 60 * 1000);
    return repos;
}
export async function fetchDependabotAlerts(org) {
    const cacheKey = `fetchDependabotAlerts:${org}`;
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    const [alerts, total] = await Promise.all([
        fetchDependabotAlertPage(org),
        fetchDependabotAlertTotal(org)
    ]);
    const result = { alerts, total };
    fetchCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
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
export async function fetchRepoPullRequests(owner, repo) {
    const cacheKey = `fetchRepoPullRequests:${owner}/${repo}`;
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    const searchQuery = `repo:${owner}/${repo} is:pr is:open`;
    const prs = [];
    let cursor = null;
    for (let page = 0; page < 5; page++) {
        const result = await fetchPrPage(searchQuery, cursor);
        prs.push(...result.pullRequests);
        if (!result.hasMore)
            break;
        cursor = result.nextCursor;
    }
    fetchCache.set(cacheKey, prs, 2 * 60 * 1000);
    return prs;
}
export async function fetchPullRequestDetail(owner, repo, number) {
    const payload = await runGhApi(PULL_REQUEST_DETAIL_QUERY, { owner, repo, number });
    const parsed = parseGraphQL(payload, "PullRequestDetail");
    const pr = parsed.data.repository?.pullRequest;
    if (!pr) {
        throw new Error(`Pull request ${owner}/${repo}#${number} not found`);
    }
    const checkRuns = (pr.commits.nodes.at(0)?.commit.checkSuites.nodes ?? [])
        .flatMap((suite) => suite?.checkRuns.nodes ?? [])
        .map((run) => ({
        name: run.name,
        conclusion: run.conclusion,
        status: run.status
    }));
    const reviews = pr.reviews.nodes.map((review) => ({
        author: review.author?.login ?? "ghost",
        state: review.state,
        submittedAt: review.submittedAt
    }));
    const requestedReviewers = pr.reviewRequests.nodes
        .map((request) => normalizeRequestedReviewer(request.requestedReviewer))
        .filter((reviewer) => Boolean(reviewer));
    const files = pr.files.nodes.map((file) => ({
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
export function extractOrgFromScope(repositoryScope) {
    const prefix = "org:";
    return repositoryScope?.startsWith(prefix) ? repositoryScope.slice(prefix.length) : null;
}
export async function fetchMyPrsData(options) {
    const { viewerLogin, includeDrafts, repositoryScope } = options;
    const cacheKey = `fetchMyPrsData:${viewerLogin}:${repositoryScope ?? ""}:${includeDrafts}:${options.cursor ?? ""}`;
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    const { pullRequests, hasMore, nextCursor, totalCount } = await fetchPrPage(scopedSearchQuery(`is:open is:pr archived:false sort:updated-desc author:${viewerLogin}`, repositoryScope), options.cursor ?? null);
    const myPullRequests = sortPullRequests(pullRequests.filter((pr) => shouldIncludePullRequest(pr, includeDrafts)));
    const waitingOnOthers = sortPullRequests(myPullRequests.filter((pr) => shouldTrackWaitingOnOthers(pr, viewerLogin)));
    const readyToMerge = sortPullRequests(myPullRequests.filter(isReadyToMerge));
    const result = { myPullRequests, waitingOnOthers, readyToMerge, hasMore, nextCursor, totalCount };
    fetchCache.set(cacheKey, result, 2 * 60 * 1000);
    return result;
}
export async function fetchNeedsMyReviewData(options) {
    const { viewerLogin, includeDrafts, repositoryScope } = options;
    const cacheKey = `fetchNeedsMyReviewData:${viewerLogin}:${repositoryScope ?? ""}:${includeDrafts}:${options.cursor ?? ""}`;
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    const { pullRequests, hasMore, nextCursor, totalCount } = await fetchPrPage(scopedSearchQuery(`is:open is:pr archived:false sort:updated-desc review-requested:${viewerLogin}`, repositoryScope), options.cursor ?? null);
    const result = {
        needsMyReview: sortPullRequests(pullRequests.filter((pr) => shouldIncludePullRequest(pr, includeDrafts) && isRequestedReviewer(pr, viewerLogin))),
        hasMore,
        nextCursor,
        totalCount
    };
    fetchCache.set(cacheKey, result, 2 * 60 * 1000);
    return result;
}
export async function fetchAllViews(options) {
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
        readyToMerge: myPrsData.readyToMerge,
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
export async function fetchPullRequestDiff(owner, repo, number) {
    return new Promise((resolve, reject) => {
        const child = spawn("gh", ["pr", "diff", String(number), "--repo", `${owner}/${repo}`], { stdio: ["ignore", "pipe", "pipe"] });
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
async function ghMutate(method, path) {
    return new Promise((resolve, reject) => {
        const child = spawn("gh", ["api", "--method", method, path], { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `gh api ${method} exited with code ${code}`));
                return;
            }
            resolve();
        });
    });
}
export async function markNotificationRead(threadId) {
    await ghMutate("PATCH", `/notifications/threads/${encodeURIComponent(threadId)}`);
}
export async function markAllNotificationsRead() {
    await ghMutate("PUT", "/notifications");
}
export async function fetchNotifications() {
    const cacheKey = "fetchNotifications";
    const cached = fetchCache.get(cacheKey);
    if (cached)
        return cached;
    const payload = await runGhRest("/notifications?all=false&per_page=50");
    const raw = JSON.parse(payload);
    const result = raw.map((n) => ({
        id: n.id,
        unread: n.unread,
        reason: n.reason,
        subject: { title: n.subject.title, type: n.subject.type, url: n.subject.url },
        repository: n.repository.full_name,
        updatedAt: n.updated_at,
    }));
    fetchCache.set(cacheKey, result, 1 * 60 * 1000);
    return result;
}
