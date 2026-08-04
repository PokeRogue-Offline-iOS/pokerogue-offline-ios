import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { allAbilities, allMoves } from "#data/data-lists";
import { getNatureName } from "#data/nature";
import { MoveCategory } from "#enums/move-category";
import type { MoveId } from "#enums/move-id";
import { MoveTarget } from "#enums/move-target";
import { Nature } from "#enums/nature";
import { PokemonType } from "#enums/pokemon-type";
import { UiMode } from "#enums/ui-mode";
import type { StarterMoveset } from "#types/save-data";
import type { OptionSelectItem } from "#types/ui-types";
import { toTitleCase } from "#utils/strings";
import {
  applySavedPokemonBuildToDraft,
  clonePokemonEditorDraft,
  createSavedPokemonBuild,
  deleteSavedPokemonBuild,
  duplicateSavedPokemonBuild,
  getImplementedPokemonEditorMoves,
  getPokemonEditorGenders,
  getSafePokemonEditorFormIndices,
  getSavedPokemonBuildsForSpecies,
  renameSavedPokemonBuild,
  setPreferredSavedPokemonBuild,
  updateSavedPokemonBuild,
} from "./pokemon-editor-service";
import type {
  PokemonBuildLibrary,
  PokemonEditorDraft,
  PokemonEditorMoveCategoryFilter,
  PokemonEditorMoveSort,
  SavedPokemonBuild,
} from "./pokemon-editor-types";

export interface PokemonEditorUiContext {
  title: string;
  onApply: (draft: PokemonEditorDraft) => void | Promise<void>;
  onCancel: () => void;
  legitimateMoves?: StarterMoveset | undefined;
}

const genderLabels = { [-1]: "Genderless", 0: "Male", 1: "Female" };
const variantLabels = ["Standard", "Rare", "Epic"];

const EDITOR_MAX_VISIBLE_OPTIONS = 7;

function showOptions(options: OptionSelectItem[], initialCursor = 0, maxOptions = EDITOR_MAX_VISIBLE_OPTIONS): void {
  globalScene.ui.refreshOverlayMode(UiMode.OPTION_SELECT, {
    options,
    maxOptions,
    initialCursor,
    measureVisibleOptionsOnly: options.length > 50,
    pageStep: options.length > 100 ? 100 : undefined,
    supportHover: true,
  });
}

function showConfirmation(message: string, onConfirm: () => void, onCancel: () => void): void {
  globalScene.ui.showText(message, null, () => {
    globalScene.ui.setOverlayMode(UiMode.CONFIRM, onConfirm, onCancel);
  });
}

function decodeModalValue(encoded: string): string {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return "";
  }
}

function showTextInput(initial: string, onSubmit: (value: string) => void, onCancel: () => void): void {
  globalScene.ui.setOverlayMode(
    UiMode.RENAME_POKEMON,
    {
      buttonActions: [(encoded: string) => onSubmit(decodeModalValue(encoded)), onCancel],
    },
    initial,
  );
}

function formatMoves(moves: readonly MoveId[]): string {
  return moves.map(moveId => allMoves[moveId]?.name ?? `#${moveId}`).join(" / ");
}

function moveTooltip(moveId: MoveId): void {
  const move = allMoves[moveId];
  const category = MoveCategory[move.category];
  const type = PokemonType[move.type];
  const power = getMovePowerLabel(moveId);
  const accuracy = move.accuracy === -1 ? "Always" : String(move.accuracy);
  globalScene.ui.showTooltip(
    move.name,
    [
      `Type: ${toTitleCase(type)}`,
      `Category: ${toTitleCase(category)}`,
      `Power: ${power}`,
      `Accuracy: ${accuracy}`,
      `PP: ${move.pp}`,
      `Priority: ${move.priority}`,
      `Target: ${toTitleCase(MoveTarget[move.moveTarget])}`,
      "",
      move.effect,
    ].join("\n"),
    true,
  );
}

function getMovePowerLabel(moveId: MoveId): string {
  const move = allMoves[moveId];
  if (move.category === MoveCategory.STATUS) {
    return "—";
  }
  if (move.hasAttr("OneHitKOAttr")) {
    return "OHKO";
  }
  if (move.hasAttr("FixedDamageAttr")) {
    return "Fixed";
  }
  if (move.power < 0 || move.hasAttr("VariablePowerAttr")) {
    return "Variable";
  }
  return String(move.power);
}

