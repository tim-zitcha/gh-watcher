import { readFile, writeFile } from "node:fs/promises";

import type { PersistedState, PullRequestSummary, ViewName, WatchedAuthorState } from "./types.js";

const DEFAULT_STATE: PersistedState = {
  seenActivityAtByPrId: {},
  notificationFingerprintByKey: {},
  watchedAuthors: {
    current: null,
    recent: []
  }
};

export async function loadState(filePath: string): Promise<PersistedState> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    return {
      seenActivityAtByPrId: parsed.seenActivityAtByPrId ?? {},
      notificationFingerprintByKey: parsed.notificationFingerprintByKey ?? {},
      watchedAuthors: {
        current: parsed.watchedAuthors?.current ?? null,
        recent: parsed.watchedAuthors?.recent ?? []
      }
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_STATE);
    }

    throw error;
  }
}

export async function saveState(filePath: string, state: PersistedState): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function updateWatchedAuthors(previous: WatchedAuthorState, login: string): WatchedAuthorState {
  const normalized = login.trim();
  const recent = [normalized, ...previous.recent.filter((item) => item !== normalized)].slice(0, 8);

  return {
    current: normalized,
    recent
  };
}

const NOTIFICATION_VIEWS: ViewName[] = ["needsMyReview", "waitingOnOthers", "readyToMerge"];

export function markSeen(
  state: PersistedState,
  pullRequests: PullRequestSummary[]
): PersistedState {
  const seenActivityAtByPrId = { ...state.seenActivityAtByPrId };
  const notificationFingerprintByKey = { ...state.notificationFingerprintByKey };

  for (const pullRequest of pullRequests) {
    seenActivityAtByPrId[pullRequest.id] = pullRequest.activity.latestActivityAt;

    for (const view of NOTIFICATION_VIEWS) {
      const key = notificationKey(view, pullRequest);
      notificationFingerprintByKey[key] = pullRequest.activity.latestActivityAt;
    }
  }

  return {
    ...state,
    seenActivityAtByPrId,
    notificationFingerprintByKey
  };
}

export function isUnread(state: PersistedState, pullRequest: PullRequestSummary): boolean {
  const seenAt = state.seenActivityAtByPrId[pullRequest.id];
  return !seenAt || seenAt < pullRequest.activity.latestActivityAt;
}

export function notificationKey(view: ViewName, pullRequest: PullRequestSummary): string {
  return `${view}:${pullRequest.id}`;
}
