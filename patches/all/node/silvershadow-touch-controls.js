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
const testRelativePath = path.join(
  "test",
  "tests",
  "system",
  "touch-controls",
  "silvershadow-touch-input.test.ts",
);

copyRequired(
  path.join(repositoryRoot, "new-files", helperRelativePath),
  path.join("pokerogue-src", helperRelativePath),
);
copyRequired(
  path.join(repositoryRoot, "new-files", testRelativePath),
  path.join("pokerogue-src", testRelativePath),
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

const silverImport = `import { SilverShadowTouchInputState } from "#system/touch-controls/silvershadow-touch-input";`;
if (!touchSource.includes(silverImport)) {
  touchSource = replaceRequired(
    touchSource,
    `import { Button } from "#enums/buttons";`,
    `import { Button } from "#enums/buttons";\n${silverImport}`,
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
  readonly events: Phaser.Events.EventEmitter;
  private disabled = false;
  private readonly legacyButtonLock = new Set<string>();
  private readonly legacyInputIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly enhancedInputIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly actionPointerNodes = new Map<number, HTMLElement>();
  private readonly touchState = new SilverShadowTouchInputState({
    press: key => this.pressEnhancedKey(key),
    release: key => this.releaseEnhancedKey(key),
  });
  private enhancedAbortController: AbortController | null = null;
  private readonly lifecycleAbortController = new AbortController();
  private fallbackInitialized = false;
  private dpadElement: HTMLElement | null = null;
  private dpadArtwork: HTMLImageElement | null = null;
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
    const artwork = document.getElementById("dpadArtwork");
    if (!("PointerEvent" in window) || !(dpad instanceof HTMLElement) || !(artwork instanceof HTMLImageElement)) {
      this.initLegacyControls();
      return;
    }

    this.dpadElement = dpad;
    this.dpadArtwork = artwork;
    this.enhancedAbortController = new AbortController();
    const { signal } = this.enhancedAbortController;
    document.getElementById("touchControls")?.classList.add("silvershadow-touch-upgrade");

    artwork.addEventListener("error", () => this.disableEnhancedMode(), { once: true, signal });
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
    this.enhancedAbortController?.abort();
    this.enhancedAbortController = null;
    document.getElementById("touchControls")?.classList.remove("silvershadow-touch-upgrade");
    this.dpadElement = null;
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
            geometry.width,
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
            geometry.width,
          )
        ) {
          return;
        }
        event.preventDefault();
        this.updateDpadArtwork();
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
    const node = this.actionPointerNodes.get(pointerId);
    this.actionPointerNodes.delete(pointerId);
    if (node && ![...this.actionPointerNodes.values()].includes(node)) {
      node.classList.remove("active");
    }
    if (this.touchState.releasePointer(pointerId)) {
      this.updateDpadArtwork();
    }
  }

  private getDpadGeometry(): { centerX: number; centerY: number; width: number } | null {
    if (!this.dpadElement) {
      return null;
    }
    const artworkRect = this.dpadArtwork?.getBoundingClientRect();
    if (artworkRect && artworkRect.width > 0) {
      return {
        centerX: artworkRect.left + artworkRect.width / 2,
        centerY: artworkRect.top + artworkRect.height / 2,
        width: artworkRect.width,
      };
    }
    const hitRect = this.dpadElement.getBoundingClientRect();
    return {
      centerX: hitRect.left + hitRect.width / 2,
      centerY: hitRect.top + hitRect.height / 2,
      width: hitRect.width * 0.84,
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
    this.dpadArtwork.src = direction
      ? "images/ui/touch-controls/dpad_" + direction.toLowerCase() + ".png"
      : "images/ui/touch-controls/dpad.png";
    this.dpadElement.classList.toggle("active", direction !== null);
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

  /** Called by InputsController on focus loss. */
  deactivatePressedKey(): void {
    this.resetTouchInput();
  }

  /** Release input and detach listeners on Phaser scene teardown. */
  destroy(): void {
    this.resetTouchInput();
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

const htmlPath = path.join("pokerogue-src", "index.html");
let htmlSource = readFile(htmlPath);
if (!htmlSource.includes('id="dpadArtwork"')) {
  const dpadMarkupAnchor = '\t\t\t\t<div id="dpad" data-control-key="DPAD">\n\t\t\t\t\t<svg';
  const dpadMarkupReplacement = '\t\t\t\t<div id="dpad" data-control-key="DPAD">\n'
    + '\t\t\t\t\t<img id="dpadArtwork" src="images/ui/touch-controls/dpad.png" alt="" draggable="false" />\n'
    + '\t\t\t\t\t<svg';
  htmlSource = replaceRequired(
    htmlSource,
    dpadMarkupAnchor,
    dpadMarkupReplacement,
    "D-pad markup in index.html",
  );
}
writeFile(htmlPath, htmlSource);

const cssPath = path.join("pokerogue-src", "index.css");
let cssSource = readFile(cssPath);
if (!cssSource.includes("silvershadow-touch-upgrade")) {
  const actionButtonsAnchor = "/* apad buttons */";
  const silverCss = `/* SilverShadow continuous D-pad and multi-pointer action controls. */
#dpadArtwork {
  display: none;
}

#touchControls.silvershadow-touch-upgrade #dpad {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(2 * var(--controls-size));
  height: calc(2 * var(--controls-size));
  opacity: 1;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

#touchControls.silvershadow-touch-upgrade #dpad svg {
  display: none;
}

#touchControls.silvershadow-touch-upgrade #dpadArtwork {
  display: block;
  width: 84%;
  height: 84%;
  object-fit: contain;
  opacity: 0.3;
  pointer-events: none;
}

#touchControls.silvershadow-touch-upgrade #dpad.active #dpadArtwork {
  opacity: 0.55;
}

#touchControls.silvershadow-touch-upgrade .apad-button {
  position: relative;
  opacity: 0.3;
  touch-action: none;
}

#touchControls.silvershadow-touch-upgrade .apad-button.active {
  opacity: 0.55;
}

/* 15% hit slop per edge without changing the visible button dimensions. */
#touchControls.silvershadow-touch-upgrade .apad-button::before {
  position: absolute;
  inset: -15%;
  content: "";
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
