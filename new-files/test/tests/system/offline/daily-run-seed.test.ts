import {
  createOfflineDailySeed,
  DAILY_SEED_STORAGE_KEYS,
  fetchOfficialDailyRunSeed,
  getDailyRunSeed,
  getDailyRunSeedStatusText,
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

    await expect(getDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).resolves.toEqual({
      seed: "cached-seed",
      source: "official-cache",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates and caches this fork's dated seed feed", async () => {
    const storage = installStorage();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ date: "2026-07-31", seed: "official-seed" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).resolves.toEqual({
      seed: "official-seed",
      source: "official-feed",
    });
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

  it("uses a published offline fallback without caching it as authoritative", async () => {
    const storage = installStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              date: "2026-07-31",
              seed: "fallback-seed",
              source: "offline-fallback",
            }),
          ),
      ),
    );

    await expect(refreshDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).resolves.toEqual({
      seed: "fallback-seed",
      source: "published-fallback",
    });
    expect(storage.has(DAILY_SEED_STORAGE_KEYS.seed)).toBe(false);
    expect(storage.has(DAILY_SEED_STORAGE_KEYS.fetchedAt)).toBe(false);
  });

  it("rejects an unknown publisher source", async () => {
    installStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ date: "2026-07-31", seed: "seed", source: "unknown" }))),
    );

    await expect(refreshDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).rejects.toThrow("invalid source");
  });

  it("creates the same deterministic fallback as upstream offline mode", () => {
    expect(createOfflineDailySeed(new Date("2026-07-31T23:59:59Z"))).toBe(btoa("2026-07-31"));
  });

  it("can use the official API directly and records its source", async () => {
    const storage = installStorage();
    const fetchMock = vi.fn(async () => new Response("official-direct-seed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOfficialDailyRunSeed(new Date("2026-07-31T12:00:00Z"))).resolves.toEqual({
      seed: "official-direct-seed",
      source: "official-api",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pokerogue.net/daily/seed",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "", "PKR-Client-Version": expect.any(String) }),
      }),
    );
    expect(storage.get(DAILY_SEED_STORAGE_KEYS.seed)).toBe("official-direct-seed");
  });

  it("reports the exact official, published fallback, and locally generated outcomes", () => {
    expect(getDailyRunSeedStatusText("official-api")).toContain("Official Daily Run seed loaded directly");
    expect(getDailyRunSeedStatusText("published-fallback")).toContain("published offline fallback");
    expect(getDailyRunSeedStatusText("generated-offline")).toContain("Generated today's offline seed");
  });
});
