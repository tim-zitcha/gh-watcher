import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
const DEFAULT_REFRESH_MINUTES = 5;
function resolveStateDirectory() {
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", "pr-watch");
    }
    const xdgStateHome = process.env.XDG_STATE_HOME;
    if (xdgStateHome) {
        return path.join(xdgStateHome, "pr-watch");
    }
    return path.join(os.homedir(), ".local", "state", "pr-watch");
}
export async function loadConfig(argv) {
    const parsed = parseArgs({
        args: argv,
        options: {
            "refresh-minutes": {
                type: "string"
            },
            "no-notify": {
                type: "boolean"
            },
            "include-drafts": {
                type: "boolean"
            },
            "watch-user": {
                type: "string"
            },
            org: {
                type: "string"
            },
            "all-repos": {
                type: "boolean"
            }
        },
        allowPositionals: false
    });
    const refreshMinutes = parsed.values["refresh-minutes"]
        ? Number.parseInt(parsed.values["refresh-minutes"], 10)
        : DEFAULT_REFRESH_MINUTES;
    if (!Number.isFinite(refreshMinutes) || refreshMinutes <= 0) {
        throw new Error("`--refresh-minutes` must be a positive integer.");
    }
    const stateDirectory = resolveStateDirectory();
    await mkdir(stateDirectory, { recursive: true });
    return {
        refreshMinutes,
        notificationsEnabled: !parsed.values["no-notify"],
        includeDrafts: Boolean(parsed.values["include-drafts"]),
        initialWatchedAuthor: parsed.values["watch-user"]?.trim() || null,
        repositoryScope: parsed.values["all-repos"]
            ? null
            : parsed.values.org
                ? `org:${parsed.values.org.trim()}`
                : null,
        stateFilePath: path.join(stateDirectory, "state.json")
    };
}
