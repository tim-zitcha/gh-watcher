import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function ModeStrip({ state }) {
    const { mode, attentionState } = state;
    const prCount = attentionState.myPullRequests.length + attentionState.needsMyReview.length;
    const secAlerts = attentionState.securityAlerts;
    const critCount = secAlerts.filter(a => a.severity === "critical").length;
    const highCount = secAlerts.filter(a => a.severity === "high").length;
    const unreadCount = attentionState.notificationUnreadCount;
    const prActive = mode === "pr";
    const secActive = mode === "security";
    const msgActive = mode === "messages";
    const borderColor = secActive ? "red" : msgActive ? "blue" : "cyan";
    return (_jsxs(Box, { borderStyle: "single", borderColor: borderColor, paddingX: 1, children: [_jsxs(Text, { bold: prActive, color: prActive ? "cyan" : "gray", children: [_jsx(Text, { dimColor: !prActive, children: "[" }), _jsx(Text, { color: prActive ? "cyan" : "gray", children: "1" }), _jsx(Text, { dimColor: !prActive, children: "]" }), " ", "Pull Requests"] }), _jsxs(Text, { color: prActive ? "cyan" : "gray", children: ["  ", "(", prCount, ")"] }), _jsx(Text, { children: "   " }), _jsxs(Text, { bold: secActive, color: secActive ? "red" : "gray", children: [_jsx(Text, { dimColor: !secActive, children: "[" }), _jsx(Text, { color: secActive ? "red" : "gray", children: "2" }), _jsx(Text, { dimColor: !secActive, children: "]" }), " ", "Security"] }), _jsx(Text, { children: "  " }), critCount > 0
                ? _jsxs(Text, { color: "red", children: ["(", critCount, " crit", highCount > 0 ? ` · ${highCount} high` : "", ")"] })
                : highCount > 0
                    ? _jsxs(Text, { color: "magenta", children: ["(", highCount, " high)"] })
                    : _jsx(Text, { dimColor: true, children: "(0)" }), _jsx(Text, { children: "   " }), _jsxs(Text, { bold: msgActive, color: msgActive ? "blue" : "gray", children: [_jsx(Text, { dimColor: !msgActive, children: "[" }), _jsx(Text, { color: msgActive ? "blue" : "gray", children: "3" }), _jsx(Text, { dimColor: !msgActive, children: "]" }), " ", "Messages"] }), _jsx(Text, { children: "  " }), unreadCount > 0
                ? _jsxs(Text, { color: "blue", children: ["(", unreadCount, " unread)"] })
                : _jsx(Text, { dimColor: true, children: "(0)" })] }));
}
