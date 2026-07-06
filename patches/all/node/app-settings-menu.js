#!/usr/bin/env node
/**
 * Patch: app-settings-menu.js
 *
 * Adds an "Offline" tab to the REAL Settings screen (alongside
 * General/Display/Audio/Gamepad/Keyboard), via NavigationManager's
 * documented extension point.
 *
 * v3 of this patch — adds Restore Backup, Clear All Data, and a
 * "Debug: List AppData Files" screen on top of v2's Connect/Backup/
 * Last Played/Battles rows. Every row except Connect (and the two
 * read-only info rows) is now greyed out and inert while signed out,
 * using the game's existing TextStyle.SETTINGS_LOCKED convention.
 *
 * Sub-patches, applied in order:
 *
 *   1. src/enums/ui-mode.ts
 *        Append APP_SETTINGS and APP_DEBUG_FILE_LIST (after ALERT_MODAL,
 *        the last entry).
 *
 *   2. src/system/offline/google-drive-backup.ts  (new file)
 *        Cross-platform (Capacitor / Electron) Drive backup helper. Now
 *        also exposes listAppDataFiles() and restoreFromBackup().
 *
 *   3. src/ui/settings/offline-settings-ui-handler.ts  (new file)
 *        Extends BaseSettingsUiHandler (same base class as the real
 *        General/Display/Audio tabs) instead of BaseOptionSelectUiHandler,
 *        so it renders with the identical tab-bar + grid-row look.
 *
 *   3b. src/ui/settings/debug-appdata-list-ui-handler.ts  (new file)
 *        Modeled directly on ConfirmUiHandler's shape — a dynamic list of
 *        Drive appDataFolder files, any selection or Cancel just closes it.
 *
 *   4. src/ui/ui.ts
 *        Import both new handlers, register at the positions matching
 *        UiMode.APP_SETTINGS / UiMode.APP_DEBUG_FILE_LIST, add both to
 *        noTransitionModes.
 *
 *   5. src/ui/settings/navigation-menu.ts
 *        Append UiMode.APP_SETTINGS + a hardcoded "Offline" label to
 *        NavigationManager's `modes`/`labels` arrays — this is what actually
 *        makes it show up as a 6th tab in the real Settings screen.
 *
 *   6. src/system/settings/settings.ts
 *        Append SettingType.APP; append 7 SettingKeys entries; append 7
 *        Setting entries (5 activatable action rows, 2 read-only display
 *        rows) to the shared Setting[] array, all type: APP so they only
 *        ever show up on our tab.
 *
 *   7. src/ui/settings/base-settings-ui-handler.ts
 *        Widen `settingLabels`, `optionValueLabels`, and `activateSetting`
 *        from private to protected. PURE VISIBILITY CHANGE — no other line
 *        in this file is touched. This is what lets our subclass (a) grey
 *        out / restyle a row's label and value text, (b) update displayed
 *        text after an async action completes, and (c) add our own
 *        activatable-row cases without editing the base class's switch
 *        statement directly.
 *
 * NOTE ON TESTING: all sub-patches have been checked against a fresh clone
 * of pagefaultgames/pokerogue and the anchors are confirmed present at the
 * time this was written. The new UI handler's runtime behavior (reaching
 * into optionValueLabels/settingLabels after construction, the
 * activateSetting override, the UiMode.CONFIRM delay/message flow) has NOT
 * been verified in an actual build.
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
  uiModeSrc = uiModeSrc.replace(ANCHOR, `${ANCHOR}\n  APP_SETTINGS,\n  APP_DEBUG_FILE_LIST,`);
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
// Sub-patch 3b: src/ui/settings/debug-appdata-list-ui-handler.ts  (new file)
// ─────────────────────────────────────────────────────────────────────────────

const DEBUG_LIST_HANDLER_PATH = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "settings",
  "debug-appdata-list-ui-handler.ts",
);

if (fs.existsSync(DEBUG_LIST_HANDLER_PATH)) {
  console.log("SKIP debug-appdata-list-ui-handler.ts — already exists");
} else {
  const src = fs.readFileSync(
    path.join(NEW_FILES_DIR, "src", "ui", "settings", "debug-appdata-list-ui-handler.ts"),
    "utf8",
  );
  writeFile(DEBUG_LIST_HANDLER_PATH, src);
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
    `${IMPORT_ANCHOR}\nimport { OfflineSettingsUiHandler } from "#ui/offline-settings-ui-handler";\nimport { DebugAppDataListUiHandler } from "#ui/debug-appdata-list-ui-handler";`,
  );

  const HANDLER_ANCHOR = `new AlertModalUiHandler(),`;
  requireAnchor(uiSrc, HANDLER_ANCHOR, "new AlertModalUiHandler() in ui.ts");
  uiSrc = uiSrc.replace(
    HANDLER_ANCHOR,
    `${HANDLER_ANCHOR}\n      new OfflineSettingsUiHandler(),\n      new DebugAppDataListUiHandler(),`,
  );

  const NO_TRANSITION_ANCHOR = `UiMode.ALERT_MODAL,`;
  requireAnchor(uiSrc, NO_TRANSITION_ANCHOR, "UiMode.ALERT_MODAL in noTransitionModes");
  uiSrc = uiSrc.replace(
    NO_TRANSITION_ANCHOR,
    `${NO_TRANSITION_ANCHOR}\n  UiMode.APP_SETTINGS,\n  UiMode.APP_DEBUG_FILE_LIST,`,
  );

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
  Offline_Restore_Backup: "OFFLINE_RESTORE_BACKUP",
  Offline_Clear_Data: "OFFLINE_CLEAR_DATA",
  Offline_Debug_List_Files: "OFFLINE_DEBUG_LIST_FILES",
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
  {
    key: SettingKeys.Offline_Restore_Backup,
    label: "Restore Backup",
    options: [{ value: "0", label: "Restore" }],
    default: 0,
    type: SettingType.APP,
    activatable: true,
  },
  {
    key: SettingKeys.Offline_Clear_Data,
    label: "Clear All Data",
    options: [{ value: "0", label: "Clear" }],
    default: 0,
    type: SettingType.APP,
    activatable: true,
  },
  {
    key: SettingKeys.Offline_Debug_List_Files,
    label: "Debug: List AppData Files",
    options: [{ value: "0", label: "View" }],
    default: 0,
    type: SettingType.APP,
    activatable: true,
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
  const LABELS_FIELD_ANCHOR = `private settingLabels: Phaser.GameObjects.Text[];`;
  requireAnchor(baseHandlerSrc, LABELS_FIELD_ANCHOR, "settingLabels field in base-settings-ui-handler.ts");
  baseHandlerSrc = baseHandlerSrc.replace(LABELS_FIELD_ANCHOR, `protected settingLabels: Phaser.GameObjects.Text[];`);

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
