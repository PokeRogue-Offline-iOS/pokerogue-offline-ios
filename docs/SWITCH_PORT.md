# Nintendo Switch port

## Status

This branch implements Milestone 0, a hardware-validated Milestone 1 proof of
concept, and a hardware-tested Milestone 2 real-game package. The port entered
Alpha on 2026-07-29 after the real SilverShadow-patched PokéRogue `1.12.0.10`
build reached sustained gameplay on a Switch OLED. The title screen, starter
selection, battles, rewards, Pokédex, readable text, attached-controller input,
and save/session persistence have been observed.

It is not a stable port. BGM playback and looping now work in tested gameplay,
but long-session audio behavior is not exhaustively validated. Move animations
can still use Phaser's missing-texture placeholder, cold boot and main-menu
refresh can show a black screen for roughly 35-45 seconds, controller prompts
are not always Switch-specific, and long sessions can still reach native/GPU
memory pressure during asset and BGM transitions. The port now releases
completed SD-card loader responses promptly, avoids ordinary two-BGM decode
overlap, and caps the Skia GPU cache, but the result still needs extended
hardware validation. The authoritative evidence, resolved blockers, known bugs, and
next investigation order are in
[`SWITCH_ALPHA_STATUS.md`](SWITCH_ALPHA_STATUS.md).

The final architecture remains a direct nx.js NRO. It does not use the Android
APK, Nintendo WebApplet, a browser applet, a local HTTP server, or Nintendo's
confidential SDK.

## Milestone 0 findings

### Existing repository and patch flow

The repository is a build-and-patch wrapper rather than a checked-in PokéRogue
source tree. Each platform workflow shallow-clones `pagefaultgames/pokerogue`,
then runs repository-owned Node or git patch files against `pokerogue-src`.

`scripts/apply-patches.sh` always applies `patches/all`, then conditionally
applies `mobile` and `android`. Post-build mobile changes are applied to Vite
output by `scripts/apply-post-build-patches.sh`. The shared layer contains the
SilverShadow title and banner, offline settings, Google Drive removal, update
screen, daily seed handling, sandbox economy settings, guaranteed capture,
claim-all rewards, gacha calendar, community menu, and touch-control behavior.

Switch now follows `all` then `switch`. It never executes `mobile` or
`android`. No existing workflow or package identifier was changed.

### Android preservation

- `build-android.yml` remains independent and unchanged.
- Permanent and development package IDs remain `com.silvershadow.pkr` and
  `com.silvershadow.pkrdev`.
- Android-specific Capacitor, manifest, WebView, icon, keyboard, import, and
  lifecycle patches remain outside the Switch path.
- The first Switch workflow builds only the isolated proof of concept. It does
  not alter the multi-platform release coordinator.

### Upstream PokéRogue snapshot inspected

The inspected `main` snapshot at commit
`0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4` reports PokéRogue `1.12.0.10`, Node
`>=24.9.0`, Phaser `^3.90.0`, Phaser Rex plugins `^1.80.20`, Vite `^8.0.16`,
and pnpm `10.33.2`. The production entry point forces `Phaser.WEBGL`, creates a
DOM container, installs four Rex plugins, uses custom WebGL pipelines, and
enables browser mouse, touch, and gamepad input.

Browser dependencies found in `src` include:

