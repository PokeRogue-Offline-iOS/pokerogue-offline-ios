import type { Gender } from "#data/gender";
import type { AbilityId } from "#enums/ability-id";
import type { Nature } from "#enums/nature";
import type { SpeciesId } from "#enums/species-id";
import type { Variant } from "#sprites/variant";
import type { StarterMoveset } from "#types/save-data";

/** Current persisted schema for the saved Pokemon build library. */
export const POKEMON_BUILD_SCHEMA_VERSION = 1;

/** Highest level accepted by the editor while keeping EXP/stat arithmetic safe. */
export const POKEMON_EDITOR_MAX_LEVEL = 10_000;

/** The three live capability levels exposed by the Offline setting. */
export enum PokemonEditorMode {
  OFF = 0,
  USE_SAVED_BUILDS = 1,
  FULL_EDITOR = 2,
}

/** A normalized editor draft. Drafts are copied before every edit or apply. */
export interface PokemonEditorDraft {
  speciesId: SpeciesId;
  formIndex: number;
  level: number;
  nature: Nature;
  abilityId: AbilityId;
  gender: Gender;
  shiny: boolean;
  variant: Variant;
  ivs: [number, number, number, number, number, number];
  friendship: number;
  pokerus: boolean;
  moves: StarterMoveset;
  sourceBuildId?: string | undefined;
}

/** Legitimate selected-starter state retained separately from editor values. */
export interface LegitimateStarterSetup {
  shiny: boolean;
  variant: Variant;
  formIndex: number;
  female?: boolean | undefined;
  abilityIndex: number;
  nature: Nature;
  moveset?: StarterMoveset | undefined;
  pokerus: boolean;
  ivs: number[];
}

/**
 * Editor-only data attached to one transient selected starter copy.
 *
 * The normal starter fields continue to drive the existing UI. The snapshot
 * lets Off mode use the untouched legitimate setup without deleting the
 * selected copy's editor data.
 */
export interface SelectedStarterEditorData {
  schemaVersion: 1;
  level: number;
  abilityId: AbilityId;
  friendship: number;
  customMoveset: StarterMoveset;
  legitimateSetup: LegitimateStarterSetup;
  sourceBuildId?: string | undefined;
}

/** Stable, reusable Pokemon configuration stored in the system save. */
export interface SavedPokemonBuild {
  id: string;
  schemaVersion: number;
  name: string;
  speciesId: SpeciesId;
  formIndex: number;
  level?: number | undefined;
  nature?: Nature | undefined;
  abilityId?: AbilityId | undefined;
  gender?: Gender | undefined;
  shiny?: boolean | undefined;
  variant?: Variant | undefined;
  ivs?: [number, number, number, number, number, number] | undefined;
  friendship?: number | undefined;
  pokerus?: boolean | undefined;
  moves?: StarterMoveset | undefined;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number | undefined;
}

/** Versioned build collection. Preferred references use stable build IDs. */
export interface PokemonBuildLibrary {
  schemaVersion: number;
  builds: SavedPokemonBuild[];
  preferredBySpeciesForm: Record<string, string>;
}

export type PokemonEditorMoveCategoryFilter = "all" | "physical" | "special" | "status";
export type PokemonEditorMoveEffectFilter =
  | "direct-damage"
  | "healing"
  | "hp-drain"
  | "recoil"
  | "priority"
  | "multi-hit"
  | "high-critical-hit-rate"
  | "always-hits"
  | "fixed-damage"
  | "one-hit-ko"
  | "inflicts-status"
  | "raises-user-stats"
  | "lowers-target-stats"
  | "protection"
  | "weather"
  | "terrain"
  | "entry-hazards"
  | "switching-or-pivoting"
  | "trapping"
  | "charge-move"
  | "recharge-move";
export type PokemonEditorMoveSort =
  | "name-asc"
  | "name-desc"
  | "power-desc"
  | "power-asc"
  | "accuracy-desc"
  | "accuracy-asc"
  | "pp-desc"
  | "pp-asc";
