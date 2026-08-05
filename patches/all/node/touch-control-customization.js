#!/usr/bin/env node

/**
 * Extend the existing touch overlay with explicit visibility modes and
 * orientation-specific control-group scaling in Move Touch Controls.
 */

const fs = require("fs");
const path = require("path");

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
    fail(`Expected exactly one ${label}, found ${occurrences}. The upstream source or patch order may have changed.`);
  }
  return source.replace(search, replacement);
}

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);

if (!settingsSource.includes('label: "Always Appear"')) {
  settingsSource = replaceRequired(
    settingsSource,
    `const TOUCH_CONTROLS_OPTIONS: SettingOption[] = [
  {
    value: "Auto",
    label: i18next.t("settings:auto"),
  },
  {
    value: "Disabled",
    label: i18next.t("settings:disabled"),
    needConfirmation: true,
    confirmationMessage: i18next.t("settings:confirmDisableTouch"),
  },
];`,
    `const TOUCH_CONTROLS_OPTIONS: SettingOption[] = [
  {
    value: "Auto",
    label: "Fade",
  },
  {
    value: "Always",
    label: "Always Appear",
  },
  {
    value: "Disabled",
    label: i18next.t("settings:disabled"),
    needConfirmation: true,
    confirmationMessage: i18next.t("settings:confirmDisableTouch"),
  },
];`,
    "Touch Controls option list",
  );
}

if (!settingsSource.includes('touchControls.classList.toggle("always-visible"')) {
  settingsSource = replaceRequired(
    settingsSource,
    `    case SettingKeys.Touch_Controls: {
      globalScene.enableTouchControls = Setting[index].options[value].value !== "Disabled" && hasTouchscreen();
      const touchControls = document.getElementById("touchControls");
      if (touchControls) {
        touchControls.classList.toggle("visible", globalScene.enableTouchControls);
      }
      break;
    }`,
    `    case SettingKeys.Touch_Controls: {
      const visibilityMode = Setting[index].options[value].value;
      globalScene.enableTouchControls = visibilityMode !== "Disabled" && hasTouchscreen();
      const touchControls = document.getElementById("touchControls");
      if (touchControls) {
        touchControls.classList.toggle("visible", globalScene.enableTouchControls);
        touchControls.classList.toggle("always-visible", visibilityMode === "Always");
        if (visibilityMode === "Always") {
          touchControls.classList.remove("auto-hidden");
        }
      }
      break;
    }`,
    "Touch Controls setting application",
  );
}
writeFile(settingsPath, settingsSource);

const gameDataPath = path.join("pokerogue-src", "src", "system", "game-data.ts");
let gameDataSource = readFile(gameDataPath);
const migrationMarker = "__silvershadowTouchControlsVisibilityVersion";

if (!gameDataSource.includes(`settings["${migrationMarker}"] = 1;`)) {
  gameDataSource = replaceRequired(
    gameDataSource,
    `    settings[setting] = valueIndex;
    settings["gameVersion"] = globalScene.game.config.gameVersion;`,
    `    settings[setting] = valueIndex;
    settings["gameVersion"] = globalScene.game.config.gameVersion;
    settings["${migrationMarker}"] = 1;`,
    "settings persistence assignment",
  );
}

if (!gameDataSource.includes("Migrate the former Auto/Disabled indexes")) {
  gameDataSource = replaceRequired(
    gameDataSource,
    `    applySettingsVersionMigration(settings);

    for (const setting of Object.keys(settings)) {`,
    `    applySettingsVersionMigration(settings);

    // Migrate the former Auto/Disabled indexes before Always Appear was inserted.
    if (!Object.hasOwn(settings, "${migrationMarker}")) {
      if (settings[SettingKeys.Touch_Controls] === 1) {
        settings[SettingKeys.Touch_Controls] = 2;
      }
      settings["${migrationMarker}"] = 1;
      localStorage.setItem("settings", JSON.stringify(settings));
    }

    for (const setting of Object.keys(settings)) {`,
    "settings load loop",
  );
}
writeFile(gameDataPath, gameDataSource);

