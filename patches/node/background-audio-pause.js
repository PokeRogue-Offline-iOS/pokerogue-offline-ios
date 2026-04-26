#!/usr/bin/env node
/**
 * Patch: background-audio-pause.js
 *
 * Pauses music (BGM) when the app is backgrounded on iOS/Android, and resumes
 * it when the app returns to the foreground.
 *
 * Problem:
 *   The game sets `pauseOnBlur = false` so Phaser never auto-pauses audio.
 *   On desktop this is fine — the tab loses focus but the page stays visible.
 *   On mobile Capacitor builds, backgrounding the app fires the standard
 *   `visibilitychange` event (document.hidden = true) but audio keeps playing
 *   because nothing handles it.
 *
 * Solution:
 *   Listen for `visibilitychange` on the document and call
 *   `globalScene.pauseBgm()` / `globalScene.resumeBgm()` accordingly.
 *   These methods already exist in BattleScene and handle the isPlaying guard
 *   and resume-timer correctly, so we don't need to touch audio state directly.
 *   The listener is only registered on Capacitor native platforms — desktop/web
 *   behaviour is unchanged.
 *
 * Targets: pokerogue-src/src/main.ts
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "src", "main.ts");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure this script is run from the repo root.");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("background-audio-pause")) {
  console.log("Background audio pause already present, skipping.");
  process.exit(0);
}

const ANCHOR = `  game.sound.pauseOnBlur = false;
}`;

if (!src.includes(ANCHOR)) {
  console.error("ERROR: Could not find anchor in main.ts.");
  console.error("The file may have been updated upstream. Manual inspection required.");
  process.exit(1);
}

// We need globalScene — add the import if it isn't already there
if (!src.includes("from \"#app/global-scene\"") && !src.includes("from '#app/global-scene'")) {
  src = src.replace(
    `import { isBeta, isDev } from "#constants/app-constants";`,
    `import { isBeta, isDev } from "#constants/app-constants";\nimport { globalScene } from "#app/global-scene";`
  );
}

const INJECTION = `  game.sound.pauseOnBlur = false;

  // background-audio-pause: pause BGM when the app is backgrounded on mobile.
  // Only active on Capacitor native platforms — desktop/web is unchanged.
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.()) {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        globalScene?.pauseBgm();
      } else {
        globalScene?.resumeBgm();
      }
    });
  }
}`;

const patched = src.replace(ANCHOR, INJECTION);

if (patched === src) {
  console.error("ERROR: Replacement produced no change. Something went wrong.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Injected background audio pause into ${TARGET}`);
console.log("Background audio pause applied successfully.");
