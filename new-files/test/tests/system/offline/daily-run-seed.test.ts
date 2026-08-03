import {
  createOfflineDailySeed,
  DAILY_SEED_STORAGE_KEYS,
  getDailyRunSeed,
  refreshDailyRunSeed,
} from "#system/offline/daily-run-seed";
import { afterEach, describe, expect, it, vi } from "vitest";

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}

describe("System - Offline - daily-run-seed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses a seed cached for the current UTC day", async () => {
    installStorage({
      [DAILY_SEED_STORAGE_KEYS.date]: "2026-07-31",
      [DAILY_SEED_STORAGE_KEYS.seed]: "cached-seed",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).resolves.toBe("cached-seed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates and caches this fork's dated seed feed", async () => {
    const storage = installStorage();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ date: "2026-07-31", seed: "official-seed" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).resolves.toBe("official-seed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seed.json",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(storage.get(DAILY_SEED_STORAGE_KEYS.date)).toBe("2026-07-31");
    expect(storage.get(DAILY_SEED_STORAGE_KEYS.seed)).toBe("official-seed");
    expect(Number(storage.get(DAILY_SEED_STORAGE_KEYS.fetchedAt))).toBeGreaterThan(0);
  });

  it("rejects a stale published seed instead of mislabeling it as current", async () => {
    const storage = installStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ date: "2026-07-30", seed: "stale-seed" }))),
    );

    await expect(refreshDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).rejects.toThrow("not 2026-07-31");
    expect(storage.has(DAILY_SEED_STORAGE_KEYS.seed)).toBe(false);
  });

  it("creates the same deterministic fallback as upstream offline mode", () => {
    expect(createOfflineDailySeed(new Date("2026-07-31T23:59:59Z"))).toBe(btoa("2026-07-31"));
  });
});