function clearTooltip(): void {
  globalScene.ui.hideTooltip();
}

export function showPokemonEditor(initialDraft: PokemonEditorDraft, context: PokemonEditorUiContext): void {
  const draft = clonePokemonEditorDraft(initialDraft);

  const showMain = () => {
    const species = speciesDataRegistry.getSpecies(draft.speciesId);
    const options: OptionSelectItem[] = [
      {
        label: `Level: ${draft.level.toLocaleString()}`,
        handler: () => showIntegerPicker("Level", 1, 10_000, draft.level, value => (draft.level = value), showMain),
      },
      {
        label: `Form: ${species.getName(draft.formIndex)}`,
        handler: () => showFormPicker(draft, showMain),
      },
      {
        label: `Nature: ${getNatureName(draft.nature)}`,
        handler: () => showNaturePicker(draft, showMain),
      },
      {
        label: `Ability: ${allAbilities[draft.abilityId].name}`,
        handler: () => showAbilityPicker(draft, showMain),
      },
      {
        label: `Gender: ${genderLabels[draft.gender]}`,
        handler: () => showGenderPicker(draft, showMain),
      },
      {
        label: `Shiny: ${draft.shiny ? variantLabels[draft.variant] : "Off"}`,
        handler: () => showShinyPicker(draft, showMain),
      },
      { label: `IVs: ${draft.ivs.join("/")}`, handler: () => showIvEditor(draft, showMain) },
      {
        label: `Friendship: ${draft.friendship}`,
        handler: () =>
          showIntegerPicker("Friendship", 0, 255, draft.friendship, value => (draft.friendship = value), showMain),
      },
      {
        label: `Pokerus: ${draft.pokerus ? "On" : "Off"}`,
        handler: () => {
          draft.pokerus = !draft.pokerus;
          showMain();
          return true;
        },
      },
      {
        label: `Moves: ${formatMoves(draft.moves)}`,
        handler: () => showPokemonMoveEditor(draft, showMain, context.legitimateMoves),
      },
      {
        label: "Apply Changes",
        handler: () => {
          void context.onApply(clonePokemonEditorDraft(draft));
          return true;
        },
      },
      { label: "Cancel (discard draft)", handler: () => (context.onCancel(), true) },
    ];
    globalScene.ui.showText(context.title, 0);
    showOptions(options);
  };

  showMain();
}

function showIntegerPicker(
  label: string,
  minimum: number,
  maximum: number,
  current: number,
  apply: (value: number) => void,
  back: () => void,
): boolean {
  const options = Array.from({ length: maximum - minimum + 1 }, (_, index) => {
    const value = minimum + index;
    return { label: value.toLocaleString(), handler: () => (apply(value), back(), true) };
  });
  options.push({ label: "Cancel", handler: () => (back(), true) });
  globalScene.ui.showText(`Choose ${label}.`, 0);
  showOptions(options, current - minimum);
  return true;
}

function showFormPicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const species = speciesDataRegistry.getSpecies(draft.speciesId);
  const formIndices = getSafePokemonEditorFormIndices(draft.speciesId);
  const options: OptionSelectItem[] = formIndices.map(index => ({
    label: species.getName(index),
    handler: () => {
      draft.formIndex = index;
      back();
      return true;
    },
  }));
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(options, Math.max(0, formIndices.indexOf(draft.formIndex)));
  return true;
}

function showNaturePicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const options: OptionSelectItem[] = Array.from({ length: Nature.QUIRKY + 1 }, (_, nature) => ({
    label: getNatureName(nature as Nature, true, true, true),
    handler: () => {
      draft.nature = nature as Nature;
      back();
      return true;
    },
  }));
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(options, draft.nature);
  return true;
}

function showAbilityPicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const abilities = allAbilities.filter(ability => ability?.id && ability.name && !ability.unimplemented);
  const options: OptionSelectItem[] = abilities.map(ability => ({
    label: ability.name,
    handler: () => {
      draft.abilityId = ability.id;
      back();
      return true;
    },
    onHover: () => globalScene.ui.showTooltip(ability.name, ability.description, true),
  }));
  options.push({ label: "Cancel", handler: () => (clearTooltip(), back(), true), onHover: clearTooltip });
  showOptions(
    options,
    Math.max(
      0,
      abilities.findIndex(ability => ability.id === draft.abilityId),
    ),
    EDITOR_MAX_VISIBLE_OPTIONS,
  );
  return true;
}

function showGenderPicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const genders = getPokemonEditorGenders(draft.speciesId);
  const options: OptionSelectItem[] = genders.map(gender => ({
    label: genderLabels[gender],
    handler: () => {
      draft.gender = gender;
      back();
      return true;
    },
  }));
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(options, Math.max(0, genders.indexOf(draft.gender)));
  return true;
}

function showShinyPicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const options: OptionSelectItem[] = [
    { label: "Off", handler: () => ((draft.shiny = false), (draft.variant = 0), back(), true) },
    ...variantLabels.map((label, variant) => ({
      label,
      handler: () => {
        draft.shiny = true;
        draft.variant = variant as 0 | 1 | 2;
        back();
        return true;
      },
    })),
    { label: "Cancel", handler: () => (back(), true) },
  ];
  showOptions(options, draft.shiny ? draft.variant + 1 : 0);
  return true;
}

function showIvEditor(draft: PokemonEditorDraft, back: () => void): boolean {
  const names = ["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed"];
  const show = () => {
    const options: OptionSelectItem[] = names.map((name, index) => ({
      label: `${name}: ${draft.ivs[index]}`,
      handler: () => showIntegerPicker(name, 0, 31, draft.ivs[index], value => (draft.ivs[index] = value), show),
    }));
    options.push(
      { label: "Set All to 31", handler: () => (draft.ivs.fill(31), show(), true) },
      { label: "Set All to 0", handler: () => (draft.ivs.fill(0), show(), true) },
      { label: "Done", handler: () => (back(), true) },
    );
    showOptions(options);
  };
  show();
  return true;
}

interface MoveBrowserState {
  search: string;
  initial: string;
  type?: number | undefined;
  category: PokemonEditorMoveCategoryFilter;
  sort: PokemonEditorMoveSort;
  page: number;
}

export function showPokemonMoveEditor(
  draft: PokemonEditorDraft,
  back: () => void,
  legitimateMoves?: StarterMoveset,
): boolean {
  const show = () => {
    const options: OptionSelectItem[] = draft.moves.map((moveId, index) => ({
      label: `${index + 1}. ${allMoves[moveId].name}`,
      handler: () => showMoveSlotActions(draft, index, show),
      onHover: () => moveTooltip(moveId),
    }));
    if (draft.moves.length < 4) {
      options.push({ label: "+ Add Move", handler: () => showMoveBrowser(draft, draft.moves.length, show) });
    }
    if (legitimateMoves && legitimateMoves.length > 0) {
      options.push({
        label: "Restore Legitimate Moves",
        handler: () => {
          draft.moves = legitimateMoves.slice(0, 4) as StarterMoveset;
          show();
          return true;
        },
      });
    }
    options.push({ label: "Done", handler: () => (clearTooltip(), back(), true), onHover: clearTooltip });
    globalScene.ui.showText("Manage any implemented moves (1–4, no duplicates).", 0);
    showOptions(options);
  };
  show();
  return true;
}

function showMoveSlotActions(draft: PokemonEditorDraft, index: number, back: () => void): boolean {
  const options: OptionSelectItem[] = [
    { label: "Replace", handler: () => showMoveBrowser(draft, index, back) },
    {
      label: "Move Up",
      handler: () => {
        if (index > 0) {
          [draft.moves[index - 1], draft.moves[index]] = [draft.moves[index], draft.moves[index - 1]];
        }
        back();
        return true;
      },
    },
    {
      label: "Move Down",
      handler: () => {
        if (index < draft.moves.length - 1) {
          [draft.moves[index + 1], draft.moves[index]] = [draft.moves[index], draft.moves[index + 1]];
        }
        back();
        return true;
      },
    },
  ];
  if (draft.moves.length > 1) {
    options.push({
      label: "Clear Slot",
      handler: () => {
        draft.moves.splice(index, 1);
        back();
        return true;
      },
    });
  }
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(options);
  return true;
}

