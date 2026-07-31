import { GAME_ROOT } from "./constants";
import { appendLog } from "./logger";

const ASSET_PACK_FORMAT = "silvershadow-asset-packs";
const ASSET_PACK_VERSION = 1;
const ASSET_PACK_HEADER_SIZE = 64;
const ASSET_PACK_MAGIC = "SSPACK1";

type AssetEntryTuple = [packIndex: number, offset: number, size: number, sha256: string];

interface AssetPack {
  id: string;
  path: string;
  size: number;
  dataSize: number;
  entryCount: number;
  catalogSha256: string;
  sha256: string;
}

interface AssetPackIndex {
  format: string;
  version: number;
  headerSize: number;
  packCount: number;
  entryCount: number;
  packs: AssetPack[];
  entries: Record<string, AssetEntryTuple>;
}

export interface AssetPackManifest {
  format: typeof ASSET_PACK_FORMAT;
  version: typeof ASSET_PACK_VERSION;
  indexPath: string;
  packCount: number;
  entryCount: number;
}

let activeIndex: AssetPackIndex | null = null;
const verifiedAssets = new Set<string>();
let rangeEndMode: "exclusive" | "inclusive" | null = null;

export async function initializeAssetPacks(manifest: AssetPackManifest): Promise<void> {
  activeIndex = null;
  verifiedAssets.clear();
  rangeEndMode = null;
  if (
    manifest?.format !== ASSET_PACK_FORMAT ||
    manifest.version !== ASSET_PACK_VERSION ||
    !isSafeRelativePath(manifest.indexPath)
  ) {
    throw new Error("The game manifest contains unsupported asset-pack metadata.");
  }
  const indexPath = `${GAME_ROOT}/${manifest.indexPath}`;
  const indexData = Switch.readFileSync(indexPath);
  if (indexData === null) {
    throw new Error(`Required asset-pack index is missing: ${manifest.indexPath}`);
  }
  let index: AssetPackIndex;
  try {
    index = JSON.parse(new TextDecoder().decode(indexData)) as AssetPackIndex;
  } catch (error) {
    throw new Error(`Asset-pack index is invalid JSON: ${manifest.indexPath}`, { cause: error });
  }
  validateIndex(index, manifest);

  const entryCounts = index.packs.map(() => 0);
  const entriesByPack = index.packs.map(() => [] as Array<[string, number, number]>);
  for (const [assetPath, tuple] of Object.entries(index.entries)) {
    if (!isSafeRelativePath(assetPath) || !isEntryTuple(tuple, index.packs.length)) {
      throw new Error(`Asset-pack index contains an unsafe or invalid entry: ${assetPath}`);
    }
    const [packIndex, offset, size] = tuple;
    const pack = index.packs[packIndex];
    if (offset < ASSET_PACK_HEADER_SIZE || offset + size > pack.size) {
      throw new Error(`Asset-pack entry exceeds "${pack.id}": ${assetPath}`);
    }
    entryCounts[packIndex] += 1;
    entriesByPack[packIndex].push([assetPath, offset, size]);
  }

  for (const [packIndex, pack] of index.packs.entries()) {
    validatePackMetadata(pack);
    if (entryCounts[packIndex] !== pack.entryCount) {
      throw new Error(`Asset-pack entry count mismatch for "${pack.id}".`);
    }
    const sorted = entriesByPack[packIndex].sort((a, b) => a[1] - b[1]);
    let expectedOffset = ASSET_PACK_HEADER_SIZE;
    for (const [assetPath, offset, size] of sorted) {
      if (offset !== expectedOffset) {
        throw new Error(`Asset-pack offsets are not contiguous at ${assetPath}.`);
      }
      expectedOffset += size;
    }
    if (expectedOffset !== pack.size) {
      throw new Error(`Asset-pack indexed size mismatch for "${pack.id}".`);
    }

    const packPath = `${GAME_ROOT}/${pack.path}`;
    const info = Switch.statSync(packPath);
    if (!info || Number(info.size) !== pack.size) {
      throw new Error(
        `Required asset pack "${pack.id}" is missing or has the wrong size: ${pack.path} (expected ${pack.size}).`,
      );
    }
    if (rangeEndMode === null) {
      detectRangeEndMode(packPath, pack.id);
    }
    const header = readRangeSync(
      packPath,
      0,
      ASSET_PACK_HEADER_SIZE,
      `asset pack "${pack.id}" header`,
    );
    validateHeader(header, pack);
  }

  activeIndex = index;
  appendLog("INFO", "Validated indexed random-access asset packs", {
    indexPath: manifest.indexPath,
    packs: index.packs.map(pack => ({
      id: pack.id,
      path: pack.path,
      bytes: pack.size,
      entries: pack.entryCount,
    })),
    entries: index.entryCount,
  });
}

