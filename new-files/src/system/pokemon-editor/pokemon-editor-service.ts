import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { allAbilities, allMoves } from "#data/data-lists";
import { getLevelTotalExp } from "#data/exp";
import { Gender } from "#data/gender";
import { PokemonMove } from "#data/moves/pokemon-move";
import { AbilityId } from "#enums/ability-id";
import { MoveCategory } from "#enums/move-category";
import { MoveId } from "#enums/move-id";
import { Nature } from "#enums/nature";
import type { SpeciesId } from "#enums/species-id";
import type { Pokemon } from "#field/pokemon";
import type { Variant } from "#sprites/variant";
import type { Starter, StarterMoveset } from "#types/save-data";
import {
  type LegitimateStarterSetup,
  POKEMON_BUILD_SCHEMA_VERSION,
  POKEMON_EDITOR_MAX_LEVEL,
  type PokemonBuildLibrary,
  type PokemonEditorDraft,
  PokemonEditorMode,
  type PokemonEditorMoveCategoryFilter,
  type PokemonEditorMoveSort,
  type SavedPokemonBuild,
  type SelectedStarterEditorData,
} from "./pokemon-editor-types";

export interface PokemonBuildNormalizationResult {
  library: PokemonBuildLibrary;
  warnings: string[];
}

export interface ImplementedMoveQuery {
  search?: string | undefined;
  initial?: string | undefined;
  type?: number | undefined;
  category?: PokemonEditorMoveCategoryFilter | undefined;
  sort?: PokemonEditorMoveSort | undefined;
  excluded?: readonly MoveId[] | undefined;
}

/** Cached, display-ready metadata derived only from the game's move registry. */
export interface PokemonEditorMoveMetadata {
  id: MoveId;
  name: string;
  normalizedName: string;
  type: number;
  category: MoveCategory;
  power: number;
  powerLabel: string;
  accuracy: number;
  accuracyLabel: string;
  pp: number;
  priority: number;
  target: number;
  effect: string;
}

type EditorStarter = Starter & { editorData?: SelectedStarterEditorData | undefined };

const starterUndoSnapshots = new WeakMap<EditorStarter, EditorStarter>();
const pokemonUndoSnapshots = new WeakMap<Pokemon, PokemonEditorDraft>();

const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, Math.trunc(numeric))) : fallback;
};

