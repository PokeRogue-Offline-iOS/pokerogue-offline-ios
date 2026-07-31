import assert from "node:assert/strict";
import { readFileSync as readFileSyncNative, statSync as statSyncNative } from "node:fs";
import { copyFile, mkdtemp, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import {
  buildAssetPacks,
  readPackedEntry,
  validateAssetIndex,
  verifyPackFile,
  writeDeterministicAssetIndex,
} from "./asset-pack-lib.mjs";

test("asset packs are deterministic, indexed, ranged, and corruption-detecting", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silvershadow-asset-pack-"));
  try {
    const source = path.join(temporary, "source");
    const first = path.join(temporary, "first");
    const second = path.join(temporary, "second");
    const cache = path.join(temporary, "cache");
    await mkdir(path.join(source, "audio", "bgm"), { recursive: true });
    await mkdir(path.join(source, "images", "pokemon"), { recursive: true });
    await mkdir(path.join(source, "battle-anims"), { recursive: true });
    await mkdir(path.join(source, "fonts"), { recursive: true });
    await mkdir(path.join(source, "locales", "en"), { recursive: true });
    await writeFile(path.join(source, "audio", "bgm", "test.mp3"), Buffer.from([0x49, 0x44, 0x33, 1, 2, 3]));
    await writeFile(path.join(source, "images", "pokemon", "1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(source, "battle-anims", "absorb.json"), '{"frames":[1,2,3]}\n');
    await writeFile(path.join(source, "fonts", "test.ttf"), Buffer.from([0, 1, 0, 0, 7]));
    await writeFile(path.join(source, "fonts", "empty.bin"), Buffer.alloc(0));
    await writeFile(path.join(source, "locales", "en", "test.json"), '{"ok":true}\n');
    for (const [name, contents] of [
      ["biome-bgm-loop-points.json", "{}\n"],
      ["exp-sprites.json", "{}\n"],
      ["logo128.png", "128"],
      ["logo512.png", "512"],
      ["manifest.webmanifest", "{}\n"],
      ["starter-colors.json", "{}\n"],
    ]) {
      await writeFile(path.join(source, name), contents);
    }

    const firstBuild = await buildAssetPacks({ sourceRoot: source, outputRoot: first, cacheRoot: cache });
    const secondBuild = await buildAssetPacks({ sourceRoot: source, outputRoot: second, cacheRoot: cache });
    validateAssetIndex(firstBuild.index);
    assert.deepEqual(firstBuild.index, secondBuild.index);
    assert.ok(secondBuild.packs.every(pack => pack.reused));

    const firstIndex = path.join(first, "asset-packs.json");
    const secondIndex = path.join(second, "asset-packs.json");
    await writeDeterministicAssetIndex(firstIndex, firstBuild.index);
    await writeDeterministicAssetIndex(secondIndex, secondBuild.index);
    assert.deepEqual(await readFile(firstIndex), await readFile(secondIndex));
    await verifyRuntimeReaderContract("exclusive", temporary, source, first, firstBuild.index);
    await verifyRuntimeReaderContract("inclusive", temporary, source, first, firstBuild.index);

    for (const pack of firstBuild.index.packs) {
      await verifyPackFile(first, pack);
    }
    const samplePack = firstBuild.index.packs.find(pack => pack.id === "animations");
    await assert.rejects(verifyPackFile(path.join(temporary, "missing"), samplePack), /asset pack animations is missing/i);
    const corruptRoot = path.join(temporary, "corrupt");
    await mkdir(corruptRoot);
    const corruptPack = path.join(corruptRoot, samplePack.path);
    await copyFile(path.join(first, samplePack.path), corruptPack);
    const corruptHandle = await open(corruptPack, "r+");
    try {
      const lastByte = Buffer.alloc(1);
      await corruptHandle.read(lastByte, 0, 1, samplePack.size - 1);
      lastByte[0] ^= 0xff;
      await corruptHandle.write(lastByte, 0, 1, samplePack.size - 1);
    } finally {
      await corruptHandle.close();
    }
    await assert.rejects(verifyPackFile(corruptRoot, samplePack), /asset pack animations SHA-256 mismatch/i);

    assert.equal(
      (await readPackedEntry(first, firstBuild.index, "battle-anims/absorb.json")).toString("utf8"),
      '{"frames":[1,2,3]}\n',
    );
    assert.equal(await readPackedEntry(first, firstBuild.index, "missing.json"), null);

    const corruptIndex = structuredClone(firstBuild.index);
    corruptIndex.entries["battle-anims/absorb.json"][3] = "0".repeat(64);
    await assert.rejects(
      readPackedEntry(first, corruptIndex, "battle-anims/absorb.json"),
      /SHA-256 mismatch for packed asset/,
    );

    const unsafeIndex = structuredClone(firstBuild.index);
    unsafeIndex.entries["../escape.json"] = unsafeIndex.entries["battle-anims/absorb.json"];
    unsafeIndex.entryCount += 1;
    assert.throws(() => validateAssetIndex(unsafeIndex), /Unsafe asset-pack path/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

async function verifyRuntimeReaderContract(endMode, temporary, sourceRoot, packRoot, index) {
  const bundlePath = path.join(temporary, `asset-packs-runtime-${endMode}.mjs`);
  const switchSourceRoot = path.join(fileURLToPath(new URL("../", import.meta.url)), "src");
  const entryPath = path.join(switchSourceRoot, "asset-packs.ts");
  const sandboxFileLoader = {
    name: "test-sandbox-file-loader",
    setup(context) {
      context.onResolve({ filter: /^\.\.?\// }, async args => ({
        path: await resolveLocal(args.resolveDir, args.path),
        namespace: "test-sandbox-file",
      }));
      context.onLoad({ filter: /.*/, namespace: "test-sandbox-file" }, async args => ({
        contents: await readFile(args.path, "utf8"),
        loader: path.extname(args.path) === ".ts" ? "ts" : "js",
        resolveDir: path.dirname(args.path),
      }));
    },
  };
  await build({
    stdin: {
      contents: await readFile(entryPath, "utf8"),
      sourcefile: "asset-packs.ts",
      resolveDir: switchSourceRoot,
      loader: "ts",
    },
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    logLevel: "silent",
    plugins: [sandboxFileLoader],
  });

  const gameRoot = "sdmc:/switch/SilverShadow-PokeRogue/game";
  const previousSwitch = globalThis.Switch;
  globalThis.Switch = {
    appendFileSync() {},
    statSync(virtualPath) {
      try {
        const info = statSyncNative(toLocalPath(virtualPath));
        return { size: info.size };
      } catch {
        return null;
      }
    },
    readFileSync(virtualPath, options) {
      try {
        const data = readFileSyncNative(toLocalPath(virtualPath));
        if (!options) {
          return toArrayBuffer(data);
        }
        const endExclusive = endMode === "exclusive" ? options.end : options.end + 1;
        return toArrayBuffer(data.subarray(options.start, endExclusive));
      } catch {
        return null;
      }
    },
    async readFile(virtualPath, options) {
      return this.readFileSync(virtualPath, options);
    },
  };

  function toLocalPath(virtualPath) {
    const value = String(virtualPath);
    if (!value.startsWith(`${gameRoot}/`)) {
      throw new Error(`Unexpected virtual test path: ${value}`);
    }
    return path.join(packRoot, value.slice(gameRoot.length + 1).replaceAll("/", path.sep));
  }

  try {
    const runtime = await import(`${pathToFileURL(bundlePath).href}?mode=${endMode}`);
    await runtime.initializeAssetPacks({
      format: index.format,
      version: index.version,
      indexPath: "asset-packs.json",
      packCount: index.packCount,
      entryCount: index.entryCount,
    });
    await runtime.verifyPackedAssetPrefix("fonts/");

    for (const assetPath of Object.keys(index.entries)) {
      const expected = readFileSyncNative(path.join(sourceRoot, assetPath.replaceAll("/", path.sep)));
      const asyncRead = Buffer.from(await runtime.readGameFile(`${gameRoot}/${assetPath}`));
      assert.deepEqual(asyncRead, expected, `${endMode} async range mismatch for ${assetPath}`);
      const syncRead = Buffer.from(runtime.readGameFileSync(`${gameRoot}/${assetPath}`));
      assert.deepEqual(syncRead, expected, `${endMode} sync range mismatch for ${assetPath}`);
    }
  } finally {
    globalThis.Switch = previousSwitch;
  }
}

function toArrayBuffer(data) {
  return Uint8Array.from(data).buffer;
}

async function resolveLocal(resolveDirectory, specifier) {
  const candidate = path.resolve(resolveDirectory, specifier);
  for (const extension of [".ts", ".js", "/index.ts", "/index.js"]) {
    const resolved = `${candidate}${extension}`;
    try {
      if (statSyncNative(resolved).isFile()) {
        return resolved;
      }
    } catch {
      // Try the next supported extension.
    }
  }
  throw new Error(`Unable to resolve test module ${specifier} from ${resolveDirectory}`);
}
