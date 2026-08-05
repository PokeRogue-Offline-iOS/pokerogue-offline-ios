#!/usr/bin/env node

/** Install the offline Full Pokemon Editor and saved-build library. */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Could not find ${file}`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
  console.log(`Written: ${file}`);
}

function replaceRequired(source, anchor, replacement, description) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) fail(`Expected one ${description}, found ${count}.`);
  return source.replace(anchor, replacement);
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) fail(`Missing editor payload ${source}`);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

const root = path.join(__dirname, "..", "..", "..");
copyTree(
  path.join(root, "new-files", "src", "system", "pokemon-editor"),
  path.join("pokerogue-src", "src", "system", "pokemon-editor"),
);
copyTree(path.join(root, "new-files", "test", "system"), path.join("pokerogue-src", "test", "system"));

// Option-select pages frequently replace another option-select page. The
// stock mode setter intentionally ignores same-mode requests, so explicitly
// show the replacement. BaseOptionSelectUiHandler is patched below to avoid
// clearing a replacement config after the old option callback returns.
const uiPath = path.join("pokerogue-src", "src", "ui", "ui.ts");
let uiSource = read(uiPath);
const deferredOverlayRefresh = `  /**
   * Show an overlay even when that overlay mode is already active.
   *
   * Option handlers clear themselves after their callback returns. Deferring
   * the replacement prevents that cleanup from hiding the new option page.
   */
  refreshOverlayMode(mode: UiMode, ...args: any[]): Promise<void> {
    if (this.mode !== mode) {
      return this.setOverlayMode(mode, ...args);
    }
    return new Promise(resolve => {
      globalScene.time.delayedCall(0, () => {
        if (this.mode === mode) {
          this.getHandler().show(args);
        }
        resolve();
      });
    });
  }
`;
const immediateOverlayRefresh = `  /** Show or redraw an overlay, including a replacement of the active mode. */
  refreshOverlayMode(mode: UiMode, ...args: any[]): Promise<void> {
    if (this.mode !== mode) {
      return this.setOverlayMode(mode, ...args);
    }
    this.getHandler().show(args);
    return Promise.resolve();
  }
`;
if (uiSource.includes(deferredOverlayRefresh)) {
  uiSource = uiSource.replace(deferredOverlayRefresh, immediateOverlayRefresh);
}
if (!uiSource.includes("refreshOverlayMode(mode: UiMode")) {
  uiSource = replaceRequired(
    uiSource,
    `  setOverlayMode(mode: UiMode, ...args: any[]): Promise<void> {
    return this.setModeInternal(mode, false, false, true, args);
  }
`,
    `  setOverlayMode(mode: UiMode, ...args: any[]): Promise<void> {
    return this.setModeInternal(mode, false, false, true, args);
  }

