import React from "react";
import { Box, Text, useStdout } from "ink";
import { isUnread } from "../../state.js";
import { PR_VIEWS, clampScroll, formatCiStatus, formatAge, formatReviewStatus, pad } from "../helpers.js";
import type { AppState } from "../types.js";

export function PrList({ state, narrow }: { state: AppState; narrow: boolean }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 200;
  const rows = stdout?.rows ?? 24;
  const visibleRows = Math.max(1, rows - 9);

  const view = PR_VIEWS[state.currentPrViewIndex]!;
  const { attentionState, isRefreshing, isLoadingMore } = state;

  const pullRequests = (() => {
    switch (view) {
      case "myPullRequests": return attentionState.myPullRequests;
      case "needsMyReview": return attentionState.needsMyReview;
      case "waitingOnOthers": return attentionState.waitingOnOthers;
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

  if (narrow) {
    const panelWidth = Math.floor(cols * 0.38);
    const titleWidth = Math.max(8, panelWidth - 2 - 3 - 3 - 4);
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={focusColor} width="38%">
        <Text dimColor>{pad("·", 2)} {pad("CI", 2)} {pad("R", 2)} {pad("Title", titleWidth)}</Text>
        <Text dimColor>{showingLabel}</Text>
        {visible.map((pr, i) => {
          const selected = scrollOffset + i === selectedRowIndex;
          const unread = isUnread(state.persistedState, pr);
          const ci = formatCiStatus(pr);
          const rev = formatReviewStatus(pr);
          return (
            <Text key={pr.id} inverse={selected} dimColor={!unread && !selected}>
              <Text color={unread ? "yellow" : "gray"}>{unread ? "●" : "·"}</Text>
              {" "}
              <Text color={ci.color}>{pad(ci.symbol, 2)}</Text>
              {" "}
              <Text color={rev.color}>{pad(rev.symbol, 2)}</Text>
              {" "}
              {pad(pr.title, titleWidth)}
            </Text>
          );
        })}
        {isLoadingMore && <Text color="yellow" dimColor>  ● Loading more…</Text>}
      </Box>
    );
  }

  const unreadCol = 2;
  const ciCol = 3;
  const revCol = 3;
  const repoCol = 24;
  const authorCol = 14;
  const ageCol = 6;
  const fixedTotal = unreadCol + ciCol + revCol + repoCol + authorCol + ageCol + 7;
  const titleWidth = Math.max(20, cols - 4 - fixedTotal);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={focusColor} flexGrow={1}>
      <Text dimColor>
        {pad("·", unreadCol)} {pad("CI", ciCol)} {pad("R", revCol)} {pad("Title", titleWidth)} {pad("Repo", repoCol)} {pad("Author", authorCol)} {pad("Age", ageCol)}
      </Text>
      <Text dimColor>{showingLabel}</Text>
      {visible.map((pr, i) => {
        const selected = scrollOffset + i === selectedRowIndex;
        const unread = isUnread(state.persistedState, pr);
        const ci = formatCiStatus(pr);
        const rev = formatReviewStatus(pr);
        const age = formatAge(pr.activity.latestActivityAt);
        return (
          <Text key={pr.id} inverse={selected} dimColor={!unread && !selected}>
            <Text color={unread ? "yellow" : "gray"}>{unread ? "●" : "·"}</Text>
            {" "}
            <Text color={ci.color}>{pad(ci.symbol, ciCol - 1)}</Text>
            {" "}
            <Text color={rev.color}>{pad(rev.symbol, revCol - 1)}</Text>
            {" "}
            {pad(pr.title, titleWidth)}
            {" "}
            {pad(pr.repository, repoCol)}
            {" "}
            {pad(pr.author, authorCol)}
            {" "}
            {pad(age, ageCol)}
          </Text>
        );
      })}
      {isLoadingMore && <Text color="yellow" dimColor>  ● Loading more…</Text>}
    </Box>
  );
}
