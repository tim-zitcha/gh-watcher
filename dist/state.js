import { readFile, writeFile } from "node:fs/promises";
const DEFAULT_STATE = {
    seenActivityAtByPrId: {},
    notificationFingerprintByKey: {},
    watchedAuthors: {
        current: null,
        recent: []
    }
};
export async function loadState(filePath) {
    try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return {
            seenActivityAtByPrId: parsed.seenActivityAtByPrId ?? {},
            notificationFingerprintByKey: parsed.notificationFingerprintByKey ?? {},
            watchedAuthors: {
                current: parsed.watchedAuthors?.current ?? null,
                recent: parsed.watchedAuthors?.recent ?? []
            }
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return structuredClone(DEFAULT_STATE);
        }
        throw error;
    }
}
export async function saveState(filePath, state) {
    await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
export function updateWatchedAuthors(previous, login) {
    const normalized = login.trim();
    const recent = [normalized, ...previous.recent.filter((item) => item !== normalized)].slice(0, 8);
    return {
        current: normalized,
        recent
    };
}
const NOTIFICATION_VIEWS = ["needsMyReview", "waitingOnOthers", "readyToMerge"];
export function markSeen(state, pullRequests) {
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
export function isUnread(state, pullRequest) {
    const seenAt = state.seenActivityAtByPrId[pullRequest.id];
    return !seenAt || seenAt < pullRequest.activity.latestActivityAt;
}
export function notificationKey(view, pullRequest) {
    return `${view}:${pullRequest.id}`;
}
