# Gen1Recomp Touch-Control Port

## Scope

This first pass adapts the proven continuous D-pad behavior from Gen1Recomp's
`dev` branch at reference commit `8e5501a`. It changes only the on-screen touch
input layer. Keyboard, physical-controller, PokéRogue UI, and gameplay logic
continue to use their existing paths.

The reference files reviewed were:

- `src/core/TouchControls.lua`
- `src/ui/TouchControlsEditor.lua`
- `assets/touch/README.md`
- the neutral and four pressed D-pad PNGs under `assets/touch/`
- `LICENSE.MD`

## Existing PokéRogue architecture

PokéRogue's touch overlay is DOM-rendered on top of the Phaser canvas. The
D-pad is an inline SVG containing four independent `data-key` paths, and the
action controls are DOM `div` elements. `src/touch-controls.ts` turns their
touch/pointer events into the same Phaser game-event contract used by input
handling:

```text
DOM touch/pointer
  -> TouchControl
  -> global game events: input_down / input_up
  -> existing PokéRogue input/UI handling
```

The Move Touch Controls screen uses a Phaser overlay for configuration chrome,
but it repositions the DOM `.control-group` elements. Portrait and landscape
positions are stored separately in local storage under
`touchControlPositionsPortrait` and `touchControlPositionsLandscape`.

The existing `Touch Controls` setting stores Auto or Disabled. Control size is
derived from the CSS `--controls-size` viewport rules; opacity and hit-area size
are not user settings.

SilverShadow's existing auto-hide patch adds `auto-hidden` two seconds after the
last finger is lifted. It hides with opacity, not `display: none`, so the first
touch in an invisible control region remains hit-testable. A capture-phase
`touchstart` reveals the overlay before the control handles the same gesture.
Configuration mode stays visible.

## Adapted behavior

`silvershadow-touch-input.ts` is a pure state machine based on Gen1Recomp's
resolver and pointer ownership rules:

- One pointer owns the entire D-pad until release or cancellation.
- A center touch captures ownership while emitting no direction.
- Direction is calculated from displacement relative to the visible artwork's
  center.
- The neutral dead-zone half-size is exactly `0.16 * visible D-pad width` on
  each axis.
- Outside neutral, horizontal wins when `abs(dx) >= abs(dy)`; otherwise vertical
  wins.
- Exactly one of Up, Down, Left, or Right is emitted. There is no diagonal.
- A direction transition releases the old direction before pressing the new
  one; unchanged movement emits no transition.
- Every action pointer is tracked independently. Held counts prevent one of two
  pointers on the same action from releasing the other's hold.

The game-facing repeat interval remains PokéRogue's existing 250 ms. The
overlay continues to emit `controller_type: "keyboard"` and `isTouch: true` so
no gameplay contract or binding logic changes.

## Visuals and hit regions

The five D-pad images are the CC0 Xelu assets already used by Gen1Recomp. The
visible neutral art uses 30% opacity; an active directional image uses 55%.
Existing PokéRogue action buttons use the same 30% idle / 55% active baseline.

The D-pad pointer region keeps the existing full `2 * --controls-size` square,
while the visible art is 84% of that square. The resolver's 16% dead zone is
based on visible art width, not the larger hit region. Action buttons gain 15%
invisible hit slop on each edge through a pseudo-element; their visible size is
unchanged.

To temporarily tune opacity during development, edit the `0.3` and `0.55`
values in the SilverShadow block injected into `index.css` by
`patches/all/node/silvershadow-touch-controls.js`.

## Lifecycle and fallback

Pointer-up, pointer-cancel, and lost pointer capture release their pointer.
Document visibility loss, window blur, page hide, `InputsController.loseFocus`,
control disablement, an overlay-visible-to-hidden transition, Phaser scene
shutdown, and Phaser scene destruction release every held touch input.

The enhanced path uses Pointer Events and pointer capture. If Pointer Events,
the expected DOM nodes, or the neutral artwork are unavailable, the enhancement
removes its CSS class and binds the preserved upstream SVG/isolated-button
listeners. The original SVG remains in `index.html` as that fallback.

## SilverShadow patch layout

Patch order in `scripts/apply-patches.sh` is:

1. `offline-settings-navigation-fix.js`
2. `auto-hide-touch-controls.js`
3. `silvershadow-touch-controls.js`
4. `sandbox-economy-settings.js`

The new touch patch copies the pure source module, its test, and five images
from `new-files/`, then patches `src/touch-controls.ts`, `index.html`, and
`index.css`. Required paths and upstream/preceding-patch anchors are checked;
missing or duplicated anchors terminate patching with a clear error.

## License compliance

`THIRD_PARTY_NOTICES.md` contains the complete Gen1Recomp MIT notice,
BOIS CLUB GAMES copyright, Xelu/Those Awesome Guys attribution, and the CC0
public-domain artwork notice. Only the five required D-pad images were copied.

## Known differences and future work

This baseline keeps PokéRogue's existing action-button art, layout editor,
repeat timing, settings, and input event contract. It does not port
Gen1Recomp's launcher editor, size range, orientation-specific scale setting,
START/SELECT art, or controller-driven overlay hiding.

Potential later additions include optional haptics, directional hysteresis,
custom SilverShadow artwork, pressed animations, per-control sizing, richer
layout customization, and expanded device/accessibility settings. Those are
intentionally excluded until this pointer/lifecycle baseline is hardware-tested.
