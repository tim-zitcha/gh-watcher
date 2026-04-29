# Settings Overlay — Design Spec

**Date:** 2026-04-29  
**Project:** gh-watch  
**Status:** Approved

---

## Overview

Add a persistent user settings system to gh-watch, accessible via an in-app overlay. Settings cover notifications and per-source configuration (enabled/disabled, polling frequency). Settings survive restarts via a `settings.json` file written to the same platform-appropriate directory as `state.json`.

---

## 1. Data Model

### Types (`src/settings.ts`)

```ts
interface SourceSettings {
  enabled: boolean;
  pollMinutes: number;  // min: 1, max: 1440
}

interface UserSettings {
  notifications: { enabled: boolean };
  sources: Record<AppMode, SourceSettings>;
}
```

`AppMode` is `"pr" | "security" | "messages" | "repos"` (defined in `src/ui/types.ts`). The `sources` record is keyed by `AppMode` so any new mode added in the future is automatically included in settings with defaults — no migration logic required.

### AppMode Display Labels

| AppMode      | Display Label   |
|--------------|-----------------|
| `"pr"`       | Pull Requests   |
| `"security"` | Security        |
| `"messages"` | Messages        |
| `"repos"`    | Repos           |

### Default Values

| Source    | Enabled | Poll (min) |
|-----------|---------|------------|
| pr        | true    | 2          |
| security  | true    | 30         |
| messages  | true    | 5          |
| repos     | true    | 10         |

Notifications: enabled by default.

### Persistence

- File: `settings.json` in the existing state directory (resolved by `resolveStateDirectory()` in `src/config.ts` — `~/Library/Application Support/gh-watch/` on macOS, `$XDG_STATE_HOME/gh-watch/` or `~/.local/state/gh-watch/` on Linux).
- `loadSettings()` reads the file and deep-merges with defaults so missing keys are filled in automatically. On any read failure (file missing, corrupt JSON, invalid values such as negative `pollMinutes`), fall back to full defaults silently — no error is surfaced to the user.
- `saveSettings()` writes the full `UserSettings` object to the file on every in-app change. Write failures (EACCES, disk full, etc.) are logged to stderr but do not crash the app or block the UI.
- Both functions live in `src/settings.ts` and are exported for use in `src/cli.ts` and `src/ui/Dashboard.tsx`.

---

## 2. App Integration

### Relationship to AppConfig

`AppConfig` and `UserSettings` are kept as entirely separate parallel channels. `AppConfig` is never modified to carry settings data. At startup, both are loaded independently and passed into `DashboardOptions` as separate fields:

```ts
interface DashboardOptions {
  config: AppConfig;
  userSettings: UserSettings;
  organizations: string[];
  initialState: PersistedState;
  initialAttentionState: TrackedAttentionState;
}
```

### CLI Flag Override Semantics

The existing `--no-notify` and `--refresh-minutes` flags override `UserSettings` for the session only — `settings.json` is not written back. The overrides are applied in `cli.ts` after `loadSettings()` by patching the loaded `UserSettings` object before passing it to `DashboardOptions`:

- `--no-notify` sets `userSettings.notifications.enabled = false` for the session.
- `--refresh-minutes N` sets `pollMinutes = N` on **all** sources for the session.

This preserves backwards compatibility without permanently overwriting the user's persisted preferences.

### AppState (`src/ui/types.ts`)

A `userSettings: UserSettings` field is added to `AppState`. The `UPDATE_SETTINGS` action is added to the `Action` union in `src/ui/types.ts`:

```ts
| { type: "UPDATE_SETTINGS"; settings: UserSettings }
```

### Reducer (`src/ui/reducer.ts`)

The `UPDATE_SETTINGS` action replaces `state.userSettings` with the new settings object. The reducer remains pure — no I/O occurs inside it.

### Save Side Effect (`src/ui/Dashboard.tsx`)

After each `UPDATE_SETTINGS` dispatch, a `useEffect` in `Dashboard` calls `saveSettings(state.userSettings)`. This keeps persistence outside the reducer.

---

## 3. Polling Architecture

The current single-interval polling loop (driven by `refreshMinutes` from `AppConfig`) is replaced with per-source independent timers.

### Timer State

Last-refreshed timestamps are stored in a `useRef` in `Dashboard` (not in `AppState`) to avoid triggering re-renders on timer ticks:

```ts
const lastRefreshedAt = useRef<Partial<Record<AppMode, number>>>({});
```

### Heartbeat

A shared 1-minute `setInterval` heartbeat runs in `Dashboard`. On each tick, it iterates over all `AppMode` values and, for each:
1. Checks `userSettings.sources[mode].enabled` — skips if false.
2. Compares `Date.now() - (lastRefreshedAt.current[mode] ?? 0)` against `pollMinutes * 60_000`. An `undefined` timestamp (source never fetched) is treated as `0`, ensuring the first heartbeat after enabling always triggers a fetch.
3. If the interval has elapsed, triggers a fetch for that source and updates `lastRefreshedAt.current[mode] = Date.now()`.

