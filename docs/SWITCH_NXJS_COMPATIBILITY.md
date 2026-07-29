# nx.js and Phaser compatibility record

## Resolved in the selected published runtime

- nx.js v1 uses V8, libuv, and Skia rather than QuickJS and Cairo.
- Canvas resize followed by use of the existing context has an upstream
  regression test originating in nx.js issue #318 / PR #319.
- WebGL2 on the Switch GPU was merged in PR #390 and released in v1 beta.4.
- Web Audio was released in v1 beta.4.
- Gamepad hardware identity and connect/disconnect events were released in the
  v1 beta line.
- `--fat` produces a self-contained NRO and is explicitly used here.
- beta.6 lets `Image`, `Audio`, and `Video` honor a call-time `globalThis.fetch`
  wrapper, which permits offline enforcement and custom local resolution.

## Not resolved by release notes or API presence

- Full PokéRogue behavior under the Phaser Canvas renderer.
- Phaser WebGL renderer compatibility with nx.js's WebGL2-only screen context.
- PokéRogue's custom WebGL pipelines and shaders.
- Phaser Rex InputText, BBCode, transition-image, and UI plugins.
- Vite dynamic chunk loading from `sdmc:`.
- Full local image, atlas, JSON, font, music, and sound loading.
- Gamepad mapping for docked, single Joy-Con, and Pro Controller arrangements.
- Web Audio latency, decoding coverage, suspend, and resume.
- SD-card-backed localStorage with atomic writes and recovery.
- Switch software keyboard integration.
- Long-session V8 heap, GPU texture cache, and decoded audio memory behavior.

## Upstream Phaser proof of concept

nx.js PR #317 proposed a Phaser 3.80 Canvas Breakout app and DOM shim. It was
closed without merge. Its existence is not a compatibility guarantee. The
Milestone 1 shim cites and adapts that experiment, pins Phaser 3.90.0, performs
startup checks before Phaser evaluation, and records hardware results.

## Milestone 1 hardware validation

Validated on 2026-07-29 with:

- Nintendo Switch OLED in handheld mode with attached controllers;
- Atmosphere `1.11.2`;
- Nintendo Switch system firmware `22.5.0`;
- Hekate `6.5.3`;
- `@nx.js/runtime@1.0.0-beta.6` and `@nx.js/nro@1.0.0-beta.6`;
- V8 `15.0.243` and Skia `149`;
- Phaser `3.90.0`;
- the fat/self-contained NRO from commit `a9e203a`.

The returned hardware log and photo verify:

- the embedded nx.js runtime, V8, and Skia start successfully;
- the external manifest and required-file checks pass;
- Canvas resize followed by reuse of the existing 2D context passes;
- cross-context font measurements remain stable;
- the Phaser 3.90.0 ESM module evaluates;
- the Phaser Canvas scene reaches `create()`;
- the PNG is loaded from
  `sdmc:/switch/SilverShadow-PokeRogue/game/assets/milestone1-test.png`;
- requestAnimationFrame and Phaser tweens visibly animate rotation, scale, and
  alpha;
- attached handheld controllers are detected;
- A-button presses update scene state and rendering, with 44 presses recorded
  in the returned log;
- append-only file logging records boot, diagnostics, asset loading, scene
  creation, errors, and controller events.

This validates the minimal Phaser Canvas proof of concept on the tested
hardware and software combination. It does not validate PokéRogue itself,
Phaser WebGL, custom shaders and pipelines, audio, saves, suspend/resume, or
long-session memory behavior.

Known Milestone 1 issues:

- the on-screen multiline diagnostic text overlaps under the current text
  layout;
- the screen says that `+` exits, but exit handling is not implemented yet;
- the log is append-only, so results from superseded builds remain until the
  tester deletes `logs/milestone1.log`.

Still unverified:

- boot with Wi-Fi disabled;
- the missing-game-folder error path;
- docked output;
- single Joy-Con and Pro Controller mappings;
- suspend and resume.

## Hardware result template

Return `switch/SilverShadow-PokeRogue/logs/milestone1.log` with:

- console firmware and Atmosphère version;
- whether title override was used and which installed title was held;
- controller type and connection arrangement;
- docked or handheld mode;
- Wi-Fi enabled or disabled;
- a photo of the result screen;
- whether the missing `game` folder produced the readable error screen;
- every crash screen or exception exactly as shown.

Current result:

- [x] NRO appears in hbmenu and launches.
- [x] Runtime reports nx.js `1.0.0-beta.6`.
- [x] Canvas resize/context reports PASS.
- [x] Cross-context font reports PASS.
- [x] Phaser `3.90.0` module evaluates.
- [x] Scene `create()` completes.
- [x] External checkerboard PNG is visible.
- [x] The tweens visibly animate.
- [x] A-button input changes scene state.
- [ ] Wi-Fi-off boot succeeds.
- [ ] Missing-game-folder error is readable and logged.

## Milestone 2 real-game bootstrap

Milestone 2 is code-verified but not hardware-verified. The actual
SilverShadow-patched PokéRogue `1.12.0.10` Vite graph is packaged externally
and consolidated into `game/switch-entry.js` without unresolved JavaScript
imports. The NRO validates schema-2 metadata and hashes, installs the narrow
compatibility layer, reads that external entry, and evaluates it as an async
function.

Implemented compatibility behavior:

- Milestone 1 DOM and nx.js screen-canvas adaptation;
- a source-level Phaser `canvas: globalThis.screen` handoff;
- a narrow `webgl`/`experimental-webgl` context alias to nx.js `webgl2`,
  validated through Phaser game creation and PokéRogue asset preloading on
  real hardware;
- nx.js `Video` format capability and element-method adaptation so Phaser can
  select the bundled MP4 assets;
- fixed local `location`;
- root-relative, relative, `sdmc:`, and `file:` mapping to `game/`;
- fetch-backed asynchronous `XMLHttpRequest` for Phaser's asset loader;
- explicit rejection and diagnostics for remote/unsupported/out-of-root URLs;
- external `emerald` and `pkmnems` font loading;
- recoverable SD-card-backed localStorage;
- in-memory sessionStorage;
- full staged error reporting, including a WebGL text overlay after Phaser owns
  the physical screen.

Deliberately deferred until a log requires them:

- IndexedDB;
- workers and service workers;
- native software keyboard and Rex InputText replacement;
- broad HTML form emulation;
- save import/export file picker behavior;
- renderer or shader substitutions;
- audio lifecycle work.

Unknown first hardware blocker:

- The package has not yet executed the real external entry on a Switch.
- Desktop verification cannot prove nx.js async-function evaluation, WebGL,
  custom Phaser pipelines, GPU memory, or title-screen reach.
- The authoritative next result is the last stage and full stack in
  the newest `logs/milestone2-*.log`.
