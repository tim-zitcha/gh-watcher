import React from "react";
import { Box, Text, useStdout } from "ink";
import { isUnread } from "../../state.js";
import { PR_VIEWS, clampScroll, formatCiStatus, formatTimestamp, pad } from "../helpers.js";
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
    ? isRefreshing ? "Loading..." : "No results"
    : totalCount != null
      ? `Showing ${scrollOffset + 1}–${scrollOffset + visible.length} of ${pullRequests.length} loaded (${totalCount} total)`
      : `Showing ${scrollOffset + 1}–${scrollOffset + visible.length} of ${pullRequests.length}`;

  if (narrow) {
    const availWidth = Math.floor(cols * 0.38) - 4;
    const prCol = 6; const ciCol = 5;
    const titleWidth = Math.max(8, availWidth - prCol - ciCol - 2);
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={!state.detailOpen || state.focusedPanel === "list" ? "cyan" : "gray"} width="38%">
        <Text bold>{pad("PR", prCol)} {pad("CI", ciCol)} {pad("Title", titleWidth)}</Text>
        <Text dimColor>{showingLabel}</Text>
        {visible.map((pr, i) => {
          const ci = formatCiStatus(pr);
          const selected = scrollOffset + i === selectedRowIndex;
          return (
            <Text key={pr.id} inverse={selected}>
              {pad(`#${pr.number}`, prCol)}{" "}
              <Text color={ci.color}>{pad(ci.symbol, ciCol)}</Text>
              {pad(pr.title, titleWidth)}
            </Text>
          );
        })}
        {isLoadingMore && <Text color="yellow" dimColor>  Loading more...</Text>}
      </Box>
    );
  }

  const availWidth = cols - 4;
  const fixedCols = { state: 5, repo: 26, pr: 6, author: 14, ci: 10, reviewers: 22, activity: 14 };
  const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 7;
  const titleWidth = Math.max(20, availWidth - fixedTotal);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={!state.detailOpen || state.focusedPanel === "list" ? "cyan" : "gray"} flexGrow={1}>
      <Text bold>
        {pad("State", fixedCols.state)} {pad("Repo", fixedCols.repo)} {pad("PR", fixedCols.pr)} {pad("Author", fixedCols.author)} {pad("CI", fixedCols.ci)} {pad("Reviewers", fixedCols.reviewers)} {pad("Activity", fixedCols.activity)} {pad("Title", titleWidth)}
      </Text>
      <Text dimColor>{showingLabel}</Text>
      {visible.map((pr, i) => {
        const selected = scrollOffset + i === selectedRowIndex;
        const badge = isUnread(state.persistedState, pr) ? "NEW" : "SEEN";
        const ci = formatCiStatus(pr);
        return (
          <Text key={pr.id} inverse={selected}>
            {pad(badge, fixedCols.state)} {pad(pr.repository, fixedCols.repo)} {pad(`#${pr.number}`, fixedCols.pr)} {pad(pr.author, fixedCols.author)}{" "}
            <Text color={ci.color}>{pad(ci.symbol, fixedCols.ci)}</Text>
            {" "}{pad(pr.requestedReviewers.join(", ") || "-", fixedCols.reviewers)} {pad(formatTimestamp(pr.activity.latestActivityAt), fixedCols.activity)} {pad(pr.title, titleWidth)}
          </Text>
        );
      })}
      {isLoadingMore && <Text color="yellow" dimColor>  ● Loading more...</Text>}
    </Box>
  );
}
