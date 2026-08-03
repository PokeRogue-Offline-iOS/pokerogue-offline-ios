import {
  calculateDpadVisualPose,
  SILVERSHADOW_DPAD_VISUAL_DEFAULTS,
  smoothstep,
} from "#system/touch-controls/silvershadow-dpad-visual";
import { describe, expect, it } from "vitest";

describe("System - Touch controls - D-pad visual pose", () => {
  const width = 100;

  it("returns a level finite pose at the exact center", () => {
    expect(calculateDpadVisualPose(0, 0, width, null)).toEqual({
      normalizedX: 0,
      normalizedY: 0,
      normalizedDistance: 0,
      tiltXDegrees: 0,
      tiltYDegrees: 0,
      shadowX: 0,
      shadowY: 0,
      pressedDepth: 0,
    });
  });

  it("allows only capped micro-tilt while digitally neutral", () => {
    const pose = calculateDpadVisualPose(14, -8, width, null);
    expect(Math.hypot(pose.tiltXDegrees, pose.tiltYDegrees)).toBeGreaterThan(0);
    expect(Math.hypot(pose.tiltXDegrees, pose.tiltYDegrees)).toBeLessThanOrEqual(
      SILVERSHADOW_DPAD_VISUAL_DEFAULTS.maximumNeutralTiltDegrees,
    );
  });

  it("increases active tilt continuously with distance", () => {
    const distances = [5, 12.5, 25, 37.5, 50];
    const tilts = distances.map(dx => Math.abs(calculateDpadVisualPose(dx, 0, width, "RIGHT").tiltYDegrees));
    for (let index = 1; index < tilts.length; index++) {
      expect(tilts[index]).toBeGreaterThan(tilts[index - 1]);
    }
  });

  it("clamps maximum tilt at the artwork edge", () => {
    const pose = calculateDpadVisualPose(50, 0, width, "RIGHT");
    expect(pose.normalizedDistance).toBe(1);
    expect(pose.tiltYDegrees).toBe(SILVERSHADOW_DPAD_VISUAL_DEFAULTS.maximumTiltDegrees);
  });

  it("clamps a pointer beyond the artwork without excessive rotation", () => {
    const pose = calculateDpadVisualPose(500, -500, width, "UP");
    expect(pose.normalizedDistance).toBe(1);
    expect(Math.hypot(pose.tiltXDegrees, pose.tiltYDegrees)).toBeCloseTo(
      SILVERSHADOW_DPAD_VISUAL_DEFAULTS.maximumTiltDegrees,
    );
  });

  it.each([
    [0, -50, 6, 0],
    [0, 50, -6, 0],
    [-50, 0, 0, -6],
    [50, 0, 0, 6],
  ] as const)("maps cardinal displacement (%s, %s) to tilt (%s, %s)", (dx, dy, tiltX, tiltY) => {
    const pose = calculateDpadVisualPose(dx, dy, width, "UP");
    expect(pose.tiltXDegrees).toBeCloseTo(tiltX);
    expect(pose.tiltYDegrees).toBeCloseTo(tiltY);
  });

  it("supports diagonal visual leaning while the active input remains cardinal", () => {
    const pose = calculateDpadVisualPose(35, -35, width, "UP");
    expect(pose.tiltXDegrees).toBeGreaterThan(0);
    expect(pose.tiltYDegrees).toBeGreaterThan(0);
    expect(Math.abs(pose.tiltXDegrees)).toBeCloseTo(Math.abs(pose.tiltYDegrees));
  });

  it("is symmetric across horizontal and vertical axes", () => {
    const upperRight = calculateDpadVisualPose(20, -30, width, "UP");
    const lowerLeft = calculateDpadVisualPose(-20, 30, width, "DOWN");
    expect(lowerLeft.tiltXDegrees).toBeCloseTo(-upperRight.tiltXDegrees);
    expect(lowerLeft.tiltYDegrees).toBeCloseTo(-upperRight.tiltYDegrees);
    expect(lowerLeft.normalizedDistance).toBeCloseTo(upperRight.normalizedDistance);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])("returns a level pose for invalid width %s", invalidWidth => {
    expect(calculateDpadVisualPose(10, 10, invalidWidth, "RIGHT")).toEqual(calculateDpadVisualPose(0, 0, width, null));
  });

  it("never returns NaN or Infinity for invalid displacement or configuration", () => {
    const invalidPoses = [
      calculateDpadVisualPose(Number.NaN, 1, width, "RIGHT"),
      calculateDpadVisualPose(1, Number.POSITIVE_INFINITY, width, "DOWN"),
      calculateDpadVisualPose(1, 1, width, "DOWN", {
        ...SILVERSHADOW_DPAD_VISUAL_DEFAULTS,
        maximumTiltDegrees: Number.NaN,
      }),
    ];
    for (const pose of invalidPoses) {
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    }
  });

  it("keeps smoothstep clamped with exact endpoints", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
  });

  it("keeps distance-to-tilt output monotonic across the full radius", () => {
    const samples = Array.from({ length: 21 }, (_, index) => index * 2.5);
    const tilts = samples.map(dx => Math.abs(calculateDpadVisualPose(dx, 0, width, "RIGHT").tiltYDegrees));
    for (let index = 1; index < tilts.length; index++) {
      expect(tilts[index]).toBeGreaterThanOrEqual(tilts[index - 1]);
    }
  });
});
