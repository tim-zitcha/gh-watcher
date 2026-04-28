import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Box, Text } from "ink";
import { PR_VIEWS } from "../helpers.js";
export function SubNav({ state }) {
    const { mode, attentionState, securitySortMode, messagesShowAll } = state;
    if (mode === "security") {
        const total = attentionState.securityAlertTotal;
        const shown = attentionState.securityAlerts.length;
        return (_jsxs(Box, { paddingX: 1, gap: 2, children: [_jsx(Text, { dimColor: true, children: "Sort:" }), _jsx(Text, { color: "yellow", children: securitySortMode }), _jsx(Text, { dimColor: true, children: "\u00B7" }), _jsxs(Text, { dimColor: true, children: ["Showing ", shown, " of ", total, " open alerts", attentionState.repositoryScope ? ` in ${attentionState.repositoryScope}` : " across all orgs"] }), _jsx(Box, { flexGrow: 1 }), _jsx(Text, { dimColor: true, children: "s=sort  o=scope" })] }));
    }
    if (mode === "messages") {
        const { notifications, notificationUnreadCount } = attentionState;
        const allCount = notifications.length;
        return (_jsxs(Box, { paddingX: 1, gap: 2, children: [_jsxs(Text, { color: !messagesShowAll ? "cyan" : "gray", bold: !messagesShowAll, children: ["Unread (", notificationUnreadCount, ")"] }), _jsx(Text, { dimColor: true, children: "\u00B7" }), _jsxs(Text, { color: messagesShowAll ? "cyan" : "gray", bold: messagesShowAll, children: ["All (", allCount, ")"] }), _jsx(Box, { flexGrow: 1 }), _jsx(Text, { dimColor: true, children: "a=toggle  Enter open  r refresh" })] }));
    }
    // PR mode — sub-tabs
    const view = PR_VIEWS[state.currentPrViewIndex];
    const { myPullRequests, needsMyReview, waitingOnOthers, watchedAuthorPullRequests, watchedAuthor, myPullRequestsHasMore, needsMyReviewHasMore, watchedAuthorHasMore, } = attentionState;
    const tabs = [
        {
            key: "myPullRequests", label: "My PRs",
            count: myPullRequestsHasMore ? `${myPullRequests.length}+` : String(myPullRequests.length),
        },
        {
            key: "needsMyReview", label: "Needs Review",
            count: needsMyReviewHasMore ? `${needsMyReview.length}+` : String(needsMyReview.length),
        },
        {
            key: "waitingOnOthers", label: "Waiting",
            count: String(waitingOnOthers.length),
        },
        {
            key: "readyToMerge", label: "Ready to merge",
            count: String(attentionState.readyToMerge.length),
        },
        {
            key: "watchedAuthor", label: watchedAuthor ? `Watched: ${watchedAuthor}` : "Watched",
            count: watchedAuthorHasMore ? `${watchedAuthorPullRequests.length}+` : String(watchedAuthorPullRequests.length),
        },
    ];
    return (_jsx(Box, { paddingX: 1, children: tabs.map((tab, i) => (_jsxs(React.Fragment, { children: [i > 0 && _jsx(Text, { dimColor: true, children: "  \u00B7  " }), _jsx(Text, { color: view === tab.key ? "white" : "gray", bold: view === tab.key, underline: view === tab.key, children: tab.label }), _jsxs(Text, { color: view === tab.key ? "cyan" : "gray", children: [" (", tab.count, ")"] })] }, tab.key))) }));
}
