#!/usr/bin/env node
/**
 * Patch: android-import-overlay.js
 *
 * Extends the iOS import overlay to also show on Android.
 * iosImport.patch only shows the overlay when isIOS() is true; Android falls
 * through to saveFile.click() directly which doesn't work reliably.
 *
 * Changes isIOS() checks to isNative() (Capacitor.isNativePlatform()) so the
 * overlay appears on both platforms.
 *
 * Also fixes a timing issue where the overlay was removed synchronously at the
 * top of the `change` handler, before reader.onload fires. On Android, the
 * touch event from the finger lifting after picker dismissal lands on the game
 * canvas in that window and triggers revertMode(), dismissing the confirm
 * dialog immediately. The overlay is kept alive until the confirm dialog is
 * shown, so it absorbs any stray touches in the interim.
 *
 * Targets: pokerogue-src/src/system/game-data.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "src", "system", "game-data.ts");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("android-import-overlay")) {
  console.log("Android import overlay already present, skipping.");
  process.exit(0);
}

// Replace the isIOS import with a local isNative helper
const IMPORT_OLD = `import { isIOS } from "#app/touch-controls";`;
const IMPORT_NEW = `import { isIOS } from "#app/touch-controls";
// android-import-overlay: show upload overlay on all Capacitor platforms
const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();`;

if (!src.includes(IMPORT_OLD)) {
  console.error("ERROR: Could not find isIOS import in game-data.ts.");
  process.exit(1);
}
src = src.replace(IMPORT_OLD, IMPORT_NEW);

// Replace the isIOS() condition that gates the overlay
const CONDITION_OLD = `// iOS requires user interaction with a visible element to trigger file input
    if (isIOS()) {`;
const CONDITION_NEW = `// iOS and Android require user interaction with a visible element to trigger file input
    if (isNative()) {`;

if (!src.includes(CONDITION_OLD)) {
  console.error("ERROR: Could not find isIOS() overlay condition in game-data.ts.");
  process.exit(1);
}
src = src.replace(CONDITION_OLD, CONDITION_NEW);

// Replace the auto-click guard
const CLICK_OLD = `// Only auto-click on non-iOS devices
    if (!isIOS()) {
      saveFile.click();
    }`;
const CLICK_NEW = `// Only auto-click on non-native platforms
    if (!isNative()) {
      saveFile.click();
    }`;

if (!src.includes(CLICK_OLD)) {
  console.error("ERROR: Could not find auto-click guard in game-data.ts.");
  process.exit(1);
}
src = src.replace(CLICK_OLD, CLICK_NEW);

// Move appendChild(saveFile) inside the native block, before the overlay/button
// are appended. This ensures saveFile is in the DOM before the user can tap the
// button and open the picker. If it were appended after file selection (as
// iosImport.patch leaves it at the bottom of the function), Android WebView
// re-fires the `change` event when the already-filled input is inserted into
// the DOM — causing a duplicate read that corrupts the UI mode stack and
// triggers window.location.reload() before the confirm dialog can appear.
const APPEND_OVERLAY_OLD = `      document.body.appendChild(overlay);
      document.body.appendChild(uploadButton);`;
const APPEND_OVERLAY_NEW = `      document.body.appendChild(overlay);
      document.body.appendChild(uploadButton);
      // android-import-overlay: saveFile must be in the DOM before the picker
      // opens so that Android WebView does not re-fire change on insertion.
      document.body.appendChild(saveFile);`;

if (!src.includes(APPEND_OVERLAY_OLD)) {
  console.error("ERROR: Could not find overlay/button appendChild block in game-data.ts.");
  process.exit(1);
}
src = src.replace(APPEND_OVERLAY_OLD, APPEND_OVERLAY_NEW);

// Remove the trailing appendChild(saveFile) left by iosImport.patch — it is
// now redundant for the native path and harmful (triggers the duplicate event).
const TRAILING_APPEND_OLD = `\n\n    // Append the file input to body for iOS compatibility\n    document.body.appendChild(saveFile);`;

if (!src.includes(TRAILING_APPEND_OLD)) {
  console.error("ERROR: Could not find trailing appendChild(saveFile) in game-data.ts.");
  process.exit(1);
}
src = src.replace(TRAILING_APPEND_OLD, "");

// Move overlay/button cleanup out of the top of the change handler and into
// the showText callback, so the overlay stays in place until the confirm dialog
// is actually on screen. On Android, dismissing the file picker fires a touch
// event that reaches the game canvas in the gap between change firing (overlay
// removed) and reader.onload resolving (confirm shown). That stray touch calls
// revertMode() and pops the confirm dialog before the user ever sees it.
const CLEANUP_OLD = `    saveFile.addEventListener("change", e => {
      // Remove iOS UI elements if they exist
      const overlay = document.getElementById("iosUploadOverlay");
      const button = document.getElementById("iosUploadButton");
      if (overlay) {
        overlay.remove();
      }
      if (button) {
        button.remove();
      }

      const reader = new FileReader();

      reader.onload = (_ => {
        return e => {
          const dataName = i18next.t(\`gameData:\${toCamelCase(GameDataType[dataType])}\`);`;

const CLEANUP_NEW = `    saveFile.addEventListener("change", e => {
      const reader = new FileReader();

      reader.onload = (_ => {
        return e => {
          // android-import-overlay: remove overlay here, not at the top of the
          // change handler. Keeping the overlay alive until the confirm dialog
          // is shown prevents stray touches (from the picker dismissal) from
          // reaching the game canvas and calling revertMode().
          const overlay = document.getElementById("iosUploadOverlay");
          const button = document.getElementById("iosUploadButton");
          if (overlay) {
            overlay.remove();
          }
          if (button) {
            button.remove();
          }

          const dataName = i18next.t(\`gameData:\${toCamelCase(GameDataType[dataType])}\`);`;

if (!src.includes(CLEANUP_OLD)) {
  console.error("ERROR: Could not find change handler cleanup block in game-data.ts.");
  process.exit(1);
}
src = src.replace(CLEANUP_OLD, CLEANUP_NEW);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched import overlay in ${TARGET}`);
console.log("Android import overlay applied successfully.");
