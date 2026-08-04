import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { allAbilities, allMoves } from "#data/data-lists";
import { getNatureName } from "#data/nature";
import { Color, TypeColor, TypeShadow } from "#enums/color";
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

interface EditorOptionNavigation {
  pageStep?: number | undefined;
  pageStepMinIndex?: number | undefined;
  pageStepMaxIndex?: number | undefined;
  wrapNavigation?: boolean | undefined;
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function showOptions(
  options: OptionSelectItem[],
  initialCursor = 0,
  maxOptions = EDITOR_MAX_VISIBLE_OPTIONS,
  navigation: EditorOptionNavigation = {},
): void {
  globalScene.ui.refreshOverlayMode(UiMode.OPTION_SELECT, {
    options,
    maxOptions,
    initialCursor,
    measureVisibleOptionsOnly: options.length > 50,
    pageStep: navigation.pageStep ?? (options.length > maxOptions ? maxOptions : undefined),
    pageStepMinIndex: navigation.pageStepMinIndex,
    pageStepMaxIndex: navigation.pageStepMaxIndex,
    wrapNavigation: navigation.wrapNavigation,
    supportHover: true,
  });
}

function getTypeLabelColor(type: PokemonType): { color: string; shadow: string } {
  const typeName = PokemonType[type] as keyof typeof TypeColor;
  return {
    color: TypeColor[typeName] ?? Color.WHITE,
    shadow: TypeShadow[typeName] ?? Color.GREY,
  };
}

function colorMoveLabel(label: string, type: PokemonType): string {
  const { color, shadow } = getTypeLabelColor(type);
  return `[color=${color}][shadow=${shadow}]${label}[/shadow][/color]`;
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
  let mainCursor = 0;

  const showMain = (initialCursor = mainCursor) => {
    mainCursor = initialCursor;
    clearTooltip();
    const species = speciesDataRegistry.getSpecies(draft.speciesId);
    const options: OptionSelectItem[] = [
      {
        label: `Level: ${draft.level.toLocaleString()}`,
        handler: () =>
          showIntegerPicker(
            "Level",
            1,
            10_000,
            draft.level,
            value => (draft.level = value),
            () => showMain(0),
          ),
      },
      {
        label: `Form: ${species.getName(draft.formIndex)}`,
        handler: () => showFormPicker(draft, () => showMain(1)),
      },
      {
        label: `Nature: ${getNatureName(draft.nature)}`,
        handler: () => showNaturePicker(draft, () => showMain(2)),
      },
      {
        label: `Ability: ${allAbilities[draft.abilityId].name}`,
        handler: () => showAbilityPicker(draft, () => showMain(3)),
      },
      {
        label: `Gender: ${genderLabels[draft.gender]}`,
        handler: () => showGenderPicker(draft, () => showMain(4)),
      },
      {
        label: `Shiny: ${draft.shiny ? variantLabels[draft.variant] : "Off"}`,
        handler: () => showShinyPicker(draft, () => showMain(5)),
      },
      { label: `IVs: ${draft.ivs.join("/")}`, handler: () => showIvEditor(draft, () => showMain(6)) },
      {
        label: `Friendship: ${draft.friendship}`,
        handler: () =>
          showIntegerPicker(
            "Friendship",
            0,
            255,
            draft.friendship,
            value => (draft.friendship = value),
            () => showMain(7),
          ),
      },
      {
        label: `Pokerus: ${draft.pokerus ? "On" : "Off"}`,
        handler: () => {
          draft.pokerus = !draft.pokerus;
          showMain(8);
          return true;
        },
      },
      {
        label: `Moves: ${formatMoves(draft.moves)}`,
        handler: () => showPokemonMoveEditor(draft, () => showMain(9), context.legitimateMoves),
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
    showOptions(options, mainCursor);
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
  pageMinimum = minimum,
): boolean {
  const options = Array.from({ length: maximum - minimum + 1 }, (_, index) => {
    const value = minimum + index;
    return { label: value.toLocaleString(), handler: () => (apply(value), back(), true) };
  });
  options.push({ label: "Cancel", handler: () => (back(), true) });
  globalScene.ui.showText(`Choose ${label}.`, 0);
  showOptions(options, current - minimum, EDITOR_MAX_VISIBLE_OPTIONS, {
    pageStep: 10,
    pageStepMinIndex: pageMinimum - minimum,
    pageStepMaxIndex: maximum - minimum,
    wrapNavigation: false,
  });
  return true;
}

function showFormPicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const species = speciesDataRegistry.getSpecies(draft.speciesId);
  const formIndices = getSafePokemonEditorFormIndices(draft.speciesId);
  // Form registry order is meaningful: the standard/default form comes first,
  // followed by the game's own progression of alternate forms.
  const forms = formIndices.map(index => ({ index, label: species.getName(index) }));
  const options: OptionSelectItem[] = forms.map(form => ({
    label: form.label,
    handler: () => {
      draft.formIndex = form.index;
      back();
      return true;
    },
  }));
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(
    options,
    Math.max(
      0,
      forms.findIndex(form => form.index === draft.formIndex),
    ),
  );
  return true;
}

function showNaturePicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const natures = Array.from({ length: Nature.QUIRKY + 1 }, (_, nature) => ({
    nature: nature as Nature,
    label: getNatureName(nature as Nature, true, true, true),
  })).sort((a, b) => compareLabels(a.label, b.label));
  const options: OptionSelectItem[] = natures.map(entry => ({
    label: entry.label,
    handler: () => {
      draft.nature = entry.nature;
      back();
      return true;
    },
  }));
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(
    options,
    Math.max(
      0,
      natures.findIndex(entry => entry.nature === draft.nature),
    ),
  );
  return true;
}

function showAbilityPicker(draft: PokemonEditorDraft, back: () => void): boolean {
  const abilities = allAbilities
    .filter(ability => ability?.id && ability.name && !ability.unimplemented)
    .sort((a, b) => compareLabels(a.name, b.name) || a.id - b.id);
  const options: OptionSelectItem[] = abilities.map(ability => ({
    label: ability.name,
    handler: () => {
      draft.abilityId = ability.id;
      clearTooltip();
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
  // Preserve the game's canonical Male, Female, Genderless order.
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
  // This is a rarity progression, not an alphabetical lookup list.
  const shinyChoices = [
    { label: "Off", shiny: false, variant: 0 as const },
    ...variantLabels.map((label, variant) => ({ label, shiny: true, variant: variant as 0 | 1 | 2 })),
  ];
  const options: OptionSelectItem[] = shinyChoices.map(choice => ({
    label: choice.label,
    handler: () => {
      draft.shiny = choice.shiny;
      draft.variant = choice.variant;
      back();
      return true;
    },
  }));
  options.push({ label: "Cancel", handler: () => (back(), true) });
  showOptions(
    options,
    Math.max(
      0,
      shinyChoices.findIndex(
        choice => choice.shiny === draft.shiny && (!choice.shiny || choice.variant === draft.variant),
      ),
    ),
  );
  return true;
}

function showIvEditor(draft: PokemonEditorDraft, back: () => void): boolean {
  const names = ["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed"];
  let ivCursor = 0;
  const show = () => {
    const options: OptionSelectItem[] = names.map((name, index) => ({
      label: `${name}: ${draft.ivs[index]}`,
      handler: () => {
        ivCursor = index;
        return showIntegerPicker(name, 0, 31, draft.ivs[index], value => (draft.ivs[index] = value), show, 1);
      },
    }));
    options.push(
      { label: "Set All to 31", handler: () => ((ivCursor = 6), draft.ivs.fill(31), show(), true) },
      { label: "Set All to 0", handler: () => ((ivCursor = 7), draft.ivs.fill(0), show(), true) },
      { label: "Done", handler: () => (back(), true) },
    );
    showOptions(options, ivCursor);
  };
  show();
  return true;
}

interface MoveBrowserState {
  search: string;
  initial: string;
  type?: PokemonType | undefined;
  category: PokemonEditorMoveCategoryFilter;
  sort: PokemonEditorMoveSort;
}

export function showPokemonMoveEditor(
  draft: PokemonEditorDraft,
  back: () => void,
  legitimateMoves?: StarterMoveset,
): boolean {
  let moveCursor = 0;
  const show = () => {
    const options: OptionSelectItem[] = draft.moves.map((moveId, index) => ({
      label: colorMoveLabel(`${index + 1}. ${allMoves[moveId].name}`, allMoves[moveId].type),
      handler: () => {
        moveCursor = index;
        return showMoveSlotActions(draft, index, show);
      },
      onHover: () => moveTooltip(moveId),
    }));
    if (draft.moves.length < 4) {
      options.push({
        label: "+ Add Move",
        handler: () => {
          moveCursor = draft.moves.length;
          return showMoveBrowser(draft, draft.moves.length, show);
        },
      });
    }
    if (legitimateMoves && legitimateMoves.length > 0) {
      options.push({
        label: "Restore Legitimate Moves",
        handler: () => {
          moveCursor = options.length - 1;
          draft.moves = legitimateMoves.slice(0, 4) as StarterMoveset;
          show();
          return true;
        },
      });
    }
    options.push({ label: "Done", handler: () => (clearTooltip(), back(), true), onHover: clearTooltip });
    globalScene.ui.showText("Manage any implemented moves (1–4, no duplicates).", 0);
    showOptions(options, Math.min(moveCursor, options.length - 1));
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
  const state: MoveBrowserState = { search: "", initial: "", category: "all", sort: "name-asc" };
  let filterCursor = 0;
  const showFilters = (initialCursor = filterCursor) => {
    filterCursor = initialCursor;
    clearTooltip();
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
              showFilters(1);
            },
            () => showFilters(1),
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
          });
          showFilters(6);
          return true;
        },
      },
      { label: "Cancel", handler: () => (clearTooltip(), back(), true) },
    ];
    showOptions(options, filterCursor);
  };
  const showResults = (): boolean => {
    const moves = getImplementedPokemonEditorMoves({
      ...state,
      excluded: draft.moves.filter((_, index) => index !== slot),
    });
    const options: OptionSelectItem[] = moves.map(move => ({
      // Keep the virtualized result window narrow. The highlighted move's
      // complete registry details remain visible in the left tooltip.
      label: colorMoveLabel(move.name, move.type),
      handler: () => {
        draft.moves[slot] = move.id;
        clearTooltip();
        back();
        return true;
      },
      onHover: () => moveTooltip(move.id),
    }));
    options.push({
      label: `Back to Filters (${moves.length} matches)`,
      handler: () => (clearTooltip(), showFilters(0), true),
      onHover: clearTooltip,
    });
    globalScene.ui.showText(`${moves.length} matching moves. Up/Down: one move. Left/Right: one page.`, 0);
    showOptions(options);
    return true;
  };
  const showInitials = (): boolean => {
    const initials = ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    showOptions(
      initials.map(initial => ({
        label: initial || "Any",
        handler: () => ((state.initial = initial), showFilters(2), true),
      })),
      Math.max(0, initials.indexOf(state.initial)),
    );
    return true;
  };
  const showTypes = (): boolean => {
    const types = [...new Set(getImplementedPokemonEditorMoves().map(move => move.type))].sort((a, b) =>
      compareLabels(toTitleCase(PokemonType[a]), toTitleCase(PokemonType[b])),
    );
    showOptions(
      [
        { label: "Any", handler: () => ((state.type = undefined), showFilters(3), true) },
        ...types.map(type => ({
          label: colorMoveLabel(toTitleCase(PokemonType[type]), type),
          handler: () => ((state.type = type), showFilters(3), true),
        })),
      ],
      state.type === undefined ? 0 : Math.max(0, types.indexOf(state.type) + 1),
    );
    return true;
  };
  const showCategories = (): boolean => {
    const categories: PokemonEditorMoveCategoryFilter[] = ["all", "physical", "special", "status"];
    showOptions(
      categories.map(category => ({
        label: toTitleCase(category),
        handler: () => ((state.category = category), showFilters(4), true),
      })),
      categories.indexOf(state.category),
    );
    return true;
  };
  const showSorts = (): boolean => {
    // Keep each field's high/low pair together in the most useful order.
    const sorts = [
      "name-asc",
      "name-desc",
      "power-desc",
      "power-asc",
      "accuracy-desc",
      "accuracy-asc",
      "pp-desc",
      "pp-asc",
    ] satisfies PokemonEditorMoveSort[];
    showOptions(
      sorts.map(sort => ({
        label: formatMoveSort(sort),
        handler: () => ((state.sort = sort), showFilters(5), true),
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
  let listCursor = 0;
  const showList = () => {
    clearTooltip();
    const builds = getSavedPokemonBuildsForSpecies(library, context.draft.speciesId);
    const options: OptionSelectItem[] = builds.map((build, index) => ({
      label: `${build.name}${build.formIndex === context.draft.formIndex ? "" : ` (${speciesDataRegistry.getSpecies(build.speciesId).getName(build.formIndex)})`}`,
      handler: () => {
        listCursor = index;
        return showBuild(build);
      },
    }));
    options.push({ label: "Cancel", handler: () => (clearTooltip(), context.onCancel(), true), onHover: clearTooltip });
    globalScene.ui.showText(builds.length > 0 ? "Choose a saved build." : "No saved builds for this species yet.", 0);
    showOptions(options, Math.min(listCursor, options.length - 1));
  };
  const showBuild = (build: SavedPokemonBuild): boolean => {
    clearTooltip();
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