| Area | Evidence and Switch implication |
| --- | --- |
| DOM | Direct `document` use in 13 files and `window` use in 12. A narrow DOM compatibility layer or source patches are required. |
| Persistent data | `localStorage` appears in 13 files. Switch storage needs an atomic SD-card-backed implementation with backup and versioning. |
| Network/loading | Direct `fetch` appears in 3 files; the API layer defaults to an HTTP server and manifest initialization fetches `/manifest.json`. The Switch build must redirect local assets and reject HTTP(S). |
| Rendering | The game requires Phaser WebGL, custom pipelines, dynamic textures, generated canvases, font loading, and DOM-backed scaling. Canvas-only success does not prove PokéRogue compatibility. |
| Input | Gamepad-related code spans 22 files and touch-related code spans 15. Browser Gamepad compatibility must be mapped and tested on Joy-Con and Pro Controller. |
| Text entry/DOM UI | Rex InputText creates HTML controls. It must be replaced with the Switch software keyboard or another native offline flow. |
| File operations | `FileReader`, `Blob`, object URLs, generated downloads, and hidden file inputs are used for save import/export. |
| Localization/fonts | `navigator.language`, i18next browser detection, `document.fonts`, and local locale fetches need compatible local behavior. |
| Audio/lifecycle | Phaser Web Audio, focus/blur behavior, and suspend/resume need hardware validation even though nx.js exposes Web Audio. |

There is no direct IndexedDB use in the inspected source.

## nx.js runtime decision

The selected candidate is the exact published package version
`1.0.0-beta.6` for `@nx.js/runtime`, `@nx.js/nro`, and the corresponding
create-nxjs-app structure. Phaser is pinned to `3.90.0` because that is the
version used by the inspected PokéRogue source.

Why beta.6:

- It is the current published v1 release inspected on 2026-07-29 and is the
  V8/libuv/Skia runtime, not the older QuickJS/Cairo line.
- v1 beta.4 added the Switch GPU-backed WebGL2 context and Web Audio.
- v1 beta.2 introduced slim packaging while preserving explicit `--fat`.
- beta.5 fixed a `fetch(new Request(url))` GET/HEAD bug.
- beta.6 resolves `Image`, `Audio`, and `Video` loads through the current
  global `fetch`, allowing a strict offline wrapper while retaining `sdmc:`
  loading. It also includes Canvas cross-context font and WebGL constant
  installation fixes.
- The release includes gamepad identity/connectivity, application-regime V8
  heap sizing, GPU image caching, and graphics fixes relevant to a long-running
  game.

The exact npm integrity values observed were:

- `@nx.js/runtime@1.0.0-beta.6`:
  `sha512-wLKoRzGHWM8JLiqF49/tEoJq69jTtphy0ipd0bu/netfPF0xWNKDRuRMycrXy3wcvTKEYOmQO3eHdwgoWm6gRQ==`
- `@nx.js/nro@1.0.0-beta.6`:
  `sha512-6pPMgHaD7EQj4JpclmGYLheRtNEfi+PZqlUPsXx2XDJL894WJBkmk5FqzjHWBG8ssdtov3oMKGx7SiRx36aoCA==`
- `create-nxjs-app@1.0.0-beta.6`:
  `sha512-rwEy6GEdq6Gt4sh5ZyprroW/9Trr7xVsdlk/UrHZvYZEz25qzJfjMRQQwz1/xa911W3sOuB693wt2n5oQl1sZg==`

The lockfile, not these prose values, is the build authority.

## Phaser compatibility assessment

Minimal Phaser Canvas compatibility is confirmed for the Milestone 1 scene on
the tested Switch OLED configuration. Full Phaser and PokéRogue compatibility
remain unresolved.

The nx.js Canvas resize/context crash was reported as issue #318. PR #319
added a regression fixture for Phaser's measure-resize-draw text pattern. The
later V8/Skia migration reported the full conformance suite passing, and
beta.6 adds a separate cross-context font fix from PR #406. Milestone 1 repeats
both diagnostics on hardware before importing Phaser.

The Phaser Breakout proof of concept in PR #317 used Phaser 3.80 and a large
DOM shim. It was closed without merge on 2026-07-08. Consequently, no official
v1 package promises Phaser support and no official example validates Phaser
3.90 or Phaser WebGL. The proof is useful design evidence only.

Direct feasibility is plausible enough for a hardware proof because nx.js
provides V8, `requestAnimationFrame`, Canvas 2D, WebGL2, `Image`, `fetch`,
Gamepad, touch, fonts, Web Audio, and SD-card files. The largest risks are
Phaser's DOM assumptions, its WebGL1-oriented renderer API versus nx.js's
WebGL2 surface, Rex DOM plugins, asset loader behavior, shader/pipeline
coverage, and memory use.

