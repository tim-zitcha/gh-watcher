import type { AppState, WatchedAuthorOption } from "../types.js";
export declare function AuthorPicker({ options, onSelect, onCancel }: {
    options: WatchedAuthorOption[];
    onSelect: (opt: WatchedAuthorOption) => void;
    onCancel: () => void;
}): import("react/jsx-runtime").JSX.Element;
export declare function ScopePicker({ options, onSelect, onCancel }: {
    options: Array<{
        label: string;
        value: string | null;
    }>;
    onSelect: (value: string | null) => void;
    onCancel: () => void;
}): import("react/jsx-runtime").JSX.Element;
export declare function CustomUserInput({ initial, onSubmit, onCancel }: {
    initial: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}): import("react/jsx-runtime").JSX.Element;
export declare function Overlays({ state, authorOptions, scopeOptions, onAuthorSelect, onScopeSelect, onCustomUser, onCancel }: {
    state: AppState;
    authorOptions: WatchedAuthorOption[];
    scopeOptions: Array<{
        label: string;
        value: string | null;
    }>;
    onAuthorSelect: (opt: WatchedAuthorOption) => void;
    onScopeSelect: (value: string | null) => void;
    onCustomUser: (value: string) => void;
    onCancel: () => void;
}): import("react/jsx-runtime").JSX.Element;
