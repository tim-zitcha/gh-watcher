#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { fetchViewerLogin, fetchViewerOrganizations } from "./github.js";

import { loadState, saveState, updateWatchedAuthors } from "./state.js";
import type { TrackedAttentionState } from "./types.js";
import { runDashboard } from "./ui.js";

async function main(): Promise<void> {
  const config = await loadConfig(process.argv.slice(2));
  let persistedState = await loadState(config.stateFilePath);
  const [viewerLogin, organizations] = await Promise.all([
    fetchViewerLogin(),
    fetchViewerOrganizations()
  ]);
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
    watchedAuthorTotal: 0,
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
