import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
export function AuthorPicker({ options, onSelect, onCancel }) {
    useInput((_, key) => { if (key.escape)
        onCancel(); });
    const items = options.map(o => ({ label: o.label, value: o }));
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", paddingX: 1, children: [_jsx(Text, { bold: true, children: " Select Author " }), _jsx(SelectInput, { items: items, onSelect: (item) => onSelect(item.value) })] }));
}
export function ScopePicker({ options, onSelect, onCancel }) {
    useInput((_, key) => { if (key.escape)
        onCancel(); });
    const items = options.map(o => ({ label: o.label, value: o.value }));
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", paddingX: 1, children: [_jsx(Text, { bold: true, children: " Select Scope " }), _jsx(SelectInput, { items: items, onSelect: (item) => onSelect(item.value) })] }));
}
export function CustomUserInput({ initial, onSubmit, onCancel }) {
    const [value, setValue] = React.useState(initial);
    useInput((_, key) => { if (key.escape)
        onCancel(); });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", paddingX: 1, width: 50, children: [_jsx(Text, { bold: true, children: " Custom Author " }), _jsx(TextInput, { focus: true, value: value, onChange: setValue, onSubmit: (v) => onSubmit(v.trim() || initial) })] }));
}
export function Overlays({ state, authorOptions, scopeOptions, onAuthorSelect, onScopeSelect, onCustomUser, onCancel }) {
    return (_jsxs(_Fragment, { children: [state.activeOverlay === "author" && (_jsx(AuthorPicker, { options: authorOptions, onSelect: onAuthorSelect, onCancel: onCancel })), state.activeOverlay === "scope" && (_jsx(ScopePicker, { options: scopeOptions, onSelect: onScopeSelect, onCancel: onCancel })), state.activeOverlay === "custom" && (_jsx(CustomUserInput, { initial: state.attentionState.watchedAuthor ?? state.attentionState.viewerLogin, onSubmit: onCustomUser, onCancel: onCancel }))] }));
}
