import { activeOverrides } from "#app/overrides";
import { Gender } from "#data/gender";
import { AbilityId } from "#enums/ability-id";
import { MoveCategory } from "#enums/move-category";
import { MoveId } from "#enums/move-id";
import { Nature } from "#enums/nature";
import { PokeballType } from "#enums/pokeball";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesId } from "#enums/species-id";
import { PokemonMove } from "#moves/pokemon-move";
import { PokemonData } from "#system/pokemon-data";
import {
  applyPokemonEditorDraftToStarter,
  applySavedPokemonBuildToDraft,
  createEmptyPokemonBuildLibrary,
  createSavedPokemonBuild,
  deleteSavedPokemonBuild,
  duplicateSavedPokemonBuild,
  getImplementedPokemonEditorMoves,
  getPokemonEditorFormLabel,
  getSavedPokemonBuildsForSpecies,
  normalizePokemonBuildLibrary,
  normalizePokemonEditorMoves,
  resolveStarterForPokemonEditor,
  setPreferredSavedPokemonBuild,
  updateSavedPokemonBuild,
} from "#system/pokemon-editor/pokemon-editor-service";
import { type PokemonEditorDraft, PokemonEditorMode } from "#system/pokemon-editor/pokemon-editor-types";
import type { Starter } from "#types/save-data";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const caterpieDraft = (): PokemonEditorDraft => ({
  speciesId: SpeciesId.CATERPIE,
  formIndex: 0,
  level: 37,
  nature: Nature.MODEST,
  abilityId: AbilityId.INTIMIDATE,
  gender: Gender.MALE,
  shiny: true,
  variant: 2,
  ivs: [31, 30, 29, 28, 27, 26],
  friendship: 200,
  pokerus: true,
  moves: [MoveId.DRACO_METEOR, MoveId.TACKLE],
});

const caterpieStarter = (): Starter => ({
  speciesId: SpeciesId.CATERPIE,
  shiny: false,
  variant: 0,
  formIndex: 0,
  female: false,
  abilityIndex: 0,
  passive: false,
  nature: Nature.HARDY,
  moveset: [MoveId.TACKLE],
  pokerus: false,
  ivs: [1, 2, 3, 4, 5, 6],
});