const touchControlsPath = path.join("pokerogue-src", "src", "touch-controls.ts");
let touchSource = readFile(touchControlsPath);
if (!touchSource.includes("let wasAlwaysVisible")) {
  const methodStart = touchSource.indexOf("  /** Preserve SilverShadow's two-second auto-hide behavior. */");
  const methodEnd = touchSource.indexOf("  private initLifecycleCleanup(): void {", methodStart);
  if (methodStart < 0 || methodEnd < 0) {
    fail("Could not locate SilverShadow's complete auto-hide method. Apply silvershadow-touch-controls.js first.");
  }
  const autoHideMethod = `  /** Fade the controls after inactivity unless Always Appear is selected. */
  private initAutoHide(): void {
    const touchControls = document.getElementById("touchControls");
    if (!touchControls) {
      return;
    }
    let wasVisible = touchControls.classList.contains("visible");
    let wasConfigMode = touchControls.classList.contains("config-mode");
    let wasAlwaysVisible = touchControls.classList.contains("always-visible");
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
      if (
        !touchControls.classList.contains("visible")
        || touchControls.classList.contains("config-mode")
        || touchControls.classList.contains("always-visible")
      ) {
        return;
      }
      this.autoHideTimeout = setTimeout(() => {
        if (
          touchControls.classList.contains("visible")
          && !touchControls.classList.contains("config-mode")
          && !touchControls.classList.contains("always-visible")
        ) {
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
    this.autoHideObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            const isVisible = touchControls.classList.contains("visible");
            const isConfigMode = touchControls.classList.contains("config-mode");
            const isAlwaysVisible = touchControls.classList.contains("always-visible");
            const visibleStateChanged = isVisible !== wasVisible;
            const configStateChanged = isConfigMode !== wasConfigMode;
            const visibilityModeChanged = isAlwaysVisible !== wasAlwaysVisible;
            wasVisible = isVisible;
            wasConfigMode = isConfigMode;
            wasAlwaysVisible = isAlwaysVisible;
            if (!visibleStateChanged && !configStateChanged && !visibilityModeChanged) {
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
            if (!isAlwaysVisible) {
              scheduleAutoHide();
            }
          });
    this.autoHideObserver?.observe(touchControls, { attributes: true, attributeFilter: ["class"] });
    if (wasVisible && !wasConfigMode && !wasAlwaysVisible) {
      scheduleAutoHide();
    }
  }

`;
  touchSource = touchSource.slice(0, methodStart) + autoHideMethod + touchSource.slice(methodEnd);
}
writeFile(touchControlsPath, touchSource);

const moveHandlerPath = path.join("pokerogue-src", "src", "ui", "settings", "move-touch-controls-handler.ts");
let moveSource = readFile(moveHandlerPath);

