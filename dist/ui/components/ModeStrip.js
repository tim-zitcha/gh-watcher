import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { Box, Text } from "ink";
const MODE_LABELS = {
    pr: "Pull Requests",
    security: "Security",
    messages: "Messages",
    repos: "Repos",
};
const ALL_MODES = ["pr", "security", "messages", "repos"];
export function ModeStrip({ state }) {
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
    function badge(m) {
        if (m === "pr")
            return prCount > 0 ? _jsxs(Text, { color: "cyan", children: ["(", prCount, ")"] }) : _jsx(Text, { dimColor: true, children: "(0)" });
        if (m === "security") {
            return critCount > 0
                ? _jsxs(Text, { color: "red", children: ["(", critCount, " crit", highCount > 0 ? ` · ${highCount} high` : "", ")"] })
                : highCount > 0
                    ? _jsxs(Text, { color: "magenta", children: ["(", highCount, " high)"] })
                    : _jsx(Text, { dimColor: true, children: "(0)" });
        }
        if (m === "messages")
            return unreadCount > 0 ? _jsxs(Text, { color: "blue", children: ["(", unreadCount, " unread)"] }) : _jsx(Text, { dimColor: true, children: "(0)" });
        return null;
    }
    const modeColor = { pr: "cyan", security: "red", messages: "blue", repos: "green" };
    return (_jsx(Box, { borderStyle: "single", borderColor: borderColor, paddingX: 1, children: enabledModes.map((m, i) => {
            const active = mode === m;
            const color = active ? modeColor[m] : "gray";
            return (_jsxs(React.Fragment, { children: [i > 0 && _jsx(Text, { children: "   " }), _jsxs(Text, { bold: active, color: color, children: [_jsx(Text, { dimColor: !active, children: "[" }), _jsx(Text, { color: color, children: i + 1 }), _jsx(Text, { dimColor: !active, children: "]" }), " ", MODE_LABELS[m]] }), _jsx(Text, { children: "  " }), badge(m)] }, m));
        }) }));
}
