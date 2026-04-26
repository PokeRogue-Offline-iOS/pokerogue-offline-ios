#!/usr/bin/env node
/**
 * Patch: capacitor-browser.js
 *
 * Fixes external links (Discord, Wiki, community URLs) in Capacitor native builds.
 *
 * Problem:
 *   In a Capacitor WebView, window.open(..., "_blank") tries to open a new
 *   window, which the WebView can't do — so it's silently dropped.
 *
 * Solution:
 *   Override window.open on native platforms to set location.href instead.
 *   Capacitor's Android bridge (BridgeWebViewClient.shouldOverrideUrlLoading)
 *   and iOS bridge both intercept navigation to external URLs and fire
 *   Intent.ACTION_VIEW / openURL to launch the system browser automatically.
 *   No extra plugins needed — this is built into Capacitor's core bridge.
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

if (src.includes("capacitor-browser-fix")) {
  console.log("Capacitor browser fix already present, skipping.");
  process.exit(0);
}

if (!src.includes("</head>")) {
  console.error("ERROR: Could not find </head> in index.html.");
  process.exit(1);
}

const SCRIPT_BLOCK = `
  <script id="capacitor-browser-fix">
    // On Capacitor native builds, window.open(..., "_blank") tries to open a
    // new window which the WebView silently drops. Instead we set location.href,
    // which Capacitor's bridge intercepts for external URLs and routes to the
    // system browser via Intent.ACTION_VIEW (Android) or openURL (iOS).
    // No extra plugins required — this is built into Capacitor's core bridge.
    (function () {
      var _nativeOpen = window.open.bind(window);
      window.open = function (url, target, features) {
        var cap = window.Capacitor;
        if (
          cap &&
          cap.isNativePlatform &&
          cap.isNativePlatform() &&
          url &&
          /^https?:\\/\\//.test(url)
        ) {
          window.location.href = url;
          return null;
        }
        return _nativeOpen(url, target, features);
      };
    })();
  </script>`;

const patched = src.replace("</head>", `${SCRIPT_BLOCK}\n</head>`);

if (patched === src) {
  console.error("ERROR: Replacement produced no change.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Injected Capacitor browser override into ${TARGET}`);
console.log("Capacitor browser fix applied successfully.");
