# Gen1Recomp Touch-Control Port

## Scope

The first pass adapted the continuous D-pad behavior from Gen1Recomp's `dev`
branch at reference commit `8e5501a`. That digital input foundation was then
hardware-tested successfully on Android: continuous sliding, center neutral,
cardinal resolution, pointer ownership, D-pad plus action input, and independent
multi-touch action buttons all worked without a known input regression.

The second pass preserves that proven input code and adds a visual-only rocking
pose plus a unified SilverShadow material for the D-pad and every existing
contextual action button. Keyboard, physical-controller, PokéRogue UI, and
gameplay logic continue to use their existing paths.

The refinement pass keeps that architecture, enlarges the moving face, makes
its rocking depth and silver outline clearer, replaces the competing stationary
cross with a subdued circular socket, and adds native-first touch haptics. The
proven chevron paths, their ratio to the face, their radial/angular fade, and
the three control-body opacity tokens are deliberately unchanged.

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
no gameplay contract or binding logic changes. A private
`silverShadowHapticHandled` marker prevents older UI navigation vibration from
doubling SilverShadow feedback; it does not change game input.

## Rocking architecture

Digital resolution remains unchanged:

```text
pointer coordinates
  -> SilverShadowTouchInputState
  -> cardinal direction or neutral
  -> existing PokéRogue input events
```

Rocking is a separate visual-only path:

```text
raw pointer coordinates
  -> calculateDpadVisualPose
  -> latest-pose requestAnimationFrame scheduler
  -> CSS custom properties
  -> transformed #dpadPivot
```

`#dpad` remains the full stable hit region. The stationary `#dpadGeometry`
wrapper is now 96% of that region and is the only visual element measured by
`getBoundingClientRect()`. Digital resolution independently retains the proven
84%-of-hit-region width, so enlarging the face does not alter its dead zone or
cardinal thresholds. Its descendants are `#dpadVisual`, a stationary
`#dpadSocket`, a translated `#dpadShadow`, and the transformed `#dpadPivot`
containing `#dpadFace`. The socket is now a low-alpha circular radial recess,
while the cross shadow, silver outline, offset highlight, cap, chevrons, and
face move with or respond to the pivot. The pivot and face are never used for
input geometry.
All decorative descendants have `pointer-events: none`.

The cross-shaped face is an inline, resolution-independent SVG. It uses a dark
charcoal base, restrained silver edge and groove, a raised center cap, and four
outward open-chevron accents. Each chevron is two slanted SVG strokes with no
inner base or fill. Diagonal finger positions may tilt both axes and illuminate
two adjacent chevrons, but still emit exactly one cardinal direction.

## Visual-pose calculation and constants

`silvershadow-dpad-visual.ts` computes distance from the stable center using
`hypot(dx, dy)`, divides it by half the visible width, and clamps the result to
0..1. Direction is the raw normalized displacement. A clamped smoothstep curve,
`t * t * (3 - 2 * t)`, maps distance to tilt, shadow displacement, and scale
compression and radial light strength. This gives near-level motion and faint
light close to center, moderate response at half radius, and the maximum pose
at the edge without overshoot outside it.

Named TypeScript constants (previous -> current refinement):

- Maximum active tilt: `6deg` -> `7.5deg` -> `8.5deg`
- Maximum digitally-neutral micro-tilt: `0.75deg` -> `0.9deg` -> `1deg`
- Maximum shadow offset: `2.5px` -> `3.25px` -> `4px`
- Maximum scale compression: `1%` -> `1.2%` -> `1.4%`
- Maximum normalized light strength: `1`
- Digitally-neutral light cap: `0.12`
- Primary cardinal light floor: `0.72`
- Secondary angular weight: `0.55`

Named CSS constants (previous -> refined where changed):

- Perspective: `460px` -> `430px`
- Active movement response: `42ms` -> `38ms`
- Release-to-level duration: `120ms` -> `115ms`
- Button press duration: `45ms`
- Button release duration: `80ms`
- Button pressed scale: `0.97`
- Button pressed translation: `1px`

