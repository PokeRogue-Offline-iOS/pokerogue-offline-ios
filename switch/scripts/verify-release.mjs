import { createHash } from "node:crypto";
import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_SCHEMA_VERSION,
  NXJS_NRO_VERSION,
  NXJS_VERSION,
  PHASER_VERSION,
  UPSTREAM_COMMIT,
  buildResultPath,
  switchRoot,
} from "./config.mjs";
import {
  ASSET_PACK_FORMAT,
  ASSET_PACK_VERSION,
  readPackedEntry,
  validateAssetIndex,
  verifyPackFile,
} from "./asset-pack-lib.mjs";

const releaseRoot = path.join(switchRoot, "release");
const appRoot = path.join(releaseRoot, "switch", "SilverShadow-PokeRogue");
const gameRoot = path.join(appRoot, "game");
const nroPath = path.join(appRoot, "SilverShadow-PokeRogue.nro");
const manifestPath = path.join(gameRoot, "manifest.json");
const buildResult = JSON.parse(await readFile(buildResultPath, "utf8"));
const representativeAssets = [
  "battle-anims/absorb.json",
  "images/battle_anims/015-Fire01.png",
  "images/pokemon/1.png",
  "images/pokemon/back/1.png",
  "images/pokemon/shiny/1.png",
  "images/pokemon/back/shiny/1.png",
  "images/pokemon/female/19.png",
  "audio/bgm/abyss.mp3",
  "audio/se/achv.wav",
  "audio/cry/1.m4a",
  "fonts/pokemon-emerald-pro.ttf",
  "fonts/item-count.xml",
  "locales/en/battle-message-ui-handler.json",
];
const licenseFiles = [
  "licenses/Phaser-MIT.txt",
  "licenses/PokeRogue-AGPL-3.0.txt",
  "licenses/THIRD-PARTY-NOTICES.txt",
  "licenses/nx.js-MIT.txt",
];

const nro = await readFile(nroPath);
if (nro.subarray(0x10, 0x14).toString("ascii") !== "NRO0") {
  throw new Error("Packaged application does not contain an NRO0 header.");
}
if (nro.byteLength < 40 * 1024 * 1024) {
  throw new Error(`NRO is only ${nro.byteLength} bytes; --fat packaging was not preserved.`);
}

