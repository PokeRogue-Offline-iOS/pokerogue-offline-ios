#!/usr/bin/env node
/**
 * Patch: android-import-fix.js
 *
 * Extends the iOS import overlay to also show on Android.
 * iosImport.patch only shows the overlay when isIOS() is true; Android falls
 * through to saveFile.click() directly which doesn't work reliably.
 *
 * Changes isIOS() checks to isNative() (Capacitor.isNativePlatform()) so the
 * overlay appears on both platforms.
 *
 * Also fixes an Android-specific bug: when the file picker closes, the WebView
 * fires a click event on the overlay (which is still covering the screen).
 * iosImport.patch's overlay.onclick removes saveFile, which kills the input
 * before the change event can fire — so nothing happens after file selection.
 * The fix replaces overlay.onclick so it no longer removes saveFile; saveFile
 * cleans itself up inside the change listener instead.
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

// Move appendChild(saveFile) inside the native block so saveFile is in the DOM
// before the picker opens. If appended after selection, Android WebView re-fires
// the change event on insertion, causing a duplicate read and skipping the
// confirm dialog.
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

// Remove the trailing appendChild(saveFile) left by iosImport.patch — now
// redundant since saveFile is appended inside the native block above.
const TRAILING_APPEND_OLD = `\n\n    // Append the file input to body for iOS compatibility\n    document.body.appendChild(saveFile);`;

if (!src.includes(TRAILING_APPEND_OLD)) {
  console.error("ERROR: Could not find trailing appendChild(saveFile) in game-data.ts.");
  process.exit(1);
}
src = src.replace(TRAILING_APPEND_OLD, "");

// Replace overlay.onclick so it no longer removes saveFile.
// iosImport.patch's handler removes saveFile on overlay click, which is fine
// for iOS (the overlay click only fires on cancel). On Android however, the
// WebView fires a click on the overlay when the file picker closes — before the
// change event fires — destroying saveFile and silently swallowing the
// selection. Removing saveFile.remove() from this handler fixes that; saveFile
// is cleaned up inside the change listener instead.
const OVERLAY_ONCLICK_OLD = `      // Handle overlay click to cancel
      overlay.onclick = () => {
        overlay.remove();
        uploadButton.remove();
        saveFile.remove();
      };`;
const OVERLAY_ONCLICK_NEW = `      // Handle overlay click to cancel
      overlay.onclick = () => {
        overlay.remove();
        uploadButton.remove();
        // android-import-overlay: do not remove saveFile here. On Android the
        // WebView fires a click on the overlay when the file picker closes,
        // before the change event fires. Removing saveFile at that point would
        // silently swallow the selection. saveFile removes itself in the change
        // listener once the import is complete.
      };`;

if (!src.includes(OVERLAY_ONCLICK_OLD)) {
  console.error("ERROR: Could not find overlay.onclick handler in game-data.ts.");
  process.exit(1);
}
src = src.replace(OVERLAY_ONCLICK_OLD, OVERLAY_ONCLICK_NEW);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched import overlay in ${TARGET}`);
console.log("Android import overlay applied successfully.");
