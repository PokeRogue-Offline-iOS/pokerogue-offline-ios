import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  link,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";

export const ASSET_PACK_FORMAT = "silvershadow-asset-packs";
export const ASSET_PACK_VERSION = 1;
export const ASSET_PACK_HEADER_SIZE = 64;
export const ASSET_PACK_MAGIC = "SSPACK1";

export const DEFAULT_PACK_DEFINITIONS = [
  {
    id: "audio",
    fileName: "assets-audio.sspack",
    inputs: [{ directory: "audio" }],
  },
  {
    id: "graphics",
    fileName: "assets-graphics.sspack",
    inputs: [{ directory: "images" }],
  },
  {
    id: "animations",
    fileName: "assets-animations.sspack",
    inputs: [{ directory: "battle-anims" }],
  },
  {
    id: "support",
    fileName: "assets-support.sspack",
    inputs: [
      { directory: "fonts" },
      { directory: "locales" },
      { file: "biome-bgm-loop-points.json" },
      { file: "exp-sprites.json" },
      { file: "logo128.png" },
      { file: "logo512.png" },
      { file: "manifest.webmanifest" },
      { file: "starter-colors.json" },
    ],
  },
];

export async function buildAssetPacks({
  sourceRoot,
  outputRoot,
  cacheRoot,
  definitions = DEFAULT_PACK_DEFINITIONS,
  log = () => {},
}) {
  const cacheDirectory = path.join(cacheRoot, "asset-packs", `v${ASSET_PACK_VERSION}`);
  await mkdir(cacheDirectory, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  const allEntries = Object.create(null);
  const packs = [];
  const seenPaths = new Set();

  for (const [packIndex, definition] of definitions.entries()) {
    validateIdentifier(definition.id, "pack id");
    validateRelativePath(definition.fileName);
    const sources = await collectPackSources(sourceRoot, definition.inputs);
    if (sources.length === 0) {
      throw new Error(`Asset pack "${definition.id}" has no input files.`);
    }

    const entries = await describeSources(sources);
    let offset = ASSET_PACK_HEADER_SIZE;
    for (const entry of entries) {
      if (seenPaths.has(entry.path)) {
        throw new Error(`Asset path is assigned to more than one pack: ${entry.path}`);
      }
      seenPaths.add(entry.path);
      entry.offset = offset;
      offset += entry.size;
    }

    const catalogSha256 = sha256Bytes(
      Buffer.from(JSON.stringify(entries.map(entry => [entry.path, entry.offset, entry.size, entry.sha256]))),
    );
    const cachePack = path.join(cacheDirectory, `${definition.id}-${catalogSha256}.sspack`);
    const cacheHash = `${cachePack}.sha256`;
    let packSha256;
    let reused = false;

    if (await isReusablePack(cachePack, cacheHash, entries, catalogSha256)) {
      packSha256 = (await readFile(cacheHash, "utf8")).trim();
      reused = true;
      await log(`asset pack ${definition.id}: REUSED (${entries.length} files, ${offset} bytes)`);
    } else {
      packSha256 = await writePack(cachePack, entries, catalogSha256);
      await writeFile(cacheHash, `${packSha256}\n`);
      await log(`asset pack ${definition.id}: REBUILT (${entries.length} files, ${offset} bytes)`);
    }

    const destination = path.join(outputRoot, definition.fileName);
    await materializeCachedFile(cachePack, destination);
    const pack = {
      id: definition.id,
      path: definition.fileName,
      size: offset,
      dataSize: offset - ASSET_PACK_HEADER_SIZE,
      entryCount: entries.length,
      catalogSha256,
      sha256: packSha256,
      reused,
    };
    packs.push(pack);

    for (const entry of entries) {
      allEntries[entry.path] = [packIndex, entry.offset, entry.size, entry.sha256];
    }
  }

  const orderedEntries = Object.create(null);
  for (const assetPath of Object.keys(allEntries).sort(comparePaths)) {
    orderedEntries[assetPath] = allEntries[assetPath];
  }
  const index = {
    format: ASSET_PACK_FORMAT,
    version: ASSET_PACK_VERSION,
    headerSize: ASSET_PACK_HEADER_SIZE,
    packCount: packs.length,
    entryCount: Object.keys(orderedEntries).length,
    packs: packs.map(({ reused: _reused, ...pack }) => pack),
    entries: orderedEntries,
  };
  return { index, packs };
}

export async function writeDeterministicAssetIndex(file, index) {
  await writeFile(file, `${JSON.stringify(index)}\n`);
}

export async function readPackedEntry(packRoot, index, assetPath) {
  validateAssetIndex(index);
  validateRelativePath(assetPath);
  const tuple = index.entries[assetPath];
  if (!tuple) {
    return null;
  }
  const [packIndex, offset, size, expectedHash] = tuple;
  const pack = index.packs[packIndex];
  const handle = await open(path.join(packRoot, pack.path), "r");
  try {
    const data = Buffer.alloc(size);
    const result = await handle.read(data, 0, size, offset);
    if (result.bytesRead !== size) {
      throw new Error(`Short read for ${assetPath}: expected ${size}, received ${result.bytesRead}.`);
    }
    const actualHash = sha256Bytes(data);
    if (actualHash !== expectedHash) {
      throw new Error(`SHA-256 mismatch for packed asset ${assetPath}: expected ${expectedHash}, received ${actualHash}.`);
    }
    return data;
  } finally {
    await handle.close();
  }
}

export function validateAssetIndex(index) {
  if (
    !index ||
    index.format !== ASSET_PACK_FORMAT ||
    index.version !== ASSET_PACK_VERSION ||
    index.headerSize !== ASSET_PACK_HEADER_SIZE ||
    !Array.isArray(index.packs) ||
    !index.entries ||
    typeof index.entries !== "object"
  ) {
    throw new Error("Asset-pack index has an unsupported or malformed format.");
  }
  if (index.packCount !== index.packs.length || index.entryCount !== Object.keys(index.entries).length) {
    throw new Error("Asset-pack index counts do not match its contents.");
  }

  const packIds = new Set();
  const entriesByPack = index.packs.map(() => []);
  for (const pack of index.packs) {
    validateIdentifier(pack.id, "pack id");
    validateRelativePath(pack.path);
    if (packIds.has(pack.id)) {
      throw new Error(`Duplicate asset-pack id: ${pack.id}`);
    }
    packIds.add(pack.id);
    if (
      !Number.isSafeInteger(pack.size) ||
      pack.size < ASSET_PACK_HEADER_SIZE ||
      !Number.isSafeInteger(pack.dataSize) ||
      pack.dataSize !== pack.size - ASSET_PACK_HEADER_SIZE ||
      !Number.isSafeInteger(pack.entryCount) ||
      pack.entryCount < 0 ||
      !isSha256(pack.catalogSha256) ||
      !isSha256(pack.sha256)
    ) {
      throw new Error(`Asset-pack metadata is invalid for ${pack.id}.`);
    }
  }

  for (const [assetPath, tuple] of Object.entries(index.entries)) {
    validateRelativePath(assetPath);
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 4 ||
      !Number.isSafeInteger(tuple[0]) ||
      tuple[0] < 0 ||
      tuple[0] >= index.packs.length ||
      !Number.isSafeInteger(tuple[1]) ||
      tuple[1] < ASSET_PACK_HEADER_SIZE ||
      !Number.isSafeInteger(tuple[2]) ||
      tuple[2] < 0 ||
      !isSha256(tuple[3])
    ) {
      throw new Error(`Asset-pack entry is invalid: ${assetPath}`);
    }
    const pack = index.packs[tuple[0]];
    if (tuple[1] + tuple[2] > pack.size) {
      throw new Error(`Asset-pack entry exceeds ${pack.id}: ${assetPath}`);
    }
    entriesByPack[tuple[0]].push([assetPath, tuple[1], tuple[2], tuple[3]]);
  }

  for (const [packIndex, packEntries] of entriesByPack.entries()) {
    const pack = index.packs[packIndex];
    if (packEntries.length !== pack.entryCount) {
      throw new Error(`Asset-pack entry count mismatch for ${pack.id}.`);
    }
    packEntries.sort((a, b) => a[1] - b[1]);
    let expectedOffset = ASSET_PACK_HEADER_SIZE;
    for (const [assetPath, offset, size] of packEntries) {
      if (offset !== expectedOffset) {
        throw new Error(`Asset-pack offsets are not contiguous at ${assetPath}.`);
      }
      expectedOffset += size;
    }
    if (expectedOffset !== pack.size) {
      throw new Error(`Asset-pack size does not match indexed entries for ${pack.id}.`);
    }
  }
  return true;
}

