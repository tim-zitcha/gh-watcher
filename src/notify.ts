import { execFile } from "node:child_process";
import { promisify } from "node:util";

import notifier from "node-notifier";

import type { NotificationEvent } from "./types.js";

const execFileAsync = promisify(execFile);

export type NotifyBackend = "osascript" | "terminal-osc" | "node-notifier";

export interface NotifyResult {
  backend: NotifyBackend;
  ok: boolean;
  error?: string;
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function notifyViaOsascript(title: string, message: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("osascript is macOS-only");
  }
  const script = `display notification "${escapeForAppleScript(message)}" with title "${escapeForAppleScript(title)}"`;
  await execFileAsync("osascript", ["-e", script]);
}

function notifyViaTerminalOsc(title: string, message: string): void {
  if (!process.stdout.isTTY) {
    throw new Error("not a TTY; OSC notification skipped");
  }
  // OSC 9 (iTerm2-style) — Ghostty, iTerm2, WezTerm, kitty support a variant of this.
  process.stdout.write(`\x1b]9;${title}: ${message}\x07`);
}

function notifyViaNodeNotifier(title: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    notifier.notify({ title, message, sound: false, wait: false }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function trySend(
  backend: NotifyBackend,
  title: string,
  message: string
): Promise<NotifyResult> {
  try {
    if (backend === "osascript") await notifyViaOsascript(title, message);
    else if (backend === "terminal-osc") notifyViaTerminalOsc(title, message);
    else await notifyViaNodeNotifier(title, message);
    return { backend, ok: true };
  } catch (err) {
    return { backend, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendNotifications(events: NotificationEvent[]): Promise<void> {
  const order: NotifyBackend[] =
    process.platform === "darwin"
      ? ["osascript", "terminal-osc", "node-notifier"]
      : ["node-notifier", "terminal-osc"];

  for (const event of events) {
    for (const backend of order) {
      const result = await trySend(backend, event.title, event.message);
      if (result.ok) break;
    }
  }
}

export async function testNotifications(): Promise<NotifyResult[]> {
  const title = "gh-watcher test";
  const message = `Notification test at ${new Date().toLocaleTimeString()}`;
  const backends: NotifyBackend[] =
    process.platform === "darwin"
      ? ["osascript", "terminal-osc", "node-notifier"]
      : ["node-notifier", "terminal-osc"];

  const results: NotifyResult[] = [];
  for (const backend of backends) {
    results.push(await trySend(backend, title, message));
  }
  return results;
}
