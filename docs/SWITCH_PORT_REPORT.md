# Nintendo Switch Milestone 2 report

## Summary

Milestone 2 replaces the small release payload with the real
SilverShadow-patched PokéRogue web build while retaining the hardware-proven
nx.js bootstrap and diagnostics. The result is a hardware-testable, offline,
SD-card-oriented package. It is not claimed playable.

## Selected source

- PokéRogue version: `1.12.0.10`
- PokéRogue commit:
  `0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4`
- Assets commit: `909b43612324622608023b3beb2f24f4ef159c1d`
- Locales commit: `c2f9c794ce17f1445d14357a4995353447e9df55`
- pnpm: `10.33.2`
- CI Node: `24.9.0`
- Local validation Node: `24.13.1`
- nx.js runtime/NRO: `1.0.0-beta.6`
- Phaser: `3.90.0`

## Logical changes and commits

The implementation is separated into logical local commits for:

1. persistent cache and real-game build integration;
2. runtime loader, packaging, metadata, and verification;
3. Milestone 2 documentation and hardware-test instructions.

Exact hashes and messages are included in the final local handoff because a
commit cannot record its own final hash.

## Build artifacts

```text
switch/release/SilverShadow-PokeRogue-Switch-Milestone2.zip
switch/release/switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro
switch/release/switch/SilverShadow-PokeRogue/game/manifest.json
switch/release/switch/SilverShadow-PokeRogue/SHA256SUMS.txt
switch/release/milestone2-build.log
switch/release/symbols/SilverShadow-PokeRogue-switch-entry.js.map
```

The verified package contains one 56,491,745-byte fat NRO, a
610,691,406-byte ZIP, 34,116 ZIP entries, and 20 JavaScript files. Exact sizes
may change after final metadata-only regeneration.

## Package layout

```text
switch/
└── SilverShadow-PokeRogue/
    ├── SilverShadow-PokeRogue.nro
    ├── SHA256SUMS.txt
    ├── config/defaults.json
    ├── game/
    │   ├── index.html
    │   ├── manifest.json
    │   ├── version.json
    │   ├── switch-entry.js
    │   ├── assets/
    │   ├── audio/
    │   ├── fonts/
    │   ├── images/
    │   ├── locales/
    │   └── other upstream data/assets
    ├── logs/README.txt
    └── saves/README.txt
```

## Cache design

The cache separates upstream Git objects, disposable worktrees, pnpm content,
npm/pnpm/immutable downloads, extracted assets, metadata, and exact-key
compiled intermediates. Immutable tarballs are validated against recorded
SHA-256 values. The observed archive hashes were:

- assets:
  `82cdf0d9168b40483b139a0902fc8f6bc92233ab68c949f865fd02217aeb728b`
- locales:
  `fd8312e628d1c8662e610ef741cda10c0e9c3b9970aac9e93e7f53f40f6c830b`

GitHub Actions uses separate safe caches for npm/nx.js downloads, the pnpm
store, exact upstream Git objects, immutable assets, and the exact compiled
intermediate. Only package/download stores receive partial restore keys.

## Build timing and cache observations

The final successful clean-cache and offline-rebuild timings are recorded after
the last validation pass. During implementation, the exact compiled
intermediate was reused in `0.046` seconds, and a complete cached NRO/ZIP
package/verification pass completed in about `113` seconds. ZIP assembly is the
dominant cached cost because the 610 MB-class external payload is deliberately
recreated and reverified.

Observed cache-miss categories on the first real build:

- upstream repository: MISS, populated from a clean local Git-object seed;
- upstream commit: PRESENT;
- assets archive: MISS;
- locales archive: MISS;
- exact pnpm CLI: POPULATED;
- pnpm store: POPULATED;
- compiled intermediate: REBUILT.

Observed cache-hit categories on the second real build:

- upstream repository: HIT;
- assets/locales: HIT;
- pnpm CLI/store: HIT;
- compiled intermediate: REUSED.

## Validation status

Executed and passed:

- exact shared-then-Switch patch application;
- real Vite app build;
- 2,720 transformed modules;
- 14,273 minified JSON files;
- no-import 8,822,479-byte controlled entry generation;
- Switch TypeScript typecheck;
- nx.js bootstrap bundle;
- fat NRO generation;
- complete ZIP generation;
- schema and checksum validation;
- critical asset-tree validation;
- Milestone 1-only rejection checks;
- NRO placement/duplication checks;
- ZIP central-directory verification;
- shell and Node syntax checks;
- `git diff --check`.

Still to run after the final documentation/code state:

- successful measured clean-cache package build;
- measured offline forced-intermediate rebuild;
- final Android/origin-main diff audit;
- mojibake scan;
- final clean worktree/branch confirmation.

Requires real Switch hardware:

- external async-function evaluation under nx.js;
- the exact first real compatibility blocker;
- Phaser WebGL and custom pipelines;
- title screen;
- image/audio decoding through the real loaders;
- controller mappings;
- persistent storage behavior across launches;
- suspend/resume and long-session memory behavior.

## Known blockers and risks

No real runtime blocker is yet established because Milestone 2 has not run on
hardware. The first returned failure must be treated as authoritative.
Anticipated risk areas are WebGL2/Phaser renderer assumptions, Rex DOM plugins,
the minimal DOM tree, audio lifecycle, decoded asset memory, controller
mapping, and software-keyboard flows.

The local Codex Windows sandbox cannot create the normal `%LOCALAPPDATA%`
default cache because its execution account is ACL-isolated. Validation uses a
short writable `SILVERSHADOW_CACHE_DIR` override. A normal user PowerShell
session and GitHub Actions use the documented default/explicit cache roots.

## Required hardware feedback

Return the exact items in `docs/SWITCH_INSTALL.md`, especially
`logs/milestone2.log`, the screen photo, console/runtime versions, title
override state, controller arrangement, Wi-Fi state, the last startup stage,
and whether storage and deliberate missing-file failures behaved as described.
