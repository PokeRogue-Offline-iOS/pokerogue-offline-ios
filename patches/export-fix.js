#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 * Fixes save data export (Export Data / Export Session) in Capacitor native builds.
 *
 * Fixes:
 *   - Blob URL downloads don't work in Capacitor WebView → use Filesystem + Share plugins
 *   - .prsv extension stripped by iOS share sheet → write to Documents directory
 *   - A button spam after share sheet dismisses → pause the entire Phaser game loop
 *     while the share sheet is open, resume it after dismissal with a drain delay
 *
 * Uses Capacitor plugin globals (window.Capacitor.Plugins.*) rather than imports
 * so Vite has nothing to resolve at build time.
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

// Pause the entire Phaser game loop while the share sheet is open.
// globalScene.game.pause() stops the RAF loop entirely — no update ticks,
// no input polling, no gamepad reads. This is the nuclear option but it's
// the only reliable way to prevent button events from leaking through.
// globalScene.game.resume() restarts it. We add a 500ms delay after the
// share sheet resolves to drain any buffered events before resuming.
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

            // Pause the entire Phaser game loop so no input events (gamepad,
            // keyboard, touch) can fire while the native share sheet is open.
            globalScene.game.pause();

            Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: "DOCUMENTS",
            }).then(() => {
              return Filesystem.getUri({ path: fileName, directory: "DOCUMENTS" });
            }).then(({ uri }: { uri: string }) => {
              return Share.share({
                title: fileName,
                url: uri,
                dialogTitle: \`Save \${fileName}\`,
              });
            }).then(() => {
              // Share sheet dismissed. Wait for buffered input events to expire
              // before resuming the game loop, then close the menu.
              setTimeout(() => {
                globalScene.game.resume();
                globalScene.ui.revertMode();
              }, 500);
            }).catch((err: any) => {
              console.error("Capacitor export failed:", err);
              // Always resume so the player isn't stuck on a frozen screen.
              globalScene.game.resume();
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