#!/usr/bin/env node

/** Add infinite PP for player Pokemon without changing enemy PP behavior. */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readNormalized(target) {
  if (!fs.existsSync(target)) {
    fail(`Could not find ${target}`);
  }
  return fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
}

function replaceRequired(source, anchor, replacement, description) {
  const first = source.indexOf(anchor);
  if (first < 0) {
    fail(`Could not find ${description}. The upstream Pokemon Rogue source may have changed.`);
  }
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    fail(`Found more than one ${description}; refusing an ambiguous patch.`);
  }
  return source.replace(anchor, replacement);
}

const settingsTarget = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readNormalized(settingsTarget);

if (!settingsSource.includes("Offline_Claim_All_Rewards")) {
  fail("infinite-player-pp.js must run after claim-all-rewards.js.");
}

if (!settingsSource.includes("Offline_Infinite_Player_Pp")) {
  const keyAnchor = '  Offline_Claim_All_Rewards: "OFFLINE_CLAIM_ALL_REWARDS",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}\n  Offline_Infinite_Player_Pp: "OFFLINE_INFINITE_PLAYER_PP",`,
    "the Claim All Rewards setting key",
  );
}

if (!settingsSource.includes('label: "Infinite Player PP"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Claim_All_Rewards,
    label: "Reward Claim Mode",
    options: [
      { value: "0", label: "Default" },
      { value: "1", label: "Claim All" },
      { value: "2", label: "Infinite" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    `${rowAnchor}
  {
    key: SettingKeys.Offline_Infinite_Player_Pp,
    label: "Infinite Player PP",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`,
    "the Claim All Rewards settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Infinite_Player_Pp:")) {
  const switchAnchor = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      activeOverrides.INFINITE_REWARDS_OVERRIDE = value === 2;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    `${switchAnchor}
    case SettingKeys.Offline_Infinite_Player_Pp:
      activeOverrides.INFINITE_PLAYER_PP_OVERRIDE = value === 1;
      break;`,
    "the Claim All Rewards setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);
if (!overridesSource.includes("INFINITE_PLAYER_PP_OVERRIDE")) {
  const anchor = "  readonly CLAIM_ALL_REWARDS_OVERRIDE: boolean = false;";
  overridesSource = replaceRequired(
    overridesSource,
    anchor,
    `${anchor}
  /** Prevents PP depletion for player Pokemon while preserving max-PP upgrades. */
  readonly INFINITE_PLAYER_PP_OVERRIDE: boolean = false;`,
    "CLAIM_ALL_REWARDS_OVERRIDE in overrides.ts",
  );
}
fs.writeFileSync(overridesTarget, overridesSource, "utf8");

const pokemonTarget = path.join("pokerogue-src", "src", "field", "pokemon.ts");
let pokemonSource = readNormalized(pokemonTarget);
if (!pokemonSource.includes("activeOverrides.INFINITE_PLAYER_PP_OVERRIDE")) {
  const anchor = `  getMoveset(ignoreOverride = false): PokemonMove[] {
    // Override moveset based on arrays specified in overrides.ts`;
  pokemonSource = replaceRequired(
    pokemonSource,
    anchor,
    `  getMoveset(ignoreOverride = false): PokemonMove[] {
    if (this.isPlayer() && activeOverrides.INFINITE_PLAYER_PP_OVERRIDE) {
      this.moveset.forEach(move => {
        move.ppUsed = 0;
      });
      this.summonData.moveset?.forEach(move => {
        move.ppUsed = 0;
      });
    }

    // Override moveset based on arrays specified in overrides.ts`,
    "Pokemon.getMoveset",
  );
}
fs.writeFileSync(pokemonTarget, pokemonSource, "utf8");

const movePhaseTarget = path.join("pokerogue-src", "src", "phases", "move-phase.ts");
let movePhaseSource = readNormalized(movePhaseTarget);
if (!movePhaseSource.includes("user.isPlayer() && activeOverrides.INFINITE_PLAYER_PP_OVERRIDE")) {
  const anchor = `    const { move, pokemon: user } = this;
    const ppHolder = new NumberHolder(1);`;
  movePhaseSource = replaceRequired(
    movePhaseSource,
    anchor,
    `    const { move, pokemon: user } = this;
    if (user.isPlayer() && activeOverrides.INFINITE_PLAYER_PP_OVERRIDE) {
      move.ppUsed = 0;
      globalScene.eventTarget.dispatchEvent(new MoveUsedEvent(user.id, move.getMove(), 0));
      return;
    }
    const ppHolder = new NumberHolder(1);`,
    "MovePhase.usePP player boundary",
  );
}
fs.writeFileSync(movePhaseTarget, movePhaseSource, "utf8");

const moveTarget = path.join("pokerogue-src", "src", "data", "moves", "move.ts");
let moveSource = readNormalized(moveTarget);
if (!moveSource.includes('import { activeOverrides } from "#app/overrides";')) {
  const anchor = 'import { getPokemonNameWithAffix } from "#app/messages";';
  moveSource = replaceRequired(
    moveSource,
    anchor,
    `${anchor}\nimport { activeOverrides } from "#app/overrides";`,
    "the messages import in move.ts",
  );
}
if (!moveSource.includes("Infinite player PP also blocks move-based PP reduction")) {
  const anchor = `  apply(_user: Pokemon, target: Pokemon, _move: Move, _args: any[]): boolean {
    /** The last move the target themselves used */`;
  moveSource = replaceRequired(
    moveSource,
    anchor,
    `  apply(_user: Pokemon, target: Pokemon, _move: Move, _args: any[]): boolean {
    // Infinite player PP also blocks move-based PP reduction (Spite/Eerie Spell).
    if (target.isPlayer() && activeOverrides.INFINITE_PLAYER_PP_OVERRIDE) {
      return true;
    }

    /** The last move the target themselves used */`,
    "ReducePpMoveAttr.apply",
  );
}
fs.writeFileSync(moveTarget, moveSource, "utf8");

const tagsTarget = path.join("pokerogue-src", "src", "data", "battler-tags.ts");
let tagsSource = readNormalized(tagsTarget);
if (!tagsSource.includes('import { activeOverrides } from "#app/overrides";')) {
  const anchor = 'import { getPokemonNameWithAffix } from "#app/messages";';
  tagsSource = replaceRequired(
    tagsSource,
    anchor,
    `${anchor}\nimport { activeOverrides } from "#app/overrides";`,
    "the messages import in battler-tags.ts",
  );
}
if (!tagsSource.includes("Infinite player PP blocks Grudge")) {
  const anchor = `    if (!sourcePokemon?.isActive() || !pokemon.isOpponent(sourcePokemon)) {
      return false;
    }

    // TODO: This should ideally retrieve the original PokemonMove`;
  tagsSource = replaceRequired(
    tagsSource,
    anchor,
    `    if (!sourcePokemon?.isActive() || !pokemon.isOpponent(sourcePokemon)) {
      return false;
    }

    // Infinite player PP blocks Grudge without affecting an enemy source.
    if (sourcePokemon.isPlayer() && activeOverrides.INFINITE_PLAYER_PP_OVERRIDE) {
      return false;
    }

    // TODO: This should ideally retrieve the original PokemonMove`,
    "the Grudge source validation",
  );
}
fs.writeFileSync(tagsTarget, tagsSource, "utf8");

console.log("Infinite Player PP patch applied successfully.");
