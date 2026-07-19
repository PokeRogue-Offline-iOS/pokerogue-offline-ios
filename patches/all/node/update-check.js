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
 * Also adds a small "Update Available!" hint label under the version text,
 * used INSTEAD of opening the full UPDATE_AVAILABLE screen when the
 * "Non-Intrusive Update Notification" setting (Offline tab, added by
 * app-settings-menu.js) is turned on. Reads it via SettingKeys, which is
 * upstream's own pre-existing settings module — no ordering dependency on
 * app-settings-menu.js, which only appends more keys to that same object.
 * Default (setting off) behavior is unchanged: the full changelog screen
 * still opens.
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

function requireAnchor(src, anchor, label) {
  if (!src.includes(anchor)) {
    console.error(`ERROR: Could not find anchor for "${label}".`);
    console.error("The upstream file may have changed. Manual inspection required.");
    process.exit(1);
  }
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

// ── Sub-patch 2a: title-ui-handler.ts — new imports, alphabetically placed ──

const NEW_IMPORTS_ANCHOR = `import { version } from "#package.json";\n`;
requireAnchor(src, NEW_IMPORTS_ANCHOR, '\'import { version } from "#package.json";\' in title-ui-handler.ts');
src = src.replace(
  NEW_IMPORTS_ANCHOR,
  `${NEW_IMPORTS_ANCHOR}` +
    `import { checkForUpdates } from "#system/offline/update-check-api";\n` +
    `import { SettingKeys } from "#system/settings";\n`,
);

// ── Sub-patch 2b: title-ui-handler.ts — module-scope constants ─────────────

const IMPORT_ANCHOR = `import i18next from "i18next";\n`;

if (!src.includes(IMPORT_ANCHOR)) {
  console.error('ERROR: Could not find \'import i18next from "i18next";\' anchor in title-ui-handler.ts.');
  process.exit(1);
}

const CONSTANTS_BLOCK =
  IMPORT_ANCHOR +
  `\n` +
  `// update-check: reuses the same build-number token offline-banner.js's\n` +
  `// placeholder substitutes, so CI's existing global sed replace covers this too.\n` +
  `// Only used to skip dev/local builds entirely - the update decision itself is\n` +
  `// version-based (see #system/offline/update-check-api.ts), not build-number-based.\n` +
  `const OFFLINE_BUILD_NUMBER = "BUILD_NUMBER_PLACEHOLDER";\n` +
  `let hasCheckedForUpdate = false;\n` +
  `\n` +
  `// update-check: mirrors the localStorage-read pattern used by\n` +
  `// google-drive-backup.ts's includeCurrentRunEnabled() for the same reason -\n` +
  `// this runs before any UiHandler has necessarily read the settings blob\n` +
  `// itself, so it reads the shared "settings" localStorage entry directly.\n` +
  `function nonIntrusiveUpdateNotificationEnabled(): boolean {\n` +
  `  try {\n` +
  `    const raw = localStorage.getItem("settings");\n` +
  `    if (!raw) {\n` +
  `      return false;\n` +
  `    }\n` +
  `    const parsed = JSON.parse(raw);\n` +
  `    return parsed?.[SettingKeys.Offline_Non_Intrusive_Update] === 1;\n` +
  `  } catch {\n` +
  `    return false;\n` +
  `  }\n` +
  `}\n` +
  `\n` +
  `async function checkForOfflineUpdate(hintText: Phaser.GameObjects.Text): Promise<void> {\n` +
  `  if (OFFLINE_BUILD_NUMBER.includes("DEV")) {\n` +
  `    return;\n` +
  `  }\n` +
  `\n` +
  `  try {\n` +
  `    const releases = await checkForUpdates(version);\n` +
  `    if (releases.length === 0) {\n` +
  `      return;\n` +
  `    }\n` +
  `\n` +
  `    if (nonIntrusiveUpdateNotificationEnabled()) {\n` +
  `      hintText.setText("Update Available!");\n` +
  `    } else {\n` +
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
  `${indent}  checkForOfflineUpdate(this.updateAvailableHintText);\n` +
  `${indent}}`;

src = src.replace(SHOW_ANCHOR_PATTERN, SHOW_REPLACEMENT);

// ── Sub-patch 4: class field for the "Update Available!" hint text ─────────

const FIELD_ANCHOR = `private appVersionText: Phaser.GameObjects.Text;`;
requireAnchor(src, FIELD_ANCHOR, "appVersionText field declaration in title-ui-handler.ts");
src = src.replace(FIELD_ANCHOR, `${FIELD_ANCHOR}\n  private updateAvailableHintText: Phaser.GameObjects.Text;`);

// ── Sub-patch 5: create the hint text object in setup(), add it to titleContainer ─

const SETUP_ANCHOR =
  `    this.appVersionText = addTextObject(logoX - 60, logoHeight + 4, "", TextStyle.MONEY, { fontSize: "54px" }) // formatting\n` +
  `      .setOrigin();`;
requireAnchor(src, SETUP_ANCHOR, "appVersionText creation in title-ui-handler.ts setup()");
src = src.replace(
  SETUP_ANCHOR,
  `${SETUP_ANCHOR}\n\n` +
    `    // update-check: shown instead of the full changelog screen when\n` +
    `    // "Non-Intrusive Update Notification" is enabled (Offline settings tab).\n` +
    `    this.updateAvailableHintText = addTextObject(logoX - 60, logoHeight + 14, "", TextStyle.SUMMARY_GREEN, {\n` +
    `      fontSize: "54px",\n` +
    `    }).setOrigin();`,
);

const CONTAINER_ANCHOR =
  `    this.titleContainer.add([\n` +
  `      logo,\n` +
  `      this.usernameLabel,\n` +
  `      this.playerCountLabel,\n` +
  `      this.splashMessageText,\n` +
  `      this.appVersionText,\n` +
  `    ]);`;
requireAnchor(src, CONTAINER_ANCHOR, "titleContainer.add(...) array in title-ui-handler.ts setup()");
src = src.replace(
  CONTAINER_ANCHOR,
  `    this.titleContainer.add([\n` +
    `      logo,\n` +
    `      this.usernameLabel,\n` +
    `      this.playerCountLabel,\n` +
    `      this.splashMessageText,\n` +
    `      this.appVersionText,\n` +
    `      this.updateAvailableHintText,\n` +
    `    ]);`,
);

writeFile(TARGET, src);
console.log("Update check applied successfully.");
