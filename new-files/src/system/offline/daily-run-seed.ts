const DAILY_SEED_FEED_URL =
  "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seed.json";

export const DAILY_SEED_STORAGE_KEYS = {
  date: "daily_seed_date",
  fetchedAt: "daily_seed_fetched_at",
  seed: "daily_seed",
} as const;

interface PublishedDailySeed {
  date: string;
  seed: string;
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

function readCurrentCachedSeed(date = new Date()): string | null {
  const snapshot = getDailySeedCacheSnapshot();
  return snapshot.date === getUtcDateKey(date) && snapshot.seed ? snapshot.seed : null;
}

function parsePublishedSeed(payload: string, expectedDate: string): string {
  let published: PublishedDailySeed;

  try {
    published = JSON.parse(payload) as PublishedDailySeed;
  } catch (error) {
    throw new Error("The daily seed feed returned invalid JSON.", { cause: error });
  }

  if (published.date !== expectedDate) {
    throw new Error(`The daily seed feed is for ${published.date || "an unknown date"}, not ${expectedDate}.`);
  }

  if (typeof published.seed !== "string" || published.seed.length === 0 || published.seed.length > 131_072) {
    throw new Error("The daily seed feed returned an invalid seed.");
  }

  return published.seed;
}

export async function refreshDailyRunSeed(date = new Date()): Promise<string> {
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

    const seed = parsePublishedSeed(await response.text(), expectedDate);
    localStorage.setItem(DAILY_SEED_STORAGE_KEYS.date, expectedDate);
    localStorage.setItem(DAILY_SEED_STORAGE_KEYS.seed, seed);
    localStorage.setItem(DAILY_SEED_STORAGE_KEYS.fetchedAt, Date.now().toString());
    return seed;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getDailyRunSeed(date = new Date()): Promise<string> {
  return readCurrentCachedSeed(date) ?? refreshDailyRunSeed(date);
}
