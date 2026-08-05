import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  OFFICIAL_DAILY_ARCHIVE_SOURCE,
  OFFICIAL_DAILY_ARCHIVE_URL,
  validateDailyArchive,
} from "./daily-run-archive-core.mjs";
import { synchronizeDailyArchive } from "./sync-daily-seed-archive.mjs";

const valid = entries => ({
  schemaVersion: 1,
  latestDate: entries.map(entry => entry.date).sort().at(-1),
  earliestDate: entries.map(entry => entry.date).sort()[0],
  entryCount: entries.length,
  entries,
});

test("validates, computes metadata, and sorts newest first", () => {
  const archive = validateDailyArchive(
    valid([
      { date: "2026-07-08", format: "daily-config", seed: "event", dailyConfig: { biome: 1 } },
      { date: "2026-08-05", format: "seed", seed: "seed==" },
    ]),
  );
  assert.deepEqual(archive.entries.map(entry => entry.date), ["2026-08-05", "2026-07-08"]);
  assert.equal(archive.latestDate, "2026-08-05");
  assert.equal(archive.earliestDate, "2026-07-08");
  assert.equal(
    OFFICIAL_DAILY_ARCHIVE_URL,
    "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seeds.json",
  );
  assert.deepEqual(archive.source, OFFICIAL_DAILY_ARCHIVE_SOURCE);
});

test("rejects malformed roots, schemas, dates, duplicates, formats, and inconsistent counts", () => {
  assert.throws(() => validateDailyArchive("{"), /malformed JSON/);
  assert.throws(() => validateDailyArchive({ schemaVersion: 2, entries: [] }), /Unsupported/);
  assert.throws(
    () => validateDailyArchive(valid([{ date: "2026-02-30", format: "seed", seed: "x" }])),
    /calendar date/,
  );
  assert.throws(
    () =>
      validateDailyArchive({
        schemaVersion: 1,
        entries: [
          { date: "2026-08-05", format: "seed", seed: "x" },
          { date: "2026-08-05", format: "seed", seed: "y" },
        ],
      }),
    /duplicate/,
  );
  assert.throws(
    () => validateDailyArchive(valid([{ date: "2026-08-05", format: "unknown", seed: "x" }])),
    /unknown format/,
  );
  assert.throws(
    () => validateDailyArchive({ ...valid([{ date: "2026-08-05", format: "seed", seed: "x" }]), entryCount: 2 }),
    /entryCount/,
  );
});

test("preserves seed symbols and rejects conflicting special seeds", () => {
  const archive = validateDailyArchive(
    valid([{ date: "2026-08-05", format: "seed", seed: "k5exW8qrITeVWzIKS+3FFg==" }]),
  );
  assert.equal(archive.entries[0].seed, "k5exW8qrITeVWzIKS+3FFg==");
  assert.throws(
    () =>
      validateDailyArchive(
        valid([
          {
            date: "2026-07-08",
            format: "daily-config",
            seed: "outer",
            dailyConfig: { seed: "inner" },
          },
        ]),
      ),
    /conflicting/,
  );
});

test("invalid content cannot replace a previously valid file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "daily-archive-test-"));
  const file = path.join(directory, "archive.json");
  const initial = JSON.stringify(valid([{ date: "2026-08-05", format: "seed", seed: "good" }]));
  await writeFile(file, initial);
  assert.throws(() => validateDailyArchive("<html>bad gateway</html>"));
  assert.equal(await readFile(file, "utf8"), initial);
  await rm(directory, { recursive: true, force: true });
});

test("build synchronization packages a valid download", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "daily-sync-download-"));
  const fallbackPath = path.join(directory, "fallback.json");
  const outputPath = path.join(directory, "generated.json");
  const fallback = valid([{ date: "2026-08-04", format: "seed", seed: "old" }]);
  const fresh = valid([{ date: "2026-08-05", format: "seed", seed: "new" }]);
  await writeFile(fallbackPath, JSON.stringify(fallback));
  const result = await synchronizeDailyArchive({
    fallbackPath,
    outputPath,
    fetchImpl: async () => new Response(JSON.stringify(fresh), { headers: { "content-type": "application/json" } }),
  });
  assert.equal(result.source, "downloaded");
  assert.equal(validateDailyArchive(await readFile(outputPath, "utf8")).latestDate, "2026-08-05");
  await rm(directory, { recursive: true, force: true });
});

test("failed or invalid downloads preserve and package the checked-in snapshot", async () => {
  for (const responseFactory of [
    async () => {
      throw new Error("network unavailable");
    },
    async () => new Response("<html>gateway error</html>", { headers: { "content-type": "text/html" } }),
  ]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "daily-sync-fallback-"));
    const fallbackPath = path.join(directory, "fallback.json");
    const outputPath = path.join(directory, "generated.json");
    const fallback = valid([{ date: "2026-08-04", format: "seed", seed: "preserved" }]);
    await writeFile(fallbackPath, JSON.stringify(fallback));
    const result = await synchronizeDailyArchive({ fallbackPath, outputPath, fetchImpl: responseFactory });
    assert.equal(result.source, "checked-in");
    assert.equal(validateDailyArchive(await readFile(outputPath, "utf8")).entries[0].seed, "preserved");
    assert.equal(validateDailyArchive(await readFile(fallbackPath, "utf8")).entries[0].seed, "preserved");
    await rm(directory, { recursive: true, force: true });
  }
});
