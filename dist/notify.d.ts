import type { NotificationEvent } from "./types.js";
export type NotifyBackend = "osascript" | "terminal-osc" | "node-notifier";
export interface NotifyResult {
    backend: NotifyBackend;
    ok: boolean;
    error?: string;
}
export declare function sendNotifications(events: NotificationEvent[]): Promise<void>;
export declare function testNotifications(): Promise<NotifyResult[]>;
