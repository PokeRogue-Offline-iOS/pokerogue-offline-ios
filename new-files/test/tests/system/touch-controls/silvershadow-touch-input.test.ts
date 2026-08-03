import {
  resolveDpadDirection,
  SILVERSHADOW_DPAD_DEAD_ZONE_RATIO,
  SilverShadowTouchInputState,
} from "#system/touch-controls/silvershadow-touch-input";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("System - Touch controls - direction resolver", () => {
  const width = 100;

  it("keeps the exact center neutral", () => {
    expect(resolveDpadDirection(0, 0, width)).toBeNull();
  });

  it("keeps movement inside the 16% dead zone neutral", () => {
    const inside = width * SILVERSHADOW_DPAD_DEAD_ZONE_RATIO - 0.01;
    expect(resolveDpadDirection(inside, -inside, width)).toBeNull();
  });

  it.each([
    [0, -30, "UP"],
    [0, 30, "DOWN"],
    [-30, 0, "LEFT"],
    [30, 0, "RIGHT"],
  ] as const)("resolves (%s, %s) as %s", (dx, dy, expected) => {
    expect(resolveDpadDirection(dx, dy, width)).toBe(expected);
  });

  it("uses horizontal dominance", () => {
    expect(resolveDpadDirection(-40, 20, width)).toBe("LEFT");
  });

  it("uses vertical dominance", () => {
    expect(resolveDpadDirection(20, 40, width)).toBe("DOWN");
  });

  it("resolves an exact equal-axis boundary horizontally", () => {
    expect(resolveDpadDirection(25, -25, width)).toBe("RIGHT");
    expect(resolveDpadDirection(-25, 25, width)).toBe("LEFT");
  });
});

