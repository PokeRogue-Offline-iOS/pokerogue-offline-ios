# Switch Milestone 2 installation and hardware test

This package attempts the real SilverShadow PokéRogue bootstrap. It is
experimental and is not claimed to be playable.

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
2. Photograph the first stable screen or exact error screen.
3. Leave the app running for at least 60 seconds if it reaches a rendered game
   screen.
4. Record whether the PokéRogue loading/title screen appears.
5. Record visible animation and image/font correctness.
6. Test attached handheld controls, then a Pro Controller if available.
7. If audio starts, record whether music/effects decode and whether volume is
   reasonable.
8. Exit with HOME. Do not rely on an in-app `+` exit.
9. Relaunch and report whether
   `saves/local-storage.json` is preserved and the log appends.
10. Temporarily rename `game` to `game-disabled`, relaunch, and confirm the
    error screen names the missing game folder and log path. Restore it.
11. Restore `game`, temporarily rename `game/switch-entry.js`, relaunch, and
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
- whether the game-folder and entry-file error tests were readable
- any crash report or exception exactly as displayed
- the last startup stage reached

Do not include private save contents unless specifically needed after a
minimized storage failure.
