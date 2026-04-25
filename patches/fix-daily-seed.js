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

// The offline branch that generates the date-based seed
const ORIGINAL = `      } else {
        // Grab first 10 chars of ISO date format (YYYY-MM-DD) and convert to base64
        let seed: string = btoa(new Date().toISOString().slice(0, 10));
        if (Overrides.DAILY_RUN_SEED_OVERRIDE != null) {
          seed =
            typeof Overrides.DAILY_RUN_SEED_OVERRIDE === "string"
              ? Overrides.DAILY_RUN_SEED_OVERRIDE
              : JSON.stringify(Overrides.DAILY_RUN_SEED_OVERRIDE);
        }
        generateDaily(seed);
      }`;

const REPLACEMENT = `      } else {
        // fix-daily-seed: try to fetch the real daily seed from the live API so
        // the offline daily run matches the website. Falls back to the local
        // date-based seed if the device has no internet connection.
        const fallbackSeed: string = btoa(new Date().toISOString().slice(0, 10));
        let seed: string = fallbackSeed;
        if (Overrides.DAILY_RUN_SEED_OVERRIDE != null) {
          seed =
            typeof Overrides.DAILY_RUN_SEED_OVERRIDE === "string"
              ? Overrides.DAILY_RUN_SEED_OVERRIDE
              : JSON.stringify(Overrides.DAILY_RUN_SEED_OVERRIDE);
          generateDaily(seed);
        } else {
          fetch("https://api.pokerogue.net/daily/seed")
            .then(r => {
              if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
              return r.text();
            })
            .then(fetchedSeed => {
              console.log("Daily seed fetched from live API.");
              generateDaily(fetchedSeed);
            })
            .catch(() => {
              console.warn("Could not fetch daily seed from API — using date-based fallback.");
              generateDaily(fallbackSeed);
            });
        }
      }`;

if (!src.includes(ORIGINAL)) {
  console.error("ERROR: Could not find the offline daily seed block in title-phase.ts.");
  console.error("The file may have been updated upstream. Manual inspection required.");
  process.exit(1);
}

fs.writeFileSync(TARGET, src.replace(ORIGINAL, REPLACEMENT), "utf8");
console.log(`Patched daily seed in ${TARGET}`);
console.log("Daily seed fix applied successfully.");
