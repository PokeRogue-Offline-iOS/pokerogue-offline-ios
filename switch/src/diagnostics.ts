import { appendLog } from "./logger";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_LOADER_SAMPLES = 8;
const MAX_MISSING_TEXTURES = 20;
const IMAGE_FILE_TYPES = new Set(["atlasimage", "image", "spritesheet", "svg"]);

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
}

interface RuntimeCounters {
  stepCount: number;
  renderCount: number;
  lastStepAt: number | null;
  lastRenderAt: number | null;
}

let previousMemory: MemoryValues | null = null;
let loaderBatchSequence = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastHeartbeatCounters: RuntimeCounters = {
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
let webGlContext: any = null;

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
    };
    appendLog("INFO", "Loader batch started", {
      id: activeBatch.id,
      scene: sceneName,
      expected: activeBatch.expected,
      memory: readMemorySnapshot(),
    });
  });

  loader.on("filecomplete", (key: unknown, type: unknown) => {
    if (!activeBatch) {
      return;
    }
    const normalizedKey = String(key);
    const normalizedType = String(type);
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
      memory: readMemorySnapshot(),
      webgl: readWebGlHealth(true),
    });
    activeBatch = null;
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

function attachPhaserGame(game: any): void {
  if (!game?.events || game.__silverShadowDiagnosticsInstalled) {
    return;
  }
  game.__silverShadowDiagnosticsInstalled = true;
  game.events.on("step", () => {
    counters.stepCount++;
    counters.lastStepAt = Date.now();
  });
  game.events.on("postrender", () => {
    counters.renderCount++;
    counters.lastRenderAt = Date.now();
  });
  appendLog("INFO", "Installed Phaser frame diagnostics");
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
    memory: includeMemory ? readMemorySnapshot() : "not-sampled",
    webgl: readWebGlHealth(includeMemory),
    frames: counters,
  });
}

function heartbeat(): void {
  const now = Date.now();
  const previous = lastHeartbeatCounters;
  const current = { ...counters };
  appendLog("INFO", "Runtime heartbeat", {
    uptimeMs: Math.round(performance.now()),
    game: lastGameCheckpoint,
    frames: {
      ...current,
      stepsSincePrevious: current.stepCount - previous.stepCount,
      rendersSincePrevious: current.renderCount - previous.renderCount,
      lastStepAgeMs: current.lastStepAt === null ? null : now - current.lastStepAt,
      lastRenderAgeMs: current.lastRenderAt === null ? null : now - current.lastRenderAt,
    },
    webgl: readWebGlHealth(true),
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
    attachPhaserGame,
    attachWebGlContext,
    checkpoint,
    instrumentLoader,
    memory: captureMemorySnapshot,
  };
  captureMemorySnapshot("diagnostics-installed");
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  appendLog("INFO", "Installed bounded runtime diagnostics", {
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    loaderSampleLimit: MAX_LOADER_SAMPLES,
    missingTextureLimit: MAX_MISSING_TEXTURES,
  });
}
