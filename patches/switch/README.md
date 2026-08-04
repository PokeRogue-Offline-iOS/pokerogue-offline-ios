# Switch patch layer

Switch-specific PokéRogue source patches belong here. Prefer `node/` scripts for
targeted, assertion-backed transformations and `patch/` for stable source diffs.

The Alpha baseline still applies one narrow PokéRogue source patch:

- `nxjs-bootstrap.js` supplies Phaser with the physical nx.js `screen` canvas,
  enables Phaser's custom-environment path, injects the Switch build label, and
  guards SilverShadow's optional auto-hide `MutationObserver` for nx.js. The
  observer anchors intentionally target the lifecycle-owned
  `this.autoHideObserver` produced by the ordered shared touch-control patch.

All local URL mapping, persistent storage, offline enforcement, and diagnostics
remain in the Switch runtime under `switch/src/`. That runtime now also contains
the hardware-driven WebGL2, DOM, font, XHR, controller, framebuffer, and
bitmap-font compatibility shims.

Add further source patches only after a hardware log identifies a specific
compatibility blocker. See `docs/SWITCH_ALPHA_STATUS.md` for the tested Alpha
baseline, known bugs, and the next diagnostic order.
