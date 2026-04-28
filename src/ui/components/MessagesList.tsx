import React from "react";
import { Box, Text } from "ink";
import { clampScroll, formatAge, pad } from "../helpers.js";
import type { AppState } from "../types.js";
import type { NotificationReason } from "../../types.js";
import { useTerminalSize } from "../useTerminalSize.js";

function reasonLabel(reason: NotificationReason): { label: string; color: string } {
  switch (reason) {
    case "mention":          return { label: "MENTION",    color: "cyan" };
    case "review_requested": return { label: "REVIEW REQ", color: "cyan" };
    case "assign":           return { label: "ASSIGNED",   color: "green" };
    case "author":           return { label: "AUTHOR",     color: "blue" };
    case "ci_activity":      return { label: "CI",         color: "yellow" };
    case "state_change":     return { label: "MERGED",     color: "green" };
    case "security_alert":   return { label: "SECURITY",   color: "red" };
    case "comment":          return { label: "COMMENT",    color: "gray" };
    default:                 return { label: String(reason).toUpperCase().slice(0, 10), color: "gray" };
  }
}

export function MessagesList({ state }: { state: AppState }) {
  const { columns: cols, rows } = useTerminalSize();
  const visibleRows = Math.max(1, rows - 9);

  const { attentionState, messagesShowAll, selectedRowIndex, isRefreshing } = state;
  const all = attentionState.notifications;
  const items = messagesShowAll ? all : all.filter(n => n.unread);

  const scrollOffset = clampScroll(selectedRowIndex, state.tableScrollOffset, visibleRows);
  const visible = items.slice(scrollOffset, scrollOffset + visibleRows);

  const typeCol = 12;
  const repoCol = 26;
  const ageCol = 7;
  const titleWidth = Math.max(20, cols - 4 - typeCol - repoCol - ageCol - 2 - 5);

  const showingLabel = items.length === 0
    ? (isRefreshing ? "Loading…" : messagesShowAll ? "No notifications" : "No unread notifications — press a to show all")
    : `${scrollOffset + 1}–${scrollOffset + visible.length} of ${items.length}${messagesShowAll ? " total" : " unread"}`;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" flexGrow={1}>
      <Text dimColor>
        {pad("·", 2)} {pad("Type", typeCol)} {pad("Subject", titleWidth)} {pad("Repository", repoCol)} {pad("When", ageCol)}
      </Text>
      <Text dimColor>{showingLabel}</Text>
      {visible.map((n, i) => {
        const selected = scrollOffset + i === selectedRowIndex;
        const { label, color } = reasonLabel(n.reason);
        const age = formatAge(n.updatedAt);
        return (
          <Text key={n.id} inverse={selected} dimColor={!n.unread && !selected}>
            <Text color={n.unread ? "blue" : "gray"}>{n.unread ? "●" : "·"}</Text>
            {" "}
            <Text color={color}>{pad(label, typeCol)}</Text>
            {" "}
            {pad(n.subject.title, titleWidth)}
            {" "}
            {pad(n.repository, repoCol)}
            {" "}
            {pad(age, ageCol)}
          </Text>
        );
      })}
    </Box>
  );
}
