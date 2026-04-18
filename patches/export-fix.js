#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 *
 * Fixes save data export in Capacitor native (iOS) builds.
 *
 * The core problem is that iOS requires a genuine user gesture (a real DOM tap)
 * to open a share sheet. The game's touch controls use Phaser's input pipeline
 * which is completely separate from the DOM — so by the time the export handler
 * runs, there is no live user gesture that iOS will accept for Share.share().
 *
 * Solution: when running natively, instead of immediately triggering the share,
 * inject a fullscreen DOM overlay with a single "Save File" button. The user
 * taps that button — a real DOM touchend on a real HTMLButtonElement — which
 * iOS accepts as a genuine gesture. The share sheet opens from there, and the
 * overlay removes itself on completion or dismissal.
 *
 * This completely bypasses Phaser's touch system, so there is no button-lock
 * or held-key issue.
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

const ORIGINAL = `        const encryptedData = AES.encrypt(dataStr, saveKey);
        const blob = new Blob([encryptedData.toString()], {
          type: "text/json",
        });
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = \`\${dataKey}.prsv\`;
        link.click();
        link.remove();`;

const REPLACEMENT = `        const encryptedData = AES.encrypt(dataStr, saveKey);

        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) {
          // On iOS, Share.share() requires a genuine DOM user gesture to open
          // the share sheet. Phaser's touch pipeline doesn't count. So we inject
          // a fullscreen overlay with a real HTML button — the user taps it,
          // iOS sees a legitimate gesture, and the share sheet opens cleanly.
          const encryptedString = encryptedData.toString();
          const base64 = btoa(unescape(encodeURIComponent(encryptedString)));
          const fileName = \`\${dataKey}.prsv\`;

          // --- Build overlay ---
          const overlay = document.createElement("div");
          overlay.id = "cap-export-overlay";
          Object.assign(overlay.style, {
            position:         "fixed",
            inset:            "0",
            zIndex:           "99999",
            display:          "flex",
            flexDirection:    "column",
            alignItems:       "center",
            justifyContent:   "center",
            background:       "rgba(0,0,0,0.72)",
            fontFamily:       "sans-serif",
          });

          const label = document.createElement("p");
          label.textContent = \`Save \${fileName}\`;
          Object.assign(label.style, {
            color:        "#fff",
            fontSize:     "18px",
            marginBottom: "24px",
            textAlign:    "center",
            padding:      "0 24px",
          });

          const btn = document.createElement("button");
          btn.textContent = "📁 Save to Files";
          Object.assign(btn.style, {
            padding:       "18px 40px",
            fontSize:      "20px",
            fontWeight:    "bold",
            background:    "#da3838",
            color:         "#fff",
            border:        "none",
            borderRadius:  "12px",
            cursor:        "pointer",
            marginBottom:  "16px",
            minWidth:      "200px",
          });

          const cancelBtn = document.createElement("button");
          cancelBtn.textContent = "Cancel";
          Object.assign(cancelBtn.style, {
            padding:      "12px 32px",
            fontSize:     "16px",
            background:   "transparent",
            color:        "#aaa",
            border:       "1px solid #aaa",
            borderRadius: "8px",
            cursor:       "pointer",
          });

          const removeOverlay = () => overlay.parentNode?.removeChild(overlay);

          btn.addEventListener("click", () => {
            btn.disabled = true;
            btn.textContent = "Opening…";

            const Filesystem = cap.Plugins?.Filesystem;
            const Share = cap.Plugins?.Share;
            if (!Filesystem || !Share) {
              console.error("Capacitor Filesystem or Share plugin not available.");
              removeOverlay();
              return;
            }

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
              removeOverlay();
              globalScene.ui.revertMode();
            }).catch((err: any) => {
              console.error("Capacitor export failed:", err);
              removeOverlay();
            });
          });

          cancelBtn.addEventListener("click", () => {
            removeOverlay();
          });

          overlay.appendChild(label);
          overlay.appendChild(btn);
          overlay.appendChild(cancelBtn);
          document.body.appendChild(overlay);

        } else {
          // Web: original blob download path
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