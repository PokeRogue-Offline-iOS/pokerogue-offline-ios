import {
  SILVERSHADOW_BUTTON_VIBRATION_MS,
  SILVERSHADOW_DIRECTION_VIBRATION_MS,
  SilverShadowTouchHaptics,
} from "#system/touch-controls/silvershadow-touch-haptics";
import { describe, expect, it, vi } from "vitest";

describe("System - Touch controls - haptics", () => {
  it("does nothing while the existing vibration setting is disabled", () => {
    const impact = vi.fn().mockResolvedValue(undefined);
    const vibrate = vi.fn();
    const haptics = new SilverShadowTouchHaptics({
      isEnabled: () => false,
      getCapacitor: () => ({ isNativePlatform: () => true, registerPlugin: () => ({ impact }) }),
      vibrate,
    });

    haptics.trigger("button-press");

    expect(impact).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("prefers and caches the native Capacitor light impact", () => {
    const impact = vi.fn().mockResolvedValue(undefined);
    const registerPlugin = vi.fn(() => ({ impact }));
    const vibrate = vi.fn();
    const haptics = new SilverShadowTouchHaptics({
      isEnabled: () => true,
      getCapacitor: () => ({
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
        registerPlugin,
      }),
      vibrate,
    });

    haptics.trigger("direction-change");
    haptics.trigger("button-press");

    expect(registerPlugin).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(2);
    expect(impact).toHaveBeenNthCalledWith(1, { style: "LIGHT" });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("uses distinct short browser fallback durations", () => {
    const vibrate = vi.fn(() => true);
    const haptics = new SilverShadowTouchHaptics({
      isEnabled: () => true,
      getCapacitor: () => undefined,
      vibrate,
    });

    haptics.trigger("direction-change");
    haptics.trigger("button-press");

    expect(vibrate.mock.calls).toEqual([[SILVERSHADOW_DIRECTION_VIBRATION_MS], [SILVERSHADOW_BUTTON_VIBRATION_MS]]);
  });

  it("falls back after a native rejection without an unhandled error", async () => {
    const impact = vi.fn().mockRejectedValue(new Error("native unavailable"));
    const vibrate = vi.fn(() => true);
    const haptics = new SilverShadowTouchHaptics({
      isEnabled: () => true,
      getCapacitor: () => ({ isNativePlatform: () => true, registerPlugin: () => ({ impact }) }),
      vibrate,
    });

    haptics.trigger("button-press");
    await vi.waitFor(() => expect(vibrate).toHaveBeenCalledWith(SILVERSHADOW_BUTTON_VIBRATION_MS));
  });

  it("rechecks the setting before an asynchronous fallback", async () => {
    let enabled = true;
    const impact = vi.fn().mockRejectedValue(new Error("native unavailable"));
    const vibrate = vi.fn();
    const haptics = new SilverShadowTouchHaptics({
      isEnabled: () => enabled,
      getCapacitor: () => ({ isNativePlatform: () => true, registerPlugin: () => ({ impact }) }),
      vibrate,
    });

    haptics.trigger("direction-change");
    enabled = false;
    await Promise.resolve();
    await Promise.resolve();

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows browser API failures", () => {
    const haptics = new SilverShadowTouchHaptics({
      isEnabled: () => true,
      getCapacitor: () => undefined,
      vibrate: () => {
        throw new Error("blocked");
      },
    });

    expect(() => haptics.trigger("button-press")).not.toThrow();
  });
});
