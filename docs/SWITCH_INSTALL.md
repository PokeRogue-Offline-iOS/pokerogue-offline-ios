# Switch Milestone 1 installation

This package is an experimental Phaser/runtime proof, not the full game.

## Requirements

- A homebrew-capable Nintendo Switch.
- Atmosphère and hbmenu.
- Title-override/application-memory mode. Do not use Album-mode for this test.
- A backup of the SD card before testing experimental homebrew.

## Install

1. Download `SilverShadow-PokeRogue-Switch-Milestone1.zip`.
2. Extract the ZIP to the root of the SD card. Keep its directories intact.
3. Confirm this file exists:
   `/switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro`.
4. Confirm the adjacent `game/manifest.json` and
   `game/assets/milestone1-test.png` files exist.
5. Put the SD card back in the Switch.
6. Hold `R` while launching an installed game to enter hbmenu in title
   override mode.
7. Launch **SilverShadow PokeRogue**.

No separate nx.js runtime is required. The NRO is built with `--fat`.

## Expected screen

The screen should show nx.js, V8, and Phaser versions, two Canvas diagnostic
results, the external checkerboard PNG, an animated rectangle, and controller
status. Press A and confirm the counter increments.

Then disable Wi-Fi and repeat. Finally, temporarily rename `game` to
`game-disabled`, relaunch, and confirm a readable missing-files error appears.
Restore the directory name afterward.

## Return test evidence

Copy
`/switch/SilverShadow-PokeRogue/logs/milestone1.log` from the SD card and
return it with a photo of the screen. See
`docs/SWITCH_NXJS_COMPATIBILITY.md` for the complete checklist.

The `saves/` directory is reserved for later milestones. Future updates must
not delete it.
