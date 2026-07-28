#!/usr/bin/env node

/**
 * Fix Offline settings tab navigation on touchscreens and controllers.
 *
 * Root cause:
 * PokéRogue's touch-control CSS exposes the previous/next-tab buttons only
 * when the active UiMode name begins with "SETTINGS". The original custom
 * mode was named APP_SETTINGS, so entering it changed data-ui-mode to
 * APP_SETTINGS and the F/R tab controls were hidden.
 *
 * This patch:
 *   1. Renames the generated mode from APP_SETTINGS to SETTINGS_OFFLINE.
 *   2. Synchronizes NavigationManager when the Offline handler is shown.
 *   3. Handles CYCLE_FORM / CYCLE_SHINY directly as a controller fallback.
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

const handlerPath = generatedSourceFiles[3];
let handlerSource = readFile(handlerPath);

if (!handlerSource.includes('import { Button } from "#enums/buttons";')) {
  const importAnchor =
    'import { globalScene } from "#app/global-scene";';

  if (!handlerSource.includes(importAnchor)) {
    fail(
      "Could not find the globalScene import in the Offline handler.",
    );
  }

  handlerSource = handlerSource.replace(
    importAnchor,
    `${importAnchor}
import { Button } from "#enums/buttons";`,
  );
}

if (
  !handlerSource.includes(
    'import { NavigationManager } from "#ui/navigation-menu";',
  )
) {
  const importAnchor =
    'import { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";';

  if (!handlerSource.includes(importAnchor)) {
    fail(
      "Could not find the BaseSettingsUiHandler import.",
    );
  }

  handlerSource = handlerSource.replace(
    importAnchor,
    `${importAnchor}
import { NavigationManager } from "#ui/navigation-menu";`,
  );
}

/*
 * Remove the earlier v1 processInput override, if present. The old patch used
 * the marker below and was inserted immediately after the constructor.
 */
const oldOverridePattern =
  /\n\s*\/\*\*[\s\S]*?offline-settings-navigation-fix:[\s\S]*?public override processInput\(button: Button\): boolean \{[\s\S]*?\n\s*\}\n(?=\s*private rowIndex)/;

if (oldOverridePattern.test(handlerSource)) {
  handlerSource = handlerSource.replace(
    oldOverridePattern,
    "\n",
  );
}

if (!handlerSource.includes("settings-offline-navigation-v2")) {
  const constructorPattern =
    /  constructor\(mode: UiMode \| null = null\) \{[\s\S]*?^  \}/m;
  const constructorMatch = handlerSource.match(constructorPattern);

  if (!constructorMatch) {
    fail(
      "Could not find the OfflineSettingsUiHandler constructor.",
    );
  }

  const navigationMethods = `

  /**
   * settings-offline-navigation-v2:
   * Keep the custom Offline mode synchronized with the shared settings-tab
   * navigation manager and handle shoulder/tab inputs directly.
   */
  public override processInput(button: Button): boolean {
    if (
      button !== Button.CYCLE_FORM
      && button !== Button.CYCLE_SHINY
    ) {
      return super.processInput(button);
    }

    const navigationManager = NavigationManager.getInstance();

    navigationManager.selectedMode = UiMode.SETTINGS_OFFLINE;
    navigationManager.navigate(
      button === Button.CYCLE_FORM ? "LEFT" : "RIGHT",
    );

    globalScene.ui.playSelect();
    return true;
  }`;

  handlerSource = handlerSource.replace(
    constructorMatch[0],
    constructorMatch[0] + navigationMethods,
  );
}

/*
 * Synchronize the selected tab whenever Offline is shown. This also makes the
 * navbar highlight reliable when entering from either direction.
 */
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

if (handlerSource.includes("UiMode.APP_SETTINGS")) {
  fail(
    "The old APP_SETTINGS mode still remains in the Offline handler.",
  );
}

writeFile(handlerPath, handlerSource);

console.log(
  "Offline settings mode renamed to SETTINGS_OFFLINE.",
);
console.log(
  "Touch and controller tab navigation fix applied successfully.",
);
