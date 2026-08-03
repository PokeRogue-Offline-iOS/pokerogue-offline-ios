import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync("src/touch-controls.ts", "utf8");
const markup = readFileSync("index.html", "utf8");
const styles = readFileSync("index.css", "utf8");
const uiInputs = readFileSync("src/ui-inputs.ts", "utf8");
const settings = readFileSync("src/system/settings/settings.ts", "utf8");
const gameData = readFileSync("src/system/game-data.ts", "utf8");

describe("System - Touch controls - visual integration contract", () => {
  it("keeps geometry stationary and never measures transformed artwork", () => {
    expect(runtime).toContain("this.dpadGeometry?.getBoundingClientRect()");
    expect(runtime).toContain("dpadInputWidthRatio = 0.84");
    expect(runtime).toContain("inputWidth: hitRect.width * TouchControl.dpadInputWidthRatio");
    expect(runtime).toContain("visualWidth: geometryRect.width");
    expect(runtime).not.toContain("this.dpadArtwork?.getBoundingClientRect()");
    expect(runtime).not.toContain("this.dpadVisual?.getBoundingClientRect()");
    expect(markup.indexOf('id="dpadGeometry"')).toBeLessThan(markup.indexOf('id="dpadPivot"'));
    expect(styles).toContain("#touchControls.silvershadow-rocking-visuals #dpadGeometry");
    expect(styles).toContain("width: 96%");
    expect(styles).toContain("Stable 96% visual geometry wrapper");
  });

  it("coalesces pointer movement into a single pending animation frame", () => {
    expect(runtime.match(/requestAnimationFrame\(/g)).toHaveLength(1);
    expect(runtime).toContain("if (this.dpadVisualFrameId !== null)");
    expect(runtime).toContain("this.pendingDpadVisualPose = pose");
    expect(runtime).toContain("cancelAnimationFrame(this.dpadVisualFrameId)");
    for (const direction of ["up", "right", "down", "left"]) {
      expect(runtime).toContain(`--dpad-light-${direction}`);
    }
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

  it("uses independent distance-sensitive open-chevron lighting", () => {
    for (const direction of ["up", "right", "down", "left"]) {
      expect(styles).toContain(`--ss-dpad-light-strength: var(--dpad-light-${direction})`);
      expect(markup).toContain(`ss-dpad-accent-core ss-dpad-accent-${direction}`);
      expect(markup).toContain(`ss-dpad-accent-halo ss-dpad-accent-${direction}`);
    }
    expect(markup).toContain('d="M42 20L50 12L58 20"');
    expect(markup).not.toContain('d="M43 15H57"');
    expect(styles).toContain("opacity: var(--ss-dpad-light-strength)");
  });

  it("keeps the proven chevrons unchanged while moving the clearer face outline", () => {
    for (const path of ["M42 20L50 12L58 20", "M80 42L88 50L80 58", "M42 80L50 88L58 80", "M20 42L12 50L20 58"]) {
      expect(markup.match(new RegExp(path, "g"))).toHaveLength(2);
    }
    expect(markup.indexOf('class="ss-dpad-face-highlight"')).toBeGreaterThan(markup.indexOf('id="dpadPivot"'));
    expect(styles).toContain("--ss-control-socket-edge");
    expect(styles).toContain("#dpadSocket {");
    expect(styles).not.toContain("#dpadSocket::before");
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

  it("routes every existing independent action node through accepted-pointer haptics", () => {
    const buttonIds = [
      "apadAction",
      "apadCancel",
      "apadPreviousTab",
      "apadNextTab",
      "apadOpenFilters",
      "apadMenu",
      "apadCycleForm",
      "apadCycleGender",
      "apadCycleShiny",
      "apadCycleAbility",
      "apadCycleNature",
      "apadCycleTera",
      "apadInfo",
      "apadStats",
    ];
    for (const id of buttonIds) {
      expect(markup).toMatch(new RegExp(`id="${id}"[^>]+data-key="[A-Z_]+"`));
    }
    expect(runtime).toContain('document.querySelectorAll("[data-key]")');
    expect(runtime).toContain("this.touchState.pressAction(event.pointerId, key)");
    expect(runtime).toContain("silverShadowHapticHandled: true");
    expect(uiInputs).toContain("!this.silverShadowHapticHandled");
  });

  it("uses the existing immediate and persisted vibration setting", () => {
    expect(settings).toContain("key: SettingKeys.Vibration");
    expect(settings).toContain('globalScene.enableVibration = Setting[index].options[value].value !== "Disabled"');
    expect(gameData).toContain("this.loadSettings()");
    expect(gameData).toContain("public saveSetting(setting: string, valueIndex: number)");
    expect(runtime).toContain("isEnabled: () => globalScene.enableVibration");
  });

  it("retains active indication with reduced motion", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("transition-duration: 0ms");
    expect(styles).toContain("--dpad-light-up: 0");
    expect(styles).toContain(".ss-dpad-accent-core");
  });
});
