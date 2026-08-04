# Switch Alpha installation and hardware test

The Switch Alpha reached gameplay on a tested Switch OLED. The indexed
asset-pack layout and ranged-read compatibility fix have also launched on that
hardware. Version 2.0.0 packages the same tested runtime path for public Alpha
testing; it is not a stable or comprehensively stress-tested release.

## Requirements

- A homebrew-capable Nintendo Switch with Atmosphère and hbmenu.
- Title-override/application-memory mode. Do not use Album mode.
- A backup of the SD card.
- At least 1 GB of free SD-card space for the update and logs.

## Install

1. Back up and preserve the existing `saves/`, `config/`, and `logs/`
   directories.
2. Copy the contents of the uncompressed hardware-update folder directly to
   the SD-card root, merging folders.
3. Confirm the 15 deployment files:

   ```text
   /switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro
   /switch/SilverShadow-PokeRogue/SHA256SUMS.txt
   /switch/SilverShadow-PokeRogue/game/asset-packs.json
   /switch/SilverShadow-PokeRogue/game/assets-animations.sspack
   /switch/SilverShadow-PokeRogue/game/assets-audio.sspack
   /switch/SilverShadow-PokeRogue/game/assets-graphics.sspack
   /switch/SilverShadow-PokeRogue/game/assets-support.sspack
   /switch/SilverShadow-PokeRogue/game/index.html
   /switch/SilverShadow-PokeRogue/game/manifest.json
   /switch/SilverShadow-PokeRogue/game/version.json
   /switch/SilverShadow-PokeRogue/game/switch-entry.js
   /switch/SilverShadow-PokeRogue/licenses/Phaser-MIT.txt
   /switch/SilverShadow-PokeRogue/licenses/PokeRogue-AGPL-3.0.txt
   /switch/SilverShadow-PokeRogue/licenses/THIRD-PARTY-NOTICES.txt
   /switch/SilverShadow-PokeRogue/licenses/nx.js-MIT.txt
   ```

4. After the copy succeeds, remove only the obsolete loose paths:
   `game/assets/`, `game/audio/`, `game/battle-anims/`, `game/fonts/`,
   `game/images/`, `game/locales/`, and the six stable root files listed in
   `SWITCH_STATIC_ASSET_PACKAGING.md`. Do not delete the application directory
   and do not touch `saves/`, `config/`, or `logs/`.
5. Hold `R` while launching an installed title to enter hbmenu in title
   override mode.
6. Launch **SilverShadow PokeRogue**.

The NRO is self-contained (`nxjs-nro --fat`). The large game assets remain
external beside it and are read lazily from uncompressed indexed packs.

## Test procedure

1. Fresh-launch in title-override/application-memory mode with Wi-Fi disabled.
2. Allow at least 60 seconds for the initial loading period. The Alpha
   baseline has taken approximately 35-44 seconds to show its first asset.
   Returning to the main menu performs a similar refresh and can look frozen
   for roughly 40 seconds again.
3. Confirm the loading screen completes, then start or continue a run.
4. Verify BGM starts and loops across battles and rewards.
5. Verify UI/battle sound effects and several Pokémon cries.
6. View multiple Pokémon, including front/back, shiny, and a gender-specific
   sprite where available.
7. Use several battle moves and verify their animation textures/data.
8. Reach rewards; test immediate and targeted rewards, including Rare Candy
   and PP Up return paths.
9. Test a TM and the move-learning UI.
10. Trigger and complete an evolution.
11. Open and close the PLUS menu in a safe ordinary scene and record behavior.
12. Choose Save and Quit and allow the normal reload to complete.
13. Fully close the application with HOME/X, relaunch in title-override mode,
    and continue the saved run.
14. On a disposable copy only, rename
    `game/assets-animations.sspack` to `.disabled`, relaunch, and confirm the
    fatal message/log names the missing pack. Restore it.
15. On a disposable copy only, change byte offset 0 in
    `game/assets-support.sspack`, relaunch, and confirm the startup diagnostic
    identifies an invalid support-pack header. Restore the known-good pack.
16. Return the complete newest `logs/milestone2-*.log`.

## Alpha stability notes

- Normal gameplay has been smooth enough in the sessions tested, but many
  consecutive battles and long sessions have not been thoroughly stressed.
- Infinite/free reward rerolls and repeated Claim All Rewards use can exhaust
  native memory. A guard blocks rerolls near the dangerous threshold, but it
  does not make unlimited reward stress safe.
- Smaller loading hiccups can occur while SD-card assets are read or decoded.
- Save, fully close, and relaunch if sustained slowdown or memory pressure
  develops.

## Return evidence

Return:

- the newest `/switch/SilverShadow-PokeRogue/logs/milestone2-*.log`;
- a photo of the screen;
- the console model and firmware;
- Atmosphère, Hekate, and hbmenu versions;
- title-override title used;
- docked/handheld state and display resolution;
- controller type and connection arrangement;
- Wi-Fi enabled/disabled state;
- free SD-card space before launch;
- SD-card filesystem and allocation-unit size if known;
- whether `local-storage.json` and its backup were preserved;
- cold-boot time to the first visible asset;
- whether audio, move effects, sprites, fonts, and button prompts worked;
- whether the missing/corrupt-pack error tests were readable;
- any crash report or exception exactly as displayed;
- the last startup stage reached.

Do not include private save contents unless specifically needed after a
minimized storage failure.
