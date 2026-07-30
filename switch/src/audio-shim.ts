import { appendLog } from "./logger";

type CanPlayTypeResult = "" | "maybe" | "probably";

interface MutableAudioParam {
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  setValueAtTime(value: number): MutableAudioParam;
  linearRampToValueAtTime(value: number): MutableAudioParam;
  exponentialRampToValueAtTime(value: number): MutableAudioParam;
  setTargetAtTime(value: number): MutableAudioParam;
  setValueCurveAtTime(): MutableAudioParam;
  cancelScheduledValues(): MutableAudioParam;
  cancelAndHoldAtTime(): MutableAudioParam;
}

function makeAudioParam(initialValue: number): MutableAudioParam {
  const parameter: MutableAudioParam = {
    value: initialValue,
    defaultValue: initialValue,
    minValue: -Number.MAX_VALUE,
    maxValue: Number.MAX_VALUE,
    setValueAtTime(value: number) {
      parameter.value = value;
      return parameter;
    },
    linearRampToValueAtTime(value: number) {
      parameter.value = value;
      return parameter;
    },
    exponentialRampToValueAtTime(value: number) {
      parameter.value = value;
      return parameter;
    },
    setTargetAtTime(value: number) {
      parameter.value = value;
      return parameter;
    },
    setValueCurveAtTime() {
      return parameter;
    },
    cancelScheduledValues() {
      return parameter;
    },
    cancelAndHoldAtTime() {
      return parameter;
    },
  };
  return parameter;
}

function makeAudioListener(): AudioListener {
  const listener = {
    positionX: makeAudioParam(0),
    positionY: makeAudioParam(0),
    positionZ: makeAudioParam(0),
    forwardX: makeAudioParam(0),
    forwardY: makeAudioParam(0),
    forwardZ: makeAudioParam(-1),
    upX: makeAudioParam(0),
    upY: makeAudioParam(1),
    upZ: makeAudioParam(0),
    setPosition(x: number, y: number, z: number) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = z;
    },
    setOrientation(
      forwardX: number,
      forwardY: number,
      forwardZ: number,
      upX: number,
      upY: number,
      upZ: number,
    ) {
      listener.forwardX.value = forwardX;
      listener.forwardY.value = forwardY;
      listener.forwardZ.value = forwardZ;
      listener.upX.value = upX;
      listener.upY.value = upY;
      listener.upZ.value = upZ;
    },
  };
  return listener as unknown as AudioListener;
}

function canPlayNxAudioType(requestedType: string): CanPlayTypeResult {
  const mimeType = String(requestedType).toLowerCase().split(";", 1)[0].trim();
  switch (mimeType) {
    case "audio/aac":
    case "audio/aacp":
    case "audio/flac":
    case "audio/mp3":
    case "audio/mp4":
    case "audio/mpeg":
    case "audio/ogg":
    case "audio/opus":
    case "audio/wav":
    case "audio/wave":
    case "audio/webm":
    case "audio/x-flac":
    case "audio/x-m4a":
    case "audio/x-wav":
      return "probably";
    default:
      return "";
  }
}

