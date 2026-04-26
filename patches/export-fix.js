#!/usr/bin/env node
/**
 * Patch: capacitor-export-fix.js
 *
 * Fixes save data export in Capacitor native builds (iOS + Android).
 *
 * iOS   — writes to DOCUMENTS, opens share sheet (Files, AirDrop, etc.)
 * Android — writes directly to Downloads/PokeRogueOffline/ via EXTERNAL_STORAGE.
 *           Skips the share sheet (Android doesn't recognise .prsv).
 *           Shows a toast with the save path instead.
 *
 * Uses a regex anchor so minor upstream indentation / variable-name changes
 * don't break the match.
 *
 * Targets: pokerogue-src/src/system/game-data.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "src", "system", "game-data.ts");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("cap-export-overlay")) {
  console.log("Capacitor export fix already present, skipping.");
  process.exit(0);
}

// Match the blob-download block regardless of indentation or whether the
// encrypted variable is called `encryptedData`, `encrypted`, etc., and
// regardless of whether the source variable is `data` or `dataStr`.
const PATTERN = /([ \t]*)(const \w+ = AES\.encrypt\(\w+, saveKey\);[\s\S]*?link\.download = [`'"][^`'"]*\.prsv[`'"];\n[ \t]*link\.click\(\);\n[ \t]*link\.remove\(\);)/;

const match = src.match(PATTERN);
if (!match) {
  console.error("ERROR: Could not find the export blob/link pattern in game-data.ts.");
  console.error("The file may have been updated upstream. Manual inspection required.");
  process.exit(1);
}

const fullMatch = match[0];
const i  = match[1];       // base indentation
const i2 = i + "  ";      // +2 spaces

// Extract the AES.encrypt call verbatim so we keep whatever variable name
// and source variable the upstream is using.
const encryptLine = fullMatch.match(/const \w+ = AES\.encrypt\([^)]+\);/)[0];
// Variable name used for the encrypted data (encryptedData, encrypted, etc.)
const encryptVar  = encryptLine.match(/const (\w+)/)[1];

const REPLACEMENT = `${i}${encryptLine}

${i}const cap = (window as any).Capacitor;
${i}if (cap?.isNativePlatform?.()) {
${i2}const fileName = \`\${dataKey}.prsv\`;
${i2}const base64 = btoa(unescape(encodeURIComponent(${encryptVar}.toString())));
${i2}const platform = cap.getPlatform?.() ?? "ios";

${i2}const overlay = document.createElement("div");
${i2}overlay.id = "cap-export-overlay";
${i2}Object.assign(overlay.style, {
${i2}  position: "fixed", inset: "0", zIndex: "99999",
${i2}  display: "flex", flexDirection: "column",
${i2}  alignItems: "center", justifyContent: "center",
${i2}  background: "rgba(0,0,0,0.72)", fontFamily: "sans-serif",
${i2}});

${i2}const label = document.createElement("p");
${i2}label.textContent = \`Save \${fileName}\`;
${i2}Object.assign(label.style, {
${i2}  color: "#fff", fontSize: "18px", marginBottom: "24px",
${i2}  textAlign: "center", padding: "0 24px",
${i2}});

${i2}const btn = document.createElement("button");
${i2}btn.textContent = platform === "android" ? "💾 Save to Downloads" : "📁 Save to Files";
${i2}Object.assign(btn.style, {
${i2}  padding: "18px 40px", fontSize: "20px", fontWeight: "bold",
${i2}  background: "#da3838", color: "#fff", border: "none",
${i2}  borderRadius: "12px", cursor: "pointer", marginBottom: "16px", minWidth: "200px",
${i2}});

${i2}const cancelBtn = document.createElement("button");
${i2}cancelBtn.textContent = "Cancel";
${i2}Object.assign(cancelBtn.style, {
${i2}  padding: "12px 32px", fontSize: "16px", background: "transparent",
${i2}  color: "#aaa", border: "1px solid #aaa", borderRadius: "8px", cursor: "pointer",
${i2}});

${i2}const removeOverlay = () => overlay.parentNode?.removeChild(overlay);

${i2}btn.addEventListener("click", () => {
${i2}  btn.disabled = true;
${i2}  btn.textContent = "Saving\u2026";
${i2}  const Filesystem = cap.Plugins?.Filesystem;
${i2}  const Share = cap.Plugins?.Share;
${i2}  if (!Filesystem) { console.error("Capacitor Filesystem not available."); removeOverlay(); return; }

${i2}  if (platform === "android") {
${i2}    const stampC = new Date();
${i2}    const stamp = stampC.getUTCFullYear() + '_' + (stampC.getUTCMonth() + 1) + '_' +   stampC.getUTCDate() + '-' + stampC.getUTCHours() + '_' +   stampC.getUTCMinutes() + '_' + stampC.getUTCSeconds();
${i2}    filename = \`\${dataKey}-\${stamp}.prsv\`;
${i2}    Filesystem.requestPermissions();
${i2}    Filesystem.writeFile({
${i2}      path: \`Download/PokeRogueOffline/\`,
${i2}      data: base64,
${i2}      directory: "EXTERNAL_STORAGE",
${i2}      recursive: true,
${i2}    }).then(() => {
${i2}      removeOverlay();
${i2}      const toast = document.createElement("div");
${i2}      toast.textContent = \`✓ Saved to Downloads/PokeRogueOffline/\${fileName}\`;
${i2}      Object.assign(toast.style, {
${i2}        position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)",
${i2}        background: "rgba(0,0,0,0.85)", color: "#fff", padding: "14px 24px",
${i2}        borderRadius: "10px", fontSize: "15px", zIndex: "99999",
${i2}        textAlign: "center", maxWidth: "90vw",
${i2}      });
${i2}      document.body.appendChild(toast);
${i2}      setTimeout(() => toast.parentNode?.removeChild(toast), 3500);
${i2}    }).catch((err) => {
${i2}      alert("Android export failed: " + err);
${i2}      btn.disabled = false;
${i2}      btn.textContent = "💾 Save to Downloads";
${i2}    });
${i2}  } else {
${i2}    if (!Share) { console.error("Capacitor Share not available."); removeOverlay(); return; }
${i2}    Filesystem.writeFile({ path: fileName, data: base64, directory: "DOCUMENTS" })
${i2}      .then(() => Filesystem.getUri({ path: fileName, directory: "DOCUMENTS" }))
${i2}      .then(({ uri }) => Share.share({ title: fileName, url: uri, dialogTitle: \`Save \${fileName}\` }))
${i2}      .then(() => removeOverlay())
${i2}      .catch((err) => { console.error("iOS export failed:", err); removeOverlay(); });
${i2}  }
${i2}});

${i2}cancelBtn.addEventListener("click", removeOverlay);
${i2}overlay.appendChild(label);
${i2}overlay.appendChild(btn);
${i2}overlay.appendChild(cancelBtn);
${i2}document.body.appendChild(overlay);

${i}} else {
${i2}const blob = new Blob([${encryptVar}.toString()], { type: "text/json" });
${i2}const link = document.createElement("a");
${i2}link.href = window.URL.createObjectURL(blob);
${i2}link.download = \`\${dataKey}.prsv\`;
${i2}link.click();
${i2}link.remove();
${i}}`;

const patched = src.replace(fullMatch, REPLACEMENT);

if (patched === src) {
  console.error("ERROR: Replacement produced no change.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Patched export in ${TARGET}`);
console.log("Capacitor export fix applied successfully.");
