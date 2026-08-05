import type { DailyRunArchiveSource } from "./daily-run-types";

export const OFFICIAL_DAILY_ARCHIVE_URL =
  "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seeds.json";
export const EMBEDDED_DAILY_ARCHIVE_URL = "/daily-seeds.json";
export const SUPPORTED_DAILY_ARCHIVE_SCHEMA_VERSION = 1;

export const DAILY_ARCHIVE_STORAGE_KEYS = {
  current: "silvershadow_daily_archive_v1",
  temporary: "silvershadow_daily_archive_v1_tmp",
} as const;

interface ArchiveEntryBase {
  date: string;
  seed: string;
}

export interface StandardDailyArchiveEntry extends ArchiveEntryBase {
  format: "seed";
}

export interface SpecialDailyArchiveEntry extends ArchiveEntryBase {
  format: "daily-config";
  dailyConfig: Record<string, unknown>;
}

export type DailyArchiveEntry = StandardDailyArchiveEntry | SpecialDailyArchiveEntry;

export interface ValidatedDailyArchive {
  schemaVersion: 1;
  entries: DailyArchiveEntry[];
  latestDate: string;
  earliestDate: string;
  entryCount: number;
  source?: Record<string, unknown> | undefined;
}

export interface LoadedDailyArchive {
  archive: ValidatedDailyArchive;
  source: DailyRunArchiveSource;
  downloadedAt?: number | undefined;
  notice: string;
}

