#!/usr/bin/env node

/**
 * Fixes tab navigation after entering the custom Offline settings tab.
 *
 * The upstream settings handler delegates CYCLE_FORM / CYCLE_SHINY to a
 * NavigationManager singleton. Because APP_SETTINGS is a SilverShadow-added
 * UiMode, the singleton can become desynchronized after the custom handler is
 * shown. This override explicitly anchors navigation at APP_SETTINGS before
 * moving left or right.
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

const handlerPath = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "settings",
  "offline-settings-ui-handler.ts",
);

let source = readFile(handlerPath);

if (!source.includes('import { Button } from "#enums/buttons";')) {
  const importAnchor =
    'import { globalScene } from "#app/global-scene";';

  if (!source.includes(importAnchor)) {
    fail("Could not find the globalScene import in the Offline settings handler.");
  }

  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { Button } from "#enums/buttons";`,
  );
}

if (!source.includes('import { NavigationManager } from "#ui/navigation-menu";')) {
  const importAnchor =
    'import { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";';

  if (!source.includes(importAnchor)) {
    fail("Could not find the BaseSettingsUiHandler import.");
  }

  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { NavigationManager } from "#ui/navigation-menu";`,
  );
}

if (!source.includes("offline-settings-navigation-fix")) {
  const constructorAnchor = `  constructor(mode: UiMode | null = null) {
    super(SettingType.APP, mode);
    this.title = "Offline";
    this.localStorageKey = "settings";
  }`;

  if (!source.includes(constructorAnchor)) {
    fail("Could not find the OfflineSettingsUiHandler constructor.");
  }

  const replacement = `${constructorAnchor}

  /**
   * offline-settings-navigation-fix:
   * Explicitly synchronize the custom tab with NavigationManager before
   * changing tabs. Other input continues through the normal settings handler.
   */
  public override processInput(button: Button): boolean {
    if (
      button !== Button.CYCLE_FORM
      && button !== Button.CYCLE_SHINY
    ) {
      return super.processInput(button);
    }

    const navigationManager = NavigationManager.getInstance();

    navigationManager.selectedMode = UiMode.APP_SETTINGS;
    navigationManager.navigate(
      button === Button.CYCLE_FORM ? "LEFT" : "RIGHT",
    );

    globalScene.ui.playSelect();
    return true;
  }`;

  source = source.replace(constructorAnchor, replacement);
}

writeFile(handlerPath, source);
console.log("Offline settings tab navigation fixed.");
