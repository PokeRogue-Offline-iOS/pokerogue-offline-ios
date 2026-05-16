#!/usr/bin/env node
/**
 * Patch: remove-touch-controls.js
 *
 * Removes the touch-controls script tag from dist/index.html for desktop builds.
 *
 * The touch-controls script is mobile-only and causes errors on desktop
 * WebView environments (e.g. WebKitGTK on Linux) where the touch API
 * behaves differently, resulting in a null reference error during preload.
 *
 * Targets: pokerogue-src/dist/index.html
 */

const fs   = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "dist", "index.html");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

const MARKER = "remove-touch-controls";

if (src.includes(MARKER)) {
  console.log("Touch controls already removed, skipping.");
  process.exit(0);
}

// Remove any script tag referencing touch-controls
const before = src;
src = src.replace(/<script[^>]*touch-controls[^>]*><\/script>/gi, `<!-- ${MARKER}: touch controls removed for desktop -->`);

if (src === before) {
  console.log("No touch-controls script tag found, skipping.");
  process.exit(0);
}

fs.writeFileSync(TARGET, src, "utf8");
console.log("Touch controls script removed from dist/index.html");