export async function verifyPackFile(packRoot, pack) {
  const file = path.join(packRoot, pack.path);
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new Error(`Required asset pack ${pack.id} is missing: ${pack.path}`);
  }
  if (!info.isFile() || info.size !== pack.size) {
    throw new Error(`Asset pack ${pack.id} size mismatch: expected ${pack.size}, received ${info.size}.`);
  }
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(ASSET_PACK_HEADER_SIZE);
    const result = await handle.read(header, 0, header.length, 0);
    if (result.bytesRead !== header.length) {
      throw new Error(`Asset pack ${pack.id} has a truncated header.`);
    }
    validatePackHeader(header, pack);
  } finally {
    await handle.close();
  }
  const digest = await sha256File(file);
  if (digest !== pack.sha256) {
    throw new Error(`Asset pack ${pack.id} SHA-256 mismatch: expected ${pack.sha256}, received ${digest}.`);
  }
}

export function validatePackHeader(header, pack) {
  if (
    header.subarray(0, ASSET_PACK_MAGIC.length).toString("ascii") !== ASSET_PACK_MAGIC ||
    header.readUInt32LE(8) !== ASSET_PACK_VERSION ||
    header.readUInt32LE(12) !== ASSET_PACK_HEADER_SIZE
  ) {
    throw new Error(`Asset pack ${pack.id} has an invalid header.`);
  }
  const dataSize = Number(header.readBigUInt64LE(16));
  const entryCount = header.readUInt32LE(24);
  const catalogSha256 = header.subarray(32, 64).toString("hex");
  if (
    dataSize !== pack.dataSize ||
    entryCount !== pack.entryCount ||
    catalogSha256 !== pack.catalogSha256
  ) {
    throw new Error(`Asset pack ${pack.id} header does not match asset-packs.json.`);
  }
}

