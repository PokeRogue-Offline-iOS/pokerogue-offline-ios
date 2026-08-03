export type SilverShadowTouchHapticKind = "direction-change" | "button-press";

export interface SilverShadowTouchHapticSink {
  trigger(kind: SilverShadowTouchHapticKind): void;
}

interface CapacitorHapticsPlugin {
  impact(options: { style: "LIGHT" }): Promise<void>;
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: (name: string) => CapacitorHapticsPlugin;
  Plugins?: { Haptics?: CapacitorHapticsPlugin };
}

export interface SilverShadowTouchHapticsDependencies {
  isEnabled: () => boolean;
  getCapacitor?: () => CapacitorBridge | undefined;
  vibrate?: (durationMs: number) => boolean;
}

/** Short browser fallbacks; native Android uses the official light impact. */
export const SILVERSHADOW_DIRECTION_VIBRATION_MS = 12;
export const SILVERSHADOW_BUTTON_VIBRATION_MS = 16;

function defaultCapacitorBridge(): CapacitorBridge | undefined {
  return (globalThis as typeof globalThis & { Capacitor?: CapacitorBridge }).Capacitor;
}

function defaultVibrate(durationMs: number): boolean {
  return globalThis.navigator?.vibrate?.(durationMs) ?? false;
}

/**
 * Fire-and-forget touch feedback. Native Capacitor is preferred; unsupported,
 * rejected, and browser-only environments safely fall back or do nothing.
 */
export class SilverShadowTouchHaptics implements SilverShadowTouchHapticSink {
  private readonly dependencies: SilverShadowTouchHapticsDependencies;
  private readonly getCapacitor: () => CapacitorBridge | undefined;
  private readonly vibrate: (durationMs: number) => boolean;
  private nativePlugin: CapacitorHapticsPlugin | null = null;

  constructor(dependencies: SilverShadowTouchHapticsDependencies) {
    this.dependencies = dependencies;
    this.getCapacitor = dependencies.getCapacitor ?? defaultCapacitorBridge;
    this.vibrate = dependencies.vibrate ?? defaultVibrate;
  }

  public trigger(kind: SilverShadowTouchHapticKind): void {
    if (!this.dependencies.isEnabled()) {
      return;
    }

    const plugin = this.getNativePlugin();
    if (plugin) {
      try {
        plugin.impact({ style: "LIGHT" }).catch(() => this.fallbackIfStillEnabled(kind));
        return;
      } catch {
        // A partially initialized bridge can throw synchronously; use fallback.
      }
    }

    this.fallback(kind);
  }

  private getNativePlugin(): CapacitorHapticsPlugin | null {
    if (this.nativePlugin) {
      return this.nativePlugin;
    }

    const bridge = this.getCapacitor();
    if (!bridge?.isNativePlatform?.() || bridge.isPluginAvailable?.("Haptics") === false) {
      return null;
    }

    try {
      const plugin = bridge.Plugins?.Haptics ?? bridge.registerPlugin?.("Haptics");
      if (plugin?.impact) {
        this.nativePlugin = plugin;
      }
    } catch {
      return null;
    }

    return this.nativePlugin;
  }

  private fallbackIfStillEnabled(kind: SilverShadowTouchHapticKind): void {
    if (this.dependencies.isEnabled()) {
      this.fallback(kind);
    }
  }

  private fallback(kind: SilverShadowTouchHapticKind): void {
    try {
      this.vibrate(
        kind === "direction-change" ? SILVERSHADOW_DIRECTION_VIBRATION_MS : SILVERSHADOW_BUTTON_VIBRATION_MS,
      );
    } catch {
      // Haptics are optional and must never interrupt touch input.
    }
  }
}
