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
  `import { createGeneratedOfflineDailySeed, getDailyRunSeed, getDailyRunSeedStatusText } from "#system/offline/daily-run-seed";\n${voucherImport}`,
);

// Match the pinned pagefaultgames/pokerogue source text directly. This avoids
// carrying over code or matching logic from PokeRogue-Offline's restricted
// fix-daily-seed.js patch.
const originalOfflineBranch = `      } else {
        // Grab first 10 chars of ISO date format (YYYY-MM-DD) and convert to base64
        let seed: string = btoa(new Date().toISOString().slice(0, 10));
        if (activeOverrides.DAILY_RUN_SEED_OVERRIDE != null) {
          seed =
            typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE === "string"
              ? activeOverrides.DAILY_RUN_SEED_OVERRIDE
              : JSON.stringify(activeOverrides.DAILY_RUN_SEED_OVERRIDE);
        }
        generateDaily(seed);
      }`;

if (!source.includes(originalOfflineBranch)) {
  fail("Could not find the pinned offline Daily Run branch in title-phase.ts");
}

const silverOfflineBranch = `      } else {
        // silver-daily-seed: prefer this fork's independently published live seed.
        if (activeOverrides.DAILY_RUN_SEED_OVERRIDE != null) {
          const seed =
            typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE === "string"
              ? activeOverrides.DAILY_RUN_SEED_OVERRIDE
              : JSON.stringify(activeOverrides.DAILY_RUN_SEED_OVERRIDE);
          globalScene.ui.setMode(UiMode.MESSAGE);
          globalScene.ui.showText("Using the custom Daily Run seed.", null, null, null, true);
          globalScene.time.delayedCall(1_200, () => {
            globalScene.ui.clearText();
            generateDaily(seed);
          });
          return;
        }

        globalScene.ui.setMode(UiMode.MESSAGE);
        globalScene.ui.showText("Fetching daily seed...", null, null, null, true);
        getDailyRunSeed()
          .catch(error => {
            console.warn("Daily Run seed feed unavailable; generating today's offline seed.", error);
            return createGeneratedOfflineDailySeed();
          })
          .then(result => {
            globalScene.ui.showText(getDailyRunSeedStatusText(result.source), null, null, null, true);
            const statusDuration = result.source === "published-fallback" || result.source === "generated-offline" ? 1_800 : 1_200;
            globalScene.time.delayedCall(statusDuration, () => {
              globalScene.ui.clearText();
              generateDaily(result.seed);
            });
          });
      }`;

source = source.replace(originalOfflineBranch, silverOfflineBranch);
fs.writeFileSync(titlePhasePath, source, "utf8");

console.log(`Written: ${helperTargetPath}`);
console.log(`Written: ${testTargetPath}`);
console.log(`Patched: ${titlePhasePath}`);
