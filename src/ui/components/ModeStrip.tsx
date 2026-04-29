import React from "react";
import { Box, Text } from "ink";
import type { AppState } from "../types.js";

export function ModeStrip({ state }: { state: AppState }) {
  const { mode, attentionState } = state;
  const prCount = attentionState.myPullRequests.length + attentionState.needsMyReview.length;
  const secAlerts = attentionState.securityAlerts;
  const critCount = secAlerts.filter(a => a.severity === "critical").length;
  const highCount = secAlerts.filter(a => a.severity === "high").length;
  const unreadCount = attentionState.notificationUnreadCount;

  const prActive = mode === "pr";
  const secActive = mode === "security";
  const msgActive = mode === "messages";
  const repoActive = mode === "repos";
  const borderColor = secActive ? "red" : msgActive ? "blue" : repoActive ? "green" : "cyan";

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
      <Text bold={prActive} color={prActive ? "cyan" : "gray"}>
        <Text dimColor={!prActive}>[</Text>
        <Text color={prActive ? "cyan" : "gray"}>1</Text>
        <Text dimColor={!prActive}>]</Text>
        {" "}Pull Requests
      </Text>
      <Text color={prActive ? "cyan" : "gray"}>{"  "}({prCount})</Text>

      <Text>{"   "}</Text>

      <Text bold={secActive} color={secActive ? "red" : "gray"}>
        <Text dimColor={!secActive}>[</Text>
        <Text color={secActive ? "red" : "gray"}>2</Text>
        <Text dimColor={!secActive}>]</Text>
        {" "}Security
      </Text>
      <Text>{"  "}</Text>
      {critCount > 0
        ? <Text color="red">({critCount} crit{highCount > 0 ? ` · ${highCount} high` : ""})</Text>
        : highCount > 0
        ? <Text color="magenta">({highCount} high)</Text>
        : <Text dimColor>(0)</Text>
      }

      <Text>{"   "}</Text>

      <Text bold={msgActive} color={msgActive ? "blue" : "gray"}>
        <Text dimColor={!msgActive}>[</Text>
        <Text color={msgActive ? "blue" : "gray"}>3</Text>
        <Text dimColor={!msgActive}>]</Text>
        {" "}Messages
      </Text>
      <Text>{"  "}</Text>
      {unreadCount > 0
        ? <Text color="blue">({unreadCount} unread)</Text>
        : <Text dimColor>(0)</Text>
      }

      <Text>{"   "}</Text>

      <Text bold={repoActive} color={repoActive ? "green" : "gray"}>
        <Text dimColor={!repoActive}>[</Text>
        <Text color={repoActive ? "green" : "gray"}>4</Text>
        <Text dimColor={!repoActive}>]</Text>
        {" "}Repos
      </Text>
    </Box>
  );
}
