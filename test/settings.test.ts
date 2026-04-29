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
