# Nintendo Switch Alpha status

## Baseline

The Nintendo Switch port entered **Alpha** on 2026-07-29. This means the real
SilverShadow PokéRogue Offline game can boot and reach sustained gameplay on
real hardware, but important compatibility defects remain. It is not a stable
release and should not be distributed as a finished port.

The Alpha baseline uses:

- SilverShadow PokéRogue Offline `1.12.0.10`;
- upstream PokéRogue commit
  `0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4`;
- Phaser `3.90.0`;
- `@nx.js/runtime@1.0.0-beta.6`;
- `@nx.js/nro@1.0.0-beta.6`;
- the fat/self-contained NRO plus external SD-card game payload;
- Switch implementation commit `77ba54b` before the Alpha documentation
  handoff.

The internal manifest value `milestone2-real-game`, `milestone2-*.log` names,
and Milestone 2 artifact filenames are intentionally retained. They identify
the package/schema generation and should not be renamed merely because the
project maturity is now Alpha.

## Hardware test environment

Evidence was returned from a Nintendo Switch OLED in handheld mode with
attached controls and title-override/application memory. The exact firmware,
Atmosphère, Hekate, hbmenu, Wi-Fi, and SD-card filesystem details were not
recorded in the returned evidence and remain unknown.

Every hardware statement below is limited to that tested configuration.

## Hardware-verified behavior

The following behavior was observed on the real Switch:

- The fat NRO appears in hbmenu and launches.
- The external game package passes manifest and required-file validation.
- The real consolidated Vite entry evaluates under nx.js.
- Phaser creates a WebGL game using the nx.js WebGL2 context.
- The title screen, starter selection, Pokédex, battles, reward screen, party
  screen, and menus render.
- The logical 1920x1080 game is scaled to the physical 1280x720 framebuffer
  without the former bottom-left clipping.
- Text is readable after the TextMetrics fallback.
- Attached-control D-pad navigation works.
- Physical Nintendo A and B behavior is correct after selecting the built-in
  Pro Controller mapping.
- Plus can open and close the in-game menu in some scenes, but is not reliable
  enough to be considered verified; see known bugs.
- A new run can select a starter, attack, throw Poké Balls, catch a Pokémon,
  reach rewards, and advance to later encounters.
- A caught Spearow appeared in the Pokédex after exiting with HOME and
  relaunching.
- An active run appeared as Continue Run after relaunch.
- Loading that saved session reported success and advanced into the next
  battle.
- The `item-count` bitmap font no longer blocks session continuation after the
  5x Poké Ball reward path.
- The tester enabled the existing custom cheat/sandbox options and reported
  that they worked after the game completed a long in-process reload. A
  per-option verification matrix was not recorded.
- Timestamped logs are created for each launch, so old logs do not need to be
  deleted.

## Resolved compatibility blockers

Hardware testing exposed blockers one at a time. The branch resolves the
following:

| Symptom or blocker | Resolution | Commit |
| --- | --- | --- |
| nx.js `FontFace.load()` path reports an unimplemented method | Register already-decoded local font buffers without calling the unsupported method | `0a697b6` |
| V8 rejects two Unicode-property regular expressions in the consolidated entry | Assertion-backed build rewrite to ASCII-equivalent case-splitting expressions | `abf4cef` |
| Every launch overwrites `milestone2.log` | UTC timestamp in each hardware log filename | `abf4cef` |
| `MutationObserver is not defined` | Guard the optional touch-control observer and provide the required module-preload hint | `a79cbd6` |
| Game-created `FontFace` rejects URL strings because nx.js requires an `ArrayBuffer` | Resolve local font URLs inside the game directory and construct the native font from bytes | `6ab154b` |
| `document.getElementsByTagName is not a function` | Add narrow DOM tree tag lookup | `f772d28` |
| Phaser reports `WebGL unsupported` | Map Phaser's WebGL1 context request to the nx.js WebGL2 context | `8562a3b` |
| Phaser cannot select or inspect bundled video elements | Add the required video capability and element methods | `48f7bf5` |
| Phaser asset loads cannot use browser `XMLHttpRequest` | Add an asynchronous fetch-backed XHR facade routed to SD-card files | `e0001bb` |
| nx.js native `AudioListener` getter throws an unimplemented-method error | Install a no-spatialization listener facade so startup can continue | `a76129a` |
| PokéRogue UI transitions require fuller `classList` behavior | Add stateful class-list operations | `25afee2` |
| UI theme initialization requires CSS custom-property APIs | Add the required CSS declaration methods and proxy behavior | `77b64fe` |
| UI mode state requires `dataset` behavior | Add the dataset surface used by PokéRogue | `6e1b0a4` |
| Only the bottom-left of the logical game is visible | Scale default-framebuffer viewport/scissor calls from 1920x1080 to 1280x720 while preserving offscreen targets | `6e9118f` |
| Text is fragmented because nx.js reports zero ascent/descent metrics | Return width-only fallback metrics so Phaser uses its pixel scan | `fd3ad56` |
| A/B use Xbox semantics | Present the controller identity that selects PokéRogue's Pro Controller profile | `fd3ad56` |
| Plus immediately exits instead of reaching the game menu | Cancel the nx.js default exit request so the game can receive Plus; still unstable in one later hardware case | `fd3ad56` |
| `Invalid BitmapText key: item-count` stalls reward/session loading | Add the XML DOM subset Phaser needs to parse the bitmap-font metadata | `77ba54b` |

