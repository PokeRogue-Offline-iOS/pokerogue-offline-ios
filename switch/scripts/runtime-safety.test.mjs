import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const diagnostics = readFileSync(new URL("../src/diagnostics.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const nxjsConfig = readFileSync(new URL("../nxjs.ini", import.meta.url), "utf8");
const gamePatch = readFileSync(
  new URL("../../patches/switch/node/nxjs-bootstrap.js", import.meta.url),
  "utf8",
);
const inputPatch = readFileSync(
  new URL("../../patches/switch/node/input-stabilization.js", import.meta.url),
  "utf8",
);
const liveSettingsPatch = readFileSync(
  new URL("../../patches/all/node/live-cheat-settings.js", import.meta.url),
  "utf8",
);
const logger = readFileSync(new URL("../src/logger.ts", import.meta.url), "utf8");

test("the Switch runtime keeps a bounded freeze flight recorder and dual watchdogs", () => {
  assert.match(diagnostics, /const FLIGHT_RECORDER_INTERVAL_MS = 10_000;/);
  assert.match(diagnostics, /const FRAME_WATCHDOG_INTERVAL_MS = 2_000;/);
  assert.match(diagnostics, /Event loop watchdog resumed after a stall/);
  assert.match(diagnostics, /Phaser frame watchdog detected a stall/);
  assert.match(diagnostics, /Freeze flight recorder/);
  assert.match(diagnostics, /frameWindow = createFrameWindow\(\);/);
});

test("pressure-aware GC is exposed and restricted to measured or safe boundaries", () => {
  assert.match(nxjsConfig, /\[v8\][\s\S]*flags\s*=\s*--expose-gc/);
  assert.match(diagnostics, /const MAINTENANCE_COOLDOWN_MS = 15_000;/);
  assert.match(diagnostics, /memoryPressureReasons\(before\)/);
  assert.match(diagnostics, /requestMemoryMaintenance\("loader-complete"/);
  assert.match(diagnostics, /maintenance: requestMemoryMaintenance/);
  assert.match(gamePatch, /maintenance\?\.\("biome-assets-cleared"[\s\S]*true\);/);
});

test("Plus remains routed to game input while diagnostics only observe the request", () => {
  assert.match(main, /addEventListener\("beforeunload", event => \{/);
  assert.match(main, /event\.preventDefault\(\);/);
  assert.match(main, /captureMemorySnapshot\("plus-button-exit-request"\);/);
  assert.doesNotMatch(main, /Switch\.exit\(\)/);
});

test("command buttons are edge-triggered while only directions repeat across a UI generation", () => {
  assert.match(inputPatch, /if \(!this\.isDirectional\(mapped\)\) return/);
  assert.match(inputPatch, /generation !== this\.transitionGeneration/);
  assert.match(inputPatch, /suppressedUntilRelease/);
  assert.match(inputPatch, /recordPhysicalInput\("unmatched-up"/);
  assert.match(inputPatch, /beginUiTransition\(this\.mode, mode\)/);
});

test("live settings cannot retain reload and inactive reroll UI is not refreshed uninitialized", () => {
  assert.match(liveSettingsPatch, /finalRow\.includes\("requireReload"\)/);
  assert.match(liveSettingsPatch, /Number\.isFinite\(handler\.rerollCost\)/);
  assert.match(liveSettingsPatch, /handler\?\.rerollCostText/);
});

test("logging is bounded and audio teardown crosses a native settle window", () => {
  assert.match(logger, /const MAX_PENDING_BYTES = 64 \* 1024/);
  assert.match(logger, /const FLUSH_INTERVAL_MS = 250/);
  assert.match(gamePatch, /bgm-sound-retired/);
  assert.match(gamePatch, /bgm-cache-retired/);
  assert.match(gamePatch, /settleMs: 1500/);
});

test("startup progress reserves completion for a rendered ready frame", () => {
  assert.match(gamePatch, /setSwitchStartupProgress\(progress \* 0\.4\)/);
  assert.match(gamePatch, /setSwitchStartupProgress\(0\.42, "Preparing game\.\.\."\)/);
  assert.match(gamePatch, /setSwitchStartupProgress\(1, "Ready"\)/);
  assert.match(gamePatch, /Phaser\.Core\.Events\.POST_RENDER/);
  assert.match(gamePatch, /this\.scene\.launch\("battle"\)/);
  assert.match(gamePatch, /percent >= this\.switchLastLoggedPercent \+ 10/);
});
