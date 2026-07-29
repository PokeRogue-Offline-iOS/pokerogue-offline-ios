import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const releaseRoot = new URL("release/", projectRoot);
const appRoot = new URL("switch/SilverShadow-PokeRogue/", releaseRoot);
const gameRoot = new URL("game/", appRoot);
const nroUrl = new URL("SilverShadow-PokeRogue.nro", appRoot);
const zipUrl = new URL("SilverShadow-PokeRogue-Switch-Milestone1.zip", releaseRoot);

const nro = await readFile(nroUrl);
if (nro.subarray(0x10, 0x14).toString("ascii") !== "NRO0") {
  throw new Error("Packaged application does not contain an NRO0 header.");
}
if (nro.byteLength < 40 * 1024 * 1024) {
  throw new Error(`NRO is only ${nro.byteLength} bytes; --fat packaging was not preserved.`);
}

const manifest = JSON.parse(await readFile(new URL("manifest.json", gameRoot), "utf8"));
if (manifest.nxjsPackageVersion !== "1.0.0-beta.6") {
  throw new Error("Manifest nx.js version is not the tested exact beta pin.");
}
if (manifest.phaserVersion !== "3.90.0") {
  throw new Error("Manifest Phaser version is not the PokéRogue-matching exact pin.");
}
if (manifest.offlineRequired !== true) {
  throw new Error("Manifest does not require offline operation.");
}

for (const file of manifest.requiredFiles) {
  const data = await readFile(new URL(file.path, gameRoot));
  const digest = createHash("sha256").update(data).digest("hex");
  if (digest !== file.sha256) {
    throw new Error(`Hash mismatch for ${file.path}`);
  }
}

const zipInfo = await stat(zipUrl);
if (zipInfo.size < 20 * 1024 * 1024) {
  throw new Error(`Release ZIP is unexpectedly small: ${zipInfo.size} bytes.`);
}

console.log(
  JSON.stringify(
    {
      verified: true,
      nxjs: manifest.nxjsPackageVersion,
      phaser: manifest.phaserVersion,
      nroBytes: nro.byteLength,
      zipBytes: zipInfo.size,
      requiredFiles: manifest.requiredFiles.length,
    },
    null,
    2,
  ),
);