## Milestone 1 architecture

The proof of concept:

1. Starts in the self-contained nx.js `1.0.0-beta.6` V8 runtime.
2. Rejects every HTTP(S) fetch at runtime.
3. Validates the external game directory, manifest, exact platform/runtime
   versions, and required files before Phaser is evaluated.
4. Runs the Canvas resize and cross-context font diagnostics.
5. Loads Phaser `3.90.0` through a documented experimental DOM shim.
6. Creates a minimal Phaser Canvas scene and loads a PNG from
   `sdmc:/switch/SilverShadow-PokeRogue/game/assets/`.
7. Animates a tween, polls the native Gamepad surface, displays A-button
   presses, and writes `logs/milestone1.log`.
8. Draws a readable non-Phaser error screen when validation fails.

The NRO is built with `nxjs-nro --fat`. The external PNG and manifests remain
outside the NRO but inside the release ZIP.

## File and directory plan

```text
switch/
  package.json
  package-lock.json
  src/                 nx.js bootstrap, validation, DOM shim, Phaser proof
  scripts/             clean, package, and verification tooling
  romfs/               generated bundled bootstrap
  release/             generated SD-card tree and ZIP
patches/
  all/                 shared SilverShadow behavior
  mobile/              unchanged
  android/             unchanged
  switch/              future PokéRogue source compatibility patches
docs/
  SWITCH_PORT.md
  SWITCH_INSTALL.md
  SWITCH_DEVELOPMENT.md
  SWITCH_NXJS_COMPATIBILITY.md
```

## Milestone 2 architecture

The selected source remains commit
`0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4`, version `1.12.0.10`. Its asset and
locale gitlinks are pinned to `909b43612324622608023b3beb2f24f4ef159c1d`
and `c2f9c794ce17f1445d14357a4995353447e9df55`.

The build now:

1. Validates or populates a reusable bare upstream object database.
2. Creates or resets a detached worktree at the exact commit.
3. Restores checksum-validated immutable asset/locale archives.
4. Applies the existing `patches/all` layer, followed by one assertion-backed
   `patches/switch` source patch.
5. Uses exact pnpm `10.33.2`, a persistent store, `pnpm fetch`, and a frozen
   offline install.
6. Runs the real `vite build --mode app`.
7. Overlays the complete external asset and locale trees.
8. Preserves Vite's original hashed output and creates one additional
   `switch-entry.js` from the actual module/chunk graph.
9. Packages the native bootstrap in a fat NRO and the game beside it using
   four deterministic random-access external asset packs.
10. Writes schema-2 metadata/checksums and rejects proof-of-concept-only
    packages.

The consolidated entry has no remaining JavaScript imports. It is evaluated as
an async function because the real entry contains top-level await. This avoids
assuming that nx.js can parse `index.html` or dynamically import arbitrary
SD-card ESM chunks. Original Vite chunks remain in the host-side compiled
cache for provenance and diagnosis but are not copied into the 11-file
SD-card deployment.

The only Switch source patch supplies Phaser with the physical nx.js `screen`
canvas, enables Phaser's custom-environment path, injects the Switch build
label, and records two bootstrap markers. It does not force Canvas rendering or
remove the game's WebGL/custom pipeline behavior.

## Runtime startup and offline policy

The NRO records these stages:

1. `native-bootstrap`
2. `directories-resolved`
3. `logging-initialized`
4. `manifest-opened`
5. `package-version-validated`
6. `required-files-checked`
7. `compatibility-shims-installed`
8. `compiled-entry-resolved`
9. `compiled-entry-evaluated`
10. `phaser-startup-reached`
11. `pokerogue-bootstrap-started`
12. `title-screen-or-first-blocker`

