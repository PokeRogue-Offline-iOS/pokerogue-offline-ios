#!/usr/bin/env node
/**
 * Patch: app-settings-menu.js
 *
 * Adds an "Offline Settings" option to the pause menu, directly under "Game
 * Settings". Opens a standalone screen (NOT a tab in the real Settings tab
 * system) showing last-played time + total battles, plus Google
 * Drive backup (sign in, manual "Backup Save"). No restore/import in v1.
 *
 * Six sub-patches, applied in order:
 *
 *   1. src/enums/ui-mode.ts
 *        Append APP_SETTINGS enum value (after ALERT_MODAL, the last entry —
 *        appending rather than inserting mid-list to minimize the odds of
 *        colliding with wherever upstream is actively adding new modes).
 *
 *   2. src/system/offline/google-drive-backup.ts  (new file)
 *        Cross-platform (Capacitor / Electron) Drive backup helper.
 *        Excludes sessionData*_<user> keys, includes everything else.
 *
 *   3. src/ui/handlers/app-settings-ui-handler.ts  (new file)
 *        The actual screen. Extends BaseOptionSelectUiHandler (same base
 *        class as ConfirmUiHandler) rather than the tabbed Settings system.
 *
 *   4. src/ui/ui.ts
 *        Import AppSettingsUiHandler, register at the position matching
 *        UiMode.APP_SETTINGS (end of the array, matching the enum append),
 *        and add UiMode.APP_SETTINGS to noTransitionModes.
 *
 *   5. src/ui/handlers/menu-ui-handler.ts
 *        Add MenuOptions.OFFLINE_SETTINGS immediately after GAME_SETTINGS
 *        (both in the enum and in the switch-case), gated behind the
 *        existing `isApp` flag using the same excludedMenus pattern already
 *        used for LOG_OUT/bypassLogin in this file.
 *
 *   6. src/ui/handlers/menu-ui-handler.ts (same file as #5, second edit)
 *        Hardcode the "Offline Settings" label directly in the option-label
 *        map, bypassing i18next entirely. Deliberately NOT touching the
 *        locales submodule — this is an offline-client-only feature, not
 *        worth pulling in the full translation workflow for.
 *
 * NOTE ON TESTING: sub-patches 1-6 have been checked against a fresh clone of
 * pagefaultgames/pokerogue and the anchors are confirmed present at the time
 * this was written. The new UI handler's runtime behavior (screen layout,
 * live label refresh) has NOT been verified in an actual build — see the
 * comments in app-settings-ui-handler.ts for the specific risk.
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
// pkr-offline repo. The two new source files it writes are checked into this
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
// Sub-patch 3: src/ui/handlers/app-settings-ui-handler.ts  (new file)
// ─────────────────────────────────────────────────────────────────────────────

const HANDLER_PATH = path.join("pokerogue-src", "src", "ui", "handlers", "app-settings-ui-handler.ts");

if (fs.existsSync(HANDLER_PATH)) {
  console.log("SKIP app-settings-ui-handler.ts — already exists");
} else {
  const src = fs.readFileSync(path.join(NEW_FILES_DIR, "src", "ui", "handlers", "app-settings-ui-handler.ts"), "utf8");
  writeFile(HANDLER_PATH, src);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 4: src/ui/ui.ts  →  import + register + noTransitionModes
// ─────────────────────────────────────────────────────────────────────────────

const UI_PATH = path.join("pokerogue-src", "src", "ui", "ui.ts");
let uiSrc = readFile(UI_PATH);

if (uiSrc.includes("AppSettingsUiHandler")) {
  console.log("SKIP ui.ts — AppSettingsUiHandler already present");
} else {
  // 4a. Import — insert after the AlertModalUiHandler import (the last handler import).
  const IMPORT_ANCHOR = `import { AlertModalUiHandler } from "#ui/alert-modal-ui-handler";`;
  requireAnchor(uiSrc, IMPORT_ANCHOR, "AlertModalUiHandler import in ui.ts");
  uiSrc = uiSrc.replace(
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\nimport { AppSettingsUiHandler } from "#ui/app-settings-ui-handler";`,
  );

  // 4b. Register handler — insert after new AlertModalUiHandler(), matching
  // its position at the end of the array to line up with the appended enum value.
  const HANDLER_ANCHOR = `new AlertModalUiHandler(),`;
  requireAnchor(uiSrc, HANDLER_ANCHOR, "new AlertModalUiHandler() in ui.ts");
  uiSrc = uiSrc.replace(HANDLER_ANCHOR, `${HANDLER_ANCHOR}\n      new AppSettingsUiHandler(),`);

  // 4c. noTransitionModes — insert after UiMode.ALERT_MODAL (also last in that list).
  const NO_TRANSITION_ANCHOR = `UiMode.ALERT_MODAL,`;
  requireAnchor(uiSrc, NO_TRANSITION_ANCHOR, "UiMode.ALERT_MODAL in noTransitionModes");
  uiSrc = uiSrc.replace(NO_TRANSITION_ANCHOR, `${NO_TRANSITION_ANCHOR}\n  UiMode.APP_SETTINGS,`);

  writeFile(UI_PATH, uiSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 5: src/ui/handlers/menu-ui-handler.ts  →  add pause-menu entry
// ─────────────────────────────────────────────────────────────────────────────

const MENU_PATH = path.join("pokerogue-src", "src", "ui", "handlers", "menu-ui-handler.ts");
let menuSrc = readFile(MENU_PATH);

if (menuSrc.includes("OFFLINE_SETTINGS")) {
  console.log("SKIP menu-ui-handler.ts — OFFLINE_SETTINGS already present");
} else {
  // 5a. Enum — insert immediately after GAME_SETTINGS so it renders directly
  // below "Game Settings" in the pause menu list order.
  const ENUM_ANCHOR = "enum MenuOptions {\n  GAME_SETTINGS,";
  requireAnchor(menuSrc, ENUM_ANCHOR, "MenuOptions.GAME_SETTINGS in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(ENUM_ANCHOR, `${ENUM_ANCHOR}\n  OFFLINE_SETTINGS,`);

  // 5b. Import UiMode.APP_SETTINGS is already covered — UiMode is already
  // imported in this file. Add the import for the new handler's UiMode isn't
  // needed since we only reference UiMode.APP_SETTINGS, which is a member of
  // the already-imported UiMode enum.

  // 5c. Gate visibility behind isApp, matching the existing bypassLogin
  // pattern used for LOG_OUT. Two occurrences: constructor's excludedMenus
  // and render()'s excludedMenus (render() rebuilds the list every open).
  const CTOR_EXCLUSION_ANCHOR = `{ condition: bypassLogin, options: [MenuOptions.LOG_OUT] },\n    ];`;
  requireAnchor(menuSrc, CTOR_EXCLUSION_ANCHOR, "constructor excludedMenus in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    CTOR_EXCLUSION_ANCHOR,
    `{ condition: bypassLogin, options: [MenuOptions.LOG_OUT] },\n      { condition: !isApp, options: [MenuOptions.OFFLINE_SETTINGS] },\n    ];`,
  );

  const RENDER_EXCLUSION_ANCHOR = `{ condition: !globalScene.currentBattle, options: [MenuOptions.SAVE_AND_QUIT] },\n    ];`;
  requireAnchor(menuSrc, RENDER_EXCLUSION_ANCHOR, "render() excludedMenus in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    RENDER_EXCLUSION_ANCHOR,
    `{ condition: !globalScene.currentBattle, options: [MenuOptions.SAVE_AND_QUIT] },\n      { condition: !isApp, options: [MenuOptions.OFFLINE_SETTINGS] },\n    ];`,
  );

  // 5d. Switch-case — mirror the GAME_SETTINGS case exactly, opening our new
  // standalone mode instead of UiMode.SETTINGS.
  const CASE_ANCHOR = `case MenuOptions.GAME_SETTINGS:
          ui.setOverlayMode(UiMode.SETTINGS);
          success = true;
          break;`;
  requireAnchor(menuSrc, CASE_ANCHOR, "MenuOptions.GAME_SETTINGS case in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    CASE_ANCHOR,
    `${CASE_ANCHOR}
        case MenuOptions.OFFLINE_SETTINGS:
          ui.setOverlayMode(UiMode.APP_SETTINGS);
          success = true;
          break;`,
  );

  writeFile(MENU_PATH, menuSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 6: src/ui/handlers/menu-ui-handler.ts  →  hardcode the label
//
// Deliberately NOT touching the locales submodule for this — this is an
// offline-client-only feature, not worth translating, so the label is
// special-cased directly in the option-label map rather than routed through
// i18next at all.
// ─────────────────────────────────────────────────────────────────────────────

menuSrc = readFile(MENU_PATH); // re-read: sub-patch 5 already rewrote this file above

if (menuSrc.includes("Offline Settings")) {
  console.log("SKIP menu-ui-handler.ts label — already hardcoded");
} else {
  const LABEL_ANCHOR =
    'this.menuOptions.map(o => `${i18next.t(`menuUiHandler:${toCamelCase(MenuOptions[o])}`)}`).join("\\n"),';
  requireAnchor(menuSrc, LABEL_ANCHOR, "menuOptions label-building line in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    LABEL_ANCHOR,
    `this.menuOptions
        .map(o =>
          o === MenuOptions.OFFLINE_SETTINGS
            ? "Offline Settings"
            : \`\${i18next.t(\`menuUiHandler:\${toCamelCase(MenuOptions[o])}\`)}\`,
        )
        .join("\\n"),`,
  );
  writeFile(MENU_PATH, menuSrc);
}

console.log("\napp-settings-menu patch applied successfully.");
