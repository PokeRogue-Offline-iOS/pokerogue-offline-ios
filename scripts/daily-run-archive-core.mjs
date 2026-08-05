export const OFFICIAL_DAILY_ARCHIVE_URL =
  "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seeds.json";
export const SUPPORTED_SCHEMA_VERSION = 1;
export const OFFICIAL_DAILY_ARCHIVE_SOURCE = Object.freeze({
  repository: "silvershadowkat/pokerogue-offline",
  branch: "seed",
  path: "docs/daily-seeds.json",
});

const isRecord = value => typeof value === "object" && value !== null && !Array.isArray(value);

function isRealIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDailyArchive(payload) {
  let root = payload;
  if (typeof payload === "string") {
    try {
      root = JSON.parse(payload);
    } catch (error) {
      throw new Error("Daily archive contains malformed JSON.", { cause: error });
    }
  }
  if (!isRecord(root)) {
    throw new Error("Daily archive root must be an object.");
  }
  if (root.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`Unsupported Daily archive schema version: ${String(root.schemaVersion)}.`);
  }
  if (!Array.isArray(root.entries)) {
    throw new Error("Daily archive entries must be an array.");
  }
  const dates = new Set();
  const entries = root.entries.map((entry, index) => {
    if (!isRecord(entry) || !isRealIsoDate(entry.date)) {
      throw new Error(`Daily archive entry ${index + 1} has an invalid calendar date.`);
    }
    if (dates.has(entry.date)) {
      throw new Error(`Daily archive contains duplicate date ${entry.date}.`);
    }
    dates.add(entry.date);
    if (entry.format !== "seed" && entry.format !== "daily-config") {
      throw new Error(`Daily archive entry ${entry.date} uses an unknown format.`);
    }
    if (typeof entry.seed !== "string" || !entry.seed.trim() || entry.seed.length > 131_072) {
      throw new Error(`Daily archive entry ${entry.date} has an invalid seed.`);
    }
    const validated = { ...entry, seed: entry.seed.trim() };
    if (entry.format === "daily-config") {
      if (!isRecord(entry.dailyConfig)) {
        throw new Error(`Special Daily archive entry ${entry.date} has no dailyConfig object.`);
      }
      if (entry.dailyConfig.seed !== undefined && entry.dailyConfig.seed !== validated.seed) {
        throw new Error(`Special Daily archive entry ${entry.date} has conflicting inner and outer seeds.`);
      }
      validated.dailyConfig = { ...entry.dailyConfig };
    }
    return validated;
  });
  if (entries.length === 0) {
    throw new Error("Daily archive has no valid entries.");
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  const latestDate = entries[0].date;
  const earliestDate = entries.at(-1).date;
  const entryCount = entries.length;
  if (root.latestDate !== undefined && root.latestDate !== latestDate) {
    throw new Error(`Daily archive latestDate is inconsistent; actual latest date is ${latestDate}.`);
  }
  if (root.earliestDate !== undefined && root.earliestDate !== earliestDate) {
    throw new Error(`Daily archive earliestDate is inconsistent; actual earliest date is ${earliestDate}.`);
  }
  if (root.entryCount !== undefined && root.entryCount !== entryCount) {
    throw new Error(`Daily archive entryCount is inconsistent; actual count is ${entryCount}.`);
  }
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    latestDate,
    earliestDate,
    entryCount,
    // The published archive historically carried a stale path in this optional
    // object. The URL above is authoritative, so packaged provenance is always
    // normalized to the branch and path actually fetched.
    source: { ...OFFICIAL_DAILY_ARCHIVE_SOURCE },
    entries,
  };
}

export function serializeDailyArchive(archive) {
  return `${JSON.stringify(validateDailyArchive(archive), null, 2)}\n`;
}
