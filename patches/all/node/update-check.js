#!/usr/bin/env node
/**
 * Patch: update-check.js
 *
 * Adds a once-per-launch check against the PokeRogue-Offline GitHub Releases
 * API. If a newer build is available, shows the existing ALERT_MODAL Phaser
 * UI (same overlay used for egg-compensation / save-validation messages)
 * with the current and new version/build. Any input (Confirm or Back)
 * dismisses it — no closeDelay is passed, so it's dismissible immediately.
 *
 * Depends on offline-banner.js having already run (this patch anchors on
 * the appVersionText.setText(...) line that patch produces, and relies on
 * the `isApp` import it adds). Must be applied after offline-banner.js.
 *
 * OFFLINE_BUILD_NUMBER reuses the BUILD_NUMBER_PLACEHOLDER token — the
 * existing CI `sed` substitution (global, /g) already replaces every
 * occurrence of this token in the file, so no workflow changes are needed.
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

let src = fs.readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n");

if (src.includes("update-check")) {
  console.log("Update check already present, skipping.");
  process.exit(0);
}

// ── Patch 1: module-scope constants (placed right after the import block) ──

const IMPORT_ANCHOR = `import i18next from "i18next";\n`;

if (!src.includes(IMPORT_ANCHOR)) {
  console.error(
    'ERROR: Could not find \'import i18next from "i18next";\' anchor in title-ui-handler.ts.'
  );
  process.exit(1);
}

const CONSTANTS_BLOCK =
  IMPORT_ANCHOR +
  `\n` +
  `// update-check: reuses the same build-number token offline-banner.js's\n` +
  `// placeholder substitutes, so CI's existing global sed replace covers this too.\n` +
  `const OFFLINE_BUILD_NUMBER = "BUILD_NUMBER_PLACEHOLDER";\n` +
  `let hasCheckedForUpdate = false;\n` +
  `\n` +
  `async function checkForOfflineUpdate(): Promise<void> {\n` +
  `  if (OFFLINE_BUILD_NUMBER.includes("DEV")) {\n` +
  `    return;\n` +
  `  }\n` +
  `\n` +
  `  const localBuild = Number.parseInt(OFFLINE_BUILD_NUMBER, 10);\n` +
  `  if (Number.isNaN(localBuild)) {\n` +
  `    return;\n` +
  `  }\n` +
  `\n` +
  `  try {\n` +
  `    const response = await fetch(\n` +
  `      "https://api.github.com/repos/PokeRogue-Offline/pokerogue-offline/releases/latest"\n` +
  `    );\n` +
  `    if (!response.ok) {\n` +
  `      return;\n` +
  `    }\n` +
  `\n` +
  `    const data = await response.json();\n` +
  `    const tagName: string | undefined = data?.tag_name;\n` +
  `    const match = tagName?.match(/-(\\d+)$/);\n` +
  `    if (!match) {\n` +
  `      return;\n` +
  `    }\n` +
  `\n` +
  `    const remoteBuild = Number.parseInt(match[1], 10);\n` +
  `    if (Number.isNaN(remoteBuild) || remoteBuild <= localBuild) {\n` +
  `      return;\n` +
  `    }\n` +
  `\n` +
  `    globalScene.ui.setOverlayMode(\n` +
  `      UiMode.ALERT_MODAL,\n` +
  `      \`Update available!\\nCurrent: v\${version}-\${OFFLINE_BUILD_NUMBER}\\nNew: \${tagName}\\n\\nGrab it from GitHub Releases.\`\n` +
  `    );\n` +
  `  } catch {\n` +
  `    // Offline or GitHub API unreachable — fail silently.\n` +
  `  }\n` +
  `}\n`;

src = src.replace(IMPORT_ANCHOR, CONSTANTS_BLOCK);

// ── Patch 2: trigger the check once per launch from show() ─────────────────

const SHOW_ANCHOR_PATTERN =
  /([ \t]*)this\.appVersionText\.setText\("v" \+ version \+ betaText \+ appText\);/;
const showMatch = src.match(SHOW_ANCHOR_PATTERN);

if (!showMatch) {
  console.error(
    "ERROR: Could not find patched appVersionText.setText line (offline-banner.js must run first)."
  );
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

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched update check in ${TARGET}`);
console.log("Update check applied successfully.");
