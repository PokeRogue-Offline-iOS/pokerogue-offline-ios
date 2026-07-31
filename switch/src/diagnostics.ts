import { appendLog } from "./logger";

const HEARTBEAT_INTERVAL_MS = 30_000;
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
}

interface RuntimeCounters {
  stepCount: number;
  renderCount: number;
  lastStepAt: number | null;
  lastRenderAt: number | null;
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
  const queuedAudioFiles = new Map<string, any>();

  loader.on("addfile", (key: unknown, type: unknown, _activeLoader: any, file: any) => {
    if (String(type) !== "audio") {
      return;
    }
    const normalizedKey = String(key);
    queuedAudioFiles.set(normalizedKey, file);
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
    if (normalizedType === "audio") {
      const file = queuedAudioFiles.get(normalizedKey);
      const decoded = normalizeAudioBuffer(data);
      decodedAudioBuffers.set(normalizedKey, decoded);
      audio("loader-complete", {
        scene: sceneName,
        key: normalizedKey,
        compressedBytes: Number(file?.xhrLoader?.response?.byteLength) || null,
        decoded,
        decodedCacheEntries: decodedAudioBuffers.size,
      });
      queuedAudioFiles.delete(normalizedKey);
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
      queuedAudioFiles.delete(key);
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
    memory: captureMemorySnapshot,
    phase,
    readAudio: readAudioSnapshot,
    setGameStateProvider,
  };
  captureMemorySnapshot("diagnostics-installed");
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  appendLog("INFO", "Installed bounded runtime diagnostics", {
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    loaderSampleLimit: MAX_LOADER_SAMPLES,
    missingTextureLimit: MAX_MISSING_TEXTURES,
    phaseHistoryLimit: MAX_PHASE_HISTORY,
    audioLogSampleLimit: MAX_AUDIO_LOG_SAMPLES,
    audioRecentEventLimit: MAX_AUDIO_RECENT_EVENTS,
    audioCacheSampleLimit: MAX_AUDIO_CACHE_SAMPLES,
    criticalPhases: [...CRITICAL_PHASES],
  });
}
