import React from "react";
import { Box, Text } from "ink";
import type { AlertSeverity } from "../../types.js";
import { clampScroll, formatTimestamp, pad, sortSecurityAlerts } from "../helpers.js";
import type { AppState } from "../types.js";
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

export function SecurityList({ state, hasOrgs }: { state: AppState; hasOrgs: boolean }) {
  const { columns: cols, rows } = useTerminalSize();
  const visibleRows = Math.max(1, rows - 9);

  const { attentionState, securitySortMode, selectedRowIndex } = state;

  if (!hasOrgs && !attentionState.repositoryScope?.startsWith("org:")) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" flexGrow={1} paddingX={1}>
        <Text>No organizations found. Press <Text bold>o</Text> to set an org scope manually.</Text>
      </Box>
    );
  }

  const alerts = sortSecurityAlerts(attentionState.securityAlerts, securitySortMode);
  const scrollOffset = clampScroll(selectedRowIndex, state.tableScrollOffset, visibleRows);
  const visible = alerts.slice(scrollOffset, scrollOffset + visibleRows);

  const availWidth = cols - 4;
  const fixedCols = { severity: 8, repo: 28, pkg: 20, ecosystem: 10, cve: 20, opened: 12 };
  const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 5;
  const summaryWidth = Math.max(20, availWidth - fixedTotal);

  const isLoading = state.isRefreshing && alerts.length === 0;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" flexGrow={1}>
      <Text bold>
        {pad("Severity", fixedCols.severity)} {pad("Repo", fixedCols.repo)} {pad("Package", fixedCols.pkg)} {pad("Ecosystem", fixedCols.ecosystem)} {pad("CVE", fixedCols.cve)} {pad("Opened", fixedCols.opened)} {pad("Summary", summaryWidth)}
      </Text>
      {isLoading
        ? <Text dimColor>Loading…</Text>
        : <Text dimColor>Showing {scrollOffset + 1}-{scrollOffset + visible.length} of {alerts.length} · sort: {securitySortMode}</Text>
      }
      {isLoading && <Text dimColor>  Fetching security alerts…</Text>}
      {!isLoading && alerts.length === 0 && <Text dimColor>  No open security alerts.</Text>}
      {visible.map((alert, i) => {
        const selected = scrollOffset + i === selectedRowIndex;
        return (
          <Text key={`${alert.repository}-${alert.number}`} inverse={selected}>
            <Text color={severityColor(alert.severity)}>{pad(alert.severity.toUpperCase(), fixedCols.severity)}</Text>
            {" "}{pad(alert.repository, fixedCols.repo)} {pad(alert.package, fixedCols.pkg)} {pad(alert.ecosystem ?? "-", fixedCols.ecosystem)} {pad(alert.cveId ?? "-", fixedCols.cve)} {pad(formatTimestamp(alert.createdAt), fixedCols.opened)} {pad(alert.summary ?? "-", summaryWidth)}
          </Text>
        );
      })}
    </Box>
  );
}
