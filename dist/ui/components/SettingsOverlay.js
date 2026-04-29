import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
const MODE_LABELS = {
    pr: "Pull Requests",
    security: "Security",
    messages: "Messages",
    repos: "Repos",
};
const MODES = ["pr", "security", "messages", "repos"];
const MIN_POLL = 1;
const MAX_POLL = 1440;
// Row indices: 0 = notifications toggle, 1-4 = source rows (pr, security, messages, repos)
const TOTAL_ROWS = 1 + MODES.length;
export function SettingsOverlay({ settings, onChange, onClose }) {
    const [selectedRow, setSelectedRow] = useState(0);
    const [errorMsg, setErrorMsg] = useState(null);
    useInput((input, key) => {
        if (key.escape || input === ",") {
            onClose();
            return;
        }
        if (key.upArrow || input === "k") {
            setSelectedRow(r => Math.max(0, r - 1));
            setErrorMsg(null);
            return;
        }
        if (key.downArrow || input === "j") {
            setSelectedRow(r => Math.min(TOTAL_ROWS - 1, r + 1));
            setErrorMsg(null);
            return;
        }
        if (input === " ") {
            if (selectedRow === 0) {
                onChange({ ...settings, notifications: { enabled: !settings.notifications.enabled } });
            }
            else {
                const mode = MODES[selectedRow - 1];
                const current = settings.sources[mode];
                const enabledCount = MODES.filter(m => settings.sources[m].enabled).length;
                if (current.enabled && enabledCount <= 1) {
                    setErrorMsg("At least one source must be enabled.");
                    return;
                }
                onChange({
                    ...settings,
                    sources: { ...settings.sources, [mode]: { ...current, enabled: !current.enabled } }
                });
            }
            setErrorMsg(null);
            return;
        }
        if ((input === "+" || input === "=") && selectedRow > 0) {
            const mode = MODES[selectedRow - 1];
            const current = settings.sources[mode];
            const next = Math.min(MAX_POLL, current.pollMinutes + 1);
            onChange({ ...settings, sources: { ...settings.sources, [mode]: { ...current, pollMinutes: next } } });
            return;
        }
        if (input === "-" && selectedRow > 0) {
            const mode = MODES[selectedRow - 1];
            const current = settings.sources[mode];
            const next = Math.max(MIN_POLL, current.pollMinutes - 1);
            onChange({ ...settings, sources: { ...settings.sources, [mode]: { ...current, pollMinutes: next } } });
            return;
        }
    });
    const notifRow = selectedRow === 0;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", paddingX: 2, paddingY: 1, width: 52, children: [_jsx(Text, { bold: true, children: " Settings " }), _jsx(Text, { children: " " }), _jsx(Text, { bold: true, dimColor: true, children: "NOTIFICATIONS" }), _jsx(Box, { children: _jsxs(Text, { color: notifRow ? "cyan" : undefined, children: [notifRow ? "▶ " : "  ", "Enabled".padEnd(20), settings.notifications.enabled ? "[✓]" : "[ ]"] }) }), _jsx(Text, { children: " " }), _jsx(Text, { bold: true, dimColor: true, children: "SOURCES" }), MODES.map((mode, i) => {
                const src = settings.sources[mode];
                const active = selectedRow === i + 1;
                return (_jsx(Box, { children: _jsxs(Text, { color: active ? "cyan" : undefined, children: [active ? "▶ " : "  ", MODE_LABELS[mode].padEnd(18), src.enabled ? "[✓]" : "[ ]", "  poll: ", String(src.pollMinutes).padStart(4), " min"] }) }, mode));
            }), _jsx(Text, { children: " " }), errorMsg
                ? _jsx(Text, { color: "red", children: errorMsg })
                : _jsx(Text, { dimColor: true, children: "\u2191\u2193 navigate  space toggle  +/- poll  , close" })] }));
}
