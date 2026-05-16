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

// Guard: check for the attribute value we inject, not an XML comment.
// XML comments cannot appear inside an element's attribute list — they are
// only valid between elements — so we never write one there.
if (src.includes('android:windowSoftInputMode="adjustNothing"')) {
  console.log("Keyboard resize fix already present, skipping.");
  process.exit(0);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

const ACTIVITY_ANCHOR = 'android:name=".MainActivity"';

if (!src.includes(ACTIVITY_ANCHOR)) {
  console.error(`ERROR: Could not find '${ACTIVITY_ANCHOR}' in ${TARGET}`);
  console.error("AndroidManifest.xml structure may have changed. Manual inspection required.");
  process.exit(1);
}

if (src.includes("windowSoftInputMode")) {
  // Already set to something else — replace the value in place.
  src = src.replace(
    /android:windowSoftInputMode="[^"]*"/,
    'android:windowSoftInputMode="adjustNothing"'
  );
  console.log("Replaced existing windowSoftInputMode value with adjustNothing.");
} else {
  // Inject the attribute on a new line directly after android:name=".MainActivity".
  // No inline XML comment — comments are only valid between elements, not inside
  // an element's opening tag, and the XML parser will reject the manifest if one
  // is placed there.
  src = src.replace(
    ACTIVITY_ANCHOR,
    `${ACTIVITY_ANCHOR}\n            android:windowSoftInputMode="adjustNothing"`
  );
  console.log('Injected android:windowSoftInputMode="adjustNothing" into <activity>.');
}

// ── Write ─────────────────────────────────────────────────────────────────────

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched ${TARGET}`);
console.log("Keyboard resize fix applied successfully.");