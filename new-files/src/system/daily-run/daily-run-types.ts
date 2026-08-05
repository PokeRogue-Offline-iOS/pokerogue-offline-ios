export type DailyRunLaunchMode = "official" | "offline" | "random" | "custom-exact" | "custom-text";

export type DailyRunArchiveSource = "downloaded" | "cached" | "built-in";

/** Extra provenance for a Daily Run. None of these fields participate in gameplay RNG. */
export interface DailyRunMetadata {
  mode: DailyRunLaunchMode;
  canonicalSeed: string;
  selectedDate?: string | undefined;
  friendlyTextSeed?: string | undefined;
  archiveSource?: DailyRunArchiveSource | undefined;
  algorithmVersion?: string | undefined;
  specialDailyConfig?: boolean | undefined;
  /** Complete custom Daily configuration, including its outer seed, for exact resume/replay provenance. */
  serializedDailyConfig?: string | undefined;
  archiveDownloadedAt?: number | undefined;
}

export interface DailyRunLaunchRequest {
  /** Standard canonical seed or complete serialized custom Daily configuration. */
  seedOrConfig: string;
  metadata: DailyRunMetadata;
}

let pendingDailyRunLaunch: DailyRunLaunchRequest | undefined;
let currentDailyRunMetadata: DailyRunMetadata | undefined;

function cloneMetadata(metadata: DailyRunMetadata): DailyRunMetadata {
  return { ...metadata };
}

export function setPendingDailyRunLaunch(request: DailyRunLaunchRequest): void {
  pendingDailyRunLaunch = {
    seedOrConfig: request.seedOrConfig,
    metadata: cloneMetadata(request.metadata),
  };
}

export function getPendingDailyRunLaunch(): DailyRunLaunchRequest | undefined {
  return pendingDailyRunLaunch == null
    ? undefined
    : { seedOrConfig: pendingDailyRunLaunch.seedOrConfig, metadata: cloneMetadata(pendingDailyRunLaunch.metadata) };
}

export function clearPendingDailyRunLaunch(): void {
  pendingDailyRunLaunch = undefined;
}

export function commitPendingDailyRunLaunch(): DailyRunLaunchRequest | undefined {
  const request = getPendingDailyRunLaunch();
  if (request) {
    currentDailyRunMetadata = cloneMetadata(request.metadata);
  }
  pendingDailyRunLaunch = undefined;
  return request;
}

export function getCurrentDailyRunMetadata(): DailyRunMetadata | undefined {
  return currentDailyRunMetadata == null ? undefined : cloneMetadata(currentDailyRunMetadata);
}

export function restoreDailyRunMetadata(metadata?: DailyRunMetadata): void {
  pendingDailyRunLaunch = undefined;
  currentDailyRunMetadata = metadata == null ? undefined : cloneMetadata(metadata);
}

export function clearDailyRunMetadata(): void {
  pendingDailyRunLaunch = undefined;
  currentDailyRunMetadata = undefined;
}
