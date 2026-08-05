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

const client = read("new-files/src/system/daily-run/daily-run-archive.ts");
requireText(
  client,
  "https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seeds.json",
  "client archive feed",
);
requireText(client, "writeCachedDailyArchive", "validated archive cache replacement");
requireText(client, "EMBEDDED_DAILY_ARCHIVE_URL", "embedded archive fallback");
requireText(client, "isSwitchRuntime()", "Switch network exclusion");

const patch = read("patches/all/node/daily-run-seed.js");
requireText(patch, "showDailyRunTypeMenu", "title-screen Daily Run type menu");
requireText(patch, "startDailyRunWithSeed", "shared Daily Run launch path");
requireText(patch, '"assets", "daily-seeds.json"', "embedded archive packaging");

console.log("Daily Run publisher, official archive, and packaged four-mode client are linked consistently.");