if (!moveSource.includes("TOUCH_CONTROL_SCALES_LANDSCAPE")) {
  moveSource = replaceRequired(
    moveSource,
    `export const TOUCH_CONTROL_POSITIONS_LANDSCAPE = "touchControlPositionsLandscape";
export const TOUCH_CONTROL_POSITIONS_PORTRAIT = "touchControlPositionsPortrait";`,
    `export const TOUCH_CONTROL_POSITIONS_LANDSCAPE = "touchControlPositionsLandscape";
export const TOUCH_CONTROL_POSITIONS_PORTRAIT = "touchControlPositionsPortrait";
export const TOUCH_CONTROL_SCALES_LANDSCAPE = "touchControlScalesLandscape";
export const TOUCH_CONTROL_SCALES_PORTRAIT = "touchControlScalesPortrait";

const MIN_CONTROL_SCALE = 0.6;
const MAX_CONTROL_SCALE = 1.8;`,
    "touch position storage constants",
  );
  moveSource = replaceRequired(
    moveSource,
    `type ControlPosition = { id: string; x: number; y: number };`,
    `type ControlPosition = { id: string; x: number; y: number };
type ControlScale = { id: string; scale: number };`,
    "ControlPosition type",
  );
  moveSource = replaceRequired(
    moveSource,
    `  /** The element that is currently being dragged */
  private draggingElement: HTMLElement | null = null;`,
    `  /** The element that is currently being dragged */
  private draggingElement: HTMLElement | null = null;
  /** The element whose complete control group is currently being resized. */
  private resizingElement: HTMLElement | null = null;
  private resizePointerId: number | null = null;
  private resizeStartDistance = 1;
  private resizeStartScale = 1;
  private configurationSetupTimeout: ReturnType<typeof setTimeout> | null = null;`,
    "dragging element field",
  );
  moveSource = replaceRequired(
    moveSource,
    `    this.setPositions(this.getSavedPositionsOfCurrentOrientation() ?? []);`,
    `    this.setPositions(this.getSavedPositionsOfCurrentOrientation() ?? []);
    this.setScales(this.getSavedScalesOfCurrentOrientation());`,
    "initial touch positions",
  );
  moveSource = replaceRequired(
    moveSource,
    `    const positions = this.getSavedPositionsOfCurrentOrientation() ?? [];
    this.setPositions(positions);`,
    `    const positions = this.getSavedPositionsOfCurrentOrientation() ?? [];
    this.setPositions(positions);
    this.setScales(this.getSavedScalesOfCurrentOrientation());`,
    "orientation position restoration",
  );
  moveSource = replaceRequired(
    moveSource,
    `    saveButton.addEventListener("click", () => {
      this.saveCurrentPositions();
      this.disableConfigurationMode();
    });
    resetButton.addEventListener("click", () => {
      this.resetPositions();
    });
    cancelButton.addEventListener("click", () => {
      const positions = this.getSavedPositionsOfCurrentOrientation();
      this.setPositions(positions);
      this.disableConfigurationMode();
    });`,
    `    saveButton.addEventListener("click", () => {
      this.saveCurrentPositions();
      this.saveCurrentScales();
      this.disableConfigurationMode();
    });
    resetButton.addEventListener("click", () => {
      this.resetPositions();
      this.resetScales();
    });
    cancelButton.addEventListener("click", () => {
      const positions = this.getSavedPositionsOfCurrentOrientation();
      this.setPositions(positions);
      this.setScales(this.getSavedScalesOfCurrentOrientation());
      this.disableConfigurationMode();
    });`,
    "Move Touch Controls toolbar actions",
  );
  moveSource = replaceRequired(
    moveSource,
    `  private startDrag = (controlGroup: HTMLElement): void => {
    this.draggingElement = controlGroup;
  };`,
    `  private startDrag = (controlGroup: HTMLElement): void => {
    if (!this.resizingElement) {
      this.draggingElement = controlGroup;
    }
  };

  /** Start resizing a complete control group from its screen-anchored corner. */
  private startResize(controlGroup: HTMLElement, event: PointerEvent): void {
    const rect = controlGroup.getBoundingClientRect();
    const anchorX = this.isLeft(controlGroup) ? rect.left : rect.right;
    const anchorY = rect.bottom;
    this.draggingElement = null;
    this.resizingElement = controlGroup;
    this.resizePointerId = event.pointerId;
    this.resizeStartDistance = Math.max(1, Math.hypot(event.clientX - anchorX, event.clientY - anchorY));
    this.resizeStartScale = this.getControlScale(controlGroup);
  }`,
    "Move Touch Controls startDrag method",
  );
  moveSource = replaceRequired(
    moveSource,
    `  private drag = (event: PointerEvent): void => {
    if (!this.draggingElement) {
      return;
    }
    const rect = this.draggingElement.getBoundingClientRect();`,
    `  private drag = (event: PointerEvent): void => {
    if (this.resizingElement && event.pointerId === this.resizePointerId) {
      const rect = this.resizingElement.getBoundingClientRect();
      const anchorX = this.isLeft(this.resizingElement) ? rect.left : rect.right;
      const anchorY = rect.bottom;
      const distance = Math.max(1, Math.hypot(event.clientX - anchorX, event.clientY - anchorY));
      this.setControlScale(this.resizingElement, this.resizeStartScale * (distance / this.resizeStartDistance));
      return;
    }
    if (!this.draggingElement) {
      return;
    }
    const rect = this.draggingElement.getBoundingClientRect();`,
    "Move Touch Controls drag method",
  );
  moveSource = replaceRequired(
    moveSource,
    `  private stopDrag = (): void => {
    this.draggingElement = null;
  };`,
    `  private stopDrag = (): void => {
    this.draggingElement = null;
    this.resizingElement = null;
    this.resizePointerId = null;
  };`,
    "Move Touch Controls stopDrag method",
  );

  const storageMethodsAnchor = `  /**
   * Returns the key of the local storage for the control positions data of this orientation
   */`;
  const scaleMethods = `  private getControlScale(controlGroup: HTMLElement): number {
    const scale = Number.parseFloat(controlGroup.style.getPropertyValue("--ss-control-scale"));
    return Number.isFinite(scale) ? scale : 1;
  }

  private setControlScale(controlGroup: HTMLElement, requestedScale: number): void {
    const scale = Math.min(MAX_CONTROL_SCALE, Math.max(MIN_CONTROL_SCALE, requestedScale));
    if (Math.abs(scale - 1) < 0.005) {
      controlGroup.style.removeProperty("--ss-control-scale");
      return;
    }
    controlGroup.style.setProperty("--ss-control-scale", scale.toFixed(3));
  }

  private getModifiedCurrentScales(): ControlScale[] {
    return this.getControlGroupElements()
      .map(controlGroup => ({ id: controlGroup.id, scale: this.getControlScale(controlGroup) }))
      .filter(control => Math.abs(control.scale - 1) >= 0.005);
  }

  private getScaleLocalStorageKey(): string {
    return this.isLandscapeMode ? TOUCH_CONTROL_SCALES_LANDSCAPE : TOUCH_CONTROL_SCALES_PORTRAIT;
  }

  private getSavedScalesOfCurrentOrientation(): ControlScale[] {
    const serializedScales = localStorage.getItem(this.getScaleLocalStorageKey());
    if (!serializedScales) {
      return [];
    }
    try {
      const scales = JSON.parse(serializedScales) as ControlScale[];
      return Array.isArray(scales)
        ? scales.filter(control => typeof control?.id === "string" && Number.isFinite(control?.scale))
        : [];
    } catch {
      return [];
    }
  }

  private saveCurrentScales(): void {
    localStorage.setItem(this.getScaleLocalStorageKey(), JSON.stringify(this.getModifiedCurrentScales()));
  }

  private setScales(scales: ControlScale[]): void {
    this.resetScales();
    for (const control of scales) {
      const controlGroup = document.getElementById(control.id);
      if (controlGroup) {
        this.setControlScale(controlGroup, control.scale);
      }
    }
  }

  private resetScales(): void {
    for (const controlGroup of this.getControlGroupElements()) {
      controlGroup.style.removeProperty("--ss-control-scale");
    }
  }

`;
  moveSource = replaceRequired(
    moveSource,
    storageMethodsAnchor,
    scaleMethods + storageMethodsAnchor,
    "position storage methods anchor",
  );

  const listenerMethodStart = moveSource.indexOf("  private createConfigurationEventListeners(");
  const listenerMethodEnd = moveSource.indexOf("  /**\n   * Creates an overlay", listenerMethodStart);
  if (listenerMethodStart < 0 || listenerMethodEnd < 0) {
    fail("Could not locate Move Touch Controls listener method.");
  }
  const listenerMethods = `  private createResizeHandles(controlGroups: HTMLDivElement[]): void {
    for (const controlGroup of controlGroups) {
      const handle = document.createElement("div");
      handle.className = "ss-touch-resize-handle";
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", "Resize " + controlGroup.id);
      handle.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();
          event.stopPropagation();
          handle.setPointerCapture?.(event.pointerId);
          this.startResize(controlGroup, event);
        },
        { passive: false },
      );
      controlGroup.append(handle);
    }
  }

  private removeResizeHandles(): void {
    document.querySelectorAll("#touchControls .ss-touch-resize-handle").forEach(handle => handle.remove());
  }

  private createConfigurationEventListeners(controlGroups: HTMLDivElement[]): ConfigurationEventListeners {
    const drag = (event: Event) => this.drag(event as PointerEvent);
    const stopDrag = () => this.stopDrag();
    window.addEventListener("pointermove", drag, { passive: true });
    window.addEventListener("pointerup", stopDrag, { passive: true });
    window.addEventListener("pointercancel", stopDrag, { passive: true });
    return {
      pointerdown: controlGroups.map((element: HTMLDivElement) => {
        const startDrag = () => this.startDrag(element);
        element.addEventListener("pointerdown", startDrag, { passive: true });
        return startDrag;
      }),
      pointermove: [drag],
      pointerup: [stopDrag],
    };
  }

`;
  moveSource = moveSource.slice(0, listenerMethodStart) + listenerMethods + moveSource.slice(listenerMethodEnd);

  moveSource = replaceRequired(
    moveSource,
    `    this.createOverlay(ui);
    this.createToolbar();
    // Create event listeners with a delay`,
    `    this.createOverlay(ui);
    this.createToolbar();
    this.createResizeHandles(this.getControlGroupElements());
    // Create event listeners with a delay`,
    "configuration-mode setup",
  );
  moveSource = replaceRequired(
    moveSource,
    `    setTimeout(() => {
      // Remember the event listeners so they can be removed later.
      this.configurationEventListeners = this.createConfigurationEventListeners(this.getControlGroupElements());
    }, 500);`,
    `    this.configurationSetupTimeout = setTimeout(() => {
      // Remember the event listeners so they can be removed later.
      this.configurationEventListeners = this.createConfigurationEventListeners(this.getControlGroupElements());
      this.configurationSetupTimeout = null;
    }, 500);`,
    "delayed configuration listener setup",
  );
  moveSource = replaceRequired(
    moveSource,
    `    pointermove.forEach(listener => window.removeEventListener("pointermove", listener));
    pointerup.forEach(listener => window.removeEventListener("pointerup", listener));

    // Remove configuration toolbar`,
    `    pointermove.forEach(listener => window.removeEventListener("pointermove", listener));
    pointerup.forEach(listener => {
      window.removeEventListener("pointerup", listener);
      window.removeEventListener("pointercancel", listener);
    });
    if (this.configurationSetupTimeout !== null) {
      clearTimeout(this.configurationSetupTimeout);
      this.configurationSetupTimeout = null;
    }
    this.removeResizeHandles();

    // Remove configuration toolbar`,
    "configuration-mode listener cleanup",
  );
}
writeFile(moveHandlerPath, moveSource);

