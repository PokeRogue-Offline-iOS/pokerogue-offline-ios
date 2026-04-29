#!/usr/bin/env node
/**
 * Patch: electron-save-bridge.js
 *
 * When running inside Electron (window.electronSaves.isDesktop === true),
 * redirect the game's localStorage reads/writes to Electron's IPC-backed
 * file storage so saves persist properly across AppImage launches.
 *
 * This patch injects a localStorage shim into src/utils/data-manager.ts
 * (or equivalent) that transparently swaps in Electron file I/O when the
 * desktop API is available, and falls back to the normal browser localStorage
 * when it is not (i.e., in the browser or on mobile).
 *
 * Targets: pokerogue-src/src/index.ts  (early boot entry point)
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "src", "main.ts");
const FALLBACK = path.join("pokerogue-src", "src", "index.ts");

const target = fs.existsSync(TARGET) ? TARGET : FALLBACK;

if (!fs.existsSync(target)) {
  console.error(`ERROR: Could not find entry point (tried main.ts, index.ts).`);
  process.exit(1);
}

let src = fs.readFileSync(target, "utf8");

if (src.includes("electron-save-bridge")) {
  console.log("electron-save-bridge already applied, skipping.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Shim to inject at the top of the entry file, before any game code runs.
// ---------------------------------------------------------------------------
const SHIM = `
// ── electron-save-bridge ────────────────────────────────────────────────────
// When running inside the Linux Electron wrapper, replace localStorage with
// a synchronous-style async shim backed by Electron IPC file storage.
// Falls back to the real localStorage everywhere else (browser, mobile).
(function () {
  if (
    typeof window === "undefined" ||
    !window.electronSaves ||
    !window.electronSaves.isDesktop
  ) {
    return; // not in Electron — do nothing
  }

  const _pending = new Map(); // key → Promise of latest write
  const _cache   = new Map(); // key → last known value (sync reads)

  // Pre-warm the cache with all keys that are already on disk by issuing
  // a fire-and-forget read for common top-level keys at startup.
  // The game's own code will await properly via the overridden methods below.
  const KNOWN_KEYS = ["data", "sessionData", "settings", "clientSessionId"];
  KNOWN_KEYS.forEach((k) => {
    window.electronSaves.read(k).then((v) => {
      if (v !== null) _cache.set(k, v);
    });
  });

  const _real = window.localStorage;

  window.localStorage = new Proxy(_real, {
    get(target, prop) {
      switch (prop) {
        case "getItem":
          return (key) => {
            // Return from cache for synchronous compatibility.
            if (_cache.has(key)) return _cache.get(key);
            return target.getItem(key);
          };

        case "setItem":
          return (key, value) => {
            _cache.set(key, value);
            target.setItem(key, value);
            // Also persist asynchronously to disk.
            window.electronSaves.write(key, value);
          };

        case "removeItem":
          return (key) => {
            _cache.delete(key);
            target.removeItem(key);
            window.electronSaves.delete(key);
          };

        default:
          if (typeof target[prop] === "function") {
            return target[prop].bind(target);
          }
          return target[prop];
      }
    },
  });

  console.log("[electron-save-bridge] localStorage shim active");
})();
// ── end electron-save-bridge ─────────────────────────────────────────────────
`;

// Prepend the shim before the first real import/code line.
src = SHIM + "\n" + src;

fs.writeFileSync(target, src, "utf8");
console.log(`Patched electron-save-bridge into ${target}`);
