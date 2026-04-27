import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box } from "ink";
import { StatusBar } from "./StatusBar.js";
import { ModeStrip } from "./ModeStrip.js";
import { SubNav } from "./SubNav.js";
export function Header({ state }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(StatusBar, { state: state }), _jsx(ModeStrip, { state: state }), _jsx(SubNav, { state: state })] }));
}