export async function verifyPackedAssetPrefix(prefix: string): Promise<void> {
  if (!activeIndex) {
    throw new Error("Asset packs have not been initialized.");
  }
  if (!isSafeRelativePath(prefix.replace(/\/$/, ""))) {
    throw new Error(`Unsafe asset-pack verification prefix: ${prefix}`);
  }
  const matches = Object.keys(activeIndex.entries).filter(assetPath => assetPath.startsWith(prefix));
  for (const assetPath of matches) {
    await readPackedAsset(assetPath);
  }
  appendLog("INFO", "Verified packed asset group", {
    prefix,
    files: matches.length,
  });
}

export async function readGameFile(path: string): Promise<ArrayBuffer | null> {
  const assetPath = toAssetPath(path);
  if (assetPath && activeIndex?.entries[assetPath]) {
    return readPackedAsset(assetPath);
  }
  return Switch.readFile(path);
}

export function readGameFileSync(path: string): ArrayBuffer | null {
  const assetPath = toAssetPath(path);
  if (!assetPath || !activeIndex?.entries[assetPath]) {
    return Switch.readFileSync(path);
  }
  const tuple = activeIndex.entries[assetPath];
  const pack = activeIndex.packs[tuple[0]];
  const data = readPackRange(pack, tuple[1], tuple[2]);
  if (!verifiedAssets.has(assetPath)) {
    appendLog("WARN", "Synchronously read packed asset before SHA-256 verification", {
      assetPath,
      pack: pack.id,
    });
  }
  return data;
}

export function hasPackedAsset(path: string): boolean {
  const assetPath = toAssetPath(path);
  return Boolean(assetPath && activeIndex?.entries[assetPath]);
}

async function readPackedAsset(assetPath: string): Promise<ArrayBuffer> {
  if (!activeIndex) {
    throw new Error("Asset packs have not been initialized.");
  }
  const tuple = activeIndex.entries[assetPath];
  if (!tuple) {
    throw new Error(`Asset is not indexed: ${assetPath}`);
  }
  const pack = activeIndex.packs[tuple[0]];
  const data =
    tuple[2] === 0
      ? new ArrayBuffer(0)
      : await readRange(
          `${GAME_ROOT}/${pack.path}`,
          tuple[1],
          tuple[2],
          `asset pack "${pack.id}" entry ${assetPath}`,
        );
  if (!verifiedAssets.has(assetPath)) {
    const digest = await sha256(data);
    if (digest !== tuple[3]) {
      throw new Error(
        `Corrupt asset pack "${pack.id}" entry ${assetPath}: expected SHA-256 ${tuple[3]}, received ${digest}.`,
      );
    }
    verifiedAssets.add(assetPath);
  }
  return data;
}

function readPackRange(pack: AssetPack, offset: number, size: number): ArrayBuffer {
  if (size === 0) {
    return new ArrayBuffer(0);
  }
  return readRangeSync(
    `${GAME_ROOT}/${pack.path}`,
    offset,
    size,
    `asset pack "${pack.id}" entry`,
  );
}

function detectRangeEndMode(packPath: string, packId: string): void {
  const probe = Switch.readFileSync(packPath, { start: 0, end: 1 });
  const bytes = probe?.byteLength ?? 0;
  if (bytes === 1) {
    rangeEndMode = "exclusive";
  } else if (bytes === 2) {
    rangeEndMode = "inclusive";
  } else {
    throw new Error(
      `Could not determine nx.js ranged-read semantics from asset pack "${packId}": expected a 1- or 2-byte probe, received ${bytes}.`,
    );
  }
  appendLog("INFO", "Detected nx.js ranged-read end semantics", {
    mode: rangeEndMode,
    probeBytes: bytes,
    pack: packId,
  });
}

