#!/usr/bin/env node

/**
 * Install SilverShadow's Gen1Recomp-inspired continuous D-pad while retaining
 * upstream's SVG/button binding as a runtime fallback.
 */

const fs = require("fs");
const path = require("path");

const repositoryRoot = path.join(__dirname, "..", "..", "..");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Could not find ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(filePath, source) {
  fs.writeFileSync(filePath, source, "utf8");
  console.log(`Written: ${filePath}`);
}

function replaceRequired(source, search, replacement, label) {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1) {
    fail(
      `Expected exactly one ${label}, found ${occurrences}. `
        + "The upstream PokeRogue source or patch order may have changed.",
    );
  }
  return source.replace(search, replacement);
}

function copyRequired(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    fail(`Could not find required SilverShadow file ${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Copied: ${targetPath}`);
}

const helperRelativePath = path.join(
  "src",
  "system",
  "touch-controls",
  "silvershadow-touch-input.ts",
);
const visualHelperRelativePath = path.join(
  "src",
  "system",
  "touch-controls",
  "silvershadow-dpad-visual.ts",
);
const hapticsHelperRelativePath = path.join(
  "src",
  "system",
  "touch-controls",
  "silvershadow-touch-haptics.ts",
);
const testRelativePath = path.join(
  "test",
  "tests",
  "system",
  "touch-controls",
  "silvershadow-touch-input.test.ts",
);
const visualTestRelativePath = path.join(
  "test",
  "tests",
  "system",
  "touch-controls",
  "silvershadow-dpad-visual.test.ts",
);
const visualIntegrationTestRelativePath = path.join(
  "test",
  "tests",
  "system",
  "touch-controls",
  "silvershadow-touch-visual-integration.test.ts",
);
const hapticsTestRelativePath = path.join(
  "test",
  "tests",
  "system",
  "touch-controls",
  "silvershadow-touch-haptics.test.ts",
);