const cssPath = path.join("pokerogue-src", "index.css");
let cssSource = readFile(cssPath);
if (!cssSource.includes("ss-touch-resize-handle")) {
  const cssAnchor = "/* Hide buttons on specific UIs */";
  const customizationCss = `/* SilverShadow per-orientation group sizing. The group transform scales
 * artwork and its matching hit region together from the screen anchor. */
#touchControls .left .control-group {
  transform: scale(var(--ss-control-scale, 1));
  transform-origin: left bottom;
}

#touchControls .right .control-group {
  transform: scale(var(--ss-control-scale, 1));
  transform-origin: right bottom;
}

#touchControls .ss-touch-resize-handle {
  position: absolute;
  top: -12px;
  width: 28px;
  height: 28px;
  z-index: 12;
  border: 3px solid rgba(248, 249, 252, 0.95);
  border-radius: 6px;
  background: rgba(12, 14, 18, 0.9);
  box-shadow: 0 0 0 2px rgba(240, 44, 62, 0.9);
  cursor: nwse-resize;
  touch-action: none;
}

#touchControls .left .ss-touch-resize-handle {
  right: -12px;
}

#touchControls .right .ss-touch-resize-handle {
  left: -12px;
}

`;
  cssSource = replaceRequired(cssSource, cssAnchor, customizationCss + cssAnchor, "touch visibility CSS anchor");
}
writeFile(cssPath, cssSource);

console.log("Installed touch-control visibility modes and orientation-specific group resizing.");
