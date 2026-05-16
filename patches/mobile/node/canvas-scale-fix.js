#!/usr/bin/env node
/**
 * Patch: canvas-scale-fix.js
 *
 * Injects a JavaScript scaling fix that ensures the game canvas (#app container)
 * always fits the WebView viewport correctly, regardless of device, Android version,
 * or inset handling behaviour.
 *
 * Root cause:
 *   Phaser's scale manager measures the viewport at init time, but on Android 16+
 *   with edge-to-edge enforcement, insets may not have settled yet, causing the
 *   canvas to render at the wrong size. Portrait mode is particularly affected.
 *
 * Fix:
 *   After the page loads (and on every resize/orientation change), measure the
 *   actual WebView client dimensions and CSS-transform the #app container to fit.
 *   This approach is adapted from PodarSmarty's native Android client and sidesteps
 *   Phaser's scale manager entirely for the final display scaling.
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

const MARKER = "canvas-scale-fix";

if (src.includes(MARKER)) {
  console.log("Canvas scale fix already present, skipping.");
  process.exit(0);
}

if (!src.includes("</body>")) {
  console.error("ERROR: Could not find </body> in index.html.");
  process.exit(1);
}

const SCRIPT = `
  <script id="${MARKER}">
    // Adapted from PodarSmarty's offline rogue client.
    // CSS-transforms the #app container to always fit the WebView viewport,
    // regardless of Android inset behaviour or Phaser scale manager timing.
    (function () {
      function fixScale() {
        var gameContainer = document.getElementById('app');
        if (!gameContainer) return;

        // visualViewport gives the actual visible area, excluding system UI
        // and any browser chrome. Falls back to clientWidth/Height if not available.
        var vv = window.visualViewport;
        var webViewWidth  = vv ? vv.width  : document.documentElement.clientWidth;
        var webViewHeight = vv ? vv.height : document.documentElement.clientHeight;

        var gameWidth     = gameContainer.offsetWidth;
        var gameHeight    = gameContainer.offsetHeight;
        if (!gameWidth || !gameHeight) return;

        var scaleX = webViewWidth  / gameWidth;
        var scaleY = webViewHeight / gameHeight;
        var scale  = Math.min(scaleX, scaleY);

        gameContainer.style.transform       = 'scale(' + scale + ')';
        gameContainer.style.transformOrigin = 'left top';

        // In portrait, #app height stays at 100% but canvas is shorter.
        // Shrink #app to match the canvas height so it doesn't leave empty space.
        var canvas = gameContainer.querySelector('canvas');
        if (canvas) {
          gameContainer.style.height = canvas.offsetHeight + 'px';
        }
      }

      // Run after initial render
      window.addEventListener('load', fixScale);
      // Re-run on resize and orientation change
      window.addEventListener('resize', fixScale);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', fixScale);
      }
      window.addEventListener('orientationchange', function () {
        // Small delay to let the viewport settle after rotation
        setTimeout(fixScale, 100);
      });
    })();
  </script>`;

const patched = src.replace("</body>", `${SCRIPT}\n</body>`);

if (patched === src) {
  console.error("ERROR: Replacement produced no change.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Injected canvas scale fix into ${TARGET}`);
console.log("Canvas scale fix applied successfully.");
