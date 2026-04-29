# Settings Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent user settings system with an in-app overlay (`,` key) that lets users toggle notifications, enable/disable sources, and set per-source polling frequencies.

**Architecture:** A new `src/settings.ts` module owns the `UserSettings` type and load/save logic. Settings are stored in `settings.json` alongside `state.json`. The overlay follows the existing `useInput`-in-component pattern. Per-source polling replaces the single global `setInterval` in Dashboard using a 1-minute heartbeat and `useRef` timestamps.

**Tech Stack:** TypeScript, React/Ink (terminal UI), Node.js `fs/promises`, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/settings.ts` | Create | `UserSettings` type, `loadSettings()`, `saveSettings()`, defaults |
| `src/ui/types.ts` | Modify | Add `"settings"` to `ActiveOverlay`; `userSettings` to `AppState` and `DashboardOptions`; `UPDATE_SETTINGS` to `Action` |
| `src/ui/reducer.ts` | Modify | Handle `UPDATE_SETTINGS` |
| `src/ui/components/SettingsOverlay.tsx` | Create | Settings overlay UI with its own `useInput` |
| `src/ui/components/Overlays.tsx` | Modify | Render `SettingsOverlay` when `activeOverlay === "settings"` |
| `src/ui/components/ModeStrip.tsx` | Modify | Hide disabled modes; renumber shortcuts |
| `src/ui/components/Footer.tsx` | Modify | Add `[,] settings` hint to all footer variants |
| `src/ui/Dashboard.tsx` | Modify | Load/pass settings; per-source polling; `,` key binding; save side effect; auto-switch effect |
| `src/cli.ts` | Modify | Call `loadSettings()`; apply CLI overrides; pass `userSettings` to `DashboardOptions` |
| `src/notify.ts` | No change needed | `sendNotifications()` is called conditionally in Dashboard; the guard lives there, not in notify.ts |
| `test/settings.test.ts` | Create | Unit tests for `loadSettings` / `saveSettings` |

---

## Task 1: `src/settings.ts` — UserSettings type and persistence

**Files:**
- Create: `src/settings.ts`
- Create: `test/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../src/settings.js";
import type { UserSettings } from "../src/settings.js";

let dir: string;
let filePath: string;

