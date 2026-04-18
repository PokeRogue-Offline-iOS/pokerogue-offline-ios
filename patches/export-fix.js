#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 *
 * Fixes save data export in Capacitor native (iOS) builds.
 *
 * Problem 1 — Filename loses .prsv extension:
 *   iOS strips unknown extensions in the share sheet because it doesn't know
 *   the UTI for .prsv. We register a custom UTI in Info.plist (see build.yml)
 *   so iOS treats .prsv as a known document type and preserves the extension.
 *
 * Problem 2 — A button spam while share sheet is open:
 *   game.pause() stops Phaser's RAF loop but the WebView still dispatches
 *   touch/pointer events into the DOM which Phaser's input queue replays on
 *   resume. Fix: attach a capturing event listener that swallows ALL input
 *   events at the window level while the sheet is open, then remove it after
 *   a drain delay once the sheet dismisses.
 *
 * Problem 3 — Content under notch (handled in build.yml):
 *   viewport-fit=cover + StatusBar overlaysWebView:false in capacitor.config.
 *
 * Targets: pokerogue-src/src/system/game-data.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "src", "system", "game-data.ts");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure this script is run from the repo root.");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

// ---------------------------------------------------------------------------
// The original export block in game-data.ts
// ---------------------------------------------------------------------------
const ORIGINAL = `const blob = new Blob([encryptedData.toString()], {
          type: "text/json",
        });
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = \`\${dataKey}.prsv\`;
        link.click();
        link.remove();`;

const REPLACEMENT = `// Capacitor native builds cannot use blob URLs for file downloads.
        // On native, use the Capacitor plugin globals injected by the native bridge.
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) {
          const Filesystem = cap.Plugins?.Filesystem;
          const Share = cap.Plugins?.Share;
          if (Filesystem && Share) {
            const encryptedString = encryptedData.toString();
            const base64 = btoa(unescape(encodeURIComponent(encryptedString)));
            const fileName = \`\${dataKey}.prsv\`;

            // --- Input lockout ---
            // Swallow ALL input events at the window level with a capturing
            // listener. This fires before Phaser or any other handler sees the
            // event, so nothing leaks through regardless of what game.pause()
            // does or doesn't stop.
            const swallowInput = (e: Event) => {
              e.stopImmediatePropagation();
              e.preventDefault();
            };
            const INPUT_EVENTS = [
              "keydown", "keyup", "keypress",
              "pointerdown", "pointerup", "pointermove",
              "touchstart", "touchend", "touchmove",
              "mousedown", "mouseup", "click",
            ];
            const attachSwallow = () => INPUT_EVENTS.forEach(t =>
              window.addEventListener(t, swallowInput, { capture: true, passive: false })
            );
            const detachSwallow = () => INPUT_EVENTS.forEach(t =>
              window.removeEventListener(t, swallowInput, { capture: true })
            );

            // Also pause Phaser so the game loop doesn't tick while locked.
            attachSwallow();
            globalScene.game.pause();

            Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: "DOCUMENTS",
            }).then(() => {
              return Filesystem.getUri({ path: fileName, directory: "DOCUMENTS" });
            }).then(({ uri }: { uri: string }) => {
              return Share.share({
                // Pass the full filename so iOS uses it as the suggested save
                // name. The custom UTI registered in Info.plist (see build.yml)
                // tells iOS that .prsv is a known type so it won't strip it.
                title: fileName,
                url: uri,
                dialogTitle: \`Save \${fileName}\`,
              });
            }).then(() => {
              // Share sheet dismissed. Keep swallowing input for a drain period
              // so any buffered events from the dismiss gesture don't fire,
              // then resume and close the menu.
              setTimeout(() => {
                detachSwallow();
                globalScene.game.resume();
                globalScene.ui.revertMode();
              }, 600);
            }).catch((err: any) => {
              // User cancelled or error — still clean up so nothing is stuck.
              console.error("Capacitor export failed:", err);
              setTimeout(() => {
                detachSwallow();
                globalScene.game.resume();
              }, 600);
            });
          } else {
            console.error("Capacitor Filesystem or Share plugin not available.");
          }
        } else {
          const blob = new Blob([encryptedData.toString()], {
            type: "text/json",
          });
          const link = document.createElement("a");
          link.href = window.URL.createObjectURL(blob);
          link.download = \`\${dataKey}.prsv\`;
          link.click();
          link.remove();
        }`;

if (!src.includes(ORIGINAL)) {
  console.error("ERROR: Could not find the export blob/link pattern in game-data.ts.");
  console.error("The file may have been updated upstream. Manual inspection required.");
  console.error("");
  console.error("Expected to find:");
  console.error(ORIGINAL);
  process.exit(1);
}

const occurrences = src.split(ORIGINAL).length - 1;
if (occurrences > 1) {
  console.warn(`WARNING: Found ${occurrences} occurrences of the export pattern. Patching all of them.`);
}

const patched = src.split(ORIGINAL).join(REPLACEMENT);

if (patched === src) {
  console.error("ERROR: Replacement produced no change. Something went wrong.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Patched ${occurrences} occurrence(s) in ${TARGET}`);
console.log("Capacitor export fix applied successfully.");