import React from "react";
import { Box, Text } from "ink";
import type { ViewName } from "../../types.js";
import { PR_VIEWS, formatTimestamp } from "../helpers.js";
import type { AppState } from "../types.js";

export function Header({ state }: { state: AppState }) {
  const { attentionState, persistedState, mode, lastStatus } = state;
  const scopeLabel = attentionState.repositoryScope ?? "all accessible repos";
  const refreshedLabel = `Refreshed: ${formatTimestamp(attentionState.refreshedAt)}`;
  const alerts = attentionState.securityAlerts;
  const hasCrit = alerts.some(a => a.severity === "critical");
  const hasHigh = alerts.some(a => a.severity === "high");
  const alertCounts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const a of alerts) alertCounts[a.severity]++;
  const total = attentionState.securityAlertTotal;
  const shown = alerts.length;
  const totalLabel = total > shown ? `${total} total, showing ${shown}` : `${shown} open`;

  if (mode === "security") {
    const org = attentionState.repositoryScope?.startsWith("org:")
      ? attentionState.repositoryScope.slice(4) : null;
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text>
          <Text bold>gh-watcher</Text>{"  "}
          <Text inverse> ⚠ SECURITY{org ? ` — ${org}` : ""} </Text>
          {"  "}Scope: {scopeLabel}{"  "}{refreshedLabel}{"  "}Status: {lastStatus}
        </Text>
        <Text>
          <Text bold>{totalLabel}</Text>
          {"   "}<Text color="red">CRIT: {alertCounts.critical}</Text>
          {"  "}<Text color="magenta">HIGH: {alertCounts.high}</Text>
          {"  "}<Text color="yellow">MED: {alertCounts.medium}</Text>
          {"  "}<Text color="cyan">LOW: {alertCounts.low}</Text>
          {"   "}<Text dimColor>s=sort  S=PRs</Text>
        </Text>
      </Box>
    );
  }

  const view = PR_VIEWS[state.currentPrViewIndex]!;
  const { myPullRequests, needsMyReview, waitingOnOthers, watchedAuthorPullRequests, watchedAuthor } = attentionState;
  const recentUsers = persistedState.watchedAuthors.recent.join(", ") || "none";
  void recentUsers; // available for future display

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box gap={2}>
        <Text bold>gh-watcher</Text>
        <Text dimColor>Scope: {scopeLabel}</Text>
        <Text dimColor>{refreshedLabel}</Text>
        <Text dimColor>Status: {lastStatus}</Text>
        {hasCrit && <Text color="red">⚠ CRIT</Text>}
        {!hasCrit && hasHigh && <Text color="magenta">⚠ HIGH</Text>}
      </Box>
      <Box gap={2}>
        {(["myPullRequests", "needsMyReview", "waitingOnOthers", "watchedAuthor"] as ViewName[]).map((v) => {
          const count = v === "myPullRequests"
            ? attentionState.myPullRequestsHasMore ? `${myPullRequests.length}+` : myPullRequests.length
            : v === "needsMyReview"
            ? attentionState.needsMyReviewHasMore ? `${needsMyReview.length}+` : needsMyReview.length
            : v === "waitingOnOthers" ? waitingOnOthers.length
            : attentionState.watchedAuthorHasMore
              ? `${watchedAuthorPullRequests.length}+` : watchedAuthorPullRequests.length;
          const label = v === "myPullRequests" ? "My PRs"
            : v === "needsMyReview" ? "Needs My Review"
            : v === "waitingOnOthers" ? "Waiting On Others"
            : `Authored By ${watchedAuthor ?? "User"}`;
          const active = view === v;
          return <Text key={v} bold={active} color={active ? "cyan" : undefined} underline={active}>{label} ({count})</Text>;
        })}
      </Box>
    </Box>
  );
}