describe("System - Touch controls - multi-pointer state", () => {
  const press = vi.fn<(key: string) => void>();
  const release = vi.fn<(key: string) => void>();
  const triggerHaptic = vi.fn<(kind: "direction-change" | "button-press") => void>();
  let state: SilverShadowTouchInputState;

  beforeEach(() => {
    press.mockReset();
    release.mockReset();
    triggerHaptic.mockReset();
    state = new SilverShadowTouchInputState({ press, release }, { trigger: triggerHaptic });
  });

  it("captures a neutral pointer and activates after sliding", () => {
    expect(state.captureDpad(1, 50, 50, 50, 50, 100)).toBe(true);
    expect(state.dpadOwner).toBe(1);
    expect(state.activeDirection).toBeNull();
    expect(press).not.toHaveBeenCalled();

    state.moveDpad(1, 90, 50, 50, 50, 100);
    expect(state.activeDirection).toBe("RIGHT");
    expect(press).toHaveBeenCalledWith("RIGHT");
    expect(triggerHaptic).toHaveBeenCalledExactlyOnceWith("direction-change");
  });

  it("releases then presses when sliding direction-to-direction", () => {
    state.captureDpad(1, 90, 50, 50, 50, 100);
    state.moveDpad(1, 50, 10, 50, 50, 100);

    expect(press.mock.calls).toEqual([["RIGHT"], ["UP"]]);
    expect(release.mock.calls).toEqual([["RIGHT"]]);
    expect(triggerHaptic.mock.calls).toEqual([["direction-change"], ["direction-change"]]);
  });

  it("releases when sliding direction-to-neutral", () => {
    state.captureDpad(1, 90, 50, 50, 50, 100);
    state.moveDpad(1, 50, 50, 50, 50, 100);

    expect(state.activeDirection).toBeNull();
    expect(release).toHaveBeenCalledExactlyOnceWith("RIGHT");
    expect(triggerHaptic).toHaveBeenCalledExactlyOnceWith("direction-change");
  });

  it("does not repeat transitions within the same direction", () => {
    state.captureDpad(1, 90, 50, 50, 50, 100);
    state.moveDpad(1, 95, 55, 50, 50, 100);
    state.moveDpad(1, 85, 45, 50, 50, 100);

    expect(press).toHaveBeenCalledExactlyOnceWith("RIGHT");
    expect(release).not.toHaveBeenCalled();
    expect(triggerHaptic).toHaveBeenCalledExactlyOnceWith("direction-change");
  });

  it("prevents a second pointer from stealing D-pad ownership", () => {
    expect(state.captureDpad(1, 90, 50, 50, 50, 100)).toBe(true);
    expect(state.captureDpad(2, 10, 50, 50, 50, 100)).toBe(false);
    expect(state.moveDpad(2, 50, 90, 50, 50, 100)).toBe(false);
    expect(state.dpadOwner).toBe(1);
    expect(state.activeDirection).toBe("RIGHT");
  });

  it("cleans up D-pad ownership on pointer-up", () => {
    state.captureDpad(1, 90, 50, 50, 50, 100);
    expect(state.releasePointer(1)).toBe(true);

    expect(release).toHaveBeenCalledExactlyOnceWith("RIGHT");
    expect(state.dpadOwner).toBeNull();
    expect(state.activeDirection).toBeNull();
    expect(triggerHaptic).toHaveBeenCalledExactlyOnceWith("direction-change");
  });

  it("cleans up D-pad ownership on pointer-cancel", () => {
    state.captureDpad(1, 50, 10, 50, 50, 100);
    expect(state.cancelPointer(1)).toBe(true);

    expect(release).toHaveBeenCalledExactlyOnceWith("UP");
    expect(state.dpadOwner).toBeNull();
    expect(triggerHaptic).toHaveBeenCalledExactlyOnceWith("direction-change");
  });

  it("holds the D-pad and an action button simultaneously", () => {
    state.captureDpad(1, 10, 50, 50, 50, 100);
    state.pressAction(2, "ACTION");

    expect(state.isHeld("LEFT")).toBe(true);
    expect(state.isHeld("ACTION")).toBe(true);
    expect(press.mock.calls).toEqual([["LEFT"], ["ACTION"]]);
    expect(triggerHaptic.mock.calls).toEqual([["direction-change"], ["button-press"]]);
  });

  it("tracks multiple action-button pointers independently", () => {
    expect(state.pressAction(2, "ACTION")).toBe(true);
    expect(state.pressAction(3, "CANCEL")).toBe(true);
    expect(state.actionPointerCount).toBe(2);
    expect(triggerHaptic.mock.calls).toEqual([["button-press"], ["button-press"]]);

    state.releasePointer(2);
    expect(state.isHeld("ACTION")).toBe(false);
    expect(state.isHeld("CANCEL")).toBe(true);
    expect(release).toHaveBeenCalledExactlyOnceWith("ACTION");

    state.releasePointer(3);
    expect(release.mock.calls).toEqual([["ACTION"], ["CANCEL"]]);
  });

  it("keeps a shared action held until its final pointer releases", () => {
    state.pressAction(2, "ACTION");
    state.pressAction(3, "ACTION");
    expect(press).toHaveBeenCalledExactlyOnceWith("ACTION");
    expect(triggerHaptic).toHaveBeenCalledTimes(2);

    state.releasePointer(2);
    expect(release).not.toHaveBeenCalled();
    expect(state.isHeld("ACTION")).toBe(true);

    state.releasePointer(3);
    expect(release).toHaveBeenCalledExactlyOnceWith("ACTION");
  });

  it("releases all held inputs on visibility-loss cleanup", () => {
    state.captureDpad(1, 50, 90, 50, 50, 100);
    state.pressAction(2, "ACTION");
    state.pressAction(3, "CANCEL");

    state.reset();

    expect(new Set(release.mock.calls.flat())).toEqual(new Set(["DOWN", "ACTION", "CANCEL"]));
    expect(state.dpadOwner).toBeNull();
    expect(state.actionPointerCount).toBe(0);
    expect(triggerHaptic).toHaveBeenCalledTimes(3);
  });

  it("does not haptic on neutral capture, rejected pointers, release, cancel, or reset", () => {
    expect(state.captureDpad(1, 50, 50, 50, 50, 100)).toBe(true);
    expect(state.captureDpad(2, 90, 50, 50, 50, 100)).toBe(false);
    expect(state.pressAction(1, "ACTION")).toBe(false);
    expect(state.releasePointer(1)).toBe(true);
    expect(state.cancelPointer(99)).toBe(false);
    state.reset();

    expect(triggerHaptic).not.toHaveBeenCalled();
  });
});