CSS rotation signs are documented in the pose module: upward DOM displacement
produces positive `rotateX`, and rightward displacement produces positive
`rotateY`, so the touched arm visually sinks.

The light calculation uses the same smoothstep radial response as physical
pose. In neutral, signed horizontal and vertical components are capped at
`0.12`. Once a cardinal becomes active, it remains primary and receives a
`0.72` minimum angular floor; the adjacent signed axis uses its normalized
component times `0.55`, is capped below the primary, and never causes input.
Opposite chevrons remain zero. The four resulting 0..1 strengths feed four CSS
variables controlling a narrow core stroke and wider, low-alpha local halo.

Pointer movement only replaces the pending target pose. A frame is requested
only when none is already pending, applies tilt, scale, shadow, and all four
light variables from the newest pose, and then clears its ID. There is no idle
or permanent animation loop.

## Unified SilverShadow visual system

Shared CSS tokens define the material and timing:

- `--ss-control-idle-opacity: 0.3`
- `--ss-control-neutral-opacity: 0.4`
- `--ss-control-active-opacity: 0.58`
- `--ss-control-face` and `--ss-control-face-raised`: charcoal layers
- `--ss-control-edge`: silver alpha `0.72` -> `0.82`
- `--ss-control-edge-muted`: silver alpha `0.38` -> `0.48`
- `--ss-control-socket-edge`: stationary silver alpha `0.2`
- `--ss-control-accent`: SilverShadow red `rgba(222,45,62,0.95)` -> `rgb(240,44,62)`
- `--ss-control-shadow`: compact local shadow
- `--ss-control-label`: high-contrast label color
- shared press/release duration tokens listed above

Every existing `.apad-button` keeps its original DOM node, mapping, position,
hit region, pointer capture, and independent active class. CSS supplies a dark
translucent face, brighter silver outer and inner rings, local depth shading,
and a stronger red pressed edge plus inner lower-edge ring. Pressing a button
changes only that node's `active` class, so two
or three simultaneous buttons remain visually independent. Release of one
pointer removes its visual only when no other pointer still owns that same
button.

The existing A, B, F, R, C, G, E, N, V, information/statistics, and menu
contexts are all styled through the shared class. The visible `Menu` label is
now `Start`, while its `MENU` mapping and behavior are unchanged. Speed Up and
Slow Down are not present in the current touch DOM and are intentionally
deferred; they are the two known controls needed for the expected future
13-control set and must receive explicit mappings before being added.

## Touch haptics

The existing PokéRogue `Vibrations` setting remains the single authority. Its
Auto/Disabled choice is applied immediately through `setSetting`, persisted by
`GameData.saveSetting`, restored by `loadSettings`, and exposed at runtime as
`globalScene.enableVibration`. No second toggle or storage format is added.

`silvershadow-touch-haptics.ts` is a small fire-and-forget service. On a native
Capacitor platform it caches the official `Haptics` plugin and requests a
`LIGHT` impact. The Android workflow installs exact-compatible
`@capacitor/haptics@8.0.2` before `cap sync`. Browser builds use
`navigator.vibrate` only as a fallback: `12ms` for an accepted cardinal
transition and `16ms` for an accepted action-button press. Missing APIs,
synchronous errors, and rejected native promises are caught and can never
delay or interrupt input. The enabled setting is checked again before an
asynchronous fallback.

Haptic decisions occur after the proven state machine accepts ownership:

```text
accepted neutral -> cardinal or cardinal -> different cardinal
  -> one direction-change haptic

accepted action pointerdown
  -> one button-press haptic for that pointer
```

Exact-center capture, neutral movement, unchanged direction, return to neutral,
repeat intervals, release, cancellation, rejected pointers, lifecycle reset,
and programmatic input are silent. Every action pointer remains independent, so
simultaneous buttons receive one feedback event each without a global pressed
state. The legacy/upstream fallback binder uses the same service only after its
existing per-key lock accepts a press.

## Visuals and hit regions

The five D-pad images are the CC0 Xelu assets already used by Gen1Recomp. They
remain as fallback artwork. The primary SVG D-pad uses 30% idle, 40% captured
but digitally neutral, and 58% active opacity. Action buttons use the same 30%
idle and 58% active philosophy.

