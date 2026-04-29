import React from "react";
import { Box, Text } from "ink";
import type { AppState, RepoSummary } from "../types.js";
import { clampScroll, pad } from "../helpers.js";
import { useTerminalSize } from "../useTerminalSize.js";

export function RepoList({ state, repos }: { state: AppState; repos: RepoSummary[] }) {
  const { columns: cols, rows } = useTerminalSize();
  const visibleRows = Math.max(1, rows - 9);

  const { repoListIndex } = state;
  const scrollOffset = clampScroll(repoListIndex, 0, visibleRows);
  const visible = repos.slice(scrollOffset, scrollOffset + visibleRows);

  const availWidth = cols - 4;
  const fixedCols = { prs: 9, review: 13, alerts: 10 };
  const fixedTotal = fixedCols.prs + fixedCols.review + fixedCols.alerts + 3;
  const nameWidth = Math.max(20, availWidth - fixedTotal);

  if (repos.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="green" flexGrow={1} paddingX={1}>
        <Text dimColor>{state.isRefreshing || state.accessibleRepos.length === 0 ? "Loading repositories…" : "No repositories found."}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="green" flexGrow={1}>
      <Text bold>
        {pad("Repository", nameWidth)} {pad("Open PRs", fixedCols.prs)} {pad("My Review", fixedCols.review)} {pad("Alerts", fixedCols.alerts)}
      </Text>
      <Text dimColor>Showing {scrollOffset + 1}-{scrollOffset + visible.length} of {repos.length} · sort: {state.repoSortMode} · s to cycle</Text>
      {visible.map((repo, i) => {
        const selected = scrollOffset + i === repoListIndex;
        const alertLabel = repo.criticalCount > 0
          ? `${repo.criticalCount} crit`
          : repo.alertCount > 0
          ? String(repo.alertCount)
          : "-";
        const alertColor = repo.criticalCount > 0 ? "red" : repo.alertCount > 0 ? "yellow" : "gray";
        const reviewColor = repo.needsReviewCount > 0 ? "yellow" : "gray";
        const prColor = repo.openPrCount > 0 ? "cyan" : "gray";
        return (
          <Text key={repo.nameWithOwner} inverse={selected}>
            {pad(repo.nameWithOwner, nameWidth)}{" "}
            <Text color={prColor}>{pad(String(repo.openPrCount), fixedCols.prs)}</Text>
            {" "}
            <Text color={reviewColor}>{pad(String(repo.needsReviewCount), fixedCols.review)}</Text>
            {" "}
            <Text color={alertColor}>{pad(alertLabel, fixedCols.alerts)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