interface CachedDailyArchive {
  downloadedAt: number;
  archive: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateSeed(value: unknown, date: string): string {
  if (typeof value !== "string") {
    throw new Error(`Daily archive entry ${date} has no seed.`);
  }
  const seed = value.trim();
  if (!seed || seed.length > 131_072) {
    throw new Error(`Daily archive entry ${date} has an invalid seed.`);
  }
  return seed;
}

function validateEntry(value: unknown, index: number): DailyArchiveEntry {
  if (!isRecord(value)) {
    throw new Error(`Daily archive entry ${index + 1} is not an object.`);
  }
  if (!isRealIsoDate(value.date)) {
    throw new Error(`Daily archive entry ${index + 1} has an invalid calendar date.`);
  }
  const date = value.date;
  const seed = validateSeed(value.seed, date);
  if (value.format === "seed") {
    return { date, format: "seed", seed };
  }
  if (value.format !== "daily-config") {
    throw new Error(`Daily archive entry ${date} uses an unknown format.`);
  }
  if (!isRecord(value.dailyConfig)) {
    throw new Error(`Special Daily archive entry ${date} has no dailyConfig object.`);
  }
  if (value.dailyConfig.seed !== undefined && value.dailyConfig.seed !== seed) {
    throw new Error(`Special Daily archive entry ${date} has conflicting inner and outer seeds.`);
  }
  return { date, format: "daily-config", seed, dailyConfig: { ...value.dailyConfig } };
}

export function parseDailyArchive(payload: string | unknown): ValidatedDailyArchive {
  let root: unknown = payload;
  if (typeof payload === "string") {
    try {
      root = JSON.parse(payload);
    } catch (error) {
      throw new Error("The official Daily archive contains malformed JSON.", { cause: error });
    }
  }
  if (!isRecord(root)) {
    throw new Error("The official Daily archive root is not an object.");
  }
  if (root.schemaVersion !== SUPPORTED_DAILY_ARCHIVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported Daily archive schema version: ${String(root.schemaVersion)}.`);
  }
  if (!Array.isArray(root.entries)) {
    throw new Error("The official Daily archive entries field is not an array.");
  }
  const entries = root.entries.map(validateEntry);
  if (entries.length === 0) {
    throw new Error("The official Daily archive has no valid entries.");
  }
  const dates = new Set<string>();
  for (const entry of entries) {
    if (dates.has(entry.date)) {
      throw new Error(`The official Daily archive contains duplicate date ${entry.date}.`);
    }
    dates.add(entry.date);
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  const latestDate = entries[0].date;
  const earliestDate = entries[entries.length - 1].date;
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
    schemaVersion: 1,
    entries,
    latestDate,
    earliestDate,
    entryCount,
    source: isRecord(root.source) ? { ...root.source } : undefined,
  };
}

export function serializeSpecialDailyEntry(entry: SpecialDailyArchiveEntry): string {
  const innerSeed = entry.dailyConfig.seed;
  if (innerSeed !== undefined && innerSeed !== entry.seed) {
    throw new Error(`Special Daily archive entry ${entry.date} has conflicting inner and outer seeds.`);
  }
  return JSON.stringify({ ...entry.dailyConfig, seed: entry.seed });
}

function parseCachedArchive(raw: string | null): { archive: ValidatedDailyArchive; downloadedAt: number } | undefined {
  if (!raw) {
    return;
  }
  try {
    const cached = JSON.parse(raw) as CachedDailyArchive;
    if (!Number.isFinite(cached.downloadedAt) || cached.downloadedAt <= 0) {
      throw new Error("Cached Daily archive has an invalid download time.");
    }
    return { archive: parseDailyArchive(cached.archive), downloadedAt: cached.downloadedAt };
  } catch (error) {
    console.warn("Ignoring invalid persistent Daily archive cache.", error);
    return;
  }
}

export function readCachedDailyArchive(): { archive: ValidatedDailyArchive; downloadedAt: number } | undefined {
  return parseCachedArchive(localStorage.getItem(DAILY_ARCHIVE_STORAGE_KEYS.current));
}

/** localStorage writes are atomic; the validated temporary key prevents replacing a good cache with a bad value. */
export function writeCachedDailyArchive(archive: ValidatedDailyArchive, downloadedAt = Date.now()): void {
  const serialized = JSON.stringify({ downloadedAt, archive } satisfies CachedDailyArchive);
  localStorage.setItem(DAILY_ARCHIVE_STORAGE_KEYS.temporary, serialized);
  const verified = parseCachedArchive(localStorage.getItem(DAILY_ARCHIVE_STORAGE_KEYS.temporary));
  if (!verified) {
    localStorage.removeItem(DAILY_ARCHIVE_STORAGE_KEYS.temporary);
    throw new Error("The downloaded Daily archive could not be safely cached.");
  }
  localStorage.setItem(DAILY_ARCHIVE_STORAGE_KEYS.current, serialized);
  localStorage.removeItem(DAILY_ARCHIVE_STORAGE_KEYS.temporary);
}

async function fetchArchive(url: string, timeoutMs: number): Promise<ValidatedDailyArchive> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const separator = url.includes("?") ? "&" : "?";
    const requestUrl = url.startsWith("http") ? `${url}${separator}t=${Date.now()}` : url;
    const response = await fetch(requestUrl, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Daily archive request failed with HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (contentType.includes("text/html") || /^\s*<!doctype html/i.test(text)) {
      throw new Error("Daily archive request returned HTML instead of JSON.");
    }
    return parseDailyArchive(text);
  } finally {
    clearTimeout(timeout);
  }
}

export function isSwitchRuntime(): boolean {
  return (globalThis as Record<string, unknown>).__SILVERSHADOW_SWITCH_RUNTIME__ === true;
}

export async function loadOfficialDailyArchive(): Promise<LoadedDailyArchive> {
  let remoteError: unknown;
  if (!isSwitchRuntime()) {
    try {
      const archive = await fetchArchive(OFFICIAL_DAILY_ARCHIVE_URL, 10_000);
      const downloadedAt = Date.now();
      writeCachedDailyArchive(archive, downloadedAt);
      return {
        archive,
        source: "downloaded",
        downloadedAt,
        notice: `Downloaded the latest official seed archive. Latest available date: ${archive.latestDate}.`,
      };
    } catch (error) {
      remoteError = error;
      console.warn("Could not download the official Daily archive.", error);
    }
  }

  const cached = readCachedDailyArchive();
  if (cached) {
    return {
      archive: cached.archive,
      source: "cached",
      downloadedAt: cached.downloadedAt,
      notice: `Could not download the latest official seed archive. Loading the cached archive downloaded on ${new Date(cached.downloadedAt).toLocaleString()}. Latest available date: ${cached.archive.latestDate}.`,
    };
  }

  try {
    const archive = await fetchArchive(EMBEDDED_DAILY_ARCHIVE_URL, 10_000);
    return {
      archive,
      source: "built-in",
      notice: isSwitchRuntime()
        ? `Network access is unavailable in this build. Loading the built-in official seed archive. Latest available date: ${archive.latestDate}.`
        : `Could not download the latest official seed archive. Loading the built-in archive included with this build. Latest available date: ${archive.latestDate}.`,
    };
  } catch (embeddedError) {
    console.error("Failed to load every official Daily archive source.", { remoteError, embeddedError });
    throw new Error("No valid downloaded, cached, or built-in official Daily archive is available.");
  }
}

export function getVisibleDatePageSize(totalEntries: number, maxRows: number, scrollStart: number): number {
  if (totalEntries <= maxRows) {
    return totalEntries;
  }
  const hasUp = scrollStart > 0;
  const provisional = maxRows - (hasUp ? 1 : 0);
  const hasDown = scrollStart + provisional < totalEntries;
  return Math.max(1, maxRows - (hasUp ? 1 : 0) - (hasDown ? 1 : 0));
}

export function moveDateCursor(current: number, direction: -1 | 1, visiblePageSize: number, count: number): number {
  return Math.max(0, Math.min(count - 1, current + direction * visiblePageSize));
}
