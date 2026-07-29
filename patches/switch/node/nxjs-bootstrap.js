#!/usr/bin/env node

/**
 * Applies only the source changes required to hand the real PokéRogue Phaser
 * game the nx.js screen canvas. Browser API compatibility remains in the
 * native Switch bootstrap so hardware failures can be diagnosed incrementally.
 */

const fs = require("fs");
const path = require("path");

const mainPath = path.join("pokerogue-src", "src", "main.ts");
const titlePath = path.join("pokerogue-src", "src", "ui", "handlers", "title-ui-handler.ts");
const touchControlsPath = path.join("pokerogue-src", "src", "touch-controls.ts");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`Could not find ${file}`);
  }
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, contents) {
  fs.writeFileSync(file, contents, "utf8");
  console.log(`Written: ${file}`);
}

let main = read(mainPath);
const configAnchor = `  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "app",`;
const configReplacement = `  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    // nx.js exposes the physical display as the global screen canvas. The
    // compatibility layer patches it as an HTMLCanvasElement before this
    // compiled entry is evaluated.
    canvas: globalThis.screen as unknown as HTMLCanvasElement,
    customEnvironment: true,
    parent: "app",`;

if (main.includes(configReplacement)) {
  console.log("nx.js Phaser canvas patch already applied.");
} else if (main.includes(configAnchor)) {
  main = main.replace(configAnchor, configReplacement);
  write(mainPath, main);
} else {
  fail("Could not find the Phaser game configuration anchor in src/main.ts");
}

const startAnchor = `async function startGame(): Promise<void> {
  const LoadingScene`;
const startReplacement = `async function startGame(): Promise<void> {
  (globalThis as Record<string, unknown>).__SILVERSHADOW_POKEROGUE_STAGE__ = "startGame-entered";
  const LoadingScene`;
if (!main.includes(startReplacement)) {
  if (!main.includes(startAnchor)) {
    fail("Could not find the startGame diagnostic anchor in src/main.ts");
  }
  main = main.replace(startAnchor, startReplacement);
}

const createdAnchor = `  game.sound.pauseOnBlur = false;`;
const createdReplacement = `  game.sound.pauseOnBlur = false;
  (globalThis as Record<string, unknown>).__SILVERSHADOW_POKEROGUE_STAGE__ = "phaser-game-created";`;
if (!main.includes(createdReplacement)) {
  if (!main.includes(createdAnchor)) {
    fail("Could not find the Phaser-created diagnostic anchor in src/main.ts");
  }
  main = main.replace(createdAnchor, createdReplacement);
}
write(mainPath, main);

let title = read(titlePath);
for (const [placeholder, replacement] of [
  ["SILVERSHADOW_VERSION_PLACEHOLDER", "1.12.0.10"],
  ["BUILD_NUMBER_PLACEHOLDER", "Switch M2"],
]) {
  if (!title.includes(placeholder)) {
    fail(`Could not find ${placeholder} in the patched title handler`);
  }
  title = title.replaceAll(placeholder, replacement);
}
write(titlePath, title);

let touchControls = read(touchControlsPath);
const observerAnchor = `    const classObserver = new MutationObserver(() => {`;
const observerReplacement = `    const classObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {`;
if (touchControls.includes(observerReplacement)) {
  console.log("nx.js optional touch-control observer guard already applied.");
} else if (touchControls.includes(observerAnchor)) {
  touchControls = touchControls.replace(observerAnchor, observerReplacement);
} else {
  fail("Could not find the touch-control MutationObserver anchor");
}
const observeAnchor = `    classObserver.observe(touchControls, {`;
const observeReplacement = `    classObserver?.observe(touchControls, {`;
if (!touchControls.includes(observeReplacement)) {
  if (!touchControls.includes(observeAnchor)) {
    fail("Could not find the touch-control observer call anchor");
  }
  touchControls = touchControls.replace(observeAnchor, observeReplacement);
}
write(touchControlsPath, touchControls);

console.log("Applied the narrow nx.js real-game bootstrap patch.");
