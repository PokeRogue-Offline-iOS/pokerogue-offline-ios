import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  appendFile,
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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
  UPSTREAM_URL,
  UPSTREAM_VERSION,
  assetsCache,
  buildLogPath,
  buildResultPath,
  buildRoot,
  cacheRoot,
  downloadsCache,
  intermediateCache,
  metadataCache,
  pnpmStore,
  repositoryRoot,
  submoduleDownloads,
  switchRoot,
  upstreamCache,
  worktreesCache,
} from "./config.mjs";

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline");
const refreshUpstream = args.has("--refresh-upstream");
const refreshAssets = args.has("--refresh-assets");
const forceCleanCheckout = args.has("--force-clean-checkout");
const startedAt = performance.now();
const cacheStatus = {};
const logLines = [];

if (args.has("--clean-output")) {
  await removeInside(switchRoot, path.join(switchRoot, "release"));
  await removeInside(switchRoot, path.join(switchRoot, "romfs"));
  for (const name of ["silvershadow-pokerogue-switch.nro", "silvershadow-pokerogue-switch-poc.nro"]) {
    await removeInside(switchRoot, path.join(switchRoot, name));
  }
  console.log("Cleaned final Switch output.");
  process.exit(0);
}
if (args.has("--clean-intermediate")) {
  await removeInside(cacheRoot, intermediateCache);
  await removeInside(cacheRoot, worktreesCache);
  console.log(`Cleaned intermediate cache: ${cacheRoot}`);
  process.exit(0);
}
if (args.has("--clean-upstream-cache")) {
  await removeInside(cacheRoot, upstreamCache);
  console.log(`Cleaned upstream repository cache: ${upstreamCache}`);
  process.exit(0);
}
if (args.has("--clean-all-cache")) {
  await removeCacheRoot();
  console.log(`Cleaned all Switch build caches: ${cacheRoot}`);
  process.exit(0);
}

await mkdir(path.dirname(buildLogPath), { recursive: true });
await writeFile(buildLogPath, "");
await log("SilverShadow Switch Milestone 2 real-game build");
await log(`cache root: ${cacheRoot}`);
await log(`mode: ${offline ? "OFFLINE" : "NETWORK ALLOWED"}`);
await log(`upstream: ${UPSTREAM_COMMIT} (${UPSTREAM_VERSION})`);
await log(`toolchain: node expected ${NODE_VERSION}, node actual ${process.version}, pnpm ${PNPM_VERSION}`);

const inputHash = await calculateInputHash();
const compiledRoot = path.join(intermediateCache, inputHash);
const compiledGameRoot = path.join(compiledRoot, "game");
const compiledMetadataPath = path.join(compiledRoot, "cache-metadata.json");

if (!args.has("--rebuild-intermediate") && (await isValidCompiledCache(compiledMetadataPath, compiledGameRoot, inputHash))) {
  cacheStatus.compiledIntermediate = { status: "REUSED", reason: `validated input hash ${inputHash}` };
  await logStatus("compiled intermediate", cacheStatus.compiledIntermediate);
  await writeBuildResult({
    inputHash,
    compiledGameRoot,
    originalEntryPoint: JSON.parse(await readFile(compiledMetadataPath, "utf8")).originalEntryPoint,
  });
  process.exit(0);
}

cacheStatus.compiledIntermediate = {
  status: "REBUILT",
  reason: args.has("--rebuild-intermediate") ? "forced by --rebuild-intermediate" : "no validated exact-key output",
};
await logStatus("compiled intermediate", cacheStatus.compiledIntermediate);

await ensureUpstreamMirror();
const sourceContainer = path.join(worktreesCache, UPSTREAM_COMMIT);
const sourceRoot = path.join(sourceContainer, "pokerogue-src");
await prepareWorktree(sourceContainer, sourceRoot);
await prepareSubmodules(sourceRoot);
await applySilverShadowPatches(sourceContainer);
await ensurePnpmCli();
await installDependencies(sourceRoot);
await buildWebApplication(sourceRoot);

const distRoot = path.join(sourceRoot, "dist");
await overlayMissing(path.join(sourceRoot, "assets"), distRoot);
await overlayMissing(path.join(sourceRoot, "locales"), path.join(distRoot, "locales"));
const originalEntryPoint = await createSwitchEntry(distRoot);
await validateRealGameOutput(distRoot);

