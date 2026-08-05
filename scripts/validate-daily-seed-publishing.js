#!/usr/bin/env node

/** Verify that the publisher and packaged client agree on the Daily Run feed. */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label} is missing ${JSON.stringify(expected)}`);
  }
}

const workflow = read(".github/workflows/publish-daily-seed.yml");
requireText(workflow, "https://api.pokerogue.net/daily/seed", "publisher API source");
requireText(workflow, "PKR-Client-Version: $client_version", "publisher client-version header");
requireText(workflow, "scripts/fetch-official-daily-seed.js", "first-party browser fallback");
requireText(workflow, "xvfb-run -a", "non-headless official browser session");
requireText(workflow, 'source="offline-fallback"', "publisher offline fallback");
requireText(workflow, 'publish_dir="$publish_parent/seed"', "publisher worktree path");
requireText(workflow, "push origin HEAD:seed", "publisher seed branch push");
if (workflow.includes('git -C "$publish_dir" rm -rf .')) {
  throw new Error("first seed-branch publication must not git-rm an already empty orphan worktree");
}
if (/ssh\.scooom\.xyz|pokerogue-offline\.github\.io/i.test(workflow)) {
  throw new Error("publisher must not depend on Scooom or another offline seed mirror");
}

const browserFetch = read("scripts/fetch-official-daily-seed.js");
requireText(browserFetch, 'cmd: "Network.setExtraHTTPHeaders"', "official browser headers");
requireText(browserFetch, 'POKEROGUE_CHROME_HEADFUL !== "1"', "headful workflow mode");
requireText(browserFetch, 'url: "https://api.pokerogue.net/daily/seed"', "official browser navigation");
requireText(browserFetch, 'document.body?.innerText', "official browser seed extraction");
if (/ssh\.scooom\.xyz|pokerogue-offline\.github\.io/i.test(browserFetch)) {
  throw new Error("browser fetch must not depend on Scooom or another offline seed mirror");
}

const client = read("new-files/src/system/offline/daily-run-seed.ts");
requireText(
  client,
  "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seed.json",
  "client seed feed",
);
requireText(client, 'published.source !== "offline-fallback"', "fallback cache protection");
requireText(client, 'fetchOfficialDailyRunSeed(date)', "direct in-game official API attempt");
requireText(client, 'source: "generated-offline"', "local generated fallback source");
requireText(client, '"published-fallback"', "published fallback source");
requireText(client, "Official Daily Run seed loaded directly.", "official seed status message");

const patch = read("patches/all/node/daily-run-seed.js");
requireText(patch, "getDailyRunSeed()", "title-screen Daily Run integration");
requireText(patch, "return createGeneratedOfflineDailySeed()", "title-screen network fallback");
requireText(patch, "getDailyRunSeedStatusText(result.source)", "title-screen seed status message");

console.log("Daily Run publisher, seed-branch feed, and packaged client are linked consistently.");
