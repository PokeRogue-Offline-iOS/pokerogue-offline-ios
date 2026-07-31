# Switch development and debugging

## Pinned toolchain and source

- Node.js `24.9.0` is the CI pin. The package accepts Node `>=24.9.0`.
- pnpm `10.33.2` is installed into the persistent cache and invoked directly.
- npm installs the exact `switch/package-lock.json`.
- `@nx.js/runtime` and `@nx.js/nro` are `1.0.0-beta.6`.
- Phaser is `3.90.0`.
- PokéRogue is `1.12.0.10` at
  `0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4`.
- Asset and locale snapshots are
  `909b43612324622608023b3beb2f24f4ef159c1d` and
  `c2f9c794ce17f1445d14357a4995353447e9df55`.

Git Bash is required on Windows for the existing assertion-backed patch
scripts. Set `SILVERSHADOW_BASH` if it is not installed at the standard Git for
Windows location.

## Persistent cache

`SILVERSHADOW_CACHE_DIR` overrides the cache root. Defaults are:

- Windows:
  `%LOCALAPPDATA%\SilverShadow\PokeRogue\switch-build`
- Linux/macOS:
  `$XDG_CACHE_HOME/silvershadow-pokerogue/switch-build`, or
  `~/.cache/silvershadow-pokerogue/switch-build` when `XDG_CACHE_HOME` is unset

The layout is:

```text
switch-build/
├── upstream/pokerogue.git/  reusable bare Git object database
├── worktrees/               resettable pinned source checkout
├── pnpm-store/              content-addressable pnpm packages
├── downloads/               npm data, pnpm CLI, and immutable tarballs
├── assets/                  checksum-validated extracted assets/locales
├── metadata/                reserved cache metadata
└── intermediate/            exact-input compiled real-game output
```

The compiled key includes the upstream and submodule commits, actual and
expected Node versions, pnpm/nx.js/Phaser versions, manifest schema, lockfiles,
shared files and patches, Switch patches, and all relevant build, post-build,
packaging, and verification scripts. Compiled output has no broad fallback key.

Every build reports validated `HIT`, `MISS`, `PRESENT`, `POPULATED`, `REUSED`,
or `REBUILT` states and the reason. A directory's existence alone is never
treated as a hit.

## Build commands

PowerShell:

```powershell
$cache = if ($env:SILVERSHADOW_CACHE_DIR) {
  $env:SILVERSHADOW_CACHE_DIR
} else {
  Join-Path $env:LOCALAPPDATA "SilverShadow\PokeRogue\switch-build"
}

npm.cmd --prefix switch ci --cache "$cache\downloads\npm" --prefer-offline
npm.cmd --prefix switch run package
npm.cmd --prefix switch run verify
```

Linux/macOS:

```bash
npm --prefix switch ci \
  --cache "${SILVERSHADOW_CACHE_DIR:-$HOME/.cache/silvershadow-pokerogue/switch-build}/downloads/npm" \
  --prefer-offline
npm --prefix switch run package
npm --prefix switch run verify
```

`package` obtains or validates the bare upstream cache, creates or resets the
pinned worktree, restores exact assets/locales, applies `all` then `switch`,
uses `pnpm fetch` plus a frozen offline install, builds Vite's app mode,
overlays the complete external asset tree, creates `switch-entry.js`, builds
the fat NRO, creates/reuses four deterministic random-access asset packs, and
verifies the uncompressed SD-card directory.

## Refresh, cleanup, and offline commands

```powershell
# Force upstream and immutable asset refresh plus a clean checkout/build.
npm.cmd --prefix switch run game:refresh

# Refresh only upstream Git references and rebuild.
node switch/scripts/build-game.mjs --refresh-upstream --rebuild-intermediate

# Refresh only asset/locale archives and rebuild.
node switch/scripts/build-game.mjs --refresh-assets --rebuild-intermediate

# Recreate the disposable checkout without deleting downloads.
node switch/scripts/build-game.mjs --force-clean-checkout --rebuild-intermediate

# Remove final NRO/release/RomFS only.
npm.cmd --prefix switch run clean:output

# Remove worktrees and compiled intermediates only.
npm.cmd --prefix switch run clean:intermediate

# Remove only the reusable upstream Git cache.
npm.cmd --prefix switch run cache:clean:upstream

# Remove every Switch build cache.
npm.cmd --prefix switch run cache:clean

# Package from an already complete cache without network access.
npm.cmd --prefix switch run package:offline
```

