import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { clampScroll, formatTimestamp, pad, sortSecurityAlerts } from "../helpers.js";
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
export function SecurityList({ state, hasOrgs }) {
    const { columns: cols, rows } = useTerminalSize();
    const visibleRows = Math.max(1, rows - 9);
    const { attentionState, securitySortMode, selectedRowIndex } = state;
    if (!hasOrgs && !attentionState.repositoryScope?.startsWith("org:")) {
        return (_jsx(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", flexGrow: 1, paddingX: 1, children: _jsxs(Text, { children: ["No organizations found. Press ", _jsx(Text, { bold: true, children: "o" }), " to set an org scope manually."] }) }));
    }
    const alerts = sortSecurityAlerts(attentionState.securityAlerts, securitySortMode);
    const scrollOffset = clampScroll(selectedRowIndex, state.tableScrollOffset, visibleRows);
    const visible = alerts.slice(scrollOffset, scrollOffset + visibleRows);
    const availWidth = cols - 4;
    const fixedCols = { severity: 8, repo: 28, pkg: 20, ecosystem: 10, cve: 20, opened: 12 };
    const fixedTotal = Object.values(fixedCols).reduce((a, b) => a + b, 0) + 5;
    const summaryWidth = Math.max(20, availWidth - fixedTotal);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", flexGrow: 1, children: [_jsxs(Text, { bold: true, children: [pad("Severity", fixedCols.severity), " ", pad("Repo", fixedCols.repo), " ", pad("Package", fixedCols.pkg), " ", pad("Ecosystem", fixedCols.ecosystem), " ", pad("CVE", fixedCols.cve), " ", pad("Opened", fixedCols.opened), " ", pad("Summary", summaryWidth)] }), _jsxs(Text, { dimColor: true, children: ["Showing ", scrollOffset + 1, "-", scrollOffset + visible.length, " of ", alerts.length, " \u00B7 sort: ", securitySortMode] }), visible.map((alert, i) => {
                const selected = scrollOffset + i === selectedRowIndex;
                return (_jsxs(Text, { inverse: selected, children: [_jsx(Text, { color: severityColor(alert.severity), children: pad(alert.severity.toUpperCase(), fixedCols.severity) }), " ", pad(alert.repository, fixedCols.repo), " ", pad(alert.package, fixedCols.pkg), " ", pad(alert.ecosystem ?? "-", fixedCols.ecosystem), " ", pad(alert.cveId ?? "-", fixedCols.cve), " ", pad(formatTimestamp(alert.createdAt), fixedCols.opened), " ", pad(alert.summary ?? "-", summaryWidth)] }, `${alert.ghsaId}-${alert.repository}`));
            })] }));
}
