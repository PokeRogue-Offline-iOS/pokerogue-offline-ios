#!/usr/bin/env node
/**
 * Patch: fix-capacitor-input-focus.js
 *
 * Fixes a critical issue on Capacitor iOS apps where the keyboard auto-pops but
 * doesn't accept text input. The root cause is that auto-focus via setFocus() in
 * FormModalUiHandler triggers the keyboard to show, but the underlying DOM input
 * element doesn't receive actual focus, so keyboard input is lost.
 *
 * Solution: Detect if running in a Capacitor app and skip the auto-focus behavior.
 * On web, focus is only triggered when the user taps the input, so it works correctly.
 * On Capacitor iOS, the keyboard auto-pop combined with auto-focus causes a state
 * mismatch. By skipping auto-focus on native apps, we let the keyboard appear when
 * the user taps the input, at which point focus is properly established.
 *
 * Changes to src/ui/handlers/form-modal-ui-handler.ts:
 *   Wraps the auto-focus setTimeout in a condition that checks for Capacitor
 *   (or Cordova) presence before calling setFocus().
 *
 * Targets: pokerogue-src/src/ui/handlers/form-modal-ui-handler.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "form-modal-ui-handler.ts"
);

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n");

if (src.includes("fix-capacitor-input-focus")) {
  console.log("SKIP form-modal-ui-handler.ts — Capacitor input focus fix already present");
  process.exit(0);
}

// Find and replace the auto-focus setTimeout block
const AUTOFOCUS_PATTERN =
  /([ \t]*)\/\/ Auto focus the first input field after a short delay, to prevent accidental inputs\n([ \t]*)setTimeout\(\(\) => \{\n([ \t]*)this\.inputs\[0\]\?\.setFocus\(\);\n([ \t]*)\}, 50\);/;

const match = src.match(AUTOFOCUS_PATTERN);

if (!match) {
  console.error(
    "ERROR: Could not find auto-focus setTimeout pattern in form-modal-ui-handler.ts."
  );
  console.error(
    "The upstream file structure may have changed. Manual inspection required."
  );
  process.exit(1);
}

const indent = match[1];
const REPLACEMENT =
  `${indent}// fix-capacitor-input-focus: Skip auto-focus on native apps (Capacitor/Cordova)\n` +
  `${indent}// On iOS Capacitor, auto-focus triggers keyboard pop but doesn't properly focus the DOM element,\n` +
  `${indent}// causing keyboard input to be lost. On web and when user taps the input, focus works fine.\n` +
  `${indent}const isNativeApp = (window as any).capacitor !== undefined || (window as any).cordova !== undefined;\n` +
  `${indent}if (!isNativeApp) {\n` +
  `${indent}  setTimeout(() => {\n` +
  `${indent}    this.inputs[0]?.setFocus();\n` +
  `${indent}  }, 50);\n` +
  `${indent}}`;

src = src.replace(match[0], REPLACEMENT);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched Capacitor input focus in ${TARGET}`);
console.log("Capacitor input focus fix applied successfully.");
