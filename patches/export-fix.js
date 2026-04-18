#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 * Fixes save data export (Export Data / Export Session) in Capacitor native builds.
 *
 * On native Capacitor platforms, blob URL downloads via <a download> are silently
 * blocked by the WebView. This patch wraps the export logic to use the Capacitor
 * plugin globals (injected at runtime by the native bridge) instead of imports,
 * which avoids Vite trying to resolve @capacitor/* packages at build time.
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

// Access Capacitor plugins via the runtime globals that the native bridge injects.
// This avoids any import statement, so Vite has nothing to resolve at build time.
// Capacitor injects window.Capacitor and registers plugins under
// window.Capacitor.Plugins.Filesystem / .Share before the app JS runs.
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
            const fileName = \`\${dataKey}.prsv\`;
            Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: "CACHE",
            }).then(() => {
              return Filesystem.getUri({ path: fileName, directory: "CACHE" });
            }).then(({ uri }: { uri: string }) => {
              return Share.share({
                title: "Export Save Data",
                url: uri,
                dialogTitle: "Save your .prsv file",
              });
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