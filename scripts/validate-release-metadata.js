#!/usr/bin/env node

/** Verify that all packaged platforms consume the shared version and icons. */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label} is missing ${JSON.stringify(expected)}`);
  }
}

const version = read("configs/release-version.txt").trim();
if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid shared release version ${JSON.stringify(version)}`);
}

const workflowPaths = [
  ".github/workflows/build-android.yml",
  ".github/workflows/build-ios.yml",
  ".github/workflows/build-exe.yml",
  ".github/workflows/build-macos.yml",
  ".github/workflows/build-appimage.yml",
  ".github/workflows/build-switch-poc.yml",
];

for (const workflowPath of workflowPaths) {
  const workflow = read(workflowPath);
  requireText(workflow, "scripts/read-release-version.js", workflowPath);
  requireText(workflow, "configs/android/icon-main.png", workflowPath);
  if (workflowPath !== ".github/workflows/build-switch-poc.yml") {
    requireText(workflow, "configs/android/icon-dev.png", workflowPath);
  }
  if (workflow.includes("docs/appIcon.png") || workflow.includes("docs/appIcon-dev.png")) {
    throw new Error(`${workflowPath} still packages a duplicate docs icon`);
  }
}

const android = read(".github/workflows/build-android.yml");
requireText(android, 'VERSION_NAME="$VERSION"', "Android native version");
requireText(android, "MAJOR * 100000000", "Android version code");

const ios = read(".github/workflows/build-ios.yml");
requireText(ios, 'CFBundleShortVersionString $SILVERSHADOW_VERSION', "iOS marketing version");
requireText(ios, 'CFBundleVersion $BUILD_NUM', "iOS build version");

for (const workflowPath of [
  ".github/workflows/build-exe.yml",
  ".github/workflows/build-macos.yml",
  ".github/workflows/build-appimage.yml",
]) {
  const workflow = read(workflowPath);
  requireText(workflow, "pkg.version = process.env.SILVERSHADOW_VERSION", `${workflowPath} package version`);
  requireText(workflow, "--config.buildVersion=", `${workflowPath} native build version`);
}

const switchWorkflow = read(".github/workflows/build-switch-poc.yml");
requireText(switchWorkflow, 'npm pkg set "version=$SILVERSHADOW_VERSION"', "Switch native package version");

const switchConfig = read("switch/scripts/config.mjs");
requireText(switchConfig, 'new URL("../../configs/release-version.txt", import.meta.url)', "local Switch release version");

const switchBootstrap = read("patches/switch/node/nxjs-bootstrap.js");
requireText(switchBootstrap, 'path.join("configs", "release-version.txt")', "Switch patched title version");

const updatePatch = read("patches/all/node/update-check.js");
requireText(updatePatch, 'checkForUpdates(SILVERSHADOW_VERSION)', "update checker installed version");

const releaseWorkflow = read(".github/workflows/create-release.yaml");
requireText(releaseWorkflow, "node scripts/read-release-version.js", "release version verification");
requireText(releaseWorkflow, "cp configs/android/icon-main.png seed-branch/docs/appIcon.png", "AltStore icon source");

console.log(`Release metadata is centralized at SilverShadow v${version} for all packaged platforms.`);
