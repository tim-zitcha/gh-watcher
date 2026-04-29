import { readFile, writeFile } from "node:fs/promises";
import type { AppMode } from "./ui/types.js";

export interface SourceSettings {
  enabled: boolean;
  pollMinutes: number;
}

export interface UserSettings {
  notifications: { enabled: boolean };
  sources: Record<AppMode, SourceSettings>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: { enabled: true },
  sources: {
    pr: { enabled: true, pollMinutes: 2 },
    security: { enabled: true, pollMinutes: 30 },
    messages: { enabled: true, pollMinutes: 5 },
    repos: { enabled: true, pollMinutes: 10 },
  },
};

const MIN_POLL = 1;
const MAX_POLL = 1440;

function sanitizeSource(raw: unknown, def: SourceSettings): SourceSettings {
  if (!raw || typeof raw !== "object") return def;
  const r = raw as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const pm = Number(r.pollMinutes);
  const pollMinutes = Number.isFinite(pm) && pm >= MIN_POLL && pm <= MAX_POLL ? pm : def.pollMinutes;
  return { enabled, pollMinutes };
}

function mergeWithDefaults(raw: unknown): UserSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;

  const rawNotif = r.notifications as Record<string, unknown> | undefined;
  const notifEnabled = typeof rawNotif?.enabled === "boolean"
    ? rawNotif.enabled
    : DEFAULT_SETTINGS.notifications.enabled;

  const rawSources = (r.sources ?? {}) as Record<string, unknown>;
  const modes: AppMode[] = ["pr", "security", "messages", "repos"];
  const sources = Object.fromEntries(
    modes.map((m) => [m, sanitizeSource(rawSources[m], DEFAULT_SETTINGS.sources[m])])
  ) as Record<AppMode, SourceSettings>;

  return { notifications: { enabled: notifEnabled }, sources };
}

export async function loadSettings(filePath: string): Promise<UserSettings> {
  try {
    const raw = await readFile(filePath, "utf8");
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(filePath: string, settings: UserSettings): Promise<void> {
  try {
    await writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    process.stderr.write(`gh-watch: failed to save settings: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