const allReleaseFiles = await listFiles(path.join(releaseRoot, "switch"));
const nroFiles = allReleaseFiles.filter(file => path.extname(file).toLowerCase() === ".nro");
if (nroFiles.length !== 1 || nroFiles[0].replaceAll("\\", "/") !== "SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro") {
  throw new Error(`Expected exactly one correctly placed NRO, found: ${nroFiles.join(", ")}`);
}
const everyReleaseFile = await listFiles(releaseRoot);
if (everyReleaseFile.some(file => path.extname(file).toLowerCase() === ".zip")) {
  throw new Error("Release contains a ZIP; Switch hardware updates must remain uncompressed.");
}
for (const protectedDirectory of ["saves", "config", "logs"]) {
  if (await exists(path.join(appRoot, protectedDirectory))) {
    throw new Error(`Release must not contain or overwrite the user's ${protectedDirectory}/ directory.`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION || manifest.packageKind !== "milestone2-real-game") {
  throw new Error("Manifest is not the Milestone 2 real-game schema.");
}
if (manifest.nxjsRuntimeVersion !== NXJS_VERSION || manifest.nxjsNroVersion !== NXJS_NRO_VERSION) {
  throw new Error("Manifest nx.js versions are not the tested exact beta pins.");
}
if (manifest.phaserVersion !== PHASER_VERSION || manifest.upstreamPokeRogueCommit !== UPSTREAM_COMMIT) {
  throw new Error("Manifest Phaser or upstream PokeRogue version does not match the selected build.");
}
if (manifest.offlineRequired !== true || manifest.evaluationMode !== "async-function") {
  throw new Error("Manifest does not enforce the expected offline loader policy.");
}
assertSamePaths(
  [...(manifest.thirdPartyNotices ?? [])].sort(comparePaths),
  [...licenseFiles].sort(comparePaths),
  "third-party notice",
);
if (manifest.compiledEntryPoint === "assets/milestone1-test.png" || manifest.packageKind.includes("poc")) {
  throw new Error("Release still identifies itself as the Milestone 1 proof of concept.");
}
if (
  manifest.assetPacks?.format !== ASSET_PACK_FORMAT ||
  manifest.assetPacks?.version !== ASSET_PACK_VERSION ||
  manifest.assetPacks?.indexPath !== "asset-packs.json"
) {
  throw new Error("Manifest asset-pack metadata is missing or incompatible.");
}
if (manifest.originalEntryPointDeployed !== false) {
  throw new Error("Manifest must record that redundant original Vite chunks are not deployed.");
}

for (const directory of manifest.requiredDirectories) {
  const files = await listFiles(path.join(gameRoot, directory));
  if (files.length === 0) {
    throw new Error(`Critical real-game directory is missing or empty: ${directory}`);
  }
}
for (const file of manifest.requiredFiles) {
  const absolute = safeGamePath(file.path);
  const info = await stat(absolute);
  if (info.size !== file.size) {
    throw new Error(`Size mismatch for ${file.path}`);
  }
  if ((await sha256File(absolute)) !== file.sha256) {
    throw new Error(`Hash mismatch for ${file.path}`);
  }
}

const entryPath = safeGamePath(manifest.compiledEntryPoint);
const entry = await readFile(entryPath, "utf8");
if (
  entry.length < 1_000_000 ||
  !entry.includes("__SILVERSHADOW_WEB_BOOTSTRAP_STARTED__") ||
  !entry.includes("Phaser")
) {
  throw new Error("Compiled entry does not contain expected real PokeRogue/Phaser indicators.");
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
new AsyncFunction("globalThis", `"use strict";\n${entry}`);
if (entry.includes("import.meta")) {
  throw new Error("Compiled entry still contains import.meta and cannot be evaluated by the controlled loader.");
}

const compiledJavaScript = (await listFiles(gameRoot)).filter(file => /\.(?:m?js)$/i.test(file));
if (
  compiledJavaScript.length !== 1 ||
  compiledJavaScript[0].replaceAll("\\", "/") !== manifest.compiledEntryPoint
) {
  throw new Error(`Expected only the consolidated loose Switch entry, found: ${compiledJavaScript.join(", ")}`);
}

const assetIndexPath = safeGamePath(manifest.assetPacks.indexPath);
const assetIndex = JSON.parse(await readFile(assetIndexPath, "utf8"));
validateAssetIndex(assetIndex);
if (
  assetIndex.packCount !== manifest.assetPacks.packCount ||
  assetIndex.entryCount !== manifest.assetPacks.entryCount
) {
  throw new Error("Manifest and asset-pack index counts do not match.");
}
for (const pack of assetIndex.packs) {
  await verifyPackFile(gameRoot, pack);
}

const expectedAssets = await expectedPackedAssets(buildResult.compiledGameRoot);
const indexedAssets = Object.keys(assetIndex.entries).sort(comparePaths);
if (expectedAssets.length !== indexedAssets.length) {
  throw new Error(
    `Packed asset coverage mismatch: expected ${expectedAssets.length}, indexed ${indexedAssets.length}.`,
  );
}
for (let index = 0; index < expectedAssets.length; index += 1) {
  if (expectedAssets[index] !== indexedAssets[index]) {
    throw new Error(`Packed asset coverage differs at ${expectedAssets[index]} / ${indexedAssets[index]}.`);
  }
}

await verifyRepresentativeAssets(assetIndex);

const checksums = await readFile(path.join(appRoot, "SHA256SUMS.txt"), "utf8");
const checksumPaths = [];
for (const line of checksums.trim().split(/\r?\n/)) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) {
    throw new Error(`Invalid SHA256SUMS line: ${line}`);
  }
  const target = path.resolve(appRoot, match[2]);
  if (!target.startsWith(`${path.resolve(appRoot)}${path.sep}`)) {
    throw new Error(`Unsafe SHA256SUMS path: ${match[2]}`);
  }
  if ((await sha256File(target)) !== match[1]) {
    throw new Error(`SHA256SUMS mismatch for ${match[2]}`);
  }
  checksumPaths.push(match[2]);
}

const deploymentFiles = (await listFiles(appRoot)).map(file => file.replaceAll("\\", "/")).sort(comparePaths);
const expectedDeploymentFiles = [
  "SHA256SUMS.txt",
  "SilverShadow-PokeRogue.nro",
  ...licenseFiles,
  "game/asset-packs.json",
  "game/index.html",
  "game/manifest.json",
  ...assetIndex.packs.map(pack => `game/${pack.path}`),
  `game/${manifest.compiledEntryPoint}`,
  "game/version.json",
].sort(comparePaths);
assertSamePaths(deploymentFiles, expectedDeploymentFiles, "deployment file");
assertSamePaths(
  checksumPaths.sort(comparePaths),
  expectedDeploymentFiles.filter(file => file !== "SHA256SUMS.txt").sort(comparePaths),
  "checksum",
);

const deploymentBytes = (
  await Promise.all(deploymentFiles.map(async file => (await stat(path.join(appRoot, file))).size))
).reduce((sum, size) => sum + size, 0);
console.log(
  JSON.stringify(
    {
      verified: true,
      packageKind: manifest.packageKind,
      upstreamCommit: manifest.upstreamPokeRogueCommit,
      upstreamVersion: manifest.upstreamPokeRogueVersion,
      nxjs: manifest.nxjsRuntimeVersion,
      phaser: manifest.phaserVersion,
      entryPoint: manifest.compiledEntryPoint,
      nroBytes: nro.byteLength,
      deploymentFiles: deploymentFiles.length,
      deploymentBytes,
      assetPacks: assetIndex.packs.map(pack => ({
        id: pack.id,
        path: pack.path,
        bytes: pack.size,
        entries: pack.entryCount,
      })),
      packedAssets: assetIndex.entryCount,
      representativeAssetsVerified: representativeAssets.length,
      zipPresent: false,
      protectedDirectoriesPresent: false,
    },
    null,
    2,
  ),
);

async function verifyRepresentativeAssets(index) {
  for (const assetPath of representativeAssets) {
    const data = await readPackedEntry(gameRoot, index, assetPath);
    if (!data || data.byteLength === 0) {
      throw new Error(`Representative packed asset is missing or empty: ${assetPath}`);
    }
    if (assetPath.endsWith(".json")) {
      JSON.parse(data.toString("utf8"));
    } else if (assetPath.endsWith(".png")) {
      if (!data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        throw new Error(`Representative PNG has an invalid signature: ${assetPath}`);
      }
    } else if (assetPath.endsWith(".wav") && data.subarray(0, 4).toString("ascii") !== "RIFF") {
      throw new Error(`Representative WAV has an invalid signature: ${assetPath}`);
    } else if (assetPath.endsWith(".m4a") && data.subarray(4, 8).toString("ascii") !== "ftyp") {
      throw new Error(`Representative M4A has an invalid signature: ${assetPath}`);
    } else if (assetPath.endsWith(".xml") && !data.toString("utf8").includes("<font")) {
      throw new Error(`Representative bitmap-font XML is invalid: ${assetPath}`);
    }
  }
}

async function expectedPackedAssets(sourceRoot) {
  const values = [];
  for (const directory of ["audio", "images", "battle-anims", "fonts", "locales"]) {
    values.push(
      ...(await listFiles(path.join(sourceRoot, directory), directory)).map(file => file.replaceAll("\\", "/")),
    );
  }
  for (const file of [
    "biome-bgm-loop-points.json",
    "exp-sprites.json",
    "logo128.png",
    "logo512.png",
    "manifest.webmanifest",
    "starter-colors.json",
  ]) {
    if (!(await exists(path.join(sourceRoot, file)))) {
      throw new Error(`Expected stable asset is missing from compiled output: ${file}`);
    }
    values.push(file);
  }
  return values.sort(comparePaths);
}

function safeGamePath(relativePath) {
  const resolved = path.resolve(gameRoot, relativePath);
  if (!resolved.startsWith(`${path.resolve(gameRoot)}${path.sep}`)) {
    throw new Error(`Unsafe manifest path: ${relativePath}`);
  }
  return resolved;
}

async function listFiles(directory, prefix = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => comparePaths(a.name, b.name));
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
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

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function assertSamePaths(actual, expected, label) {
  if (actual.length !== expected.length) {
    throw new Error(`Unexpected ${label} count: expected ${expected.length}, received ${actual.length}.`);
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`Unexpected ${label} at ${index}: expected ${expected[index]}, received ${actual[index]}.`);
    }
  }
}

function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
