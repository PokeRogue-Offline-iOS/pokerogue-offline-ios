#!/usr/bin/env node
/**
 * Patch: cheated-banner.js
 *
 * Injects a persistent "UNLOCKED" banner into the game's HTML that is visible
 * whenever the localStorage key `hasCheated` is set. Intended so that Discord
 * moderators can identify modified clients in screenshots.
 *
 * The banner is:
 *   - Non-interactive (pointer-events: none)
 *   - Confined to the game canvas bounds (not the full device screen)
 *   - Text written top-to-bottom using writing-mode: vertical-rl
 *   - Repositioned on window resize to stay aligned with the canvas
 *   - Cleared automatically when localStorage is cleared (Full Reset)
 *
 * Targets: pokerogue-src/index.html
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "index.html");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("cheated-banner")) {
  console.log("Cheated banner already present, skipping.");
  process.exit(0);
}

const BANNER = `
  <!-- cheated-banner: show persistent overlay when hasCheated is set in localStorage -->
  <style>
    #cheated-banner {
      display: none;
      position: fixed;
      z-index: 9999;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.55);
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-left: none;
      border-radius: 0 6px 6px 0;
      padding: 8px 6px;
      font-family: monospace;
      font-size: 25px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.15em;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      user-select: none;
    }
  </style>
  <div id="cheated-banner">UNLOCKED</div>
  <script>
    (function () {
      if (!localStorage.getItem("hasCheated")) return;

      var banner = document.getElementById("cheated-banner");
      banner.style.display = "block";

      function position() {
        banner.style.left = "0px";
        banner.style.top = "25%";
      }

      // Wait for Phaser to create the canvas, then position
      var interval = setInterval(function () {
        if (document.querySelector("#app canvas")) {
          clearInterval(interval);
          position();
        }
      }, 100);

      window.addEventListener("resize", position);
    })();
  </script>`;

const ANCHOR = '<div id="app">';
if (!src.includes(ANCHOR)) {
  console.error("ERROR: Could not find </body> in index.html.");
  process.exit(1);
}

src = src.replace(ANCHOR,  ANCHOR + BANNER);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched cheated banner into ${TARGET}`);
console.log("Cheated banner applied successfully.");
