import { appendLog } from "./logger";

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

export function installAudioListenerShim(): void {
  const global = globalThis as any;
  if (global.__silverShadowAudioListenerShimInstalled || !global.AudioContext) {
    return;
  }
  global.__silverShadowAudioListenerShimInstalled = true;

  const NativeAudioContext = global.AudioContext;
  const CompatibleAudioContext = function (this: unknown, ...args: unknown[]) {
    const context = Reflect.construct(NativeAudioContext, args) as Record<PropertyKey, unknown>;
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
