# Touch Controls Test Plan

## Automated validation

Run the ordered Android patch set against a clean upstream `main` checkout.
The patch must fail clearly if its expected imports, class boundary, D-pad HTML,
CSS anchor, auto-hide marker, helper, test, or source images are missing.

Then run from the patched PokéRogue source:

```bash
pnpm exec vitest run test/tests/system/touch-controls/silvershadow-touch-input.test.ts
pnpm exec vitest run test/tests/system/touch-controls/silvershadow-dpad-visual.test.ts
pnpm exec vitest run test/tests/system/touch-controls/silvershadow-touch-haptics.test.ts
pnpm exec vitest run test/tests/system/touch-controls/silvershadow-touch-visual-integration.test.ts
pnpm biome:ci src/system/touch-controls test/tests/system/touch-controls src/touch-controls.ts
pnpm typecheck
VITE_BYPASS_LOGIN=1 pnpm build:app
```

The pure tests cover center/dead-zone/cardinal resolution, horizontal and
vertical dominance, the equal-axis boundary, neutral-to-direction,
direction-to-direction, direction-to-neutral, duplicate moves, D-pad ownership,
up/cancel cleanup, simultaneous D-pad/action input, independent action pointers,
shared-action hold counts, and visibility-loss-style reset.

The visual-pose tests cover exact center, neutral micro-movement, continuously
increasing tilt and light, maximum clamping, outside-artwork pointers, four
cardinals, diagonal leaning and adjacent light, primary/secondary weighting,
opposite-direction exclusion, symmetry, invalid dimensions, finite normalized
output, smoothstep endpoints, cardinal-only resolver independence, no input
events from visual calculations, and monotonic response. The integration
contract checks stable 84% digital versus 96% visual geometry, frame
coalescing, four independent chevron variables, open-chevron markup, cleanup
resets, redundant artwork suppression, independent button classes,
D-pad/button coexistence, auto-hide, configuration mode, reduced motion,
fallback markup, current mappings, the Start display label, all current button
nodes, the persisted vibration setting, and duplicate-vibration suppression.
Haptic tests cover disabled no-op, cached native-first light impact, direction
and button browser durations, rejected native promises, live setting recheck,
and browser API failure. Input-state tests verify exact accepted-transition
counts and silence for neutral, repeated, rejected, release, cancel, and reset
paths.

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

## Visual-refinement Android checklist

1. Confirm the D-pad is noticeably larger and visually balanced against the
   right-side cluster in portrait and landscape.
2. Confirm the circular stationary socket stays subordinate and the moving
   cross outline, highlight, shadow, and cap make rocking easier to read.
3. Move slightly from center: expect small rocking and faint lighting with no
   game input inside neutral.
4. Move farther outward: expect stronger rocking and brighter lighting.
5. Hold at or beyond the edge: expect maximum restrained lighting and a capped
   transform.
6. Compare bright and dark scenes: resting silver outlines should be easier to
   locate on the D-pad, A/B, contextual, and utility controls.
7. Confirm the charcoal control bodies retain the previous 30% idle, 40%
   captured-neutral, and 58% active opacity philosophy.
8. Check Up, Down, Left, and Right: every open chevron must point outward in
   the correct direction.
9. Inspect each chevron: it must have two slanted sides, no fill, and no inner
   base stroke.
10. Move slowly from center outward: the relevant chevron should brighten
    progressively.
11. Move slowly back inward: the chevron should dim progressively to zero at
    exact center.
12. Hold mostly Up with some Right: Up should be strong and Right softer.
13. Hold mostly Right with some Down: Right should be strong and Down softer.
14. Move slowly across diagonal boundaries: the actual dominant cardinal must
    remain the brightest cue.
15. Confirm navigation and movement remain cardinal-only even while two visual
    chevrons are lit.
16. Confirm no accidental double navigation or diagonal key combination occurs.
17. Check every action button: the stronger red pressed edge should feel
    satisfying without becoming distracting.
18. Hold two or three buttons with the D-pad: every button visual remains
    independent while rocking and lighting continue.
19. Wait for auto-hide and exercise cancellation/lifecycle paths: no chevron,
    button glow, or tilt may remain stale.
