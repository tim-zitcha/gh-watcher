import type { UserSettings } from "../../settings.js";
interface Props {
    settings: UserSettings;
    onChange: (settings: UserSettings) => void;
    onClose: () => void;
}
export declare function SettingsOverlay({ settings, onChange, onClose }: Props): import("react/jsx-runtime").JSX.Element;
export {};
