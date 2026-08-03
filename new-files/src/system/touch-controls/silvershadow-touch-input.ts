/*
 * Touch-state behavior adapted from Gen1Recomp's TouchControls.lua.
 * Gen1Recomp portions are Copyright 2026 BOIS CLUB GAMES, LLC and MIT licensed.
 */

export const SILVERSHADOW_DPAD_DEAD_ZONE_RATIO = 0.16;

export type CardinalDirection = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface TouchInputSink {
  press(key: string): void;
  release(key: string): void;
}

/**
 * Resolve one cardinal direction from a point relative to the D-pad center.
 *
 * The neutral area is a square whose half-size is 16% of the visible D-pad
 * width. Exact horizontal/vertical ties resolve horizontally, matching the
 * Gen1Recomp baseline.
 */
export function resolveDpadDirection(
  dx: number,
  dy: number,
  dpadWidth: number,
  deadZoneRatio = SILVERSHADOW_DPAD_DEAD_ZONE_RATIO,
): CardinalDirection | null {
  if (![dx, dy, dpadWidth, deadZoneRatio].every(Number.isFinite) || dpadWidth <= 0 || deadZoneRatio < 0) {
    return null;
  }

  const deadZone = dpadWidth * deadZoneRatio;
  if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) {
    return null;
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? "RIGHT" : "LEFT";
  }

  return dy > 0 ? "DOWN" : "UP";
}

/**
 * Pure multi-pointer ownership and held-button state for the touch overlay.
 * DOM and Phaser integration live in TouchControl; this class is deliberately
 * platform-free so lifecycle and transition behavior can be unit tested.
 */
export class SilverShadowTouchInputState {
  private dpadPointerId: number | null = null;
  private dpadDirection: CardinalDirection | null = null;
  private readonly actionPointers = new Map<number, string>();
  private readonly heldCounts = new Map<string, number>();

  constructor(private readonly sink: TouchInputSink) {}

  public get dpadOwner(): number | null {
    return this.dpadPointerId;
  }

  public get activeDirection(): CardinalDirection | null {
    return this.dpadDirection;
  }

  public get actionPointerCount(): number {
    return this.actionPointers.size;
  }

  public isHeld(key: string): boolean {
    return (this.heldCounts.get(key) ?? 0) > 0;
  }

  /** Capture an unowned D-pad, including a neutral-center touch. */
  public captureDpad(
    pointerId: number,
    x: number,
    y: number,
    centerX: number,
    centerY: number,
    dpadWidth: number,
  ): boolean {
    if (this.dpadPointerId !== null || this.actionPointers.has(pointerId)) {
      return false;
    }

    this.dpadPointerId = pointerId;
    this.setDpadDirection(resolveDpadDirection(x - centerX, y - centerY, dpadWidth));
    return true;
  }

  /** Update only the pointer that currently owns the D-pad. */
  public moveDpad(
    pointerId: number,
    x: number,
    y: number,
    centerX: number,
    centerY: number,
    dpadWidth: number,
  ): boolean {
    if (pointerId !== this.dpadPointerId) {
      return false;
    }

    this.setDpadDirection(resolveDpadDirection(x - centerX, y - centerY, dpadWidth));
    return true;
  }

  /** Register one independent pointer against an action button. */
  public pressAction(pointerId: number, key: string): boolean {
    if (this.actionPointers.has(pointerId) || pointerId === this.dpadPointerId) {
      return false;
    }

    this.actionPointers.set(pointerId, key);
    this.hold(key);
    return true;
  }

  /** Release either kind of pointer. Unknown pointers are harmless. */
  public releasePointer(pointerId: number): boolean {
    if (pointerId === this.dpadPointerId) {
      this.setDpadDirection(null);
      this.dpadPointerId = null;
      return true;
    }

    const key = this.actionPointers.get(pointerId);
    if (key === undefined) {
      return false;
    }

    this.actionPointers.delete(pointerId);
    this.release(key);
    return true;
  }

  /** Pointer cancellation has the same no-stuck-input semantics as release. */
  public cancelPointer(pointerId: number): boolean {
    return this.releasePointer(pointerId);
  }

  /** Release every held game input on visibility loss, disable, or teardown. */
  public reset(): void {
    const heldKeys = [...this.heldCounts.keys()];
    this.dpadPointerId = null;
    this.dpadDirection = null;
    this.actionPointers.clear();
    this.heldCounts.clear();

    for (const key of heldKeys) {
      this.sink.release(key);
    }
  }

  private setDpadDirection(direction: CardinalDirection | null): void {
    if (direction === this.dpadDirection) {
      return;
    }

    if (this.dpadDirection !== null) {
      this.release(this.dpadDirection);
    }

    this.dpadDirection = direction;
    if (direction !== null) {
      this.hold(direction);
    }
  }

  private hold(key: string): void {
    const nextCount = (this.heldCounts.get(key) ?? 0) + 1;
    this.heldCounts.set(key, nextCount);
    if (nextCount === 1) {
      this.sink.press(key);
    }
  }

  private release(key: string): void {
    const count = this.heldCounts.get(key);
    if (count === undefined) {
      return;
    }

    if (count > 1) {
      this.heldCounts.set(key, count - 1);
      return;
    }

    this.heldCounts.delete(key);
    this.sink.release(key);
  }
}
