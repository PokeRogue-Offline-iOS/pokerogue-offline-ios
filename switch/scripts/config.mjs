import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const switchRoot = fileURLToPath(new URL("../", import.meta.url));
export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const switchPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const UPSTREAM_URL = "https://github.com/pagefaultgames/pokerogue.git";
export const UPSTREAM_COMMIT = "0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4";
export const UPSTREAM_VERSION = "1.12.0.10";
// CI exports the version from build-android.yml so Android and Switch releases
// share one user-edited value. Local Switch builds fall back to package.json.
export const SILVERSHADOW_VERSION = process.env.SILVERSHADOW_VERSION || switchPackage.version;
export const ASSETS_COMMIT = "909b43612324622608023b3beb2f24f4ef159c1d";
export const LOCALES_COMMIT = "c2f9c794ce17f1445d14357a4995353447e9df55";

export const NODE_VERSION = "24.9.0";
export const PNPM_VERSION = "10.33.2";
export const NXJS_VERSION = "1.0.0-beta.6";
export const NXJS_NRO_VERSION = "1.0.0-beta.6";
export const PHASER_VERSION = "3.90.0";
export const SWITCH_PLATFORM_VERSION = "0.3.0";
export const MANIFEST_SCHEMA_VERSION = 2;

const defaultCacheRoot =
  process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || os.tmpdir(), "SilverShadow", "PokeRogue", "switch-build")
    : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "silvershadow-pokerogue", "switch-build");
export const cacheRoot = path.resolve(process.env.SILVERSHADOW_CACHE_DIR || defaultCacheRoot);
export const upstreamCache = path.join(cacheRoot, "upstream", "pokerogue.git");
export const worktreesCache = path.join(cacheRoot, "worktrees");
export const pnpmStore = path.join(cacheRoot, "pnpm-store");
export const downloadsCache = path.join(cacheRoot, "downloads");
export const assetsCache = path.join(cacheRoot, "assets");
export const metadataCache = path.join(cacheRoot, "metadata");
export const intermediateCache = path.join(cacheRoot, "intermediate");

export const buildRoot = path.join(switchRoot, "build");
export const buildResultPath = path.join(buildRoot, "build-result.json");
export const buildLogPath = path.resolve(
  process.env.SILVERSHADOW_BUILD_LOG || path.join(buildRoot, "milestone2-build.log"),
);

export const submoduleDownloads = [
  {
    name: "assets",
    repository: "pagefaultgames/pokerogue-assets",
    commit: ASSETS_COMMIT,
    sha256: "82cdf0d9168b40483b139a0902fc8f6bc92233ab68c949f865fd02217aeb728b",
  },
  {
    name: "locales",
    repository: "pagefaultgames/pokerogue-locales",
    commit: LOCALES_COMMIT,
    sha256: "fd8312e628d1c8662e610ef741cda10c0e9c3b9970aac9e93e7f53f40f6c830b",
  },
];