describe("Pokemon Editor build library", () => {
  it("keeps unrestricted safe moves even when the species cannot learn them", () => {
    expect(normalizePokemonEditorMoves([MoveId.DRACO_METEOR, MoveId.TACKLE])).toEqual([
      MoveId.DRACO_METEOR,
      MoveId.TACKLE,
    ]);
    expect(normalizePokemonEditorMoves([MoveId.TACKLE, MoveId.TACKLE])).toEqual([MoveId.TACKLE]);
    expect(normalizePokemonEditorMoves([])).toBeNull();
  });

  it("supports multiple same-species builds, duplicate names, explicit update, preferred, duplicate, and delete", () => {
    const library = createEmptyPokemonBuildLibrary();
    const first = createSavedPokemonBuild(library, caterpieDraft(), "Anything", 100);
    const second = createSavedPokemonBuild(library, { ...caterpieDraft(), level: 50 }, "Anything", 200);
    expect(first.id).not.toBe(second.id);
    expect(library.builds).toHaveLength(2);

    setPreferredSavedPokemonBuild(library, second.id);
    expect(Object.values(library.preferredBySpeciesForm)).toContain(second.id);

    const duplicate = duplicateSavedPokemonBuild(library, first.id, 300)!;
    expect(duplicate.id).not.toBe(first.id);
    duplicate.moves![0] = MoveId.TACKLE;
    expect(first.moves![0]).toBe(MoveId.DRACO_METEOR);

    expect(updateSavedPokemonBuild(library, first.id, { ...caterpieDraft(), level: 99 }, 400)).toBe(true);
    expect(library.builds.find(build => build.id === first.id)?.level).toBe(99);
    expect(second.level).toBe(50);

    expect(deleteSavedPokemonBuild(library, second.id)).toBe(true);
    expect(Object.values(library.preferredBySpeciesForm)).not.toContain(second.id);
  });

  it("repairs fields, skips unusable entries, and removes invalid preferred references", () => {
    const valid = createSavedPokemonBuild(createEmptyPokemonBuildLibrary(), caterpieDraft(), "Valid", 100);
    const normalized = normalizePokemonBuildLibrary({
      schemaVersion: 999,
      builds: [
        { ...valid, level: -5, friendship: 999, ivs: [-2, 99, 1, 2, 3, 4] },
        { ...valid, id: valid.id, name: "Duplicate ID" },
        { ...valid, id: "no-moves", moves: [] },
      ],
      preferredBySpeciesForm: { "10:0": "missing" },
    });
    expect(normalized.library.builds).toHaveLength(2);
    expect(new Set(normalized.library.builds.map(build => build.id)).size).toBe(2);
    expect(normalized.library.builds[0].level).toBe(1);
    expect(normalized.library.builds[0].friendship).toBe(255);
    expect(normalized.library.builds[0].ivs).toEqual([0, 31, 1, 2, 3, 4]);
    expect(normalized.library.preferredBySpeciesForm).toEqual({});
    expect(normalized.warnings.length).toBeGreaterThan(0);
  });

  it("deep-copies build application so later edits do not mutate the saved build", () => {
    const library = createEmptyPokemonBuildLibrary();
    const build = createSavedPokemonBuild(library, caterpieDraft(), undefined, 100);
    const applied = applySavedPokemonBuildToDraft(build, caterpieDraft(), 200);
    applied.moves[0] = MoveId.TACKLE;
    applied.ivs[0] = 0;
    expect(build.moves![0]).toBe(MoveId.DRACO_METEOR);
    expect(build.ivs![0]).toBe(31);
  });

  it("sorts saved builds alphabetically after the preferred build", () => {
    const library = createEmptyPokemonBuildLibrary();
    createSavedPokemonBuild(library, caterpieDraft(), "Zulu", 300);
    const preferred = createSavedPokemonBuild(library, caterpieDraft(), "Middle", 200);
    createSavedPokemonBuild(library, caterpieDraft(), "alpha", 100);
    setPreferredSavedPokemonBuild(library, preferred.id);

    expect(getSavedPokemonBuildsForSpecies(library, SpeciesId.CATERPIE).map(build => build.name)).toEqual([
      "Middle",
      "alpha",
      "Zulu",
    ]);
  });
});

