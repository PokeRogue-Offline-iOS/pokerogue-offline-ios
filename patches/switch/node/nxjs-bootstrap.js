#!/usr/bin/env node

/**
 * Applies only the source changes required to hand the real PokéRogue Phaser
 * game the nx.js screen canvas. Browser API compatibility remains in the
 * native Switch bootstrap so hardware failures can be diagnosed incrementally.
 */

const fs = require("fs");
const path = require("path");

const mainPath = path.join("pokerogue-src", "src", "main.ts");
const battleScenePath = path.join("pokerogue-src", "src", "battle-scene.ts");
const loadingScenePath = path.join("pokerogue-src", "src", "loading-scene.ts");
const encounterPhasePath = path.join("pokerogue-src", "src", "phases", "encounter-phase.ts");
const switchBiomePhasePath = path.join("pokerogue-src", "src", "phases", "switch-biome-phase.ts");
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
const previousCreatedReplacement = `  game.sound.pauseOnBlur = false;
  (globalThis as Record<string, unknown>).__SILVERSHADOW_POKEROGUE_STAGE__ = "phaser-game-created";`;
const createdReplacement = `  game.sound.pauseOnBlur = false;
  (globalThis as Record<string, unknown>).__SILVERSHADOW_POKEROGUE_STAGE__ = "phaser-game-created";
  const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
  switchDiagnostics?.attachPhaserGame?.(game);
  switchDiagnostics?.checkpoint?.("game:phaser-created", {
    renderer: game.renderer?.type ?? null,
    scenes: game.scene?.getScenes?.(false)?.map((scene: Phaser.Scene) => scene.scene.key) ?? [],
  }, true);`;
if (!main.includes(createdReplacement)) {
  if (main.includes(previousCreatedReplacement)) {
    main = main.replace(previousCreatedReplacement, createdReplacement);
  } else if (main.includes(createdAnchor)) {
    main = main.replace(createdAnchor, createdReplacement);
  } else {
    fail("Could not find the Phaser-created diagnostic anchor in src/main.ts");
  }
}
write(mainPath, main);

let loadingScene = read(loadingScenePath);
const loadingPreloadAnchor = `  preload() {
    localPing();`;
const loadingPreloadReplacement = `  preload() {
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.instrumentLoader?.(this.load, this.textures, LoadingScene.KEY);
    switchDiagnostics?.checkpoint?.("loading-scene:preload-start", {
      scene: LoadingScene.KEY,
    }, true);
    localPing();`;
if (!loadingScene.includes(loadingPreloadReplacement)) {
  if (!loadingScene.includes(loadingPreloadAnchor)) {
    fail("Could not find the LoadingScene preload diagnostic anchor");
  }
  loadingScene = loadingScene.replace(loadingPreloadAnchor, loadingPreloadReplacement);
}

const loadingCreateAnchor = `  async create() {
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.handleDestroy());`;
const loadingCreateReplacement = `  async create() {
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("loading-scene:create", {
      scene: LoadingScene.KEY,
    }, true);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.handleDestroy());`;
if (!loadingScene.includes(loadingCreateReplacement)) {
  if (!loadingScene.includes(loadingCreateAnchor)) {
    fail("Could not find the LoadingScene create diagnostic anchor");
  }
  loadingScene = loadingScene.replace(loadingCreateAnchor, loadingCreateReplacement);
}
write(loadingScenePath, loadingScene);

let battleScene = read(battleScenePath);
const battlePreloadAnchor = `  public async preload(): Promise<void> {
    /**`;
const battlePreloadReplacement = `  public async preload(): Promise<void> {
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.instrumentLoader?.(this.load, this.textures, "battle");
    switchDiagnostics?.checkpoint?.("battle-scene:preload-start", {
      scene: "battle",
    }, true);
    /**`;
if (!battleScene.includes(battlePreloadReplacement)) {
  if (!battleScene.includes(battlePreloadAnchor)) {
    fail("Could not find the BattleScene preload diagnostic anchor");
  }
  battleScene = battleScene.replace(battlePreloadAnchor, battlePreloadReplacement);
}

const battleCreateAnchor = `  public create(): void {
    this.scene.remove(LoadingScene.KEY);`;
const battleCreateReplacement = `  public create(): void {
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("battle-scene:create-start", {
      scene: "battle",
    }, true);
    this.scene.remove(LoadingScene.KEY);`;
if (!battleScene.includes(battleCreateReplacement)) {
  if (!battleScene.includes(battleCreateAnchor)) {
    fail("Could not find the BattleScene create diagnostic anchor");
  }
  battleScene = battleScene.replace(battleCreateAnchor, battleCreateReplacement);
}

const battleLaunchAnchor = `    this.launchBattle();
  }

  update()`;
