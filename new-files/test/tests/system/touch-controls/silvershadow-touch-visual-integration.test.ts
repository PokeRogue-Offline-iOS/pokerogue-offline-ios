import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync("src/touch-controls.ts", "utf8");
const markup = readFileSync("index.html", "utf8");
const styles = readFileSync("index.css", "utf8");

describe("System - Touch controls - visual integration contract", () => {
  it("keeps geometry stationary and never measures transformed artwork", () => {
    expect(runtime).toContain("this.dpadGeometry?.getBoundingClientRect()");
    expect(runtime).not.toContain("this.dpadArtwork?.getBoundingClientRect()");
    expect(runtime).not.toContain("this.dpadVisual?.getBoundingClientRect()");
    expect(markup.indexOf('id="dpadGeometry"')).toBeLessThan(markup.indexOf('id="dpadPivot"'));
    expect(styles).toContain("#touchControls.silvershadow-rocking-visuals #dpadGeometry");
  });

  it("coalesces pointer movement into a single pending animation frame", () => {
    expect(runtime.match(/requestAnimationFrame\(/g)).toHaveLength(1);
    expect(runtime).toContain("if (this.dpadVisualFrameId !== null)");
    expect(runtime).toContain("this.pendingDpadVisualPose = pose");
    expect(runtime).toContain("cancelAnimationFrame(this.dpadVisualFrameId)");
  });

  it("resets visual pose for pointer and lifecycle cleanup", () => {
    expect(runtime).toContain("if (releasedDpad)");
    expect(runtime).toContain("this.resetDpadVisualPose()");
    expect(runtime).toContain('window.addEventListener("orientationchange", reset');
    expect(runtime).toContain('document.addEventListener(\n      "visibilitychange"');
  });

  it("avoids redundant direction artwork updates", () => {
    expect(runtime).toContain("artworkDirection !== this.lastDpadArtworkDirection");
    expect(runtime).toContain("this.lastDpadArtworkDirection = artworkDirection");
  });

  it("keeps action-button pressed visuals independent", () => {
    expect(runtime).toContain("actionPointerNodes = new Map<number, HTMLElement>()");
    expect(runtime).toContain("![...this.actionPointerNodes.values()].includes(node)");
    expect(styles).toContain(".apad-button.active");
    expect(styles).not.toContain(".buttons-active");
  });

  it("keeps D-pad and button visual systems able to coexist", () => {
    expect(styles).toContain("#dpad.captured #dpadPivot");
    expect(styles).toContain(".apad-button.active");
    expect(runtime).toContain("this.updateDpadVisualPose(event.clientX, event.clientY, geometry)");
  });

  it("clears transient state for auto-hide and configuration mode", () => {
    expect(runtime).toContain("this.resetTransientTouchVisuals()");
    expect(runtime).toContain("if (isConfigMode)");
    expect(styles).toContain("#touchControls.config-mode #dpadPivot");
  });

  it("retains flat and upstream fallbacks", () => {
    expect(markup).toContain('id="dpadArtwork"');
    expect(markup).toContain('id="dpadUp" data-key="UP"');
    expect(styles).toContain("Flat Gen1Recomp image remains available");
    expect(runtime).toContain("hasCompleteRockingLayer");
    expect(runtime).toContain("this.initLegacyControls()");
  });

  it("preserves current action mappings while presenting Menu as Start", () => {
    for (const key of [
      "ACTION",
      "CANCEL",
      "CYCLE_FORM",
      "CYCLE_SHINY",
      "STATS",
      "MENU",
      "CYCLE_GENDER",
      "CYCLE_ABILITY",
      "CYCLE_NATURE",
      "CYCLE_TERA",
    ]) {
      expect(markup).toContain(`data-key="${key}"`);
    }
    expect(markup).toContain('<div id="apadMenu" class="apad-button apad-rectangle apad-small" data-key="MENU">');
    expect(markup).toContain('<span class="apad-label">Start</span>');
  });

  it("retains active indication with reduced motion", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("transition-duration: 0ms");
    expect(styles).toContain('#dpad[data-active-direction="up"] .ss-dpad-accent-up');
  });
});
