import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { clampScroll, formatCiStatus, pad } from "../helpers.js";
import { useTerminalSize } from "../useTerminalSize.js";
function severityColor(s) {
    switch (s) {
        case "critical": return "red";
        case "high": return "magenta";
        case "medium": return "yellow";
        case "low": return "cyan";
        default: return "gray";
    }
}
export function RepoDetail({ state, repo }) {
    const { rows } = useTerminalSize();
    const visibleRows = Math.max(1, rows - 9);
    const { selectedRowIndex, tableScrollOffset, repoDetailPrs, repoDetailPrsLoading } = state;
    const prScrollOffset = clampScroll(selectedRowIndex, tableScrollOffset, visibleRows);
    const visiblePrs = repoDetailPrs.slice(prScrollOffset, prScrollOffset + Math.floor(visibleRows * 0.6));
    const alertRows = Math.floor(visibleRows * 0.35);
    const visibleAlerts = repo.alerts.slice(0, alertRows);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "green", flexGrow: 1, children: [_jsx(Text, { bold: true, color: "green", children: repo.nameWithOwner }), _jsxs(Text, { dimColor: true, children: [repoDetailPrsLoading ? "Loading…" : `${repoDetailPrs.length} open PR${repoDetailPrs.length !== 1 ? "s" : ""}`, repo.alertCount > 0 ? _jsxs(Text, { color: repo.criticalCount > 0 ? "red" : "yellow", children: [" \u00B7 ", repo.alertCount, " alert", repo.alertCount !== 1 ? "s" : ""] }) : null] }), _jsx(Text, { bold: true, dimColor: true, children: "─".repeat(40) }), _jsx(Text, { bold: true, children: "Pull Requests" }), repoDetailPrsLoading ? (_jsx(Text, { dimColor: true, children: "  Fetching pull requests\u2026" })) : repoDetailPrs.length === 0 ? (_jsx(Text, { dimColor: true, children: "  No open pull requests" })) : (visiblePrs.map((pr, i) => {
                const selected = prScrollOffset + i === selectedRowIndex;
                const { symbol, color } = formatCiStatus(pr);
                return (_jsxs(Text, { inverse: selected, children: [_jsxs(Text, { dimColor: true, children: ["#", pad(String(pr.number), 5)] }), " ", _jsx(Text, { color: color, children: symbol }), " ", pr.title.slice(0, 60), pr.title.length > 60 ? "…" : ""] }, pr.number));
            })), repo.alerts.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { bold: true, dimColor: true, children: "─".repeat(40) }), _jsx(Text, { bold: true, children: "Security Alerts" }), visibleAlerts.map((alert) => (_jsxs(Text, { children: [_jsx(Text, { color: severityColor(alert.severity), children: pad(alert.severity.toUpperCase(), 8) }), " ", _jsx(Text, { color: "gray", children: pad(alert.package, 18) }), " ", _jsx(Text, { dimColor: true, children: (alert.summary ?? "-").slice(0, 40) })] }, `${alert.repository}-${alert.number}`))), repo.alerts.length > alertRows && (_jsxs(Text, { dimColor: true, children: ["  \u2026and ", repo.alerts.length - alertRows, " more"] }))] })), _jsx(Text, { dimColor: true, children: "Esc back \u00B7 Enter open PR \u00B7 b open in browser" })] }));
}