async function readRange(
  path: string,
  start: number,
  size: number,
  purpose: string,
): Promise<ArrayBuffer> {
  const data = await Switch.readFile(path, {
    start,
    end: rangeEndArgument(start, size),
  });
  if (data === null || data.byteLength !== size) {
    throw new Error(
      `Short ranged read for ${purpose}: expected ${size}, received ${data?.byteLength ?? 0} (start=${start}, endMode=${rangeEndMode}).`,
    );
  }
  return data;
}

function readRangeSync(
  path: string,
  start: number,
  size: number,
  purpose: string,
): ArrayBuffer {
  const data = Switch.readFileSync(path, {
    start,
    end: rangeEndArgument(start, size),
  });
  if (data === null || data.byteLength !== size) {
    throw new Error(
      `Short ranged read for ${purpose}: expected ${size}, received ${data?.byteLength ?? 0} (start=${start}, endMode=${rangeEndMode}).`,
    );
  }
  return data;
}

function rangeEndArgument(start: number, size: number): number {
  if (rangeEndMode === null) {
    throw new Error("nx.js ranged-read semantics have not been detected.");
  }
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(size) || size <= 0) {
    throw new Error(`Invalid asset-pack range: start=${start}, size=${size}.`);
  }
  return rangeEndMode === "exclusive" ? start + size : start + size - 1;
}

function validateIndex(index: AssetPackIndex, manifest: AssetPackManifest): void {
  if (
    index?.format !== ASSET_PACK_FORMAT ||
    index.version !== ASSET_PACK_VERSION ||
    index.headerSize !== ASSET_PACK_HEADER_SIZE ||
    !Array.isArray(index.packs) ||
    !index.entries ||
    typeof index.entries !== "object" ||
    index.packCount !== index.packs.length ||
    index.entryCount !== Object.keys(index.entries).length ||
    index.packCount !== manifest.packCount ||
    index.entryCount !== manifest.entryCount
  ) {
    throw new Error("Asset-pack index format or counts are invalid.");
  }
  const ids = new Set<string>();
  for (const pack of index.packs) {
    validatePackMetadata(pack);
    if (ids.has(pack.id)) {
      throw new Error(`Asset-pack index contains duplicate pack id "${pack.id}".`);
    }
    ids.add(pack.id);
  }
}

function validatePackMetadata(pack: AssetPack): void {
  if (
    !pack ||
    !/^[a-z][a-z0-9-]*$/.test(pack.id) ||
    !isSafeRelativePath(pack.path) ||
    !Number.isSafeInteger(pack.size) ||
    pack.size < ASSET_PACK_HEADER_SIZE ||
    !Number.isSafeInteger(pack.dataSize) ||
    pack.dataSize !== pack.size - ASSET_PACK_HEADER_SIZE ||
    !Number.isSafeInteger(pack.entryCount) ||
    pack.entryCount < 0 ||
    !isSha256(pack.catalogSha256) ||
    !isSha256(pack.sha256)
  ) {
    throw new Error(`Asset-pack metadata is invalid for "${String(pack?.id)}".`);
  }
}

function validateHeader(buffer: ArrayBuffer, pack: AssetPack): void {
  const bytes = new Uint8Array(buffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, ASSET_PACK_MAGIC.length));
  const view = new DataView(buffer);
  const catalogHash = [...bytes.subarray(32, 64)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
  if (
    magic !== ASSET_PACK_MAGIC ||
    view.getUint32(8, true) !== ASSET_PACK_VERSION ||
    view.getUint32(12, true) !== ASSET_PACK_HEADER_SIZE ||
    Number(view.getBigUint64(16, true)) !== pack.dataSize ||
    view.getUint32(24, true) !== pack.entryCount ||
    catalogHash !== pack.catalogSha256
  ) {
    throw new Error(`Asset pack "${pack.id}" header does not match asset-packs.json.`);
  }
}

function isEntryTuple(value: unknown, packCount: number): value is AssetEntryTuple {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    Number.isSafeInteger(value[0]) &&
    value[0] >= 0 &&
    value[0] < packCount &&
    Number.isSafeInteger(value[1]) &&
    Number.isSafeInteger(value[2]) &&
    value[2] >= 0 &&
    isSha256(value[3])
  );
}

function toAssetPath(path: string): string | null {
  const prefix = `${GAME_ROOT}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }
  const relative = path.slice(prefix.length);
  return isSafeRelativePath(relative) ? relative : null;
}

function isSafeRelativePath(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    value.split("/").every(part => part !== "" && part !== "." && part !== "..")
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
}