The branch also adds reproducible pinned builds, exact caches, offline asset
routing, schema/checksum validation, an atomic SD-card localStorage document
with backup recovery, build verification, and a changed-files-only hardware
iteration workflow.

## Known Alpha bugs

### Native crash after Plus

Plus worked in earlier screens, but pressing it during a later rival battle
produced a Switch software crash. The final JavaScript log line was:

```text
2026-07-29T21:57:08.121Z [INFO] Intercepted Plus-button exit request for game input
```

There was no JavaScript exception or rejection after that line. The current
evidence cannot distinguish an nx.js Plus/exit conflict from native memory
pressure after an expensive in-process reload. Plus must be considered unsafe
until memory snapshots and native-boundary diagnostics are added.

### Battle animations use missing textures

Move effects such as Ember and Growl can render as black and bright-green
rectangles with a diagonal split. Those colors and geometry match Phaser's
built-in `__MISSING` texture. The animation PNG requests appear in the log, but
the corresponding texture is not registered when the animation sprite uses
it. The next investigation should record Phaser loader errors and verify each
animation texture key before playback.

### Audio is silent

No music or sound effects were audible in the hardware test. The current audio
shim only bypasses the unsupported native spatial-listener API so the game can
start. It does not establish working decode, playback, mixer, or lifecycle
behavior.

### Slow black-screen startup and reload

Cold startup takes approximately 35-44 seconds before the first visible game
asset. Enabling many settings/cheats caused another long in-process reload that
eventually completed. There is no loading indicator, so a slow load resembles
a freeze.

### Incorrect controller prompt artwork

Physical controls work, but some on-screen prompts still use keyboard or
Xbox-style artwork instead of Switch A/B/Plus/Minus labels.

### Post-WebGL fatal screens may remain black

The timestamped log is authoritative after Phaser owns the physical WebGL
screen. Attempts to draw a second fatal screen after WebGL startup were not
reliable and were deliberately not expanded further during this milestone.

### Expected blocked-network errors are noisy

Offline update checks and localhost title-stat requests are intentionally
blocked and may appear as `ERROR` entries. They did not stop the tested
gameplay and should be distinguished from fatal errors.

## Not yet verified

- Wi-Fi-disabled cold boot.
- Docked output and resolution changes.
- Detached Joy-Con and Pro Controller configurations.
- Suspend/resume, sleep/wake, and controller reconnection.
- Long-session memory stability.
- Repeated settings-driven game reloads.
- Safe Plus behavior in every UI and battle state.
- Audio decoding/playback and audio lifecycle.
- Correct playback of all battle and encounter animations.
- Save import/export and native file-picker flows.
- Native software keyboard and text-entry flows.
- Deliberate missing-game-folder and missing-entry error tests.
- Daily runs or any feature that normally benefits from a network service.
- Every custom cheat/sandbox option individually.

## Path forward

Continue from a new branch based on the merged Alpha baseline. Keep fixes
small and driven by the first reproducible failure.

Recommended order:

1. Add memory snapshots at game-ready, settings reload, animation loading, and
   Plus interception; add a last-gasp native-boundary marker.
2. Add Phaser loader-error logging and wait for required animation texture
   keys before playback.
3. Reproduce the rival-battle Plus failure without first enabling all cheats
   to separate input handling from memory pressure.
4. Repair audio with a minimized nx.js decode/playback test before changing
   PokéRogue audio code.
5. Add an early loading indicator without touching the WebGL-owned fatal
   screen.
6. Replace keyboard/Xbox prompt artwork with Switch-specific prompts.
7. Run the unverified lifecycle, controller, offline, and error-path matrix.

For every hardware iteration, keep delivering only files that changed. Never
replace the whole external game tree unless its compiled entry or assets
actually changed, and never overwrite `saves/`.