const battleLaunchReplacement = `    this.launchBattle();
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("battle-scene:create-complete", {
      scene: "battle",
      biome: this.arena?.biomeId ?? null,
      wave: this.currentBattle?.waveIndex ?? null,
    }, true);
  }

  update()`;
if (!battleScene.includes(battleLaunchReplacement)) {
  if (!battleScene.includes(battleLaunchAnchor)) {
    fail("Could not find the BattleScene launch diagnostic anchor");
  }
  battleScene = battleScene.replace(battleLaunchAnchor, battleLaunchReplacement);
}

const biomeLoadCacheAnchor = `    // Already in texture cache — nothing to load
    if (this.textures.exists(\`\${btKey}_bg\`)) {
      resolve();
      return promise;
    }`;
const biomeLoadCacheReplacement = `    // Already in texture cache — nothing to load
    if (this.textures.exists(\`\${btKey}_bg\`)) {
      (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:cache-hit", {
        biome,
        biomeKey: btKey,
        backgroundTexture: \`\${btKey}_bg\`,
      }, true);
      resolve();
      return promise;
    }

    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:queue-start", {
      biome,
      biomeKey: btKey,
      loaderAlreadyActive: this.load.isLoading(),
    }, true);`;
if (!battleScene.includes(biomeLoadCacheReplacement)) {
  if (!battleScene.includes(biomeLoadCacheAnchor)) {
    fail("Could not find the biome cache diagnostic anchor in BattleScene");
  }
  battleScene = battleScene.replace(biomeLoadCacheAnchor, biomeLoadCacheReplacement);
}

const biomeLoadCompleteAnchor = `    this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
    this.load.start();

    return promise;`;
const biomeLoadCompleteReplacement = `    this.load.once(
      Phaser.Loader.Events.COMPLETE,
      (_loader: Phaser.Loader.LoaderPlugin, totalComplete: number, totalFailed: number) => {
        (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:load-complete", {
          biome,
          biomeKey: btKey,
          totalComplete,
          totalFailed,
          textures: {
            background: this.textures.exists(\`\${btKey}_bg\`),
            baseA: this.textures.exists(baseAKey),
            baseB: this.textures.exists(baseBKey),
          },
        }, true);
        resolve();
      },
    );
    this.load.start();
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:loader-started", {
      biome,
      biomeKey: btKey,
      totalToLoad: this.load.totalToLoad,
      loaderActive: this.load.isLoading(),
    });

    return promise;`;
if (!battleScene.includes(biomeLoadCompleteReplacement)) {
  if (!battleScene.includes(biomeLoadCompleteAnchor)) {
    fail("Could not find the biome loader completion diagnostic anchor in BattleScene");
  }
  battleScene = battleScene.replace(biomeLoadCompleteAnchor, biomeLoadCompleteReplacement);
}

const biomeClearTownAnchor = `    // Don't clear TOWN — it's the starting biome
    if (btKey === "town") {
      return;
    }`;
const biomeClearTownReplacement = `    // Don't clear TOWN — it's the starting biome
    if (btKey === "town") {
      (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:clear-skipped-town", {
        biome,
        biomeKey: btKey,
      });
      return;
    }`;
if (!battleScene.includes(biomeClearTownReplacement)) {
  if (!battleScene.includes(biomeClearTownAnchor)) {
    fail("Could not find the biome TOWN cleanup diagnostic anchor in BattleScene");
  }
  battleScene = battleScene.replace(biomeClearTownAnchor, biomeClearTownReplacement);
}

const biomeClearLoopAnchor = `    for (const key of keysToClear) {
      if (this.anims.exists(key)) {`;
const biomeClearLoopReplacement = `    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:clear-start", {
      biome,
      biomeKey: btKey,
      keys: keysToClear.map(key => ({
        key,
        animation: this.anims.exists(key),
        texture: this.textures.exists(key),
      })),
    }, true);

    for (const key of keysToClear) {
      if (this.anims.exists(key)) {`;
if (!battleScene.includes(biomeClearLoopReplacement)) {
  if (!battleScene.includes(biomeClearLoopAnchor)) {
    fail("Could not find the biome cleanup loop diagnostic anchor in BattleScene");
  }
  battleScene = battleScene.replace(biomeClearLoopAnchor, biomeClearLoopReplacement);
}

const biomeClearEndAnchor = `      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
  }

  updateFieldScale`;
const biomeClearEndReplacement = `      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }

    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome-assets:clear-complete", {
      biome,
      biomeKey: btKey,
      remainingTextures: keysToClear.filter(key => this.textures.exists(key)),
      remainingAnimations: keysToClear.filter(key => this.anims.exists(key)),
    }, true);
  }

  updateFieldScale`;
if (!battleScene.includes(biomeClearEndReplacement)) {
  if (!battleScene.includes(biomeClearEndAnchor)) {
    fail("Could not find the biome cleanup completion diagnostic anchor in BattleScene");
  }
  battleScene = battleScene.replace(biomeClearEndAnchor, biomeClearEndReplacement);
}
write(battleScenePath, battleScene);

