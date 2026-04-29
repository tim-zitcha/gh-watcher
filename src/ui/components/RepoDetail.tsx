import React from "react";
import { Box, Text } from "ink";
import type { AppState, RepoSummary } from "../types.js";
import type { AlertSeverity } from "../../types.js";
import { clampScroll, formatCiStatus, formatTimestamp, pad } from "../helpers.js";
import { useTerminalSize } from "../useTerminalSize.js";

function severityColor(s: AlertSeverity): string {
  switch (s) {
    case "critical": return "red";
    case "high": return "magenta";
    case "medium": return "yellow";
    case "low": return "cyan";
    default: return "gray";
  }
}

export function RepoDetail({ state, repo }: { state: AppState; repo: RepoSummary }) {
  const { rows } = useTerminalSize();
  const visibleRows = Math.max(1, rows - 9);

  const { selectedRowIndex, tableScrollOffset, repoDetailPrs, repoDetailPrsLoading } = state;
  const prScrollOffset = clampScroll(selectedRowIndex, tableScrollOffset, visibleRows);
  const visiblePrs = repoDetailPrs.slice(prScrollOffset, prScrollOffset + Math.floor(visibleRows * 0.6));

  const alertRows = Math.floor(visibleRows * 0.35);
  const visibleAlerts = repo.alerts.slice(0, alertRows);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="green" flexGrow={1}>
      <Text bold color="green">{repo.nameWithOwner}</Text>
      <Text dimColor>
        {repoDetailPrsLoading ? "Loading…" : `${repoDetailPrs.length} open PR${repoDetailPrs.length !== 1 ? "s" : ""}`}
        {repo.alertCount > 0 ? <Text color={repo.criticalCount > 0 ? "red" : "yellow"}> · {repo.alertCount} alert{repo.alertCount !== 1 ? "s" : ""}</Text> : null}
      </Text>

      <Text bold dimColor>{"─".repeat(40)}</Text>
      <Text bold>Pull Requests</Text>

      {repoDetailPrsLoading ? (
        <Text dimColor>  Fetching pull requests…</Text>
      ) : repoDetailPrs.length === 0 ? (
        <Text dimColor>  No open pull requests</Text>
      ) : (
        visiblePrs.map((pr, i) => {
          const selected = prScrollOffset + i === selectedRowIndex;
          const { symbol, color } = formatCiStatus(pr);
          return (
            <Text key={pr.number} inverse={selected}>
              <Text dimColor>#{pad(String(pr.number), 5)}</Text>
              {" "}
              <Text color={color}>{symbol}</Text>
              {" "}
              {pr.title.slice(0, 60)}{pr.title.length > 60 ? "…" : ""}
            </Text>
          );
        })
      )}

      {repo.alerts.length > 0 && (
        <>
          <Text bold dimColor>{"─".repeat(40)}</Text>
          <Text bold>Security Alerts</Text>
          {visibleAlerts.map((alert) => (
            <Text key={`${alert.repository}-${alert.number}`}>
              <Text color={severityColor(alert.severity)}>{pad(alert.severity.toUpperCase(), 8)}</Text>
              {" "}
              <Text color="gray">{pad(alert.package, 18)}</Text>
              {" "}
              <Text dimColor>{(alert.summary ?? "-").slice(0, 40)}</Text>
            </Text>
          ))}
          {repo.alerts.length > alertRows && (
            <Text dimColor>  …and {repo.alerts.length - alertRows} more</Text>
          )}
        </>
      )}

      <Text dimColor>Esc back · Enter open PR · b open in browser</Text>
    </Box>
  );
}
