import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { clampScroll, pad } from "../helpers.js";
import { useTerminalSize } from "../useTerminalSize.js";
export function RepoList({ state, repos }) {
    const { columns: cols, rows } = useTerminalSize();
    const visibleRows = Math.max(1, rows - 9);
    const { repoListIndex } = state;
    const scrollOffset = clampScroll(repoListIndex, 0, visibleRows);
    const visible = repos.slice(scrollOffset, scrollOffset + visibleRows);
    const availWidth = cols - 4;
    const fixedCols = { prs: 9, review: 13, alerts: 10 };
    const fixedTotal = fixedCols.prs + fixedCols.review + fixedCols.alerts + 3;
    const nameWidth = Math.max(20, availWidth - fixedTotal);
    if (repos.length === 0) {
        return (_jsx(Box, { flexDirection: "column", borderStyle: "single", borderColor: "green", flexGrow: 1, paddingX: 1, children: _jsx(Text, { dimColor: true, children: state.isRefreshing || state.accessibleRepos.length === 0 ? "Loading repositories…" : "No repositories found." }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "green", flexGrow: 1, children: [_jsxs(Text, { bold: true, children: [pad("Repository", nameWidth), " ", pad("Open PRs", fixedCols.prs), " ", pad("My Review", fixedCols.review), " ", pad("Alerts", fixedCols.alerts)] }), _jsxs(Text, { dimColor: true, children: ["Showing ", scrollOffset + 1, "-", scrollOffset + visible.length, " of ", repos.length, " \u00B7 sort: ", state.repoSortMode, " \u00B7 s to cycle"] }), visible.map((repo, i) => {
                const selected = scrollOffset + i === repoListIndex;
                const alertLabel = repo.criticalCount > 0
                    ? `${repo.criticalCount} crit`
                    : repo.alertCount > 0
                        ? String(repo.alertCount)
                        : "-";
                const alertColor = repo.criticalCount > 0 ? "red" : repo.alertCount > 0 ? "yellow" : "gray";
                const reviewColor = repo.needsReviewCount > 0 ? "yellow" : "gray";
                const prColor = repo.openPrCount > 0 ? "cyan" : "gray";
                return (_jsxs(Text, { inverse: selected, children: [pad(repo.nameWithOwner, nameWidth), " ", _jsx(Text, { color: prColor, children: pad(String(repo.openPrCount), fixedCols.prs) }), " ", _jsx(Text, { color: reviewColor, children: pad(String(repo.needsReviewCount), fixedCols.review) }), " ", _jsx(Text, { color: alertColor, children: pad(alertLabel, fixedCols.alerts) })] }, repo.nameWithOwner));
            })] }));
}
