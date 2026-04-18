#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 * Fixes save data export (Export Data / Export Session) in Capacitor native builds.
 *
 * Fixes:
 *   - Blob URL downloads don't work in Capacitor WebView → use Filesystem + Share plugins
 *   - .prsv extension stripped by iOS share sheet → write to Documents directory
 *     (iOS preserves extensions for files shared from Documents, unlike Cache)
 *   - A button spam after share sheet dismisses → disable/re-enable Phaser input
 *     around the share sheet lifetime, close menu on dismiss
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

// Key fixes for the extension issue:
//
// 1. Write to Directory.Documents instead of Directory.Cache.
//    iOS respects the filename (including extension) for files shared from
//    the Documents directory. Files shared from Cache often have their
//    extension stripped because iOS can't identify the UTI for unknown types
//    in the sandboxed cache path.
//
// 2. The fileName variable already appends .prsv correctly, but we make it
//    explicit and also pass it as the `title` in Share.share so the iOS
//    share sheet shows the correct name in the AirDrop/Files preview.
const REPLACEMENT = `// Capacitor native builds cannot use blob URLs for file downloads.
        // On native, use the Capacitor plugin globals injected by the native bridge.
        // These are available at runtime without any import statement, so Vite
        // does not need to resolve @capacitor/* packages during the build.
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) {
          const Filesystem = cap.Plugins?.Filesystem;
          const Share = cap.Plugins?.Share;
          if (Filesystem && Share) {
            const encryptedString = encryptedData.toString();
            const base64 = btoa(unescape(encodeURIComponent(encryptedString)));

            // Ensure the filename always has the .prsv extension.
            // Use Documents (not Cache) so iOS preserves the extension
            // when the share sheet hands the file to Files / AirDrop / etc.
            const fileName = \`\${dataKey}.prsv\`;

            // Disable Phaser input immediately to prevent A-button spam
            // while the native share sheet is in the foreground.
            (globalScene as any).input?.keyboard?.disableGlobalCapture?.();
            (globalScene as any).input?.gamepad?.disconnectAll?.();
            (globalScene as any).input?.enabled && ((globalScene as any).input.enabled = false);

            Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: "DOCUMENTS",
            }).then(() => {
              return Filesystem.getUri({ path: fileName, directory: "DOCUMENTS" });
            }).then(({ uri }: { uri: string }) => {
              return Share.share({
                // Pass the filename as the title so iOS uses it as the
                // suggested save name in the share sheet preview.
                title: fileName,
                url: uri,
                dialogTitle: \`Save \${fileName}\`,
              });
            }).then(() => {
              // Share sheet dismissed — wait a short moment for any buffered
              // touch/button events to drain before re-enabling input.
              setTimeout(() => {
                (globalScene as any).input.enabled = true;
                (globalScene as any).input?.keyboard?.enableGlobalCapture?.();
                // Close the Manage Data menu and return to the previous screen.
                globalScene.ui.revertMode();
              }, 300);
            }).catch((err: any) => {
              console.error("Capacitor export failed:", err);
              // Re-enable input so the player isn't left with a frozen screen.
              (globalScene as any).input.enabled = true;
              (globalScene as any).input?.keyboard?.enableGlobalCapture?.();
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