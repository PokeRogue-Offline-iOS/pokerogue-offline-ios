# Touch Controls Test Plan

## Automated validation

Run the ordered Android patch set against a clean upstream `main` checkout.
The patch must fail clearly if its expected imports, class boundary, D-pad HTML,
CSS anchor, auto-hide marker, helper, test, or source images are missing.

Then run from the patched PokéRogue source:

```bash
pnpm exec vitest run test/tests/system/touch-controls/silvershadow-touch-input.test.ts
pnpm biome:ci src/system/touch-controls/silvershadow-touch-input.ts test/tests/system/touch-controls/silvershadow-touch-input.test.ts src/touch-controls.ts
pnpm typecheck
VITE_BYPASS_LOGIN=1 pnpm build:app
```

The pure tests cover center/dead-zone/cardinal resolution, horizontal and
vertical dominance, the equal-axis boundary, neutral-to-direction,
direction-to-direction, direction-to-neutral, duplicate moves, D-pad ownership,
up/cancel cleanup, simultaneous D-pad/action input, independent action pointers,
shared-action hold counts, and visibility-loss-style reset.

## Android device setup

After a successful GitHub Actions APK build, install it on a touch-capable
Android device. Test once in portrait and once in landscape. In Settings,
confirm `Touch Controls` is Auto and use Move Touch Controls only after the
default-position tests.

## Required device behaviors

1. Wait at least two seconds with no fingers down. Confirm the overlay fades
   completely but the game canvas/layout does not jump.
2. Touch the invisible center of the D-pad. Confirm the overlay appears, no
   cursor movement occurs, and sliding outward activates the intended direction
   without lifting.
3. From center, slide to Up, Right, Down, and Left. Confirm exactly one cardinal
   direction is active and the matching pressed image appears immediately.
4. Sweep directly between directions. Confirm the previous input releases, the
   new one activates, no lift is required, and no diagonal movement occurs.
5. Slide back to center. Confirm movement stops and neutral artwork returns
   while the finger remains down.
6. Hold one direction and move within its sector. Look for duplicate cursor
   jumps beyond the normal 250 ms repeat behavior.
7. While holding the D-pad, press A and B with separate fingers. Confirm both
   actions work without cancelling or stealing the D-pad pointer.
8. Hold two action buttons simultaneously where the current screen permits
   them. Release one and confirm the other remains held.
9. Put a second finger on the D-pad while the first owns it. Confirm the second
   finger cannot change direction; after the owner lifts, confirm a new touch
   can acquire the D-pad.
10. Trigger Android's app switcher while holding a direction and an action.
    Resume and confirm no input is stuck.
11. Repeat cleanup tests with a system gesture that cancels a pointer, screen
    lock/unlock, notification shade, and orientation change.
12. Enter and leave Move Touch Controls while fingers are down. Confirm inputs
    release, configuration remains visible, saved positions still work, and
    controls resume afterward.
13. Set Touch Controls to Disabled while holding input. Confirm everything
    releases and touching the former regions does nothing.
14. Connect and use a physical controller, then use keyboard input on a desktop
    build if available. Confirm neither behavior changed.

## Regression and fallback checks

- Temporarily rename the copied neutral D-pad image in a local test build.
  Confirm the original inline SVG controls become visible and usable instead
  of leaving a dead overlay.
- Confirm A/B and context-specific Menu, Stats, cycle, and settings-tab buttons
  still appear only on their existing UI modes.
- Confirm customized portrait/landscape positions continue to load and save.
- Confirm action and D-pad hit slop does not visibly enlarge any artwork or
  make nearby controls steal common touches.

## Hardware acceptance caveat

Automated tests prove resolver and state transitions; browser/local builds prove
compilation and packaging. Only the Android device checks above validate real
multi-touch, system cancellation, visual latency, ergonomics, and WebView
pointer-capture behavior.