function installAudioCodecDetectionShim(): void {
  const global = globalThis as any;
  if (global.__silverShadowAudioCodecDetectionShimInstalled || !global.Audio) {
    return;
  }
  global.__silverShadowAudioCodecDetectionShimInstalled = true;
  global.__SILVERSHADOW_CAN_PLAY_AUDIO_TYPE__ = canPlayNxAudioType;

  try {
    Object.defineProperty(global.Audio.prototype, "canPlayType", {
      configurable: true,
      value: canPlayNxAudioType,
      writable: true,
    });
  } catch (error) {
    appendLog("WARN", "Using DOM-level nx.js audio codec detection fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const probe = new global.Audio();
  appendLog("INFO", "Installed nx.js audio codec detection compatibility", {
    mp3: probe.canPlayType('audio/mpeg'),
    wav: probe.canPlayType('audio/wav'),
    m4a: probe.canPlayType('audio/x-m4a'),
    aac: probe.canPlayType('audio/aac'),
    oggVorbis: probe.canPlayType('audio/ogg; codecs="vorbis"'),
    oggOpus: probe.canPlayType('audio/ogg; codecs="opus"'),
    flac: probe.canPlayType('audio/flac'),
    webmVorbis: probe.canPlayType('audio/webm; codecs="vorbis"'),
    unknown: probe.canPlayType('audio/unsupported-silvershadow-test'),
  });
}

function reportAudioDiagnostic(event: string, detail?: unknown, important = false): void {
  (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.(event, detail, important);
}

function audioBufferDetail(buffer: any): Record<string, number | null> {
  const channels = Number(buffer?.numberOfChannels);
  const length = Number(buffer?.length);
  const sampleRate = Number(buffer?.sampleRate);
  return {
    channels: Number.isFinite(channels) ? channels : null,
    durationSeconds: Number.isFinite(Number(buffer?.duration)) ? Number(buffer.duration) : null,
    estimatedDecodedBytes:
      Number.isFinite(channels) && Number.isFinite(length) ? channels * length * 4 : null,
    frames: Number.isFinite(length) ? length : null,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : null,
  };
}

let decodeSequence = 0;
const instrumentedAudioContexts = new WeakSet<object>();

function instrumentAudioContext(context: any): void {
  if (instrumentedAudioContexts.has(context)) {
    return;
  }
  instrumentedAudioContexts.add(context);

  if (typeof context.decodeAudioData === "function") {
    const nativeDecodeAudioData = context.decodeAudioData.bind(context);
    const compatibleDecodeAudioData = (
      data: ArrayBuffer,
      successCallback?: ((decodedData: AudioBuffer) => void) | null,
      errorCallback?: ((error: DOMException) => void) | null,
    ): Promise<AudioBuffer> => {
      const id = ++decodeSequence;
      const startedAt = Date.now();
      let settled = false;
      reportAudioDiagnostic("decode-start", {
        id,
        inputBytes: Number(data?.byteLength) || 0,
      });

      const reportSuccess = (buffer: AudioBuffer) => {
        if (settled) {
          return buffer;
        }
        settled = true;
        reportAudioDiagnostic("decode-complete", {
          id,
          elapsedMs: Date.now() - startedAt,
          inputBytes: Number(data?.byteLength) || 0,
          ...audioBufferDetail(buffer),
        });
        successCallback?.(buffer);
        return buffer;
      };
      const reportFailure = (error: DOMException) => {
        if (settled) {
          return;
        }
        settled = true;
        reportAudioDiagnostic(
          "decode-failed",
          {
            id,
            elapsedMs: Date.now() - startedAt,
            inputBytes: Number(data?.byteLength) || 0,
            message: error?.message ?? String(error),
            name: error?.name ?? null,
          },
          true,
        );
        errorCallback?.(error);
      };

      const result = nativeDecodeAudioData(
        data,
        successCallback ? reportSuccess : null,
        errorCallback ? reportFailure : null,
      ) as Promise<AudioBuffer>;
      if (!successCallback && result?.then) {
        return result.then(reportSuccess, error => {
          reportFailure(error);
          throw error;
        });
      }
      if (result?.catch) {
        void result.catch(error => {
          if (!settled) {
            reportFailure(error);
          }
        });
      }
      return result;
    };
    try {
      context.decodeAudioData = compatibleDecodeAudioData;
    } catch (error) {
      reportAudioDiagnostic(
        "decode-instrumentation-failed",
        {
          message: error instanceof Error ? error.message : String(error),
        },
        true,
      );
    }
  }

  reportAudioDiagnostic(
    "context-created",
    {
      sampleRate: Number(context.sampleRate) || null,
      state: context.state ?? null,
    },
    true,
  );
}

function installAudioListenerShim(): void {
  const global = globalThis as any;
  if (global.__silverShadowAudioListenerShimInstalled || !global.AudioContext) {
    return;
  }
  global.__silverShadowAudioListenerShimInstalled = true;

  const NativeAudioContext = global.AudioContext;
  const CompatibleAudioContext = function (this: unknown, ...args: unknown[]) {
    const context = Reflect.construct(NativeAudioContext, args) as Record<PropertyKey, unknown>;
    instrumentAudioContext(context);
    const listener = makeAudioListener();
    try {
      Object.defineProperty(context, "listener", {
        configurable: true,
        enumerable: true,
        value: listener,
      });
      return context;
    } catch {
      return new Proxy(context, {
        get(target, property) {
          if (property === "listener") {
            return listener;
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, property, value) {
          return Reflect.set(target, property, value, target);
        },
      });
    }
  };
  CompatibleAudioContext.prototype = NativeAudioContext.prototype;
  Object.setPrototypeOf(CompatibleAudioContext, NativeAudioContext);
  global.AudioContext = CompatibleAudioContext;
  if (!global.webkitAudioContext || global.webkitAudioContext === NativeAudioContext) {
    global.webkitAudioContext = CompatibleAudioContext;
  }
  appendLog("INFO", "Installed Phaser AudioListener compatibility");
}

export function installAudioCompatibilityShims(): void {
  installAudioCodecDetectionShim();
  installAudioListenerShim();
}