An offline rebuild can recreate dependencies, the real Vite build, NRO, and
uncompressed asset-pack release when the pinned upstream object, both immutable archives, exact pnpm CLI,
pnpm store, and Switch npm dependencies are present. A cache miss reports the
specific missing category instead of attempting the network. `npm ci` itself
also needs a populated npm cache when performed offline.

## Generated output

```text
switch/release/switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro
switch/release/switch/SilverShadow-PokeRogue/game/manifest.json
switch/release/switch/SilverShadow-PokeRogue/game/asset-packs.json
switch/release/switch/SilverShadow-PokeRogue/game/assets-*.sspack
switch/release/switch/SilverShadow-PokeRogue/SHA256SUMS.txt
switch/release/milestone2-build.log
switch/release/symbols/SilverShadow-PokeRogue-switch-entry.js.map
```

`npm run verify` rejects a missing/thin/duplicated NRO, invalid metadata,
missing or mismatched entry, checksum failure, empty critical asset directory,
Milestone 1-only package, pack coverage/offset/hash failures, any ZIP, cache
leakage, or packaged `saves`, `config`, or `logs`.

## GitHub Actions release ZIP

`.github/workflows/build-switch-poc.yml` exposes the **Build PokeRogueOffline
Switch NRO** workflow. It treats the verified uncompressed release tree above
as the build authority and only then creates a store-mode ZIP containing the
top-level `switch/` directory. CI checks that the ZIP contains one fat NRO,
the checksum and pack index, exactly four `.sspack` files, and none of the old
many-file static asset directories.

The workflow reads `SILVERSHADOW_VERSION` from
`.github/workflows/build-android.yml`, exports it to the Switch build, and
temporarily applies it to `switch/package.json` while `nxjs-nro` generates the
NRO metadata. It restores the checked-in metadata before release manifests are
created. The same workflow regenerates `switch/icon.jpg` as a 256x256 JPEG
from `configs/android/icon-main.png` and restores the checked-in source file
after NRO generation.

## Source patch validation

From the repository root:

```powershell
& "C:\Program Files\Git\bin\bash.exe" scripts/apply-patches.sh switch
```

The target checkout must be named `pokerogue-src`. The build orchestrator
provides that shape inside its disposable cache worktree. It never modifies
the reusable bare repository.

## Hardware logs

Milestone 2 appends to:

```text
sdmc:/switch/SilverShadow-PokeRogue/logs/milestone2-YYYYMMDDTHHMMSSmmmZ.log
```

Each launch creates a new UTC-timestamped log. The log records explicit startup
stages, local/blocked resource resolution,
manifest and version information, full error stacks, active shims, requested
paths, and memory information when available. Old logs do not need to be
deleted between controlled test runs. Never delete `saves/`.

## Alpha continuation workflow

The 2026-07-29 Alpha evidence and next investigation order are recorded in
`docs/SWITCH_ALPHA_STATUS.md`. Start continued troubleshooting from the merged
`main` baseline on a new branch:

```powershell
git switch main
git pull --ff-only origin main
git switch -c fix/switch-alpha-runtime
```

Keep each hardware iteration narrow:

1. Reproduce one failure and preserve the timestamped log and screenshot.
2. Fix or instrument only that failure.
3. Run `npm.cmd --prefix switch run check`.
4. Build the fat NRO and run `npm.cmd --prefix switch run verify`.
5. If external game files did not change, deliver only the changed NRO,
   `game/manifest.json`, and `SHA256SUMS.txt`.
6. Never overwrite or delete the tester's `saves/` directory.

The first Alpha continuation should add memory snapshots and Phaser
loader-error diagnostics. It should then reproduce the Plus crash without the
preceding all-cheats reload and verify animation texture registration before
changing renderer behavior.
