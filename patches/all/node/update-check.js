#!/usr/bin/env node
/**
 * Patch: update-check.js
 *
 * Adds a once-per-launch check against the PokeRogue-Offline GitHub Releases
 * API. Every app version strictly newer than the one currently installed is
 * collected (one entry per version - see #system/offline/update-check-api.ts,
 * copied in by this patch) and handed to the UPDATE_AVAILABLE screen
 * (registered by update-available-screen.js), which pages/scrolls through
 * each missing version's changelog.
 *
 * Depends on offline-banner.js having already run (this patch anchors on
 * the appVersionText.setText(...) line that patch produces, and relies on
 * the `isApp` import it adds). Must be applied after offline-banner.js.
 *
 * OFFLINE_BUILD_NUMBER reuses the BUILD_NUMBER_PLACEHOLDER token - the
 * existing CI `sed` substitution (global, /g) already replaces every
 * occurrence of this token in the file, so no workflow changes are needed.
 * It's only used here to skip the check on dev/local builds
 * (OFFLINE_BUILD_NUMBER.includes("DEV")) - the actual "is there an update"
 * decision is version-based, not build-number-based (see update-check-api.ts).
 *
 * Targets: pokerogue-src/src/ui/handlers/title-ui-handler.ts
 *          pokerogue-src/src/system/offline/update-check-api.ts (new file)
 *          pokerogue-src/test/tests/system/offline/update-check-api.test.ts (new file)
 */

const fs = require("fs");
const path = require("path");

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

// This patch script lives at patches/all/node/update-check.js in the
// pkr-offline repo. The new source file it writes is checked into this
// same repo (under new-files/) so this script and its payload stay together.
const NEW_FILES_DIR = path.join(__dirname, "..", "..", "..", "new-files");

const TARGET = path.join("pokerogue-src", "src", "ui", "handlers", "title-ui-handler.ts");

let src = readFile(TARGET);

if (src.includes("update-check-api")) {
  console.log("Update check already present, skipping.");
  process.exit(0);
}

// ── Sub-patch 1: src/system/offline/update-check-api.ts (new file) ─────────

const API_PATH = path.join("pokerogue-src", "src", "system", "offline", "update-check-api.ts");
if (fs.existsSync(API_PATH)) {
  console.log("SKIP update-check-api.ts — already exists");
} else {
  const apiSrc = fs.readFileSync(
    path.join(NEW_FILES_DIR, "src", "system", "offline", "update-check-api.ts"),
    "utf8",
  );
  writeFile(API_PATH, apiSrc);
}

const API_TEST_PATH = path.join("pokerogue-src", "test", "tests", "system", "offline", "update-check-api.test.ts");
if (fs.existsSync(API_TEST_PATH)) {
  console.log("SKIP update-check-api.test.ts — already exists");
} else {
  const apiTestSrc = fs.readFileSync(
    path.join(NEW_FILES_DIR, "test", "tests", "system", "offline", "update-check-api.test.ts"),
    "utf8",
  );
  writeFile(API_TEST_PATH, apiTestSrc);
}

// ── Sub-patch 2: title-ui-handler.ts — module-scope constants ──────────────

const IMPORT_ANCHOR = `import i18next from "i18next";\n`;

if (!src.includes(IMPORT_ANCHOR)) {
  console.error('ERROR: Could not find \'import i18next from "i18next";\' anchor in title-ui-handler.ts.');
  process.exit(1);
}

const CONSTANTS_BLOCK =
  IMPORT_ANCHOR +
  `import { checkForUpdates } from "#system/offline/update-check-api";\n` +
  `\n` +
  `// update-check: reuses the same build-number token offline-banner.js's\n` +
  `// placeholder substitutes, so CI's existing global sed replace covers this too.\n` +
  `// Only used to skip dev/local builds entirely - the update decision itself is\n` +
  `// version-based (see #system/offline/update-check-api.ts), not build-number-based.\n` +
  `const OFFLINE_BUILD_NUMBER = "BUILD_NUMBER_PLACEHOLDER";\n` +
  `let hasCheckedForUpdate = false;\n` +
  `\n` +
  `async function checkForOfflineUpdate(): Promise<void> {\n` +
  `  if (OFFLINE_BUILD_NUMBER.includes("DEV")) {\n` +
  `    return;\n` +
  `  }\n` +
  `\n` +
  `  try {\n` +
  `    const releases = await checkForUpdates(version);\n` +
  `    if (releases.length > 0) {\n` +
  `      globalScene.ui.setOverlayMode(UiMode.UPDATE_AVAILABLE, releases);\n` +
  `    }\n` +
  `  } catch {\n` +
  `    // Offline or GitHub API unreachable — fail silently.\n` +
  `  }\n` +
  `}\n`;

src = src.replace(IMPORT_ANCHOR, CONSTANTS_BLOCK);

// ── Sub-patch 3: trigger the check once per launch from show() ─────────────

const SHOW_ANCHOR_PATTERN = /([ \t]*)this\.appVersionText\.setText\("v" \+ version \+ betaText \+ appText\);/;
const showMatch = src.match(SHOW_ANCHOR_PATTERN);

if (!showMatch) {
  console.error("ERROR: Could not find patched appVersionText.setText line (offline-banner.js must run first).");
  process.exit(1);
}

const indent = showMatch[1];
const SHOW_REPLACEMENT =
  `${showMatch[0]}\n\n` +
  `${indent}// update-check: fire once per launch, offline builds only.\n` +
  `${indent}if (isApp && !hasCheckedForUpdate) {\n` +
  `${indent}  hasCheckedForUpdate = true;\n` +
  `${indent}  checkForOfflineUpdate();\n` +
  `${indent}}`;

src = src.replace(SHOW_ANCHOR_PATTERN, SHOW_REPLACEMENT);

writeFile(TARGET, src);
console.log("Update check applied successfully.");
