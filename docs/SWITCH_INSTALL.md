# Switch Alpha installation and hardware test

This Alpha package boots the real SilverShadow PokéRogue application and has
reached gameplay on a tested Switch OLED. It remains experimental: audio is
silent, some move animations show missing textures, startup is slow, and Plus
is not yet safe in every scene.

## Requirements

- A homebrew-capable Nintendo Switch with Atmosphère and hbmenu.
- Title-override/application-memory mode. Do not use Album mode.
- A backup of the SD card.
- At least 1 GB of free SD-card space for extraction and logs.

## Install

1. Preserve any existing
   `/switch/SilverShadow-PokeRogue/saves/` directory.
2. Extract `SilverShadow-PokeRogue-Switch-Milestone2.zip` to the SD-card root,
   merging folders without deleting `saves/`.
3. Confirm:

   ```text
   /switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro
   /switch/SilverShadow-PokeRogue/SHA256SUMS.txt
   /switch/SilverShadow-PokeRogue/game/index.html
   /switch/SilverShadow-PokeRogue/game/manifest.json
   /switch/SilverShadow-PokeRogue/game/version.json
   /switch/SilverShadow-PokeRogue/game/switch-entry.js
   /switch/SilverShadow-PokeRogue/game/assets/
   /switch/SilverShadow-PokeRogue/game/audio/
   /switch/SilverShadow-PokeRogue/game/fonts/
   /switch/SilverShadow-PokeRogue/game/images/
   /switch/SilverShadow-PokeRogue/game/locales/
   /switch/SilverShadow-PokeRogue/logs/
   /switch/SilverShadow-PokeRogue/saves/
   ```

4. Hold `R` while launching an installed title to enter hbmenu in title
   override mode.
5. Launch **SilverShadow PokeRogue**.

The NRO is self-contained (`nxjs-nro --fat`). The large game is deliberately
external beside it.

## Test procedure

1. First boot with Wi-Fi disabled.
2. Allow at least 60 seconds for the initial black loading period. The Alpha
   baseline has taken approximately 35-44 seconds to show its first asset.
3. Photograph the first stable screen or exact error screen.
4. Record visible animation, image, text, and controller-prompt correctness.
5. Test attached handheld controls, then a Pro Controller if available.
6. Record whether music and sound effects are audible. Alpha hardware evidence
   currently reports silence.
7. Do not use Plus as the normal exit path. It opened the game menu in earlier
   tests but caused one native crash during a rival battle. Exit with HOME.
8. Relaunch and report whether `saves/local-storage.json`, Pokédex data, and
   Continue Run are preserved.
9. Continue the saved run and confirm it reaches the next interactive battle
   screen rather than stopping at the session-loaded message.
10. Record any black/green move-effect rectangles; these are currently
    suspected missing animation textures.
11. Temporarily rename `game` to `game-disabled`, relaunch, and confirm the
    error screen names the missing game folder and log path. Restore it.
12. Restore `game`, temporarily rename `game/switch-entry.js`, relaunch, and
    confirm the precise missing-file/checksum error. Restore it.

## Return evidence

Return:

- the newest `/switch/SilverShadow-PokeRogue/logs/milestone2-*.log`
- a photo of the screen
- the console model and firmware
- Atmosphère, Hekate, and hbmenu versions
- title-override title used
- docked/handheld state and display resolution
- controller type and connection arrangement
- Wi-Fi enabled/disabled state
- free SD-card space before launch
- SD-card filesystem and allocation-unit size if known
- whether `local-storage.json` and its backup were created
- cold-boot time to the first visible asset
- whether audio, move effects, and Switch-specific button prompts worked
- whether the game-folder and entry-file error tests were readable
- any crash report or exception exactly as displayed
- the last startup stage reached

Do not include private save contents unless specifically needed after a
minimized storage failure.
