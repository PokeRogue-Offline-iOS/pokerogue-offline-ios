import {
  calculateDpadVisualPose,
  SILVERSHADOW_DPAD_VISUAL_DEFAULTS,
  smoothstep,
} from "#system/touch-controls/silvershadow-dpad-visual";
import { resolveDpadDirection, SilverShadowTouchInputState } from "#system/touch-controls/silvershadow-touch-input";
import { describe, expect, it, vi } from "vitest";

describe("System - Touch controls - D-pad visual pose", () => {
  const width = 100;
  const lightValues = (pose: ReturnType<typeof calculateDpadVisualPose>) => [
    pose.lightUp,
    pose.lightRight,
    pose.lightDown,
    pose.lightLeft,
  ];

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
      lightUp: 0,
      lightRight: 0,
      lightDown: 0,
      lightLeft: 0,
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
    [0, -50, 7.5, 0],
    [0, 50, -7.5, 0],
    [-50, 0, 0, -7.5],
    [50, 0, 0, 7.5],
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

  it("increases directional light continuously with radial distance", () => {
    const distances = [0, 10, 20, 30, 40, 50];
    const strengths = distances.map(dx => calculateDpadVisualPose(dx, 0, width, "RIGHT").lightRight);
    for (let index = 1; index < strengths.length; index++) {
      expect(strengths[index]).toBeGreaterThan(strengths[index - 1]);
    }
  });

  it("clamps directional light at the artwork edge and beyond", () => {
    const edge = calculateDpadVisualPose(50, 0, width, "RIGHT");
    const outside = calculateDpadVisualPose(500, 0, width, "RIGHT");
    expect(edge.lightRight).toBe(SILVERSHADOW_DPAD_VISUAL_DEFAULTS.maximumLightStrength);
    expect(outside.lightRight).toBe(edge.lightRight);
  });

  it.each([
    [0, -50, "UP", "lightUp"],
    [50, 0, "RIGHT", "lightRight"],
    [0, 50, "DOWN", "lightDown"],
    [-50, 0, "LEFT", "lightLeft"],
  ] as const)("lights only the active cardinal at a pure %s/%s position", (dx, dy, direction, light) => {
    const pose = calculateDpadVisualPose(dx, dy, width, direction);
    expect(pose[light]).toBe(1);
    expect(lightValues(pose).filter(value => value > 0)).toHaveLength(1);
  });

  it("lights both adjacent chevrons for a diagonal visual position", () => {
    const pose = calculateDpadVisualPose(35, -35, width, "UP");
    expect(pose.lightUp).toBeGreaterThan(0);
    expect(pose.lightRight).toBeGreaterThan(0);
    expect(pose.lightUp).toBeGreaterThan(pose.lightRight);
    expect(pose.lightDown).toBe(0);
    expect(pose.lightLeft).toBe(0);
  });

  it("weights the adjacent diagonal light below the primary light", () => {
    const pose = calculateDpadVisualPose(40, -30, width, "RIGHT");
    expect(pose.lightRight).toBeGreaterThan(pose.lightUp);
    expect(pose.lightUp).toBeCloseTo(0.55 * 0.6);
  });

  it("never illuminates the direction opposite the active cardinal", () => {
    const samples = [
      calculateDpadVisualPose(30, -40, width, "UP"),
      calculateDpadVisualPose(30, 40, width, "DOWN"),
      calculateDpadVisualPose(-40, -30, width, "LEFT"),
      calculateDpadVisualPose(40, 30, width, "RIGHT"),
    ];
    expect(samples[0].lightDown).toBe(0);
    expect(samples[1].lightUp).toBe(0);
    expect(samples[2].lightRight).toBe(0);
    expect(samples[3].lightLeft).toBe(0);
  });

  it("keeps neutral preview lighting subtle and directionally local", () => {
    const pose = calculateDpadVisualPose(8, -8, width, null);
    expect(pose.lightUp).toBeGreaterThan(0);
    expect(pose.lightRight).toBeGreaterThan(0);
    expect(Math.max(...lightValues(pose))).toBeLessThanOrEqual(SILVERSHADOW_DPAD_VISUAL_DEFAULTS.neutralLightMaximum);
    expect(pose.lightDown).toBe(0);
    expect(pose.lightLeft).toBe(0);
  });

  it("keeps every light finite and within its normalized range", () => {
    for (const [dx, dy] of [
      [1, 1],
      [50, 0],
      [-500, 500],
    ]) {
      const pose = calculateDpadVisualPose(dx, dy, width, "DOWN");
      for (const light of lightValues(pose)) {
        expect(Number.isFinite(light)).toBe(true);
        expect(light).toBeGreaterThanOrEqual(0);
        expect(light).toBeLessThanOrEqual(1);
      }
    }
  });

  it("does not alter the cardinal-only digital resolver result", () => {
    const samples = [
      [40, -30, "RIGHT"],
      [30, -40, "UP"],
      [-40, 30, "LEFT"],
      [-30, 40, "DOWN"],
    ] as const;
    for (const [dx, dy, expected] of samples) {
      const direction = resolveDpadDirection(dx, dy, width);
      calculateDpadVisualPose(dx, dy, width, direction);
      expect(direction).toBe(expected);
      expect(["UP", "RIGHT", "DOWN", "LEFT"]).toContain(direction);
    }
  });

  it("does not emit additional input events when visual lighting updates", () => {
    const press = vi.fn();
    const release = vi.fn();
    const input = new SilverShadowTouchInputState({ press, release });
    expect(input.captureDpad(7, 30, -40, 0, 0, width)).toBe(true);
    expect(input.activeDirection).toBe("UP");

    for (const [dx, dy] of [
      [30, -40],
      [35, -35],
      [40, -30],
    ]) {
      calculateDpadVisualPose(dx, dy, width, input.activeDirection);
    }

    expect(press).toHaveBeenCalledTimes(1);
    expect(press).toHaveBeenCalledWith("UP");
    expect(release).not.toHaveBeenCalled();
  });
});
