import {
  DAILY_ARCHIVE_STORAGE_KEYS,
  getVisibleDatePageSize,
  loadOfficialDailyArchive,
  moveDateCursor,
  parseDailyArchive,
  serializeSpecialDailyEntry,
} from "#system/daily-run/daily-run-archive";
import {
  canonicalSeedFromText,
  createCustomTextSeed,
  createOfflineDailySeed,
  getUtcDateKey,
  normalizeAndValidateExactSeed,
} from "#system/daily-run/daily-run-seed-utils";
import {
  clearDailyRunMetadata,
  commitPendingDailyRunLaunch,
  getCurrentDailyRunMetadata,
  getPendingDailyRunLaunch,
  restoreDailyRunMetadata,
  setPendingDailyRunLaunch,
} from "#system/daily-run/daily-run-types";
import { afterEach, describe, expect, it, vi } from "vitest";

const sampleEntries = [
  { date: "2026-07-10", format: "seed", seed: "3rqGvBfbCXh8tIgmhUCSRA==" },
  {
    date: "2026-07-08",
    format: "daily-config",
    seed: "eeveepride26-10417",
    dailyConfig: {
      starters: [{ speciesId: 133, formIndex: 1, variant: 2, moveset: [735, 24, 343, 39], nature: 3 }],
      boss: { speciesId: 133, formIndex: 2, variant: 2, moveset: [741, 737, 740, 736], nature: 13, segments: 8 },
      biome: 1,
      luck: 14,
      startingMoney: 1330,
      forcedWaves: [{ waveIndex: 23, speciesId: 243 }],
      mysteryEncounters: [{ waveIndex: 13, type: 29 }],
      trainerManipulations: [{ waveIndex: 30, isTrainer: false }],
    },
  },
] as const;

function archive(entries: readonly unknown[] = sampleEntries): Record<string, unknown> {
  const dates = entries.map(entry => (entry as { date: string }).date).sort();
  return {
    schemaVersion: 1,
    latestDate: dates.at(-1),
    earliestDate: dates[0],
    entryCount: entries.length,
    entries,
  };
}

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

describe("Daily Run archive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__SILVERSHADOW_SWITCH_RUNTIME__;
  });

  it("parses schema 1, sorts newest first, and computes its real bounds", () => {
    const parsed = parseDailyArchive(archive([...sampleEntries].reverse()));
    expect(parsed.entries.map(entry => entry.date)).toEqual(["2026-07-10", "2026-07-08"]);
    expect(parsed.latestDate).toBe("2026-07-10");
    expect(parsed.earliestDate).toBe("2026-07-08");
    expect(parsed.entryCount).toBe(2);
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported schema", { ...archive(), schemaVersion: 2 }],
    ["invalid real date", archive([{ date: "2026-02-30", format: "seed", seed: "x" }])],
    [
      "duplicate date",
      { schemaVersion: 1, entries: [sampleEntries[0], { ...sampleEntries[0], seed: "different" }] },
    ],
    ["unknown format", archive([{ date: "2026-07-10", format: "other", seed: "x" }])],
    ["empty seed", archive([{ date: "2026-07-10", format: "seed", seed: "" }])],
    ["inconsistent count", { ...archive(), entryCount: 99 }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseDailyArchive(value)).toThrow();
  });

  it("preserves standard Base64 seed strings exactly", () => {
    expect(parseDailyArchive(archive()).entries[0].seed).toBe("3rqGvBfbCXh8tIgmhUCSRA==");
  });

  it("merges the outer seed into the complete July 8 special configuration", () => {
    const parsed = parseDailyArchive(archive());
    const special = parsed.entries[1];
    expect(special.format).toBe("daily-config");
    if (special.format !== "daily-config") {
      throw new Error("expected special entry");
    }
    const complete = JSON.parse(serializeSpecialDailyEntry(special));
    expect(complete.seed).toBe("eeveepride26-10417");
    expect(complete.starters[0]).toMatchObject({ speciesId: 133, formIndex: 1, variant: 2 });
    expect(complete.boss).toMatchObject({ speciesId: 133, formIndex: 2, segments: 8 });
    expect(complete.biome).toBe(1);
    expect(complete.forcedWaves).toEqual([{ waveIndex: 23, speciesId: 243 }]);
    expect(complete.mysteryEncounters).toEqual([{ waveIndex: 13, type: 29 }]);
    expect(complete.trainerManipulations).toEqual([{ waveIndex: 30, isTrainer: false }]);
  });

  it("rejects conflicting inner and outer special seeds", () => {
    expect(() =>
      parseDailyArchive(
        archive([
          {
            ...sampleEntries[1],
            dailyConfig: { ...sampleEntries[1].dailyConfig, seed: "different" },
          },
        ]),
      ),
    ).toThrow(/conflicting/);
  });

  it("keeps a valid cache when a remote response is invalid", async () => {
    const validCached = JSON.stringify({ downloadedAt: 1_700_000_000_000, archive: archive() });
    const storage = installStorage({ [DAILY_ARCHIVE_STORAGE_KEYS.current]: validCached });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>error</html>", { headers: { "content-type": "text/html" } })));
    await expect(loadOfficialDailyArchive()).resolves.toMatchObject({ source: "cached" });
    expect(storage.get(DAILY_ARCHIVE_STORAGE_KEYS.current)).toBe(validCached);
  });

  it("uses the embedded archive when no persistent cache exists", async () => {
    installStorage();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad"))
      .mockResolvedValueOnce(new Response(JSON.stringify(archive())));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadOfficialDailyArchive()).resolves.toMatchObject({ source: "built-in" });
  });

  it("never attempts the remote request on Switch", async () => {
    installStorage();
    (globalThis as Record<string, unknown>).__SILVERSHADOW_SWITCH_RUNTIME__ = true;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(archive())));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadOfficialDailyArchive()).resolves.toMatchObject({ source: "built-in" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/daily-seeds.json");
  });
});

