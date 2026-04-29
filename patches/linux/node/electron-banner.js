#!/usr/bin/env node
/**
 * Patch: electron-banner.js
 *
 * Appends a "(Linux)" suffix to the offline-client banner so users and
 * support can distinguish the desktop build from the mobile builds.
 *
 * This patch runs AFTER offline-banner.js has already been applied (which
 * sets the base banner text).  It simply replaces the "Unofficial Offline
 * Client" label with one that includes "(Linux)".
 *
 * BUILD_NUMBER_PLACEHOLDER is substituted by the CI workflow via sed before
 * the Vite build runs (same as the Android/iOS workflows).
 *
 * Targets: pokerogue-src/src/ui/handlers/title-ui-handler.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "title-ui-handler.ts"
);

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("electron-banner")) {
  console.log("electron-banner already present, skipping.");
  process.exit(0);
}

// offline-banner.js will have inserted this exact string — swap in the Linux label.
const OLD_LABEL = "Unofficial Offline Client (Scooom) Build #BUILD_NUMBER_PLACEHOLDER";
const NEW_LABEL = "Unofficial Offline Client (Linux) Build #BUILD_NUMBER_PLACEHOLDER";

if (!src.includes(OLD_LABEL)) {
  console.error(
    "ERROR: Could not find the offline-banner label to update. " +
    "Make sure offline-banner.js ran first."
  );
  process.exit(1);
}

src = src.replace(OLD_LABEL, NEW_LABEL);

// Leave a breadcrumb so idempotency check above works on re-runs.
src = src.replace(
  "// offline-banner: append client label",
  "// electron-banner / offline-banner: append client label"
);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched electron banner label in ${TARGET}`);
