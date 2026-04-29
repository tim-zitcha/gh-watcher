import React from "react";
import { Box, Text } from "ink";
import type { AppMode, AppState } from "../types.js";

const MODE_LABELS: Record<AppMode, string> = {
  pr: "Pull Requests",
  security: "Security",
  messages: "Messages",
  repos: "Repos",
};

const ALL_MODES: AppMode[] = ["pr", "security", "messages", "repos"];

export function ModeStrip({ state }: { state: AppState }) {
  const { mode, attentionState, userSettings } = state;
  const enabledModes = ALL_MODES.filter(m => userSettings.sources[m].enabled);

  const prCount = attentionState.myPullRequests.length + attentionState.needsMyReview.length;
  const secAlerts = attentionState.securityAlerts;
  const critCount = secAlerts.filter(a => a.severity === "critical").length;
  const highCount = secAlerts.filter(a => a.severity === "high").length;
  const unreadCount = attentionState.notificationUnreadCount;

  const borderColor = mode === "security" ? "red"
    : mode === "messages" ? "blue"
    : mode === "repos" ? "green"
    : "cyan";

  function badge(m: AppMode): React.ReactNode {
    if (m === "pr") return prCount > 0 ? <Text color="cyan">({prCount})</Text> : <Text dimColor>(0)</Text>;
    if (m === "security") {
      return critCount > 0
        ? <Text color="red">({critCount} crit{highCount > 0 ? ` · ${highCount} high` : ""})</Text>
        : highCount > 0
        ? <Text color="magenta">({highCount} high)</Text>
        : <Text dimColor>(0)</Text>;
    }
    if (m === "messages") return unreadCount > 0 ? <Text color="blue">({unreadCount} unread)</Text> : <Text dimColor>(0)</Text>;
    return null;
  }

  const modeColor: Record<AppMode, string> = { pr: "cyan", security: "red", messages: "blue", repos: "green" };

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
      {enabledModes.map((m, i) => {
        const active = mode === m;
        const color = active ? modeColor[m] : "gray";
        return (
          <React.Fragment key={m}>
            {i > 0 && <Text>{"   "}</Text>}
            <Text bold={active} color={color}>
              <Text dimColor={!active}>[</Text>
              <Text color={color}>{i + 1}</Text>
              <Text dimColor={!active}>]</Text>
              {" "}{MODE_LABELS[m]}
            </Text>
            <Text>{"  "}</Text>
            {badge(m)}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