### Settings Change Behavior

When `pollMinutes` is changed in the overlay, the timer does **not** reset immediately — it waits for the next heartbeat cycle to re-evaluate. When a source is re-enabled, the same applies: the next heartbeat cycle will trigger a fetch if the interval has elapsed since it was last fetched (or if it has never been fetched).

---

## 4. Settings Overlay UI

### Trigger

- Key `,` opens the settings overlay from any mode.
- `Escape` or `,` again closes it.
- If another overlay (`author`, `scope`, or `custom`) is already open when `,` is pressed, it is closed and the settings overlay opens in its place.
- `"settings"` is added to `ActiveOverlay` in `src/ui/types.ts`: `"author" | "scope" | "custom" | "settings" | null`.
- `SettingsOverlay` must handle its own `useInput` for `↑↓`, `Space`, and `+/-` — Dashboard's `useInput` returns early when any overlay is active (`if (state.activeOverlay) return;`), so overlay-internal navigation cannot rely on Dashboard's input handler.

### Layout

```
┌─ Settings ──────────────────────────────────┐
│                                             │
│  NOTIFICATIONS                              │
│  ▶ Enabled          [✓]                     │
│                                             │
│  SOURCES                                    │
│    Pull Requests    [✓]  poll:  2 min       │
│    Security         [✓]  poll: 30 min       │
│    Messages         [✓]  poll:  5 min       │
│    Repos            [✓]  poll: 10 min       │
│                                             │
│  [↑↓] navigate  [space] toggle  [+/-] poll │
│  [s/esc] close                              │
└─────────────────────────────────────────────┘
```

- Arrow keys navigate rows. The selected row is highlighted.
- `Space` toggles boolean settings (`enabled`).
- `+` / `-` increment/decrement `pollMinutes` (min: 1, max: 1440).
- Changes apply immediately: each change dispatches `UPDATE_SETTINGS` with the full updated `UserSettings` object.

### Notifications Runtime Path

The `notifications.enabled` flag is checked in the existing notification dispatch code in `src/notify.ts`. The current `notificationsEnabled` value from `AppConfig` is replaced with `userSettings.notifications.enabled` read from `AppState`. Dashboard passes this value down to the notification dispatch logic.

### Component

New `SettingsOverlay` component as `src/ui/components/SettingsOverlay.tsx` (given expected size, a dedicated file is cleaner than adding to `Overlays.tsx`). It receives `userSettings: UserSettings` and `dispatch` as props.

---

## 5. ModeStrip Changes

- Modes with `enabled: false` in `UserSettings.sources` are hidden from the tab bar.
- Numeric shortcuts (`[1]`, `[2]`, etc.) renumber dynamically based on visible modes only.
- **All-disabled prevention:** The `Space` toggle in the settings overlay checks whether disabling a source would leave zero enabled sources. If so, the toggle is blocked and a brief inline message is shown: `"At least one source must be enabled."` This prevents an unrenderable state.
- **Auto-switch on disable:** If the currently active mode is disabled via the overlay, the app must switch to the first enabled mode. This logic lives in a `useEffect` in `Dashboard` that watches `userSettings.sources` — if `userSettings.sources[state.mode].enabled === false`, it dispatches `SET_MODE` with the first enabled mode. This keeps the reducer pure.

---

## 6. Footer Changes

- `[,] settings` hint added to the footer alongside existing key hints.

---

## 7. File Changes Summary

| File | Change |
|------|--------|
| `src/settings.ts` | **New** — `UserSettings` type, `loadSettings()`, `saveSettings()`, defaults |
| `src/ui/types.ts` | Add `"settings"` to `ActiveOverlay`; add `userSettings: UserSettings` to `AppState`; add `UPDATE_SETTINGS` to `Action` union; add `userSettings: UserSettings` to `DashboardOptions` |
| `src/ui/reducer.ts` | Handle `UPDATE_SETTINGS` action |
| `src/ui/Dashboard.tsx` | Load settings; pass to state; save side effect; per-source polling loop with `useRef` timestamps; auto-switch effect |
| `src/ui/components/SettingsOverlay.tsx` | **New** — settings overlay component |
| `src/ui/components/ModeStrip.tsx` | Filter hidden modes; renumber shortcuts |
| `src/ui/components/Footer.tsx` | Add `[s] settings` hint |
| `src/cli.ts` | Call `loadSettings()`; apply CLI flag overrides; pass `userSettings` into `DashboardOptions` |
| `src/notify.ts` | Read `notifications.enabled` from `userSettings` instead of `AppConfig` |
