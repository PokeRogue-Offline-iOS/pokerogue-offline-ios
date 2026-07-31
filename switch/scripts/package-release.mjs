import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ASSETS_COMMIT,
  LOCALES_COMMIT,
  MANIFEST_SCHEMA_VERSION,
  NODE_VERSION,
  NXJS_NRO_VERSION,
  NXJS_VERSION,
  PHASER_VERSION,
  PNPM_VERSION,
  SILVERSHADOW_VERSION,
  SWITCH_PLATFORM_VERSION,
  UPSTREAM_COMMIT,
  UPSTREAM_VERSION,
  buildLogPath,
  buildResultPath,
  cacheRoot,
  repositoryRoot,
  switchRoot,
} from "./config.mjs";
import {
  ASSET_PACK_FORMAT,
  ASSET_PACK_VERSION,
  buildAssetPacks,
  writeDeterministicAssetIndex,
} from "./asset-pack-lib.mjs";

const releaseRoot = path.join(switchRoot, "release");
const appRoot = path.join(releaseRoot, "switch", "SilverShadow-PokeRogue");
const gameRoot = path.join(appRoot, "game");
const licensesRoot = path.join(appRoot, "licenses");
const sourceNro = path.join(switchRoot, "silvershadow-pokerogue-switch.nro");
const outputNro = path.join(appRoot, "SilverShadow-PokeRogue.nro");
const assetIndexName = "asset-packs.json";
const licenseFiles = [
  "Phaser-MIT.txt",
  "PokeRogue-AGPL-3.0.txt",
  "THIRD-PARTY-NOTICES.txt",
  "nx.js-MIT.txt",
];

const buildResult = JSON.parse(await readFile(buildResultPath, "utf8"));
if (
  buildResult.packageKind !== "milestone2-real-game" ||
  buildResult.upstreamCommit !== UPSTREAM_COMMIT ||
  buildResult.compiledEntryPoint !== "switch-entry.js"
) {
  throw new Error("The cached game-build result is missing or incompatible with Milestone 2.");
}

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(gameRoot, { recursive: true });
await mkdir(licensesRoot, { recursive: true });
await mkdir(path.join(releaseRoot, "symbols"), { recursive: true });
await copyFile(sourceNro, outputNro);
for (const licenseFile of licenseFiles) {
  await copyFile(path.join(switchRoot, "licenses", licenseFile), path.join(licensesRoot, licenseFile));
}
await copyFile(
  path.join(buildResult.compiledGameRoot, buildResult.compiledEntryPoint),
  path.join(gameRoot, buildResult.compiledEntryPoint),
);
await writeFile(path.join(gameRoot, "index.html"), switchIndexHtml());

const sourceMap = path.join(buildResult.compiledGameRoot, "switch-entry.js.map");
try {
  await copyFile(sourceMap, path.join(releaseRoot, "symbols", "SilverShadow-PokeRogue-switch-entry.js.map"));
} catch {
  // Source maps are useful but not required for a production-mode upstream build.
}

const repositoryCommit = execFileSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const repositoryDirty = Boolean(
  execFileSync("git", ["-C", repositoryRoot, "status", "--porcelain"], { encoding: "utf8" }).trim(),
);
const patchSetHash = await hashPaths(["new-files", "patches/all"]);
const switchPatchSetHash = await hashPaths(["patches/switch"]);
const buildScriptHash = await hashPaths([
  "scripts/apply-patches.sh",
  "scripts/apply-post-build-patches.sh",
  "scripts/patch-lib.sh",
  "switch/scripts",
  "switch/src",
  "switch/package.json",
  "switch/package-lock.json",
]);

const version = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  packageKind: "milestone2-real-game",
  switchPlatformVersion: SWITCH_PLATFORM_VERSION,
  silverShadowGameVersion: `${SILVERSHADOW_VERSION}-switch-m2`,
  upstreamPokeRogueCommit: UPSTREAM_COMMIT,
  upstreamPokeRogueVersion: UPSTREAM_VERSION,
};
await writeJson(path.join(gameRoot, "version.json"), version);

const packResult = await buildAssetPacks({
  sourceRoot: buildResult.compiledGameRoot,
  outputRoot: gameRoot,
  cacheRoot,
  log: message => {
    console.log(message);
  },
});
const assetIndexPath = path.join(gameRoot, assetIndexName);
await writeDeterministicAssetIndex(assetIndexPath, packResult.index);

const requiredDirectories = [];
const importantPaths = [
  "index.html",
  "version.json",
  buildResult.compiledEntryPoint,
  assetIndexName,
];
const requiredFiles = [];
for (const relativePath of importantPaths) {
  const absolutePath = safeGamePath(relativePath);
  const info = await stat(absolutePath);
  requiredFiles.push({
    path: relativePath,
    size: info.size,
    sha256: await sha256File(absolutePath),
    purpose:
      relativePath === buildResult.compiledEntryPoint
        ? "nx.js controlled real-game entry"
        : relativePath === assetIndexName
          ? "deterministic random-access asset-pack index"
          : "package bootstrap metadata",
  });
}

const manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  packageKind: "milestone2-real-game",
  switchPlatformVersion: SWITCH_PLATFORM_VERSION,
  silverShadowGameVersion: `${SILVERSHADOW_VERSION}-switch-m2`,
  silverShadowRepositoryCommit: repositoryCommit,
  repositoryDirtyAtBuild: repositoryDirty,
  upstreamPokeRogueCommit: UPSTREAM_COMMIT,
  upstreamPokeRogueVersion: UPSTREAM_VERSION,
  assetsCommit: ASSETS_COMMIT,
  localesCommit: LOCALES_COMMIT,
  nxjsRuntimeVersion: NXJS_VERSION,
  nxjsNroVersion: NXJS_NRO_VERSION,
  phaserVersion: PHASER_VERSION,
  expectedNodeVersion: NODE_VERSION,
  nodeVersion: buildResult.actualNodeVersion,
  pnpmVersion: PNPM_VERSION,
  buildDate: new Date().toISOString(),
  patchSetHash,
  switchPatchSetHash,
  buildScriptHash,
  compiledInputHash: buildResult.inputHash,
  compiledEntryPoint: buildResult.compiledEntryPoint,
  originalEntryPoint: buildResult.originalEntryPoint,
  originalEntryPointDeployed: false,
  evaluationMode: "async-function",
  requiredDirectories,
  requiredFiles,
  assetPacks: {
    format: ASSET_PACK_FORMAT,
    version: ASSET_PACK_VERSION,
    indexPath: assetIndexName,
    packCount: packResult.index.packCount,
    entryCount: packResult.index.entryCount,
  },
  packageLayout: "switch/SilverShadow-PokeRogue",
  intendedMemoryMode: "application/title-override",
  offlineRequired: true,
  thirdPartyNotices: licenseFiles.map(file => `licenses/${file}`),
  compatibilityShims: [
    "minimal-dom",
    "dom-tag-lookup",
    "dom-classlist-toggle",
    "dom-css-properties",
    "dom-dataset",
    "zero-bound-text-metrics-fallback",
    "sdmc-local-fetch",
    "indexed-random-access-asset-packs",
    "per-asset-sha256-verification",
    "fetch-backed-xmlhttprequest",
    "nxjs-audio-codec-detection",
    "phaser-audio-listener",
    "phaser-audio-node-factory-probe",
    "remote-network-block",
    "persistent-local-storage-v1",
    "memory-session-storage",
    "location",
    "external-fonts",
    "local-font-url-to-buffer",
    "phaser-webgl1-to-nxjs-webgl2",
    "default-framebuffer-scale",
    "nintendo-gamepad-identity",
    "plus-menu-intercept",
    "nxjs-video-capability",
    "nxjs-screen-canvas",
  ],
  manifest: {},
};
await writeJson(path.join(gameRoot, "manifest.json"), manifest);

const checksumTargets = [
  "SilverShadow-PokeRogue.nro",
  ...licenseFiles.map(file => `licenses/${file}`),
  "game/manifest.json",
  "game/version.json",
  "game/index.html",
  `game/${buildResult.compiledEntryPoint}`,
  `game/${assetIndexName}`,
  ...packResult.index.packs.map(pack => `game/${pack.path}`),
];
const checksumLines = [];
for (const relativePath of checksumTargets) {
  checksumLines.push(`${await sha256File(path.join(appRoot, relativePath))}  ${relativePath.replaceAll("\\", "/")}`);
}
await writeFile(path.join(appRoot, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`);
await copyFile(buildLogPath, path.join(releaseRoot, "milestone2-build.log"));

const deploymentFiles = await listFiles(appRoot);
const deploymentBytes = (
  await Promise.all(deploymentFiles.map(async file => (await stat(path.join(appRoot, file))).size))
).reduce((sum, size) => sum + size, 0);
console.log(`Created ${outputNro}`);
console.log(
  `Created uncompressed SD-card directory with ${deploymentFiles.length} files (${deploymentBytes} bytes): ${appRoot}`,
);

function safeGamePath(relativePath) {
  const resolved = path.resolve(gameRoot, relativePath);
  if (!resolved.startsWith(`${path.resolve(gameRoot)}${path.sep}`)) {
    throw new Error(`Unsafe game path: ${relativePath}`);
  }
  return resolved;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function hashPaths(relativePaths) {
  const hash = createHash("sha256");
  for (const relativePath of relativePaths) {
    await hashPath(hash, path.join(repositoryRoot, relativePath), relativePath);
  }
  return hash.digest("hex");
}

async function hashPath(hash, absolutePath, relativePath) {
  const info = await stat(absolutePath);
  if (info.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      await hashPath(hash, path.join(absolutePath, entry.name), `${relativePath}/${entry.name}`);
    }
    return;
  }
  hash.update(`${relativePath.replaceAll("\\", "/")}\0`);
  hash.update(await readFile(absolutePath));
  hash.update("\0");
}

async function sha256File(file) {
  const handle = await open(file, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function listFiles(directory, prefix = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function switchIndexHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SilverShadow PokeRogue for Nintendo Switch</title>
</head>
<body>
  <div id="app"></div>
</body>
</html>
`;
}
