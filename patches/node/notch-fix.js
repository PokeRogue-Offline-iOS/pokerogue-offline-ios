#!/usr/bin/env node
/**
 * Patch: notch-fix.js
 * Adds viewport-fit=cover to the built index.html so that iOS safe-area-inset
 * variables are non-zero on notched devices, preventing content from rendering
 * under the status bar / notch.
 *
 * Must run AFTER the PokeRogue build step (dist/index.html must exist).
 *
 * Targets: pokerogue-src/dist/index.html
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "dist", "index.html");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure this runs after the build step (dist/ must exist).");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

// Match any existing <meta name="viewport" ...> tag regardless of its current content.
const VIEWPORT_RE = /<meta\s+name="viewport"[^>]*>/i;

const REPLACEMENT = '<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">';

if (!VIEWPORT_RE.test(src)) {
  console.error("ERROR: Could not find a <meta name=\"viewport\"> tag in index.html.");
  console.error("The build output may have changed. Manual inspection required.");
  process.exit(1);
}

const patched = src.replace(VIEWPORT_RE, REPLACEMENT);

if (patched === src) {
  console.error("ERROR: Replacement produced no change. Something went wrong.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Patched viewport meta in ${TARGET}`);
console.log("Notch fix applied successfully.");
