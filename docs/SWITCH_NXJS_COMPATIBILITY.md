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

- Phaser 3.90.0 boot on nx.js V8.
- Phaser Canvas renderer behavior after the V8/Skia migration.
- Phaser WebGL renderer compatibility with nx.js's WebGL2-only screen context.
- PokéRogue's custom WebGL pipelines and shaders.
- Phaser Rex InputText, BBCode, transition-image, and UI plugins.
- Vite dynamic chunk loading from `sdmc:`.
- Full local image, atlas, JSON, font, music, and sound loading.
- Gamepad mapping across paired/single Joy-Con and Pro Controller.
- Web Audio latency, decoding coverage, suspend, and resume.
- SD-card-backed localStorage with atomic writes and recovery.
- Switch software keyboard integration.
- Long-session V8 heap, GPU texture cache, and decoded audio memory behavior.

## Upstream Phaser proof of concept

nx.js PR #317 proposed a Phaser 3.80 Canvas Breakout app and DOM shim. It was
closed without merge. Its existence is not a compatibility guarantee. The
Milestone 1 shim cites and adapts that experiment, pins Phaser 3.90.0, performs
startup checks before Phaser evaluation, and records hardware results.

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

Mark each item:

- [ ] NRO appears in hbmenu with correct title.
- [ ] Runtime reports nx.js `1.0.0-beta.6`.
- [ ] Canvas resize/context reports PASS.
- [ ] Cross-context font reports PASS.
- [ ] Phaser `3.90.0` module evaluates.
- [ ] Scene `create()` completes.
- [ ] External checkerboard PNG is visible.
- [ ] The tween visibly animates.
- [ ] A-button count increments.
- [ ] Wi-Fi-off boot succeeds.
- [ ] Missing-game-folder error is readable and logged.
