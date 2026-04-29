#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { fetchViewerLogin, fetchViewerOrganizations } from "./github.js";
import { testNotifications } from "./notify.js";
import { loadState, saveState, updateWatchedAuthors } from "./state.js";
import { DEFAULT_SETTINGS, loadSettings } from "./settings.js";
import { runDashboard } from "./ui.js";
function friendlyGhError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not logged into") || msg.includes("gh auth login") || msg.includes("authentication")) {
        return "Not authenticated with GitHub. Run: gh auth login";
    }
    if (msg.includes("command not found") || msg.includes("ENOENT")) {
        return "GitHub CLI not found. Install it from https://cli.github.com and run: gh auth login";
    }
    return `Failed to connect to GitHub: ${msg}`;
}
async function runNotifyTest() {
    console.log("Sending test notifications via every available backend...\n");
    const results = await testNotifications();
    for (const r of results) {
        if (r.ok) {
            console.log(`  ✓ ${r.backend} — dispatched`);
        }
        else {
            console.log(`  ✗ ${r.backend} — ${r.error ?? "failed"}`);
        }
    }
    console.log("\nIf you didn't see a banner, open System Settings → Notifications and check that Script Editor (osascript), your terminal (Ghostty/iTerm), and terminal-notifier are allowed and Focus is off.");
}
async function main() {
    if (process.argv.includes("--test-notify")) {
        await runNotifyTest();
        return;
    }
    const config = await loadConfig(process.argv.slice(2));
    const settingsFilePath = config.stateFilePath.replace("state.json", "settings.json");
    const userSettings = await loadSettings(settingsFilePath).catch(() => DEFAULT_SETTINGS);
    let persistedState = await loadState(config.stateFilePath);
    let viewerLogin;
    let organizations;
    try {
        [viewerLogin, organizations] = await Promise.all([
            fetchViewerLogin(),
            fetchViewerOrganizations()
        ]);
    }
    catch (err) {
        console.error(friendlyGhError(err));
        process.exit(1);
    }
    const watchedAuthor = config.initialWatchedAuthor ?? viewerLogin;
    if (watchedAuthor && persistedState.watchedAuthors.current !== watchedAuthor) {
        persistedState = {
            ...persistedState,
            watchedAuthors: updateWatchedAuthors(persistedState.watchedAuthors, watchedAuthor)
        };
        await saveState(config.stateFilePath, persistedState);
    }
    const initialAttentionState = {
        viewerLogin,
        repositoryScope: config.repositoryScope,
        watchedAuthor,
        myPullRequests: [],
        needsMyReview: [],
        waitingOnOthers: [],
        readyToMerge: [],
        watchedAuthorPullRequests: [],
        securityAlerts: [],
        securityAlertTotal: 0,
        notifications: [],
        notificationUnreadCount: 0,
        refreshedAt: new Date().toISOString()
    };
    await runDashboard({
        config,
        organizations,
        initialState: persistedState,
        initialAttentionState,
        userSettings
    });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
