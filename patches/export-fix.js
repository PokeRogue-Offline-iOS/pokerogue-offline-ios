#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 * Fixes save data export (Export Data / Export Session) in Capacitor native builds.
 *
 * On native Capacitor platforms, blob URL downloads via <a download> are silently
 * blocked by the WebView. This patch wraps the export logic to use
 * @capacitor/filesystem + @capacitor/share on native, and keeps the original
 * blob-URL path for web builds.
 *
 * Targets: src/system/game-data.ts
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
// The original export block (appears once per export type, but the blob/link
// pattern is identical). We match on the tightest unique anchor we can.
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
        // On native we write to the cache directory and open the OS share sheet.
        // On web we keep the original blob-URL anchor approach.
        if ((window as any).Capacitor?.isNativePlatform?.()) {
          const { Filesystem, Directory } = import("@capacitor/filesystem");
          const { Share } = import("@capacitor/share");

          const encryptedString = encryptedData.toString();
          const base64 = btoa(unescape(encodeURIComponent(encryptedString)));
          const fileName = \`\${dataKey}.prsv\`;

          Filesystem.writeFile({
            path: fileName,
            data: base64,
            directory: Directory.Cache,
          });

          const { uri } = Filesystem.getUri({
            path: fileName,
            directory: Directory.Cache,
          });

          Share.share({
            title: "Export Save Data",
            url: uri,
            dialogTitle: "Save your .prsv file",
          });
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

// Sanity check — make sure we actually changed something
if (patched === src) {
  console.error("ERROR: Replacement produced no change. Something went wrong.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");

console.log(`Patched ${occurrences} occurrence(s) in ${TARGET}`);
console.log("Capacitor export fix applied successfully.");
console.log("");
console.log("NOTE: Ensure the following Capacitor plugins are installed:");
console.log("  npm install @capacitor/filesystem @capacitor/share");
console.log("  npx cap sync");
console.log("");
console.log("Android: add WRITE_EXTERNAL_STORAGE permission to AndroidManifest.xml");
console.log("iOS:     add NSDocumentsFolderUsageDescription to Info.plist");