let encounterPhase = read(encounterPhasePath);
const encounterStartAnchor = `  start() {
    super.start();

    globalScene.updateGameInfo();`;
const encounterStartReplacement = `  start() {
    super.start();

    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("encounter:start", {
      phase: this.phaseName,
      loaded: this.loaded,
      wave: globalScene.currentBattle?.waveIndex ?? null,
      battleType: globalScene.currentBattle?.battleType ?? null,
      biome: globalScene.arena?.biomeId ?? null,
    }, true);

    globalScene.updateGameInfo();`;
if (!encounterPhase.includes(encounterStartReplacement)) {
  if (!encounterPhase.includes(encounterStartAnchor)) {
    fail("Could not find the EncounterPhase start diagnostic anchor");
  }
  encounterPhase = encounterPhase.replace(encounterStartAnchor, encounterStartReplacement);
}

const encounterAssetsAnchor = `    Promise.all(loadEnemyAssets).then(() => {
      battle.enemyParty.every((enemyPokemon, e) => {`;
const encounterAssetsReplacement = `    Promise.all(loadEnemyAssets).then(() => {
      (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("encounter:assets-ready", {
        phase: this.phaseName,
        wave: battle.waveIndex,
        battleType: battle.battleType,
        biome: globalScene.arena?.biomeId ?? null,
        assetPromises: loadEnemyAssets.length,
        enemyPartySize: battle.enemyParty.length,
      }, true);
      battle.enemyParty.every((enemyPokemon, e) => {`;
if (!encounterPhase.includes(encounterAssetsReplacement)) {
  if (!encounterPhase.includes(encounterAssetsAnchor)) {
    fail("Could not find the EncounterPhase asset diagnostic anchor");
  }
  encounterPhase = encounterPhase.replace(encounterAssetsAnchor, encounterAssetsReplacement);
}
write(encounterPhasePath, encounterPhase);

let switchBiomePhase = read(switchBiomePhasePath);
const switchBiomeStartAnchor = `    if (this.nextBiome === undefined) {
      return this.end();
    }

    // Kick off biome asset loading`;
const switchBiomeStartReplacement = `    if (this.nextBiome === undefined) {
      (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("biome:missing-next-biome", {
        previousBiome: globalScene.arena?.biomeId ?? null,
        wave: globalScene.currentBattle?.waveIndex ?? null,
      }, true);
      return this.end();
    }

    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.checkpoint?.("biome:phase-start", {
      previousBiome: globalScene.arena?.biomeId ?? null,
      nextBiome: this.nextBiome,
      nextBiomeKey: getBiomeKey(this.nextBiome),
      wave: globalScene.currentBattle?.waveIndex ?? null,
    }, true);

    // Kick off biome asset loading`;
if (!switchBiomePhase.includes(switchBiomeStartReplacement)) {
  if (!switchBiomePhase.includes(switchBiomeStartAnchor)) {
    fail("Could not find the SwitchBiomePhase start diagnostic anchor");
  }
  switchBiomePhase = switchBiomePhase.replace(switchBiomeStartAnchor, switchBiomeStartReplacement);
}

const switchBiomePromiseAnchor = `    const biomeLoadPromise = globalScene.loadBiomeAssets(this.nextBiome);

    // Before switching biomes`;
const switchBiomePromiseReplacement = `    const biomeLoadPromise = globalScene.loadBiomeAssets(this.nextBiome);
    switchDiagnostics?.checkpoint?.("biome:load-promise-created", {
      nextBiome: this.nextBiome,
      nextBiomeKey: getBiomeKey(this.nextBiome),
      loaderActive: globalScene.load.isLoading(),
    });

    // Before switching biomes`;
if (!switchBiomePhase.includes(switchBiomePromiseReplacement)) {
  if (!switchBiomePhase.includes(switchBiomePromiseAnchor)) {
    fail("Could not find the SwitchBiomePhase load promise diagnostic anchor");
  }
  switchBiomePhase = switchBiomePhase.replace(switchBiomePromiseAnchor, switchBiomePromiseReplacement);
}

const switchBiomeTweenAnchor = `      duration: 2000,
      onComplete: async () => {
        // Wait for biome assets before proceeding — will usually
        // already be resolved since the tween took 2000ms
        await biomeLoadPromise;

        globalScene.arenaEnemy.setX(globalScene.arenaEnemy.x - 600);
        // Capture BEFORE newArena overwrites globalScene.arena
        const previousBiome = globalScene.arena.biomeId;
        globalScene.newArena(this.nextBiome);`;
