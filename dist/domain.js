import { isUnread, notificationKey } from "./state.js";
export function shouldIncludePullRequest(pullRequest, includeDrafts) {
    return includeDrafts || !pullRequest.isDraft;
}
export function isRequestedReviewer(pullRequest, viewerLogin) {
    return pullRequest.requestedReviewers.includes(viewerLogin);
}
export function shouldTrackWaitingOnOthers(pullRequest, viewerLogin) {
    if (pullRequest.author !== viewerLogin) {
        return false;
    }
    const requestedOtherReviewers = pullRequest.requestedReviewers.filter((reviewer) => reviewer !== viewerLogin);
    if (requestedOtherReviewers.length > 0) {
        return true;
    }
    return pullRequest.reviewDecision === "REVIEW_REQUIRED";
}
export function sortPullRequests(pullRequests) {
    return [...pullRequests].sort((left, right) => {
        if (left.activity.latestActivityAt === right.activity.latestActivityAt) {
            return right.number - left.number;
        }
        return right.activity.latestActivityAt.localeCompare(left.activity.latestActivityAt);
    });
}
export function formatReviewDecision(reviewDecision) {
    if (!reviewDecision) {
        return "NONE";
    }
    return reviewDecision.replaceAll("_", " ");
}
export function buildNotifications(previousState, nextState, persistedState) {
    const events = [];
    const previousNeedsMyReviewIds = new Set(previousState?.needsMyReview.map((pr) => pr.id) ?? []);
    const previousWaitingFingerprints = new Map(previousState?.waitingOnOthers.map((pr) => [pr.id, pr.activity.fingerprint]) ?? []);
    for (const pullRequest of nextState.needsMyReview) {
        const dedupeKey = notificationKey("needsMyReview", pullRequest);
        const previousFingerprint = persistedState.notificationFingerprintByKey[dedupeKey];
        if (!previousNeedsMyReviewIds.has(pullRequest.id) && previousFingerprint !== pullRequest.activity.fingerprint) {
            events.push({
                dedupeKey,
                title: "PR needs your review",
                message: `${pullRequest.repository} #${pullRequest.number} ${pullRequest.title}`
            });
        }
    }
    for (const pullRequest of nextState.waitingOnOthers) {
        const dedupeKey = notificationKey("waitingOnOthers", pullRequest);
        const previousFingerprint = previousWaitingFingerprints.get(pullRequest.id);
        const recordedFingerprint = persistedState.notificationFingerprintByKey[dedupeKey];
        // Four-way guard: PR existed before (not brand new), activity changed since last
        // seen refresh, we haven't already notified for this exact fingerprint, and the
        // user hasn't manually marked it read — all four must hold to avoid double-firing.
        if (previousFingerprint &&
            previousFingerprint !== pullRequest.activity.fingerprint &&
            recordedFingerprint !== pullRequest.activity.fingerprint &&
            isUnread(persistedState, pullRequest)) {
            events.push({
                dedupeKey,
                title: "New activity on your PR",
                message: `${pullRequest.repository} #${pullRequest.number} ${pullRequest.title}`
            });
        }
    }
    return events;
}