Before the proportional size follow-up, the D-pad pointer region used a full
`2 * --controls-size` square. Visible art had grown from 84% through 88% to 96%
of that square, while the resolver deliberately retained its 84% reference
ratio. Action buttons independently retain their existing 15% invisible hit
slop; their visible size is unchanged.

The size-only follow-up applies one documented `1.10` multiplier to the complete
D-pad assembly. `--ss-dpad-assembly-size` expands the previous
`2 * --controls-size` parent and stable hit region to
`2.2 * --controls-size`. The 96% geometry/fallback artwork therefore grows from
`1.92` to `2.112 * --controls-size`, while the 84% digital reference grows from
`1.68` to `1.848 * --controls-size`. Every dimension increases by exactly 10%,
so the dead-zone ratio, cardinal sectors, normalized distance-to-edge rocking,
and lighting progression are unchanged. The draggable `.control-group-dpad`
and `#dpad` both use the same size token and explicitly allow visible overflow;
saved portrait/landscape position formats are unchanged. No action-button CSS,
layout, hit region, or behavior participates in this multiplier.

To tune opacity during development, edit the three shared opacity tokens in the
SilverShadow block injected into `index.css` by
`patches/all/node/silvershadow-touch-controls.js`.

## Lifecycle and fallback

Pointer-up, pointer-cancel, and lost pointer capture release their pointer.
Document visibility loss, window blur, page hide, `InputsController.loseFocus`,
orientation change, control disablement, an overlay-visible-to-hidden
transition, configuration mode, Phaser scene shutdown, and Phaser scene
destruction release every held touch input and return the face to level.
Auto-hide clears transient visual state before fading while leaving hit regions
available for the first waking touch.

`prefers-reduced-motion: reduce` changes all visual transitions to zero
duration. Continuous chevron strengths, opacity changes, labels, pointer ownership, and
digital input remain active.

The enhanced path uses Pointer Events and pointer capture. If Pointer Events,
the expected DOM nodes, or the neutral artwork are unavailable, the enhancement
removes its CSS class and binds the preserved upstream SVG/isolated-button
listeners. If only the layered visual structure is unavailable, enhanced input
continues with the flat Gen1Recomp images and existing button visuals. The
original upstream SVG remains in `index.html` as the final fallback.

Performance is limited to local transforms and opacity: cached element
references, one coalesced animation frame for D-pad movement, no permanent
loop, no Phaser-canvas changes, no blur filter, no large shadow, no layout
animation, and button writes only when pressed state changes.

## SilverShadow patch layout

Patch order in `scripts/apply-patches.sh` is:

1. `offline-settings-navigation-fix.js`
2. `auto-hide-touch-controls.js`
3. `silvershadow-touch-controls.js`
4. `sandbox-economy-settings.js`

The touch patch copies the input, visual-pose, and haptic source modules, their
tests, an integration contract test, and five fallback images from `new-files/`, then patches
`src/touch-controls.ts`, `src/ui-inputs.ts`, `index.html`, and `index.css`. Required paths and
upstream/preceding-patch anchors are checked; missing or duplicated anchors
terminate patching with a clear error.

## License compliance

`THIRD_PARTY_NOTICES.md` contains the complete Gen1Recomp MIT notice,
BOIS CLUB GAMES copyright, Xelu/Those Awesome Guys attribution, and the CC0
public-domain artwork notice. Only the five required D-pad images were copied.

## Known differences and future work

This iteration keeps PokéRogue's existing layout editor, repeat timing,
settings, and input event contract. It does not port Gen1Recomp's launcher
editor, size range, orientation-specific scale setting, or controller-driven
overlay hiding. The browser cannot infer CSS failure reliably; therefore the
flat and upstream fallback layers remain in markup and are selected when the
rocking layer cannot initialize.

Potential later additions include explicitly mapped Speed Up and Slow Down
touch controls, directional hysteresis, per-control sizing,
richer layout customization, and expanded device/accessibility settings.
