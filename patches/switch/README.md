# Switch patch layer

Switch-specific PokéRogue source patches belong here. Prefer `node/` scripts for
targeted, assertion-backed transformations and `patch/` for stable source diffs.

Milestone 2 applies one narrow source patch:

- `nxjs-bootstrap.js` supplies Phaser with the physical nx.js `screen` canvas,
  enables Phaser's custom-environment path, and injects the Switch build label.

All local URL mapping, persistent storage, offline enforcement, and diagnostics
remain in the Switch runtime. Add further source patches only after a hardware
log identifies a specific compatibility blocker.
