import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function Footer({ state }) {
    const sep = _jsx(Text, { dimColor: true, children: " \u2502 " });
    if (state.mode === "messages") {
        return (_jsxs(Box, { borderStyle: "single", borderColor: "blue", paddingX: 1, children: [_jsx(Text, { dimColor: true, children: "j/k move" }), sep, _jsx(Text, { dimColor: true, children: "Enter open in browser" }), sep, _jsx(Text, { dimColor: true, children: "m mark read  M mark all read" }), sep, _jsx(Text, { dimColor: true, children: "a all/unread" }), sep, _jsx(Text, { dimColor: true, children: "1/2/3 mode" }), sep, _jsx(Text, { dimColor: true, children: "r refresh  q quit" })] }));
    }
    if (state.mode === "security") {
        return (_jsxs(Box, { borderStyle: "single", borderColor: "red", paddingX: 1, children: [_jsx(Text, { dimColor: true, children: "j/k move" }), sep, _jsx(Text, { dimColor: true, children: "Enter open advisory" }), sep, _jsx(Text, { dimColor: true, children: "s sort severity/age" }), sep, _jsx(Text, { dimColor: true, children: "o org scope" }), sep, _jsx(Text, { dimColor: true, children: "1/2/3 mode" }), sep, _jsx(Text, { dimColor: true, children: "r refresh  q quit" })] }));
    }
    if (state.detailOpen) {
        return (_jsxs(Box, { borderStyle: "single", borderColor: "cyan", paddingX: 1, children: [_jsxs(Text, { dimColor: true, children: ["← →", " switch panel"] }), sep, _jsx(Text, { dimColor: true, children: "j/k prev/next PR" }), sep, _jsxs(Text, { dimColor: true, children: ["↑↓", " scroll detail"] }), sep, _jsxs(Text, { dimColor: true, children: ["d diff  ", "< >", " file"] }), sep, _jsx(Text, { dimColor: true, children: "o open in browser" }), sep, _jsx(Text, { dimColor: true, children: "Esc close  q quit" })] }));
    }
    return (_jsxs(Box, { borderStyle: "single", borderColor: "cyan", paddingX: 1, children: [_jsx(Text, { dimColor: true, children: "j/k move" }), sep, _jsx(Text, { dimColor: true, children: "Enter detail" }), sep, _jsx(Text, { dimColor: true, children: "m mark seen  M mark all" }), sep, _jsx(Text, { dimColor: true, children: "Tab sub-view" }), sep, _jsx(Text, { dimColor: true, children: "1/2/3 mode" }), sep, _jsx(Text, { dimColor: true, children: "/ author  o scope  r refresh  q quit" })] }));
}
