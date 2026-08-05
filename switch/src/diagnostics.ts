import { appendLog } from "./logger";

const HEARTBEAT_INTERVAL_MS = 30_000;
const FLIGHT_RECORDER_INTERVAL_MS = 10_000;
const FRAME_WATCHDOG_INTERVAL_MS = 2_000;
const FRAME_STALL_THRESHOLD_MS = 4_000;
const EVENT_LOOP_STALL_THRESHOLD_MS = 4_000;
const MAINTENANCE_INTERVAL_MS = 45_000;
const MAINTENANCE_COOLDOWN_MS = 15_000;
const MIB = 1024 * 1024;
const MEMORY_PRESSURE_THRESHOLDS = Object.freeze({
  externalBytes: 320 * MIB,
  heapUsedBytes: 256 * MIB,
  nativeFreeBytes: 768 * MIB,
  nativeUsedBytes: 2_450 * MIB,
});
const MAX_LOADER_SAMPLES = 8;
const MAX_MISSING_TEXTURES = 20;
const MAX_PHASE_HISTORY = 24;
const MAX_AUDIO_LOG_SAMPLES = 32;
const MAX_AUDIO_RECENT_EVENTS = 32;
const MAX_AUDIO_CACHE_SAMPLES = 12;
const IMAGE_FILE_TYPES = new Set(["atlasimage", "image", "spritesheet", "svg"]);
const CRITICAL_PHASES = new Set([
  "AttemptCapturePhase",
  "BattleEndPhase",
  "ModifierRewardPhase",
  "NewBattlePhase",
  "NewBiomeEncounterPhase",
  "PartyHealPhase",
  "SelectBiomePhase",
  "SelectModifierPhase",
  "SwitchBiomePhase",
  "VictoryPhase",
]);

interface MemoryValues {
  totalHeapSize: number;
  totalHeapSizeExecutable: number;
  totalPhysicalSize: number;
  totalAvailableSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  mallocedMemory: number;
  peakMallocedMemory: number;
  numberOfNativeContexts: number;
  numberOfDetachedContexts: number;
  externalMemory: number;
  nativeHeapTotal: number;
  nativeHeapArena: number;
  nativeHeapUsed: number;
  nativeHeapFree: number;
}

interface LoaderBatch {
  id: number;
  scene: string;
  startedAt: number;
  expected: number;
  completedByType: Record<string, number>;
  firstCompleted: string[];
  lastCompleted: string[];
  textureKeys: Set<string>;
  failures: number;
  releasedResponseBytes: number;
  releasedResponses: number;
}

interface RuntimeCounters {
  stepCount: number;
  renderCount: number;
  lastStepAt: number | null;
  lastRenderAt: number | null;
}

interface FrameWindow {
  maxRenderGapMs: number;
  maxStepGapMs: number;
  renderGapsOver100Ms: number;
  renderGapsOver250Ms: number;
  stepGapsOver100Ms: number;
  stepGapsOver250Ms: number;
}

interface PhaseEvent {
  event: "start" | "end";
  name: string;
  at: number;
  detail: unknown;
}

interface AudioEvent {
  event: string;
  at: number;
  detail: unknown;
}

let previousMemory: MemoryValues | null = null;
let loaderBatchSequence = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let flightRecorderTimer: ReturnType<typeof setInterval> | null = null;
let frameWatchdogTimer: ReturnType<typeof setInterval> | null = null;
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;
let pendingMaintenanceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMaintenanceRequest: { reason: string; detail: unknown; force: boolean } | null = null;
let lastMaintenanceAt = 0;
let maintenanceSequence = 0;
let expectedWatchdogAt = 0;
let frameStallActive = false;
let frameStallDetectedAt = 0;
let frameWindow: FrameWindow = createFrameWindow();
let lastHeartbeatCounters: RuntimeCounters = {
  stepCount: 0,
  renderCount: 0,
  lastStepAt: null,
  lastRenderAt: null,
};
let lastFlightRecorderCounters: RuntimeCounters = {
  stepCount: 0,
  renderCount: 0,
  lastStepAt: null,
  lastRenderAt: null,
};
let counters: RuntimeCounters = {
  stepCount: 0,
  renderCount: 0,
  lastStepAt: null,
  lastRenderAt: null,
};
let lastGameCheckpoint: { name: string; detail: unknown; at: number } | null = null;
let phaseHistory: PhaseEvent[] = [];
let gameStateProvider: (() => unknown) | null = null;
let webGlContext: any = null;
let audioCapabilities: unknown = "game-unavailable";
let audioContextState: unknown = "context-unavailable";
let audioLoggedSamples = 0;
let audioSuppressedSamples = 0;
let audioEventCounts: Record<string, number> = {};
let audioRecentEvents: AudioEvent[] = [];
const decodedAudioBuffers = new Map<
  string,
  {
    bytes: number | null;
    channels: number | null;
    durationSeconds: number | null;
    sampleRate: number | null;
  }
