import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { isUnread } from "../../state.js";
import { PR_VIEWS, clampScroll, formatCiStatus, formatAge, formatReviewStatus, pad } from "../helpers.js";
import { useTerminalSize } from "../useTerminalSize.js";
export function PrList({ state, narrow }) {
    const { columns: cols, rows } = useTerminalSize();
    const visibleRows = Math.max(1, rows - 9);
    const view = PR_VIEWS[state.currentPrViewIndex];
    const { attentionState, isRefreshing, isLoadingMore } = state;
    const pullRequests = (() => {
        switch (view) {
            case "myPullRequests": return attentionState.myPullRequests;
            case "needsMyReview": return attentionState.needsMyReview;
            case "waitingOnOthers": return attentionState.waitingOnOthers;
            case "readyToMerge": return attentionState.readyToMerge;
            case "watchedAuthor": return attentionState.watchedAuthorPullRequests;
            default: return [];
        }
    })();
    const totalCount = (() => {
        switch (view) {
            case "myPullRequests": return attentionState.myPullRequestsTotalCount;
            case "needsMyReview": return attentionState.needsMyReviewTotalCount;
            case "watchedAuthor": return attentionState.watchedAuthorTotalCount;
            default: return undefined;
        }
    })();
    const { selectedRowIndex } = state;
    const scrollOffset = clampScroll(selectedRowIndex, state.tableScrollOffset, visibleRows);
    const visible = pullRequests.slice(scrollOffset, scrollOffset + visibleRows);
    const showingLabel = pullRequests.length === 0
        ? (isRefreshing ? "Loading…" : "No results")
        : totalCount != null
            ? `${scrollOffset + 1}–${scrollOffset + visible.length} of ${pullRequests.length} loaded (${totalCount} total)`
            : `${scrollOffset + 1}–${scrollOffset + visible.length} of ${pullRequests.length}`;
    const focusColor = !state.detailOpen || state.focusedPanel === "list" ? "cyan" : "gray";
    // Column widths for data cells. Header labels must be padded to the same width.
    // Each data cell is followed by one explicit space, so the header must match that too.
    const ciW = 2; // CI symbol padded to 2 chars  ("✓ ", "✗2", "~ ")
    const revW = 3; // Rev symbol padded to 3 chars  ("◑  ", "✓  ", "✗  ")
    if (narrow) {
        const panelWidth = Math.floor(cols * 0.38);
        const titleWidth = Math.max(8, panelWidth - 2 - (1 + ciW + 1 + revW + 1 + 1));
        return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: focusColor, width: "38%", children: [_jsxs(Text, { dimColor: true, children: ["· ", pad("CI", ciW), " ", pad("Rev", revW), " ", pad("Title", titleWidth)] }), visible.map((pr, i) => {
                    const selected = scrollOffset + i === selectedRowIndex;
                    const unread = isUnread(state.persistedState, pr);
                    const ci = formatCiStatus(pr);
                    const rev = formatReviewStatus(pr);
                    return (_jsxs(Text, { inverse: selected, dimColor: !unread && !selected, children: [_jsx(Text, { color: unread ? "yellow" : "gray", children: unread ? "●" : "·" }), " ", _jsx(Text, { color: ci.color, children: pad(ci.symbol, ciW) }), " ", _jsx(Text, { color: rev.color, children: pad(rev.symbol, revW) }), " ", pad(pr.title, titleWidth)] }, pr.id));
                }), isLoadingMore && _jsx(Text, { color: "yellow", dimColor: true, children: "  \u25CF Loading more\u2026" }), _jsx(Text, { dimColor: true, children: showingLabel })] }));
    }
    const repoCol = 24;
    const authorCol = 14;
    const ageCol = 6;
    // Total fixed chars per row: 1 (dot) + 1 (sp) + ciW + 1 (sp) + revW + 1 (sp) + repoCol + 1 (sp) + authorCol + 1 (sp) + ageCol + 1 (sp)
    const fixedTotal = 1 + 1 + ciW + 1 + revW + 1 + repoCol + 1 + authorCol + 1 + ageCol + 1;
    const titleWidth = Math.max(20, cols - 4 - fixedTotal);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: focusColor, flexGrow: 1, children: [_jsxs(Text, { dimColor: true, children: ["· ", pad("CI", ciW), " ", pad("Rev", revW), " ", pad("Title", titleWidth), " ", pad("Repo", repoCol), " ", pad("Author", authorCol), " ", pad("Age", ageCol)] }), visible.map((pr, i) => {
                const selected = scrollOffset + i === selectedRowIndex;
                const unread = isUnread(state.persistedState, pr);
                const ci = formatCiStatus(pr);
                const rev = formatReviewStatus(pr);
                const age = formatAge(pr.activity.latestActivityAt);
                return (_jsxs(Text, { inverse: selected, dimColor: !unread && !selected, children: [_jsx(Text, { color: unread ? "yellow" : "gray", children: unread ? "●" : "·" }), " ", _jsx(Text, { color: ci.color, children: pad(ci.symbol, ciW) }), " ", _jsx(Text, { color: rev.color, children: pad(rev.symbol, revW) }), " ", pad(pr.title, titleWidth), " ", pad(pr.repository, repoCol), " ", pad(pr.author, authorCol), " ", pad(age, ageCol)] }, pr.id));
            }), isLoadingMore && _jsx(Text, { color: "yellow", dimColor: true, children: "  \u25CF Loading more\u2026" }), _jsx(Text, { dimColor: true, children: showingLabel })] }));
}
