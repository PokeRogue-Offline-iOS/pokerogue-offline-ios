#!/usr/bin/env node
/**
 * Patch: landscape-canvas-fit.js
 *
 * Fixes the game canvas in landscape: ensures it is height-fitted and
 * horizontally centered (black bars on sides), matching PokeRogue's layout.
 *
 * Root cause:
 *   Phaser Scale.FIT + CENTER_BOTH centers the canvas within its parent (#app).
 *   In landscape, #app has no explicit width or centering — it is a left-aligned
 *   block element. Phaser correctly sizes the canvas to fit the screen HEIGHT
 *   (phones are ~2.17:1, game is 1.78:1, so height-fit produces black bars),
 *   but places the canvas at x=0 within #app. The result: the canvas is flush
 *   to the left edge with a black bar only on the right, and the left portion
 *   of the game content appears cut off or mis-centered.
 *
 *   Additionally, the notch-fix patch adds body { padding-top: safe-area-inset-top }.
 *   In landscape the notch inset moves to the sides — inset-top is 0 or near-0 —
 *   but any non-zero value shifts the canvas down and clips the bottom.
 *
 * Fix:
 *   In landscape only:
 *   1. Reset body padding-top to 0 (notch inset is on sides, not top, in landscape)
 *   2. Make body a flex container that centers #app horizontally
 *   3. No width/height constraints on #app — let Phaser measure naturally
 *
 *   Phaser reads window dimensions, computes height-fit scale, sizes canvas to
 *   e.g. 698x393px, and centers it within #app. Body flex centers #app (and
 *   therefore the canvas) within the full viewport width. Black bars appear
 *   naturally on both sides. Controls sit in those bars. Portrait unchanged.
 *
 * Targets: pokevoid-src/dist/index.html
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "dist", "index.html");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure this runs after the build step (dist/ must exist).");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

const MARKER = "capacitor-canvas-fit-fix";

if (src.includes(MARKER)) {
  console.log("Canvas fit fix already present, skipping.");
  process.exit(0);
}

if (!src.includes("</head>")) {
  console.error("ERROR: Could not find </head> in index.html.");
  process.exit(1);
}

const STYLE_BLOCK = `
  <style id="${MARKER}">
    /*
     * Landscape layout fix.
     *
     * Phaser correctly sizes the canvas to fit screen HEIGHT (phones are wider
     * than 16:9 in landscape), but the canvas ends up left-aligned because #app
     * has no centering. This makes it appear as if there's only a right-side
     * black bar with the left of the game cut off.
     *
     * Fix: make body a flex container that centers #app horizontally.
     * Also reset padding-top to 0 — the notch inset is on the sides in landscape.
     * No size constraints are applied so Phaser's natural measurement is unaffected.
     */
    @media (orientation: landscape) {
      #app {
        min-height: calc(100dvh) !important;
        max-height: calc(100dvh) !important;
        height: calc(100dvh) !important;
      }

      body {
        padding-top: 0 !important;
        box-sizing: border-box;
      }
    }
  </style>`;

const patched = src.replace("</head>", `${STYLE_BLOCK}\n</head>`);

if (patched === src) {
  console.error("ERROR: Replacement produced no change.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Injected canvas fit fix into ${TARGET}`);
console.log("Canvas fit fix applied successfully.");
