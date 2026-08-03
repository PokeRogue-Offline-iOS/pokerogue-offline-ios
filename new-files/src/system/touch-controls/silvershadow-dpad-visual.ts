import type { CardinalDirection } from "#system/touch-controls/silvershadow-touch-input";

export interface DpadVisualPose {
  normalizedX: number;
  normalizedY: number;
  normalizedDistance: number;
  tiltXDegrees: number;
  tiltYDegrees: number;
  shadowX: number;
  shadowY: number;
  pressedDepth: number;
}

export interface DpadVisualConfig {
  maximumTiltDegrees: number;
  maximumNeutralTiltDegrees: number;
  maximumShadowOffsetPx: number;
  maximumCompressionRatio: number;
}

/**
 * Runtime tuning for the visual-only D-pad pose. Perspective and transition
 * timings are CSS tokens because they do not participate in pose calculation.
 */
export const SILVERSHADOW_DPAD_VISUAL_DEFAULTS: Readonly<DpadVisualConfig> = Object.freeze({
  maximumTiltDegrees: 6,
  maximumNeutralTiltDegrees: 0.75,
  maximumShadowOffsetPx: 2.5,
  maximumCompressionRatio: 0.01,
});

const levelPose: Readonly<DpadVisualPose> = Object.freeze({
  normalizedX: 0,
  normalizedY: 0,
  normalizedDistance: 0,
  tiltXDegrees: 0,
  tiltYDegrees: 0,
  shadowX: 0,
  shadowY: 0,
  pressedDepth: 0,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Smooth 0..1 response with level endpoints and no overshoot. */
export function smoothstep(value: number): number {
  const clamped = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Calculate a physical-looking visual pose without changing digital input.
 *
 * CSS sign convention: positive rotateX sinks the top arm, while positive
 * rotateY sinks the right arm. Therefore an upward pointer displacement
 * (negative DOM Y) produces positive X tilt.
 */
export function calculateDpadVisualPose(
  dx: number,
  dy: number,
  dpadWidth: number,
  activeDirection: CardinalDirection | null,
  config: DpadVisualConfig = SILVERSHADOW_DPAD_VISUAL_DEFAULTS,
): DpadVisualPose {
  if (
    ![dx, dy, dpadWidth].every(Number.isFinite)
    || dpadWidth <= 0
    || ![
      config.maximumTiltDegrees,
      config.maximumNeutralTiltDegrees,
      config.maximumShadowOffsetPx,
      config.maximumCompressionRatio,
    ].every(Number.isFinite)
  ) {
    return { ...levelPose };
  }

  const visualRadius = dpadWidth / 2;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance === 0) {
    return { ...levelPose };
  }

  const normalizedDistance = clamp(distance / visualRadius, 0, 1);
  const unitX = dx / distance;
  const unitY = dy / distance;
  const response = smoothstep(normalizedDistance);
  const maximumTilt = Math.max(0, config.maximumTiltDegrees);
  const neutralTilt = Math.min(maximumTilt, Math.max(0, config.maximumNeutralTiltDegrees));
  const tiltMagnitude =
    activeDirection === null ? Math.min(maximumTilt * response, neutralTilt) : maximumTilt * response;
  const shadowMagnitude = Math.max(0, config.maximumShadowOffsetPx) * response;
  const compressionLimit = clamp(config.maximumCompressionRatio, 0, 1);

  return {
    normalizedX: unitX * normalizedDistance,
    normalizedY: unitY * normalizedDistance,
    normalizedDistance,
    tiltXDegrees: -unitY * tiltMagnitude,
    tiltYDegrees: unitX * tiltMagnitude,
    shadowX: -unitX * shadowMagnitude,
    shadowY: -unitY * shadowMagnitude,
    pressedDepth: compressionLimit * response,
  };
}
