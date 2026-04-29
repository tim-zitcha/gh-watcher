import type { AppMode } from "./ui/types.js";
export interface SourceSettings {
    enabled: boolean;
    pollMinutes: number;
}
export interface UserSettings {
    notifications: {
        enabled: boolean;
    };
    sources: Record<AppMode, SourceSettings>;
}
export declare const DEFAULT_SETTINGS: UserSettings;
export declare function loadSettings(filePath: string): Promise<UserSettings>;
export declare function saveSettings(filePath: string, settings: UserSettings): Promise<void>;
