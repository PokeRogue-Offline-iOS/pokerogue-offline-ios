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
requireText(browserFetch, 'url: "https://pokerogue.net/robots.txt"', "official browser origin");
requireText(browserFetch, 'fetch("https://api.pokerogue.net/daily/seed"', "official browser API request");
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

const patch = read("patches/all/node/daily-run-seed.js");
requireText(patch, "getDailyRunSeed()", "title-screen Daily Run integration");
requireText(patch, "return createOfflineDailySeed()", "title-screen network fallback");

console.log("Daily Run publisher, seed-branch feed, and packaged client are linked consistently.");
