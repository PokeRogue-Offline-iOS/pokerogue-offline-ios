#!/usr/bin/env node
/**
 * Patch: keyboard-resize-css-fix.js
 *
 * Prevents the game canvas from shrinking when the Android soft keyboard opens,
 * by locking html and body to the initial viewport dimensions via CSS.
 *
 * Root cause:
 *   Even with windowSoftInputMode="adjustNothing" (manifest patch) and
 *   interactive-widget=resizes-visual (viewport meta patch), some older
 *   Android/Chrome versions still fire a window "resize" event when the soft
 *   keyboard opens. If the Phaser scale manager responds to this event it will
 *   re-measure the window and shrink the canvas to fit the reduced height.
 *
 * Fix (two layers injected into dist/index.html):
 *
 *   1. CSS — lock html + body to 100dvh / overflow:hidden / position:fixed
 *      so there is literally no space for the layout to reflow into when the
 *      keyboard appears. `dvh` (dynamic viewport height) is intentional here:
 *      we want the value captured at load time, before any keyboard interaction.
 *
 *   2. JS — intercept resize events during the capture phase (before Phaser
 *      sees them). If the new innerHeight is smaller than the original height
 *      but the width is unchanged, we assume a keyboard open caused it and
 *      suppress the event so Phaser never re-scales.
 *
 * Must run AFTER the PokeRogue build step (dist/index.html must exist).
 *
 * Targets: pokerogue-src/dist/index.html
 */

const fs   = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "dist", "index.html");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure this runs after the build step (dist/ must exist).");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

const MARKER = "keyboard-resize-css-fix";

if (src.includes(MARKER)) {
  console.log("Keyboard resize CSS fix already present, skipping.");
  process.exit(0);
}

if (!src.includes("</head>")) {
  console.error("ERROR: Could not find </head> in index.html.");
  process.exit(1);
}

// ── Injected block ────────────────────────────────────────────────────────────

const INJECT = `
  <!-- ${MARKER}: prevent layout reflow when the Android soft keyboard opens -->
  <style id="${MARKER}-style">
    /*
     * Lock the root elements to the full viewport so there is no room for the
     * layout to compress when the keyboard is shown. overflow:hidden +
     * position:fixed together stop any scroll/resize reflow from propagating
     * into the Phaser canvas container.
     *
     * position:fixed on html/body is safe here because PokeRogue renders
     * entirely within a Phaser canvas — there is no native document scroll.
     */
    html, body {
      width: 100%;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
      position: fixed;
      top: 0;
      left: 0;
    }
  </style>
  <script id="${MARKER}-script">
    /*
     * Intercept resize events in the capture phase (before Phaser's listeners)
     * and suppress those that look like a keyboard open: height decreased while
     * width stayed the same. Orientation changes (both dimensions change) and
     * true window resizes are allowed through normally.
     */
    (function () {
      var _w = window.innerWidth;
      var _h = window.innerHeight;

      window.addEventListener("resize", function (e) {
        var newW = window.innerWidth;
        var newH = window.innerHeight;

        if (newW === _w && newH < _h) {
          // Height shrank, width unchanged → keyboard opened. Block the event.
          e.stopImmediatePropagation();
          return;
        }

        // Genuine resize (orientation change, browser chrome toggle, etc.) —
        // update our baseline and let the event propagate normally.
        _w = newW;
        _h = newH;
      }, true /* capture phase */);
    })();
  </script>`;

const patched = src.replace("</head>", `${INJECT}\n</head>`);

if (patched === src) {
  console.error("ERROR: Replacement produced no change.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Injected keyboard resize CSS+JS fix into ${TARGET}`);
console.log("Keyboard resize CSS fix applied successfully.");
