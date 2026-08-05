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
const phasePath = path.join("pokerogue-src", "src", "phase.ts");
const phaseManagerPath = path.join("pokerogue-src", "src", "phase-manager.ts");
const sceneBasePath = path.join("pokerogue-src", "src", "scene-base.ts");
const audioManagerPath = path.join("pokerogue-src", "src", "audio", "audio-manager.ts");
const backgroundMusicPath = path.join("pokerogue-src", "src", "audio", "background-music.ts");
const attemptCapturePhasePath = path.join("pokerogue-src", "src", "phases", "attempt-capture-phase.ts");
const encounterPhasePath = path.join("pokerogue-src", "src", "phases", "encounter-phase.ts");
const partyHealPhasePath = path.join("pokerogue-src", "src", "phases", "party-heal-phase.ts");
const selectModifierPhasePath = path.join("pokerogue-src", "src", "phases", "select-modifier-phase.ts");
const switchBiomePhasePath = path.join("pokerogue-src", "src", "phases", "switch-biome-phase.ts");
const modifierSelectUiPath = path.join("pokerogue-src", "src", "ui", "handlers", "modifier-select-ui-handler.ts");
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

const audioEndedGuardAnchor = `  const game = new Phaser.Game({`;
const audioEndedGuardReplacement = `  const webAudioSoundPrototype = (Phaser.Sound as any).WebAudioSound?.prototype;
  if (
    webAudioSoundPrototype
    && !webAudioSoundPrototype.__silverShadowLateEndedGuardInstalled
  ) {
    const createBufferSource = webAudioSoundPrototype.createBufferSource;
    webAudioSoundPrototype.createBufferSource = function (this: any, ...args: any[]) {
      const source = createBufferSource.apply(this, args);
      const onended = source?.onended;
      if (typeof onended === "function") {
        source.onended = (event: Event) => {
          // nx.js can dispatch a delayed ended event after Phaser has destroyed
          // the sound and cleared currentConfig. Phaser's stock handler reads
          // currentConfig.loop unconditionally, which otherwise terminates the
          // game during ordinary BGM transitions.
          if (!this.currentConfig) {
            (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.(
              "late-ended-ignored",
              {
                key: this.key ?? null,
                destroyed: this.pendingRemove ?? null,
              },
              true,
            );
            return;
          }
          onended.call(source, event);
        };
      }
      return source;
    };
    webAudioSoundPrototype.__silverShadowLateEndedGuardInstalled = true;
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.(
      "late-ended-guard-installed",
      null,
      true,
    );
  }

  const game = new Phaser.Game({`;
