import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import {
  MANIFEST_SCHEMA_VERSION,
  NODE_VERSION,
  NXJS_NRO_VERSION,
  NXJS_VERSION,
  PHASER_VERSION,
  PNPM_VERSION,
  SWITCH_PLATFORM_VERSION,
  UPSTREAM_COMMIT,
  UPSTREAM_VERSION,
  buildLogPath,
  buildResultPath,
  repositoryRoot,
  switchRoot,
} from "./config.mjs";

const releaseRoot = path.join(switchRoot, "release");
const appRoot = path.join(releaseRoot, "switch", "SilverShadow-PokeRogue");
const gameRoot = path.join(appRoot, "game");
const sourceNro = path.join(switchRoot, "silvershadow-pokerogue-switch.nro");
const outputNro = path.join(appRoot, "SilverShadow-PokeRogue.nro");
const outputZip = path.join(releaseRoot, "SilverShadow-PokeRogue-Switch-Milestone2.zip");

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
await cp(buildResult.compiledGameRoot, gameRoot, { recursive: true });
await mkdir(path.join(appRoot, "saves"), { recursive: true });
await mkdir(path.join(appRoot, "logs"), { recursive: true });
await mkdir(path.join(appRoot, "config"), { recursive: true });
await mkdir(path.join(releaseRoot, "symbols"), { recursive: true });
await copyFile(sourceNro, outputNro);

const sourceMap = path.join(gameRoot, "switch-entry.js.map");
try {
  await copyFile(sourceMap, path.join(releaseRoot, "symbols", "SilverShadow-PokeRogue-switch-entry.js.map"));
  await rm(sourceMap);
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
  silverShadowGameVersion: `${UPSTREAM_VERSION}-switch-m2`,
  upstreamPokeRogueCommit: UPSTREAM_COMMIT,
  upstreamPokeRogueVersion: UPSTREAM_VERSION,
};
await writeJson(path.join(gameRoot, "version.json"), version);
await writeJson(path.join(appRoot, "config", "defaults.json"), {
  networkEnabled: false,
  renderer: "upstream-phaser-webgl",
  intendedMemoryMode: "application/title-override",
  gameRoot: "sdmc:/switch/SilverShadow-PokeRogue/game",
  saveRoot: "sdmc:/switch/SilverShadow-PokeRogue/saves",
});
await writeFile(
  path.join(appRoot, "saves", "README.txt"),
  "Persistent localStorage is stored here as local-storage.json with a recoverable backup. Preserve this directory when updating.\n",
);
await writeFile(
  path.join(appRoot, "logs", "README.txt"),
  "Return the newest milestone2-*.log and a photo of the screen when reporting hardware results.\n",
);

const requiredDirectories = ["assets", "audio", "fonts", "images", "locales"];
const importantPaths = [
  "index.html",
  "version.json",
  buildResult.originalEntryPoint,
  buildResult.compiledEntryPoint,
];
const requiredFiles = [];
for (const relativePath of [...new Set(importantPaths)]) {
  const absolutePath = safeGamePath(relativePath);
  const info = await stat(absolutePath);
  requiredFiles.push({
    path: relativePath.replaceAll("\\", "/"),
    size: info.size,
    sha256: await sha256File(absolutePath),
    purpose:
      relativePath === buildResult.compiledEntryPoint
        ? "nx.js controlled real-game entry"
        : relativePath === buildResult.originalEntryPoint
          ? "original Vite module entry"
          : "package bootstrap metadata",
  });
}

const manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  packageKind: "milestone2-real-game",
  switchPlatformVersion: SWITCH_PLATFORM_VERSION,
  silverShadowGameVersion: `${UPSTREAM_VERSION}-switch-m2`,
  silverShadowRepositoryCommit: repositoryCommit,
  repositoryDirtyAtBuild: repositoryDirty,
  upstreamPokeRogueCommit: UPSTREAM_COMMIT,
  upstreamPokeRogueVersion: UPSTREAM_VERSION,
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
  evaluationMode: "async-function",
  requiredDirectories,
  requiredFiles,
  packageLayout: "switch/SilverShadow-PokeRogue",
  intendedMemoryMode: "application/title-override",
  offlineRequired: true,
  compatibilityShims: [
    "minimal-dom",
    "dom-tag-lookup",
    "dom-classlist-toggle",
    "dom-css-properties",
    "sdmc-local-fetch",
    "fetch-backed-xmlhttprequest",
    "phaser-audio-listener",
    "remote-network-block",
    "persistent-local-storage-v1",
    "memory-session-storage",
    "location",
    "external-fonts",
    "local-font-url-to-buffer",
    "phaser-webgl1-to-nxjs-webgl2",
    "nxjs-video-capability",
    "nxjs-screen-canvas",
  ],
  manifest: {},
};
await writeJson(path.join(gameRoot, "manifest.json"), manifest);

const checksumTargets = [
  "SilverShadow-PokeRogue.nro",
  "game/manifest.json",
  "game/version.json",
  `game/${buildResult.compiledEntryPoint}`,
];
const checksumLines = [];
for (const relativePath of checksumTargets) {
  checksumLines.push(`${await sha256File(path.join(appRoot, relativePath))}  ${relativePath.replaceAll("\\", "/")}`);
}
await writeFile(path.join(appRoot, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`);
await copyFile(buildLogPath, path.join(releaseRoot, "milestone2-build.log"));

await createZip(appRoot, outputZip);
console.log(`Created ${outputNro}`);
console.log(`Created ${outputZip}`);

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

async function createZip(sourceDirectory, outputFile) {
  const files = await listFiles(sourceDirectory);
  const output = createWriteStream(outputFile, { flags: "wx" });
  let zipError;
  const zip = new Zip((error, data, final) => {
    if (error) {
      zipError = error;
      output.destroy(error);
      return;
    }
    output.write(data);
    if (final) {
      output.end();
    }
  });

  for (const relativePath of files) {
    const absolutePath = path.join(sourceDirectory, relativePath);
    const archivePath = `switch/SilverShadow-PokeRogue/${relativePath.replaceAll("\\", "/")}`;
    const extension = path.extname(relativePath).toLowerCase();
    const storeOnly = [".png", ".jpg", ".jpeg", ".webp", ".mp3", ".ogg", ".wav", ".zip", ".nro"].includes(extension);
    const entry = storeOnly ? new ZipPassThrough(archivePath) : new ZipDeflate(archivePath, { level: 6 });
    zip.add(entry);
    const input = createReadStream(absolutePath, { highWaterMark: 1024 * 1024 });
    for await (const chunk of input) {
      entry.push(new Uint8Array(chunk), false);
    }
    entry.push(new Uint8Array(), true);
  }
  zip.end();
  await once(output, "close");
  if (zipError) {
    throw zipError;
  }
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
