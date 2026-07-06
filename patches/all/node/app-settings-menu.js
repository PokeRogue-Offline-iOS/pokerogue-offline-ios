#!/usr/bin/env node
/**
 * Patch: app-settings-menu.js
 *
 * Adds an "Offline" tab to the REAL Settings screen (alongside
 * General/Display/Audio/Gamepad/Keyboard), via NavigationManager's
 * documented extension point. Two interactive rows (Google sign-in,
 * manual "Backup Save"), two read-only rows (Last Played, Battles).
 *
 * v2 of this patch — replaces the earlier standalone screen + separate
 * pause-menu entry entirely. That approach worked but looked wrong (a
 * flat option list, not the tabbed grid look). This version integrates
 * directly into the real Settings tab system instead.
 *
 * Seven sub-patches, applied in order:
 *
 *   1. src/enums/ui-mode.ts
 *        Append APP_SETTINGS enum value (after ALERT_MODAL, the last entry).
 *
 *   2. src/system/offline/google-drive-backup.ts  (new file, unchanged from v1)
 *        Cross-platform (Capacitor / Electron) Drive backup helper.
 *
 *   3. src/ui/settings/offline-settings-ui-handler.ts  (new file)
 *        Extends BaseSettingsUiHandler (same base class as the real
 *        General/Display/Audio tabs) instead of BaseOptionSelectUiHandler,
 *        so it renders with the identical tab-bar + grid-row look.
 *
 *   4. src/ui/ui.ts
 *        Import OfflineSettingsUiHandler, register at the position matching
 *        UiMode.APP_SETTINGS, add to noTransitionModes.
 *
 *   5. src/ui/settings/navigation-menu.ts
 *        Append UiMode.APP_SETTINGS + a hardcoded "Offline" label to
 *        NavigationManager's `modes`/`labels` arrays — this is what actually
 *        makes it show up as a 6th tab in the real Settings screen.
 *
 *   6. src/system/settings/settings.ts
 *        Append SettingType.APP; append 4 new SettingKeys entries; append
 *        4 new Setting entries (2 activatable action rows, 2 read-only
 *        display rows) to the shared Setting[] array, all type: APP so they
 *        only ever show up on our tab.
 *
 *   7. src/ui/settings/base-settings-ui-handler.ts
 *        Widen `optionValueLabels` and `activateSetting` from private to
 *        protected. PURE VISIBILITY CHANGE — no other line in this file is
 *        touched. This is what lets our subclass (a) update a row's
 *        displayed text after an async action completes, and (b) add our
 *        own activatable-row cases without editing the base class's switch
 *        statement directly.
 *
 * REMOVED from v1: the standalone MenuOptions.OFFLINE_SETTINGS pause-menu
 * entry and its screen are gone entirely — reachable now only via
 * Game Settings → cycle tabs, same as every other settings category.
 *
 * NOTE ON TESTING: all 7 sub-patches have been checked against a fresh clone
 * of pagefaultgames/pokerogue and the anchors are confirmed present at the
 * time this was written. The new UI handler's runtime behavior (reaching
 * into optionValueLabels after construction, the activateSetting override)
 * has NOT been verified in an actual build — see the comments in
 * offline-settings-ui-handler.ts for the specific risk.
 */

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Could not find ${filePath}`);
    console.error("Make sure this script is run from the repo root and all submodules are initialised.");
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  Written: ${filePath}`);
}

function requireAnchor(src, anchor, label) {
  if (!src.includes(anchor)) {
    console.error(`ERROR: Could not find anchor for "${label}".`);
    console.error("The upstream file may have changed. Manual inspection required.");
    process.exit(1);
  }
}

// This patch script lives at patches/all/node/app-settings-menu.js in the
// pkr-offline repo. The new source files it writes are checked into this
// same repo (under new-files/) so this script and its payload stay together.
const NEW_FILES_DIR = path.join(__dirname, "..", "..", "..", "new-files");

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 1: src/enums/ui-mode.ts  →  append APP_SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

const UI_MODE_PATH = path.join("pokerogue-src", "src", "enums", "ui-mode.ts");
let uiModeSrc = readFile(UI_MODE_PATH);

