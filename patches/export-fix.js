#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 * Fixes save data export (Export Data / Export Session) in Capacitor native (iOS) builds.
 *
 * Problems fixed:
 *   1. Blob URL downloads don't work in Capacitor WebView → use Filesystem + Share plugins
 *   2. A button held down after export → call globalScene.inputController.deactivatePressedKey()
 *      before opening the share sheet. When the user taps "Export Data", touchstart fires and
 *      locks the button down. The OS then steals the touch to open the share sheet, so touchend
 *      never fires and the game thinks the button is still held. deactivatePressedKey() clears
 *      all touch intervals, empties buttonLock, and removes active classes — exactly what
 *      touchend would have done.
 *   3. .prsv extension preserved → write to Documents directory + custom UTI in Info.plist
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

            // Release any held touch buttons before the OS steals the touch
            // to show the share sheet. Without this, the touchend event for
            // the "Export Data" tap never fires into the game, leaving the
            // button locked in a held-down state indefinitely.
            globalScene.inputController.deactivatePressedKey();

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
              globalScene.ui.revertMode();
            }).catch((err: any) => {
              console.error("Capacitor export failed:", err);
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