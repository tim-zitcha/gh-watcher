import { readFile, writeFile } from "node:fs/promises";
export const DEFAULT_SETTINGS = {
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
function sanitizeSource(raw, def) {
    if (!raw || typeof raw !== "object")
        return def;
    const r = raw;
    const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
    const pm = Number(r.pollMinutes);
    const pollMinutes = Number.isFinite(pm) && pm >= MIN_POLL && pm <= MAX_POLL ? pm : def.pollMinutes;
    return { enabled, pollMinutes };
}
function mergeWithDefaults(raw) {
    if (!raw || typeof raw !== "object")
        return DEFAULT_SETTINGS;
    const r = raw;
    const rawNotif = r.notifications;
    const notifEnabled = typeof rawNotif?.enabled === "boolean"
        ? rawNotif.enabled
        : DEFAULT_SETTINGS.notifications.enabled;
    const rawSources = (r.sources ?? {});
    const modes = ["pr", "security", "messages", "repos"];
    const sources = Object.fromEntries(modes.map((m) => [m, sanitizeSource(rawSources[m], DEFAULT_SETTINGS.sources[m])]));
    return { notifications: { enabled: notifEnabled }, sources };
}
export async function loadSettings(filePath) {
    try {
        const raw = await readFile(filePath, "utf8");
        return mergeWithDefaults(JSON.parse(raw));
    }
    catch {
        return DEFAULT_SETTINGS;
    }
}
export async function saveSettings(filePath, settings) {
    try {
        await writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
    }
    catch (err) {
        process.stderr.write(`gh-watch: failed to save settings: ${err instanceof Error ? err.message : String(err)}\n`);
    }
}
