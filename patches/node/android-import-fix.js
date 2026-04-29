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
// The non-native else branch still hides saveFile but never appends it, which
// is fine because the non-native path uses saveFile.click() directly and the
// browser handles it without the element being in the DOM.
const TRAILING_APPEND_OLD = `\n\n    // Append the file input to body for iOS compatibility\n    document.body.appendChild(saveFile);`;

if (!src.includes(TRAILING_APPEND_OLD)) {
  console.error("ERROR: Could not find trailing appendChild(saveFile) in game-data.ts.");
  process.exit(1);
}
src = src.replace(TRAILING_APPEND_OLD, "");

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched import overlay in ${TARGET}`);
console.log("Android import overlay applied successfully.");
