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
  pollMinutes: number;
}

interface UserSettings {
  notifications: { enabled: boolean };
  sources: Record<AppMode, SourceSettings>;
}
```

`AppMode` is `"pr" | "security" | "messages" | "repos"` (defined in `src/ui/types.ts`). The `sources` record is keyed by `AppMode` so any new mode added in the future is automatically included in settings with defaults — no migration logic required.

### Default Values

| Source    | Enabled | Poll (min) |
|-----------|---------|------------|
| pr        | true    | 2          |
| security  | true    | 30         |
| messages  | true    | 5          |
| repos     | true    | 10         |

Notifications: enabled by default.

### Persistence

- File: `settings.json` in the existing state directory (`~/Library/Application Support/gh-watch/` on macOS, `$XDG_STATE_HOME/gh-watch/` or `~/.local/state/gh-watch/` on Linux).
- `loadSettings()` reads the file, deep-merges with defaults (so missing keys are filled in), and returns a `UserSettings` object.
- `saveSettings()` writes the full `UserSettings` object to the file on every change.
- Both functions live in a new `src/settings.ts` module.

---

## 2. App Integration

### AppConfig

`AppConfig` (in `src/types.ts`) remains CLI-args only. The existing `--no-notify` and `--refresh-minutes` flags are kept for backwards compatibility but act as startup overrides — if provided, they override the corresponding `UserSettings` values at launch.

### Startup (`src/cli.ts`)

`loadSettings()` is called alongside `loadConfig()` at startup. The resulting `UserSettings` is passed into `DashboardOptions` and flows into the initial `AppState`.

### AppState (`src/ui/types.ts`)

A `userSettings: UserSettings` field is added to `AppState`.

### Reducer (`src/ui/reducer.ts`)

A new `UPDATE_SETTINGS` action:

```ts
{ type: "UPDATE_SETTINGS"; settings: UserSettings }
```

The reducer updates `state.userSettings`. A side effect in the Dashboard triggers `saveSettings()` after each `UPDATE_SETTINGS` dispatch.

---

## 3. Polling Architecture

The current single-interval polling loop (driven by `refreshMinutes` from `AppConfig`) is replaced with per-source independent timers.

Each source tracks its own last-refreshed timestamp. On each tick (a shared 1-minute heartbeat), each source checks whether its `pollMinutes` interval has elapsed and whether it is enabled. Disabled sources are skipped entirely — their data is not fetched and their views are not updated.

---

## 4. Settings Overlay UI

### Trigger

- Key `s` opens the settings overlay from any mode.
- `Escape` or `s` again closes it.
- Added to `ActiveOverlay` as `"settings"` in `src/ui/types.ts`.

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

- Arrow keys navigate rows.
- `Space` toggles boolean settings.
- `+` / `-` increment/decrement `pollMinutes` (minimum 1).
- The selected row is highlighted.
- Changes apply immediately and trigger `saveSettings()`.

### Component

New `SettingsOverlay` component in `src/ui/components/Overlays.tsx` (alongside existing overlays) or as a dedicated `src/ui/components/SettingsOverlay.tsx` if size warrants it.

---

## 5. ModeStrip Changes

- Modes with `enabled: false` in `UserSettings.sources` are hidden from the tab bar.
- If the currently active mode is disabled, the app switches to the first enabled mode.
- Key number shortcuts (`[1]`, `[2]`, etc.) renumber dynamically based on visible modes.

---

## 6. Footer Changes

- `s` key hint added to the footer: `[s] settings`.

---

## 7. File Changes Summary

| File | Change |
|------|--------|
| `src/settings.ts` | New — `UserSettings` type, `loadSettings()`, `saveSettings()`, defaults |
| `src/types.ts` | Add `userSettings` to `AppConfig` pass-through (or keep separate) |
| `src/ui/types.ts` | Add `"settings"` to `ActiveOverlay`; add `userSettings: UserSettings` to `AppState`; add `UPDATE_SETTINGS` action |
| `src/ui/reducer.ts` | Handle `UPDATE_SETTINGS` action |
| `src/ui/Dashboard.tsx` | Load settings at startup; pass to state; side-effect save on change; per-source polling loop |
| `src/ui/components/Overlays.tsx` | Add `SettingsOverlay` component |
| `src/ui/components/ModeStrip.tsx` | Filter hidden modes; renumber shortcuts |
| `src/ui/components/Footer.tsx` | Add `[s] settings` hint |
| `src/cli.ts` | Call `loadSettings()` at startup |