const copyMoves = (moves: readonly MoveId[]): StarterMoveset => moves.slice(0, 4) as StarterMoveset;
const copyIvs = (ivs: readonly number[]): [number, number, number, number, number, number] =>
  Array.from({ length: 6 }, (_, index) => clampInteger(ivs[index], 0, 31, 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

function copyEditorData(data: SelectedStarterEditorData | undefined): SelectedStarterEditorData | undefined {
  if (!data) {
    return;
  }
  return {
    ...data,
    customMoveset: copyMoves(data.customMoveset),
    legitimateSetup: {
      ...data.legitimateSetup,
      moveset: data.legitimateSetup.moveset ? copyMoves(data.legitimateSetup.moveset) : undefined,
      ivs: [...data.legitimateSetup.ivs],
    },
  };
}

function copyStarter(starter: EditorStarter): EditorStarter {
  return {
    ...starter,
    moveset: starter.moveset ? copyMoves(starter.moveset) : undefined,
    ivs: [...starter.ivs],
    editorData: copyEditorData(starter.editorData),
  } as EditorStarter;
}

export function createEmptyPokemonBuildLibrary(): PokemonBuildLibrary {
  return { schemaVersion: POKEMON_BUILD_SCHEMA_VERSION, builds: [], preferredBySpeciesForm: {} };
}

export function getPokemonBuildSpeciesFormKey(speciesId: SpeciesId, formIndex: number): string {
  return `${speciesId}:${formIndex}`;
}

export function createPokemonBuildId(now = Date.now(), random = Math.random()): string {
  return `pokemon-build-${now.toString(36)}-${Math.floor(random * 0x100000000)
    .toString(36)
    .padStart(7, "0")}`;
}

function createUniquePokemonBuildId(existingIds: ReadonlySet<string>, now = Date.now()): string {
  let attempt = 0;
  let id: string;
  do {
    id = createPokemonBuildId(now + attempt, Math.random());
    attempt++;
  } while (existingIds.has(id));
  return id;
}

export function isImplementedPokemonEditorMove(moveId: unknown): moveId is MoveId {
  if (!Number.isInteger(moveId) || moveId === MoveId.NONE) {
    return false;
  }
  const move = allMoves[moveId as MoveId];
  return !!(
    move
    && move.id === moveId
    && move.name
    && move.effect
    && move.pp > 0
    && move.moveTarget !== undefined
    && !move.name.endsWith(" (N)")
  );
}

export function isImplementedPokemonEditorAbility(abilityId: unknown): abilityId is AbilityId {
  if (!Number.isInteger(abilityId) || abilityId === AbilityId.NONE) {
    return false;
  }
  const ability = allAbilities[abilityId as AbilityId];
  return !!(ability && ability.id === abilityId && ability.name && !ability.unimplemented);
}

export function normalizePokemonEditorMoves(value: unknown): StarterMoveset | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const unique: MoveId[] = [];
  for (const moveId of value) {
    if (isImplementedPokemonEditorMove(moveId) && !unique.includes(moveId)) {
      unique.push(moveId);
    }
    if (unique.length === 4) {
      break;
    }
  }
  return unique.length > 0 ? (unique as StarterMoveset) : null;
}

let implementedMoveMetadataCache: readonly PokemonEditorMoveMetadata[] | undefined;

function getImplementedMoveMetadataCache(): readonly PokemonEditorMoveMetadata[] {
  implementedMoveMetadataCache ??= allMoves
    .filter(move => isImplementedPokemonEditorMove(move?.id))
    .map(move => {
      let powerLabel: string;
      if (move.category === MoveCategory.STATUS) {
        powerLabel = "—";
      } else if (move.hasAttr("OneHitKOAttr")) {
        powerLabel = "OHKO";
      } else if (move.hasAttr("FixedDamageAttr")) {
        powerLabel = "Fixed";
      } else if (move.power < 0 || move.hasAttr("VariablePowerAttr")) {
        powerLabel = "Variable";
      } else {
        powerLabel = String(move.power);
      }
      return {
        id: move.id,
        name: move.name,
        normalizedName: move.name.toLocaleLowerCase(),
        type: move.type,
        category: move.category,
        power: move.power,
        powerLabel,
        accuracy: move.accuracy,
        accuracyLabel: move.accuracy === -1 ? "Always" : String(move.accuracy),
        pp: move.pp,
        priority: move.priority,
        target: move.moveTarget,
        effect: move.effect,
      };
    });
  return implementedMoveMetadataCache;
}

export function getImplementedPokemonEditorMoves(query: ImplementedMoveQuery = {}) {
  const search = query.search?.trim().toLocaleLowerCase() ?? "";
  const initial = query.initial?.trim().toLocaleUpperCase() ?? "";
  const excluded = new Set(query.excluded ?? []);
  const category = query.category ?? "all";
  const result = getImplementedMoveMetadataCache().filter(move => {
    if (excluded.has(move.id)) {
      return false;
    }
    if (search && !move.normalizedName.includes(search)) {
      return false;
    }
    if (initial && !move.name.toLocaleUpperCase().startsWith(initial)) {
      return false;
    }
    if (query.type !== undefined && move.type !== query.type) {
      return false;
    }
    return (
      category === "all"
      || (category === "physical" && move.category === MoveCategory.PHYSICAL)
      || (category === "special" && move.category === MoveCategory.SPECIAL)
      || (category === "status" && move.category === MoveCategory.STATUS)
    );
  });
  const sort = query.sort ?? "name-asc";
  return result.sort((a, b) => {
    switch (sort) {
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "power-desc":
        return b.power - a.power || a.name.localeCompare(b.name);
      case "power-asc":
        return a.power - b.power || a.name.localeCompare(b.name);
      case "accuracy-desc":
        return (
          (b.accuracy === -1 ? 101 : b.accuracy) - (a.accuracy === -1 ? 101 : a.accuracy)
          || a.name.localeCompare(b.name)
        );
      case "accuracy-asc":
        return (
          (a.accuracy === -1 ? 101 : a.accuracy) - (b.accuracy === -1 ? 101 : b.accuracy)
          || a.name.localeCompare(b.name)
        );
      case "pp-desc":
        return b.pp - a.pp || a.name.localeCompare(b.name);
      case "pp-asc":
        return a.pp - b.pp || a.name.localeCompare(b.name);
      default:
        return a.name.localeCompare(b.name);
    }
  });
}

function getSpecies(speciesId: unknown) {
  if (!Number.isInteger(speciesId)) {
    return null;
  }
  try {
    return speciesDataRegistry.getSpecies(speciesId as SpeciesId) ?? null;
  } catch {
    return null;
  }
}

export function normalizePokemonEditorFormIndex(speciesId: SpeciesId, formIndex: unknown): number {
  const species = getSpecies(speciesId);
  if (!species || species.forms.length === 0) {
    return 0;
  }
  const safeIndices = getSafePokemonEditorFormIndices(speciesId);
  const requested = clampInteger(formIndex, 0, species.forms.length - 1, safeIndices[0] ?? 0);
  return safeIndices.includes(requested) ? requested : (safeIndices[0] ?? 0);
}

/** Permanent/starter-selectable forms with real obtainable data and assets. */
export function getSafePokemonEditorFormIndices(speciesId: SpeciesId): number[] {
  const species = getSpecies(speciesId);
  if (!species || species.forms.length === 0) {
    return [0];
  }
  const safe = species.forms
    .map((form, index) => ({ form, index }))
    .filter(({ form }) => form.isStarterSelectable && !form.isUnobtainable)
    .map(({ index }) => index);
  return safe.length > 0 ? safe : [0];
}

export function getPokemonEditorGenders(speciesId: SpeciesId): Gender[] {
  const malePercent = getSpecies(speciesId)?.malePercent;
  if (malePercent == null) {
    return [Gender.GENDERLESS];
  }
  if (malePercent === 0) {
    return [Gender.FEMALE];
  }
  if (malePercent === 100) {
    return [Gender.MALE];
  }
  return [Gender.MALE, Gender.FEMALE];
}

function normalizeDraftValue(value: Partial<PokemonEditorDraft>, fallback: PokemonEditorDraft): PokemonEditorDraft {
  const speciesId = getSpecies(value.speciesId) ? value.speciesId! : fallback.speciesId;
  const validGenders = getPokemonEditorGenders(speciesId);
  const shiny = typeof value.shiny === "boolean" ? value.shiny : fallback.shiny;
  const moves = normalizePokemonEditorMoves(value.moves) ?? copyMoves(fallback.moves);
  return {
    speciesId,
    formIndex: normalizePokemonEditorFormIndex(speciesId, value.formIndex ?? fallback.formIndex),
    level: clampInteger(value.level, 1, POKEMON_EDITOR_MAX_LEVEL, fallback.level),
    nature: clampInteger(value.nature, Nature.HARDY, Nature.QUIRKY, fallback.nature) as Nature,
    abilityId: isImplementedPokemonEditorAbility(value.abilityId) ? value.abilityId : fallback.abilityId,
    gender: validGenders.includes(value.gender as Gender) ? (value.gender as Gender) : validGenders[0],
    shiny,
    variant: (shiny ? clampInteger(value.variant, 0, 2, fallback.variant) : 0) as Variant,
    ivs: copyIvs(value.ivs ?? fallback.ivs),
    friendship: clampInteger(value.friendship, 0, 255, fallback.friendship),
    pokerus: typeof value.pokerus === "boolean" ? value.pokerus : fallback.pokerus,
    moves,
    sourceBuildId: typeof value.sourceBuildId === "string" ? value.sourceBuildId : fallback.sourceBuildId,
  };
}

export function clonePokemonEditorDraft(draft: PokemonEditorDraft): PokemonEditorDraft {
  return { ...draft, ivs: copyIvs(draft.ivs), moves: copyMoves(draft.moves) };
}

function normalizeSavedBuild(raw: unknown, usedIds: Set<string>, warnings: string[]): SavedPokemonBuild | null {
  if (!raw || typeof raw !== "object") {
    warnings.push("Skipped a non-object Pokemon build.");
    return null;
  }
  const source = raw as Partial<SavedPokemonBuild>;
  const species = getSpecies(source.speciesId);
  const moves = normalizePokemonEditorMoves(source.moves);
  if (!species || !moves) {
    warnings.push(`Skipped unusable Pokemon build${source.name ? ` "${source.name}"` : ""}.`);
    return null;
  }
  const now = Date.now();
  let id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : createPokemonBuildId(now);
  if (usedIds.has(id)) {
    warnings.push(`Regenerated duplicate Pokemon build ID ${id}.`);
    id = createUniquePokemonBuildId(usedIds, now);
  }
  usedIds.add(id);
  const validGenders = getPokemonEditorGenders(source.speciesId!);
  const shiny = source.shiny === true;
  return {
    id,
    schemaVersion: POKEMON_BUILD_SCHEMA_VERSION,
    name:
      typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 48) : `${species.name} Build`,
    speciesId: source.speciesId!,
    formIndex: normalizePokemonEditorFormIndex(source.speciesId!, source.formIndex),
    level: source.level === undefined ? undefined : clampInteger(source.level, 1, POKEMON_EDITOR_MAX_LEVEL, 1),
    nature:
      source.nature === undefined
        ? undefined
        : (clampInteger(source.nature, Nature.HARDY, Nature.QUIRKY, Nature.HARDY) as Nature),
    abilityId: isImplementedPokemonEditorAbility(source.abilityId) ? source.abilityId : undefined,
    gender: validGenders.includes(source.gender as Gender) ? source.gender : undefined,
    shiny: source.shiny === undefined ? undefined : shiny,
    variant:
      source.variant === undefined ? undefined : ((shiny ? clampInteger(source.variant, 0, 2, 0) : 0) as Variant),
    ivs: source.ivs === undefined ? undefined : copyIvs(source.ivs),
    friendship:
      source.friendship === undefined ? undefined : clampInteger(source.friendship, 0, 255, species.baseFriendship),
    pokerus: typeof source.pokerus === "boolean" ? source.pokerus : undefined,
    moves,
    createdAt: clampInteger(source.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: clampInteger(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, now),
    lastUsedAt:
      source.lastUsedAt === undefined ? undefined : clampInteger(source.lastUsedAt, 0, Number.MAX_SAFE_INTEGER, now),
  };
}

export function normalizePokemonBuildLibrary(value: unknown): PokemonBuildNormalizationResult {
  const warnings: string[] = [];
  const source = value && typeof value === "object" ? (value as Partial<PokemonBuildLibrary>) : {};
  const usedIds = new Set<string>();
  const builds = (Array.isArray(source.builds) ? source.builds : [])
    .map(build => normalizeSavedBuild(build, usedIds, warnings))
    .filter((build): build is SavedPokemonBuild => !!build);
  const preferredBySpeciesForm: Record<string, string> = {};
  if (source.preferredBySpeciesForm && typeof source.preferredBySpeciesForm === "object") {
    Object.entries(source.preferredBySpeciesForm).forEach(([key, id]) => {
      const build = builds.find(candidate => candidate.id === id);
      if (build && key === getPokemonBuildSpeciesFormKey(build.speciesId, build.formIndex)) {
        preferredBySpeciesForm[key] = id;
      } else {
        warnings.push(`Removed invalid preferred Pokemon build reference ${String(id)}.`);
      }
    });
  }
  return {
    library: { schemaVersion: POKEMON_BUILD_SCHEMA_VERSION, builds, preferredBySpeciesForm },
    warnings: [...new Set(warnings)],
  };
}

function nextDefaultBuildName(library: PokemonBuildLibrary, speciesId: SpeciesId): string {
  const speciesName = getSpecies(speciesId)?.name ?? "Pokemon";
  let index = 1;
  while (library.builds.some(build => build.name === `${speciesName} Build ${index}`)) {
    index++;
  }
  return `${speciesName} Build ${index}`;
}

export function createSavedPokemonBuild(
  library: PokemonBuildLibrary,
  draft: PokemonEditorDraft,
  name?: string,
  now = Date.now(),
): SavedPokemonBuild {
  const normalized = clonePokemonEditorDraft(draft);
  const id = createUniquePokemonBuildId(new Set(library.builds.map(candidate => candidate.id)), now);
  const build: SavedPokemonBuild = {
    id,
    schemaVersion: POKEMON_BUILD_SCHEMA_VERSION,
    name: name?.trim().slice(0, 48) || nextDefaultBuildName(library, normalized.speciesId),
    speciesId: normalized.speciesId,
    formIndex: normalized.formIndex,
    level: normalized.level,
    nature: normalized.nature,
    abilityId: normalized.abilityId,
    gender: normalized.gender,
    shiny: normalized.shiny,
    variant: normalized.variant,
    ivs: copyIvs(normalized.ivs),
    friendship: normalized.friendship,
    pokerus: normalized.pokerus,
    moves: copyMoves(normalized.moves),
    createdAt: now,
    updatedAt: now,
  };
  library.builds.push(build);
  return build;
}

export function renameSavedPokemonBuild(
  library: PokemonBuildLibrary,
  id: string,
  name: string,
  now = Date.now(),
): boolean {
  const build = library.builds.find(candidate => candidate.id === id);
  const normalizedName = name.trim().slice(0, 48);
  if (!build || !normalizedName) {
    return false;
  }
  build.name = normalizedName;
  build.updatedAt = now;
  return true;
}

export function duplicateSavedPokemonBuild(
  library: PokemonBuildLibrary,
  id: string,
  now = Date.now(),
): SavedPokemonBuild | null {
  const build = library.builds.find(candidate => candidate.id === id);
  if (!build) {
    return null;
  }
  const duplicate: SavedPokemonBuild = {
    ...build,
    id: createUniquePokemonBuildId(new Set(library.builds.map(candidate => candidate.id)), now),
    name: `${build.name} Copy`.slice(0, 48),
    ivs: build.ivs ? copyIvs(build.ivs) : undefined,
    moves: build.moves ? copyMoves(build.moves) : undefined,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: undefined,
  };
  library.builds.push(duplicate);
  return duplicate;
}

export function updateSavedPokemonBuild(
  library: PokemonBuildLibrary,
  id: string,
  draft: PokemonEditorDraft,
  now = Date.now(),
): boolean {
  const index = library.builds.findIndex(candidate => candidate.id === id);
  if (index < 0) {
    return false;
  }
  const original = library.builds[index];
  library.builds[index] = {
    ...createSavedPokemonBuild({ ...library, builds: [] }, draft, original.name, now),
    id: original.id,
    createdAt: original.createdAt,
    updatedAt: now,
  };
  return true;
}

export function deleteSavedPokemonBuild(library: PokemonBuildLibrary, id: string): boolean {
  const index = library.builds.findIndex(candidate => candidate.id === id);
  if (index < 0) {
    return false;
  }
  library.builds.splice(index, 1);
  Object.keys(library.preferredBySpeciesForm).forEach(key => {
    if (library.preferredBySpeciesForm[key] === id) {
      delete library.preferredBySpeciesForm[key];
    }
  });
  return true;
}

export function setPreferredSavedPokemonBuild(library: PokemonBuildLibrary, id: string | null): boolean {
  if (id === null) {
    Object.keys(library.preferredBySpeciesForm).forEach(key => delete library.preferredBySpeciesForm[key]);
    return true;
  }
  const build = library.builds.find(candidate => candidate.id === id);
  if (!build) {
    return false;
  }
  library.preferredBySpeciesForm[getPokemonBuildSpeciesFormKey(build.speciesId, build.formIndex)] = id;
  return true;
}

export function getSavedPokemonBuildsForSpecies(
  library: PokemonBuildLibrary,
  speciesId: SpeciesId,
  formIndex?: number,
): SavedPokemonBuild[] {
  return library.builds
    .filter(build => build.speciesId === speciesId && (formIndex === undefined || build.formIndex === formIndex))
    .sort((a, b) => {
      const aPreferred =
        library.preferredBySpeciesForm[getPokemonBuildSpeciesFormKey(a.speciesId, a.formIndex)] === a.id;
      const bPreferred =
        library.preferredBySpeciesForm[getPokemonBuildSpeciesFormKey(b.speciesId, b.formIndex)] === b.id;
      return (
        Number(bPreferred) - Number(aPreferred)
        || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        || a.formIndex - b.formIndex
        || b.updatedAt - a.updatedAt
      );
    });
}

export function applySavedPokemonBuildToDraft(
  build: SavedPokemonBuild,
  fallback: PokemonEditorDraft,
  now = Date.now(),
): PokemonEditorDraft {
  build.lastUsedAt = now;
  return normalizeDraftValue(
    { ...build, moves: build.moves!, sourceBuildId: build.id } as Partial<PokemonEditorDraft>,
    fallback,
  );
}

function captureLegitimateStarterSetup(starter: Starter): LegitimateStarterSetup {
  return {
    shiny: starter.shiny,
    variant: starter.variant,
    formIndex: starter.formIndex,
    female: starter.female,
    abilityIndex: starter.abilityIndex,
    nature: starter.nature,
    moveset: starter.moveset ? copyMoves(starter.moveset) : undefined,
    pokerus: starter.pokerus,
    ivs: [...starter.ivs],
  };
}

export function createPokemonEditorDraftFromStarter(starter: EditorStarter, level: number): PokemonEditorDraft {
  const species = getSpecies(starter.speciesId)!;
  const form = species.forms[normalizePokemonEditorFormIndex(starter.speciesId, starter.formIndex)] ?? species;
  const editorData = starter.editorData;
  const moves =
    normalizePokemonEditorMoves(editorData?.customMoveset ?? starter.moveset) ?? ([MoveId.TACKLE] as StarterMoveset);
  const abilityId = editorData?.abilityId ?? form.getAbility(starter.abilityIndex) ?? species.ability1;
  return normalizeDraftValue(
    {
      speciesId: starter.speciesId,
      formIndex: starter.formIndex,
      level: editorData?.level ?? level,
      nature: starter.nature,
      abilityId,
      gender: starter.female === undefined ? Gender.GENDERLESS : starter.female ? Gender.FEMALE : Gender.MALE,
      shiny: starter.shiny,
      variant: starter.variant,
      ivs: copyIvs(starter.ivs),
      friendship: editorData?.friendship ?? species.baseFriendship,
      pokerus: starter.pokerus,
      moves,
      sourceBuildId: editorData?.sourceBuildId,
    },
    {
      speciesId: starter.speciesId,
      formIndex: 0,
      level: 1,
      nature: Nature.HARDY,
      abilityId: species.ability1,
      gender: getPokemonEditorGenders(starter.speciesId)[0],
      shiny: false,
      variant: 0,
      ivs: [0, 0, 0, 0, 0, 0],
      friendship: species.baseFriendship,
      pokerus: false,
      moves,
    },
  );
}

export function applyPokemonEditorDraftToStarter(starter: EditorStarter, draft: PokemonEditorDraft): void {
  const normalized = clonePokemonEditorDraft(draft);
  starterUndoSnapshots.set(starter, copyStarter(starter));
  const legitimateSetup = starter.editorData?.legitimateSetup ?? captureLegitimateStarterSetup(starter);
  starter.shiny = normalized.shiny;
  starter.variant = normalized.variant;
  starter.formIndex = normalized.formIndex;
  starter.female = normalized.gender === Gender.GENDERLESS ? undefined : normalized.gender === Gender.FEMALE;
  starter.nature = normalized.nature;
  starter.pokerus = normalized.pokerus;
  starter.ivs = [...normalized.ivs];
  starter.editorData = {
    schemaVersion: 1,
    level: normalized.level,
    abilityId: normalized.abilityId,
    friendship: normalized.friendship,
    customMoveset: copyMoves(normalized.moves),
    legitimateSetup,
    sourceBuildId: normalized.sourceBuildId,
  };
}

export function restoreLegitimateStarterSetup(starter: EditorStarter): boolean {
  const setup = starter.editorData?.legitimateSetup;
  if (!setup) {
    return false;
  }
  starterUndoSnapshots.set(starter, copyStarter(starter));
  Object.assign(starter, {
    shiny: setup.shiny,
    variant: setup.variant,
    formIndex: setup.formIndex,
    female: setup.female,
    abilityIndex: setup.abilityIndex,
    nature: setup.nature,
    moveset: setup.moveset ? copyMoves(setup.moveset) : undefined,
    pokerus: setup.pokerus,
    ivs: [...setup.ivs],
    editorData: undefined,
  });
  return true;
}

export function undoLastStarterEditorChange(starter: EditorStarter): boolean {
  const snapshot = starterUndoSnapshots.get(starter);
  if (!snapshot) {
    return false;
  }
  Object.assign(starter, copyStarter(snapshot));
  starterUndoSnapshots.delete(starter);
  return true;
}

export function resolveStarterForPokemonEditor(starter: EditorStarter, mode: PokemonEditorMode): EditorStarter {
  const resolved = copyStarter(starter);
  const legitimate = starter.editorData?.legitimateSetup;
  if (mode === PokemonEditorMode.OFF && legitimate) {
    Object.assign(resolved, {
      shiny: legitimate.shiny,
      variant: legitimate.variant,
      formIndex: legitimate.formIndex,
      female: legitimate.female,
      abilityIndex: legitimate.abilityIndex,
      nature: legitimate.nature,
      moveset: legitimate.moveset ? copyMoves(legitimate.moveset) : undefined,
      pokerus: legitimate.pokerus,
      ivs: [...legitimate.ivs],
      editorData: undefined,
    });
  }
  return resolved;
}

export function createPokemonEditorDraftFromPokemon(pokemon: Pokemon): PokemonEditorDraft {
  return {
    speciesId: pokemon.species.speciesId,
    formIndex: pokemon.formIndex,
    level: pokemon.level,
    nature: pokemon.getNature(),
    abilityId: pokemon.getAbility().id,
    gender: pokemon.gender,
    shiny: pokemon.shiny,
    variant: pokemon.shiny ? pokemon.variant : 0,
    ivs: copyIvs(pokemon.ivs),
    friendship: pokemon.friendship,
    pokerus: pokemon.pokerus,
    moves: copyMoves(pokemon.moveset.map(move => move.moveId)),
    sourceBuildId: pokemon.customPokemonData.editorSourceBuildId,
  };
}

export async function applyPokemonEditorDraftToPokemon(pokemon: Pokemon, draft: PokemonEditorDraft): Promise<void> {
  const normalized = normalizeDraftValue(draft, createPokemonEditorDraftFromPokemon(pokemon));
  pokemonUndoSnapshots.set(pokemon, createPokemonEditorDraftFromPokemon(pokemon));
  const oldMaxHp = pokemon.getMaxHp();
  const oldHp = pokemon.hp;
  pokemon.formIndex = normalized.formIndex;
  pokemon.level = normalized.level;
  pokemon.exp = getLevelTotalExp(normalized.level, pokemon.species.growthRate);
  pokemon.nature = normalized.nature;
  pokemon.customPokemonData.nature = normalized.nature;
  pokemon.customPokemonData.ability = normalized.abilityId;
  pokemon.customPokemonData.editorSourceBuildId = normalized.sourceBuildId;
  pokemon.gender = normalized.gender;
  pokemon.shiny = normalized.shiny;
  pokemon.variant = normalized.variant;
  pokemon.ivs = [...normalized.ivs];
  pokemon.friendship = normalized.friendship;
  pokemon.pokerus = normalized.pokerus;
  pokemon.moveset = normalized.moves.map(moveId => new PokemonMove(moveId));
  pokemon.calculateStats();
  const newMaxHp = pokemon.getMaxHp();
  pokemon.hp =
    oldHp === 0 ? 0 : Math.max(1, Math.min(newMaxHp, Math.round((oldHp / Math.max(oldMaxHp, 1)) * newMaxHp)));
  await pokemon.loadAssets();
  globalScene.updateModifiers(true, true);
  await pokemon.updateInfo(true);
}

export async function undoLastPokemonEditorChange(pokemon: Pokemon): Promise<boolean> {
  const snapshot = pokemonUndoSnapshots.get(pokemon);
  if (!snapshot) {
    return false;
  }
  pokemonUndoSnapshots.delete(pokemon);
  await applyPokemonEditorDraftToPokemon(pokemon, snapshot);
  pokemonUndoSnapshots.delete(pokemon);
  return true;
}
