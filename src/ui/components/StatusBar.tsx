import React from "react";
import { Box, Text } from "ink";
import { formatTimestamp } from "../helpers.js";
import type { AppState } from "../types.js";

export function StatusBar({ state }: { state: AppState }) {
  const { attentionState, isRefreshing } = state;
  const scope = attentionState.repositoryScope ?? "all accessible repos";
  const refreshed = formatTimestamp(attentionState.refreshedAt);
  const alerts = attentionState.securityAlerts;
  const critCount = alerts.filter(a => a.severity === "critical").length;
  const hasCrit = critCount > 0;
  const hasHigh = alerts.some(a => a.severity === "high");

  return (
    <Box paddingX={1} gap={2}>
      <Text bold color="yellow">gh-watcher</Text>
      <Text dimColor>▸</Text>
      <Text dimColor>{attentionState.viewerLogin}</Text>
      <Text dimColor>·</Text>
      <Text dimColor>scope: {scope}</Text>
      <Text dimColor>·</Text>
      <Text dimColor>↻ {refreshed}</Text>
      <Box flexGrow={1} />
      {hasCrit && <Text backgroundColor="red" color="white"> ⚠ {critCount} CRIT </Text>}
      {!hasCrit && hasHigh && <Text backgroundColor="magenta" color="white"> ⚠ HIGH </Text>}
      <Text dimColor>{isRefreshing ? "● Refreshing" : "■ Idle"}</Text>
    </Box>
  );
}
