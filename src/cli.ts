#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { fetchViewerLogin, fetchViewerOrganizations } from "./github.js";

import { loadState, saveState, updateWatchedAuthors } from "./state.js";
import type { TrackedAttentionState } from "./types.js";
import { runDashboard } from "./ui.js";

function friendlyGhError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("not logged into") || msg.includes("gh auth login") || msg.includes("authentication")) {
    return "Not authenticated with GitHub. Run: gh auth login";
  }
  if (msg.includes("command not found") || msg.includes("ENOENT")) {
    return "GitHub CLI not found. Install it from https://cli.github.com and run: gh auth login";
  }
  return `Failed to connect to GitHub: ${msg}`;
}

async function main(): Promise<void> {
  const config = await loadConfig(process.argv.slice(2));
  let persistedState = await loadState(config.stateFilePath);

  let viewerLogin: string;
  let organizations: string[];
  try {
    [viewerLogin, organizations] = await Promise.all([
      fetchViewerLogin(),
      fetchViewerOrganizations()
    ]);
  } catch (err) {
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

  const initialAttentionState: TrackedAttentionState = {
    viewerLogin,
    repositoryScope: config.repositoryScope,
    watchedAuthor,
    myPullRequests: [],
    needsMyReview: [],
    waitingOnOthers: [],
    watchedAuthorPullRequests: [],
    securityAlerts: [],
    securityAlertTotal: 0,
    refreshedAt: new Date().toISOString()
  };

  await runDashboard({
    config,
    organizations,
    initialState: persistedState,
    initialAttentionState
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