describe("Daily Run date navigation", () => {
  it("moves Up and Down one item and clamps", () => {
    expect(moveDateCursor(3, -1, 1, 10)).toBe(2);
    expect(moveDateCursor(3, 1, 1, 10)).toBe(4);
    expect(moveDateCursor(0, -1, 1, 10)).toBe(0);
    expect(moveDateCursor(9, 1, 1, 10)).toBe(9);
  });

  it("moves exactly one currently visible page without skipping boundary entries", () => {
    expect(getVisibleDatePageSize(103, 8, 0)).toBe(7);
    expect(moveDateCursor(0, 1, 7, 103)).toBe(7);
    expect(getVisibleDatePageSize(103, 8, 2)).toBe(6);
    expect(moveDateCursor(7, 1, 6, 103)).toBe(13);
    expect(moveDateCursor(100, 1, 7, 103)).toBe(102);
  });
});

describe("Daily Run seed algorithms", () => {
  it("matches the SHA-256 first-16-bytes standard Base64 reference vector", () => {
    expect(canonicalSeedFromText("abc")).toBe("ungWv48Bz+pBQUDeXa4iIw==");
  });

  it("uses UTC dates and is deterministic across installations and timezones", () => {
    const instant = new Date("2026-08-05T00:30:00+09:00");
    expect(getUtcDateKey(instant)).toBe("2026-08-04");
    expect(createOfflineDailySeed(instant)).toBe(createOfflineDailySeed(new Date("2026-08-04T23:59:59Z")));
    expect(createOfflineDailySeed(new Date("2026-08-04T23:59:59Z"))).not.toBe(
      createOfflineDailySeed(new Date("2026-08-05T00:00:00Z")),
    );
  });

  it("distinguishes text, capitalization, punctuation, and internal spaces", () => {
    expect(createCustomTextSeed("ABCDEFG").canonicalSeed).not.toBe(createCustomTextSeed("ABCDEF").canonicalSeed);
    expect(createCustomTextSeed("SilverShadow").canonicalSeed).not.toBe(
      createCustomTextSeed("silvershadow").canonicalSeed,
    );
    expect(createCustomTextSeed("Philip's Run 123!").friendlyText).toBe("Philip's Run 123!");
    expect(createCustomTextSeed("  ABCDEFG  ")).toEqual(createCustomTextSeed("ABCDEFG"));
  });

  it("preserves exact canonical seeds including case and + / =", () => {
    const seed = "k5exW8qrITeVWzIKS+3F/g==";
    expect(normalizeAndValidateExactSeed(`  ${seed}  `)).toBe(seed);
    expect(() => normalizeAndValidateExactSeed(seed.toLowerCase())).not.toThrow();
    expect(() => normalizeAndValidateExactSeed("friendly text")).toThrow();
  });
});

describe("Daily Run pending launch and resume metadata", () => {
  afterEach(clearDailyRunMetadata);

  it("holds one generated seed unchanged through save-slot selection", () => {
    const request = {
      seedOrConfig: "k5exW8qrITeVWzIKS+3FFg==",
      metadata: { mode: "random" as const, canonicalSeed: "k5exW8qrITeVWzIKS+3FFg==" },
    };
    setPendingDailyRunLaunch(request);
    expect(getPendingDailyRunLaunch()).toEqual(request);
    expect(getPendingDailyRunLaunch()).toEqual(request);
    expect(commitPendingDailyRunLaunch()).toEqual(request);
    expect(getCurrentDailyRunMetadata()).toEqual(request.metadata);
  });

  it("restores historical metadata instead of regenerating from current time", () => {
    const metadata = {
      mode: "offline" as const,
      canonicalSeed: "old-seed",
      selectedDate: "2026-08-04",
      algorithmVersion: "SilverShadow-Daily-v1",
    };
    restoreDailyRunMetadata(metadata);
    expect(getCurrentDailyRunMetadata()).toEqual(metadata);
  });
});
