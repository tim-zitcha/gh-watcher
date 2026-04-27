import he from "he";
export const PR_VIEWS = ["myPullRequests", "needsMyReview", "waitingOnOthers", "watchedAuthor"];
export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
export const COMMON_WATCHED_AUTHORS = ["dependabot[bot]"];
export function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf()))
        return value;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
export function htmlToText(html) {
    const stripped = html
        .replace(/\r/g, "")
        .replace(/<details[^>]*>/gi, "").replace(/<\/details>/gi, "")
        .replace(/<summary[^>]*>(.*?)<\/summary>/gis, "[$1]")
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis, "\n## $1\n")
        .replace(/<li[^>]*>/gi, "\n  - ").replace(/<\/li>/gi, "")
        .replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, "")
        .replace(/<p[^>]*>/gi, "\n").replace(/<\/p>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<strong[^>]*>(.*?)<\/strong>/gis, "*$1*")
        .replace(/<em[^>]*>(.*?)<\/em>/gis, "_$1_")
        .replace(/<code[^>]*>(.*?)<\/code>/gis, "`$1`")
        .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, "$2 ($1)")
        .replace(/<blockquote[^>]*>/gi, "\n> ").replace(/<\/blockquote>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return he.decode(stripped);
}
export function formatCiStatus(pr) {
    const { passing, failing, pending } = pr.checkCounts;
    const total = passing + failing + pending;
    if (total === 0) {
        switch (pr.ciStatus) {
            case "SUCCESS": return { symbol: "✓", color: "green" };
            case "FAILURE":
            case "ERROR": return { symbol: "✗", color: "red" };
            case "PENDING":
            case "EXPECTED": return { symbol: "●", color: "yellow" };
            default: return { symbol: "-", color: "gray" };
        }
    }
    // Always return a compact ≤2 char symbol — show worst state first so it fits in the list column.
    // Full check detail is available in the PR detail panel.
    if (failing > 0)
        return { symbol: failing > 9 ? "✗!" : `✗${failing}`, color: "red" };
    if (pending > 0)
        return { symbol: "~", color: "yellow" };
    return { symbol: "✓", color: "green" };
}
export function sortSecurityAlerts(alerts, mode) {
    return [...alerts].sort((a, b) => {
        if (mode === "severity") {
            const diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
            if (diff !== 0)
                return diff;
        }
        return a.createdAt.localeCompare(b.createdAt);
    });
}
export function clampScroll(selectedRow, currentOffset, visibleRows) {
    if (selectedRow < currentOffset)
        return selectedRow;
    if (selectedRow >= currentOffset + visibleRows)
        return selectedRow - visibleRows + 1;
    return currentOffset;
}
export function pad(s, w) {
    if (s.length > w)
        return s.slice(0, Math.max(w - 3, 0)) + "...";
    return s.padEnd(w);
}
export function formatReviewStatus(pr) {
    switch (pr.reviewDecision) {
        case "APPROVED": return { symbol: "✓", color: "green" };
        case "CHANGES_REQUESTED": return { symbol: "✗", color: "red" };
        case "REVIEW_REQUIRED": return { symbol: "◑", color: "cyan" };
        default: return { symbol: "·", color: "gray" };
    }
}
export function formatAge(isoDate) {
    const ms = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60)
        return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)
        return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 30)
        return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
}
export function parseDiff(raw) {
    if (!raw.trim())
        return [];
    const files = [];
    let current = null;
    for (const text of raw.split("\n")) {
        if (text.startsWith("diff --git ")) {
            const match = text.match(/diff --git a\/.+ b\/(.+)/);
            const header = match?.[1] ?? text;
            current = { header, lines: [] };
            files.push(current);
        }
        if (!current)
            continue;
        let type;
        if (text.startsWith("diff ") || text.startsWith("--- ") || text.startsWith("+++ ")) {
            type = "file";
        }
        else if (text.startsWith("@@")) {
            type = "hunk";
        }
        else if (text.startsWith("+")) {
            type = "add";
        }
        else if (text.startsWith("-")) {
            type = "del";
        }
        else {
            type = "ctx";
        }
        current.lines.push({ type, text });
    }
    return files;
}
