import { execFile } from "node:child_process";
import { promisify } from "node:util";
import notifier from "node-notifier";
const execFileAsync = promisify(execFile);
function escapeForAppleScript(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
async function notifyViaOsascript(title, message) {
    if (process.platform !== "darwin") {
        throw new Error("osascript is macOS-only");
    }
    const script = `display notification "${escapeForAppleScript(message)}" with title "${escapeForAppleScript(title)}"`;
    await execFileAsync("osascript", ["-e", script]);
}
function notifyViaTerminalOsc(title, message) {
    if (!process.stdout.isTTY) {
        throw new Error("not a TTY; OSC notification skipped");
    }
    // OSC 9 (iTerm2-style) — Ghostty, iTerm2, WezTerm, kitty support a variant of this.
    process.stdout.write(`\x1b]9;${title}: ${message}\x07`);
}
function notifyViaNodeNotifier(title, message) {
    return new Promise((resolve, reject) => {
        notifier.notify({ title, message, sound: false, wait: false }, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
async function trySend(backend, title, message) {
    try {
        if (backend === "osascript")
            await notifyViaOsascript(title, message);
        else if (backend === "terminal-osc")
            notifyViaTerminalOsc(title, message);
        else
            await notifyViaNodeNotifier(title, message);
        return { backend, ok: true };
    }
    catch (err) {
        return { backend, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
export async function sendNotifications(events) {
    const order = process.platform === "darwin"
        ? ["osascript", "terminal-osc", "node-notifier"]
        : ["node-notifier", "terminal-osc"];
    for (const event of events) {
        for (const backend of order) {
            const result = await trySend(backend, event.title, event.message);
            if (result.ok)
                break;
        }
    }
}
export async function testNotifications() {
    const title = "gh-watcher test";
    const message = `Notification test at ${new Date().toLocaleTimeString()}`;
    const backends = process.platform === "darwin"
        ? ["osascript", "terminal-osc", "node-notifier"]
        : ["node-notifier", "terminal-osc"];
    const results = [];
    for (const backend of backends) {
        results.push(await trySend(backend, title, message));
    }
    return results;
}
