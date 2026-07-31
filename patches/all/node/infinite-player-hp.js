#!/usr/bin/env node

/** Add player-only zero-damage HP protection at the shared damage boundary. */

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
  fail("infinite-player-hp.js must run after claim-all-rewards.js.");
}

if (!settingsSource.includes("Offline_Infinite_Player_Hp")) {
  const keyAnchor = '  Offline_Claim_All_Rewards: "OFFLINE_CLAIM_ALL_REWARDS",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}\n  Offline_Infinite_Player_Hp: "OFFLINE_INFINITE_PLAYER_HP",`,
    "the Claim All Rewards setting key",
  );
}

if (!settingsSource.includes('label: "Infinite Player HP"')) {
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
    key: SettingKeys.Offline_Infinite_Player_Hp,
    label: "Infinite Player HP",
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

if (!settingsSource.includes("case SettingKeys.Offline_Infinite_Player_Hp:")) {
  const switchAnchor = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      activeOverrides.INFINITE_REWARDS_OVERRIDE = value === 2;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    `${switchAnchor}
    case SettingKeys.Offline_Infinite_Player_Hp:
      activeOverrides.INFINITE_PLAYER_HP_OVERRIDE = value === 1;
      break;`,
    "the Claim All Rewards setting switch case",
  );
}
fs.writeFileSync(settingsTarget, settingsSource, "utf8");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);
if (!overridesSource.includes("INFINITE_PLAYER_HP_OVERRIDE")) {
  const anchor = "  readonly CLAIM_ALL_REWARDS_OVERRIDE: boolean = false;";
  overridesSource = replaceRequired(
    overridesSource,
    anchor,
    `${anchor}
  /** Converts every player Pokemon damage result to zero at the HP boundary. */
  readonly INFINITE_PLAYER_HP_OVERRIDE: boolean = false;`,
    "CLAIM_ALL_REWARDS_OVERRIDE in overrides.ts",
  );
}
fs.writeFileSync(overridesTarget, overridesSource, "utf8");

const pokemonTarget = path.join("pokerogue-src", "src", "field", "pokemon.ts");
let pokemonSource = readNormalized(pokemonTarget);
if (!pokemonSource.includes("activeOverrides.INFINITE_PLAYER_HP_OVERRIDE")) {
  const anchor = `    if (this.isFainted()) {
      return 0;
    }

    if (!preventEndure && this.hp - damage <= 0) {`;
  pokemonSource = replaceRequired(
    pokemonSource,
    anchor,
    `    if (this.isFainted()) {
      return 0;
    }

    // Keep the complete damage/effect pipeline intact, but report zero actual
    // damage for either player slot. Drain, recoil, residual, OHKO, Perish Song,
    // and self-damage therefore resolve once without changing player HP.
    if (this.isPlayer() && activeOverrides.INFINITE_PLAYER_HP_OVERRIDE) {
      return 0;
    }

    if (!preventEndure && this.hp - damage <= 0) {`,
    "Pokemon.damage's faint guard",
  );
}
fs.writeFileSync(pokemonTarget, pokemonSource, "utf8");

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
if (!moveSource.includes("Do not leave an orphaned delayed heal")) {
  const anchor = `    if (!super.apply(user, target, move, args)) {
      return false;
    }

    // Add a tag to the field if it doesn't already exist, then queue a delayed healing effect`;
  moveSource = replaceRequired(
    moveSource,
    anchor,
    `    if (!super.apply(user, target, move, args)) {
      return false;
    }

    // Do not leave an orphaned delayed heal when Infinite Player HP prevents
    // Healing Wish or Lunar Dance from vacating the player's field slot.
    if (user.isPlayer() && activeOverrides.INFINITE_PLAYER_HP_OVERRIDE && !user.isFainted()) {
      return true;
    }

    // Add a tag to the field if it doesn't already exist, then queue a delayed healing effect`,
    "SacrificialFullRestoreAttr's successful sacrifice",
  );
}
fs.writeFileSync(moveTarget, moveSource, "utf8");

console.log("Infinite Player HP patch applied successfully.");
