#!/usr/bin/env node

/**
 * Fix Offline settings tab navigation on touchscreens and controllers.
 *
 * Root causes:
 *
 * 1. Touch controls only display the settings-tab buttons when the active
 *    UiMode name begins with "SETTINGS", so APP_SETTINGS is renamed to
 *    SETTINGS_OFFLINE.
 *
 * 2. UiInputs.buttonCycleOption() only forwards CYCLE_FORM / CYCLE_SHINY
 *    when the active handler is in a hardcoded whitelist. The custom
 *    OfflineSettingsUiHandler was missing from that whitelist, so F/R and
 *    LB/RB were discarded before reaching UI.processInput() or the handler.
 *
 * Works with both the full Google Drive handler and the Switch-only local
 * handler installed later by patches/switch/node/remove-google-drive.js.
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
 * Rename the custom mode so the touch controls continue treating it as a
 * member of the Settings UI family.
 */
const modeReferenceFiles = [
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

for (const filePath of modeReferenceFiles) {
  let source = readFile(filePath);

  if (source.includes("APP_SETTINGS")) {
    source = source.replaceAll(
      "APP_SETTINGS",
      "SETTINGS_OFFLINE",
    );
    writeFile(filePath, source);
  }
}

const uiModeSource = readFile(modeReferenceFiles[0]);

if (!uiModeSource.includes("SETTINGS_OFFLINE")) {
  fail(
    "SETTINGS_OFFLINE was not found in ui-mode.ts after renaming.",
  );
}

const navigationSource = readFile(modeReferenceFiles[2]);

if (!navigationSource.includes("UiMode.SETTINGS_OFFLINE")) {
  fail(
    "SETTINGS_OFFLINE was not registered in NavigationManager.",
  );
}

/*
 * Add the custom handler to UiInputs.buttonCycleOption()'s whitelist.
 * This is the required fix for both touchscreen F/R and controller LB/RB.
 */
const uiInputsPath = path.join(
  "pokerogue-src",
  "src",
  "ui-inputs.ts",
);

let uiInputsSource = readFile(uiInputsPath);

const offlineImport =
  'import { OfflineSettingsUiHandler } from "#ui/offline-settings-ui-handler";';

if (!uiInputsSource.includes(offlineImport)) {
  const importAnchor =
    'import type { MessageUiHandler } from "#ui/message-ui-handler";';

  if (!uiInputsSource.includes(importAnchor)) {
    fail(
      "Could not find the MessageUiHandler import in ui-inputs.ts.",
    );
  }

  uiInputsSource = uiInputsSource.replace(
    importAnchor,
    `${importAnchor}
${offlineImport}`,
  );
}

if (!uiInputsSource.includes("offline-settings-cycle-whitelist")) {
  const whitelistAnchor = `      SettingsGamepadUiHandler,
      SettingsKeyboardUiHandler,
    ];`;

  if (!uiInputsSource.includes(whitelistAnchor)) {
    fail(
      "Could not find the settings handler whitelist "
        + "inside UiInputs.buttonCycleOption().",
    );
  }

  const whitelistReplacement = `      SettingsGamepadUiHandler,
      SettingsKeyboardUiHandler,
      // offline-settings-cycle-whitelist
      OfflineSettingsUiHandler,
    ];`;

  uiInputsSource = uiInputsSource.replace(
    whitelistAnchor,
    whitelistReplacement,
  );
}

writeFile(uiInputsPath, uiInputsSource);

console.log(
  "Offline settings mode renamed to SETTINGS_OFFLINE.",
);
console.log(
  "OfflineSettingsUiHandler added to the cycle-button whitelist.",
);
console.log(
  "Touchscreen F/R and controller LB/RB navigation fix applied successfully.",
);
