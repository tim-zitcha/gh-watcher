import React from "react";
import { Box, Text } from "ink";
import { PR_VIEWS } from "../helpers.js";
import type { AppState } from "../types.js";
import type { ViewName } from "../../types.js";

export function SubNav({ state }: { state: AppState }) {
  const { mode, attentionState, securitySortMode, messagesShowAll } = state;

  if (mode === "security") {
    const total = attentionState.securityAlertTotal;
    const shown = attentionState.securityAlerts.length;
    return (
      <Box paddingX={1} gap={2}>
        <Text dimColor>Sort:</Text>
        <Text color="yellow">{securitySortMode}</Text>
        <Text dimColor>·</Text>
        <Text dimColor>
          Showing {shown} of {total} open alerts
          {attentionState.repositoryScope ? ` in ${attentionState.repositoryScope}` : " across all orgs"}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>s=sort  o=scope</Text>
      </Box>
    );
  }

  if (mode === "messages") {
    const { notifications, notificationUnreadCount } = attentionState;
    const allCount = notifications.length;
    return (
      <Box paddingX={1} gap={2}>
        <Text color={!messagesShowAll ? "cyan" : "gray"} bold={!messagesShowAll}>
          Unread ({notificationUnreadCount})
        </Text>
        <Text dimColor>·</Text>
        <Text color={messagesShowAll ? "cyan" : "gray"} bold={messagesShowAll}>
          All ({allCount})
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>a=toggle  Enter open  r refresh</Text>
      </Box>
    );
  }

  // PR mode — sub-tabs
  const view = PR_VIEWS[state.currentPrViewIndex]!;
  const {
    myPullRequests, needsMyReview, waitingOnOthers, watchedAuthorPullRequests, watchedAuthor,
    myPullRequestsHasMore, needsMyReviewHasMore, watchedAuthorHasMore,
  } = attentionState;

  const tabs: Array<{ key: ViewName; label: string; count: string }> = [
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

  return (
    <Box paddingX={1}>
      {tabs.map((tab, i) => (
        <React.Fragment key={tab.key}>
          {i > 0 && <Text dimColor>  ·  </Text>}
          <Text color={view === tab.key ? "white" : "gray"} bold={view === tab.key} underline={view === tab.key}>
            {tab.label}
          </Text>
          <Text color={view === tab.key ? "cyan" : "gray"}> ({tab.count})</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