20. Rapidly circle the D-pad while multi-button tapping: animation and gameplay
    should remain smooth.

Do not accept any change to the four open-chevron proportions or to the smooth
lighting/fading behavior while sliding; those are the hardware-approved visual
baseline for this iteration.

## Haptic Android checklist

Set `Vibrations` to Auto before starting:

1. Touch exact center and move within neutral: expect no haptic.
2. Cross from neutral into each cardinal: expect one light haptic per accepted
   cardinal, never a stream while holding or moving inside the same sector.
3. Slide directly from one cardinal to another: expect one new haptic at each
   actual dominant-axis transition.
4. Slide cardinal to neutral and release/cancel: expect no haptic.
5. Hold near a diagonal and vary only the visual lean/secondary chevron: expect
   no extra feedback until the digital cardinal changes.
6. Press every current action/context button once: A, B, Start, F, G, R, E, N,
   V, C, info/statistics, and settings-tab variants should each pulse once.
7. Hold a button through repeat behavior: expect no repeated haptic.
8. Press two and then three buttons simultaneously: expect one independent
   pulse for each accepted pointerdown; releasing one is silent and does not
   affect the others.
9. Hold D-pad plus multiple buttons: feedback counts remain independent and no
   pointer is stolen.
10. Disable `Vibrations` while the app remains open and repeat the tests:
    feedback must stop immediately without restarting. Re-enable it and verify
    feedback returns immediately.
11. Restart the app after selecting Disabled and again after selecting Auto:
    each choice must persist.
12. Exercise notification shade, app switcher, lock/unlock, rotation, lost
    capture, auto-hide, and Move Touch Controls: cleanup must be silent and the
    next genuine accepted press must work normally.

Speed Up and Slow Down are game actions but do not yet have touch DOM buttons;
they are not part of this device haptic acceptance pass.

Release or cancellation must still release input and return the face, shadow,
and all four chevrons smoothly to their zero pose.

## Action-button device checklist

9. Press every currently visible button individually; confirm the correct action and matching depressed visual.
10. Hold two buttons; both visuals and supported inputs remain active.
11. Hold three buttons; each visual state remains independent.
12. Release one of several held buttons; only that button returns to idle.
13. Hold the D-pad plus one, two, and three buttons; rocking and all pressed states coexist.
14. Slide off a button; existing pointer semantics remain unchanged and no visual sticks.
15. Cancel or lose capture; input and the pressed visual both reset.

The contextual set includes A, B, F, R, C, G, E, N, V, info/stats controls,
and Start (`MENU`). Speed Up and Slow Down are documented future controls and
are not expected in this build.

## Lifecycle, layout, and performance checklist

16. Open the notification shade while holding controls.
17. Open the app switcher while holding controls.
18. Lock and unlock the screen while holding controls.
19. Rotate orientation during or immediately after input.
20. Enter and leave Move Touch Controls; the D-pad remains level while dragging.
21. Wait for the two-second auto-hide; no tilt or glow remains.
22. Wake hidden D-pad and action controls with the first touch; that touch activates them.
23. Verify saved positions in portrait and landscape.
24. Verify translucency and labels on bright and dark scenes.
25. Rapidly circle the D-pad while multi-button tapping; look for frame drops or delayed input.

Expected throughout: no stuck direction, button, tilt, or glow; no noticeable
gameplay slowdown; cardinal indication remains clear; and controls remain
translucent and readable. Repeat with reduced motion enabled and confirm visual
states remain clear even though interpolation is immediate.

## Regression and fallback checks

- Temporarily rename the copied neutral D-pad image in a local test build.
  Confirm the original inline SVG controls become visible and usable instead
  of leaving a dead overlay.
- Confirm A/B and context-specific Start (`MENU`), Stats, cycle, and settings-tab buttons
  still appear only on their existing UI modes.
- Confirm customized portrait/landscape positions continue to load and save.
- Confirm action and D-pad hit slop does not visibly enlarge any artwork or
  make nearby controls steal common touches.

## Hardware acceptance caveat

Automated tests prove resolver and state transitions; browser/local builds prove
compilation and packaging. Only the Android device checks above validate real
multi-touch, system cancellation, visual latency, ergonomics, and WebView
pointer-capture behavior.
