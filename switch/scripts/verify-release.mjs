import { createHash } from "node:crypto";
import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_SCHEMA_VERSION,
  NXJS_NRO_VERSION,
  NXJS_VERSION,
  PHASER_VERSION,
  UPSTREAM_COMMIT,
  switchRoot,
} from "./config.mjs";

const releaseRoot = path.join(switchRoot, "release");
const appRoot = path.join(releaseRoot, "switch", "SilverShadow-PokeRogue");
const gameRoot = path.join(appRoot, "game");
const nroPath = path.join(appRoot, "SilverShadow-PokeRogue.nro");
const zipPath = path.join(releaseRoot, "SilverShadow-PokeRogue-Switch-Milestone2.zip");
const manifestPath = path.join(gameRoot, "manifest.json");

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

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION || manifest.packageKind !== "milestone2-real-game") {
  throw new Error("Manifest is not the Milestone 2 real-game schema.");
}
if (manifest.nxjsRuntimeVersion !== NXJS_VERSION || manifest.nxjsNroVersion !== NXJS_NRO_VERSION) {
  throw new Error("Manifest nx.js versions are not the tested exact beta pins.");
}
if (manifest.phaserVersion !== PHASER_VERSION || manifest.upstreamPokeRogueCommit !== UPSTREAM_COMMIT) {
  throw new Error("Manifest Phaser or upstream PokéRogue version does not match the selected build.");
}
if (manifest.offlineRequired !== true || manifest.evaluationMode !== "async-function") {
  throw new Error("Manifest does not enforce the expected offline loader policy.");
}
if (manifest.compiledEntryPoint === "assets/milestone1-test.png" || manifest.packageKind.includes("poc")) {
  throw new Error("Release still identifies itself as the Milestone 1 proof of concept.");
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
  throw new Error("Compiled entry does not contain expected real PokéRogue/Phaser indicators.");
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
new AsyncFunction("globalThis", `"use strict";\n${entry}`);
if (entry.includes("import.meta")) {
  throw new Error("Compiled entry still contains import.meta and cannot be evaluated by the controlled loader.");
}
if (await exists(path.join(gameRoot, "assets", "milestone1-test.png"))) {
  throw new Error("Milestone 1 proof-of-concept asset is present in the Milestone 2 release.");
}

const compiledJavaScript = (await listFiles(gameRoot)).filter(file => /\.(?:m?js)$/i.test(file));
if (compiledJavaScript.length < 2) {
  throw new Error(`Expected real compiled JavaScript plus the Switch entry, found ${compiledJavaScript.length} file(s).`);
}

const checksums = await readFile(path.join(appRoot, "SHA256SUMS.txt"), "utf8");
for (const line of checksums.trim().split(/\r?\n/)) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) {
    throw new Error(`Invalid SHA256SUMS line: ${line}`);
  }
  if ((await sha256File(path.join(appRoot, match[2]))) !== match[1]) {
    throw new Error(`SHA256SUMS mismatch for ${match[2]}`);
  }
}

const zipInfo = await stat(zipPath);
if (zipInfo.size < 50 * 1024 * 1024) {
  throw new Error(`Release ZIP is unexpectedly small for the real game: ${zipInfo.size} bytes.`);
}
const zipEntries = await readZipCentralDirectory(zipPath);
for (const required of [
  "switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro",
  "switch/SilverShadow-PokeRogue/game/index.html",
  "switch/SilverShadow-PokeRogue/game/manifest.json",
  `switch/SilverShadow-PokeRogue/game/${manifest.compiledEntryPoint}`,
]) {
  if (!zipEntries.includes(required)) {
    throw new Error(`Release ZIP is missing ${required}`);
  }
}
if (zipEntries.filter(value => value.toLowerCase().endsWith(".nro")).length !== 1) {
  throw new Error("Release ZIP contains duplicate or misplaced NRO files.");
}
if (zipEntries.some(value => value.includes(".cache/") || value.includes("node_modules/"))) {
  throw new Error("Release ZIP contains cache or node_modules files.");
}

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
      zipBytes: zipInfo.size,
      zipEntries: zipEntries.length,
      compiledJavaScriptFiles: compiledJavaScript.length,
      requiredDirectories: manifest.requiredDirectories,
      requiredFiles: manifest.requiredFiles.length,
    },
    null,
    2,
  ),
);

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

async function readZipCentralDirectory(file) {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    const tailSize = Math.min(info.size, 65_557);
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, info.size - tailSize);
    let eocd = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (tail.readUInt32LE(offset) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error("ZIP end-of-central-directory record was not found.");
    }
    const totalEntries = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    const central = Buffer.alloc(centralSize);
    await handle.read(central, 0, centralSize, centralOffset);
    const names = [];
    let offset = 0;
    while (offset < central.length && names.length < totalEntries) {
      if (central.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error(`Invalid ZIP central-directory signature at ${offset}.`);
      }
      const nameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      names.push(central.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (names.length !== totalEntries) {
      throw new Error(`ZIP central directory declared ${totalEntries} entries but contained ${names.length}.`);
    }
    return names;
  } finally {
    await handle.close();
  }
}