copyRequired(
  path.join(repositoryRoot, "new-files", helperRelativePath),
  path.join("pokerogue-src", helperRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", testRelativePath),
  path.join("pokerogue-src", testRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", visualHelperRelativePath),
  path.join("pokerogue-src", visualHelperRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", visualTestRelativePath),
  path.join("pokerogue-src", visualTestRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", visualIntegrationTestRelativePath),
  path.join("pokerogue-src", visualIntegrationTestRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", hapticsHelperRelativePath),
  path.join("pokerogue-src", hapticsHelperRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", hapticsTestRelativePath),
  path.join("pokerogue-src", hapticsTestRelativePath),
);

const dpadAssets = [
  "dpad.png",
  "dpad_up.png",
  "dpad_down.png",
  "dpad_left.png",
  "dpad_right.png",
];

for (const asset of dpadAssets) {
  copyRequired(
    path.join(repositoryRoot, "new-files", "assets", "images", "ui", "touch-controls", asset),
    path.join("pokerogue-src", "assets", "images", "ui", "touch-controls", asset),
  );
}

const touchControlsPath = path.join("pokerogue-src", "src", "touch-controls.ts");
let touchSource = readFile(touchControlsPath);

const silverImports = [
  `import type { DpadVisualPose } from "#system/touch-controls/silvershadow-dpad-visual";`,
  `import { calculateDpadVisualPose } from "#system/touch-controls/silvershadow-dpad-visual";`,
  `import { SilverShadowTouchHaptics } from "#system/touch-controls/silvershadow-touch-haptics";`,
  `import { SilverShadowTouchInputState } from "#system/touch-controls/silvershadow-touch-input";`,
];
if (!silverImports.every(silverImport => touchSource.includes(silverImport))) {
  touchSource = replaceRequired(
    touchSource,
    `import { Button } from "#enums/buttons";`,
    `import { Button } from "#enums/buttons";\n${silverImports.join("\n")}`,
    "Button import in src/touch-controls.ts",
  );
}

if (!touchSource.includes("silvershadow-continuous-dpad")) {
  const requiredAutoHideAnchors = [
    "private autoHideTimeout: ReturnType<typeof setTimeout> | null = null;",
    "private initAutoHide(): void",
    "this.initAutoHide();",
  ];
  for (const anchor of requiredAutoHideAnchors) {
    if (!touchSource.includes(anchor)) {
      fail(
        `Could not find expected auto-hide anchor ${JSON.stringify(anchor)}. `
          + "Apply auto-hide-touch-controls.js before this patch.",
      );
    }
  }

  const classStart = "export class TouchControl {";
  const classEnd = "\nconst doubleTapThresholdMillis = 500;";
  const startIndex = touchSource.indexOf(classStart);
  const endIndex = touchSource.indexOf(classEnd);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail("Could not locate the complete upstream TouchControl class.");
  }
  if (touchSource.indexOf(classStart, startIndex + classStart.length) >= 0) {
    fail("Found more than one TouchControl class.");
  }

  const enhancedClass = String.raw`export class TouchControl {
  // silvershadow-continuous-dpad
  private static readonly dpadInputWidthRatio = 0.84;
  readonly events: Phaser.Events.EventEmitter;
  private disabled = false;
  private readonly legacyButtonLock = new Set<string>();
  private readonly legacyInputIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly enhancedInputIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly actionPointerNodes = new Map<number, HTMLElement>();
  private readonly touchHaptics = new SilverShadowTouchHaptics({
    isEnabled: () => globalScene.enableVibration,
  });
  private readonly touchState = new SilverShadowTouchInputState(
    {
      press: key => this.pressEnhancedKey(key),
      release: key => this.releaseEnhancedKey(key),
    },
    this.touchHaptics,
  );
  private enhancedAbortController: AbortController | null = null;
  private readonly lifecycleAbortController = new AbortController();
  private fallbackInitialized = false;
  private dpadElement: HTMLElement | null = null;
  private dpadGeometry: HTMLElement | null = null;
  private dpadVisual: HTMLElement | null = null;
  private dpadArtwork: HTMLImageElement | null = null;
  private lastDpadArtworkDirection: string | null = null;
  private pendingDpadVisualPose: DpadVisualPose | null = null;
  private dpadVisualFrameId: number | null = null;
  private autoHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoHideObserver: MutationObserver | null = null;

  constructor() {
    this.events = globalScene.game.events;
    this.init();
    this.initAutoHide();
    this.initLifecycleCleanup();
  }

  /** Disable touch controls and release every held touch input first. */
  disable(): void {
    this.resetTouchInput();
    this.disabled = true;
  }

  /** Enable touch controls without changing keyboard/controller input. */
  enable(): void {
    this.disabled = false;
    this.resetTouchInput();
  }

  /**
   * Prefer the SilverShadow pointer controller. If required browser features,
   * markup, or artwork are unavailable, retain upstream's isolated controls.
   */
  init(): void {
    const dpad = document.getElementById("dpad");
    const geometry = document.getElementById("dpadGeometry");
    const visual = document.getElementById("dpadVisual");
    const artwork = document.getElementById("dpadArtwork");
    const hasCompleteRockingLayer = ["dpadSocket", "dpadShadow", "dpadPivot", "dpadFace"].every(
      id => document.getElementById(id) instanceof HTMLElement,
    );
    if (!("PointerEvent" in window) || !(dpad instanceof HTMLElement) || !(artwork instanceof HTMLImageElement)) {
      this.initLegacyControls();
      return;
    }

    this.dpadElement = dpad;
    this.dpadArtwork = artwork;
    if (geometry instanceof HTMLElement && visual instanceof HTMLElement && hasCompleteRockingLayer) {
      this.dpadGeometry = geometry;
      this.dpadVisual = visual;
    }
    this.enhancedAbortController = new AbortController();
    const { signal } = this.enhancedAbortController;
    const touchControls = document.getElementById("touchControls");
    touchControls?.classList.add("silvershadow-touch-upgrade");
    if (this.dpadGeometry && this.dpadVisual) {
      touchControls?.classList.add("silvershadow-rocking-visuals");
    }

    artwork.addEventListener(
      "error",
      () => {
        if (!this.dpadVisual) {
          this.disableEnhancedMode();
        }
      },
      { once: true, signal },
    );
    this.preloadDpadArtwork();
    this.bindContinuousDpad(dpad, signal);

    for (const node of document.querySelectorAll("[data-key]")) {
      if (!(node instanceof HTMLElement) || dpad.contains(node)) {
        continue;
      }
      const key = node.dataset.key;
      if (key) {
        this.bindEnhancedAction(node, key, signal);
      }
    }

    window.addEventListener("pointerup", event => this.finishEnhancedPointer(event.pointerId), { signal });
    window.addEventListener("pointercancel", event => this.finishEnhancedPointer(event.pointerId), { signal });
  }

  private initLegacyControls(): void {
    if (this.fallbackInitialized) {
      return;
    }
    this.fallbackInitialized = true;
    for (const node of document.querySelectorAll("[data-key]")) {
      if (node instanceof HTMLElement && node.dataset.key) {
        this.bindLegacyKey(node, node.dataset.key);
      }
    }
  }

  private disableEnhancedMode(): void {
    this.resetTouchInput();
    this.resetDpadVisualPose(true);
    this.enhancedAbortController?.abort();
    this.enhancedAbortController = null;
    document
      .getElementById("touchControls")
      ?.classList.remove("silvershadow-touch-upgrade", "silvershadow-rocking-visuals");
    this.dpadElement = null;
    this.dpadGeometry = null;
    this.dpadVisual = null;
    this.dpadArtwork = null;
    this.initLegacyControls();
  }

  private bindContinuousDpad(dpad: HTMLElement, signal: AbortSignal): void {
    dpad.addEventListener(
      "pointerdown",
      event => {
        if (this.disabled) {
          return;
        }
        event.preventDefault();
        const geometry = this.getDpadGeometry();
        if (
          !geometry
          || !this.touchState.captureDpad(
            event.pointerId,
            event.clientX,
            event.clientY,
            geometry.centerX,
            geometry.centerY,
            geometry.inputWidth,
          )
        ) {
          return;
        }
        try {
          dpad.setPointerCapture(event.pointerId);
        } catch {
          // Window-level pointer cleanup remains active if capture is unavailable.
        }
        this.updateDpadArtwork();
        this.updateDpadVisualPose(event.clientX, event.clientY, geometry);
      },
      { signal },
    );

    dpad.addEventListener(
      "pointermove",
      event => {
        const geometry = this.getDpadGeometry();
        if (
          !geometry
          || !this.touchState.moveDpad(
            event.pointerId,
            event.clientX,
            event.clientY,
            geometry.centerX,
            geometry.centerY,
            geometry.inputWidth,
          )
        ) {
          return;
        }
        event.preventDefault();
        this.updateDpadArtwork();
        this.updateDpadVisualPose(event.clientX, event.clientY, geometry);
      },
      { signal },
    );

    const finish = (event: PointerEvent): void => {
      if (event.pointerId !== this.touchState.dpadOwner) {
        return;
      }
      event.preventDefault();
      this.finishEnhancedPointer(event.pointerId);
    };
    dpad.addEventListener("pointerup", finish, { signal });
    dpad.addEventListener("pointercancel", finish, { signal });
    dpad.addEventListener("lostpointercapture", event => this.finishEnhancedPointer(event.pointerId), { signal });
  }

  private bindEnhancedAction(node: HTMLElement, key: string, signal: AbortSignal): void {
    node.addEventListener(
      "pointerdown",
      event => {
        if (this.disabled || !this.touchState.pressAction(event.pointerId, key)) {
          return;
        }
        event.preventDefault();
        this.actionPointerNodes.set(event.pointerId, node);
        node.classList.add("active");
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
          // Window-level pointer cleanup remains active if capture is unavailable.
        }
      },
      { signal },
    );
    node.addEventListener("pointerup", event => this.finishEnhancedPointer(event.pointerId), { signal });
    node.addEventListener("pointercancel", event => this.finishEnhancedPointer(event.pointerId), { signal });
    node.addEventListener("lostpointercapture", event => this.finishEnhancedPointer(event.pointerId), { signal });
  }

  private finishEnhancedPointer(pointerId: number): void {
    const releasedDpad = pointerId === this.touchState.dpadOwner;
    const node = this.actionPointerNodes.get(pointerId);
    this.actionPointerNodes.delete(pointerId);
    if (node && ![...this.actionPointerNodes.values()].includes(node)) {
      node.classList.remove("active");
    }
    this.touchState.releasePointer(pointerId);
    if (releasedDpad) {
      this.updateDpadArtwork();
      this.resetDpadVisualPose();
    }
  }

  private getDpadGeometry(): { centerX: number; centerY: number; inputWidth: number; visualWidth: number } | null {
    if (!this.dpadElement) {
      return null;
    }
    // dpadGeometry never transforms; the pivoting face is deliberately not
    // measured so visual rocking cannot feed back into digital input.
    const geometryRect = this.dpadGeometry?.getBoundingClientRect();
    if (geometryRect && geometryRect.width > 0) {
      const hitRect = this.dpadElement.getBoundingClientRect();
      return {
        centerX: geometryRect.left + geometryRect.width / 2,
        centerY: geometryRect.top + geometryRect.height / 2,
        // Keep the hardware-proven dead-zone geometry at 84% even though the
        // stationary artwork wrapper is now a larger 96%.
        inputWidth: hitRect.width * TouchControl.dpadInputWidthRatio,
        visualWidth: geometryRect.width,
      };
    }
    const hitRect = this.dpadElement.getBoundingClientRect();
    return {
      centerX: hitRect.left + hitRect.width / 2,
      centerY: hitRect.top + hitRect.height / 2,
      inputWidth: hitRect.width * TouchControl.dpadInputWidthRatio,
      visualWidth: hitRect.width * TouchControl.dpadInputWidthRatio,
    };
  }

  private preloadDpadArtwork(): void {
    for (const name of ["dpad", "dpad_up", "dpad_down", "dpad_left", "dpad_right"]) {
      const image = new Image();
      image.src = "images/ui/touch-controls/" + name + ".png";
    }
  }

  private updateDpadArtwork(): void {
    if (!this.dpadArtwork || !this.dpadElement) {
      return;
    }
    const direction = this.touchState.activeDirection;
    const artworkDirection = direction?.toLowerCase() ?? "neutral";
    if (artworkDirection !== this.lastDpadArtworkDirection) {
      this.dpadArtwork.src = direction
        ? "images/ui/touch-controls/dpad_" + artworkDirection + ".png"
        : "images/ui/touch-controls/dpad.png";
      this.lastDpadArtworkDirection = artworkDirection;
    }
    this.dpadElement.dataset.activeDirection = artworkDirection;
    this.dpadElement.classList.toggle("captured", this.touchState.dpadOwner !== null);
    this.dpadElement.classList.toggle("active", direction !== null);
  }

  private updateDpadVisualPose(
    pointerX: number,
    pointerY: number,
    geometry: { centerX: number; centerY: number; inputWidth: number; visualWidth: number },
  ): void {
    this.scheduleDpadVisualPose(
      calculateDpadVisualPose(
        pointerX - geometry.centerX,
        pointerY - geometry.centerY,
        geometry.visualWidth,
        this.touchState.activeDirection,
      ),
    );
  }

  /** Coalesce pointer movement into at most one DOM write per animation frame. */
  private scheduleDpadVisualPose(pose: DpadVisualPose): void {
    if (!this.dpadVisual) {
      return;
    }
    this.pendingDpadVisualPose = pose;
    if (this.dpadVisualFrameId !== null) {
      return;
    }
    this.dpadVisualFrameId = requestAnimationFrame(() => {
      this.dpadVisualFrameId = null;
      const latestPose = this.pendingDpadVisualPose;
      this.pendingDpadVisualPose = null;
      if (latestPose) {
        this.applyDpadVisualPose(latestPose);
      }
    });
  }

  private applyDpadVisualPose(pose: DpadVisualPose): void {
    if (!this.dpadVisual) {
      return;
    }
    this.dpadVisual.style.setProperty("--dpad-tilt-x", pose.tiltXDegrees.toFixed(3) + "deg");
    this.dpadVisual.style.setProperty("--dpad-tilt-y", pose.tiltYDegrees.toFixed(3) + "deg");
    this.dpadVisual.style.setProperty("--dpad-shadow-x", pose.shadowX.toFixed(3) + "px");
    this.dpadVisual.style.setProperty("--dpad-shadow-y", pose.shadowY.toFixed(3) + "px");
    this.dpadVisual.style.setProperty("--dpad-scale", (1 - pose.pressedDepth).toFixed(4));
    this.dpadVisual.style.setProperty("--dpad-light-up", pose.lightUp.toFixed(4));
    this.dpadVisual.style.setProperty("--dpad-light-right", pose.lightRight.toFixed(4));
    this.dpadVisual.style.setProperty("--dpad-light-down", pose.lightDown.toFixed(4));
    this.dpadVisual.style.setProperty("--dpad-light-left", pose.lightLeft.toFixed(4));
  }

  private resetDpadVisualPose(immediate = false): void {
    const levelPose = calculateDpadVisualPose(0, 0, 1, null);
    if (!immediate) {
      this.scheduleDpadVisualPose(levelPose);
      return;
    }
    if (this.dpadVisualFrameId !== null) {
      cancelAnimationFrame(this.dpadVisualFrameId);
      this.dpadVisualFrameId = null;
    }
    this.pendingDpadVisualPose = null;
    this.applyDpadVisualPose(levelPose);
  }

  private pressEnhancedKey(key: string): void {
    if (this.disabled || !this.emitTouchInput("input_down", key)) {
      return;
    }
    const previous = this.enhancedInputIntervals.get(key);
    if (previous) {
      clearInterval(previous);
    }
    this.enhancedInputIntervals.set(
      key,
      setInterval(() => {
        if (!this.emitTouchInput("input_down", key)) {
          const interval = this.enhancedInputIntervals.get(key);
          if (interval) {
            clearInterval(interval);
          }
          this.enhancedInputIntervals.delete(key);
        }
      }, repeatInputDelayMillis),
    );
  }

  private releaseEnhancedKey(key: string): void {
    const interval = this.enhancedInputIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.enhancedInputIntervals.delete(key);
    }
    this.emitTouchInput("input_up", key, true);
  }

  /** Upstream's isolated-button behavior, retained for runtime fallback. */
  private bindLegacyKey(node: HTMLElement, key: string): void {
    node.addEventListener("touchstart", event => {
      this.legacyButtonDown(node, key);
      event.preventDefault();
      node.dataset.skipPointerEvent = "true";
    });
    node.addEventListener("pointerdown", event => {
      if (node.dataset.skipPointerEvent) {
        return;
      }
      event.preventDefault();
      this.legacyButtonDown(node, key);
    });
    const touchFinish = (event: TouchEvent): void => {
      event.preventDefault();
      this.legacyButtonUp(node, key);
      delete node.dataset.skipPointerEvent;
      node.dataset.skipPointerUp = "true";
    };
    node.addEventListener("touchend", touchFinish);
    node.addEventListener("touchcancel", touchFinish);
    node.addEventListener("pointerup", event => {
      if (node.dataset.skipPointerUp) {
        delete node.dataset.skipPointerUp;
        return;
      }
      event.preventDefault();
      this.legacyButtonUp(node, key);
    });
    node.addEventListener("pointercancel", () => this.legacyButtonUp(node, key));
  }

  private legacyButtonDown(node: HTMLElement, key: string): void {
    if (this.legacyButtonLock.has(key) || !this.emitTouchInput("input_down", key)) {
      return;
    }
    this.touchHaptics.trigger(["UP", "RIGHT", "DOWN", "LEFT"].includes(key) ? "direction-change" : "button-press");
    const previous = this.legacyInputIntervals.get(key);
    if (previous) {
      clearInterval(previous);
    }
    this.legacyInputIntervals.set(
      key,
      setInterval(() => {
        if (!this.emitTouchInput("input_down", key)) {
          const interval = this.legacyInputIntervals.get(key);
          if (interval) {
            clearInterval(interval);
          }
          this.legacyInputIntervals.delete(key);
        }
      }, repeatInputDelayMillis),
    );
    this.legacyButtonLock.add(key);
    node.classList.add("active");
  }

  private legacyButtonUp(node: HTMLElement, key: string): void {
    if (!this.legacyButtonLock.delete(key)) {
      return;
    }
    const interval = this.legacyInputIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.legacyInputIntervals.delete(key);
    }
    this.emitTouchInput("input_up", key, true);
    node.classList.remove("active");
  }

  private emitTouchInput(eventType: "input_down" | "input_up", key: string, allowWhileDisabled = false): boolean {
    if (!Object.hasOwn(Button, key) || (this.disabled && !allowWhileDisabled)) {
      return false;
    }
    this.events.emit(eventType, {
      controller_type: "keyboard",
      button: Button[key],
      isTouch: true,
      silverShadowHapticHandled: true,
    });
    return true;
  }

  /** Preserve SilverShadow's two-second auto-hide behavior. */
  private initAutoHide(): void {
    const touchControls = document.getElementById("touchControls");
    if (!touchControls) {
      return;
    }
    let wasVisible = touchControls.classList.contains("visible");
    let wasConfigMode = touchControls.classList.contains("config-mode");
    const clearAutoHideTimeout = (): void => {
      if (this.autoHideTimeout !== null) {
        clearTimeout(this.autoHideTimeout);
        this.autoHideTimeout = null;
      }
    };
    const revealControls = (): void => {
      clearAutoHideTimeout();
      touchControls.classList.remove("auto-hidden");
    };
    const scheduleAutoHide = (): void => {
      clearAutoHideTimeout();
      if (!touchControls.classList.contains("visible") || touchControls.classList.contains("config-mode")) {
        return;
      }
      this.autoHideTimeout = setTimeout(() => {
        if (touchControls.classList.contains("visible") && !touchControls.classList.contains("config-mode")) {
          this.resetTransientTouchVisuals();
          touchControls.classList.add("auto-hidden");
        }
        this.autoHideTimeout = null;
      }, autoHideTouchControlsDelayMillis);
    };
    const finishTouch = (event: TouchEvent): void => {
      if (event.touches.length === 0) {
        scheduleAutoHide();
      }
    };
    const { signal } = this.lifecycleAbortController;
    document.addEventListener("touchstart", revealControls, { capture: true, passive: true, signal });
    document.addEventListener("touchend", finishTouch, { capture: true, passive: true, signal });
    document.addEventListener("touchcancel", finishTouch, { capture: true, passive: true, signal });
    this.autoHideObserver = new MutationObserver(() => {
      const isVisible = touchControls.classList.contains("visible");
      const isConfigMode = touchControls.classList.contains("config-mode");
      const visibleStateChanged = isVisible !== wasVisible;
      const configStateChanged = isConfigMode !== wasConfigMode;
      wasVisible = isVisible;
      wasConfigMode = isConfigMode;
      if (!visibleStateChanged && !configStateChanged) {
        return;
      }
      if (!isVisible) {
        clearAutoHideTimeout();
        touchControls.classList.remove("auto-hidden");
        this.resetTouchInput();
        return;
      }
      revealControls();
      if (isConfigMode) {
        this.resetTouchInput();
        return;
      }
      if (!isConfigMode) {
        scheduleAutoHide();
      }
    });
    this.autoHideObserver.observe(touchControls, { attributes: true, attributeFilter: ["class"] });
    if (wasVisible && !wasConfigMode) {
      scheduleAutoHide();
    }
  }

  private initLifecycleCleanup(): void {
    const reset = (): void => this.resetTouchInput();
    const { signal } = this.lifecycleAbortController;
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState !== "visible") {
          reset();
        }
      },
      { signal },
    );
    window.addEventListener("blur", reset, { signal });
    window.addEventListener("pagehide", reset, { signal });
    window.addEventListener("orientationchange", reset, { signal });
    globalScene.events.on("shutdown", reset);
    globalScene.events.once("destroy", () => this.destroy());
  }

  private resetTouchInput(): void {
    this.touchState.reset();
    for (const interval of this.enhancedInputIntervals.values()) {
      clearInterval(interval);
    }
    this.enhancedInputIntervals.clear();
    for (const node of new Set(this.actionPointerNodes.values())) {
      node.classList.remove("active");
    }
    this.actionPointerNodes.clear();
    this.updateDpadArtwork();
    this.resetDpadVisualPose();

    for (const key of this.legacyButtonLock) {
      this.emitTouchInput("input_up", key, true);
    }
    this.legacyButtonLock.clear();
    for (const interval of this.legacyInputIntervals.values()) {
      clearInterval(interval);
    }
    this.legacyInputIntervals.clear();
    for (const node of document.querySelectorAll("[data-key]")) {
      node.classList.remove("active");
    }
  }

  private resetTransientTouchVisuals(): void {
    for (const node of new Set(this.actionPointerNodes.values())) {
      node.classList.remove("active");
    }
    this.updateDpadArtwork();
    this.resetDpadVisualPose();
  }

  /** Called by InputsController on focus loss. */
  deactivatePressedKey(): void {
    this.resetTouchInput();
  }

  /** Release input and detach listeners on Phaser scene teardown. */
  destroy(): void {
    this.resetTouchInput();
    this.resetDpadVisualPose(true);
    this.enhancedAbortController?.abort();
    this.lifecycleAbortController.abort();
    this.autoHideObserver?.disconnect();
    if (this.autoHideTimeout !== null) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }
  }
}
`;

  touchSource = touchSource.slice(0, startIndex) + enhancedClass + touchSource.slice(endIndex);
}

writeFile(touchControlsPath, touchSource);

// SilverShadow already delivers one accepted-transition haptic. Suppress only
// the older UI-direction vibration for those events so a touch never doubles.
const uiInputsPath = path.join("pokerogue-src", "src", "ui-inputs.ts");
let uiInputsSource = readFile(uiInputsPath);
if (!uiInputsSource.includes("silverShadowHapticHandled")) {
  uiInputsSource = replaceRequired(
    uiInputsSource,
    "  private inputsController: InputsController;",
    "  private inputsController: InputsController;\n  private silverShadowHapticHandled = false;",
    "UiInputs field anchor in src/ui-inputs.ts",
  );
  uiInputsSource = replaceRequired(
    uiInputsSource,
    `        const actions = this.getActionsKeyDown();
        if (!Object.hasOwn(actions, event.button)) {
          return;
        }
        actions[event.button]();`,
    `        const actions = this.getActionsKeyDown();
        if (!Object.hasOwn(actions, event.button)) {
          return;
        }
        this.silverShadowHapticHandled = event.silverShadowHapticHandled === true;
        try {
          actions[event.button]();
        } finally {
          this.silverShadowHapticHandled = false;
        }`,
    "input-down dispatch in src/ui-inputs.ts",
  );
  uiInputsSource = replaceRequired(
    uiInputsSource,
    `if (inputSuccess && globalScene.enableVibration && typeof navigator.vibrate !== "undefined")`,
    `if (
      inputSuccess
      && globalScene.enableVibration
      && !this.silverShadowHapticHandled
      && typeof navigator.vibrate !== "undefined"
    )`,
    "legacy UI vibration condition in src/ui-inputs.ts",
  );
}
writeFile(uiInputsPath, uiInputsSource);

const htmlPath = path.join("pokerogue-src", "index.html");
let htmlSource = readFile(htmlPath);
if (!htmlSource.includes('id="dpadArtwork"')) {
  const dpadMarkupAnchor = '\t\t\t\t<div id="dpad" data-control-key="DPAD">\n\t\t\t\t\t<svg';
  const dpadMarkupReplacement = `\t\t\t\t<div id="dpad" data-control-key="DPAD" data-active-direction="neutral">
\t\t\t\t\t<div id="dpadGeometry" aria-hidden="true">
\t\t\t\t\t\t<div id="dpadVisual">
\t\t\t\t\t\t\t<div id="dpadSocket"></div>
\t\t\t\t\t\t\t<div id="dpadShadow"></div>
\t\t\t\t\t\t\t<div id="dpadPivot">
\t\t\t\t\t\t\t\t<div id="dpadFace">
\t\t\t\t\t\t\t\t\t<svg viewBox="0 0 100 100" focusable="false">
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-face-base" d="M38 4Q34 4 34 8V34H8Q4 34 4 38V62Q4 66 8 66H34V92Q34 96 38 96H62Q66 96 66 92V66H92Q96 66 96 62V38Q96 34 92 34H66V8Q66 4 62 4Z" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-face-edge" d="M38 4Q34 4 34 8V34H8Q4 34 4 38V62Q4 66 8 66H34V92Q34 96 38 96H62Q66 96 66 92V66H92Q96 66 96 62V38Q96 34 92 34H66V8Q66 4 62 4Z" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-face-highlight" d="M38 4Q34 4 34 8V34H8Q4 34 4 38V62Q4 66 8 66H34V92Q34 96 38 96H62Q66 96 66 92V66H92Q96 66 96 62V38Q96 34 92 34H66V8Q66 4 62 4Z" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-groove" d="M40 12H60V40H88V60H60V88H40V60H12V40H40Z" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-halo ss-dpad-accent-up" d="M42 20L50 12L58 20" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-core ss-dpad-accent-up" d="M42 20L50 12L58 20" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-halo ss-dpad-accent-right" d="M80 42L88 50L80 58" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-core ss-dpad-accent-right" d="M80 42L88 50L80 58" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-halo ss-dpad-accent-down" d="M42 80L50 88L58 80" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-core ss-dpad-accent-down" d="M42 80L50 88L58 80" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-halo ss-dpad-accent-left" d="M20 42L12 50L20 58" />
\t\t\t\t\t\t\t\t\t\t<path class="ss-dpad-accent ss-dpad-accent-core ss-dpad-accent-left" d="M20 42L12 50L20 58" />
\t\t\t\t\t\t\t\t\t\t<circle class="ss-dpad-cap" cx="50" cy="50" r="10" />
\t\t\t\t\t\t\t\t\t</svg>
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t\t<img id="dpadArtwork" src="images/ui/touch-controls/dpad.png" alt="" draggable="false" />
\t\t\t\t\t<svg`;
  htmlSource = replaceRequired(
    htmlSource,
    dpadMarkupAnchor,
    dpadMarkupReplacement,
    "D-pad markup in index.html",
  );
}
if (htmlSource.includes('<span class="apad-label">Menu</span>')) {
  htmlSource = replaceRequired(
    htmlSource,
    '<span class="apad-label">Menu</span>',
    '<span class="apad-label">Start</span>',
    "Menu action label in index.html",
  );
} else if (!htmlSource.includes('<span class="apad-label">Start</span>')) {
  fail("Could not find the expected Menu/Start action label in index.html.");
}
writeFile(htmlPath, htmlSource);

const cssPath = path.join("pokerogue-src", "index.css");
let cssSource = readFile(cssPath);
if (!cssSource.includes("silvershadow-touch-upgrade")) {
  const actionButtonsAnchor = "/* apad buttons */";
  const silverCss = `/* SilverShadow visual-only rocking controls; input geometry remains stationary. */
#dpadArtwork,
#dpadGeometry {
  display: none;
}

#touchControls.silvershadow-touch-upgrade {
  --ss-control-idle-opacity: 0.3;
  --ss-control-neutral-opacity: 0.4;
  --ss-control-active-opacity: 0.58;
  --ss-control-face: rgba(12, 14, 18, 0.9);
  --ss-control-face-raised: rgba(37, 41, 48, 0.9);
  --ss-control-edge: rgba(221, 228, 237, 0.82);
  --ss-control-edge-muted: rgba(221, 228, 237, 0.48);
  --ss-control-socket-edge: rgba(221, 228, 237, 0.2);
  --ss-control-accent: rgb(240, 44, 62);
  --ss-control-shadow: rgba(0, 0, 0, 0.62);
  --ss-control-label: rgba(248, 249, 252, 0.98);
  --ss-control-press-duration: 45ms;
  --ss-control-release-duration: 80ms;
  --dpad-perspective: 430px;
  --dpad-movement-duration: 38ms;
  --dpad-release-duration: 115ms;
}

#touchControls.silvershadow-touch-upgrade #dpad {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(2 * var(--controls-size));
  height: calc(2 * var(--controls-size));
  opacity: 1;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

#touchControls.silvershadow-touch-upgrade #dpad > svg {
  display: none;
}

/* Flat Gen1Recomp image remains available if the layered visual cannot initialize. */
#touchControls.silvershadow-touch-upgrade #dpadArtwork {
  display: block;
  width: 96%;
  height: 96%;
  object-fit: contain;
  opacity: var(--ss-control-idle-opacity);
  pointer-events: none;
}

#touchControls.silvershadow-touch-upgrade #dpad.captured:not(.active) #dpadArtwork {
  opacity: var(--ss-control-neutral-opacity);
}

#touchControls.silvershadow-touch-upgrade #dpad.active #dpadArtwork {
  opacity: var(--ss-control-active-opacity);
}

/* Stable 96% visual geometry wrapper: digital input still uses its proven 84%. */
#touchControls.silvershadow-rocking-visuals #dpadGeometry {
  position: relative;
  display: block;
  width: 96%;
  height: 96%;
  pointer-events: none;
}

#touchControls.silvershadow-rocking-visuals #dpadArtwork {
  display: none;
}

#touchControls.silvershadow-rocking-visuals #dpadVisual {
  --dpad-tilt-x: 0deg;
  --dpad-tilt-y: 0deg;
  --dpad-shadow-x: 0px;
  --dpad-shadow-y: 0px;
  --dpad-scale: 1;
  --dpad-light-up: 0;
  --dpad-light-right: 0;
  --dpad-light-down: 0;
  --dpad-light-left: 0;
  position: absolute;
  inset: 0;
  opacity: var(--ss-control-idle-opacity);
  pointer-events: none;
  transition: opacity var(--ss-control-release-duration) ease-out;
}

#touchControls.silvershadow-rocking-visuals #dpad.captured:not(.active) #dpadVisual {
  opacity: var(--ss-control-neutral-opacity);
}

#touchControls.silvershadow-rocking-visuals #dpad.active #dpadVisual {
  opacity: var(--ss-control-active-opacity);
}

#dpadShadow,
#dpadPivot {
  position: absolute;
  inset: 4%;
}

#dpadSocket {
  position: absolute;
  inset: 11%;
  box-sizing: border-box;
  border: 1px solid var(--ss-control-socket-edge);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(3, 4, 6, 0.5) 0 34%, rgba(3, 4, 6, 0.28) 52%, transparent 72%);
}

#dpadShadow::before,
#dpadShadow::after {
  position: absolute;
  box-sizing: border-box;
  content: "";
  border-radius: 8%;
}

#dpadShadow::before {
  top: 0;
  left: 34%;
  width: 32%;
  height: 100%;
}

#dpadShadow::after {
  top: 34%;
  left: 0;
  width: 100%;
  height: 32%;
}

#dpadShadow {
  transform: translate(var(--dpad-shadow-x), var(--dpad-shadow-y));
  transition: transform var(--dpad-release-duration) ease-out;
}

#dpadShadow::before,
#dpadShadow::after {
  background: var(--ss-control-shadow);
}

#dpadPivot {
  transform: perspective(var(--dpad-perspective)) rotateX(var(--dpad-tilt-x)) rotateY(var(--dpad-tilt-y))
    scale(var(--dpad-scale));
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  transition: transform var(--dpad-release-duration) ease-out;
  will-change: transform;
}

#touchControls.silvershadow-rocking-visuals #dpad.captured #dpadPivot,
#touchControls.silvershadow-rocking-visuals #dpad.captured #dpadShadow {
  transition-duration: var(--dpad-movement-duration);
}

#dpadFace,
#dpadFace > svg {
  width: 100%;
  height: 100%;
}

#dpadFace > svg {
  display: block;
  overflow: visible;
}

.ss-dpad-face-base {
  fill: var(--ss-control-face);
}

.ss-dpad-face-edge {
  fill: none;
  stroke: var(--ss-control-edge);
  stroke-width: 1.8;
}

.ss-dpad-face-highlight {
  fill: none;
  stroke: rgba(255, 255, 255, 0.42);
  stroke-width: 0.65;
  transform: translate(-0.5px, -0.7px);
}

.ss-dpad-groove {
  fill: none;
  stroke: rgba(0, 0, 0, 0.58);
  stroke-width: 2;
}

.ss-dpad-cap {
  fill: var(--ss-control-face-raised);
  stroke: var(--ss-control-edge-muted);
  stroke-width: 1.4;
}

.ss-dpad-accent {
  --ss-dpad-light-strength: 0;
  fill: none;
  stroke: var(--ss-control-accent);
  stroke-linejoin: round;
  stroke-linecap: round;
}

.ss-dpad-accent-up {
  --ss-dpad-light-strength: var(--dpad-light-up);
}

.ss-dpad-accent-right {
  --ss-dpad-light-strength: var(--dpad-light-right);
}

.ss-dpad-accent-down {
  --ss-dpad-light-strength: var(--dpad-light-down);
}

.ss-dpad-accent-left {
  --ss-dpad-light-strength: var(--dpad-light-left);
}

.ss-dpad-accent-halo {
  stroke-width: 7;
  opacity: calc(var(--ss-dpad-light-strength) * 0.34);
}

.ss-dpad-accent-core {
  stroke-width: 3.2;
  opacity: var(--ss-dpad-light-strength);
}

/* Existing button nodes remain independent hit regions; only their material changes. */
#touchControls.silvershadow-touch-upgrade .apad-button {
  position: relative;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

#touchControls.silvershadow-rocking-visuals .apad-button {
  box-sizing: border-box;
  color: var(--ss-control-label);
  background: radial-gradient(circle at 38% 28%, var(--ss-control-face-raised), var(--ss-control-face) 64%);
  border: 1px solid var(--ss-control-edge);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -2px 0 rgba(0, 0, 0, 0.42),
    0 2px 2px var(--ss-control-shadow);
  opacity: var(--ss-control-idle-opacity);
  transform: translateY(0) scale(1);
  transform-origin: 50% 50%;
  transition:
    transform var(--ss-control-release-duration) ease-out,
    opacity var(--ss-control-release-duration) ease-out,
    border-color var(--ss-control-release-duration) ease-out,
    box-shadow var(--ss-control-release-duration) ease-out;
  will-change: transform;
}

#touchControls.silvershadow-rocking-visuals .apad-button::after {
  position: absolute;
  inset: 3px;
  box-sizing: border-box;
  content: "";
  border: 1px solid var(--ss-control-edge-muted);
  border-radius: inherit;
  pointer-events: none;
}

#touchControls.silvershadow-rocking-visuals .apad-button.active {
  background: radial-gradient(circle at 45% 38%, rgba(47, 49, 55, 0.94), rgba(7, 8, 11, 0.94) 70%);
  border-color: var(--ss-control-accent);
  box-shadow:
    inset 0 2px 2px rgba(0, 0, 0, 0.6),
    inset 0 -2px 0 rgba(240, 44, 62, 0.68),
    0 1px 2px var(--ss-control-shadow);
  opacity: var(--ss-control-active-opacity);
  transform: translateY(1px) scale(0.97);
  transition-duration: var(--ss-control-press-duration);
}

#touchControls.silvershadow-rocking-visuals .apad-button.active::after {
  border-color: rgba(240, 44, 62, 0.9);
  box-shadow: inset 0 -2px 0 rgba(240, 44, 62, 0.38);
}

#touchControls.silvershadow-rocking-visuals .apad-button.active > .apad-label {
  color: #fff;
  text-shadow:
    0 1px 1px #000,
    0 0 2px rgba(240, 44, 62, 0.8);
}

#touchControls.silvershadow-rocking-visuals #apadMenu > .apad-label {
  font-size: calc(var(--small-control-size) * 0.72);
}

/* 15% hit slop from the proven input iteration; visual dimensions do not change. */
#touchControls.silvershadow-touch-upgrade .apad-button::before {
  position: absolute;
  inset: -15%;
  content: "";
}

#touchControls.config-mode #dpadPivot,
#touchControls.config-mode #dpadShadow,
#touchControls.config-mode .apad-button {
  transform: none !important;
  transition: none !important;
}

@media (prefers-reduced-motion: reduce) {
  #touchControls.silvershadow-rocking-visuals #dpadPivot,
  #touchControls.silvershadow-rocking-visuals #dpadShadow,
  #touchControls.silvershadow-rocking-visuals #dpadVisual,
  #touchControls.silvershadow-rocking-visuals .apad-button {
    transition-duration: 0ms;
  }
}

`;
  cssSource = replaceRequired(
    cssSource,
    actionButtonsAnchor,
    silverCss + actionButtonsAnchor,
    "action-button CSS anchor in index.css",
  );
}
writeFile(cssPath, cssSource);

console.log("Installed SilverShadow continuous touch controls with upstream fallback.");
