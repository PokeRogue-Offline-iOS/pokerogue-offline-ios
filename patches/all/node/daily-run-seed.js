#!/usr/bin/env node

/**
 * Adds live Daily Run seed support to offline builds without depending on
 * another PokéRogue Offline repository or service.
 *
 * A small shared module owns fetching, validation, and UTC-day caching. The
 * offline branch in title-phase.ts uses that module and falls back to the
 * upstream date-derived seed whenever the independently published feed is
 * unavailable.
 */

const fs = require("fs");
const path = require("path");

const titlePhasePath = path.join("pokerogue-src", "src", "phases", "title-phase.ts");
const helperTargetPath = path.join("pokerogue-src", "src", "system", "offline", "daily-run-seed.ts");
const testTargetPath = path.join("pokerogue-src", "test", "tests", "system", "offline", "daily-run-seed.test.ts");
const helperSourcePath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "new-files",
  "src",
  "system",
  "offline",
  "daily-run-seed.ts",
);
const testSourcePath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "new-files",
  "test",
  "tests",
  "system",
  "offline",
  "daily-run-seed.test.ts",
);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(titlePhasePath)) {
  fail(`Could not find ${titlePhasePath}`);
}

if (!fs.existsSync(helperSourcePath)) {
  fail(`Could not find ${helperSourcePath}`);
}

if (!fs.existsSync(testSourcePath)) {
  fail(`Could not find ${testSourcePath}`);
}

fs.mkdirSync(path.dirname(helperTargetPath), { recursive: true });
fs.copyFileSync(helperSourcePath, helperTargetPath);
fs.mkdirSync(path.dirname(testTargetPath), { recursive: true });
fs.copyFileSync(testSourcePath, testTargetPath);

let source = fs.readFileSync(titlePhasePath, "utf8").replace(/\r\n/g, "\n");

if (source.includes("silver-daily-seed")) {
  console.log("Daily Run seed support already present, skipping title-phase.ts.");
  process.exit(0);
}

const voucherImport = 'import { vouchers } from "#system/voucher";';
if (!source.includes(voucherImport)) {
  fail("Could not find the voucher import in title-phase.ts");
}

source = source.replace(
  voucherImport,
  `import { createOfflineDailySeed, getDailyRunSeed } from "#system/offline/daily-run-seed";\n${voucherImport}`,
);

const offlineSeedPattern = /([ \t]*\} else \{\n(?:[ \t]*\/\/[^\n]*\n)*[ \t]*let seed[^\n]*btoa\(new Date[\s\S]*?generateDaily\(seed\);\n[ \t]*\})/;
const match = source.match(offlineSeedPattern);

if (!match) {
  fail("Could not find the offline Daily Run seed block in title-phase.ts");
}

const indent = match[1].match(/^([ \t]*)/)[1];
const bodyIndent = `${indent}  `;
const continuationIndent = `${bodyIndent}  `;

const replacement = `${indent}} else {
${bodyIndent}// silver-daily-seed: prefer this fork's independently published live seed.
${bodyIndent}if (activeOverrides.DAILY_RUN_SEED_OVERRIDE != null) {
${continuationIndent}const seed =
${continuationIndent}  typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE === "string"
${continuationIndent}    ? activeOverrides.DAILY_RUN_SEED_OVERRIDE
${continuationIndent}    : JSON.stringify(activeOverrides.DAILY_RUN_SEED_OVERRIDE);
${continuationIndent}generateDaily(seed);
${continuationIndent}return;
${bodyIndent}}

${bodyIndent}globalScene.ui.setMode(UiMode.MESSAGE);
${bodyIndent}globalScene.ui.showText("Fetching daily seed...", null, null, null, true);
${bodyIndent}getDailyRunSeed()
${continuationIndent}.catch(error => {
${continuationIndent}  console.warn("Live Daily Run seed unavailable; using the offline seed.", error);
${continuationIndent}  return createOfflineDailySeed();
${continuationIndent}})
${continuationIndent}.then(seed => {
${continuationIndent}  globalScene.ui.clearText();
${continuationIndent}  generateDaily(seed);
${continuationIndent}});
${indent}}`;

source = source.replace(match[1], replacement);
fs.writeFileSync(titlePhasePath, source, "utf8");

console.log(`Written: ${helperTargetPath}`);
console.log(`Written: ${testTargetPath}`);
console.log(`Patched: ${titlePhasePath}`);