export async function sha256File(file) {
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

async function collectPackSources(sourceRoot, inputs) {
  const files = [];
  for (const input of inputs) {
    if (input.directory) {
      validateRelativePath(input.directory);
      const directory = path.join(sourceRoot, input.directory);
      const info = await stat(directory);
      if (!info.isDirectory()) {
        throw new Error(`Asset-pack input is not a directory: ${input.directory}`);
      }
      files.push(...(await listFiles(directory, input.directory)));
    } else if (input.file) {
      validateRelativePath(input.file);
      const absolute = path.join(sourceRoot, input.file);
      const info = await stat(absolute);
      if (!info.isFile()) {
        throw new Error(`Asset-pack input is not a file: ${input.file}`);
      }
      files.push({ path: input.file.replaceAll("\\", "/"), absolute, size: info.size });
    } else {
      throw new Error("Asset-pack input must declare a directory or file.");
    }
  }
  files.sort((a, b) => comparePaths(a.path, b.path));
  return files;
}

async function listFiles(directory, prefix) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => comparePaths(a.name, b.name));
  for (const entry of entries) {
    const relativePath = `${prefix}/${entry.name}`.replaceAll("\\", "/");
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute, relativePath)));
    } else if (entry.isFile()) {
      const info = await stat(absolute);
      files.push({ path: relativePath, absolute, size: info.size });
    }
  }
  return files;
}

async function describeSources(sources) {
  const results = new Array(sources.length);
  const workerCount = Math.min(8, sources.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= sources.length) {
          return;
        }
        const source = sources[index];
        results[index] = {
          path: source.path,
          absolute: source.absolute,
          size: source.size,
          sha256: await sha256File(source.absolute),
          offset: 0,
        };
      }
    }),
  );
  return results;
}

async function isReusablePack(file, hashFile, entries, catalogSha256) {
  try {
    const expectedSize = ASSET_PACK_HEADER_SIZE + entries.reduce((sum, entry) => sum + entry.size, 0);
    const info = await stat(file);
    if (!info.isFile() || info.size !== expectedSize) {
      return false;
    }
    const expectedHash = (await readFile(hashFile, "utf8")).trim();
    if (!isSha256(expectedHash) || (await sha256File(file)) !== expectedHash) {
      return false;
    }
    const handle = await open(file, "r");
    try {
      const header = Buffer.alloc(ASSET_PACK_HEADER_SIZE);
      const result = await handle.read(header, 0, header.length, 0);
      if (result.bytesRead !== header.length) {
        return false;
      }
      validatePackHeader(header, {
        id: path.basename(file),
        dataSize: expectedSize - ASSET_PACK_HEADER_SIZE,
        entryCount: entries.length,
        catalogSha256,
      });
    } finally {
      await handle.close();
    }
    return true;
  } catch {
    return false;
  }
}

async function writePack(outputFile, entries, catalogSha256) {
  const temporary = `${outputFile}.tmp-${process.pid}`;
  await rm(temporary, { force: true });
  await mkdir(path.dirname(outputFile), { recursive: true });
  const header = createPackHeader(entries, catalogSha256);
  const hash = createHash("sha256");
  const output = createWriteStream(temporary, { flags: "wx" });
  output.write(header);
  hash.update(header);
  for (const entry of entries) {
    const input = createReadStream(entry.absolute, { highWaterMark: 1024 * 1024 });
    for await (const chunk of input) {
      if (!output.write(chunk)) {
        await once(output, "drain");
      }
      hash.update(chunk);
    }
  }
  output.end();
  await once(output, "close");
  await rm(outputFile, { force: true });
  await rename(temporary, outputFile);
  return hash.digest("hex");
}

function createPackHeader(entries, catalogSha256) {
  const dataSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  const header = Buffer.alloc(ASSET_PACK_HEADER_SIZE);
  header.write(ASSET_PACK_MAGIC, 0, "ascii");
  header.writeUInt32LE(ASSET_PACK_VERSION, 8);
  header.writeUInt32LE(ASSET_PACK_HEADER_SIZE, 12);
  header.writeBigUInt64LE(BigInt(dataSize), 16);
  header.writeUInt32LE(entries.length, 24);
  Buffer.from(catalogSha256, "hex").copy(header, 32);
  return header;
}

async function materializeCachedFile(source, destination) {
  await rm(destination, { force: true });
  try {
    await link(source, destination);
  } catch {
    await copyFile(source, destination);
  }
}

function validateRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes(":") ||
    value.split("/").some(part => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe asset-pack path: ${String(value)}`);
  }
}

function validateIdentifier(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
