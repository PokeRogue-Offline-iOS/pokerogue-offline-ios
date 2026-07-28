#!/usr/bin/env node

/**
 * Reliably pauses PokéRogue music whenever the native app becomes
 * inactive, including when the Android screen is locked.
 *
 * Uses Capacitor's native appStateChange event, with browser visibility
 * events retained as a fallback.
 */

const fs = require("fs");
const path = require("path");

const target = path.join(
  "pokerogue-src",
  "src",
  "main.ts",
);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fail(`Could not find ${target}`);
}

let source = fs
  .readFileSync(target, "utf8")
  .replace(/\r\n/g, "\n");

if (source.includes("silvershadow-app-state-audio")) {
  console.log("App-state audio handling already applied.");
  process.exit(0);
}

const importAnchor =
  'import { isBeta, isDev } from "#constants/app-constants";';

if (!source.includes(importAnchor)) {
  fail("Could not find app-constants import in main.ts");
}

source = source.replace(
  importAnchor,
  `${importAnchor}
import { globalScene } from "#app/global-scene";
import { App } from "@capacitor/app";`,
);

const audioAnchor = `  game.sound.pauseOnBlur = false;
}`;

if (!source.includes(audioAnchor)) {
  fail("Could not find pauseOnBlur configuration in main.ts");
}

const audioReplacement = `  game.sound.pauseOnBlur = false;

  // silvershadow-app-state-audio
  // Native lifecycle handling for Android/iOS, with browser events
  // retained as a fallback.
  const capacitor = (window as any).Capacitor;

  if (capacitor?.isNativePlatform?.()) {
    let appAudioPaused = false;

    const pauseAppAudio = () => {
      if (appAudioPaused) {
        return;
      }

      appAudioPaused = true;
      globalScene?.pauseBgm();
    };

    const resumeAppAudio = () => {
      if (!appAudioPaused) {
        return;
      }

      appAudioPaused = false;
      globalScene?.resumeBgm();
    };

    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        resumeAppAudio();
      } else {
        pauseAppAudio();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pauseAppAudio();
      } else {
        resumeAppAudio();
      }
    });

    window.addEventListener("pagehide", pauseAppAudio);
    window.addEventListener("pageshow", resumeAppAudio);
  }
}`;

source = source.replace(
  audioAnchor,
  audioReplacement,
);

fs.writeFileSync(target, source, "utf8");

console.log(
  "Added native foreground/background audio handling.",
);