if (!main.includes(audioEndedGuardReplacement)) {
  if (!main.includes(audioEndedGuardAnchor)) {
    fail("Could not find the Phaser WebAudio late-ended guard anchor in src/main.ts");
  }
  main = main.replace(audioEndedGuardAnchor, audioEndedGuardReplacement);
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

const loadingScreenModeAnchor = `  private loadLoadingScreen() {
    const mobile = isMobile();`;
const loadingScreenModeReplacement = `  private loadLoadingScreen() {
    // The desktop path hides all progress UI behind an intro video. nx.js can
    // load that video but did not present it during hardware testing, leaving
    // the display black for the entire preload. Keep the existing progress UI
    // visible immediately on Switch and skip the decorative intro.
    const mobile = true;`;
if (!loadingScene.includes(loadingScreenModeReplacement)) {
  if (!loadingScene.includes(loadingScreenModeAnchor)) {
    fail("Could not find the Switch loading-screen mode anchor");
  }
  loadingScene = loadingScene.replace(loadingScreenModeAnchor, loadingScreenModeReplacement);
}

const loadingIntroAnchor = `    this.load
      .once(this.LOAD_EVENTS.START, () => {
        // videos do not need to be preloaded
        intro.loadURL("images/intro_dark.mp4", true);
        if (mobile) {
          intro.video?.setAttribute("webkit-playsinline", "webkit-playsinline");
          intro.video?.setAttribute("playsinline", "playsinline");
        }
        intro.play();
      })`;
const loadingIntroReplacement = `    this.load
      .once(this.LOAD_EVENTS.START, () => {
        intro.setVisible(false);
        (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("loading-scene:progress-visible", {
          scene: LoadingScene.KEY,
          introSkipped: true,
        }, true);
      })`;
if (!loadingScene.includes(loadingIntroReplacement)) {
  if (!loadingScene.includes(loadingIntroAnchor)) {
    fail("Could not find the Switch loading intro anchor");
  }
  loadingScene = loadingScene.replace(loadingIntroAnchor, loadingIntroReplacement);
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
const previousBattleLaunchReplacement = `    this.launchBattle();
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("battle-scene:create-complete", {
      scene: "battle",
      biome: this.arena?.biomeId ?? null,
      wave: this.currentBattle?.waveIndex ?? null,
    }, true);
  }

  update()`;
const battleLaunchReplacement = `    this.launchBattle();
    const runtimeDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    runtimeDiagnostics?.setGameStateProvider?.(() => {
      const currentPhase = this.phaseManager?.getCurrentPhase?.();
      const standbyPhase = this.phaseManager?.getStandbyPhase?.();
      const handler = this.ui?.getHandler?.();
      const camera = this.cameras?.main;
      return {
        phase: {
          current: currentPhase?.phaseName ?? null,
          standby: standbyPhase?.phaseName ?? null,
        },
        battle: {
          wave: this.currentBattle?.waveIndex ?? null,
          battleType: this.currentBattle?.battleType ?? null,
          biome: this.arena?.biomeId ?? null,
        },
        ui: {
          mode: this.ui?.getMode?.() ?? null,
          handler: handler?.constructor?.name ?? null,
          containerAlpha: this.uiContainer?.alpha ?? null,
          containerVisible: this.uiContainer?.visible ?? null,
          alpha: this.ui?.alpha ?? null,
          visible: this.ui?.visible ?? null,
        },
        field: {
          alpha: this.field?.alpha ?? null,
          visible: this.field?.visible ?? null,
          children: this.field?.list?.length ?? null,
          backgroundTexture: this.arenaBg?.texture?.key ?? null,
          backgroundAlpha: this.arenaBg?.alpha ?? null,
          backgroundVisible: this.arenaBg?.visible ?? null,
        },
        camera: {
          alpha: camera?.alpha ?? null,
          visible: camera?.visible ?? null,
          fadeRunning: (camera as any)?.fadeEffect?.isRunning ?? null,
          fadeProgress: (camera as any)?.fadeEffect?.progress ?? null,
        },
        loaderActive: this.load?.isLoading?.() ?? null,
      };
    });
    runtimeDiagnostics?.checkpoint?.("battle-scene:create-complete", {
      scene: "battle",
      biome: this.arena?.biomeId ?? null,
      wave: this.currentBattle?.waveIndex ?? null,
    }, true);
  }

  update()`;
if (!battleScene.includes(battleLaunchReplacement)) {
  if (battleScene.includes(previousBattleLaunchReplacement)) {
    battleScene = battleScene.replace(previousBattleLaunchReplacement, battleLaunchReplacement);
  } else if (battleScene.includes(battleLaunchAnchor)) {
    battleScene = battleScene.replace(battleLaunchAnchor, battleLaunchReplacement);
  } else {
    fail("Could not find the BattleScene launch diagnostic anchor");
  }
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
const previousBiomeClearEndReplacement = `      if (this.textures.exists(key)) {
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
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.maintenance?.("biome-assets-cleared", {
      biome,
      biomeKey: btKey,
    }, true);
  }

  updateFieldScale`;
if (!battleScene.includes(biomeClearEndReplacement)) {
  if (battleScene.includes(previousBiomeClearEndReplacement)) {
    battleScene = battleScene.replace(previousBiomeClearEndReplacement, biomeClearEndReplacement);
  } else if (battleScene.includes(biomeClearEndAnchor)) {
    battleScene = battleScene.replace(biomeClearEndAnchor, biomeClearEndReplacement);
  } else {
    fail("Could not find the biome cleanup completion diagnostic anchor in BattleScene");
  }
}

const resetStartAnchor = `  reset(clearScene = false, clearData = false, reloadI18n = false): void {
    if (clearData) {`;
const resetStartReplacement = `  reset(clearScene = false, clearData = false, reloadI18n = false): void {
    const switchResetStartedAt = performance.now();
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.checkpoint?.("scene-reset:start", {
      clearScene,
      clearData,
      reloadI18n,
      children: this.children?.list?.length ?? null,
      uiChildren: this.uiContainer?.list?.length ?? null,
    }, true);
    if (clearData) {`;
if (!battleScene.includes(resetStartReplacement)) {
  if (!battleScene.includes(resetStartAnchor)) {
    fail("Could not find the BattleScene reset start diagnostic anchor");
  }
  battleScene = battleScene.replace(resetStartAnchor, resetStartReplacement);
}

const resetClearSceneAnchor = `    if (clearScene) {
      // Reload variant data in case sprite set has changed
      this.initVariantData();

      audioManager.fadeOutBgm(250);`;
const resetClearSceneReplacement = `    if (clearScene) {
      switchDiagnostics?.checkpoint?.("scene-reset:clear-scene-start", {
        elapsedMs: Math.round(performance.now() - switchResetStartedAt),
      }, true);
      // Reload variant data in case sprite set has changed
      this.initVariantData();
      switchDiagnostics?.checkpoint?.("scene-reset:variant-data-requested", {
        elapsedMs: Math.round(performance.now() - switchResetStartedAt),
      }, true);

      audioManager.fadeOutBgm(250);`;
if (!battleScene.includes(resetClearSceneReplacement)) {
  if (!battleScene.includes(resetClearSceneAnchor)) {
    fail("Could not find the BattleScene clear-scene diagnostic anchor");
  }
  battleScene = battleScene.replace(resetClearSceneAnchor, resetClearSceneReplacement);
}

const resetDestroyAnchor = `        onComplete: () => {
          this.ui.freeUIData();
          this.uiContainer.remove(this.ui, true);
          this.uiContainer.destroy();
          this.children.removeAll(true);
          // TODO: Do we even need this?
          this.game.domContainer.innerHTML = "";
          // TODO: \`launchBattle\` calls \`reset(false, false, true)\`
          this.launchBattle();
        },`;
const resetDestroyReplacement = `        onComplete: () => {
          switchDiagnostics?.checkpoint?.("scene-reset:destroy-start", {
            elapsedMs: Math.round(performance.now() - switchResetStartedAt),
            children: this.children?.list?.length ?? null,
            uiChildren: this.uiContainer?.list?.length ?? null,
          }, true);
          this.ui.freeUIData();
          this.uiContainer.remove(this.ui, true);
          this.uiContainer.destroy();
          this.children.removeAll(true);
          // TODO: Do we even need this?
          this.game.domContainer.innerHTML = "";
          switchDiagnostics?.checkpoint?.("scene-reset:destroy-complete", {
            elapsedMs: Math.round(performance.now() - switchResetStartedAt),
            children: this.children?.list?.length ?? null,
          }, true);
          // TODO: \`launchBattle\` calls \`reset(false, false, true)\`
          this.launchBattle();
          switchDiagnostics?.checkpoint?.("scene-reset:launch-returned", {
            elapsedMs: Math.round(performance.now() - switchResetStartedAt),
          }, true);
        },`;
if (!battleScene.includes(resetDestroyReplacement)) {
  if (!battleScene.includes(resetDestroyAnchor)) {
    fail("Could not find the BattleScene destroy diagnostic anchor");
  }
  battleScene = battleScene.replace(resetDestroyAnchor, resetDestroyReplacement);
}

const resetEndAnchor = `      });
    }
  }

  // TODO: Invert the chances for this`;
const resetEndReplacement = `      });
    } else {
      switchDiagnostics?.checkpoint?.("scene-reset:complete", {
        clearScene,
        clearData,
        reloadI18n,
        elapsedMs: Math.round(performance.now() - switchResetStartedAt),
      }, true);
    }
  }

  // TODO: Invert the chances for this`;
if (!battleScene.includes(resetEndReplacement)) {
  if (!battleScene.includes(resetEndAnchor)) {
    fail("Could not find the BattleScene reset completion diagnostic anchor");
  }
  battleScene = battleScene.replace(resetEndAnchor, resetEndReplacement);
}
write(battleScenePath, battleScene);

let phase = read(phasePath);
const phaseEndAnchor = `  public end(): void {
    globalScene.phaseManager.shiftPhase();
  }`;
const phaseEndReplacement = `  public end(): void {
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.phase?.("end", this.phaseName, {
      wave: globalScene.currentBattle?.waveIndex ?? null,
      biome: globalScene.arena?.biomeId ?? null,
    });
    globalScene.phaseManager.shiftPhase();
  }`;
if (!phase.includes(phaseEndReplacement)) {
  if (!phase.includes(phaseEndAnchor)) {
    fail("Could not find the base Phase end diagnostic anchor");
  }
  phase = phase.replace(phaseEndAnchor, phaseEndReplacement);
}
write(phasePath, phase);

let phaseManager = read(phaseManagerPath);
const phaseStartAnchor = `  private startCurrentPhase(): void {
    console.log(\`%cStart Phase \${this.currentPhase.phaseName}\`, \`color:\${PHASE_START_COLOR};\`);
    this.currentPhase.start();
  }`;
const phaseStartReplacement = `  private startCurrentPhase(): void {
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.phase?.("start", this.currentPhase.phaseName, {
      wave: globalScene.currentBattle?.waveIndex ?? null,
      biome: globalScene.arena?.biomeId ?? null,
    });
    console.log(\`%cStart Phase \${this.currentPhase.phaseName}\`, \`color:\${PHASE_START_COLOR};\`);
    this.currentPhase.start();
  }`;
if (!phaseManager.includes(phaseStartReplacement)) {
  if (!phaseManager.includes(phaseStartAnchor)) {
    fail("Could not find the PhaseManager start diagnostic anchor");
  }
  phaseManager = phaseManager.replace(phaseStartAnchor, phaseStartReplacement);
}
write(phaseManagerPath, phaseManager);

let attemptCapturePhase = read(attemptCapturePhasePath);
const captureStartAnchor = `    const pokemon = this.getPokemon() as EnemyPokemon;

    if (!pokemon?.hp) {`;
const captureStartReplacement = `    const pokemon = this.getPokemon() as EnemyPokemon;
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.checkpoint?.("capture:start", {
      wave: globalScene.currentBattle?.waveIndex ?? null,
      biome: globalScene.arena?.biomeId ?? null,
      battlerIndex: this.battlerIndex,
      name: pokemon?.name ?? null,
      species: pokemon?.species?.speciesId ?? null,
      hp: pokemon?.hp ?? null,
      maxHp: pokemon?.getMaxHp?.() ?? null,
      partySize: globalScene.getPlayerParty?.()?.length ?? null,
    }, true);

    if (!pokemon?.hp) {`;
if (!attemptCapturePhase.includes(captureStartReplacement)) {
  if (!attemptCapturePhase.includes(captureStartAnchor)) {
    fail("Could not find the AttemptCapturePhase start diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(captureStartAnchor, captureStartReplacement);
}

const catchStartAnchor = `  catch() {
    const pokemon = this.getPokemon() as EnemyPokemon;

    const speciesForm`;
const catchStartReplacement = `  catch() {
    const pokemon = this.getPokemon() as EnemyPokemon;
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.checkpoint?.("capture:success-entered", {
      wave: globalScene.currentBattle?.waveIndex ?? null,
      biome: globalScene.arena?.biomeId ?? null,
      battlerIndex: this.battlerIndex,
      name: pokemon?.name ?? null,
      species: pokemon?.species?.speciesId ?? null,
      hp: pokemon?.hp ?? null,
      maxHp: pokemon?.getMaxHp?.() ?? null,
      partySize: globalScene.getPlayerParty?.()?.length ?? null,
    }, true);

    const speciesForm`;
if (!attemptCapturePhase.includes(catchStartReplacement)) {
  if (!attemptCapturePhase.includes(catchStartAnchor)) {
    fail("Could not find the AttemptCapturePhase success diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(catchStartAnchor, catchStartReplacement);
}

const captureInfoAnchor = `    globalScene.pokemonInfoContainer.show(pokemon, true);

    globalScene.gameData.updateSpeciesDexIvs`;
const captureInfoReplacement = `    globalScene.pokemonInfoContainer.show(pokemon, true);
    switchDiagnostics?.checkpoint?.("capture:info-shown", {
      wave: globalScene.currentBattle?.waveIndex ?? null,
      partySize: globalScene.getPlayerParty?.()?.length ?? null,
      uiMode: globalScene.ui?.getMode?.() ?? null,
    });

    globalScene.gameData.updateSpeciesDexIvs`;
if (!attemptCapturePhase.includes(captureInfoReplacement)) {
  if (!attemptCapturePhase.includes(captureInfoAnchor)) {
    fail("Could not find the AttemptCapturePhase info diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(captureInfoAnchor, captureInfoReplacement);
}

const captureEndAnchor = `        const end = () => {
          globalScene.phaseManager.unshiftNew("VictoryPhase", this.battlerIndex);`;
const captureEndReplacement = `        const end = () => {
          switchDiagnostics?.checkpoint?.("capture:queue-victory", {
            wave: globalScene.currentBattle?.waveIndex ?? null,
            partySize: globalScene.getPlayerParty?.()?.length ?? null,
            uiMode: globalScene.ui?.getMode?.() ?? null,
          }, true);
          globalScene.phaseManager.unshiftNew("VictoryPhase", this.battlerIndex);`;
if (!attemptCapturePhase.includes(captureEndReplacement)) {
  if (!attemptCapturePhase.includes(captureEndAnchor)) {
    fail("Could not find the AttemptCapturePhase end diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(captureEndAnchor, captureEndReplacement);
}

const addToPartyAnchor = `        const addToParty = (slotIndex?: number) => {
          const newPokemon = pokemon.addToParty(this.pokeballType, slotIndex);`;
const addToPartyReplacement = `        const addToParty = (slotIndex?: number) => {
          switchDiagnostics?.checkpoint?.("capture:add-to-party-start", {
            wave: globalScene.currentBattle?.waveIndex ?? null,
            slotIndex: slotIndex ?? null,
            partySize: globalScene.getPlayerParty?.()?.length ?? null,
          }, true);
          const newPokemon = pokemon.addToParty(this.pokeballType, slotIndex);`;
if (!attemptCapturePhase.includes(addToPartyReplacement)) {
  if (!attemptCapturePhase.includes(addToPartyAnchor)) {
    fail("Could not find the AttemptCapturePhase add-to-party diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(addToPartyAnchor, addToPartyReplacement);
}

const newPartyAssetsAnchor = `              newPokemon.leaveField(true, true, false);
              newPokemon.loadAssets().then(end);`;
const newPartyAssetsReplacement = `              newPokemon.leaveField(true, true, false);
              switchDiagnostics?.checkpoint?.("capture:new-party-assets-start", {
                wave: globalScene.currentBattle?.waveIndex ?? null,
                partySize: globalScene.getPlayerParty?.()?.length ?? null,
              }, true);
              newPokemon.loadAssets().then(() => {
                switchDiagnostics?.checkpoint?.("capture:new-party-assets-complete", {
                  wave: globalScene.currentBattle?.waveIndex ?? null,
                  partySize: globalScene.getPlayerParty?.()?.length ?? null,
                }, true);
                end();
              });`;
if (!attemptCapturePhase.includes(newPartyAssetsReplacement)) {
  if (!attemptCapturePhase.includes(newPartyAssetsAnchor)) {
    fail("Could not find the AttemptCapturePhase party asset diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(newPartyAssetsAnchor, newPartyAssetsReplacement);
}

const capturePersistAnchor = `        Promise.all([pokemon.hideInfo(), globalScene.gameData.setPokemonCaught(pokemon)]).then(() => {
          if (!addStatus.value) {`;
const capturePersistReplacement = `        switchDiagnostics?.checkpoint?.("capture:persist-start", {
          wave: globalScene.currentBattle?.waveIndex ?? null,
          partySize: globalScene.getPlayerParty?.()?.length ?? null,
        }, true);
        Promise.all([pokemon.hideInfo(), globalScene.gameData.setPokemonCaught(pokemon)]).then(() => {
          switchDiagnostics?.checkpoint?.("capture:persist-complete", {
            wave: globalScene.currentBattle?.waveIndex ?? null,
            partySize: globalScene.getPlayerParty?.()?.length ?? null,
            addAllowed: addStatus.value,
          }, true);
          if (!addStatus.value) {`;
if (!attemptCapturePhase.includes(capturePersistReplacement)) {
  if (!attemptCapturePhase.includes(capturePersistAnchor)) {
    fail("Could not find the AttemptCapturePhase persistence diagnostic anchor");
  }
  attemptCapturePhase = attemptCapturePhase.replace(capturePersistAnchor, capturePersistReplacement);
}
write(attemptCapturePhasePath, attemptCapturePhase);

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

let sceneBase = read(sceneBasePath);
const loadBgmAnchor = `    this.load.audio(key, getCachedUrl(\`audio/bgm/\${key}.mp3\`));
    await new Promise<void>((resolve, reject) => {
      const onError = (file: Phaser.Loader.File) => {
        if (file.key === key) {
          this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
          reject(new Error(\`Failed to load BGM: \${key}\`));
        }
      };
      this.load.once(\`filecomplete-audio-\${key}\`, () => {
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
        resolve();
      });
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      this.load.start();
    });`;
const loadBgmReplacement = `    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    const url = getCachedUrl(\`audio/bgm/\${key}.mp3\`);
    switchDiagnostics?.audio?.("bgm-load-requested", {
      key,
      url,
      cacheHit: false,
      loaderActive: this.load.isLoading(),
    }, true);

    let queued = false;
    const onAdd = (fileKey: string, type: string) => {
      if (fileKey === key && type === "audio") {
        queued = true;
      }
    };
    this.load.on(Phaser.Loader.Events.ADD, onAdd);
    this.load.audio(key, url);
    this.load.off(Phaser.Loader.Events.ADD, onAdd);
    if (!queued && !this.cache.audio.exists(key)) {
      switchDiagnostics?.audio?.("bgm-not-queued", {
        key,
        url,
        deviceAudio: this.game.device?.audio ?? null,
      }, true);
      throw new Error(\`BGM was not queued for this device: \${key}\`);
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (file: Phaser.Loader.File) => {
        if (file.key === key) {
          this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
          switchDiagnostics?.audio?.("bgm-load-failed", {
            key,
            url,
            state: file.state,
          }, true);
          reject(new Error(\`Failed to load BGM: \${key}\`));
        }
      };
      this.load.once(\`filecomplete-audio-\${key}\`, () => {
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
        switchDiagnostics?.audio?.("bgm-load-complete", {
          key,
          url,
          cached: this.cache.audio.exists(key),
        }, true);
        resolve();
      });
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      this.load.start();
      switchDiagnostics?.audio?.("bgm-loader-started", {
        key,
        loaderActive: this.load.isLoading(),
        totalToLoad: this.load.totalToLoad,
      }, true);
    });`;
if (!sceneBase.includes(loadBgmReplacement)) {
  if (!sceneBase.includes(loadBgmAnchor)) {
    fail("Could not find the SceneBase BGM loading diagnostic anchor");
  }
  sceneBase = sceneBase.replace(loadBgmAnchor, loadBgmReplacement);
}
write(sceneBasePath, sceneBase);

let backgroundMusic = read(backgroundMusicPath);
const bgmConstructorAnchor = `    this.key = key;
    BackgroundMusic.refCounts.set(key, (BackgroundMusic.refCounts.get(key) ?? 0) + 1);

    globalScene
      .loadBgm(key)
      .then(() => {
        if (this.destroyed) {
          return;
        }
        this.sound = globalScene.sound.add(key, { loop });`;
const bgmConstructorReplacement = `    this.key = key;
    BackgroundMusic.refCounts.set(key, (BackgroundMusic.refCounts.get(key) ?? 0) + 1);
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    switchDiagnostics?.audio?.("bgm-created", {
      key,
      loop,
      loopPoint,
      refCount: BackgroundMusic.refCounts.get(key) ?? 0,
    }, true);

    globalScene
      .loadBgm(key)
      .then(() => {
        switchDiagnostics?.audio?.("bgm-ready", {
          key,
          loop,
          destroyed: this.destroyed,
          cached: globalScene.cache.audio.exists(key),
        }, true);
        if (this.destroyed) {
          return;
        }
        this.sound = globalScene.sound.add(key, { loop });
        switchDiagnostics?.audio?.("bgm-sound-created", {
          key,
          loop,
          durationSeconds: this.sound.duration,
        }, true);`;
if (
  !backgroundMusic.includes(bgmConstructorReplacement)
  && !backgroundMusic.includes('"bgm-created"')
) {
  if (!backgroundMusic.includes(bgmConstructorAnchor)) {
    fail("Could not find the BackgroundMusic constructor diagnostic anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmConstructorAnchor, bgmConstructorReplacement);
}

const bgmEndListenerAnchor = `        } else {
          this.sound.once("complete", () => this.triggerEnd());
          // Defensive, "complete" should be the right event but Phaser docs aren't very clear
          this.sound.once("stop", () => this.triggerEnd());
        }
        this.runPendingCalls();
      })
      .catch(() => this.destroy());`;
const bgmEndListenerReplacement = `        } else {
          this.sound.once("complete", () => this.triggerEnd("complete"));
          // Defensive, "complete" should be the right event but Phaser docs aren't very clear
          this.sound.once("stop", () => this.triggerEnd("stop"));
        }
        this.runPendingCalls();
      })
      .catch(error => {
        switchDiagnostics?.audio?.("bgm-load-rejected", {
          key,
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : null,
          stack: error instanceof Error ? error.stack ?? null : null,
        }, true);
        this.destroy();
      });`;
if (!backgroundMusic.includes(bgmEndListenerReplacement)) {
  if (!backgroundMusic.includes(bgmEndListenerAnchor)) {
    fail("Could not find the BackgroundMusic end-listener diagnostic anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmEndListenerAnchor, bgmEndListenerReplacement);
}

const bgmNativeLoopAnchor = `        this.sound = globalScene.sound.add(key, { loop });
        switchDiagnostics?.audio?.("bgm-sound-created", {
          key,
          loop,
          durationSeconds: this.sound.duration,
        }, true);
        if (loop) {
          this.sound.on("looped", () => {
            if (!this.destroyed) {
              this.sound?.play({ seek: loopPoint });
            }
          });
        } else {`;
const bgmNativeLoopReplacement = `        // nx.js does not reliably advance Phaser's native WebAudio loop source.
        // Drive looping from the ordinary completion event so a finished BGM
        // cannot remain silently registered as the current track.
        this.sound = globalScene.sound.add(key, { loop: false });
        switchDiagnostics?.audio?.("bgm-sound-created", {
          key,
          loop,
          nativeLoop: false,
          durationSeconds: this.sound.duration,
        }, true);
        if (loop) {
          this.sound.on("complete", () => {
            if (this.destroyed || !this.sound) {
              return;
            }
            const restarted = this.sound.play({ seek: loopPoint });
            switchDiagnostics?.audio?.("bgm-loop-restarted", {
              key,
              loopPoint,
              restarted,
              durationSeconds: this.sound.duration,
            }, true);
          });
        } else {`;
if (!backgroundMusic.includes(bgmNativeLoopReplacement)) {
  if (!backgroundMusic.includes(bgmNativeLoopAnchor)) {
    fail("Could not find the BackgroundMusic native-loop anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmNativeLoopAnchor, bgmNativeLoopReplacement);
}

const bgmPlayAnchor = `      if (!sound.isPlaying) {
        sound.play();
      }`;
const bgmPlayReplacement = `      if (!sound.isPlaying) {
        const started = sound.play();
        (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.("bgm-play", {
          key: this.key,
          started,
          durationSeconds: sound.duration,
          loop: sound.loop,
          volume: sound.volume,
        }, true);
      }`;
if (!backgroundMusic.includes(bgmPlayReplacement)) {
  if (!backgroundMusic.includes(bgmPlayAnchor)) {
    fail("Could not find the BackgroundMusic play diagnostic anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmPlayAnchor, bgmPlayReplacement);
}

const bgmTriggerEndAnchor = `  private triggerEnd(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    const callbacks = this.endCallbacks.splice(0);`;
const bgmTriggerEndReplacement = `  private triggerEnd(reason: "complete" | "stop" | "destroy"): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.("bgm-ended", {
      key: this.key,
      reason,
      callbackCount: this.endCallbacks.length,
      destroyed: this.destroyed,
    }, true);
    const callbacks = this.endCallbacks.splice(0);`;
if (!backgroundMusic.includes(bgmTriggerEndReplacement)) {
  if (!backgroundMusic.includes(bgmTriggerEndAnchor)) {
    fail("Could not find the BackgroundMusic end diagnostic anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmTriggerEndAnchor, bgmTriggerEndReplacement);
}

const bgmDestroyAnchor = `    this.destroyed = true;
    this.pendingCalls.length = 0;
    this.triggerEnd();
    if (this.sound?.isPlaying) {`;
const bgmDestroyReplacement = `    this.destroyed = true;
    this.pendingCalls.length = 0;
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.("bgm-destroy", {
      key: this.key,
      wasPlaying: this.sound?.isPlaying ?? false,
      cached: globalScene.cache.audio.exists(this.key),
      refCountBefore: BackgroundMusic.refCounts.get(this.key) ?? 0,
    }, true);
    this.triggerEnd("destroy");
    if (this.sound?.isPlaying) {`;
if (!backgroundMusic.includes(bgmDestroyReplacement)) {
  if (!backgroundMusic.includes(bgmDestroyAnchor)) {
    fail("Could not find the BackgroundMusic destroy diagnostic anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmDestroyAnchor, bgmDestroyReplacement);
}

const bgmCacheRemoveAnchor = `    if (remaining <= 0) {
      BackgroundMusic.refCounts.delete(this.key);
      globalScene.cache.audio.remove(this.key);
    } else {`;
const bgmCacheRemoveReplacement = `    if (remaining <= 0) {
      BackgroundMusic.refCounts.delete(this.key);
      globalScene.cache.audio.remove(this.key);
      (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.audio?.("bgm-cache-removed", {
        key: this.key,
        remaining,
      }, true);
    } else {`;
if (!backgroundMusic.includes(bgmCacheRemoveReplacement)) {
  if (!backgroundMusic.includes(bgmCacheRemoveAnchor)) {
    fail("Could not find the BackgroundMusic cache-removal diagnostic anchor");
  }
  backgroundMusic = backgroundMusic.replace(bgmCacheRemoveAnchor, bgmCacheRemoveReplacement);
}
write(backgroundMusicPath, backgroundMusic);

let audioManager = read(audioManagerPath);
const bgmHandoffAnchor = `    const previous = this.currentBgm;
    const newBgm = new BackgroundMusic(resolvedName, loop, loopPoint);
    this.currentBgm = newBgm;

    globalScene.ui.bgmBar.setBgmToBgmBar(resolvedName);

    const volume = this.getVolume(VolumeSetting.BGM);

    if (fadeOutPrevious && previous?.isPlaying) {
      previous.fadeOut(fadeDuration, true);
      newBgm.playAfterDelay(fixedInt(fadeDuration + 250), volume);
    } else {
      previous?.destroy();
      newBgm.play(volume);
    }`;
const bgmHandoffReplacement = `    const previous = this.currentBgm;
    const shouldOverlapForFade = Boolean(fadeOutPrevious && previous?.isPlaying);
    if (!shouldOverlapForFade) {
      // BackgroundMusic starts decoding in its constructor. Release the old
      // decoded track first on non-fading transitions so two full BGM buffers
      // do not overlap during ordinary encounter/battle handoffs.
      previous?.destroy();
    }
    const newBgm = new BackgroundMusic(resolvedName, loop, loopPoint);
    this.currentBgm = newBgm;

    globalScene.ui.bgmBar.setBgmToBgmBar(resolvedName);

    const volume = this.getVolume(VolumeSetting.BGM);

    if (shouldOverlapForFade) {
      previous!.fadeOut(fadeDuration, true);
      newBgm.playAfterDelay(fixedInt(fadeDuration + 250), volume);
    } else {
      newBgm.play(volume);
    }`;
if (!audioManager.includes(bgmHandoffReplacement)) {
  if (!audioManager.includes(bgmHandoffAnchor)) {
    fail("Could not find the AudioManager BGM handoff anchor");
  }
  audioManager = audioManager.replace(bgmHandoffAnchor, bgmHandoffReplacement);
}
write(audioManagerPath, audioManager);

let partyHealPhase = read(partyHealPhasePath);
const partyHealAnchor = `      const healSound = this.resumeBgm
        ? audioManager.replaceBgmUntilEnd("bw/heal")
        : audioManager.playBgm("bw/heal", false, false);
      if (healSound == null) {
        this.end();
      } else {
        healSound.onEnd(() => this.end());
      }`;
const partyHealReplacement = `      const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
      let completed = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const finish = (reason: "audio-ended" | "sound-unavailable" | "watchdog-timeout") => {
        if (completed) {
          return;
        }
        completed = true;
        if (watchdog !== null) {
          clearTimeout(watchdog);
          watchdog = null;
        }
        switchDiagnostics?.checkpoint?.("party-heal:finish", {
          reason,
          resumeBgm: this.resumeBgm,
          wave: globalScene.currentBattle?.waveIndex ?? null,
          biome: globalScene.arena?.biomeId ?? null,
        }, true);
        this.end();
      };

      switchDiagnostics?.checkpoint?.("party-heal:audio-request", {
        key: "bw/heal",
        resumeBgm: this.resumeBgm,
        cached: globalScene.cache.audio.exists("bw/heal"),
      }, true);
      const healSound = this.resumeBgm
        ? audioManager.replaceBgmUntilEnd("bw/heal")
        : audioManager.playBgm("bw/heal", false, false);
      if (healSound == null) {
        finish("sound-unavailable");
      } else {
        healSound.onEnd(() => finish("audio-ended"));
        if (!completed) {
          watchdog = setTimeout(() => {
            switchDiagnostics?.audio?.("party-heal-watchdog-timeout", {
              key: "bw/heal",
              resumeBgm: this.resumeBgm,
              cached: globalScene.cache.audio.exists("bw/heal"),
              isPlaying: healSound.isPlaying,
            }, true);
            finish("watchdog-timeout");
          }, 5000);
        }
      }`;
if (!partyHealPhase.includes(partyHealReplacement)) {
  const previousWatchdogTail = `        healSound.onEnd(() => finish("audio-ended"));
        watchdog = setTimeout(() => {
          switchDiagnostics?.audio?.("party-heal-watchdog-timeout", {
            key: "bw/heal",
            resumeBgm: this.resumeBgm,
            cached: globalScene.cache.audio.exists("bw/heal"),
            isPlaying: healSound.isPlaying,
          }, true);
          finish("watchdog-timeout");
        }, 5000);`;
  const watchdogTail = `        healSound.onEnd(() => finish("audio-ended"));
        if (!completed) {
          watchdog = setTimeout(() => {
            switchDiagnostics?.audio?.("party-heal-watchdog-timeout", {
              key: "bw/heal",
              resumeBgm: this.resumeBgm,
              cached: globalScene.cache.audio.exists("bw/heal"),
              isPlaying: healSound.isPlaying,
            }, true);
            finish("watchdog-timeout");
          }, 5000);
        }`;
  if (partyHealPhase.includes(previousWatchdogTail)) {
    partyHealPhase = partyHealPhase.replace(previousWatchdogTail, watchdogTail);
  } else if (!partyHealPhase.includes(partyHealAnchor)) {
    fail("Could not find the PartyHealPhase audio watchdog anchor");
  } else {
    partyHealPhase = partyHealPhase.replace(partyHealAnchor, partyHealReplacement);
  }
}
write(partyHealPhasePath, partyHealPhase);

let selectModifierPhase = read(selectModifierPhasePath);
const rerollDelayFieldAnchor = `  private claimedRewardIndices: Set<number>;

  private typeOptions: ModifierTypeOption[];`;
const rerollDelayFieldReplacement = `  private claimedRewardIndices: Set<number>;
  private switchRerollCleanupDelayComplete = false;

  private typeOptions: ModifierTypeOption[];`;
if (!selectModifierPhase.includes(rerollDelayFieldReplacement)) {
  if (!selectModifierPhase.includes(rerollDelayFieldAnchor)) {
    fail("Could not find the SelectModifierPhase cleanup-delay field anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(rerollDelayFieldAnchor, rerollDelayFieldReplacement);
}

const rerollStartAnchor = `  start() {
    super.start();

    // A retry phase begins only after the TM / Memory phase has completed.`;
const rerollStartReplacement = `  start() {
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    const switchApi = (globalThis as any).Switch;
    const memory = typeof switchApi?.memoryUsage === "function" ? switchApi.memoryUsage() : null;
    const nativeUsedMiB = memory ? memory.nativeHeapUsed / 1048576 : 0;
    if (this.rerollCount > 0 && !this.switchRerollCleanupDelayComplete && nativeUsedMiB >= 2450) {
      this.switchRerollCleanupDelayComplete = true;
      const delayMs = nativeUsedMiB >= 2600 ? 2500 : nativeUsedMiB >= 2450 ? 1500 : 1000;
      let gcRequested = false;
      try {
        if (typeof (globalThis as any).gc === "function") {
          (globalThis as any).gc();
          gcRequested = true;
        }
      } catch (error) {
        switchDiagnostics?.checkpoint?.("reward:reroll-gc-failed", {
          rerollCount: this.rerollCount,
          message: error instanceof Error ? error.message : String(error),
        }, true);
      }
      switchDiagnostics?.checkpoint?.("reward:reroll-pressure-cooldown", {
        rerollCount: this.rerollCount,
        delayMs,
        clock: "wall",
        nativeUsedMiB: Math.round(nativeUsedMiB * 100) / 100,
        nativeFreeMiB: memory ? Math.round((memory.nativeHeapFree / 1048576) * 100) / 100 : null,
        gcRequested,
      }, true);
      globalThis.setTimeout(() => {
        switchDiagnostics?.checkpoint?.("reward:reroll-pressure-resume", {
          rerollCount: this.rerollCount,
        }, true);
        this.start();
      }, delayMs);
      return;
    }

    super.start();

    // A retry phase begins only after the TM / Memory phase has completed.`;
if (!selectModifierPhase.includes(rerollStartReplacement)) {
  if (!selectModifierPhase.includes(rerollStartAnchor)) {
    fail("Could not find the SelectModifierPhase cleanup-delay start anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(rerollStartAnchor, rerollStartReplacement);
}

const rerollRequestAnchor = `    globalScene.reroll = true;
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",`;
const rerollRequestReplacement = `    const switchApi = (globalThis as any).Switch;
    const switchDiagnostics = (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__;
    const switchRerollState = this as any;
    let switchMemory = typeof switchApi?.memoryUsage === "function" ? switchApi.memoryUsage() : null;
    const switchNativeUsedBeforeGcMiB = switchMemory ? switchMemory.nativeHeapUsed / 1048576 : 0;
    const switchRerollRecoveryThresholdMiB = 2450;
    if (switchNativeUsedBeforeGcMiB >= switchRerollRecoveryThresholdMiB) {
      let gcRequested = false;
      try {
        if (typeof (globalThis as any).gc === "function") {
          (globalThis as any).gc();
          gcRequested = true;
        }
      } catch (error) {
        switchDiagnostics?.checkpoint?.("reward:reroll-gc-failed", {
          rerollCount: this.rerollCount,
          message: error instanceof Error ? error.message : String(error),
        }, true);
      }
      switchMemory = typeof switchApi?.memoryUsage === "function" ? switchApi.memoryUsage() : switchMemory;
      switchDiagnostics?.checkpoint?.("reward:reroll-pressure-recovery", {
        rerollCount: this.rerollCount,
        nativeUsedBeforeGcMiB: Math.round(switchNativeUsedBeforeGcMiB * 100) / 100,
        nativeUsedAfterGcMiB: switchMemory
          ? Math.round((switchMemory.nativeHeapUsed / 1048576) * 100) / 100
          : null,
        nativeFreeAfterGcMiB: switchMemory
          ? Math.round((switchMemory.nativeHeapFree / 1048576) * 100) / 100
          : null,
        gcRequested,
      }, true);
    }
    const switchNativeUsedMiB = switchMemory ? switchMemory.nativeHeapUsed / 1048576 : 0;
    const switchRerollSafetyLimitMiB = 2600;
    if (switchNativeUsedMiB >= switchRerollSafetyLimitMiB) {
      switchDiagnostics?.checkpoint?.("reward:reroll-blocked-memory", {
        rerollCount: this.rerollCount,
        nativeUsedMiB: Math.round(switchNativeUsedMiB * 100) / 100,
        nativeFreeMiB: switchMemory
          ? Math.round((switchMemory.nativeHeapFree / 1048576) * 100) / 100
          : null,
        safetyLimitMiB: switchRerollSafetyLimitMiB,
        latched: false,
      }, true);
      globalScene.ui.playError();
      return false;
    }

    globalScene.reroll = true;
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("reward:reroll-requested", {
      rerollCount: this.rerollCount,
      nextRerollCount: this.rerollCount + 1,
      rewardCount: this.typeOptions.length,
      lockModifierTiers: globalScene.lockModifierTiers,
      rerollCost,
    }, true);
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",`;
if (
  !selectModifierPhase.includes(rerollRequestReplacement)
  && !selectModifierPhase.includes('"reward:reroll-requested"')
) {
  if (!selectModifierPhase.includes(rerollRequestAnchor)) {
    fail("Could not find the SelectModifierPhase reroll diagnostic anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(rerollRequestAnchor, rerollRequestReplacement);
}

const rerollPhaseTransitionAnchor = `    globalScene.reroll = true;
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("reward:reroll-requested", {
      rerollCount: this.rerollCount,
      nextRerollCount: this.rerollCount + 1,
      rewardCount: this.typeOptions.length,
      lockModifierTiers: globalScene.lockModifierTiers,
      rerollCost,
    }, true);
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",
      this.rerollCount + 1,
      this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[],
    );
    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE).then(() => super.end());
    if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      globalScene.money -= rerollCost;
      globalScene.updateMoneyText();
      globalScene.animateMoneyChanged(false);
    }
    audioManager.playSound("se/buy");
    return true;`;
const rerollPhaseTransitionReplacement = `    const nextRerollCount = this.rerollCount + 1;
    const nextModifierTiers =
      this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[];
    const modifierCount = this.getModifierCount();
    const uiHandler = globalScene.ui.getHandler() as ModifierSelectUiHandler;

    switchDiagnostics?.checkpoint?.("reward:reroll-requested", {
      rerollCount: this.rerollCount,
      nextRerollCount,
      rewardCount: this.typeOptions.length,
      lockModifierTiers: globalScene.lockModifierTiers,
      rerollCost,
      reuseEligible: uiHandler.canReuseRewardOptions(modifierCount),
    }, true);

    if (!uiHandler.canReuseRewardOptions(modifierCount)) {
      globalScene.reroll = true;
      switchDiagnostics?.checkpoint?.("reward:ui-reuse-fallback", {
        rerollCount: this.rerollCount,
        nextRerollCount,
        currentRewardCount: this.typeOptions.length,
        nextRewardCount: modifierCount,
      }, true);
      globalScene.phaseManager.unshiftNew(
        "SelectModifierPhase",
        nextRerollCount,
        nextModifierTiers,
      );
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.MESSAGE).then(() => super.end());
      if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
        globalScene.money -= rerollCost;
        globalScene.updateMoneyText();
        globalScene.animateMoneyChanged(false);
      }
      audioManager.playSound("se/buy");
      return true;
    }

    globalScene.reroll = true;
    this.modifierTiers = nextModifierTiers;
    this.rerollCount = nextRerollCount;
    this.claimedRewardIndices.clear();
    clearPendingClaimAllReward();
    regenerateModifierPoolThresholds(globalScene.getPlayerParty(), this.getPoolType(), this.rerollCount);
    this.typeOptions = this.getModifierTypeOptions(modifierCount);

    if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      globalScene.money -= rerollCost;
      globalScene.updateMoneyText();
      globalScene.animateMoneyChanged(false);
    }

    uiHandler.reuseRewardOptions(
      this.typeOptions,
      this.getRerollCost(globalScene.lockModifierTiers),
    );
    globalScene.reroll = false;
    audioManager.playSound("se/buy");

    const memoryAfterReuse =
      typeof switchApi?.memoryUsage === "function" ? switchApi.memoryUsage() : null;
    switchDiagnostics?.checkpoint?.("reward:ui-reuse-complete", {
      rerollCount: this.rerollCount,
      rewardCount: this.typeOptions.length,
      shopOptionCount: uiHandler.shopOptionsRows.flat().length,
      nativeUsedMiB: memoryAfterReuse
        ? Math.round((memoryAfterReuse.nativeHeapUsed / 1048576) * 100) / 100
        : null,
      nativeFreeMiB: memoryAfterReuse
        ? Math.round((memoryAfterReuse.nativeHeapFree / 1048576) * 100) / 100
        : null,
    }, true);
    return false;`;
if (
  !selectModifierPhase.includes(rerollPhaseTransitionReplacement)
  && !selectModifierPhase.includes('"reward:ui-reuse-complete"')
) {
  if (!selectModifierPhase.includes(rerollPhaseTransitionAnchor)) {
    fail("Could not find the SelectModifierPhase reroll phase-transition anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(
    rerollPhaseTransitionAnchor,
    rerollPhaseTransitionReplacement,
  );
}

const rerollCopiedSettingsAnchor = `    this.claimedRewardIndices.clear();
    clearPendingClaimAllReward();
    regenerateModifierPoolThresholds(globalScene.getPlayerParty(), this.getPoolType(), this.rerollCount);`;
const rerollCopiedSettingsReplacement = `    this.claimedRewardIndices.clear();
    clearPendingClaimAllReward();
    if (this.isCopy) {
      // Claim All copies pin their current rewards as guaranteed options so a
      // deferred party/move selection can return safely. A real reroll must
      // leave that copied state or it will regenerate the same three rewards.
      this.isCopy = false;
      this.customModifierSettings = undefined;
    }
    regenerateModifierPoolThresholds(globalScene.getPlayerParty(), this.getPoolType(), this.rerollCount);`;
if (!selectModifierPhase.includes(rerollCopiedSettingsReplacement)) {
  if (!selectModifierPhase.includes(rerollCopiedSettingsAnchor)) {
    fail("Could not find the SelectModifierPhase copied-settings reroll anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(
    rerollCopiedSettingsAnchor,
    rerollCopiedSettingsReplacement,
  );
}

const multiRewardReturnAnchor = `    return cost === -1;
  }

  // Reroll rewards`;
const multiRewardReturnReplacement = `    return cost === -1
      && !(
        (activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE)
        && !(modifierType instanceof PokemonModifierType)
      );
  }

  // Reroll rewards`;
if (!selectModifierPhase.includes(multiRewardReturnReplacement)) {
  if (!selectModifierPhase.includes(multiRewardReturnAnchor)) {
    fail("Could not find the SelectModifierPhase multi-reward callback-result anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(multiRewardReturnAnchor, multiRewardReturnReplacement);
}

const multiRewardCompleteAnchor = `  private completeMultiReward(rewardIndex: number, modifier: Modifier): void {
    const shouldMarkReward = activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || this.shouldMarkInfiniteReward(modifier);
    if (shouldMarkReward) {
      this.claimedRewardIndices.add(rewardIndex);
    }

    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE);
    globalScene.phaseManager.unshiftPhase(this.copy());
    super.end();
  }`;
const multiRewardCompleteReplacement = `  private completeMultiReward(
    rewardIndex: number,
    modifier: Modifier,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {
    const shouldMarkReward = activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || this.shouldMarkInfiniteReward(modifier);
    if (shouldMarkReward) {
      this.claimedRewardIndices.add(rewardIndex);
    }

    const uiHandler = globalScene.ui.getHandler() as ModifierSelectUiHandler;
    const markedInPlace = shouldMarkReward && uiHandler.markRewardClaimed(rewardIndex);
    // The party/move callback has already returned to MODIFIER_SELECT here.
    // UI.setMode() short-circuits when the requested mode is already active,
    // so call the handler's active-show path directly to restore its callback.
    uiHandler.show([
      this.isPlayer(),
      this.typeOptions,
      modifierSelectCallback,
      this.getRerollCost(globalScene.lockModifierTiers),
      [...this.claimedRewardIndices],
    ]);
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("reward:multi-reused-ui", {
      rewardIndex,
      claimAll: activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE,
      infinite: activeOverrides.INFINITE_REWARDS_OVERRIDE,
      shouldMarkReward,
      claimedRewardCount: this.claimedRewardIndices.size,
      rewardCount: this.typeOptions.length,
      markedInPlace,
      inputRearmed: true,
    }, true);
  }`;
if (!selectModifierPhase.includes(multiRewardCompleteReplacement)) {
  if (!selectModifierPhase.includes(multiRewardCompleteAnchor)) {
    fail("Could not find the SelectModifierPhase multi-reward completion anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(multiRewardCompleteAnchor, multiRewardCompleteReplacement);
}

const multiRewardCompleteCallAnchor = `      this.completeMultiReward(rewardIndex!, modifier);
      return;`;
const multiRewardCompleteCallReplacement = `      this.completeMultiReward(rewardIndex!, modifier, modifierSelectCallback!);
      return;`;
if (!selectModifierPhase.includes(multiRewardCompleteCallReplacement)) {
  if (!selectModifierPhase.includes(multiRewardCompleteCallAnchor)) {
    fail("Could not find the SelectModifierPhase multi-reward completion-call anchor");
  }
  selectModifierPhase = selectModifierPhase.replace(multiRewardCompleteCallAnchor, multiRewardCompleteCallReplacement);
}
write(selectModifierPhasePath, selectModifierPhase);

let modifierSelectUi = read(modifierSelectUiPath);
const modifierCleanupAnchor = `    const options = this.options.concat(this.shopOptionsRows.flat());
    this.options.splice(0, this.options.length);
    this.shopOptionsRows.splice(0, this.shopOptionsRows.length);

    globalScene.tweens.add({`;
const modifierCleanupReplacement = `    const options = this.options.concat(this.shopOptionsRows.flat());
    const rewardOptionCount = this.options.length;
    const shopOptionCount = this.shopOptionsRows.flat().length;
    this.options.splice(0, this.options.length);
    this.shopOptionsRows.splice(0, this.shopOptionsRows.length);
    (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("reward:ui-cleanup-start", {
      rewardOptionCount,
      shopOptionCount,
      totalOptionCount: options.length,
    }, true);

    globalScene.tweens.add({`;
if (!modifierSelectUi.includes(modifierCleanupReplacement)) {
  if (!modifierSelectUi.includes(modifierCleanupAnchor)) {
    fail("Could not find the modifier-select UI cleanup diagnostic anchor");
  }
  modifierSelectUi = modifierSelectUi.replace(modifierCleanupAnchor, modifierCleanupReplacement);
}

const modifierDestroyedAnchor = `        options.forEach(o => {
          o.destroy();
        });
      },
    });`;
const modifierDestroyedReplacement = `        options.forEach(o => {
          o.destroy();
        });
        (globalThis as any).__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.("reward:ui-cleanup-complete", {
          rewardOptionCount,
          shopOptionCount,
          totalOptionCount: options.length,
        }, true);
      },
    });`;
if (!modifierSelectUi.includes(modifierDestroyedReplacement)) {
  if (!modifierSelectUi.includes(modifierDestroyedAnchor)) {
    fail("Could not find the modifier-select UI destroyed diagnostic anchor");
  }
  modifierSelectUi = modifierSelectUi.replace(modifierDestroyedAnchor, modifierDestroyedReplacement);
}

const modifierReuseMethodsAnchor = `  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
const modifierReuseMethodsReplacement = `  canReuseRewardOptions(rewardOptionCount: number): boolean {
    return this.active && this.options.length === rewardOptionCount;
  }

  /**
   * Rebind reward data to the existing Phaser objects on Switch rerolls.
   *
   * Shop rows, controls, cursor, and text canvases remain allocated. This is
   * intentionally synchronous so processInput can immediately restore the
   * existing callback after rerollModifiers returns false.
   */
  reuseRewardOptions(typeOptions: ModifierTypeOption[], rerollCost: number): void {
    if (!this.canReuseRewardOptions(typeOptions.length)) {
      throw new Error("Reward option reuse count mismatch");
    }

    for (let index = 0; index < typeOptions.length; index++) {
      this.options[index].reuse(typeOptions[index]);
    }

    this.rerollCost = rerollCost;
    this.updateCostText();
  }

  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
if (!modifierSelectUi.includes(modifierReuseMethodsReplacement)) {
  if (!modifierSelectUi.includes(modifierReuseMethodsAnchor)) {
    fail("Could not find the modifier-select UI reuse-method anchor");
  }
  modifierSelectUi = modifierSelectUi.replace(modifierReuseMethodsAnchor, modifierReuseMethodsReplacement);
}

const modifierClaimReuseMethodAnchor = `  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
const modifierClaimReuseMethodReplacement = `  markRewardClaimed(rewardIndex: number): boolean {
    const option = this.options[rewardIndex];
    if (!this.active || !option) {
      return false;
    }
    option.markClaimed();
    return true;
  }

  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
if (!modifierSelectUi.includes(modifierClaimReuseMethodReplacement)) {
  if (!modifierSelectUi.includes(modifierClaimReuseMethodAnchor)) {
    fail("Could not find the modifier-select claimed-card reuse anchor");
  }
  modifierSelectUi = modifierSelectUi.replace(
    modifierClaimReuseMethodAnchor,
    modifierClaimReuseMethodReplacement,
  );
}

const modifierClaimedFieldsAnchor = `  private itemText: Phaser.GameObjects.Text;
  private itemCostText: Phaser.GameObjects.Text;`;
const modifierClaimedFieldsReplacement = `  private itemText: Phaser.GameObjects.Text;
  private itemCostText: Phaser.GameObjects.Text;
  private claimedBackground?: Phaser.GameObjects.Rectangle;
  private claimedText?: Phaser.GameObjects.Text;`;
if (!modifierSelectUi.includes(modifierClaimedFieldsReplacement)) {
  if (!modifierSelectUi.includes(modifierClaimedFieldsAnchor)) {
    fail("Could not find the ModifierOption claimed-field anchor");
  }
  modifierSelectUi = modifierSelectUi.replace(modifierClaimedFieldsAnchor, modifierClaimedFieldsReplacement);
}

const modifierMarkClaimedAnchor = `  markClaimed(): void {
    this.item.setTint(0x666666);
    this.itemText.setTint(0x777777);
    this.pb?.setTint(0x555555);

    const claimedBackground = globalScene.add.rectangle(
      0,
      62,
      96,
      18,
      0x000000,
      0.9,
    );
    claimedBackground.setStrokeStyle(2, 0xff3030, 1);
    this.add(claimedBackground);

    const claimedText = addTextObject(
      0,
      56,
      "CLAIMED",
      TextStyle.PARTY_RED,
      {
        align: "center",
      },
    );
    claimedText.setOrigin(0.5, 0);
    this.add(claimedText);
  }`;
const modifierMarkClaimedReplacement = `  reuse(modifierTypeOption: ModifierTypeOption): void {
    this.modifierTypeOption = modifierTypeOption;
    this.item.setTexture("items", modifierTypeOption.type?.iconImage);
    this.item.clearTint();

    this.itemText.setText(modifierTypeOption.type?.name ?? "");
    this.itemText.clearTint();
    if (modifierTypeOption.type?.tier) {
      this.itemText.setTint(getModifierTierTextTint(modifierTypeOption.type.tier));
    }

    this.claimedBackground?.setVisible(false);
    this.claimedText?.setVisible(false);
  }

  markClaimed(): void {
    this.item.setTint(0x666666);
    this.itemText.setTint(0x777777);
    this.pb?.setTint(0x555555);

    if (!this.claimedBackground) {
      this.claimedBackground = globalScene.add.rectangle(
        0,
        62,
        96,
        18,
        0x000000,
        0.9,
      );
      this.claimedBackground.setStrokeStyle(2, 0xff3030, 1);
      this.add(this.claimedBackground);
    }
    this.claimedBackground.setVisible(true);

    if (!this.claimedText) {
      this.claimedText = addTextObject(
        0,
        56,
        "CLAIMED",
        TextStyle.PARTY_RED,
        {
          align: "center",
        },
      );
      this.claimedText.setOrigin(0.5, 0);
      this.add(this.claimedText);
    }
    this.claimedText.setVisible(true);
  }`;
if (!modifierSelectUi.includes(modifierMarkClaimedReplacement)) {
  if (!modifierSelectUi.includes(modifierMarkClaimedAnchor)) {
    fail("Could not find the ModifierOption claimed-state reuse anchor");
  }
  modifierSelectUi = modifierSelectUi.replace(modifierMarkClaimedAnchor, modifierMarkClaimedReplacement);
}
write(modifierSelectUiPath, modifierSelectUi);

let title = read(titlePath);
const releaseVersionPath = path.resolve(__dirname, "..", "..", "..", "configs", "release-version.txt");
const silverShadowVersion = read(releaseVersionPath).trim();
if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(silverShadowVersion)) {
  fail(`Invalid shared SilverShadow version: ${JSON.stringify(silverShadowVersion)}`);
}
for (const [placeholder, replacement] of [
  ["SILVERSHADOW_VERSION_PLACEHOLDER", silverShadowVersion],
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
const observerAnchor = `    this.autoHideObserver = new MutationObserver(() => {`;
const observerReplacement = `    this.autoHideObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {`;
const formattedObserverGuard = `    this.autoHideObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {`;
const observerAnchorCount = touchControls.split(observerAnchor).length - 1;
const observerReplacementCount = touchControls.split(observerReplacement).length - 1;
const formattedObserverGuardCount = touchControls.split(formattedObserverGuard).length - 1;
if (formattedObserverGuardCount === 1 && observerReplacementCount === 0 && observerAnchorCount === 0) {
  console.log("nx.js optional touch-control observer guard already applied in the all-platform layer.");
} else if (observerReplacementCount === 1 && formattedObserverGuardCount === 0 && observerAnchorCount === 0) {
  console.log("nx.js optional touch-control observer guard already applied.");
} else if (observerReplacementCount === 0 && formattedObserverGuardCount === 0 && observerAnchorCount === 1) {
  touchControls = touchControls.replace(observerAnchor, observerReplacement);
} else {
  fail(
    `Expected exactly one SilverShadow touch-control MutationObserver anchor, found ${observerAnchorCount} unguarded, ${observerReplacementCount} compact guarded, and ${formattedObserverGuardCount} formatted guarded`,
  );
}
const observeAnchor = `    this.autoHideObserver.observe(touchControls, {`;
const observeReplacement = `    this.autoHideObserver?.observe(touchControls, {`;
const observeAnchorCount = touchControls.split(observeAnchor).length - 1;
const observeReplacementCount = touchControls.split(observeReplacement).length - 1;
if (observeReplacementCount === 0 && observeAnchorCount === 1) {
  touchControls = touchControls.replace(observeAnchor, observeReplacement);
} else if (!(observeReplacementCount === 1 && observeAnchorCount === 0)) {
  fail(
    `Expected exactly one SilverShadow touch-control observer call anchor, found ${observeAnchorCount} unguarded and ${observeReplacementCount} guarded`,
  );
}
write(touchControlsPath, touchControls);

console.log("Applied the narrow nx.js real-game bootstrap patch.");