>();

function createFrameWindow(): FrameWindow {
  return {
    maxRenderGapMs: 0,
    maxStepGapMs: 0,
    renderGapsOver100Ms: 0,
    renderGapsOver250Ms: 0,
    stepGapsOver100Ms: 0,
    stepGapsOver250Ms: 0,
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function bytesToMiB(value: number): number {
  return round(value / (1024 * 1024));
}

function percentage(used: number, total: number): number | null {
  return total > 0 ? round((used / total) * 100) : null;
}

function normalizeMemoryUsage(value: ReturnType<typeof Switch.memoryUsage>): MemoryValues {
  return {
    totalHeapSize: value.totalHeapSize,
    totalHeapSizeExecutable: value.totalHeapSizeExecutable,
    totalPhysicalSize: value.totalPhysicalSize,
    totalAvailableSize: value.totalAvailableSize,
    usedHeapSize: value.usedHeapSize,
    heapSizeLimit: value.heapSizeLimit,
    mallocedMemory: value.mallocedMemory,
    peakMallocedMemory: value.peakMallocedMemory,
    numberOfNativeContexts: value.numberOfNativeContexts,
    numberOfDetachedContexts: value.numberOfDetachedContexts,
    externalMemory: value.externalMemory,
    nativeHeapTotal: value.nativeHeapTotal,
    nativeHeapArena: value.nativeHeapArena,
    nativeHeapUsed: value.nativeHeapUsed,
    nativeHeapFree: value.nativeHeapFree,
  };
}

function memoryDelta(current: MemoryValues): Record<string, number> | null {
  if (!previousMemory) {
    return null;
  }
  return {
    usedHeapMiB: bytesToMiB(current.usedHeapSize - previousMemory.usedHeapSize),
    externalMiB: bytesToMiB(current.externalMemory - previousMemory.externalMemory),
    nativeUsedMiB: bytesToMiB(current.nativeHeapUsed - previousMemory.nativeHeapUsed),
    nativeFreeMiB: bytesToMiB(current.nativeHeapFree - previousMemory.nativeHeapFree),
    detachedContexts: current.numberOfDetachedContexts - previousMemory.numberOfDetachedContexts,
  };
}

export function readMemorySnapshot(): unknown {
  try {
    const current = normalizeMemoryUsage(Switch.memoryUsage());
    const snapshot = {
      bytes: current,
      mib: {
        heapUsed: bytesToMiB(current.usedHeapSize),
        heapTotal: bytesToMiB(current.totalHeapSize),
        heapLimit: bytesToMiB(current.heapSizeLimit),
        heapAvailable: bytesToMiB(current.totalAvailableSize),
        physical: bytesToMiB(current.totalPhysicalSize),
        external: bytesToMiB(current.externalMemory),
        malloced: bytesToMiB(current.mallocedMemory),
        peakMalloced: bytesToMiB(current.peakMallocedMemory),
        nativeTotal: bytesToMiB(current.nativeHeapTotal),
        nativeArena: bytesToMiB(current.nativeHeapArena),
        nativeUsed: bytesToMiB(current.nativeHeapUsed),
        nativeFree: bytesToMiB(current.nativeHeapFree),
      },
      pressure: {
        heapUsedPercentOfLimit: percentage(current.usedHeapSize, current.heapSizeLimit),
        nativeUsedPercentOfTotal: percentage(current.nativeHeapUsed, current.nativeHeapTotal),
        nativeArenaUsedPercent: percentage(current.nativeHeapUsed, current.nativeHeapArena),
      },
      contexts: {
        native: current.numberOfNativeContexts,
        detached: current.numberOfDetachedContexts,
      },
      deltaSincePrevious: memoryDelta(current),
    };
    previousMemory = current;
    return snapshot;
  } catch (error) {
    return {
      unavailable: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function captureMemorySnapshot(reason: string, detail?: unknown): void {
  appendLog("INFO", "Memory snapshot", {
    reason,
    detail: detail ?? null,
    memory: readMemorySnapshot(),
  });
}

function readWebGlHealth(includeError = false): unknown {
  if (!webGlContext) {
    return {
      acquired: Boolean((globalThis as any).__SILVERSHADOW_SCREEN_CONTEXT_ACQUIRED__),
      available: false,
    };
  }

  try {
    return {
      acquired: true,
      available: true,
      contextLost:
        typeof webGlContext.isContextLost === "function"
          ? Boolean(webGlContext.isContextLost())
          : "unsupported",
      drawingBufferWidth: Number(webGlContext.drawingBufferWidth) || null,
      drawingBufferHeight: Number(webGlContext.drawingBufferHeight) || null,
      error: includeError && typeof webGlContext.getError === "function"
        ? Number(webGlContext.getError())
        : "not-sampled",
    };
  } catch (error) {
    return {
      acquired: true,
      available: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeAudioBuffer(buffer: any): {
  bytes: number | null;
  channels: number | null;
  durationSeconds: number | null;
  sampleRate: number | null;
} {
  const channels = Number(buffer?.numberOfChannels);
  const frames = Number(buffer?.length);
  const sampleRate = Number(buffer?.sampleRate);
  const durationSeconds = Number(buffer?.duration);
  return {
    bytes:
      Number.isFinite(channels) && Number.isFinite(frames)
        ? channels * frames * 4
        : null,
    channels: Number.isFinite(channels) ? channels : null,
    durationSeconds: Number.isFinite(durationSeconds) ? round(durationSeconds, 3) : null,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : null,
  };
}

function audio(event: string, detail?: unknown, important = false): void {
  audioEventCounts[event] = (audioEventCounts[event] ?? 0) + 1;
  const audioEvent: AudioEvent = {
    event,
    at: Date.now(),
    detail: detail ?? null,
  };
  audioRecentEvents.push(audioEvent);
  if (audioRecentEvents.length > MAX_AUDIO_RECENT_EVENTS) {
    audioRecentEvents.shift();
  }

  if (important || audioLoggedSamples < MAX_AUDIO_LOG_SAMPLES) {
    if (!important) {
      audioLoggedSamples++;
    }
    appendLog(
      event.includes("fail") || event.includes("error") || event.includes("timeout")
        ? "ERROR"
        : "INFO",
      "Audio diagnostic",
      audioEvent,
    );
  } else {
    audioSuppressedSamples++;
  }
}

function readAudioSnapshot(): unknown {
  const buffers = [...decodedAudioBuffers.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => (right.bytes ?? 0) - (left.bytes ?? 0));
  const totalEstimatedBytes = buffers.reduce((sum, buffer) => sum + (buffer.bytes ?? 0), 0);
  return {
    capabilities: audioCapabilities,
    context: audioContextState,
    events: {
      counts: audioEventCounts,
      loggedSamples: audioLoggedSamples,
      suppressedSamples: audioSuppressedSamples,
      recent: audioRecentEvents,
    },
    decodedCache: {
      entries: buffers.length,
      totalEstimatedBytes,
      totalEstimatedMiB: bytesToMiB(totalEstimatedBytes),
      largest: buffers.slice(0, MAX_AUDIO_CACHE_SAMPLES),
      largestTruncated: buffers.length > MAX_AUDIO_CACHE_SAMPLES,
    },
  };
}

function instrumentSound(sound: any, key: string): void {
  if (!sound || sound.__silverShadowAudioDiagnosticsInstalled) {
    return;
  }
  sound.__silverShadowAudioDiagnosticsInstalled = true;
  const detail = () => ({
    key,
    durationSeconds: Number.isFinite(Number(sound.duration)) ? round(Number(sound.duration), 3) : null,
    loop: Boolean(sound.loop),
    mute: Boolean(sound.mute),
    rate: Number.isFinite(Number(sound.rate)) ? Number(sound.rate) : null,
    seekSeconds: Number.isFinite(Number(sound.seek)) ? round(Number(sound.seek), 3) : null,
    volume: Number.isFinite(Number(sound.volume)) ? Number(sound.volume) : null,
  });
  for (const event of ["play", "pause", "resume", "stop", "complete", "looped", "destroy"]) {
    sound.on?.(event, () => audio(`sound-${event}`, detail()));
  }
}

function instrumentSoundManager(game: any): void {
  const manager = game?.sound;
  if (!manager || manager.__silverShadowAudioDiagnosticsInstalled) {
    return;
  }
  manager.__silverShadowAudioDiagnosticsInstalled = true;
  const nativeAdd = manager.add?.bind(manager);
  if (nativeAdd) {
    manager.add = (key: string, config?: unknown) => {
      const sound = nativeAdd(key, config);
      instrumentSound(sound, String(key));
      audio("sound-created", {
        key: String(key),
        loop: Boolean((config as any)?.loop),
      });
      return sound;
    };
  }

  const audioCache = game?.cache?.audio;
  if (audioCache && !audioCache.__silverShadowAudioDiagnosticsInstalled) {
    audioCache.__silverShadowAudioDiagnosticsInstalled = true;
    const nativeRemove = audioCache.remove?.bind(audioCache);
    if (nativeRemove) {
      audioCache.remove = (key: string) => {
        const normalizedKey = String(key);
        const knownBuffer = decodedAudioBuffers.get(normalizedKey) ?? null;
        const result = nativeRemove(key);
        decodedAudioBuffers.delete(normalizedKey);
        audio("cache-remove", {
          key: normalizedKey,
          decoded: knownBuffer,
          remainingEntries: decodedAudioBuffers.size,
        });
        return result;
      };
    }
  }
}

function normalizeLoaderFile(file: any): Record<string, unknown> {
  return {
    key: file?.key ?? null,
    type: file?.type ?? null,
    url: file?.url ?? file?.src ?? null,
    state: file?.state ?? null,
    xhrStatus: file?.xhrLoader?.status ?? null,
    xhrStatusText: file?.xhrLoader?.statusText ?? null,
  };
}

function tryReadMemoryValues(): MemoryValues | null {
  try {
    return normalizeMemoryUsage(Switch.memoryUsage());
  } catch {
    return null;
  }
}

function compactMemory(memory: MemoryValues | null): unknown {
  if (!memory) {
    return "unavailable";
  }
  return {
    heapUsedMiB: bytesToMiB(memory.usedHeapSize),
    heapLimitMiB: bytesToMiB(memory.heapSizeLimit),
    externalMiB: bytesToMiB(memory.externalMemory),
    nativeUsedMiB: bytesToMiB(memory.nativeHeapUsed),
    nativeFreeMiB: bytesToMiB(memory.nativeHeapFree),
    nativeContexts: memory.numberOfNativeContexts,
    detachedContexts: memory.numberOfDetachedContexts,
  };
}

function readCompactAudioSnapshot(): unknown {
  const totalEstimatedBytes = [...decodedAudioBuffers.values()].reduce(
    (sum, buffer) => sum + (buffer.bytes ?? 0),
    0,
  );
  return {
    context: audioContextState,
    decodedCacheEntries: decodedAudioBuffers.size,
    decodedCacheMiB: bytesToMiB(totalEstimatedBytes),
    recentEvent: audioRecentEvents.at(-1) ?? null,
  };
}

function memoryPressureReasons(memory: MemoryValues | null): string[] {
  if (!memory) {
    return [];
  }
  const reasons: string[] = [];
  if (memory.externalMemory >= MEMORY_PRESSURE_THRESHOLDS.externalBytes) {
    reasons.push("external-memory");
  }
  if (memory.usedHeapSize >= MEMORY_PRESSURE_THRESHOLDS.heapUsedBytes) {
    reasons.push("v8-heap");
  }
  if (memory.nativeHeapFree <= MEMORY_PRESSURE_THRESHOLDS.nativeFreeBytes) {
    reasons.push("native-free");
  }
  if (memory.nativeHeapUsed >= MEMORY_PRESSURE_THRESHOLDS.nativeUsedBytes) {
    reasons.push("native-used");
  }
  if (memory.numberOfDetachedContexts > 0) {
    reasons.push("detached-context");
  }
  return reasons;
}

function performMemoryMaintenance(reason: string, detail?: unknown, force = false): void {
  const now = Date.now();
  const before = tryReadMemoryValues();
  const pressureReasons = memoryPressureReasons(before);
  if (!force && pressureReasons.length === 0) {
    return;
  }
  if (now - lastMaintenanceAt < MAINTENANCE_COOLDOWN_MS) {
    return;
  }
  lastMaintenanceAt = now;
  const startedAt = performance.now();
  let gcRequested = false;
  let gcError: string | null = null;
  try {
    const collectGarbage = (globalThis as any).gc;
    if (typeof collectGarbage === "function") {
      collectGarbage();
      gcRequested = true;
    }
  } catch (error) {
    gcError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  const after = tryReadMemoryValues();
  appendLog(gcError ? "WARN" : "INFO", "Switch memory maintenance", {
    sequence: ++maintenanceSequence,
    reason,
    detail: detail ?? null,
    force,
    pressureReasons,
    gcAvailable: typeof (globalThis as any).gc === "function",
    gcRequested,
    gcError,
    elapsedMs: round(performance.now() - startedAt),
    before: compactMemory(before),
    after: compactMemory(after),
    reclaimed: before && after
      ? {
          externalMiB: bytesToMiB(before.externalMemory - after.externalMemory),
          heapMiB: bytesToMiB(before.usedHeapSize - after.usedHeapSize),
          nativeMiB: bytesToMiB(before.nativeHeapUsed - after.nativeHeapUsed),
        }
      : "unavailable",
  });
}

function requestMemoryMaintenance(reason: string, detail?: unknown, force = false): void {
  if (pendingMaintenanceRequest) {
    pendingMaintenanceRequest = {
      reason: `${pendingMaintenanceRequest.reason},${reason}`,
      detail: [pendingMaintenanceRequest.detail, detail ?? null],
      force: pendingMaintenanceRequest.force || force,
    };
  } else {
    pendingMaintenanceRequest = { reason, detail: detail ?? null, force };
  }
  if (pendingMaintenanceTimer !== null) {
    return;
  }
  pendingMaintenanceTimer = setTimeout(() => {
    pendingMaintenanceTimer = null;
    const request = pendingMaintenanceRequest;
    pendingMaintenanceRequest = null;
    if (request) {
      performMemoryMaintenance(request.reason, request.detail, request.force);
    }
  }, 250);
}

function loaderFileId(key: unknown, type: unknown): string {
  return `${String(type)}\u0000${String(key)}`;
}

function loaderResponseSize(value: unknown): number {
  if (typeof value === "string") {
    return new TextEncoder().encode(value).byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return value.size;
  }
  return 0;
}

function releaseLoaderResponse(file: any): number {
  const xhr = file?.xhrLoader;
  if (!xhr) {
    return 0;
  }

  let bytes = 0;
  try {
    bytes = loaderResponseSize(xhr.response);
  } catch {
    // The response may be a partially initialized native object after a load
    // failure. Cleanup should remain best-effort in that case.
  }

  try {
    if (typeof xhr.releaseResponse === "function") {
      xhr.releaseResponse();
    } else {
      xhr.response = null;
      xhr.responseText = "";
      xhr.responseXML = null;
    }
    // Phaser has already populated the destination cache before it emits
    // filecomplete. Detach its XHR now instead of retaining the compressed
    // SD-card response until the entire File/XHR cycle is garbage-collected.
    file.xhrLoader = null;
  } catch {
    return 0;
  }
  return bytes;
}

function pushSample(samples: string[], value: string): void {
  samples.push(value);
  if (samples.length > MAX_LOADER_SAMPLES) {
    samples.shift();
  }
}

function instrumentLoader(loader: any, textures: any, sceneName: string): void {
  if (!loader || loader.__silverShadowDiagnosticsInstalled) {
    return;
  }
  loader.__silverShadowDiagnosticsInstalled = true;
  let activeBatch: LoaderBatch | null = null;
  const queuedFiles = new Map<string, any>();

  loader.on("addfile", (key: unknown, type: unknown, _activeLoader: any, file: any) => {
    const normalizedType = String(type);
    queuedFiles.set(loaderFileId(key, normalizedType), file);
    if (normalizedType !== "audio") {
      return;
    }
    const normalizedKey = String(key);
    audio("loader-queued", {
      scene: sceneName,
      key: normalizedKey,
      file: normalizeLoaderFile(file),
    });
  });

  loader.on("start", (activeLoader: any) => {
    activeBatch = {
      id: ++loaderBatchSequence,
      scene: sceneName,
      startedAt: Date.now(),
      expected: Number(activeLoader?.totalToLoad ?? loader.totalToLoad ?? 0),
      completedByType: {},
      firstCompleted: [],
      lastCompleted: [],
      textureKeys: new Set<string>(),
      failures: 0,
      releasedResponseBytes: 0,
      releasedResponses: 0,
    };
    appendLog("INFO", "Loader batch started", {
      id: activeBatch.id,
      scene: sceneName,
      expected: activeBatch.expected,
      memory: readMemorySnapshot(),
    });
  });

  loader.on("filecomplete", (key: unknown, type: unknown, data: unknown) => {
    const normalizedKey = String(key);
    const normalizedType = String(type);
    const fileId = loaderFileId(normalizedKey, normalizedType);
    const file = queuedFiles.get(fileId);
    if (normalizedType === "audio") {
      const decoded = normalizeAudioBuffer(data);
      decodedAudioBuffers.set(normalizedKey, decoded);
      audio("loader-complete", {
        scene: sceneName,
        key: normalizedKey,
        compressedBytes: Number(file?.xhrLoader?.response?.byteLength) || null,
        decoded,
        decodedCacheEntries: decodedAudioBuffers.size,
      });
    }
    const releasedBytes = releaseLoaderResponse(file);
    queuedFiles.delete(fileId);
    if (activeBatch && (file || releasedBytes > 0)) {
      activeBatch.releasedResponses++;
      activeBatch.releasedResponseBytes += releasedBytes;
    }
    if (!activeBatch) {
      return;
    }
    activeBatch.completedByType[normalizedType] = (activeBatch.completedByType[normalizedType] ?? 0) + 1;
    const sample = `${normalizedType}:${normalizedKey}`;
    if (activeBatch.firstCompleted.length < MAX_LOADER_SAMPLES) {
      activeBatch.firstCompleted.push(sample);
    }
    pushSample(activeBatch.lastCompleted, sample);
    if (IMAGE_FILE_TYPES.has(normalizedType)) {
      activeBatch.textureKeys.add(normalizedKey);
    }
  });

  loader.on("loaderror", (file: any) => {
    if (activeBatch) {
      activeBatch.failures++;
    }
    appendLog("ERROR", "Loader file failed", {
      id: activeBatch?.id ?? null,
      scene: sceneName,
      file: normalizeLoaderFile(file),
      memory: readMemorySnapshot(),
    });
    if (String(file?.type) === "audio") {
      const key = String(file?.key ?? "unknown");
      audio(
        "loader-failed",
        {
          scene: sceneName,
          key,
          file: normalizeLoaderFile(file),
        },
        true,
      );
    }
    const fileId = loaderFileId(file?.key ?? "unknown", file?.type ?? "unknown");
    const releasedBytes = releaseLoaderResponse(file);
    queuedFiles.delete(fileId);
    if (activeBatch && (file || releasedBytes > 0)) {
      activeBatch.releasedResponses++;
      activeBatch.releasedResponseBytes += releasedBytes;
    }
  });

  loader.on("complete", (_activeLoader: any, totalComplete: number, totalFailed: number) => {
    const batch = activeBatch;
    const missingTextures = batch
      ? [...batch.textureKeys]
          .filter(key => {
            try {
              return !textures?.exists?.(key);
            } catch {
              return true;
            }
          })
          .slice(0, MAX_MISSING_TEXTURES)
      : [];
    appendLog(totalFailed > 0 || missingTextures.length > 0 ? "WARN" : "INFO", "Loader batch completed", {
      id: batch?.id ?? null,
      scene: sceneName,
      elapsedMs: batch ? Date.now() - batch.startedAt : null,
      expected: batch?.expected ?? null,
      totalComplete,
      totalFailed,
      observedFailures: batch?.failures ?? 0,
      completedByType: batch?.completedByType ?? {},
      firstCompleted: batch?.firstCompleted ?? [],
      lastCompleted: batch?.lastCompleted ?? [],
      checkedTextureKeys: batch?.textureKeys.size ?? 0,
      missingTextures,
      missingTexturesTruncated:
        Boolean(batch) && missingTextures.length === MAX_MISSING_TEXTURES,
      releasedResponses: batch?.releasedResponses ?? 0,
      releasedResponseBytes: batch?.releasedResponseBytes ?? 0,
      releasedResponseMiB: batch ? bytesToMiB(batch.releasedResponseBytes) : 0,
      memory: readMemorySnapshot(),
      webgl: readWebGlHealth(true),
    });
    // Failed/aborted files may never emit filecomplete/loaderror. Ensure no
    // stale response remains rooted by the per-loader tracking map.
    for (const file of queuedFiles.values()) {
      releaseLoaderResponse(file);
    }
    queuedFiles.clear();
    activeBatch = null;
    requestMemoryMaintenance("loader-complete", {
      id: batch?.id ?? null,
      scene: sceneName,
      completed: totalComplete,
      failed: totalFailed,
      releasedResponseBytes: batch?.releasedResponseBytes ?? 0,
    });
  });

  appendLog("INFO", "Installed loader diagnostics", { scene: sceneName });
}

function attachWebGlContext(canvas: any, context: any): void {
  webGlContext = context;
  if (canvas?.__silverShadowWebGlDiagnosticsInstalled) {
    return;
  }
  canvas.__silverShadowWebGlDiagnosticsInstalled = true;
  canvas.addEventListener?.("webglcontextlost", (event: any) => {
    appendLog("ERROR", "WebGL context lost", {
      statusMessage: event?.statusMessage ?? null,
      cancelable: event?.cancelable ?? null,
      memory: readMemorySnapshot(),
      game: lastGameCheckpoint,
    });
  });
  canvas.addEventListener?.("webglcontextrestored", () => {
    appendLog("WARN", "WebGL context restored", {
      memory: readMemorySnapshot(),
      game: lastGameCheckpoint,
      webgl: readWebGlHealth(true),
    });
  });
  appendLog("INFO", "Installed WebGL lifecycle diagnostics", {
    webgl: readWebGlHealth(true),
  });
}

function recordFrameGap(kind: "render" | "step", previousAt: number | null, now: number): void {
  if (previousAt === null) {
    return;
  }
  const gap = now - previousAt;
  if (kind === "step") {
    frameWindow.maxStepGapMs = Math.max(frameWindow.maxStepGapMs, gap);
    if (gap >= 100) {
      frameWindow.stepGapsOver100Ms++;
    }
    if (gap >= 250) {
      frameWindow.stepGapsOver250Ms++;
    }
  } else {
    frameWindow.maxRenderGapMs = Math.max(frameWindow.maxRenderGapMs, gap);
    if (gap >= 100) {
      frameWindow.renderGapsOver100Ms++;
    }
    if (gap >= 250) {
      frameWindow.renderGapsOver250Ms++;
    }
  }
}

function attachPhaserGame(game: any): void {
  if (!game?.events || game.__silverShadowDiagnosticsInstalled) {
    return;
  }
  game.__silverShadowDiagnosticsInstalled = true;
  game.events.on("step", () => {
    const now = Date.now();
    recordFrameGap("step", counters.lastStepAt, now);
    counters.stepCount++;
    counters.lastStepAt = now;
  });
  game.events.on("postrender", () => {
    const now = Date.now();
    recordFrameGap("render", counters.lastRenderAt, now);
    counters.renderCount++;
    counters.lastRenderAt = now;
  });
  audioCapabilities = game.device?.audio ?? "unavailable";
  audioContextState = {
    manager: game.sound?.constructor?.name ?? null,
    contextState: game.sound?.context?.state ?? null,
    sampleRate: Number(game.sound?.context?.sampleRate) || null,
    noAudio: Boolean(game.config?.audio?.noAudio),
    disableWebAudio: Boolean(game.config?.audio?.disableWebAudio),
  };
  instrumentSoundManager(game);
  appendLog("INFO", "Phaser audio capabilities", {
    device: audioCapabilities,
    runtime: audioContextState,
  });
  appendLog("INFO", "Installed Phaser frame diagnostics");
}

function readGameState(): unknown {
  if (!gameStateProvider) {
    return "provider-unavailable";
  }
  try {
    return gameStateProvider();
  } catch (error) {
    return {
      unavailable: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function setGameStateProvider(provider: unknown): void {
  if (typeof provider !== "function") {
    appendLog("WARN", "Rejected invalid game-state diagnostics provider", {
      type: typeof provider,
    });
    return;
  }
  gameStateProvider = provider as () => unknown;
  appendLog("INFO", "Installed live game-state diagnostics provider", {
    state: readGameState(),
  });
}

function phase(event: "start" | "end", name: string, detail?: unknown): void {
  const phaseEvent: PhaseEvent = {
    event,
    name,
    at: Date.now(),
    detail: detail ?? null,
  };
  phaseHistory.push(phaseEvent);
  if (phaseHistory.length > MAX_PHASE_HISTORY) {
    phaseHistory.shift();
  }

  if (CRITICAL_PHASES.has(name)) {
    appendLog("INFO", "Critical phase event", {
      ...phaseEvent,
      state: readGameState(),
      memory: readMemorySnapshot(),
      webgl: readWebGlHealth(true),
      frames: counters,
    });
  }
  if (event === "end" && CRITICAL_PHASES.has(name)) {
    requestMemoryMaintenance(`phase-end:${name}`, detail, false);
  }
}

function checkpoint(name: string, detail?: unknown, includeMemory = false): void {
  lastGameCheckpoint = {
    name,
    detail: detail ?? null,
    at: Date.now(),
  };
  appendLog("INFO", "Game checkpoint", {
    name,
    detail: detail ?? null,
    state: readGameState(),
    memory: includeMemory ? readMemorySnapshot() : "not-sampled",
    webgl: readWebGlHealth(includeMemory),
    frames: counters,
  });
}

function flightRecorder(): void {
  const now = Date.now();
  const previous = lastFlightRecorderCounters;
  const current = { ...counters };
  const completedWindow = frameWindow;
  frameWindow = createFrameWindow();
  appendLog("INFO", "Freeze flight recorder", {
    uptimeMs: Math.round(performance.now()),
    checkpoint: lastGameCheckpoint,
    phase: phaseHistory.at(-1) ?? null,
    state: readGameState(),
    frames: {
      ...current,
      stepsSincePrevious: current.stepCount - previous.stepCount,
      rendersSincePrevious: current.renderCount - previous.renderCount,
      lastStepAgeMs: current.lastStepAt === null ? null : now - current.lastStepAt,
      lastRenderAgeMs: current.lastRenderAt === null ? null : now - current.lastRenderAt,
      window: completedWindow,
    },
    audio: readCompactAudioSnapshot(),
    memory: compactMemory(tryReadMemoryValues()),
    webgl: readWebGlHealth(false),
  });
  lastFlightRecorderCounters = current;
}

function frameWatchdog(): void {
  const now = Date.now();
  const eventLoopDelayMs = Math.max(0, now - expectedWatchdogAt);
  expectedWatchdogAt = now + FRAME_WATCHDOG_INTERVAL_MS;
  if (eventLoopDelayMs >= EVENT_LOOP_STALL_THRESHOLD_MS) {
    appendLog("WARN", "Event loop watchdog resumed after a stall", {
      delayMs: eventLoopDelayMs,
      checkpoint: lastGameCheckpoint,
      phase: phaseHistory.at(-1) ?? null,
      state: readGameState(),
      frames: counters,
      audio: readAudioSnapshot(),
      memory: readMemorySnapshot(),
      webgl: readWebGlHealth(true),
    });
  }

  const lastStepAgeMs = counters.lastStepAt === null ? null : now - counters.lastStepAt;
  const lastRenderAgeMs = counters.lastRenderAt === null ? null : now - counters.lastRenderAt;
  const stalled =
    lastStepAgeMs !== null
    && lastRenderAgeMs !== null
    && lastStepAgeMs >= FRAME_STALL_THRESHOLD_MS
    && lastRenderAgeMs >= FRAME_STALL_THRESHOLD_MS;
  if (stalled && !frameStallActive) {
    frameStallActive = true;
    frameStallDetectedAt = now;
    appendLog("WARN", "Phaser frame watchdog detected a stall", {
      lastStepAgeMs,
      lastRenderAgeMs,
      eventLoopResponsive: true,
      checkpoint: lastGameCheckpoint,
      phase: phaseHistory.at(-1) ?? null,
      state: readGameState(),
      frames: counters,
      audio: readAudioSnapshot(),
      memory: readMemorySnapshot(),
      webgl: readWebGlHealth(true),
    });
    requestMemoryMaintenance("phaser-frame-stall", {
      lastStepAgeMs,
      lastRenderAgeMs,
    });
  } else if (!stalled && frameStallActive) {
    appendLog("INFO", "Phaser frame watchdog recovered", {
      stalledForMs: now - frameStallDetectedAt,
      checkpoint: lastGameCheckpoint,
      phase: phaseHistory.at(-1) ?? null,
      frames: counters,
      memory: readMemorySnapshot(),
    });
    frameStallActive = false;
    frameStallDetectedAt = 0;
  }
}

function heartbeat(): void {
  const now = Date.now();
  const previous = lastHeartbeatCounters;
  const current = { ...counters };
  appendLog("INFO", "Runtime heartbeat", {
    uptimeMs: Math.round(performance.now()),
    game: lastGameCheckpoint,
    state: readGameState(),
    phases: {
      currentEvent: phaseHistory.at(-1) ?? null,
      recent: phaseHistory,
    },
    frames: {
      ...current,
      stepsSincePrevious: current.stepCount - previous.stepCount,
      rendersSincePrevious: current.renderCount - previous.renderCount,
      lastStepAgeMs: current.lastStepAt === null ? null : now - current.lastStepAt,
      lastRenderAgeMs: current.lastRenderAt === null ? null : now - current.lastRenderAt,
    },
    webgl: readWebGlHealth(true),
    audio: readAudioSnapshot(),
    memory: readMemorySnapshot(),
  });
  lastHeartbeatCounters = current;
}

export function installRuntimeDiagnostics(): void {
  const global = globalThis as any;
  if (global.__SILVERSHADOW_DIAGNOSTICS__) {
    return;
  }
  global.__SILVERSHADOW_DIAGNOSTICS__ = {
    audio,
    attachPhaserGame,
    attachWebGlContext,
    checkpoint,
    instrumentLoader,
    maintenance: requestMemoryMaintenance,
    memory: captureMemorySnapshot,
    phase,
    readAudio: readAudioSnapshot,
    setGameStateProvider,
  };
  captureMemorySnapshot("diagnostics-installed");
  expectedWatchdogAt = Date.now() + FRAME_WATCHDOG_INTERVAL_MS;
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  flightRecorderTimer = setInterval(flightRecorder, FLIGHT_RECORDER_INTERVAL_MS);
  frameWatchdogTimer = setInterval(frameWatchdog, FRAME_WATCHDOG_INTERVAL_MS);
  maintenanceTimer = setInterval(
    () => requestMemoryMaintenance("periodic-pressure-check"),
    MAINTENANCE_INTERVAL_MS,
  );
  appendLog("INFO", "Installed bounded runtime diagnostics", {
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    flightRecorderIntervalMs: FLIGHT_RECORDER_INTERVAL_MS,
    frameWatchdogIntervalMs: FRAME_WATCHDOG_INTERVAL_MS,
    frameStallThresholdMs: FRAME_STALL_THRESHOLD_MS,
    eventLoopStallThresholdMs: EVENT_LOOP_STALL_THRESHOLD_MS,
    maintenanceIntervalMs: MAINTENANCE_INTERVAL_MS,
    maintenanceCooldownMs: MAINTENANCE_COOLDOWN_MS,
    memoryPressureThresholdMiB: {
      external: bytesToMiB(MEMORY_PRESSURE_THRESHOLDS.externalBytes),
      heapUsed: bytesToMiB(MEMORY_PRESSURE_THRESHOLDS.heapUsedBytes),
      nativeFree: bytesToMiB(MEMORY_PRESSURE_THRESHOLDS.nativeFreeBytes),
      nativeUsed: bytesToMiB(MEMORY_PRESSURE_THRESHOLDS.nativeUsedBytes),
    },
    exposedGcAvailable: typeof global.gc === "function",
    loaderSampleLimit: MAX_LOADER_SAMPLES,
    missingTextureLimit: MAX_MISSING_TEXTURES,
    phaseHistoryLimit: MAX_PHASE_HISTORY,
    audioLogSampleLimit: MAX_AUDIO_LOG_SAMPLES,
    audioRecentEventLimit: MAX_AUDIO_RECENT_EVENTS,
    audioCacheSampleLimit: MAX_AUDIO_CACHE_SAMPLES,
    criticalPhases: [...CRITICAL_PHASES],
  });
}
