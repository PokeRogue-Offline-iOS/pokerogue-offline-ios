#!/usr/bin/env node
/**
 * Patch: fix-daily-seed.js
 *
 * Makes the offline daily run use the same seed as the live website.
 *
 * Problem:
 *   When bypassLogin is true (offline mode), title-phase.ts generates a seed
 *   from the local date: btoa(new Date().toISOString().slice(0, 10))
 *   This differs from the server's curated seed, so the offline daily run is
 *   a completely different run to the one on pokerogue.net.
 *
 * Fix:
 *   Try to fetch the real seed from the public API endpoint first.
 *   If the fetch succeeds (device has internet), use it — the run will match
 *   the website exactly.
 *   If the fetch fails (truly offline), fall back to the existing date-based
 *   seed so the daily run still works.
 *
 * Uses a regex anchor so minor upstream changes don't break the match.
 *
 * Targets: pokerogue-src/src/phases/title-phase.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "src", "phases", "title-phase.ts");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("fix-daily-seed")) {
  console.log("Daily seed fix already present, skipping.");
  process.exit(0);
}

// Match the offline else-branch regardless of minor upstream whitespace/comment changes.
// Requires: btoa(new Date().toISOString()...) assignment and a generateDaily() call.
const PATTERN = /([ \t]*\} else \{\n(?:[ \t]*\/\/[^\n]*\n)*[ \t]*let seed[^\n]*btoa\(new Date[\s\S]*?generateDaily\(seed\);\n[ \t]*\})/;

const match = src.match(PATTERN);
if (!match) {
  console.error("ERROR: Could not find the offline daily seed block in title-phase.ts.");
  console.error("The file may have been updated upstream. Manual inspection required.");
  process.exit(1);
}

const ORIGINAL = match[1];
// Detect indentation from the matched block's first line
const indent = ORIGINAL.match(/^([ \t]*)/)[1];
const i  = indent;
const i2 = i + "  ";

const REPLACEMENT = `${i}} else {
${i2}// fix-daily-seed: try to fetch the real daily seed from the live API so
${i2}// the offline daily run matches the website. Falls back to the local
${i2}// date-based seed if the device has no internet connection.
${i2}const fallbackSeed: string = btoa(new Date().toISOString().slice(0, 10));
${i2}if (Overrides.DAILY_RUN_SEED_OVERRIDE != null) {
${i2}  const seed =
${i2}    typeof Overrides.DAILY_RUN_SEED_OVERRIDE === "string"
${i2}      ? Overrides.DAILY_RUN_SEED_OVERRIDE
${i2}      : JSON.stringify(Overrides.DAILY_RUN_SEED_OVERRIDE);
${i2}  generateDaily(seed);
${i2}} else {
${i2}  const todayUtc = new Date().toISOString().slice(0, 10);
${i2}  const cachedDate = localStorage.getItem("daily_seed_date");
${i2}  const cachedSeed = localStorage.getItem("daily_seed");
${i2}  if (cachedDate === todayUtc && cachedSeed) {
${i2}    console.log("Daily seed loaded from cache.");
${i2}    generateDaily(cachedSeed);
${i2}  } else {
${i2}    globalScene.ui.setMode(UiMode.MESSAGE);
${i2}    globalScene.ui.showText("Fetching daily seed...", null, null, null, true);
${i2}    fetch("https://pokerogue-offline.github.io/pokerogue-offline/daily-seed.txt")
${i2}      .then(r => {
${i2}        if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
${i2}        return r.text();
${i2}      })
${i2}      .then(fetchedSeed => {
${i2}        const seed = fetchedSeed.trim();
${i2}        localStorage.setItem("daily_seed_date", todayUtc);
${i2}        localStorage.setItem("daily_seed", seed);
${i2}        console.log("Daily seed fetched from GitHub Pages and cached.");
${i2}        globalScene.ui.clearText();
${i2}        generateDaily(seed);
${i2}      })
${i2}      .catch((err) => {
${i2}        alert("Daily seed fetch failed: " + err);
${i2}        console.warn("Could not fetch daily seed — prompting player.");
${i2}        globalScene.ui.showText("Could not reach the server. Play offline daily instead?", null, () => {
${i2}          globalScene.ui.setOverlayMode(
${i2}            UiMode.CONFIRM,
${i2}            () => {
${i2}              globalScene.ui.revertMode();
${i2}              globalScene.ui.clearText();
${i2}              generateDaily(fallbackSeed);
${i2}            },
${i2}            () => {
${i2}              globalScene.ui.revertMode();
${i2}              globalScene.ui.clearText();
${i2}              globalScene.phaseManager.toTitleScreen();
${i2}              super.end();
${i2}            },
${i2}            false,
${i2}            -98,
${i2}          );
${i2}        });
${i2}      });
${i2}  }
${i2}}
${i}}`;

fs.writeFileSync(TARGET, src.replace(ORIGINAL, REPLACEMENT), "utf8");
console.log(`Patched daily seed in ${TARGET}`);
console.log("Daily seed fix applied successfully.");
