#!/usr/bin/env node
/**
 * Patch: keyboard-resize-fix.js
 *
 * Prevents the game from shrinking when the Android soft keyboard opens.
 *
 * Root cause:
 *   Android's default windowSoftInputMode is "adjustResize", which causes the
 *   WebView (and therefore the Phaser canvas) to shrink whenever the soft
 *   keyboard is shown. For a fullscreen game this is never desirable — the
 *   keyboard should overlay the game without affecting its layout at all.
 *
 * Fix:
 *   Sets android:windowSoftInputMode="adjustNothing" on the MainActivity
 *   <activity> element in AndroidManifest.xml so the keyboard floats over
 *   the game without triggering any layout changes.
 *
 * Targets: android/app/src/main/AndroidManifest.xml
 *   (located relative to the Capacitor project root, i.e. pokerogue-src/)
 */

const fs   = require("fs");
const path = require("path");

// ── Locate AndroidManifest.xml ────────────────────────────────────────────────

const TARGET = path.join("android", "app", "src", "main", "AndroidManifest.xml");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure 'npx cap add android' has been run before this patch.");
  process.exit(1);
}

// ── Read & guard ──────────────────────────────────────────────────────────────

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("adjustNothing")) {
  console.log("Keyboard resize fix already present, skipping.");
  process.exit(0);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

// Capacitor generates an <activity> tag with android:name=".MainActivity".
// We inject the windowSoftInputMode attribute onto that element.
// The comment acts as both a guard marker and documentation in the manifest.

const ACTIVITY_ANCHOR = 'android:name=".MainActivity"';

if (!src.includes(ACTIVITY_ANCHOR)) {
  console.error(`ERROR: Could not find '${ACTIVITY_ANCHOR}' in ${TARGET}`);
  console.error("AndroidManifest.xml structure may have changed. Manual inspection required.");
  process.exit(1);
}

// Check if windowSoftInputMode is already set by Capacitor (it normally isn't,
// but be safe and don't duplicate the attribute).
if (src.includes("windowSoftInputMode")) {
  // Replace whatever value is there with adjustNothing
  src = src.replace(
    /android:windowSoftInputMode="[^"]*"/,
    'android:windowSoftInputMode="adjustNothing" <!-- keyboard-resize-fix -->'
  );
  console.log("Replaced existing windowSoftInputMode with adjustNothing.");
} else {
  // Inject the attribute right after android:name=".MainActivity"
  src = src.replace(
    ACTIVITY_ANCHOR,
    `${ACTIVITY_ANCHOR}\n            android:windowSoftInputMode="adjustNothing"
  );
  console.log("Injected windowSoftInputMode=\"adjustNothing\" into <activity>.");
}

// ── Write ─────────────────────────────────────────────────────────────────────

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched ${TARGET}`);
console.log("Keyboard resize fix applied successfully.");