describe("Pokemon Editor starter isolation", () => {
  it("uses the edited setup in editor modes and the legitimate snapshot in Off mode", () => {
    const starter = caterpieStarter();
    applyPokemonEditorDraftToStarter(starter, caterpieDraft());

    const enabled = resolveStarterForPokemonEditor(starter, PokemonEditorMode.FULL_EDITOR);
    expect(enabled.editorData?.customMoveset).toEqual([MoveId.DRACO_METEOR, MoveId.TACKLE]);
    expect(enabled.ivs).toEqual([31, 30, 29, 28, 27, 26]);

    const disabled = resolveStarterForPokemonEditor(starter, PokemonEditorMode.OFF);
    expect(disabled.editorData).toBeUndefined();
    expect(disabled.moveset).toEqual([MoveId.TACKLE]);
    expect(disabled.ivs).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("Pokemon Editor form labels", () => {
  it("distinguishes Urshifu's selectable fighting styles", () => {
    const singleStrike = getPokemonEditorFormLabel(SpeciesId.URSHIFU, 0);
    const rapidStrike = getPokemonEditorFormLabel(SpeciesId.URSHIFU, 1);

    expect(singleStrike).not.toBe(rapidStrike);
    expect(singleStrike).toMatch(/Single.*Strike/i);
    expect(rapidStrike).toMatch(/Rapid.*Strike/i);
  });
});

describe("Pokemon Editor registry move discovery", () => {
  it("discovers every safe Steel move without name search and combines category and power sorting", () => {
    const allSteel = getImplementedPokemonEditorMoves({ type: PokemonType.STEEL, sort: "power-desc" });
    expect(allSteel.length).toBeGreaterThan(0);
    expect(allSteel.every(move => move.type === PokemonType.STEEL)).toBe(true);
    expect(allSteel.some(move => move.name.length > 0)).toBe(true);

    const physicalSteel = getImplementedPokemonEditorMoves({
      type: PokemonType.STEEL,
      category: "physical",
      sort: "power-desc",
    });
    expect(physicalSteel.every(move => move.category === MoveCategory.PHYSICAL)).toBe(true);
    for (let index = 1; index < physicalSteel.length; index++) {
      expect(physicalSteel[index - 1].power).toBeGreaterThanOrEqual(physicalSteel[index].power);
    }
  });

  it("supports alphabetical, accuracy, and PP sorting over the complete browsable registry", () => {
    const all = getImplementedPokemonEditorMoves();
    expect(all.length).toBeGreaterThan(500);
    expect(all[0].name.localeCompare(all[1].name)).toBeLessThanOrEqual(0);

    const ppAscending = getImplementedPokemonEditorMoves({ sort: "pp-asc" });
    expect(ppAscending[0].pp).toBeLessThanOrEqual(ppAscending.at(-1)!.pp);
    const accuracyDescending = getImplementedPokemonEditorMoves({ sort: "accuracy-desc" });
    expect(
      accuracyDescending[0].accuracy === -1 || accuracyDescending[0].accuracy >= accuracyDescending.at(-1)!.accuracy,
    ).toBe(true);
  });

  it("derives effect groups from registry metadata and combines them with other filters", () => {
    const expectedEffects = new Map([
      [MoveId.TACKLE, "direct-damage"],
      [MoveId.RECOVER, "healing"],
      [MoveId.DRAIN_PUNCH, "hp-drain"],
      [MoveId.DOUBLE_EDGE, "recoil"],
      [MoveId.QUICK_ATTACK, "priority"],
      [MoveId.DOUBLE_SLAP, "multi-hit"],
      [MoveId.SLASH, "high-critical-hit-rate"],
      [MoveId.SWIFT, "always-hits"],
      [MoveId.SEISMIC_TOSS, "fixed-damage"],
      [MoveId.FISSURE, "one-hit-ko"],
      [MoveId.THUNDER_WAVE, "inflicts-status"],
      [MoveId.SWORDS_DANCE, "raises-user-stats"],
      [MoveId.GROWL, "lowers-target-stats"],
      [MoveId.PROTECT, "protection"],
      [MoveId.RAIN_DANCE, "weather"],
      [MoveId.ELECTRIC_TERRAIN, "terrain"],
      [MoveId.SPIKES, "entry-hazards"],
      [MoveId.U_TURN, "switching-or-pivoting"],
      [MoveId.WRAP, "trapping"],
      [MoveId.SOLAR_BEAM, "charge-move"],
      [MoveId.HYPER_BEAM, "recharge-move"],
    ] as const);

    for (const [moveId, effect] of expectedEffects) {
      expect(getImplementedPokemonEditorMoves({ included: [moveId], effect })).toHaveLength(1);
    }

    const physicalPriority = getImplementedPokemonEditorMoves({
      category: "physical",
      effect: "priority",
      sort: "power-desc",
    });
    expect(physicalPriority.length).toBeGreaterThan(0);
    expect(physicalPriority.every(move => move.category === MoveCategory.PHYSICAL && move.priority > 0)).toBe(true);

    const fireStatusEffects = getImplementedPokemonEditorMoves({
      type: PokemonType.FIRE,
      effect: "inflicts-status",
      sort: "name-asc",
    });
    expect(fireStatusEffects.length).toBeGreaterThan(0);
    expect(
      fireStatusEffects.every(move => move.type === PokemonType.FIRE && move.effects.includes("inflicts-status")),
    ).toBe(true);
  });

  it("can restrict the browser to a legitimate Move Relearner pool", () => {
    const allowed = [MoveId.TACKLE, MoveId.GROWL, MoveId.DRACO_METEOR];
    const restricted = getImplementedPokemonEditorMoves({ included: allowed, category: "status" });
    expect(restricted.map(move => move.id)).toEqual([MoveId.GROWL]);
  });
});

describe("Pokemon Editor Draco Caterpie acceptance", () => {
  it("retains an unrestricted build move through session Pokemon save/load while editing is Off", () => {
    const library = createEmptyPokemonBuildLibrary();
    const build = createSavedPokemonBuild(library, caterpieDraft(), "Draco Caterpie", 100);
    const applied = applySavedPokemonBuildToDraft(build, caterpieDraft(), 200);
    const runPokemon = new PokemonData({
      id: 1234,
      player: true,
      species: SpeciesId.CATERPIE,
      formIndex: applied.formIndex,
      abilityIndex: 0,
      passive: false,
      shiny: applied.shiny,
      variant: applied.variant,
      pokeball: PokeballType.POKEBALL,
      level: applied.level,
      exp: 0,
      levelExp: 0,
      gender: applied.gender,
      hp: 100,
      stats: [100, 50, 50, 50, 50, 50],
      ivs: applied.ivs,
      nature: applied.nature,
      moveset: applied.moves.map(moveId => new PokemonMove(moveId)),
      status: null,
      friendship: applied.friendship,
      metLevel: applied.level,
      metBiome: -1,
      metSpecies: SpeciesId.CATERPIE,
      metWave: -1,
      luck: 0,
      pauseEvolutions: false,
      pokerus: applied.pokerus,
      usedTMs: [],
      teraType: PokemonType.BUG,
      isTerastallized: false,
      stellarTypesBoosted: [],
      customPokemonData: { ability: applied.abilityId, editorSourceBuildId: build.id },
    });
    expect(runPokemon.moveset[0].moveId).toBe(MoveId.DRACO_METEOR);
    expect(runPokemon.moveset[0].getMove().name).toBe("Draco Meteor");

    const serialized = JSON.stringify(runPokemon);
    expect(activeOverrides.POKEMON_EDITOR_MODE_OVERRIDE).toBe(PokemonEditorMode.OFF);
    const reloaded = new PokemonData(JSON.parse(serialized));
    expect(reloaded.moveset[0].moveId).toBe(MoveId.DRACO_METEOR);
    expect(reloaded.customPokemonData.editorSourceBuildId).toBe(build.id);
    expect(library.builds[0].moves).toEqual([MoveId.DRACO_METEOR, MoveId.TACKLE]);
  });
});

describe("Pokemon Editor menu integration", () => {
  const readSource = (...segments: string[]) => readFileSync(join(process.cwd(), "src", ...segments), "utf8");

  it("renders nested option pages immediately without clearing their replacement config", () => {
    const uiSource = readSource("ui", "ui.ts");
    const optionSource = readSource("ui", "handlers", "base-option-select-ui-handler.ts");
    const editorUiSource = readSource("system", "pokemon-editor", "pokemon-editor-ui.ts");

    expect(uiSource).toContain("refreshOverlayMode(mode: UiMode");
    expect(uiSource).toContain("this.getHandler().show(args);\n    return Promise.resolve();");
    expect(optionSource).toContain("const activeConfig = this.config;");
    expect(optionSource).toContain("!option.keepOpen && this.config === activeConfig");
    expect(optionSource).toContain("this.fullCursor = 0;\n    this.cursor = 0;");
    const optionSelectMode = ["UiMode", "OPTION_SELECT"].join(".");
    expect(editorUiSource).toContain(`globalScene.ui.refreshOverlayMode(${optionSelectMode}`);
  });

  it("caps every editor, starter-action, and party-action window at seven visible rows", () => {
    const editorUiSource = readSource("system", "pokemon-editor", "pokemon-editor-ui.ts");
    const starterUiSource = readSource("ui", "handlers", "starter-select-ui-handler.ts");
    const partyUiSource = readSource("ui", "handlers", "party-ui-handler.ts");

    expect(editorUiSource).toContain("const EDITOR_MAX_VISIBLE_OPTIONS = 7;");
    expect(starterUiSource).toContain("maxOptions: 7,\n            yOffset: 47,");
    expect(partyUiSource).toContain("const visibleActionSlots = 6;");
    expect(partyUiSource).toContain("including its scroll indicators and persistent Cancel row");
    expect(partyUiSource).toContain("PartyOption.QUICK_EDIT_MOVES");
    expect(partyUiSource).toContain("pokemon.getLearnableLevelMoves()");
    expect(partyUiSource).toContain('"Editing is unavailable during battle.\\nFinish the battle first."');
  });

  it("uses bounded ten-step number navigation and page-sized word navigation", () => {
    const optionSource = readSource("ui", "handlers", "base-option-select-ui-handler.ts");
    const editorUiSource = readSource("system", "pokemon-editor", "pokemon-editor-ui.ts");

    expect(optionSource).toContain("const pageStepTarget");
    expect(optionSource).toContain("this.config?.wrapNavigation !== false");
    expect(editorUiSource).toContain("pageStep: 10");
    expect(editorUiSource).toContain("pageStepMaxIndex: maximum - minimum");
    expect(editorUiSource).toContain("options.length > maxOptions ? maxOptions : undefined");
  });

  it("keeps editor lists readable and exposes saved-build filtering", () => {
    const editorUiSource = readSource("system", "pokemon-editor", "pokemon-editor-ui.ts");
    const starterUiSource = readSource("ui", "handlers", "starter-select-ui-handler.ts");
    const gameDataSource = readSource("system", "game-data.ts");

    expect(editorUiSource).toContain(".sort((a, b) => compareLabels(a.name, b.name)");
    expect(editorUiSource).toContain("label: colorMoveLabel(move.name, move.type)");
    expect(editorUiSource).toContain("Browse All Moves (${count} matching)");
    expect(editorUiSource).toContain("Browse by Effect:");
    expect(editorUiSource).not.toContain("Save Current Setup as New Build");
    expect(starterUiSource).toContain('new DropDownOption("SAVED_BUILDS"');
    expect(starterUiSource).toContain("selectedEditorMoveset");
    expect(starterUiSource).toContain("editorAbilityId");
    expect(gameDataSource).toContain("Cached save-and-quit data can be absent");
  });

  it("preserves semantic ordering while sorting lookup catalogs", () => {
    const editorUiSource = readSource("system", "pokemon-editor", "pokemon-editor-ui.ts");
    const starterUiSource = readSource("ui", "handlers", "starter-select-ui-handler.ts");

    expect(editorUiSource).toContain("This is a rarity progression, not an alphabetical lookup list.");
    expect(editorUiSource).toContain("Preserve the game's canonical Male, Female, Genderless order.");
    expect(editorUiSource).toContain("Keep each field's high/low pair together in the most useful order.");
    expect(editorUiSource).toContain(".sort((a, b) => compareLabels(a.name, b.name)");
    expect(editorUiSource).toContain("compareLabels(toTitleCase(PokemonType[a]), toTitleCase(PokemonType[b]))");
    expect(starterUiSource).toContain(
      'new DropDownOption("POKERUS", pokerusLabels),\n      new DropDownOption("SAVED_BUILDS", savedBuildLabels)',
    );
  });
});