function showMoveBrowser(draft: PokemonEditorDraft, slot: number, back: () => void): boolean {
  const state: MoveBrowserState = { search: "", initial: "", category: "all", sort: "name-asc", page: 0 };
  const showFilters = () => {
    const count = getImplementedPokemonEditorMoves({
      ...state,
      excluded: draft.moves.filter((_, index) => index !== slot),
    }).length;
    const options: OptionSelectItem[] = [
      { label: `Browse All Matching Moves (${count})`, handler: showResults },
      {
        label: `Name Search: ${state.search || "Any"}`,
        handler: () => {
          showTextInput(
            state.search,
            value => {
              state.search = value.trim();
              state.page = 0;
              showFilters();
            },
            showFilters,
          );
          return true;
        },
      },
      { label: `First Letter: ${state.initial || "Any"}`, handler: showInitials },
      { label: `Type: ${state.type === undefined ? "Any" : toTitleCase(PokemonType[state.type])}`, handler: showTypes },
      { label: `Category: ${toTitleCase(state.category)}`, handler: showCategories },
      { label: `Sort: ${formatMoveSort(state.sort)}`, handler: showSorts },
      {
        label: "Clear Filters",
        handler: () => {
          Object.assign(state, {
            search: "",
            initial: "",
            type: undefined,
            category: "all",
            sort: "name-asc",
            page: 0,
          });
          showFilters();
          return true;
        },
      },
      { label: "Cancel", handler: () => (clearTooltip(), back(), true) },
    ];
    showOptions(options);
  };
  const showResults = (): boolean => {
    const moves = getImplementedPokemonEditorMoves({
      ...state,
      excluded: draft.moves.filter((_, index) => index !== slot),
    });
    const pageSize = 8;
    const pageCount = Math.max(1, Math.ceil(moves.length / pageSize));
    state.page = Math.min(state.page, pageCount - 1);
    const options: OptionSelectItem[] = moves.slice(state.page * pageSize, (state.page + 1) * pageSize).map(move => ({
      label: `${move.name} · ${toTitleCase(PokemonType[move.type])} · ${toTitleCase(MoveCategory[move.category])} · Pwr ${move.powerLabel} · Acc ${move.accuracyLabel} · PP ${move.pp}`,
      handler: () => {
        draft.moves[slot] = move.id;
        clearTooltip();
        back();
        return true;
      },
      onHover: () => moveTooltip(move.id),
    }));
    if (state.page > 0) {
      options.push({ label: "← Previous Page", handler: () => (state.page--, showResults(), true) });
    }
    if (state.page + 1 < pageCount) {
      options.push({ label: "Next Page →", handler: () => (state.page++, showResults(), true) });
    }
    options.push({
      label: `Filters (${state.page + 1}/${pageCount})`,
      handler: () => (clearTooltip(), showFilters(), true),
      onHover: clearTooltip,
    });
    showOptions(options);
    return true;
  };
  const showInitials = (): boolean => {
    const initials = ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    showOptions(
      initials.map(initial => ({
        label: initial || "Any",
        handler: () => ((state.initial = initial), (state.page = 0), showFilters(), true),
      })),
      Math.max(0, initials.indexOf(state.initial)),
    );
    return true;
  };
  const showTypes = (): boolean => {
    const types = [...new Set(getImplementedPokemonEditorMoves().map(move => move.type))].sort((a, b) => a - b);
    showOptions([
      { label: "Any", handler: () => ((state.type = undefined), (state.page = 0), showFilters(), true) },
      ...types.map(type => ({
        label: toTitleCase(PokemonType[type]),
        handler: () => ((state.type = type), (state.page = 0), showFilters(), true),
      })),
    ]);
    return true;
  };
  const showCategories = (): boolean => {
    const categories: PokemonEditorMoveCategoryFilter[] = ["all", "physical", "special", "status"];
    showOptions(
      categories.map(category => ({
        label: toTitleCase(category),
        handler: () => ((state.category = category), (state.page = 0), showFilters(), true),
      })),
    );
    return true;
  };
  const showSorts = (): boolean => {
    const sorts: PokemonEditorMoveSort[] = [
      "name-asc",
      "name-desc",
      "power-desc",
      "power-asc",
      "accuracy-desc",
      "accuracy-asc",
      "pp-desc",
      "pp-asc",
    ];
    showOptions(
      sorts.map(sort => ({
        label: formatMoveSort(sort),
        handler: () => ((state.sort = sort), (state.page = 0), showFilters(), true),
      })),
      sorts.indexOf(state.sort),
    );
    return true;
  };
  showFilters();
  return true;
}

function formatMoveSort(sort: PokemonEditorMoveSort): string {
  const labels: Record<PokemonEditorMoveSort, string> = {
    "name-asc": "Name A–Z",
    "name-desc": "Name Z–A",
    "power-desc": "Power High–Low",
    "power-asc": "Power Low–High",
    "accuracy-desc": "Accuracy High–Low",
    "accuracy-asc": "Accuracy Low–High",
    "pp-desc": "PP High–Low",
    "pp-asc": "PP Low–High",
  };
  return labels[sort];
}

