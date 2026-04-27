import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { formatTimestamp } from "../helpers.js";
export function StatusBar({ state }) {
    const { attentionState, isRefreshing } = state;
    const scope = attentionState.repositoryScope ?? "all accessible repos";
    const refreshed = formatTimestamp(attentionState.refreshedAt);
    const alerts = attentionState.securityAlerts;
    const critCount = alerts.filter(a => a.severity === "critical").length;
    const hasCrit = critCount > 0;
    const hasHigh = alerts.some(a => a.severity === "high");
    return (_jsxs(Box, { paddingX: 1, gap: 2, children: [_jsx(Text, { bold: true, color: "yellow", children: "gh-watcher" }), _jsx(Text, { dimColor: true, children: "\u25B8" }), _jsx(Text, { dimColor: true, children: attentionState.viewerLogin }), _jsx(Text, { dimColor: true, children: "\u00B7" }), _jsxs(Text, { dimColor: true, children: ["scope: ", scope] }), _jsx(Text, { dimColor: true, children: "\u00B7" }), _jsxs(Text, { dimColor: true, children: ["\u21BB ", refreshed] }), _jsx(Box, { flexGrow: 1 }), hasCrit && _jsxs(Text, { backgroundColor: "red", color: "white", children: [" \u26A0 ", critCount, " CRIT "] }), !hasCrit && hasHigh && _jsx(Text, { backgroundColor: "magenta", color: "white", children: " \u26A0 HIGH " }), _jsx(Text, { dimColor: true, children: isRefreshing ? "● Refreshing" : "■ Idle" })] }));
}
