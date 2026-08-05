import { version } from "#package.json";

const OFFICIAL_DAILY_SEED_URL = "https://api.pokerogue.net/daily/seed";
const DAILY_SEED_FEED_URL =
  "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seed.json";

export const DAILY_SEED_STORAGE_KEYS = {
  date: "daily_seed_date",
  fetchedAt: "daily_seed_fetched_at",
  seed: "daily_seed",
  source: "daily_seed_source",
} as const;

interface PublishedDailySeed {
  date: string;
  seed: string;
  source?: "pokerogue-api" | "offline-fallback";
}

interface ParsedDailySeed {
  cacheable: boolean;
  seed: string;
  source: "official-feed" | "published-fallback";
}

export type DailyRunSeedSource =
  | "official-api"
  | "official-feed"
  | "official-cache"
  | "published-fallback"
  | "generated-offline";

export interface DailyRunSeedResult {
  seed: string;
  source: DailyRunSeedSource;
}

export interface DailySeedCacheSnapshot {
  date: string | null;
  fetchedAt: number | null;
  seed: string | null;
}

export function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function createOfflineDailySeed(date = new Date()): string {
  return btoa(getUtcDateKey(date));
}

export function getDailySeedCacheSnapshot(): DailySeedCacheSnapshot {
  const fetchedAtRaw = localStorage.getItem(DAILY_SEED_STORAGE_KEYS.fetchedAt);
  const fetchedAt = fetchedAtRaw == null ? Number.NaN : Number(fetchedAtRaw);

  return {
    date: localStorage.getItem(DAILY_SEED_STORAGE_KEYS.date),
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
    seed: localStorage.getItem(DAILY_SEED_STORAGE_KEYS.seed),
  };
}

function readCurrentCachedSeed(date = new Date()): DailyRunSeedResult | null {
  const snapshot = getDailySeedCacheSnapshot();
  return snapshot.date === getUtcDateKey(date) && snapshot.seed
    ? { seed: snapshot.seed, source: "official-cache" }
    : null;
}

function cacheOfficialSeed(seed: string, expectedDate: string): void {
  localStorage.setItem(DAILY_SEED_STORAGE_KEYS.date, expectedDate);
  localStorage.setItem(DAILY_SEED_STORAGE_KEYS.seed, seed);
  localStorage.setItem(DAILY_SEED_STORAGE_KEYS.fetchedAt, Date.now().toString());
  localStorage.setItem(DAILY_SEED_STORAGE_KEYS.source, "official");
}

function validateSeed(seed: string, label: string): string {
  const normalized = seed.replace(/[\r\n]/g, "");
  if (!normalized || normalized.length > 131_072 || !/^[A-Za-z0-9+/=_-]+$/.test(normalized)) {
    throw new Error(`${label} returned an invalid seed.`);
  }
  return normalized;
}

function parsePublishedSeed(payload: string, expectedDate: string): ParsedDailySeed {
  let published: PublishedDailySeed;

  try {
    published = JSON.parse(payload) as PublishedDailySeed;
  } catch (error) {
    throw new Error("The daily seed feed returned invalid JSON.", {
      cause: error,
    });
  }

  if (published.date !== expectedDate) {
    throw new Error(`The daily seed feed is for ${published.date || "an unknown date"}, not ${expectedDate}.`);
  }

  if (typeof published.seed !== "string" || published.seed.length === 0 || published.seed.length > 131_072) {
    throw new Error("The daily seed feed returned an invalid seed.");
  }

  if (
    published.source !== undefined
    && published.source !== "pokerogue-api"
    && published.source !== "offline-fallback"
  ) {
    throw new Error("The daily seed feed returned an invalid source.");
  }

  return {
    cacheable: published.source !== "offline-fallback",
    seed: published.seed,
    source: published.source === "offline-fallback" ? "published-fallback" : "official-feed",
  };
}

export async function fetchOfficialDailyRunSeed(date = new Date()): Promise<DailyRunSeedResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4_000);

  try {
    const response = await fetch(OFFICIAL_DAILY_SEED_URL, {
      cache: "no-store",
      headers: {
        Authorization: "",
        "Content-Type": "application/json",
        "PKR-Client-Version": version,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Official daily seed request failed with HTTP ${response.status}.`);
    }
    const seed = validateSeed(await response.text(), "The official Daily Run API");
    cacheOfficialSeed(seed, getUtcDateKey(date));
    return { seed, source: "official-api" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function refreshDailyRunSeed(date = new Date()): Promise<DailyRunSeedResult> {
  const expectedDate = getUtcDateKey(date);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(DAILY_SEED_FEED_URL, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Daily seed request failed with HTTP ${response.status}.`);
    }

    const published = parsePublishedSeed(await response.text(), expectedDate);
    if (published.cacheable) {
      cacheOfficialSeed(published.seed, expectedDate);
    }
    return { seed: published.seed, source: published.source };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getDailyRunSeed(date = new Date()): Promise<DailyRunSeedResult> {
  const cached = readCurrentCachedSeed(date);
  if (cached) {
    return cached;
  }

  try {
    return await fetchOfficialDailyRunSeed(date);
  } catch (error) {
    console.warn("Direct official Daily Run seed request unavailable; trying the published feed.", error);
    return refreshDailyRunSeed(date);
  }
}

export function createGeneratedOfflineDailySeed(date = new Date()): DailyRunSeedResult {
  return { seed: createOfflineDailySeed(date), source: "generated-offline" };
}

export function getDailyRunSeedStatusText(source: DailyRunSeedSource): string {
  switch (source) {
    case "official-api":
      return "Official Daily Run seed loaded directly.";
    case "official-feed":
      return "Official Daily Run seed loaded.";
    case "official-cache":
      return "Official Daily Run seed loaded from today's cache.";
    case "published-fallback":
      return "Official seed unavailable.\nUsing the published offline fallback.";
    case "generated-offline":
      return "Seed feed unavailable.\nGenerated today's offline seed.";
  }
}