export interface PokemonBuildLibraryUiContext {
  draft: PokemonEditorDraft;
  allowManagement: boolean;
  onApply: (draft: PokemonEditorDraft) => void | Promise<void>;
  onSave: () => void | Promise<unknown>;
  onCancel: () => void;
}

export function showPokemonBuildLibrary(library: PokemonBuildLibrary, context: PokemonBuildLibraryUiContext): void {
  const showList = () => {
    const builds = getSavedPokemonBuildsForSpecies(library, context.draft.speciesId);
    const options: OptionSelectItem[] = builds.map(build => ({
      label: `${build.name}${build.formIndex === context.draft.formIndex ? "" : ` (${speciesDataRegistry.getSpecies(build.speciesId).getName(build.formIndex)})`}`,
      handler: () => showBuild(build),
      onHover: () => globalScene.ui.showTooltip(build.name, formatBuild(build), true),
    }));
    if (context.allowManagement) {
      options.push({
        label: "Save Current Setup as New Build",
        handler: () => {
          const build = createSavedPokemonBuild(library, context.draft);
          void context.onSave();
          showBuild(build);
          return true;
        },
      });
    }
    options.push({ label: "Cancel", handler: () => (clearTooltip(), context.onCancel(), true), onHover: clearTooltip });
    globalScene.ui.showText(builds.length > 0 ? "Choose a saved build." : "No saved builds for this species yet.", 0);
    showOptions(options);
  };
  const showBuild = (build: SavedPokemonBuild): boolean => {
    const options: OptionSelectItem[] = [
      {
        label: "Apply Build",
        handler: () => {
          showConfirmation(
            "Saved builds may contain moves this species cannot normally learn. Apply this build?",
            () => void context.onApply(applySavedPokemonBuildToDraft(build, context.draft)),
            () => showBuild(build),
          );
          return true;
        },
      },
      {
        label: "View Details",
        handler: () => (globalScene.ui.showText(formatBuild(build), null, () => showBuild(build)), true),
      },
    ];
    if (context.allowManagement) {
      const preferredKey = `${build.speciesId}:${build.formIndex}`;
      options.push(
        {
          label: "Rename",
          handler: () => {
            showTextInput(
              build.name,
              value => {
                renameSavedPokemonBuild(library, build.id, value);
                void context.onSave();
                showBuild(build);
              },
              () => showBuild(build),
            );
            return true;
          },
        },
        {
          label: "Duplicate",
          handler: () => {
            const duplicate = duplicateSavedPokemonBuild(library, build.id);
            void context.onSave();
            duplicate ? showBuild(duplicate) : showList();
            return true;
          },
        },
        {
          label: library.preferredBySpeciesForm[preferredKey] === build.id ? "Preferred ✓" : "Set Preferred",
          handler: () => {
            setPreferredSavedPokemonBuild(library, build.id);
            void context.onSave();
            showBuild(build);
            return true;
          },
        },
        {
          label: "Update Existing Build from Current Setup",
          handler: () => {
            showConfirmation(
              "Overwrite this saved build with the current setup?",
              () => {
                updateSavedPokemonBuild(library, build.id, context.draft);
                void context.onSave();
                showBuild(library.builds.find(candidate => candidate.id === build.id)!);
              },
              () => showBuild(build),
            );
            return true;
          },
        },
        {
          label: "Delete",
          handler: () => {
            showConfirmation(
              `Delete “${build.name}”?`,
              () => {
                deleteSavedPokemonBuild(library, build.id);
                void context.onSave();
                showList();
              },
              () => showBuild(build),
            );
            return true;
          },
        },
      );
    }
    options.push({ label: "Back", handler: () => (showList(), true) });
    showOptions(options);
    return true;
  };
  showList();
}

function formatBuild(build: SavedPokemonBuild): string {
  const fields = [
    `Level ${build.level ?? "default"}`,
    build.nature === undefined ? null : getNatureName(build.nature),
    build.abilityId === undefined ? null : allAbilities[build.abilityId]?.name,
    build.moves ? formatMoves(build.moves) : null,
    build.ivs ? `IVs ${build.ivs.join("/")}` : null,
    build.friendship === undefined ? null : `Friendship ${build.friendship}`,
    build.pokerus ? "Pokerus" : null,
  ];
  return fields.filter(Boolean).join("\n");
}
