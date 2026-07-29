import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const projectRoot = new URL("../", import.meta.url);
const releaseRoot = new URL("release/", projectRoot);
const appRoot = new URL("switch/SilverShadow-PokeRogue/", releaseRoot);
const gameRoot = new URL("game/", appRoot);
const assetsRoot = new URL("assets/", gameRoot);
const sourceNro = new URL("silvershadow-pokerogue-switch-poc.nro", projectRoot);
const outputNro = new URL("SilverShadow-PokeRogue.nro", appRoot);
const outputZip = new URL("SilverShadow-PokeRogue-Switch-Milestone1.zip", releaseRoot);

await mkdir(assetsRoot, { recursive: true });
await mkdir(new URL("saves/", appRoot), { recursive: true });
await mkdir(new URL("logs/", appRoot), { recursive: true });
await mkdir(new URL("config/", appRoot), { recursive: true });
await copyFile(sourceNro, outputNro);

const version = {
  schemaVersion: 1,
  switchPlatformVersion: "0.1.0",
  silverShadowGameVersion: "milestone1-phaser-poc",
  nxjsPackageVersion: "1.0.0-beta.6",
  phaserVersion: "3.90.0",
};
await writeJson(new URL("version.json", gameRoot), version);
await writeFile(new URL("milestone1-test.png", assetsRoot), createTestPng());
await writeJson(new URL("defaults.json", new URL("config/", appRoot)), {
  networkEnabled: false,
  renderer: "phaser-canvas",
  intendedMemoryMode: "application",
});
await writeFile(
  new URL("README.txt", new URL("saves/", appRoot)),
  "Switch save data will live in this directory in later milestones. Do not delete it when updating.\n",
);
await writeFile(
  new URL("README.txt", new URL("logs/", appRoot)),
  "Return milestone1.log when reporting hardware test results.\n",
);

const requiredPaths = ["version.json", "assets/milestone1-test.png"];
const requiredFiles = [];
for (const relativePath of requiredPaths) {
  const data = await readFile(new URL(relativePath, gameRoot));
  requiredFiles.push({
    path: relativePath,
    size: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}

const manifest = {
  schemaVersion: 1,
  switchPlatformVersion: "0.1.0",
  nxjsPackageVersion: "1.0.0-beta.6",
  phaserVersion: "3.90.0",
  silverShadowGameVersion: "milestone1-phaser-poc",
  upstreamPokeRogueCommit: null,
  assetVersion: "milestone1-test-asset-v1",
  buildDate: new Date().toISOString(),
  packageLayout: "switch/SilverShadow-PokeRogue",
  intendedMemoryMode: "application/title-override",
  offlineRequired: true,
  requiredFiles,
};
await writeJson(new URL("manifest.json", gameRoot), manifest);

await createZip(appRoot, outputZip);
console.log(`Created ${fileURLToPath(outputNro)}`);
console.log(`Created ${fileURLToPath(outputZip)}`);

async function writeJson(url, value) {
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
}

function createTestPng() {
  const width = 160;
  const height = 96;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const checker = (Math.floor(x / 16) + Math.floor(y / 16)) % 2;
      scanlines[offset] = checker ? 99 : 242;
      scanlines[offset + 1] = checker ? 123 : 79;
      scanlines[offset + 2] = checker ? 255 : 139;
      scanlines[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("tEXt", Buffer.from("Title\0SilverShadow nx.js Milestone 1", "latin1")),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createZip(sourceDirectory, outputFile) {
  const prefix = "switch/SilverShadow-PokeRogue";
  const relativeFiles = [
    "SilverShadow-PokeRogue.nro",
    "config/defaults.json",
    "game/assets/milestone1-test.png",
    "game/manifest.json",
    "game/version.json",
    "logs/README.txt",
    "saves/README.txt",
  ];
  const entries = {};
  for (const relativePath of relativeFiles) {
    entries[`${prefix}/${relativePath}`] = new Uint8Array(await readFile(new URL(relativePath, sourceDirectory)));
  }
  await writeFile(outputFile, zipSync(entries, { level: 9 }));
}