const switchBiomeTweenReplacement = `      duration: 2000,
      onComplete: async () => {
        switchDiagnostics?.checkpoint?.("biome:slide-out-complete", {
          previousBiome: globalScene.arena?.biomeId ?? null,
          nextBiome: this.nextBiome,
          loaderActive: globalScene.load.isLoading(),
        }, true);
        // Wait for biome assets before proceeding — will usually
        // already be resolved since the tween took 2000ms
        try {
          await biomeLoadPromise;
        } catch (error) {
          switchDiagnostics?.checkpoint?.("biome:load-promise-rejected", {
            nextBiome: this.nextBiome,
            message: error instanceof Error ? error.message : String(error),
          }, true);
          throw error;
        }
        switchDiagnostics?.checkpoint?.("biome:load-promise-resolved", {
          nextBiome: this.nextBiome,
          nextBiomeKey: getBiomeKey(this.nextBiome),
        }, true);

        globalScene.arenaEnemy.setX(globalScene.arenaEnemy.x - 600);
        // Capture BEFORE newArena overwrites globalScene.arena
        const previousBiome = globalScene.arena.biomeId;
        switchDiagnostics?.checkpoint?.("biome:new-arena-before", {
          previousBiome,
          nextBiome: this.nextBiome,
        }, true);
        globalScene.newArena(this.nextBiome);
        switchDiagnostics?.checkpoint?.("biome:new-arena-after", {
          previousBiome,
          activeBiome: globalScene.arena?.biomeId ?? null,
        }, true);`;
if (!switchBiomePhase.includes(switchBiomeTweenReplacement)) {
  if (!switchBiomePhase.includes(switchBiomeTweenAnchor)) {
    fail("Could not find the SwitchBiomePhase slide-out diagnostic anchor");
  }
  switchBiomePhase = switchBiomePhase.replace(switchBiomeTweenAnchor, switchBiomeTweenReplacement);
}

const switchBiomeTextureAnchor = `          onComplete: () => {
            globalScene.arenaBg.setTexture(bgTexture);
            globalScene.arenaPlayer.setBiome(this.nextBiome);`;
const switchBiomeTextureReplacement = `          onComplete: () => {
            switchDiagnostics?.checkpoint?.("biome:texture-swap-before", {
              previousBiome,
              nextBiome: this.nextBiome,
              backgroundTexture: bgTexture,
              backgroundExists: globalScene.textures.exists(bgTexture),
            }, true);
            globalScene.arenaBg.setTexture(bgTexture);
            globalScene.arenaPlayer.setBiome(this.nextBiome);`;
if (!switchBiomePhase.includes(switchBiomeTextureReplacement)) {
  if (!switchBiomePhase.includes(switchBiomeTextureAnchor)) {
    fail("Could not find the SwitchBiomePhase texture diagnostic anchor");
  }
  switchBiomePhase = switchBiomePhase.replace(switchBiomeTextureAnchor, switchBiomeTextureReplacement);
}

const switchBiomeClearAnchor = `            // Clear previous biome textures now that the transition is complete
            globalScene.clearBiomeAssets(previousBiome);
            this.end();`;
const switchBiomeClearReplacement = `            switchDiagnostics?.checkpoint?.("biome:texture-swap-after", {
              previousBiome,
              nextBiome: this.nextBiome,
              activeBiome: globalScene.arena?.biomeId ?? null,
              backgroundTexture: bgTexture,
              backgroundExists: globalScene.textures.exists(bgTexture),
            }, true);
            // Clear previous biome textures now that the transition is complete
            switchDiagnostics?.checkpoint?.("biome:previous-cleanup-before", {
              previousBiome,
              nextBiome: this.nextBiome,
            }, true);
            globalScene.clearBiomeAssets(previousBiome);
            switchDiagnostics?.checkpoint?.("biome:previous-cleanup-after", {
              previousBiome,
              nextBiome: this.nextBiome,
            }, true);
            this.end();
            switchDiagnostics?.checkpoint?.("biome:phase-ended", {
              previousBiome,
              activeBiome: globalScene.arena?.biomeId ?? null,
            }, true);`;
if (!switchBiomePhase.includes(switchBiomeClearReplacement)) {
  if (!switchBiomePhase.includes(switchBiomeClearAnchor)) {
    fail("Could not find the SwitchBiomePhase cleanup diagnostic anchor");
  }
  switchBiomePhase = switchBiomePhase.replace(switchBiomeClearAnchor, switchBiomeClearReplacement);
}
write(switchBiomePhasePath, switchBiomePhase);

let title = read(titlePath);
for (const [placeholder, replacement] of [
  ["SILVERSHADOW_VERSION_PLACEHOLDER", "1.12.0.10"],
  ["BUILD_NUMBER_PLACEHOLDER", "Switch M2"],
]) {
  if (!title.includes(placeholder)) {
    if (title.includes(replacement)) {
      console.log(`${placeholder} already replaced in the patched title handler.`);
      continue;
    }
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
