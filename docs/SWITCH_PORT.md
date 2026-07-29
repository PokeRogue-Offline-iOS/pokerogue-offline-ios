# Nintendo Switch port

## Status

This branch implements Milestone 0 and a hardware-validated Milestone 1 proof
of concept. A minimal Phaser 3.90.0 Canvas scene, local PNG loading, animation,
and handheld controller input run successfully on the tested Switch OLED
configuration. This result does not claim that PokéRogue, Phaser WebGL, audio,
storage, or lifecycle behavior works on Switch.

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

## Next milestones

The returned Milestone 1 log confirms:

- exact nx.js version and V8 startup;
- both Canvas diagnostics;
- Phaser module evaluation and scene `create()`;
- external PNG decode through the Phaser loader;
- visible tween/requestAnimationFrame behavior;
- attached handheld controller A-button input.

Boot with Wi-Fi disabled and the missing-game-folder error path remain
unverified Milestone 1 checks. They should be completed alongside, but do not
block starting, the first Milestone 2 integration work.

Milestone 2 will then build the patched PokéRogue source, create a local URL
resolver for Vite chunks and assets, disable API/update code, and attempt the
title screen. WebGL is a separate proof gate; Canvas success alone is not
enough.
