# Repository instructions

- Preserve all existing Android, iOS, Windows, Linux, and macOS behavior. Keep
  platform work additive and in its existing workflow.
- Build-time patches are layered as `patches/all`, `patches/mobile`,
  `patches/android`, and `patches/switch`. Shared SilverShadow behavior belongs
  in `all`; never move Android-only behavior into `switch`.
- The authoritative Switch runtime is <https://github.com/TooTallNate/nx.js>.
  Use published packages first. The tested Milestone 1 pin is
  `@nx.js/runtime` and `@nx.js/nro` `1.0.0-beta.6`; do not replace exact pins
  with `latest` or a range.
- Switch releases must use `nxjs-nro --fat`, run without network access, and
  keep large game files outside the NRO but inside the SD-card-ready ZIP.
- Do not clone, fork, or compile nx.js unless a minimized proof demonstrates a
  missing API or native defect. Keep any runtime change isolated and suitable
  for upstream contribution.
- Never claim Phaser, PokéRogue, controller, audio, save, suspend, or hardware
  compatibility without logs from a real Switch in title-override/application
  memory mode.
- Milestone 1 commands:
  `npm --prefix switch ci`, `npm --prefix switch run check`,
  `npm --prefix switch run package`, and `npm --prefix switch run verify`.
- Android source patch validation remains
  `bash scripts/apply-patches.sh android`; Switch source patch validation is
  `bash scripts/apply-patches.sh switch`.
- Read `docs/SWITCH_PORT.md` and `docs/SWITCH_NXJS_COMPATIBILITY.md` before
  expanding the port.