${immediateOverlayRefresh}
`,
    "UI overlay refresh method",
  );
}
write(uiPath, uiSource);

// An option callback may synchronously replace the active option page. Only
// clear the handler when the callback did not install a new config; otherwise
// the replacement can render as a blank window until the next cursor move.
const optionSelectPath = path.join("pokerogue-src", "src", "ui", "handlers", "base-option-select-ui-handler.ts");
let optionSelectSource = read(optionSelectPath);
if (!optionSelectSource.includes("const activeConfig = this.config;")) {
  const optionHandler = `      const option = this.config?.options[this.unskippedIndices[this.fullCursor]];
      if (option?.handler()) {
        if (!option.keepOpen) {
          this.clear();
        }
        playSound = !option.overrideSound;
      } else {
        ui.playError();
      }`;
  const guardedOptionHandler = `      const activeConfig = this.config;
      const option = activeConfig?.options[this.unskippedIndices[this.fullCursor]];
      if (option?.handler()) {
        if (!option.keepOpen && this.config === activeConfig) {
          this.clear();
        }
        playSound = !option.overrideSound;
      } else {
        ui.playError();
      }`;
  const count = optionSelectSource.split(optionHandler).length - 1;
  if (count !== 2) fail(`Expected two option handler cleanup blocks, found ${count}.`);
  optionSelectSource = optionSelectSource.replaceAll(optionHandler, guardedOptionHandler);
}
write(optionSelectPath, optionSelectSource);

// Persist the versioned build library and per-selected-copy editor data.
const saveDataPath = path.join("pokerogue-src", "src", "@types", "save-data.ts");
let saveData = read(saveDataPath);
if (!saveData.includes("#system/pokemon-editor/pokemon-editor-types")) {
  saveData = replaceRequired(
    saveData,
    'import type { PokemonData } from "#system/pokemon-data";',
    'import type { PokemonData } from "#system/pokemon-data";\nimport type { PokemonBuildLibrary, SelectedStarterEditorData } from "#system/pokemon-editor/pokemon-editor-types";',
    "PokemonData save import",
  );
}
if (!saveData.includes("pokemonBuildLibrary?: PokemonBuildLibrary")) {
  saveData = replaceRequired(
    saveData,
    "  starterData: StarterData;",
    "  starterData: StarterData;\n  /** Offline saved Pokemon builds; absent in pre-editor saves. */\n  pokemonBuildLibrary?: PokemonBuildLibrary;",
    "SystemSaveData starterData field",
  );
}
if (!saveData.includes("editorData?: SelectedStarterEditorData")) {
  saveData = replaceRequired(
    saveData,
    "  ivs: number[];\n}\n\n// TODO: What type of number does this store?",
    "  ivs: number[];\n  /** One-time custom starter configuration, isolated from legitimate unlock data. */\n  editorData?: SelectedStarterEditorData | undefined;\n}\n\n// TODO: What type of number does this store?",
    "Starter interface ending",
  );
}
write(saveDataPath, saveData);

const customDataPath = path.join("pokerogue-src", "src", "data", "pokemon", "pokemon-data.ts");
let customData = read(customDataPath);
if (!customData.includes("editorSourceBuildId")) {
  customData = replaceRequired(
    customData,
    "  public types: (RegularPokemonType | null)[];",
    "  public types: (RegularPokemonType | null)[];\n  /** Saved-build provenance used only by explicit editor update actions. */\n  public editorSourceBuildId?: string | undefined;",
    "CustomPokemonData types field",
  );
  customData = replaceRequired(
    customData,
    "    this.types = data?.types ?? [];",
    "    this.types = data?.types ?? [];\n    this.editorSourceBuildId = data?.editorSourceBuildId;",
    "CustomPokemonData constructor ending",
  );
}
write(customDataPath, customData);

const gameDataPath = path.join("pokerogue-src", "src", "system", "game-data.ts");
let gameData = read(gameDataPath);
if (!gameData.includes('from "#system/pokemon-editor/pokemon-editor-service"')) {
  gameData = replaceRequired(
    gameData,
    'import { PokemonData } from "#system/pokemon-data";',
    'import { PokemonData } from "#system/pokemon-data";\nimport {\n  createEmptyPokemonBuildLibrary,\n  normalizePokemonBuildLibrary,\n} from "#system/pokemon-editor/pokemon-editor-service";\nimport type { PokemonBuildLibrary } from "#system/pokemon-editor/pokemon-editor-types";',
    "PokemonData import",
  );
}
if (!gameData.includes('pokemonBuildLibrary: "$pe"')) {
  gameData = replaceRequired(
    gameData,
    '  classicWinCount: "$wc",',
    '  classicWinCount: "$wc",\n  pokemonBuildLibrary: "$pe",\n  preferredBySpeciesForm: "$pf",',
    "system short keys ending",
  );
}
if (!gameData.includes("public pokemonBuildLibrary: PokemonBuildLibrary")) {
  gameData = replaceRequired(
    gameData,
    "  public starterData: StarterData;",
    "  public starterData: StarterData;\n  /** Reusable offline Pokemon builds, separate from unlock/legitimate starter data. */\n  public pokemonBuildLibrary: PokemonBuildLibrary;",
    "GameData starterData property",
  );
  gameData = replaceRequired(
    gameData,
    "    this.starterData = {};",
    "    this.starterData = {};\n    this.pokemonBuildLibrary = createEmptyPokemonBuildLibrary();",
    "GameData starterData initialization",
  );
  gameData = replaceRequired(
    gameData,
    "      starterData: this.starterData,",
    "      starterData: this.starterData,\n      pokemonBuildLibrary: this.pokemonBuildLibrary,",
    "system save starterData",
  );
  gameData = replaceRequired(
    gameData,
    "    this.starterData = systemData.starterData;",
    "    this.starterData = systemData.starterData;\n    const normalizedBuilds = normalizePokemonBuildLibrary(systemData.pokemonBuildLibrary);\n    this.pokemonBuildLibrary = normalizedBuilds.library;\n    normalizedBuilds.warnings.forEach(warning => console.warn(`[Pokemon Editor] ${warning}`));",
    "parsed system starterData",
  );
}
if (!gameData.includes("Cached save-and-quit data can be absent")) {
  gameData = replaceRequired(
    gameData,
    `    const sessionData = useCachedSession
      ? this.parseSessionData(
          decrypt(localStorage.getItem(getSessionDataLocalStorageKey(globalScene.sessionSlotId))!, bypassLogin),
        ) // TODO: is this bang correct?
      : this.getSessionSaveData();`,
    `    // Cached save-and-quit data can be absent when a very short first
    // battle reaches the shop before the background save finishes. Fall back
    // to the live snapshot instead of leaving the Loading screen rejected.
    let sessionData: SessionSaveData | undefined;
    if (useCachedSession) {
      const cachedSession = localStorage.getItem(getSessionDataLocalStorageKey(globalScene.sessionSlotId));
      if (cachedSession) {
        try {
          sessionData = this.parseSessionData(decrypt(cachedSession, bypassLogin));
        } catch (error) {
          console.warn("Cached session was unavailable during save-and-quit; using the live session.", error);
        }
      }
    }
    sessionData ??= this.getSessionSaveData();`,
    "save-and-quit cached session read",
  );
  gameData = replaceRequired(
    gameData,
    `    const systemData = useCachedSystem
      ? GameData.parseSystemData(decrypt(localStorage.getItem(\`data_\${loggedInUser?.username}\`)!, bypassLogin))
      : this.getSystemSaveData(); // TODO: is this bang correct?`,
    `    let systemData: SystemSaveData | undefined;
    if (useCachedSystem) {
      const cachedSystem = localStorage.getItem(\`data_\${loggedInUser?.username}\`);
      if (cachedSystem) {
        try {
          systemData = GameData.parseSystemData(decrypt(cachedSystem, bypassLogin));
        } catch (error) {
          console.warn("Cached system data was unavailable during save-and-quit; using the live system.", error);
        }
      }
    }
    systemData ??= this.getSystemSaveData();`,
    "save-and-quit cached system read",
  );
}
write(gameDataPath, gameData);

// Live three-state capability setting.
const overridesPath = path.join("pokerogue-src", "src", "overrides.ts");
let overrides = read(overridesPath);
if (!overrides.includes("POKEMON_EDITOR_MODE_OVERRIDE")) {
  overrides = replaceRequired(
    overrides,
    "  readonly ALL_STARTERS_POKERUS_OVERRIDE: boolean = false;",
    "  readonly ALL_STARTERS_POKERUS_OVERRIDE: boolean = false;\n  /** 0 = Off, 1 = Use Saved Builds, 2 = Full Editor. */\n  readonly POKEMON_EDITOR_MODE_OVERRIDE: number = 0;",
    "all-starters Pokerus override",
  );
}
write(overridesPath, overrides);

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settings = read(settingsPath);
if (!settings.includes("Offline_Pokemon_Editor_Mode")) {
  settings = replaceRequired(
    settings,
    '  Offline_All_Starters_Pokerus: "OFFLINE_ALL_STARTERS_POKERUS",',
    '  Offline_All_Starters_Pokerus: "OFFLINE_ALL_STARTERS_POKERUS",\n  Offline_Pokemon_Editor_Mode: "OFFLINE_POKEMON_EDITOR_MODE",',
    "Pokemon editor setting key anchor",
  );
  const pokerusRow = `  {
    key: SettingKeys.Offline_All_Starters_Pokerus,
    label: "All Starters Have Pokerus",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },`;
  settings = replaceRequired(
    settings,
    pokerusRow,
    `${pokerusRow}\n  {\n    key: SettingKeys.Offline_Pokemon_Editor_Mode,\n    label: "Pokemon Editor",\n    options: [\n      { value: "0", label: "Off" },\n      { value: "1", label: "Use Saved Builds" },\n      { value: "2", label: "Full Editor" },\n    ],\n    default: 0,\n    type: SettingType.APP,\n  },`,
    "all-starters Pokerus settings row",
  );
  settings = replaceRequired(
    settings,
    "    case SettingKeys.Offline_All_Starters_Pokerus:\n      activeOverrides.ALL_STARTERS_POKERUS_OVERRIDE = value === 1;\n      break;",
    "    case SettingKeys.Offline_All_Starters_Pokerus:\n      activeOverrides.ALL_STARTERS_POKERUS_OVERRIDE = value === 1;\n      break;\n    case SettingKeys.Offline_Pokemon_Editor_Mode:\n      activeOverrides.POKEMON_EDITOR_MODE_OVERRIDE = value;\n      break;",
    "all-starters Pokerus setting case",
  );
}
write(settingsPath, settings);

// Apply editor-only starter fields once, at run construction. Off restores the
// legitimate snapshot without erasing saved builds or already-created Pokemon.
const selectPhasePath = path.join("pokerogue-src", "src", "phases", "select-starter-phase.ts");
let selectPhase = read(selectPhasePath);
if (!selectPhase.includes("resolveStarterForPokemonEditor")) {
  selectPhase = replaceRequired(
    selectPhase,
    'import type { Starter } from "#types/save-data";',
    'import { resolveStarterForPokemonEditor } from "#system/pokemon-editor/pokemon-editor-service";\nimport type { PokemonEditorMode } from "#system/pokemon-editor/pokemon-editor-types";\nimport type { Starter } from "#types/save-data";',
    "SelectStarterPhase Starter import",
  );
  selectPhase = replaceRequired(
    selectPhase,
    "    starters.forEach((starter: Starter, i: number) => {\n      if (!i && activeOverrides.STARTER_SPECIES_OVERRIDE) {",
    "    starters.forEach((selectedStarter: Starter, i: number) => {\n      const starter = resolveStarterForPokemonEditor(\n        selectedStarter,\n        activeOverrides.POKEMON_EDITOR_MODE_OVERRIDE as PokemonEditorMode,\n      );\n      if (!i && activeOverrides.STARTER_SPECIES_OVERRIDE) {",
    "starter construction loop",
  );
  selectPhase = replaceRequired(
    selectPhase,
    "        globalScene.gameMode.getStartingLevel(),",
    "        starter.editorData?.level ?? globalScene.gameMode.getStartingLevel(),",
    "starter starting level",
  );
  selectPhase = replaceRequired(
    selectPhase,
    "      if (starter.moveset) {\n        starterPokemon.tryPopulateMoveset(starter.moveset);\n      }",
    "      if (starter.editorData) {\n        starterPokemon.moveset = [];\n        starterPokemon.tryPopulateMoveset(starter.editorData.customMoveset, true);\n        starterPokemon.customPokemonData.ability = starter.editorData.abilityId;\n        starterPokemon.customPokemonData.editorSourceBuildId = starter.editorData.sourceBuildId;\n        starterPokemon.friendship = starter.editorData.friendship;\n      } else if (starter.moveset) {\n        starterPokemon.tryPopulateMoveset(starter.moveset);\n      }",
    "starter moveset application",
  );
}
write(selectPhasePath, selectPhase);

// Starter-select integration. Species-grid edits prepare the next copy while
// team-panel edits target exactly one selected duplicate.
const starterUiPath = path.join("pokerogue-src", "src", "ui", "handlers", "starter-select-ui-handler.ts");
let starterUi = read(starterUiPath);
if (!starterUi.includes("preparedPokemonEditorStarters")) {
  starterUi = replaceRequired(
    starterUi,
    'import { RibbonData } from "#system/ribbons/ribbon-data";',
    'import {\n  applyPokemonEditorDraftToStarter,\n  createPokemonEditorDraftFromStarter,\n  createSavedPokemonBuild,\n  resolveStarterForPokemonEditor,\n  restoreLegitimateStarterSetup,\n  undoLastStarterEditorChange,\n} from "#system/pokemon-editor/pokemon-editor-service";\nimport { PokemonEditorMode } from "#system/pokemon-editor/pokemon-editor-types";\nimport {\n  showPokemonBuildLibrary,\n  showPokemonEditor,\n  showPokemonMoveEditor,\n} from "#system/pokemon-editor/pokemon-editor-ui";\nimport { RibbonData } from "#system/ribbons/ribbon-data";',
    "starter RibbonData import",
  );
  starterUi = replaceRequired(
    starterUi,
    "  private starters: Starter[] = [];",
    "  private starters: Starter[] = [];\n  /** Species-grid templates are copied into each new duplicate independently. */\n  private preparedPokemonEditorStarters = new Map<SpeciesId, Starter>();",
    "starter records property",
  );

  const editorActions = `          const pokemonEditorMode = activeOverrides.POKEMON_EDITOR_MODE_OVERRIDE as PokemonEditorMode;
          if (pokemonEditorMode >= PokemonEditorMode.USE_SAVED_BUILDS) {
            const getEditorTarget = () => this.getPokemonEditorTarget(this.lastSpecies, editableStarterIndex);
            const returnToStarterSelect = () => {
              this.moveInfoOverlay.clear();
              ui.setMode(UiMode.STARTER_SELECT);
              this.setSpecies(this.lastSpecies);
            };
            const applyDraft = draft => {
              const target = getEditorTarget();
              applyPokemonEditorDraftToStarter(target, draft);
              if (editableStarterIndex >= 0) {
                this.updatePartyIcon(this.lastSpecies, editableStarterIndex);
              }
              returnToStarterSelect();
            };
            options.push({
              label: "Load Saved Build",
              handler: () => {
                const target = getEditorTarget();
                showPokemonBuildLibrary(globalScene.gameData.pokemonBuildLibrary, {
                  draft: createPokemonEditorDraftFromStarter(target, globalScene.gameMode.getStartingLevel()),
                  allowManagement: pokemonEditorMode === PokemonEditorMode.FULL_EDITOR,
                  onApply: applyDraft,
                  onSave: () => globalScene.gameData.saveSystem(),
                  onCancel: returnToStarterSelect,
                });
                return true;
              },
            });
            if (pokemonEditorMode === PokemonEditorMode.FULL_EDITOR) {
              options.push(
                {
                  label: "Edit Pokemon",
                  handler: () => {
                    const target = getEditorTarget();
                    showPokemonEditor(
                      createPokemonEditorDraftFromStarter(target, globalScene.gameMode.getStartingLevel()),
                      {
                        title:
                          editableStarterIndex >= 0
                            ? \`Edit selected \${this.lastSpecies.name} copy\`
                            : \`Prepare next \${this.lastSpecies.name}\`,
                        legitimateMoves: target.editorData?.legitimateSetup.moveset ?? target.moveset,
                        onApply: applyDraft,
                        onCancel: returnToStarterSelect,
                      },
                    );
                    return true;
                  },
                },
                {
                  label: "Manage Any Moves",
                  handler: () => {
                    const target = getEditorTarget();
                    const draft = createPokemonEditorDraftFromStarter(target, globalScene.gameMode.getStartingLevel());
                    showPokemonMoveEditor(
                      draft,
                      () => applyDraft(draft),
                      target.editorData?.legitimateSetup.moveset ?? target.moveset,
                    );
                    return true;
                  },
                },
                {
                  label: "Save Current Setup as Build",
                  handler: () => {
                    const target = getEditorTarget();
                    createSavedPokemonBuild(
                      globalScene.gameData.pokemonBuildLibrary,
                      createPokemonEditorDraftFromStarter(target, globalScene.gameMode.getStartingLevel()),
                    );
                    globalScene.gameData.saveSystem();
                    returnToStarterSelect();
                    return true;
                  },
                },
              );
              if (getEditorTarget().editorData) {
                options.push(
                  {
                    label: "Restore Legitimate Setup",
                    handler: () => {
                      restoreLegitimateStarterSetup(getEditorTarget());
                      if (editableStarterIndex >= 0) {
                        this.updatePartyIcon(this.lastSpecies, editableStarterIndex);
                      }
                      returnToStarterSelect();
                      return true;
                    },
                  },
                  {
                    label: "Undo Last Editor Changes",
                    handler: () => {
                      undoLastStarterEditorChange(getEditorTarget());
                      if (editableStarterIndex >= 0) {
                        this.updatePartyIcon(this.lastSpecies, editableStarterIndex);
                      }
                      returnToStarterSelect();
                      return true;
                    },
                  },
                );
              }
            }
          }
`;
  starterUi = replaceRequired(
    starterUi,
    "          if (this.canCycleNature) {\n            // if we could cycle natures, enable the improved nature menu",
    `${editorActions}          if (this.canCycleNature) {\n            // if we could cycle natures, enable the improved nature menu`,
    "starter nature action anchor",
  );

  const helperAnchor = `  /**
   * Resolve the starter record that may be changed by the current cursor.`;
  const helper = `  /** Return one selected copy, or a persistent template for the next duplicate. */
  private getPokemonEditorTarget(species: PokemonSpecies, starterIndex: number): Starter {
    if (starterIndex >= 0) {
      return this.starters[starterIndex];
    }
    let prepared = this.preparedPokemonEditorStarters.get(species.speciesId);
    if (!prepared) {
      const props = globalScene.gameData.getSpeciesDexAttrProps(species, this.dexAttrCursor);
      const { dexEntry, starterDataEntry } = this.getSpeciesData(species.speciesId);
      prepared = {
        speciesId: species.speciesId,
        shiny: props.shiny,
        variant: props.variant,
        formIndex: props.formIndex,
        female: props.female,
        abilityIndex: this.abilityCursor,
        passive: !(starterDataEntry.passiveAttr ^ (PassiveAttr.ENABLED | PassiveAttr.UNLOCKED)),
        nature: this.natureCursor as unknown as Nature,
        moveset: this.starterMoveset?.slice(0) as StarterMoveset,
        pokerus: activeOverrides.ALL_STARTERS_POKERUS_OVERRIDE || this.pokerusSpecies.includes(species),
        nickname: this.starterPreferences[species.speciesId]?.nickname,
        teraType: this.teraCursor,
        ivs: dexEntry.ivs.slice(0),
      };
      this.preparedPokemonEditorStarters.set(species.speciesId, prepared);
    }
    return prepared;
  }

${helperAnchor}`;
  starterUi = replaceRequired(starterUi, helperAnchor, helper, "editable starter documentation");

  starterUi = replaceRequired(
    starterUi,
    "    this.starters.push(starter);",
    `    const preparedEditorStarter = this.preparedPokemonEditorStarters.get(species.speciesId);
    if (preparedEditorStarter) {
      const preparedCopy = resolveStarterForPokemonEditor(preparedEditorStarter, PokemonEditorMode.FULL_EDITOR);
      Object.assign(starter, preparedCopy, {
        speciesId: species.speciesId,
        passive: starter.passive,
        nickname: starter.nickname,
        teraType: starter.teraType,
        ivs: preparedCopy.ivs.slice(0),
      });
    }

    this.starters.push(starter);`,
    "starter record push",
  );
}

// Expose saved-build ownership alongside the starter screen's existing Misc
// filters so a player can quickly narrow the grid to every species with builds.
if (!starterUi.includes('new DropDownOption("SAVED_BUILDS"')) {
  starterUi = replaceRequired(
    starterUi,
    `    const pokerusLabels = [
      new DropDownLabel(i18next.t("filterBar:pokerus"), undefined, DropDownState.OFF),`,
    `    const savedBuildLabels = [
      new DropDownLabel("Saved Builds", undefined, DropDownState.OFF),
      new DropDownLabel("Has Saved Builds", undefined, DropDownState.ON),
      new DropDownLabel("No Saved Builds", undefined, DropDownState.EXCLUDE),
    ];
    const pokerusLabels = [
      new DropDownLabel(i18next.t("filterBar:pokerus"), undefined, DropDownState.OFF),`,
    "starter Misc saved-build labels",
  );
  starterUi = replaceRequired(
    starterUi,
    `      new DropDownOption("POKERUS", pokerusLabels),`,
    `      new DropDownOption("POKERUS", pokerusLabels),
      new DropDownOption("SAVED_BUILDS", savedBuildLabels),`,
    "starter Misc saved-build option",
  );
  starterUi = replaceRequired(
    starterUi,
    `      // Pokerus Filter
      const fitsPokerus = this.filterBar.getVals(DropDownColumn.MISC).some(misc => {`,
    `      // Saved Pokemon Build Filter
      const hasSavedBuild = globalScene.gameData.pokemonBuildLibrary.builds.some(
        build => build.speciesId === container.species.speciesId,
      );
      const fitsSavedBuilds = this.filterBar.getVals(DropDownColumn.MISC).some(misc => {
        if (misc.val === "SAVED_BUILDS" && misc.state === DropDownState.ON) {
          return hasSavedBuild;
        }
        if (misc.val === "SAVED_BUILDS" && misc.state === DropDownState.EXCLUDE) {
          return !hasSavedBuild;
        }
        if (misc.val === "SAVED_BUILDS" && misc.state === DropDownState.OFF) {
          return true;
        }
        return false;
      });

      // Pokerus Filter
      const fitsPokerus = this.filterBar.getVals(DropDownColumn.MISC).some(misc => {`,
    "starter saved-build filter evaluation",
  );
  starterUi = replaceRequired(
    starterUi,
    `        && fitsEgg
        && fitsPokerus`,
    `        && fitsEgg
        && fitsPokerus
        && fitsSavedBuilds`,
    "starter saved-build filter condition",
  );
}

// Custom starter moves are valid editor state, but the stock starter details
// filter removes anything outside the legitimate level/egg pool. Preserve the
// editor set for display while retaining the stock filter for normal moves.
if (!starterUi.includes("selectedEditorMoveset")) {
  starterUi = replaceRequired(
    starterUi,
    `        const selectedStarterIndex = starterIndexOverride ?? this.getSelectedStarterIndex(species);
        const selectedStarterMoveset =
          selectedStarterIndex >= 0 ? this.starters[selectedStarterIndex].moveset : undefined;`,
    `        const selectedStarterIndex = starterIndexOverride ?? this.getSelectedStarterIndex(species);
        const selectedStarter = selectedStarterIndex >= 0 ? this.starters[selectedStarterIndex] : undefined;
        const selectedEditorMoveset =
          selectedStarter?.editorData?.customMoveset
          ?? this.preparedPokemonEditorStarters.get(species.speciesId)?.editorData?.customMoveset;
        const selectedStarterMoveset = selectedEditorMoveset ?? selectedStarter?.moveset;`,
    "selected starter editor moves",
  );
  starterUi = replaceRequired(
    starterUi,
    `        this.starterMoveset = (moveData || (this.speciesStarterMoves.slice(0, 4) as StarterMoveset)).filter(m =>
          availableStarterMoves.find(sm => sm === m),
        ) as StarterMoveset;
        // Consolidate move data if it contains an incompatible move
        if (this.starterMoveset.length < 4 && this.starterMoveset.length < availableStarterMoves.length) {`,
    `        this.starterMoveset = selectedEditorMoveset
          ? (selectedEditorMoveset.slice(0, 4) as StarterMoveset)
          : ((moveData || (this.speciesStarterMoves.slice(0, 4) as StarterMoveset)).filter(m =>
              availableStarterMoves.find(sm => sm === m),
            ) as StarterMoveset);
        // Consolidate only legitimate move data. Editor moves intentionally
        // remain outside the unlocked level/egg pool.
        if (
          !selectedEditorMoveset
          && this.starterMoveset.length < 4
          && this.starterMoveset.length < availableStarterMoves.length
        ) {`,
    "selected starter move filtering",
  );
}
if (!starterUi.includes("editorAbilityId")) {
  starterUi = replaceRequired(
    starterUi,
    `      if (dexEntry.caughtAttr) {
        let ability: Ability;
        if (this.lastSpecies.forms?.length > 1) {
          ability = allAbilities[this.lastSpecies.forms[formIndex ?? 0].getAbility(abilityIndex!)];
        } else {
          ability = allAbilities[this.lastSpecies.getAbility(abilityIndex!)]; // TODO: is this bang correct?
        }

        const isHidden = abilityIndex === (this.lastSpecies.ability2 ? 2 : 1);`,
    `      if (dexEntry.caughtAttr) {
        const editorStarterIndex = starterIndexOverride ?? this.getSelectedStarterIndex(species);
        const editorStarter = editorStarterIndex >= 0 ? this.starters[editorStarterIndex] : undefined;
        const editorAbilityId =
          editorStarter?.editorData?.abilityId
          ?? this.preparedPokemonEditorStarters.get(species.speciesId)?.editorData?.abilityId;
        let ability: Ability;
        if (editorAbilityId !== undefined) {
          ability = allAbilities[editorAbilityId];
        } else if (this.lastSpecies.forms?.length > 1) {
          ability = allAbilities[this.lastSpecies.forms[formIndex ?? 0].getAbility(abilityIndex!)];
        } else {
          ability = allAbilities[this.lastSpecies.getAbility(abilityIndex!)]; // TODO: is this bang correct?
        }

        const isHidden = editorAbilityId === undefined && abilityIndex === (this.lastSpecies.ability2 ? 2 : 1);`,
    "selected starter editor ability display",
  );
}

// The starter action menu can exceed the viewport once editor actions are
// enabled. Cap it for both grid and selected-party targets and use the
// engine's native scrolling.
if (!starterUi.includes("maxOptions: 7,\n            yOffset: 47,")) {
  const starterActionMenu = `            options,
            yOffset: 47,`;
  const starterActionMenuCount = starterUi.split(starterActionMenu).length - 1;
  if (starterActionMenuCount !== 1) {
    fail(`Expected one starter action menu, found ${starterActionMenuCount}.`);
  }
  starterUi = starterUi.replaceAll(
    starterActionMenu,
    `            options,
            maxOptions: 7,
            yOffset: 47,`,
  );
}
write(starterUiPath, starterUi);

// Active-party integration. Mutation is limited to SelectModifierPhase, the
// engine's between-battles state; all battle entry points return one message.
const partyUiPath = path.join("pokerogue-src", "src", "ui", "handlers", "party-ui-handler.ts");
let partyUi = read(partyUiPath);
if (!partyUi.includes("LOAD_SAVED_BUILD")) {
  if (!partyUi.includes('import { activeOverrides } from "#app/overrides";')) {
    partyUi = replaceRequired(
      partyUi,
      'import { getPokemonNameWithAffix } from "#app/messages";',
      'import { getPokemonNameWithAffix } from "#app/messages";\nimport { activeOverrides } from "#app/overrides";',
      "party messages import",
    );
  }
  partyUi = replaceRequired(
    partyUi,
    'import { getVariantTint } from "#sprites/variant";',
    'import { getVariantTint } from "#sprites/variant";\nimport {\n  applyPokemonEditorDraftToPokemon,\n  createPokemonEditorDraftFromPokemon,\n  createSavedPokemonBuild,\n  undoLastPokemonEditorChange,\n} from "#system/pokemon-editor/pokemon-editor-service";\nimport { PokemonEditorMode } from "#system/pokemon-editor/pokemon-editor-types";\nimport {\n  showPokemonBuildLibrary,\n  showPokemonEditor,\n  showPokemonMoveEditor,\n} from "#system/pokemon-editor/pokemon-editor-ui";',
    "party variant import",
  );
  partyUi = replaceRequired(
    partyUi,
    "  RENAME,\n  SELECT,",
    "  RENAME,\n  LOAD_SAVED_BUILD,\n  EDIT_POKEMON,\n  QUICK_EDIT_MOVES,\n  EDIT_ANY_MOVES,\n  SAVE_POKEMON_BUILD,\n  UNDO_EDITOR_CHANGES,\n  SELECT,",
    "party option editor insertion",
  );
  partyUi = replaceRequired(
    partyUi,
    "    this.options.push(PartyOption.RENAME);",
    `    this.options.push(PartyOption.RENAME);
    const pokemonEditorMode = activeOverrides.POKEMON_EDITOR_MODE_OVERRIDE as PokemonEditorMode;
    if (pokemonEditorMode >= PokemonEditorMode.USE_SAVED_BUILDS) {
      this.options.push(PartyOption.LOAD_SAVED_BUILD);
    }
    if (pokemonEditorMode === PokemonEditorMode.FULL_EDITOR) {
      this.options.push(
        PartyOption.EDIT_POKEMON,
        PartyOption.QUICK_EDIT_MOVES,
        PartyOption.EDIT_ANY_MOVES,
        PartyOption.SAVE_POKEMON_BUILD,
        PartyOption.UNDO_EDITOR_CHANGES,
      );
    }`,
    "party common rename option",
  );

  const handlerAnchor = `    // These are the options that do not involve a callback
    if (option === PartyOption.SUMMARY) {`;
  const editorHandler = `    const pokemonEditorOptions = [
      PartyOption.LOAD_SAVED_BUILD,
      PartyOption.EDIT_POKEMON,
      PartyOption.QUICK_EDIT_MOVES,
      PartyOption.EDIT_ANY_MOVES,
      PartyOption.SAVE_POKEMON_BUILD,
      PartyOption.UNDO_EDITOR_CHANGES,
    ];
    if (pokemonEditorOptions.includes(option)) {
      this.clearOptions();
      const editorMode = activeOverrides.POKEMON_EDITOR_MODE_OVERRIDE as PokemonEditorMode;
      if (
        editorMode === PokemonEditorMode.OFF
        || (editorMode !== PokemonEditorMode.FULL_EDITOR && option !== PartyOption.LOAD_SAVED_BUILD)
      ) {
        ui.setMode(UiMode.PARTY);
        return true;
      }
      if (!globalScene.phaseManager.getCurrentPhase().is("SelectModifierPhase")) {
        this.showText(
          "Editing is unavailable during battle.\\nFinish the battle first.",
          null,
          () => ui.setMode(UiMode.PARTY),
          undefined,
          true,
        );
        return true;
      }

      const returnToParty = () => {
        this.clearPartySlots();
        this.populatePartySlots();
        ui.setMode(UiMode.PARTY);
      };
      const applyDraft = async draft => {
        await applyPokemonEditorDraftToPokemon(pokemon, draft);
        await globalScene.gameData.saveAll(true, false);
        returnToParty();
      };
      const draft = createPokemonEditorDraftFromPokemon(pokemon);
      switch (option) {
        case PartyOption.LOAD_SAVED_BUILD:
          showPokemonBuildLibrary(globalScene.gameData.pokemonBuildLibrary, {
            draft,
            allowManagement: editorMode === PokemonEditorMode.FULL_EDITOR,
            onApply: applyDraft,
            onSave: () => globalScene.gameData.saveSystem(),
            onCancel: returnToParty,
          });
          break;
        case PartyOption.EDIT_POKEMON:
          showPokemonEditor(draft, {
            title: \`Edit active \${pokemon.getNameToRender({ useIllusion: false })}\`,
            onApply: applyDraft,
            onCancel: returnToParty,
          });
          break;
        case PartyOption.QUICK_EDIT_MOVES: {
          const relearnableMoves = pokemon.getLearnableLevelMoves().map(([, moveId]) => moveId);
          const legitimateMoves = [...new Set([...pokemon.moveset.map(move => move.moveId), ...relearnableMoves])];
          showPokemonMoveEditor(draft, () => void applyDraft(draft), undefined, legitimateMoves);
          break;
        }
        case PartyOption.EDIT_ANY_MOVES:
          showPokemonMoveEditor(draft, () => void applyDraft(draft));
          break;
        case PartyOption.SAVE_POKEMON_BUILD:
          createSavedPokemonBuild(globalScene.gameData.pokemonBuildLibrary, draft);
          globalScene.gameData.saveSystem();
          this.showText("Saved the current setup as a new Pokemon build.", null, returnToParty);
          break;
        case PartyOption.UNDO_EDITOR_CHANGES:
          void undoLastPokemonEditorChange(pokemon).then(async changed => {
            if (changed) {
              await globalScene.gameData.saveAll(true, false);
            }
            this.showText(
              changed ? "Undid the last editor changes." : "There are no editor changes to undo.",
              null,
              returnToParty,
            );
          });
          break;
      }
      return true;
    }

${handlerAnchor}`;
  partyUi = replaceRequired(partyUi, handlerAnchor, editorHandler, "party no-callback option anchor");
}

if (!partyUi.includes("const visibleActionSlots = 6;")) {
  partyUi = replaceRequired(
    partyUi,
    `    const optionEndIndex = Math.min(
      this.optionsScrollTotal,
      optionStartIndex + (!optionStartIndex || this.optionsScrollCursor + 8 >= this.optionsScrollTotal ? 8 : 7),
    );

    this.optionsScroll = this.optionsScrollTotal > 9;`,
    `    // Keep the party action window to at most seven visible rows,
    // including its scroll indicators and persistent Cancel row.
    const visibleActionSlots = 6;
    const optionEndIndex = Math.min(
      this.optionsScrollTotal,
      optionStartIndex
        + (!optionStartIndex || this.optionsScrollCursor + visibleActionSlots - 1 >= this.optionsScrollTotal
          ? visibleActionSlots - 1
          : visibleActionSlots - 2),
    );

    this.optionsScroll = this.optionsScrollTotal > visibleActionSlots;`,
    "party option window capacity",
  );
  partyUi = replaceRequired(
    partyUi,
    "        this.optionsScrollCursor = cursor ? this.optionsScrollTotal - 8 : 0;",
    "        this.optionsScrollCursor = cursor ? this.optionsScrollTotal - 5 : 0;",
    "party option wrap scroll position",
  );
}
write(partyUiPath, partyUi);

console.log("Pokemon Editor core persistence and runtime wiring applied.");
