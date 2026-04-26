#!/usr/bin/env node
/**
 * Patch: cheated-banner.js
 *
 * Injects a persistent "Unlocked" banner into the game's HTML that is visible
 * whenever the localStorage key `hasCheated` is set. Intended so that Discord
 * moderators can identify modified clients in screenshots.
 *
 * The banner is:
 *   - Non-interactive (pointer-events: none)
 *   - Semi-transparent so it does not greatly impede gameplay
 *   - Positioned mid-left over the canvas
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
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 9999;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.55);
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-left: none;
      border-radius: 0 6px 6px 0;
      padding: 6px 10px 6px 8px;
      font-family: monospace;
      font-size: 13px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.05em;
      line-height: 1.4;
      text-align: center;
      user-select: none;
    }
    #cheated-banner span {
      display: block;
      font-size: 9px;
      font-weight: normal;
      opacity: 0.7;
      letter-spacing: 0.08em;
      margin-top: 2px;
    }
  </style>
  <div id="cheated-banner">
    UNLOCKED
    <span>modified client</span>
  </div>
  <script>
    if (localStorage.getItem("hasCheated")) {
      document.getElementById("cheated-banner").style.display = "block";
    }
  </script>`;

const ANCHOR = "</body>";
if (!src.includes(ANCHOR)) {
  console.error("ERROR: Could not find </body> in index.html.");
  process.exit(1);
}

src = src.replace(ANCHOR, BANNER + "\n" + ANCHOR);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched cheated banner into ${TARGET}`);
console.log("Cheated banner applied successfully.");
