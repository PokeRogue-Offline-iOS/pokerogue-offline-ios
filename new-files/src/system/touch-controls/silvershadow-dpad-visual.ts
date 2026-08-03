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
  lightUp: number;
  lightRight: number;
  lightDown: number;
  lightLeft: number;
}

export interface DpadVisualConfig {
  maximumTiltDegrees: number;
  maximumNeutralTiltDegrees: number;
  maximumShadowOffsetPx: number;
  maximumCompressionRatio: number;
  maximumLightStrength: number;
  neutralLightMaximum: number;
  primaryLightFloor: number;
  secondaryLightWeight: number;
}

/**
 * Runtime tuning for the visual-only D-pad pose. Perspective and transition
 * timings are CSS tokens because they do not participate in pose calculation.
 */
export const SILVERSHADOW_DPAD_VISUAL_DEFAULTS: Readonly<DpadVisualConfig> = Object.freeze({
  maximumTiltDegrees: 7.5,
  maximumNeutralTiltDegrees: 0.9,
  maximumShadowOffsetPx: 3.25,
  maximumCompressionRatio: 0.012,
  maximumLightStrength: 1,
  neutralLightMaximum: 0.12,
  primaryLightFloor: 0.72,
  secondaryLightWeight: 0.55,
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
  lightUp: 0,
  lightRight: 0,
  lightDown: 0,
  lightLeft: 0,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Smooth 0..1 response with level endpoints and no overshoot. */
export function smoothstep(value: number): number {
  const clamped = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

interface DirectionalLights {
  up: number;
  right: number;
  down: number;
  left: number;
}

function calculateDirectionalLights(
  unitX: number,
  unitY: number,
  response: number,
  activeDirection: CardinalDirection | null,
  config: DpadVisualConfig,
): DirectionalLights {
  const maximumLight = clamp(config.maximumLightStrength, 0, 1);
  const neutralLightMaximum = clamp(config.neutralLightMaximum, 0, maximumLight);
  const primaryLightFloor = clamp(config.primaryLightFloor, 0, 1);
  const secondaryLightWeight = clamp(config.secondaryLightWeight, 0, 1);
  const horizontalInfluence = Math.abs(unitX);
  const verticalInfluence = Math.abs(unitY);
  const lights: DirectionalLights = { up: 0, right: 0, down: 0, left: 0 };
  const verticalLight = unitY < 0 ? "up" : "down";
  const horizontalLight = unitX < 0 ? "left" : "right";

  if (activeDirection === null) {
    lights[verticalLight] = Math.min(response * verticalInfluence * maximumLight, neutralLightMaximum);
    lights[horizontalLight] = Math.min(response * horizontalInfluence * maximumLight, neutralLightMaximum);
    return lights;
  }

  const primaryIsVertical = activeDirection === "UP" || activeDirection === "DOWN";
  const primaryInfluence = primaryIsVertical ? verticalInfluence : horizontalInfluence;
  const secondaryInfluence = primaryIsVertical ? horizontalInfluence : verticalInfluence;
  const primaryStrength = response * (primaryLightFloor + (1 - primaryLightFloor) * primaryInfluence) * maximumLight;
  const secondaryStrength = response * secondaryInfluence * secondaryLightWeight * maximumLight;
  const primaryLight = activeDirection.toLowerCase() as keyof DirectionalLights;
  const secondaryLight = primaryIsVertical ? horizontalLight : verticalLight;
  lights[primaryLight] = clamp(primaryStrength, 0, maximumLight);
  lights[secondaryLight] = Math.min(clamp(secondaryStrength, 0, maximumLight), lights[primaryLight] * 0.8);
  return lights;
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
      config.maximumLightStrength,
      config.neutralLightMaximum,
      config.primaryLightFloor,
      config.secondaryLightWeight,
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
  const lights = calculateDirectionalLights(unitX, unitY, response, activeDirection, config);

  return {
    normalizedX: unitX * normalizedDistance,
    normalizedY: unitY * normalizedDistance,
    normalizedDistance,
    tiltXDegrees: -unitY * tiltMagnitude,
    tiltYDegrees: unitX * tiltMagnitude,
    shadowX: -unitX * shadowMagnitude,
    shadowY: -unitY * shadowMagnitude,
    pressedDepth: compressionLimit * response,
    lightUp: lights.up,
    lightRight: lights.right,
    lightDown: lights.down,
    lightLeft: lights.left,
  };
}
