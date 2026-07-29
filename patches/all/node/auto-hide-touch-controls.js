#!/usr/bin/env node

/**
 * Auto-hide PokéRogue's touchscreen overlay after two seconds without touch.
 *
 * Behaviour:
 * - Existing "Touch Controls: Auto / Disabled" setting remains unchanged.
 * - Auto: controls appear immediately when the screen is touched.
 * - Auto: controls fade out two seconds after the final finger is lifted.
 * - Gamepad and keyboard input do not reveal the touch controls.
 * - Disabled: controls remain completely disabled as upstream intended.
 * - Move Touch Controls configuration keeps the controls visible.
 *
 * The controls are hidden with opacity rather than display:none, so touching
 * an invisible button can reveal and activate it with the same touch.
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
  if (!source.includes(search)) {
    fail(
      `Could not find ${label}. `
        + "The upstream PokéRogue source may have changed.",
    );
  }

  return source.replace(search, replacement);
}

const touchControlsPath = path.join(
  "pokerogue-src",
  "src",
  "touch-controls.ts",
);

let touchSource = readFile(touchControlsPath);

if (!touchSource.includes("autoHideTouchControlsDelayMillis")) {
  touchSource = replaceRequired(
    touchSource,
    "const repeatInputDelayMillis = 250;",
    `const repeatInputDelayMillis = 250;
const autoHideTouchControlsDelayMillis = 2000;`,
    "the touch-control input delay constant",
  );
}

if (!touchSource.includes("private autoHideTimeout")) {
  touchSource = replaceRequired(
    touchSource,
    "  private finishedLastTouch = false;",
    `  private finishedLastTouch = false;
  private autoHideTimeout: ReturnType<typeof setTimeout> | null = null;`,
    "the TouchControl state fields",
  );
}

if (!touchSource.includes("this.initAutoHide();")) {
  touchSource = replaceRequired(
    touchSource,
    "    this.init();",
    `    this.init();
    this.initAutoHide();`,
    "the TouchControl constructor initialization",
  );
}

if (!touchSource.includes("private initAutoHide(): void")) {
  const initMethodAnchor = `  /**
   * Initialize touch controls by binding keys to buttons.
   */`;

  const autoHideMethods = `  /**
   * Set up SilverShadow's automatic touch-overlay visibility.
   */
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

      if (
        !touchControls.classList.contains("visible")
        || touchControls.classList.contains("config-mode")
      ) {
        return;
      }

      this.autoHideTimeout = setTimeout(() => {
        if (
          touchControls.classList.contains("visible")
          && !touchControls.classList.contains("config-mode")
        ) {
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

    document.addEventListener(
      "touchstart",
      revealControls,
      {
        capture: true,
        passive: true,
      },
    );

    document.addEventListener(
      "touchend",
      finishTouch,
      {
        capture: true,
        passive: true,
      },
    );

    document.addEventListener(
      "touchcancel",
      finishTouch,
      {
        capture: true,
        passive: true,
      },
    );

    /*
     * Watch only meaningful visible/config-mode state changes. The observer
     * deliberately ignores the auto-hidden class changing, preventing a
     * hide/reveal loop.
     */
    const classObserver = new MutationObserver(() => {
      const isVisible =
        touchControls.classList.contains("visible");
      const isConfigMode =
        touchControls.classList.contains("config-mode");

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
        return;
      }

      revealControls();

      if (!isConfigMode) {
        scheduleAutoHide();
      }
    });

    classObserver.observe(touchControls, {
      attributes: true,
      attributeFilter: ["class"],
    });

    if (wasVisible && !wasConfigMode) {
      scheduleAutoHide();
    }
  }

`;

  touchSource = replaceRequired(
    touchSource,
    initMethodAnchor,
    autoHideMethods + initMethodAnchor,
    "the TouchControl.init documentation block",
  );
}

writeFile(touchControlsPath, touchSource);

const cssPath = path.join(
  "pokerogue-src",
  "index.css",
);

let cssSource = readFile(cssPath);

/*
 * Adding auto-hidden creates a second class on #touchControls. Upstream's
 * exact [class="visible"] selector would stop matching and make the game
 * canvas jump, so use a normal class selector instead.
 */
cssSource = cssSource.replaceAll(
  'body:has(> #touchControls[class="visible"])',
  "body:has(> #touchControls.visible)",
);

if (!cssSource.includes("transition: opacity 180ms ease-out;")) {
  cssSource = replaceRequired(
    cssSource,
    `  color: var(--color-light);
}`,
    `  color: var(--color-light);
  opacity: 1;
  transition: opacity 180ms ease-out;
}`,
    "the #touchControls style ending",
  );
}

if (!cssSource.includes("#touchControls.visible.auto-hidden")) {
  const hiddenControlsAnchor = `#touchControls:not(.visible) {
  display: none;
}`;

  const hiddenControlsReplacement = `${hiddenControlsAnchor}

/*
 * SilverShadow auto-hide:
 * Keep invisible controls hit-testable so a touch can reveal and activate
 * the intended button immediately. Do not hide during control positioning.
 */
#touchControls.visible.auto-hidden:not(.config-mode) {
  opacity: 0;
}`;

  cssSource = replaceRequired(
    cssSource,
    hiddenControlsAnchor,
    hiddenControlsReplacement,
    "the hidden touch-controls CSS rule",
  );
}

writeFile(cssPath, cssSource);

console.log(
  "Touch controls now fade out two seconds after the last touch.",
);
console.log(
  "Touch input reveals them; gamepad and keyboard input do not.",
);