const stagingRoot = `${compiledRoot}.staging-${process.pid}`;
await removeInside(intermediateCache, stagingRoot);
await mkdir(stagingRoot, { recursive: true });
await cp(distRoot, path.join(stagingRoot, "game"), { recursive: true });
await writeFile(
  path.join(stagingRoot, "cache-metadata.json"),
  `${JSON.stringify(
    {
      inputHash,
      createdAt: new Date().toISOString(),
      upstreamCommit: UPSTREAM_COMMIT,
      upstreamVersion: UPSTREAM_VERSION,
      silverShadowVersion: SILVERSHADOW_VERSION,
      originalEntryPoint,
      nodeVersion: process.version,
      expectedNodeVersion: NODE_VERSION,
      pnpmVersion: PNPM_VERSION,
      nxjsVersion: NXJS_VERSION,
      nxjsNroVersion: NXJS_NRO_VERSION,
      phaserVersion: PHASER_VERSION,
      manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    },
    null,
    2,
  )}\n`,
);
await removeInside(intermediateCache, compiledRoot);
await rename(stagingRoot, compiledRoot);
await writeBuildResult({ inputHash, compiledGameRoot, originalEntryPoint });

async function calculateInputHash() {
  const hash = createHash("sha256");
  for (const value of [
    UPSTREAM_COMMIT,
    UPSTREAM_VERSION,
    ASSETS_COMMIT,
    LOCALES_COMMIT,
    NODE_VERSION,
    process.version,
    PNPM_VERSION,
    NXJS_VERSION,
    NXJS_NRO_VERSION,
    PHASER_VERSION,
    SILVERSHADOW_VERSION,
    SWITCH_PLATFORM_VERSION,
    String(MANIFEST_SCHEMA_VERSION),
  ]) {
    hash.update(`${value}\0`);
  }
  const inputs = [
    "new-files",
    "patches/all",
    "patches/switch",
    "scripts/apply-patches.sh",
    "scripts/apply-post-build-patches.sh",
    "scripts/patch-lib.sh",
    "switch/package.json",
    "switch/package-lock.json",
    "switch/scripts/build-game.mjs",
    "switch/scripts/config.mjs",
    "switch/scripts/package-release.mjs",
    "switch/scripts/verify-release.mjs",
  ];
  for (const input of inputs) {
    await hashPath(hash, path.join(repositoryRoot, input), input.replaceAll("\\", "/"));
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
  hash.update(`${relativePath}\0`);
  hash.update(await readFile(absolutePath));
  hash.update("\0");
}

async function ensureUpstreamMirror() {
  const present = await gitObjectExists(upstreamCache, UPSTREAM_COMMIT);
  if (!present) {
    if (offline) {
      throw new Error(`Upstream repository cache MISS in offline mode: ${upstreamCache}`);
    }
    await mkdir(path.dirname(upstreamCache), { recursive: true });
    const seed = process.env.SILVERSHADOW_UPSTREAM_SEED;
    await log(`upstream repository: MISS; cloning ${seed ? `seed ${seed}` : UPSTREAM_URL}`);
    await run("git", ["-c", "core.longpaths=true", "clone", "--mirror", seed || UPSTREAM_URL, upstreamCache]);
    cacheStatus.upstreamRepository = { status: "MISS", reason: seed ? "populated from local seed" : "cloned remote" };
  } else {
    cacheStatus.upstreamRepository = { status: "HIT", reason: "validated bare repository and pinned commit object" };
  }

  if (refreshUpstream) {
    if (offline) {
      throw new Error("--refresh-upstream cannot be used with --offline.");
    }
    await run("git", [
      "-c",
      "core.longpaths=true",
      `--git-dir=${upstreamCache}`,
      "fetch",
      "--prune",
      "origin",
      "+refs/*:refs/*",
    ]);
    cacheStatus.upstreamCommit = { status: "FETCHED", reason: "forced remote refresh" };
  } else {
    cacheStatus.upstreamCommit = { status: "PRESENT", reason: `verified ${UPSTREAM_COMMIT}` };
  }
  if (!(await gitObjectExists(upstreamCache, UPSTREAM_COMMIT))) {
    throw new Error(`Pinned upstream commit is absent after cache initialization: ${UPSTREAM_COMMIT}`);
  }
  await logStatus("upstream repository", cacheStatus.upstreamRepository);
  await logStatus("upstream commit objects", cacheStatus.upstreamCommit);
}

async function gitObjectExists(gitDirectory, commit) {
  try {
    await access(path.join(gitDirectory, "HEAD"));
    await run("git", [`--git-dir=${gitDirectory}`, "cat-file", "-e", `${commit}^{commit}`], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function prepareWorktree(sourceContainer, sourceRoot) {
  const head = await gitHead(sourceRoot);
  if (forceCleanCheckout || head !== UPSTREAM_COMMIT) {
    if (await exists(sourceRoot)) {
      await run("git", [
        "-c",
        "core.longpaths=true",
        `--git-dir=${upstreamCache}`,
        "worktree",
        "remove",
        "--force",
        sourceRoot,
      ], {
        allowFailure: true,
      });
      await removeInside(worktreesCache, sourceContainer);
    }
    // GitHub Actions caches the bare mirror but deliberately excludes the
    // disposable checkout directory. A restored mirror can therefore retain
    // a registration for a worktree path that no longer exists. Prune only
    // those stale registrations before adding the fresh checkout.
    await run("git", [
      "-c",
      "core.longpaths=true",
      `--git-dir=${upstreamCache}`,
      "worktree",
      "prune",
      "--expire",
      "now",
    ]);
    await mkdir(sourceContainer, { recursive: true });
    await run("git", [
      "-c",
      "core.longpaths=true",
      `--git-dir=${upstreamCache}`,
      "worktree",
      "add",
      "--detach",
      sourceRoot,
      UPSTREAM_COMMIT,
    ]);
    cacheStatus.checkout = {
      status: "CLEAN",
      reason: forceCleanCheckout ? "forced new disposable worktree" : "created pinned disposable worktree",
    };
  } else {
    await run("git", ["-c", "core.longpaths=true", "-C", sourceRoot, "reset", "--hard", UPSTREAM_COMMIT]);
    await run("git", ["-c", "core.longpaths=true", "-C", sourceRoot, "clean", "-ffd", "-e", "node_modules"]);
    cacheStatus.checkout = { status: "REUSED", reason: "reset and cleaned validated pinned worktree" };
  }
  await logStatus("upstream checkout", cacheStatus.checkout);
}

async function gitHead(directory) {
  try {
    return (
      await run("git", ["-c", "core.longpaths=true", "-C", directory, "rev-parse", "HEAD"], {
        capture: true,
        quiet: true,
      })
    ).trim();
  } catch {
    return null;
  }
}

async function prepareSubmodules(sourceRoot) {
  for (const item of submoduleDownloads) {
    const archivePath = path.join(downloadsCache, `${item.name}-${item.commit}.tar.gz`);
    const checksumPath = `${archivePath}.sha256`;
    const extractedRoot = path.join(assetsCache, `${item.name}-${item.commit}`);
    let archiveValid = await validateCachedDownload(archivePath, checksumPath, item.sha256);
    if (refreshAssets && archiveValid) {
      await removeInside(downloadsCache, archivePath);
      await removeInside(downloadsCache, checksumPath);
      archiveValid = false;
    }
    if (!archiveValid) {
      if (offline) {
        throw new Error(`downloaded assets: MISS for ${item.name} in offline mode`);
      }
      await mkdir(downloadsCache, { recursive: true });
      const url = `https://codeload.github.com/${item.repository}/tar.gz/${item.commit}`;
      await log(`downloaded assets (${item.name}): MISS; ${url}`);
      await download(url, archivePath);
      const digest = await sha256File(archivePath);
      if (digest !== item.sha256) {
        await rm(archivePath, { force: true });
        throw new Error(`Checksum mismatch for ${item.name}: expected ${item.sha256}, received ${digest}`);
      }
      await writeFile(checksumPath, `${digest}  ${path.basename(archivePath)}\n`);
      cacheStatus[`download-${item.name}`] = { status: "MISS", reason: `downloaded and recorded sha256 ${digest}` };
    } else {
      cacheStatus[`download-${item.name}`] = { status: "HIT", reason: "size and recorded sha256 validated" };
    }

    const marker = path.join(extractedRoot, ".silvershadow-cache.json");
    let extractedValid = false;
    try {
      const metadata = JSON.parse(await readFile(marker, "utf8"));
      extractedValid = metadata.commit === item.commit && (await directoryHasFiles(extractedRoot));
    } catch {
      extractedValid = false;
    }
    if (!extractedValid || refreshAssets) {
      await removeInside(assetsCache, extractedRoot);
      await mkdir(extractedRoot, { recursive: true });
      await run("tar", ["-xzf", archivePath, "--strip-components=1", "-C", extractedRoot]);
      await writeFile(marker, `${JSON.stringify({ name: item.name, commit: item.commit }, null, 2)}\n`);
    }
    await logStatus(`downloaded assets (${item.name})`, cacheStatus[`download-${item.name}`]);

    const destination = path.join(sourceRoot, item.name);
    await rm(destination, { recursive: true, force: true });
    await cp(extractedRoot, destination, {
      recursive: true,
      filter: source => path.basename(source) !== ".silvershadow-cache.json",
    });
  }
}

async function validateCachedDownload(archivePath, checksumPath, pinnedChecksum) {
  try {
    const info = await stat(archivePath);
    if (info.size < 1024) {
      return false;
    }
    const expected = (await readFile(checksumPath, "utf8")).trim().split(/\s+/)[0];
    return expected === pinnedChecksum && pinnedChecksum === (await sha256File(archivePath));
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const temporary = `${destination}.partial-${process.pid}`;
  await rm(temporary, { force: true });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  await rename(temporary, destination);
}

async function applySilverShadowPatches(sourceContainer) {
  const bash = await findBash();
  const script = toBashPath(path.join(repositoryRoot, "scripts", "apply-patches.sh"));
  await run(bash, [script, "switch"], { cwd: sourceContainer });
  const actual = await gitHead(path.join(sourceContainer, "pokerogue-src"));
  if (actual !== UPSTREAM_COMMIT) {
    throw new Error(`Patch worktree moved away from pinned commit: ${actual}`);
  }
  await log("patches: shared SilverShadow layer then Switch layer applied successfully");
}

async function findBash() {
  if (process.platform !== "win32") {
    return "bash";
  }
  for (const candidate of [
    process.env.SILVERSHADOW_BASH,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ]) {
    if (candidate && (await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error("Git Bash was not found. Set SILVERSHADOW_BASH to bash.exe.");
}

function toBashPath(value) {
  if (process.platform !== "win32") {
    return value;
  }
  return value.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll("\\", "/");
}

async function ensurePnpmCli() {
  const cliRoot = path.join(downloadsCache, `pnpm-cli-${PNPM_VERSION}`);
  const packageJson = path.join(cliRoot, "node_modules", "pnpm", "package.json");
  let valid = false;
  try {
    valid = JSON.parse(await readFile(packageJson, "utf8")).version === PNPM_VERSION;
  } catch {
    valid = false;
  }
  if (!valid) {
    if (offline) {
      throw new Error(`pnpm CLI ${PNPM_VERSION} is not cached for offline use.`);
    }
    await mkdir(cliRoot, { recursive: true });
    await run(
      process.execPath,
      [
        npmCliPath(),
        "install",
        "--prefix",
        cliRoot,
        "--no-save",
        "--ignore-scripts",
        "--cache",
        path.join(downloadsCache, "npm"),
        `pnpm@${PNPM_VERSION}`,
      ],
      { cwd: repositoryRoot },
    );
    cacheStatus.pnpmCli = { status: "POPULATED", reason: `installed exact pnpm ${PNPM_VERSION}` };
  } else {
    cacheStatus.pnpmCli = { status: "HIT", reason: `validated exact pnpm ${PNPM_VERSION}` };
  }
  process.env.SILVERSHADOW_PNPM_CLI = path.join(cliRoot, "node_modules", "pnpm", "bin", "pnpm.cjs");
  await logStatus("pnpm CLI", cacheStatus.pnpmCli);
}

async function installDependencies(sourceRoot) {
  await mkdir(pnpmStore, { recursive: true });
  const storeHadContent = await directoryHasFiles(pnpmStore);
  const baseArgs = ["--dir", sourceRoot, "--store-dir", pnpmStore];
  if (!offline) {
    await run(process.execPath, [
      process.env.SILVERSHADOW_PNPM_CLI,
      ...baseArgs,
      "fetch",
      "--frozen-lockfile",
      "--reporter=append-only",
    ]);
  }
  await run(process.execPath, [
    process.env.SILVERSHADOW_PNPM_CLI,
    ...baseArgs,
    "install",
    "--offline",
    "--frozen-lockfile",
    "--ignore-scripts",
    "--reporter=append-only",
  ]);
  cacheStatus.pnpmStore = {
    status: storeHadContent ? "HIT" : "POPULATED",
    reason: storeHadContent
      ? "validated by successful frozen-lockfile offline install"
      : "populated by pnpm fetch and validated offline install",
  };
  await logStatus("pnpm store", cacheStatus.pnpmStore);
}

async function buildWebApplication(sourceRoot) {
  await run(
    process.execPath,
    [process.env.SILVERSHADOW_PNPM_CLI, "--dir", sourceRoot, "run", "build:app"],
    {
      env: {
        ...process.env,
        VITE_BYPASS_LOGIN: "1",
      },
    },
  );
  await run(
    await findBash(),
    [toBashPath(path.join(repositoryRoot, "scripts", "apply-post-build-patches.sh")), "switch"],
    { cwd: path.dirname(sourceRoot) },
  );
}

async function createSwitchEntry(distRoot) {
  const { build: esbuild } = await import("esbuild");
  const indexHtml = await readFile(path.join(distRoot, "index.html"), "utf8");
  const matches = [...indexHtml.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/gi)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one compiled module entry in index.html, found ${matches.length}.`);
  }
  const originalEntryPoint = matches[0][1].replace(/^\.\//, "");
  const entryPath = path.resolve(distRoot, originalEntryPoint);
  if (!entryPath.startsWith(`${path.resolve(distRoot)}${path.sep}`) || !(await exists(entryPath))) {
    throw new Error(`Compiled Vite entry is unsafe or missing: ${originalEntryPoint}`);
  }
  const regexRewriteCounts = [0, 0];
  const compatibleEntrySource = rewriteNxjsUnsupportedRegex(
    await readFile(entryPath, "utf8"),
    regexRewriteCounts,
  );
  const outputPath = path.join(distRoot, "switch-entry.js");
  const compiledFileLoader = {
    name: "compiled-file-loader",
    setup(context) {
      context.onResolve({ filter: /^\.\.?\// }, args => ({
        path: path.resolve(args.resolveDir, args.path),
        namespace: "compiled-file",
      }));
      context.onLoad({ filter: /.*/, namespace: "compiled-file" }, async args => {
        const contents = rewriteNxjsUnsupportedRegex(await readFile(args.path, "utf8"), regexRewriteCounts);
        return {
          contents,
          loader: "js",
          resolveDir: path.dirname(args.path),
        };
      });
    },
  };
  const result = await esbuild({
    stdin: {
      contents: compatibleEntrySource,
      sourcefile: originalEntryPoint,
      resolveDir: path.dirname(entryPath),
      loader: "js",
    },
    bundle: true,
    splitting: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: outputPath,
    sourcemap: "external",
    sourcesContent: false,
    legalComments: "none",
    define: {
      "import.meta.url": JSON.stringify("sdmc:/switch/SilverShadow-PokeRogue/game/switch-entry.js"),
    },
    banner: {
      js: 'globalThis.__SILVERSHADOW_WEB_BOOTSTRAP_STARTED__ = true;',
    },
    footer: {
      js: 'globalThis.__SILVERSHADOW_WEB_BOOTSTRAP_RESOLVED__ = true;',
    },
    plugins: [compiledFileLoader],
    metafile: true,
    logLevel: "info",
  });
  const output = Object.values(result.metafile.outputs).find(value => value.entryPoint);
  if (!output || output.imports.length !== 0) {
    throw new Error("The Switch entry still contains unresolved JavaScript imports.");
  }
  if (regexRewriteCounts.some(count => count !== 1)) {
    throw new Error(
      `Expected one occurrence of each nx.js-incompatible Unicode property regex, found ${regexRewriteCounts.join(", ")}.`,
    );
  }
  if (/\\[pP]\{/.test(await readFile(outputPath, "utf8"))) {
    throw new Error("The controlled Switch entry still contains unsupported Unicode property escapes.");
  }
  await log(`compiled entry: ${originalEntryPoint} -> switch-entry.js (${output.bytes} bytes, no external imports)`);
  return originalEntryPoint;
}

function rewriteNxjsUnsupportedRegex(source, counts) {
  const replacements = [
    [String.raw`/([\p{Ll}\d])(\p{Lu})/gu`, String.raw`/([a-z\d])([A-Z])/g`],
    [String.raw`/(\p{Lu})([\p{Lu}][\p{Ll}])/gu`, String.raw`/([A-Z])([A-Z][a-z])/g`],
  ];
  let compatible = source;
  for (const [index, [unsupported, replacement]] of replacements.entries()) {
    const occurrences = compatible.split(unsupported).length - 1;
    counts[index] += occurrences;
    compatible = compatible.replaceAll(unsupported, replacement);
  }
  return compatible;
}

async function validateRealGameOutput(distRoot) {
  const required = [
    "index.html",
    "switch-entry.js",
    "assets",
    "audio",
    "fonts",
    "images",
    "locales",
  ];
  for (const relative of required) {
    const candidate = path.join(distRoot, relative);
    if (!(await exists(candidate))) {
      throw new Error(`Real PokéRogue output is missing ${relative}`);
    }
  }
  const entry = await readFile(path.join(distRoot, "switch-entry.js"), "utf8");
  if (!entry.includes("__SILVERSHADOW_WEB_BOOTSTRAP_STARTED__") || !entry.includes("Phaser")) {
    throw new Error("switch-entry.js does not contain the expected real-game indicators.");
  }
  for (const directory of ["assets", "audio", "fonts", "images", "locales"]) {
    if (!(await directoryHasFiles(path.join(distRoot, directory)))) {
      throw new Error(`Critical real-game directory is empty: ${directory}`);
    }
  }
}

async function overlayMissing(source, destination) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await overlayMissing(from, to);
    } else if (!(await exists(to))) {
      await copyFile(from, to);
    }
  }
}

async function isValidCompiledCache(metadataPath, gameRoot, inputHash) {
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    return (
      metadata.inputHash === inputHash &&
      metadata.upstreamCommit === UPSTREAM_COMMIT &&
      (await exists(path.join(gameRoot, "index.html"))) &&
      (await exists(path.join(gameRoot, "switch-entry.js"))) &&
      (await directoryHasFiles(path.join(gameRoot, "images"))) &&
      (await directoryHasFiles(path.join(gameRoot, "audio"))) &&
      (await directoryHasFiles(path.join(gameRoot, "locales")))
    );
  } catch {
    return false;
  }
}

async function writeBuildResult({ inputHash, compiledGameRoot, originalEntryPoint }) {
  const durationSeconds = Number(((performance.now() - startedAt) / 1000).toFixed(3));
  const result = {
    milestone: 2,
    packageKind: "milestone2-real-game",
    createdAt: new Date().toISOString(),
    durationSeconds,
    cacheRoot,
    inputHash,
    compiledGameRoot,
    originalEntryPoint,
    compiledEntryPoint: "switch-entry.js",
    upstreamCommit: UPSTREAM_COMMIT,
    upstreamVersion: UPSTREAM_VERSION,
    assetsCommit: ASSETS_COMMIT,
    localesCommit: LOCALES_COMMIT,
    expectedNodeVersion: NODE_VERSION,
    actualNodeVersion: process.version,
    pnpmVersion: PNPM_VERSION,
    nxjsVersion: NXJS_VERSION,
    nxjsNroVersion: NXJS_NRO_VERSION,
    phaserVersion: PHASER_VERSION,
    switchPlatformVersion: SWITCH_PLATFORM_VERSION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    inputHashes: {
      combined: inputHash,
    },
    cacheStatus,
    buildLog: buildLogPath,
  };
  await mkdir(buildRoot, { recursive: true });
  await writeFile(buildResultPath, `${JSON.stringify(result, null, 2)}\n`);
  await log(`build result: ${buildResultPath}`);
  await log(`duration: ${durationSeconds.toFixed(3)} seconds`);
  await writeFile(buildResultPath, `${JSON.stringify(result, null, 2)}\n`);
}

async function logStatus(category, value) {
  await log(`${category}: ${value.status} (${value.reason})`);
}

async function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  logLines.push(line);
  await appendFile(buildLogPath, `${line}\n`);
}

async function run(command, commandArgs, options = {}) {
  if (!options.quiet) {
    await log(`run: ${command} ${commandArgs.join(" ")}`);
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd || repositoryRoot,
      env: options.env || process.env,
      shell: false,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        stdout += chunk;
      });
      child.stderr.on("data", chunk => {
        stderr += chunk;
      });
    }
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0 || options.allowFailure) {
        resolve(options.capture ? stdout : "");
      } else {
        reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      }
    });
  });
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

async function directoryHasFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name !== ".silvershadow-cache.json") {
        return true;
      }
      if (entry.isDirectory() && (await directoryHasFiles(path.join(directory, entry.name)))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function removeInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside the intended root: ${resolvedTarget}`);
  }
  await rm(resolvedTarget, { recursive: true, force: true });
}

async function removeCacheRoot() {
  const resolved = path.resolve(cacheRoot);
  const parsed = path.parse(resolved);
  if (
    resolved === parsed.root ||
    path.basename(resolved).toLowerCase() !== "switch-build" ||
    resolved.split(path.sep).filter(Boolean).length < 4
  ) {
    throw new Error(`Refusing to remove unsafe cache root: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}

function npmCliPath() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }
  return path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}
