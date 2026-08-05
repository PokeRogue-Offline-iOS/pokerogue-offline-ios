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
- The NRO uses the SilverShadow custom Homebrew Menu icon.
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
- BGM playback and looping work during tested battles and reward screens.
- Immediate and targeted rewards, including return from Pokémon or move
  selection, work in the accepted reward-fix build.
- The indexed four-pack asset layout launches after calibrating beta.6's
  hardware-observed exclusive ranged-read end behavior.
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
| Plus immediately exits instead of reaching the game menu | Cancel the nx.js default exit request so the game can receive Plus | `fd3ad56` |
| `Invalid BitmapText key: item-count` stalls reward/session loading | Add the XML DOM subset Phaser needs to parse the bitmap-font metadata | `77ba54b` |

The branch also adds reproducible pinned builds, exact caches, offline asset
routing, schema/checksum validation, an atomic SD-card localStorage document
with backup recovery, build verification, and a changed-files-only hardware
iteration workflow.

## Known Alpha bugs

### Native crash with inconclusive trigger

An earlier crash happened after Plus was pressed during a later rival battle.
The final JavaScript log line was:

```text
2026-07-29T21:57:08.121Z [INFO] Intercepted Plus-button exit request for game input
```

There was no JavaScript exception or rejection after that line. A follow-up
August 2 capture also ended after the Plus interception, but the game had
already appeared frozen to the player. Its final snapshot still had about
640 MiB of native memory free, used 220.75 MiB of the 512 MiB V8 heap, retained
one native context and no detached contexts, and reported a healthy WebGL
context. The Atmosphere report was an instruction abort in `hbloader`, not an
in-app JavaScript out-of-memory error. These captures therefore prove neither
Plus nor memory exhaustion as the cause. Plus remains mapped to the in-game
input and is not disabled or repurposed; further diagnosis needs a reproduction
whose log continues through the first visible freeze.

### Battle animations use missing textures

Move effects such as Ember and Growl can render as black and bright-green
rectangles with a diagonal split. Those colors and geometry match Phaser's
built-in `__MISSING` texture. The animation PNG requests appear in the log, but
the corresponding texture is not registered when the animation sprite uses
it. The next investigation should record Phaser loader errors and verify each
animation texture key before playback.

### Audio and long-session lifecycle are not exhaustive

BGM playback and looping now work in tested gameplay. Sound-effect, cry,
suspend/resume, device-change, and very long-session audio behavior have not
been exhaustively tested across all content and hardware arrangements.

An August 2, 2026 application-mode run reached wave 8 before Atmosphere
reported `2162-0004` (the fatal report itself was wrapped as `2345-0008`). The
game log showed native usage rising from about 316 MiB at bootstrap to 2.59 GiB
and V8 external memory reaching about 418 MiB immediately after the rival
encounter BGM loaded. The crash occurred while the battle BGM was beginning to
replace it; there was no JavaScript exception and the rival dialogue is not a
demonstrated cause.

The next build caps the nx.js/Skia GPU resource cache at 256 MiB instead of the
512 MiB application default, releases completed SD-card XHR bodies as soon as
Phaser has populated its cache, and destroys a non-fading previous BGM before
the replacement starts decoding. These are evidence-driven mitigations, not
yet hardware verification of long-session stability.

### Slow black-screen startup and reload

Cold startup takes approximately 35-45 seconds before the first visible game
asset. Returning to the main menu performs a similar refresh that can again
take roughly 40 seconds. Smaller loading hiccups also occur. There is no
reliable early loading indicator, so a slow load resembles a freeze.

### Reward-cheat native memory pressure

Normal gameplay has been smooth enough to continue testing, but many
back-to-back battles and long sessions have not been comprehensively stressed.
Repeated infinite/free rerolls or extreme Claim All Rewards use can exhaust
native memory. The reward UI now reuses its option objects, delays a repeat
reroll under pressure, and blocks an individual reroll at 2600 MiB native use.
The guard rechecks instead of permanently latching, so a later collection can
restore the action. Unlimited reward stress is still not considered safe.

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
- Complete sound-effect, cry, suspend/resume, and long-session audio coverage.
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

1. Re-run the August 2 route through the first rival battle and continue across
   multiple biome/BGM transitions. Confirm each loader batch reports released
   response bodies, non-fading BGM destruction precedes the next load, and the
   post-collection native/external baseline does not trend upward each wave.
2. Stress normal rewards and moderate rerolls separately; confirm the reroll
   guard can recover after pressure drops and does not block the first reroll
   at the former 2250 MiB threshold.
3. Add Phaser loader-error logging and wait for required animation texture
   keys before playback.
4. Reproduce the long-session freeze while preserving logs from before the
   first visible stall through the native failure, and record any input only as
   timeline context rather than assuming it was the trigger.
5. Add an early loading indicator without touching the WebGL-owned fatal
   screen.
6. Replace keyboard/Xbox prompt artwork with Switch-specific prompts.
7. Run the unverified lifecycle, controller, offline, and error-path matrix.

For every hardware iteration, keep delivering only files that changed. Never
replace the whole external game tree unless its compiled entry or assets
actually changed, and never overwrite `saves/`.