beforeEach(async () => {
  dir = join(tmpdir(), `gh-watch-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  filePath = join(dir, "settings.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadSettings", () => {
  it("returns defaults when file does not exist", async () => {
    const s = await loadSettings(filePath);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial file with defaults", async () => {
    await writeFile(filePath, JSON.stringify({ notifications: { enabled: false } }));
    const s = await loadSettings(filePath);
    expect(s.notifications.enabled).toBe(false);
    expect(s.sources.pr).toEqual(DEFAULT_SETTINGS.sources.pr);
  });

  it("falls back to defaults on corrupt JSON", async () => {
    await writeFile(filePath, "not json{{");
    const s = await loadSettings(filePath);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults on invalid pollMinutes", async () => {
    const bad: UserSettings = {
      ...DEFAULT_SETTINGS,
      sources: { ...DEFAULT_SETTINGS.sources, pr: { enabled: true, pollMinutes: -5 } }
    };
    await writeFile(filePath, JSON.stringify(bad));
    const s = await loadSettings(filePath);
    expect(s.sources.pr.pollMinutes).toBe(DEFAULT_SETTINGS.sources.pr.pollMinutes);
  });
});

describe("saveSettings", () => {
  it("round-trips through loadSettings", async () => {
    const custom: UserSettings = {
      notifications: { enabled: false },
      sources: {
        pr: { enabled: true, pollMinutes: 3 },
        security: { enabled: false, pollMinutes: 60 },
        messages: { enabled: true, pollMinutes: 5 },
        repos: { enabled: true, pollMinutes: 10 },
      }
    };
    await saveSettings(filePath, custom);
    const loaded = await loadSettings(filePath);
    expect(loaded).toEqual(custom);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm test -- test/settings.test.ts 2>&1 | tail -20
```

Expected: errors about missing module `../src/settings.js`

- [ ] **Step 3: Create `src/settings.ts`**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import type { AppMode } from "./ui/types.js";

export interface SourceSettings {
  enabled: boolean;
  pollMinutes: number;
}

export interface UserSettings {
  notifications: { enabled: boolean };
  sources: Record<AppMode, SourceSettings>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: { enabled: true },
  sources: {
    pr: { enabled: true, pollMinutes: 2 },
    security: { enabled: true, pollMinutes: 30 },
    messages: { enabled: true, pollMinutes: 5 },
    repos: { enabled: true, pollMinutes: 10 },
  },
};

const MIN_POLL = 1;
const MAX_POLL = 1440;

function sanitizeSource(raw: unknown, def: SourceSettings): SourceSettings {
  if (!raw || typeof raw !== "object") return def;
  const r = raw as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const pm = Number(r.pollMinutes);
  const pollMinutes = Number.isFinite(pm) && pm >= MIN_POLL && pm <= MAX_POLL ? pm : def.pollMinutes;
  return { enabled, pollMinutes };
}

function mergeWithDefaults(raw: unknown): UserSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;

  const rawNotif = r.notifications as Record<string, unknown> | undefined;
  const notifEnabled = typeof rawNotif?.enabled === "boolean"
    ? rawNotif.enabled
    : DEFAULT_SETTINGS.notifications.enabled;

  const rawSources = (r.sources ?? {}) as Record<string, unknown>;
  const modes: AppMode[] = ["pr", "security", "messages", "repos"];
  const sources = Object.fromEntries(
    modes.map((m) => [m, sanitizeSource(rawSources[m], DEFAULT_SETTINGS.sources[m])])
  ) as Record<AppMode, SourceSettings>;

  return { notifications: { enabled: notifEnabled }, sources };
}

export async function loadSettings(filePath: string): Promise<UserSettings> {
  try {
    const raw = await readFile(filePath, "utf8");
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(filePath: string, settings: UserSettings): Promise<void> {
  try {
    await writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    process.stderr.write(`gh-watch: failed to save settings: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm test -- test/settings.test.ts 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/settings.ts test/settings.test.ts && git commit -m "feat: add UserSettings type, loadSettings, saveSettings"
```

---

## Task 2: Type definitions — extend `src/ui/types.ts`

**Files:**
- Modify: `src/ui/types.ts`

- [ ] **Step 1: Add `"settings"` to `ActiveOverlay`**

In `src/ui/types.ts` line 6, change:
```typescript
export type ActiveOverlay = "author" | "scope" | "custom" | null;
```
to:
```typescript
export type ActiveOverlay = "author" | "scope" | "custom" | "settings" | null;
```

- [ ] **Step 2: Add `userSettings` to `DashboardOptions`**

In `src/ui/types.ts`, the `DashboardOptions` interface (around line 22), add `userSettings`:
```typescript
import type { UserSettings } from "../settings.js";

export interface DashboardOptions {
  config: AppConfig;
  userSettings: UserSettings;
  organizations: string[];
  initialState: PersistedState;
  initialAttentionState: TrackedAttentionState;
}
```

- [ ] **Step 3: Add `userSettings` to `AppState`**

In `AppState` interface, add after `repoDetailPrsLoading`:
```typescript
  userSettings: UserSettings;
```

- [ ] **Step 4: Add `UPDATE_SETTINGS` to `Action` union**

At the end of the `Action` type in `src/ui/types.ts`, add:
```typescript
  | { type: "UPDATE_SETTINGS"; settings: UserSettings };
```

- [ ] **Step 5: Build to confirm no type errors**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | tail -30
```

Expected: errors about `userSettings` missing in reducer and Dashboard (will fix next tasks)

- [ ] **Step 6: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/types.ts && git commit -m "feat: extend types for UserSettings — ActiveOverlay, DashboardOptions, AppState, Action"
```

---

## Task 3: Reducer — handle `UPDATE_SETTINGS`

**Files:**
- Modify: `src/ui/reducer.ts`

- [ ] **Step 1: Add `UPDATE_SETTINGS` case**

At the end of the `switch` in `src/ui/reducer.ts`, before the `default` case, add:
```typescript
    case "UPDATE_SETTINGS":
      return { ...state, userSettings: action.settings };
```

- [ ] **Step 2: Build to confirm no type errors**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: errors only about Dashboard and cli.ts not passing `userSettings` yet

- [ ] **Step 3: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/reducer.ts && git commit -m "feat: handle UPDATE_SETTINGS in reducer"
```

---

## Task 4: `src/ui/components/SettingsOverlay.tsx` — settings UI

**Files:**
- Create: `src/ui/components/SettingsOverlay.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { UserSettings } from "../../settings.js";
import type { AppMode } from "../types.js";

const MODE_LABELS: Record<AppMode, string> = {
  pr: "Pull Requests",
  security: "Security",
  messages: "Messages",
  repos: "Repos",
};

const MODES: AppMode[] = ["pr", "security", "messages", "repos"];
const MIN_POLL = 1;
const MAX_POLL = 1440;

// Row indices: 0 = notifications toggle, 1-4 = source rows (pr, security, messages, repos)
const TOTAL_ROWS = 1 + MODES.length;

interface Props {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onClose: () => void;
}

export function SettingsOverlay({ settings, onChange, onClose }: Props) {
  const [selectedRow, setSelectedRow] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape || input === ",") { onClose(); return; }

    if (key.upArrow || input === "k") {
      setSelectedRow(r => Math.max(0, r - 1));
      setErrorMsg(null);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedRow(r => Math.min(TOTAL_ROWS - 1, r + 1));
      setErrorMsg(null);
      return;
    }

    if (input === " ") {
      if (selectedRow === 0) {
        onChange({ ...settings, notifications: { enabled: !settings.notifications.enabled } });
      } else {
        const mode = MODES[selectedRow - 1]!;
        const current = settings.sources[mode];
        const enabledCount = MODES.filter(m => settings.sources[m].enabled).length;
        if (current.enabled && enabledCount <= 1) {
          setErrorMsg("At least one source must be enabled.");
          return;
        }
        onChange({
          ...settings,
          sources: { ...settings.sources, [mode]: { ...current, enabled: !current.enabled } }
        });
      }
      setErrorMsg(null);
      return;
    }

    if ((input === "+" || input === "=") && selectedRow > 0) {
      const mode = MODES[selectedRow - 1]!;
      const current = settings.sources[mode];
      const next = Math.min(MAX_POLL, current.pollMinutes + 1);
      onChange({ ...settings, sources: { ...settings.sources, [mode]: { ...current, pollMinutes: next } } });
      return;
    }
    if (input === "-" && selectedRow > 0) {
      const mode = MODES[selectedRow - 1]!;
      const current = settings.sources[mode];
      const next = Math.max(MIN_POLL, current.pollMinutes - 1);
      onChange({ ...settings, sources: { ...settings.sources, [mode]: { ...current, pollMinutes: next } } });
      return;
    }
  });

  const notifRow = selectedRow === 0;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1} width={52}>
      <Text bold> Settings </Text>
      <Text> </Text>

      <Text bold dimColor>NOTIFICATIONS</Text>
      <Box>
        <Text color={notifRow ? "cyan" : undefined}>
          {notifRow ? "▶ " : "  "}
          {"Enabled".padEnd(20)}
          {settings.notifications.enabled ? "[✓]" : "[ ]"}
        </Text>
      </Box>

      <Text> </Text>
      <Text bold dimColor>SOURCES</Text>

      {MODES.map((mode, i) => {
        const src = settings.sources[mode];
        const active = selectedRow === i + 1;
        return (
          <Box key={mode}>
            <Text color={active ? "cyan" : undefined}>
              {active ? "▶ " : "  "}
              {MODE_LABELS[mode].padEnd(18)}
              {src.enabled ? "[✓]" : "[ ]"}
              {"  poll: "}
              {String(src.pollMinutes).padStart(4)}
              {" min"}
            </Text>
          </Box>
        );
      })}

      <Text> </Text>
      {errorMsg
        ? <Text color="red">{errorMsg}</Text>
        : <Text dimColor>↑↓ navigate  space toggle  +/- poll  , close</Text>
      }
    </Box>
  );
}
```

- [ ] **Step 2: Build to confirm it compiles**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep "SettingsOverlay" | head -10
```

Expected: no errors for SettingsOverlay

- [ ] **Step 3: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/components/SettingsOverlay.tsx && git commit -m "feat: add SettingsOverlay component"
```

---

## Task 5: Wire `SettingsOverlay` into `Overlays.tsx`

**Files:**
- Modify: `src/ui/components/Overlays.tsx`

- [ ] **Step 1: Import and render SettingsOverlay**

Add the import at the top of `src/ui/components/Overlays.tsx`:
```typescript
import { SettingsOverlay } from "./SettingsOverlay.js";
import type { UserSettings } from "../../settings.js";
```

Add `userSettings`, `onSettingsChange`, and `onSettingsClose` to the `Overlays` props interface:
```typescript
export function Overlays({ state, authorOptions, scopeOptions, onAuthorSelect, onScopeSelect, onCustomUser, onCancel, userSettings, onSettingsChange, onSettingsClose }: {
  state: AppState;
  authorOptions: WatchedAuthorOption[];
  scopeOptions: Array<{ label: string; value: string | null }>;
  onAuthorSelect: (opt: WatchedAuthorOption) => void;
  onScopeSelect: (value: string | null) => void;
  onCustomUser: (value: string) => void;
  onCancel: () => void;
  userSettings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  onSettingsClose: () => void;
}) {
```

Add the `SettingsOverlay` render inside the return fragment:
```tsx
      {state.activeOverlay === "settings" && (
        <SettingsOverlay
          settings={userSettings}
          onChange={onSettingsChange}
          onClose={onSettingsClose}
        />
      )}
```

- [ ] **Step 2: Build**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: errors only about Dashboard not passing the new props yet

- [ ] **Step 3: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/components/Overlays.tsx && git commit -m "feat: wire SettingsOverlay into Overlays"
```

---

## Task 6: Update `cli.ts` — load settings and pass to Dashboard

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add loadSettings import and call**

Add import at the top of `src/cli.ts` (alongside the existing imports):
```typescript
import { loadSettings } from "./settings.js";
```

Add `import { dirname, join } from "node:path";` to the imports in `src/cli.ts`.

In the `main()` function, after the `loadConfig` call (line 42), load settings:
```typescript
  const config = await loadConfig(process.argv.slice(2));
  const settingsPath = join(dirname(config.stateFilePath), "settings.json");
  let userSettings = await loadSettings(settingsPath);
```

- [ ] **Step 2: Apply CLI flag overrides**

After loading `userSettings`, apply CLI overrides (session-only, no write-back):
```typescript
  // CLI flags override persisted settings for this session only
  if (!config.notificationsEnabled) {
    userSettings = { ...userSettings, notifications: { enabled: false } };
  }
  // --refresh-minutes overrides pollMinutes for all sources
  if (process.argv.some(a => a.startsWith("--refresh-minutes"))) {
    const sources = Object.fromEntries(
      (Object.keys(userSettings.sources) as Array<keyof typeof userSettings.sources>)
        .map(m => [m, { ...userSettings.sources[m], pollMinutes: config.refreshMinutes }])
    ) as typeof userSettings.sources;
    userSettings = { ...userSettings, sources };
  }
```

- [ ] **Step 3: Pass `userSettings` into `runDashboard`**

Update the `runDashboard` call at the bottom of `main()`:
```typescript
  await runDashboard({
    config,
    userSettings,
    organizations,
    initialState: persistedState,
    initialAttentionState
  });
```

- [ ] **Step 4: Build**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: errors only about Dashboard not consuming `userSettings` in initial state yet

- [ ] **Step 5: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/cli.ts && git commit -m "feat: load settings in cli.ts, apply CLI overrides"
```

---

## Task 7: Update `Dashboard.tsx` — settings state, polling, key binding, side effects

**Files:**
- Modify: `src/ui/Dashboard.tsx`

This is the largest task. Complete each step before moving to the next.

- [ ] **Step 1: Add imports**

Add to the imports at the top of `src/ui/Dashboard.tsx`:
```typescript
import { saveSettings } from "../settings.js";
import type { UserSettings } from "../settings.js";
import { SettingsOverlay } from "./components/SettingsOverlay.js";
```

- [ ] **Step 2: Add `userSettings` to initial state**

In the `useReducer` initializer (around line 38), add `userSettings` as the last field:
```typescript
    userSettings: options.userSettings,
```

- [ ] **Step 3: Add `userSettingsRef` for polling**

After the existing `useRef` declarations (around line 88), add:
```typescript
  const userSettingsRef = useRef<UserSettings>(options.userSettings);
  const lastRefreshedAt = useRef<Partial<Record<AppMode, number>>>({});
```

Update it each render in the existing `useEffect` that syncs refs (around line 90):
```typescript
    userSettingsRef.current = state.userSettings;
```

- [ ] **Step 4: Replace single-interval polling with per-source heartbeat**

Remove the existing poll timer `useEffect` (lines 281-285):
```typescript
  // Poll timer
  useEffect(() => {
    const id = setInterval(() => void doRefresh("all"), options.config.refreshMinutes * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Replace with:
```typescript
  // Per-source polling heartbeat — ticks every minute, each source fires on its own cadence
  useEffect(() => {
    const REFRESH_FOR_MODE: Record<AppMode, ViewKey | "all"> = {
      pr: "all",       // refreshes myPrs + needsMyReview + watchedAuthor
      security: "security",
      messages: "messages",
      repos: "repos",
    };
    const id = setInterval(() => {
      const settings = userSettingsRef.current;
      const modes: AppMode[] = ["pr", "security", "messages", "repos"];
      for (const mode of modes) {
        const src = settings.sources[mode];
        if (!src.enabled) continue;
        const last = lastRefreshedAt.current[mode] ?? 0;
        if (Date.now() - last >= src.pollMinutes * 60_000) {
          lastRefreshedAt.current[mode] = Date.now();
          void doRefresh(REFRESH_FOR_MODE[mode]);
        }
      }
    }, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 5: Add save side effect for UPDATE_SETTINGS**

Add `import { dirname, join } from "node:path";` to the imports in `src/ui/Dashboard.tsx`.

After the ref-sync `useEffect`, add:
```typescript
  // Persist settings whenever they change
  useEffect(() => {
    const settingsPath = join(dirname(options.config.stateFilePath), "settings.json");
    void saveSettings(settingsPath, state.userSettings);
  }, [state.userSettings, options.config.stateFilePath]);
```

- [ ] **Step 6: Add auto-switch effect when active mode is disabled**

```typescript
  // If active mode is disabled in settings, switch to first enabled mode
  useEffect(() => {
    const modes: AppMode[] = ["pr", "security", "messages", "repos"];
    if (!state.userSettings.sources[state.mode].enabled) {
      const first = modes.find(m => state.userSettings.sources[m].enabled);
      if (first) dispatch({ type: "SET_MODE", mode: first });
    }
  }, [state.userSettings, state.mode]);
```

- [ ] **Step 7: Add `,` key binding**

In `useInput`, before the `if (input === "q"` line at the end, add:
```typescript
    if (input === ",") {
      dispatch({ type: "SET_OVERLAY", overlay: state.activeOverlay === "settings" ? null : "settings" });
      return;
    }
```

Note: this binding fires only when `state.activeOverlay` is null (the early return `if (state.activeOverlay) return;` guards against all other cases). The SettingsOverlay component handles `,` for closing via its own `useInput`.

- [ ] **Step 8: Update notifications check**

Find the line (around 229):
```typescript
      if (cfg.notificationsEnabled) {
```
Replace with:
```typescript
      if (state.userSettings.notifications.enabled) {
```

Wait — `state` is not in scope inside `doRefresh` (it's a `useCallback`). The correct approach is to add a `userSettingsRef` read:
```typescript
      if (userSettingsRef.current.notifications.enabled) {
```

- [ ] **Step 9: Pass settings props to Overlays**

Find the `<Overlays` JSX (around line 774) and add the new props:
```tsx
          <Overlays
            state={state}
            authorOptions={buildAuthorOptions()}
            scopeOptions={buildScopeOptions()}
            onAuthorSelect={handleAuthorSelect}
            onScopeSelect={handleScopeSelect}
            onCustomUser={handleCustomUser}
            onCancel={closeOverlay}
            userSettings={state.userSettings}
            onSettingsChange={(settings) => dispatch({ type: "UPDATE_SETTINGS", settings })}
            onSettingsClose={closeOverlay}
          />
```

- [ ] **Step 10: Build**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep -E "error|Error" | head -30
```

Expected: clean build

- [ ] **Step 11: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/Dashboard.tsx && git commit -m "feat: per-source polling, settings state, , key binding, save side effect"
```

---

## Task 8: Update `ModeStrip.tsx` — hide disabled modes, renumber

**Files:**
- Modify: `src/ui/components/ModeStrip.tsx`

- [ ] **Step 1: Rewrite ModeStrip to filter by enabled sources**

Replace the full content of `src/ui/components/ModeStrip.tsx`:

```typescript
import React from "react";
import { Box, Text } from "ink";
import type { AppMode, AppState } from "../types.js";

const MODE_LABELS: Record<AppMode, string> = {
  pr: "Pull Requests",
  security: "Security",
  messages: "Messages",
  repos: "Repos",
};

const ALL_MODES: AppMode[] = ["pr", "security", "messages", "repos"];

export function ModeStrip({ state }: { state: AppState }) {
  const { mode, attentionState, userSettings } = state;
  const enabledModes = ALL_MODES.filter(m => userSettings.sources[m].enabled);

  const prCount = attentionState.myPullRequests.length + attentionState.needsMyReview.length;
  const secAlerts = attentionState.securityAlerts;
  const critCount = secAlerts.filter(a => a.severity === "critical").length;
  const highCount = secAlerts.filter(a => a.severity === "high").length;
  const unreadCount = attentionState.notificationUnreadCount;

  const borderColor = mode === "security" ? "red"
    : mode === "messages" ? "blue"
    : mode === "repos" ? "green"
    : "cyan";

  function badge(m: AppMode): React.ReactNode {
    if (m === "pr") return prCount > 0 ? <Text color="cyan">({prCount})</Text> : <Text dimColor>(0)</Text>;
    if (m === "security") {
      return critCount > 0
        ? <Text color="red">({critCount} crit{highCount > 0 ? ` · ${highCount} high` : ""})</Text>
        : highCount > 0
        ? <Text color="magenta">({highCount} high)</Text>
        : <Text dimColor>(0)</Text>;
    }
    if (m === "messages") return unreadCount > 0 ? <Text color="blue">({unreadCount} unread)</Text> : <Text dimColor>(0)</Text>;
    return null;
  }

  const modeColor: Record<AppMode, string> = { pr: "cyan", security: "red", messages: "blue", repos: "green" };

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
      {enabledModes.map((m, i) => {
        const active = mode === m;
        const color = active ? modeColor[m] : "gray";
        return (
          <React.Fragment key={m}>
            {i > 0 && <Text>{"   "}</Text>}
            <Text bold={active} color={color}>
              <Text dimColor={!active}>[</Text>
              <Text color={color}>{i + 1}</Text>
              <Text dimColor={!active}>]</Text>
              {" "}{MODE_LABELS[m]}
            </Text>
            {"  "}
            {badge(m)}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Update numeric key handlers in Dashboard to use enabled-mode index**

The existing `1`/`2`/`3`/`4` key bindings in `Dashboard.tsx` are hardcoded to modes. They need to map by enabled-mode index. Find the key bindings section (around lines 645-663) and replace with:

```typescript
    // Numeric keys switch to the Nth enabled mode
    const enabledModes: AppMode[] = (["pr", "security", "messages", "repos"] as AppMode[])
      .filter(m => state.userSettings.sources[m].enabled);
    const numIdx = ["1","2","3","4"].indexOf(input);
    if (numIdx >= 0 && numIdx < enabledModes.length) {
      const targetMode = enabledModes[numIdx]!;
      dispatch({ type: "SET_MODE", mode: targetMode });
      if (targetMode === "repos" && state.accessibleRepos.length === 0 && !state.isRefreshing) {
        void doRefresh("repos");
      }
      return;
    }
    if (input === "p") {
      dispatch({ type: "SET_MODE", mode: "repos" });
      if (state.accessibleRepos.length === 0 && !state.isRefreshing) {
        void doRefresh("repos");
      }
      return;
    }
```

- [ ] **Step 3: Build**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: clean build

- [ ] **Step 4: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/components/ModeStrip.tsx src/ui/Dashboard.tsx && git commit -m "feat: ModeStrip hides disabled modes, numeric shortcuts renumber dynamically"
```

---

## Task 9: Update `Footer.tsx` — add `,` settings hint

**Files:**
- Modify: `src/ui/components/Footer.tsx`

- [ ] **Step 1: Add `, settings` hint to every footer variant**

In each `return` branch of `Footer`, add `{sep}<Text dimColor>, settings</Text>` before the final `r refresh  q quit` text. Specifically, add it to all 5 branches (messages, security, repos-detail, repos-list, default/pr):

For the messages footer:
```tsx
        <Text dimColor>r refresh  q quit</Text>
```
becomes:
```tsx
        <Text dimColor>, settings</Text>{sep}
        <Text dimColor>r refresh  q quit</Text>
```

Apply the same pattern to all other footer variants.

- [ ] **Step 2: Build**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: clean build

- [ ] **Step 3: Run all tests**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm test 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add src/ui/components/Footer.tsx && git commit -m "feat: add [,] settings hint to footer"
```

---

## Task 10: Final build and smoke test

- [ ] **Step 1: Full clean build**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm run build 2>&1
```

Expected: no errors

- [ ] **Step 2: Run all tests**

```bash
cd "/Users/timothylawson/Documents/New project 2" && npm test 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 3: Verify settings.json is written on startup**

```bash
cd "/Users/timothylawson/Documents/New project 2" && node -e "
const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await import('./dist/settings.js');
const path = '/tmp/gh-watch-test-settings.json';
await saveSettings(path, DEFAULT_SETTINGS);
const loaded = await loadSettings(path);
console.log(JSON.stringify(loaded, null, 2));
" 2>&1
```

Expected: prints the default settings JSON

- [ ] **Step 4: Final commit**

```bash
cd "/Users/timothylawson/Documents/New project 2" && git add -A && git status
```

Only commit if there are unexpected stray changes.