if (uiModeSrc.includes("APP_SETTINGS")) {
  console.log("SKIP ui-mode.ts — APP_SETTINGS already present");
} else {
  const ANCHOR = "ALERT_MODAL,";
  requireAnchor(uiModeSrc, ANCHOR, "ALERT_MODAL in ui-mode.ts");
  uiModeSrc = uiModeSrc.replace(ANCHOR, `${ANCHOR}\n  APP_SETTINGS,`);
  writeFile(UI_MODE_PATH, uiModeSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 2: src/system/offline/google-drive-backup.ts  (new file)
// ─────────────────────────────────────────────────────────────────────────────

const BACKUP_MODULE_PATH = path.join("pokerogue-src", "src", "system", "offline", "google-drive-backup.ts");

if (fs.existsSync(BACKUP_MODULE_PATH)) {
  console.log("SKIP google-drive-backup.ts — already exists");
} else {
  const src = fs.readFileSync(path.join(NEW_FILES_DIR, "src", "system", "offline", "google-drive-backup.ts"), "utf8");
  writeFile(BACKUP_MODULE_PATH, src);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 3: src/ui/settings/offline-settings-ui-handler.ts  (new file)
// ─────────────────────────────────────────────────────────────────────────────

const HANDLER_PATH = path.join("pokerogue-src", "src", "ui", "settings", "offline-settings-ui-handler.ts");

if (fs.existsSync(HANDLER_PATH)) {
  console.log("SKIP offline-settings-ui-handler.ts — already exists");
} else {
  const src = fs.readFileSync(
    path.join(NEW_FILES_DIR, "src", "ui", "settings", "offline-settings-ui-handler.ts"),
    "utf8",
  );
  writeFile(HANDLER_PATH, src);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 4: src/ui/ui.ts  →  import + register + noTransitionModes
// ─────────────────────────────────────────────────────────────────────────────

const UI_PATH = path.join("pokerogue-src", "src", "ui", "ui.ts");
let uiSrc = readFile(UI_PATH);

if (uiSrc.includes("OfflineSettingsUiHandler")) {
  console.log("SKIP ui.ts — OfflineSettingsUiHandler already present");
} else {
  const IMPORT_ANCHOR = `import { AlertModalUiHandler } from "#ui/alert-modal-ui-handler";`;
  requireAnchor(uiSrc, IMPORT_ANCHOR, "AlertModalUiHandler import in ui.ts");
  uiSrc = uiSrc.replace(
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\nimport { OfflineSettingsUiHandler } from "#ui/offline-settings-ui-handler";`,
  );

  const HANDLER_ANCHOR = `new AlertModalUiHandler(),`;
  requireAnchor(uiSrc, HANDLER_ANCHOR, "new AlertModalUiHandler() in ui.ts");
  uiSrc = uiSrc.replace(HANDLER_ANCHOR, `${HANDLER_ANCHOR}\n      new OfflineSettingsUiHandler(),`);

  const NO_TRANSITION_ANCHOR = `UiMode.ALERT_MODAL,`;
  requireAnchor(uiSrc, NO_TRANSITION_ANCHOR, "UiMode.ALERT_MODAL in noTransitionModes");
  uiSrc = uiSrc.replace(NO_TRANSITION_ANCHOR, `${NO_TRANSITION_ANCHOR}\n  UiMode.APP_SETTINGS,`);

  writeFile(UI_PATH, uiSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 5: src/ui/settings/navigation-menu.ts  →  register the 6th tab
// ─────────────────────────────────────────────────────────────────────────────

const NAV_PATH = path.join("pokerogue-src", "src", "ui", "settings", "navigation-menu.ts");
let navSrc = readFile(NAV_PATH);

if (navSrc.includes("UiMode.APP_SETTINGS")) {
  console.log("SKIP navigation-menu.ts — APP_SETTINGS tab already present");
} else {
  const MODES_ANCHOR = `UiMode.SETTINGS_KEYBOARD,\n    ];`;
  requireAnchor(navSrc, MODES_ANCHOR, "modes array in navigation-menu.ts");
  navSrc = navSrc.replace(MODES_ANCHOR, `UiMode.SETTINGS_KEYBOARD,\n      UiMode.APP_SETTINGS,\n    ];`);

  const LABELS_ANCHOR = `i18next.t("settings:keyboard"),\n    ];`;
  requireAnchor(navSrc, LABELS_ANCHOR, "labels array in navigation-menu.ts");
  // Hardcoded, deliberately not routed through i18next — offline-client-only feature.
  navSrc = navSrc.replace(LABELS_ANCHOR, `i18next.t("settings:keyboard"),\n      "Offline",\n    ];`);

  writeFile(NAV_PATH, navSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 6: src/system/settings/settings.ts  →  SettingType, SettingKeys, Setting[]
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PATH = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSrc = readFile(SETTINGS_PATH);

if (settingsSrc.includes("SettingType.APP")) {
  console.log("SKIP settings.ts — SettingType.APP already present");
} else {
  // 6a. SettingType enum — append APP.
  const TYPE_ANCHOR = `export enum SettingType {\n  GENERAL,\n  DISPLAY,\n  AUDIO,\n}`;
  requireAnchor(settingsSrc, TYPE_ANCHOR, "SettingType enum in settings.ts");
  settingsSrc = settingsSrc.replace(
    TYPE_ANCHOR,
    `export enum SettingType {\n  GENERAL,\n  DISPLAY,\n  AUDIO,\n  APP,\n}`,
  );

  // 6b. SettingKeys — append 4 new keys.
  const KEYS_ANCHOR = `Prefer_Baton_Pass: "PREFER_BATON_PASS",\n};`;
  requireAnchor(settingsSrc, KEYS_ANCHOR, "SettingKeys object in settings.ts");
  settingsSrc = settingsSrc.replace(
    KEYS_ANCHOR,
    `Prefer_Baton_Pass: "PREFER_BATON_PASS",
  Offline_Google_Connect: "OFFLINE_GOOGLE_CONNECT",
  Offline_Backup_Save: "OFFLINE_BACKUP_SAVE",
  Offline_Last_Played: "OFFLINE_LAST_PLAYED",
  Offline_Battles: "OFFLINE_BATTLES",
};`,
  );

  // 6c. Setting[] array — append 4 new rows.
  const SETTING_ANCHOR = `  {
    key: SettingKeys.Prefer_Baton_Pass,
    label: i18next.t("settings:preferBatonPass"),
    options: OFF_ON,
    default: 1,
    type: SettingType.DISPLAY,
  },
];`;
  requireAnchor(settingsSrc, SETTING_ANCHOR, "last Setting[] entry in settings.ts");
  settingsSrc = settingsSrc.replace(
    SETTING_ANCHOR,
    `  {
    key: SettingKeys.Prefer_Baton_Pass,
    label: i18next.t("settings:preferBatonPass"),
    options: OFF_ON,
    default: 1,
    type: SettingType.DISPLAY,
  },
  {
    key: SettingKeys.Offline_Google_Connect,
    label: "Connect Google Account",
    options: [{ value: "0", label: "Not Connected" }],
    default: 0,
    type: SettingType.APP,
    activatable: true,
  },
  {
    key: SettingKeys.Offline_Backup_Save,
    label: "Backup Save",
    options: [{ value: "0", label: "Google Drive" }],
    default: 0,
    type: SettingType.APP,
    activatable: true,
  },
  {
    key: SettingKeys.Offline_Last_Played,
    label: "Last Played",
    options: [{ value: "0", label: "—" }],
    default: 0,
    type: SettingType.APP,
  },
  {
    key: SettingKeys.Offline_Battles,
    label: "Battles",
    options: [{ value: "0", label: "0" }],
    default: 0,
    type: SettingType.APP,
  },
];`,
  );

  writeFile(SETTINGS_PATH, settingsSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 7: src/ui/settings/base-settings-ui-handler.ts  →  widen visibility
// ─────────────────────────────────────────────────────────────────────────────

const BASE_HANDLER_PATH = path.join("pokerogue-src", "src", "ui", "settings", "base-settings-ui-handler.ts");
let baseHandlerSrc = readFile(BASE_HANDLER_PATH);

if (baseHandlerSrc.includes("protected optionValueLabels")) {
  console.log("SKIP base-settings-ui-handler.ts — already widened");
} else {
  const FIELD_ANCHOR = `private optionValueLabels: Phaser.GameObjects.Text[][];`;
  requireAnchor(baseHandlerSrc, FIELD_ANCHOR, "optionValueLabels field in base-settings-ui-handler.ts");
  baseHandlerSrc = baseHandlerSrc.replace(FIELD_ANCHOR, `protected optionValueLabels: Phaser.GameObjects.Text[][];`);

  const METHOD_ANCHOR = `private activateSetting(setting: Setting): boolean {`;
  requireAnchor(baseHandlerSrc, METHOD_ANCHOR, "activateSetting method in base-settings-ui-handler.ts");
  baseHandlerSrc = baseHandlerSrc.replace(
    METHOD_ANCHOR,
    `protected activateSetting(setting: Setting): boolean {`,
  );

  writeFile(BASE_HANDLER_PATH, baseHandlerSrc);
}

console.log("\napp-settings-menu patch applied successfully.");