Schema 2 verifies important file sizes and SHA-256 values before evaluation.
The runtime maps build-relative, root-relative, `sdmc:`, and `file:` asset
requests into the external game root and then into indexed ranged pack reads
when the loose file is not part of the small runtime set. It allows `data:`,
`blob:`, and embedded
`romfs:` resources, blocks HTTP(S), WebSocket, protocol-relative, unsupported,
and out-of-root requests, and logs the URL plus an origin stack. It does not
turn local file loads into a blanket fetch rejection.

The deliberately narrow compatibility layer provides the Milestone 1 DOM and
screen-canvas behavior, location, local fetch mapping, external fonts,
in-memory session storage, and persistent local storage. It does not
speculatively implement IndexedDB, workers, service workers, Rex InputText,
software keyboard, or a generalized browser.

## Save path and format

The local save root is:

```text
sdmc:/switch/SilverShadow-PokeRogue/saves/
```

Milestone 2 provides a `localStorage`-compatible JSON document at
`local-storage.json`. Values remain strings and unknown keys are preserved.
Every mutation writes `local-storage.tmp.json`, rotates the valid primary to
`local-storage.backup.json`, and renames the temporary file into place. Reads
do not write. If the primary is invalid, the backup is used. Ordinary package
installation merges the saves directory and never migrates or clears it.

## Package metadata

`game/manifest.json` includes package kind, schema/platform versions,
SilverShadow and upstream versions/commits, exact nx.js/Phaser/pnpm versions,
actual and expected Node versions, timestamp, shared/Switch/build-script
hashes, compiled-input hash, original and controlled entry points, evaluation
mode, required directories/files and their important checksums, offline
policy, and active shims.

`SHA256SUMS.txt` covers every deployed file. The verifier ensures exactly one
correctly placed NRO, validates full pack hashes and exact source coverage,
checks representative random-access entries, and rejects Milestone 1
indicators, ZIP output, cache leakage, and protected user directories.

## Code-verified versus hardware-verified

Code-verified in Milestone 2:

- the exact real upstream/SilverShadow build completes;
- 14,273 JSON assets are processed;
- Vite output is converted to an 8.8 MB no-import controlled entry;
- the external package includes compiled code plus indexed images, audio,
  fonts, locales, animations, and data;
- the fat NRO, 11-file uncompressed directory, manifest, packs, and checksums
  verify;
- exact-key compiled reuse works.

Hardware-verified in the Alpha baseline:

- the real compiled entry evaluates and Phaser creates the WebGL game;
- the title screen and starter selection render at the correct 1280x720
  output size;
- D-pad and Nintendo A/B behavior work on attached controls;
- readable text renders across title, Pokédex, party, battle, and reward UIs;
- a new run can battle, catch a Pokémon, select a reward, and advance;
- Pokédex and active-session data persist after HOME and relaunch;
- Continue Run restores the session and advances to the next battle;
- existing custom cheat/sandbox behavior was reported working after a long
  reload.

These claims apply only to the returned Switch OLED handheld evidence. See
`SWITCH_ALPHA_STATUS.md` for limitations and unverified configurations.

The later indexed asset-pack layout and beta.6 ranged-read correction have
launched on the tested hardware. See
[`SWITCH_STATIC_ASSET_PACKAGING.md`](SWITCH_STATIC_ASSET_PACKAGING.md).

## Next milestones

The next branch should begin from the merged Alpha baseline and keep the
hardware-driven, one-blocker-at-a-time workflow.

The immediate proof gates are:

1. distinguish the native Plus crash from post-reload memory pressure;
2. log Phaser loader failures and stop move animations from using unregistered
   texture keys;
3. establish a minimized nx.js audio decode/playback result;
4. add a low-risk loading indicator for the 35-44 second black startup;
5. replace keyboard/Xbox controller prompts;
6. complete Wi-Fi-off, docked, controller, suspend/resume, long-session,
   software-keyboard, and deliberate error-path testing.

Do not rename the internal `milestone2-real-game` schema or timestamped
`milestone2-*.log` format as part of the maturity-label change. They identify
the proven package generation and remain the Alpha baseline.
