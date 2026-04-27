import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text, useStdout } from "ink";
import { clampScroll, formatAge, pad } from "../helpers.js";
function reasonLabel(reason) {
    switch (reason) {
        case "mention": return { label: "MENTION", color: "cyan" };
        case "review_requested": return { label: "REVIEW REQ", color: "cyan" };
        case "assign": return { label: "ASSIGNED", color: "green" };
        case "author": return { label: "AUTHOR", color: "blue" };
        case "ci_activity": return { label: "CI", color: "yellow" };
        case "state_change": return { label: "MERGED", color: "green" };
        case "security_alert": return { label: "SECURITY", color: "red" };
        case "comment": return { label: "COMMENT", color: "gray" };
        default: return { label: String(reason).toUpperCase().slice(0, 10), color: "gray" };
    }
}
export function MessagesList({ state }) {
    const { stdout } = useStdout();
    const rows = stdout?.rows ?? 24;
    const cols = stdout?.columns ?? 200;
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
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "blue", flexGrow: 1, children: [_jsxs(Text, { dimColor: true, children: [pad("·", 2), " ", pad("Type", typeCol), " ", pad("Subject", titleWidth), " ", pad("Repository", repoCol), " ", pad("When", ageCol)] }), _jsx(Text, { dimColor: true, children: showingLabel }), visible.map((n, i) => {
                const selected = scrollOffset + i === selectedRowIndex;
                const { label, color } = reasonLabel(n.reason);
                const age = formatAge(n.updatedAt);
                return (_jsxs(Text, { inverse: selected, dimColor: !n.unread && !selected, children: [_jsx(Text, { color: n.unread ? "blue" : "gray", children: n.unread ? "●" : "·" }), " ", _jsx(Text, { color: color, children: pad(label, typeCol) }), " ", pad(n.subject.title, titleWidth), " ", pad(n.repository, repoCol), " ", pad(age, ageCol)] }, n.id));
            })] }));
}
