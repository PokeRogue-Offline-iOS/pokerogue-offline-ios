#!/usr/bin/env node

/**
 * Fix Offline settings tab navigation at the central UI input dispatcher.
 *
 * The custom mode is renamed from APP_SETTINGS to SETTINGS_OFFLINE so
 * touchscreen tab controls remain visible. While that mode is active,
 * CYCLE_FORM / CYCLE_SHINY are intercepted in UI.processInput() before
 * input is delegated to a handler. This avoids depending on the custom
 * handler's processInput path, which is not reliably receiving those tab
 * events in the generated Android build.
 *
 * Apply after remove-google-drive.js.
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

/*
 * Rename the custom mode so PokéRogue's touchscreen CSS continues treating
 * it as part of the Settings family.
 */
const generatedSourceFiles = [
  path.join("pokerogue-src", "src", "enums", "ui-mode.ts"),
  path.join("pokerogue-src", "src", "ui", "ui.ts"),
  path.join(
    "pokerogue-src",
    "src",
    "ui",
    "settings",
    "navigation-menu.ts",
  ),
  path.join(
    "pokerogue-src",
    "src",
    "ui",
    "settings",
    "offline-settings-ui-handler.ts",
  ),
];

for (const filePath of generatedSourceFiles) {
  let source = readFile(filePath);

  if (source.includes("APP_SETTINGS")) {
    source = source.replaceAll(
      "APP_SETTINGS",
      "SETTINGS_OFFLINE",
    );
    writeFile(filePath, source);
  }
}

const uiModePath = generatedSourceFiles[0];
const uiModeSource = readFile(uiModePath);

if (!uiModeSource.includes("SETTINGS_OFFLINE")) {
  fail(
    "SETTINGS_OFFLINE was not found in ui-mode.ts after renaming.",
  );
}

const navigationPath = generatedSourceFiles[2];
const navigationSource = readFile(navigationPath);

if (!navigationSource.includes("UiMode.SETTINGS_OFFLINE")) {
  fail(
    "SETTINGS_OFFLINE was not registered in NavigationManager.",
  );
}

/*
 * Patch the central UI input dispatcher. This is the same entry point used
 * by touch controls and physical controllers before input reaches a handler.
 */
const uiPath = generatedSourceFiles[1];
let uiSource = readFile(uiPath);

if (uiSource.includes('import type { Button } from "#enums/buttons";')) {
  uiSource = uiSource.replace(
    'import type { Button } from "#enums/buttons";',
    'import { Button } from "#enums/buttons";',
  );
}

if (!uiSource.includes('import { Button } from "#enums/buttons";')) {
  fail("Could not enable the runtime Button enum import in ui.ts.");
}

if (!uiSource.includes("settings-offline-central-input-fix")) {
  const processInputAnchor = `  processInput(button: Button): boolean {
    if (this.overlayActive) {
      return false;
    }

    const handler = this.getHandler();`;

  if (!uiSource.includes(processInputAnchor)) {
    fail(
      "Could not find UI.processInput() in ui.ts. "
        + "The upstream input dispatcher may have changed.",
    );
  }

  const processInputReplacement = `  processInput(button: Button): boolean {
    if (this.overlayActive) {
      return false;
    }

    // settings-offline-central-input-fix
    // Handle Settings tab changes before delegating to the active handler.
    if (
      this.mode === UiMode.SETTINGS_OFFLINE
      && (
        button === Button.CYCLE_FORM
        || button === Button.CYCLE_SHINY
      )
    ) {
      const navigationManager = NavigationManager.getInstance();
      const modes = navigationManager.modes;
      const currentIndex = modes.indexOf(
        UiMode.SETTINGS_OFFLINE,
      );

      if (currentIndex < 0 || modes.length === 0) {
        this.playError();
        return false;
      }

      const direction =
        button === Button.CYCLE_FORM ? -1 : 1;

      const nextIndex =
        (currentIndex + direction + modes.length)
        % modes.length;

      const nextMode = modes[nextIndex];

      navigationManager.selectedMode = nextMode;
      void this.setMode(nextMode);
      navigationManager.updateNavigationMenus();
      this.playSelect();
      return true;
    }

    const handler = this.getHandler();`;

  uiSource = uiSource.replace(
    processInputAnchor,
    processInputReplacement,
  );
}

writeFile(uiPath, uiSource);

/*
 * Keep the navbar selection synchronized whenever the Offline handler is
 * shown, but do not depend on the handler for tab-button processing.
 */
const handlerPath = generatedSourceFiles[3];
let handlerSource = readFile(handlerPath);

if (
  !handlerSource.includes(
    'import { NavigationManager } from "#ui/navigation-menu";',
  )
) {
  const importAnchor =
    'import { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";';

  if (!handlerSource.includes(importAnchor)) {
    fail(
      "Could not find the BaseSettingsUiHandler import "
        + "in the Offline handler.",
    );
  }

  handlerSource = handlerSource.replace(
    importAnchor,
    `${importAnchor}
import { NavigationManager } from "#ui/navigation-menu";`,
  );
}

if (!handlerSource.includes("settings-offline-show-sync")) {
  const showAnchor = `  public override show(args: any[]): boolean {
    const result = super.show(args);
    this.refreshDailySeedInfo();
    return result;
  }`;

  const showReplacement = `  public override show(args: any[]): boolean {
    const result = super.show(args);

    // settings-offline-show-sync
    const navigationManager = NavigationManager.getInstance();
    navigationManager.selectedMode = UiMode.SETTINGS_OFFLINE;
    navigationManager.updateNavigationMenus();

    this.refreshDailySeedInfo();
    return result;
  }`;

  if (!handlerSource.includes(showAnchor)) {
    fail(
      "Could not find the Offline settings show() method.",
    );
  }

  handlerSource = handlerSource.replace(
    showAnchor,
    showReplacement,
  );
}

writeFile(handlerPath, handlerSource);

console.log(
  "Offline settings mode renamed to SETTINGS_OFFLINE.",
);
console.log(
  "Central touch/controller tab navigation fix applied successfully.",
);
