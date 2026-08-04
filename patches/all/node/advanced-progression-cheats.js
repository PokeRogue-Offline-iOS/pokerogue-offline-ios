#!/usr/bin/env node

/**
 * Add live economy/progression/team cheats:
 *
 * - Money Multiplier scales positive money gains at BattleScene.addMoney.
 * - EXP Multiplier scales per-Pokemon EXP immediately before EXP phases.
 * - Ignore Evolution Requirements chooses the first formal evolution matching
 *   the Pokemon's current form on each level-up event. LevelUpPhase already
 *   queues at most one EvolutionPhase even when several levels are gained.
 * - Unlimited TM Compatibility exposes the complete TM pool to every player
 *   Pokemon while retaining the caller's known/level-up/used exclusions.
 */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Could not find ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(filePath, source) {
  fs.writeFileSync(filePath, source, "utf8");
  console.log(`Written: ${filePath}`);
}

function replaceRequired(source, anchor, replacement, description) {
  const first = source.indexOf(anchor);
  if (first < 0) {
    fail(`Could not find ${description}. The upstream source or an earlier patch may have changed.`);
  }
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    fail(`Found more than one ${description}; refusing an ambiguous patch.`);
  }
  return source.replace(anchor, replacement);
}

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);
if (!settingsSource.includes("Offline_Unlimited_Tm_Compatibility")) {
  const keyAnchor = '  Offline_Catch_Boss_Shields: "OFFLINE_CATCH_BOSS_SHIELDS",';
  const keyReplacement = `${keyAnchor}
  Offline_Money_Multiplier: "OFFLINE_MONEY_MULTIPLIER",
  Offline_Exp_Multiplier: "OFFLINE_EXP_MULTIPLIER",
  Offline_Ignore_Evolution_Requirements: "OFFLINE_IGNORE_EVOLUTION_REQUIREMENTS",
  Offline_Unlimited_Tm_Compatibility: "OFFLINE_UNLIMITED_TM_COMPATIBILITY",`;
  settingsSource = replaceRequired(settingsSource, keyAnchor, keyReplacement, "the catch-boss setting key");
}

if (!settingsSource.includes('label: "Unlimited TM Compatibility"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Catch_Boss_Shields,
    label: "Catch Bosses Through Shields",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },`;
  const rows = `  {
    key: SettingKeys.Offline_Money_Multiplier,
    label: "Money Multiplier",
    options: [
      { value: "1", label: "Default" },
      { value: "2", label: "2x" },
      { value: "5", label: "5x" },
      { value: "10", label: "10x" },
      { value: "100", label: "100x" },
    ],
    default: 0,
    type: SettingType.APP,
  },
  {
    key: SettingKeys.Offline_Exp_Multiplier,
    label: "EXP Multiplier",
    options: [
      { value: "1", label: "Default" },
      { value: "2", label: "2x" },
      { value: "4", label: "4x" },
      { value: "8", label: "8x" },
      { value: "16", label: "16x" },
      { value: "100", label: "100x" },
    ],
    default: 0,
    type: SettingType.APP,
  },
  {
    key: SettingKeys.Offline_Ignore_Evolution_Requirements,
    label: "Ignore Evolution Requirements",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },
  {
    key: SettingKeys.Offline_Unlimited_Tm_Compatibility,
    label: "Unlimited TM Compatibility",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },`;
  settingsSource = replaceRequired(settingsSource, rowAnchor, `${rowAnchor}\n${rows}`, "the catch-boss settings row");
}

if (!settingsSource.includes("case SettingKeys.Offline_Unlimited_Tm_Compatibility:")) {
  const switchAnchor = `    case SettingKeys.Offline_Catch_Boss_Shields:
      activeOverrides.CATCH_BOSS_SHIELDS_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Money_Multiplier:
      activeOverrides.MONEY_GAIN_MULTIPLIER_OVERRIDE = Number(Setting[index].options[value].value);
      break;
    case SettingKeys.Offline_Exp_Multiplier:
      activeOverrides.EXP_GAIN_MULTIPLIER_OVERRIDE = Number(Setting[index].options[value].value);
      break;
    case SettingKeys.Offline_Ignore_Evolution_Requirements:
      activeOverrides.IGNORE_EVOLUTION_REQUIREMENTS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Unlimited_Tm_Compatibility:
      activeOverrides.UNLIMITED_TM_COMPATIBILITY_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(settingsSource, switchAnchor, switchReplacement, "the catch-boss setting switch case");
}
writeFile(settingsPath, settingsSource);

const overridesPath = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readFile(overridesPath);
if (!overridesSource.includes("UNLIMITED_TM_COMPATIBILITY_OVERRIDE")) {
  const overrideAnchor = `  /** Bypasses End-biome/final-boss capture locks and remaining boss shields. */
  readonly CATCH_BOSS_SHIELDS_OVERRIDE: boolean = false;`;
  const overrideReplacement = `${overrideAnchor}
  /** Multiplies positive money gains without changing prices. */
  readonly MONEY_GAIN_MULTIPLIER_OVERRIDE: number = 1;
  /** Multiplies each party member's calculated EXP gain. */
  readonly EXP_GAIN_MULTIPLIER_OVERRIDE: number = 1;
  /** Makes the next matching formal evolution eligible on level gain. */
  readonly IGNORE_EVOLUTION_REQUIREMENTS_OVERRIDE: boolean = false;
  /** Makes the complete TM pool compatible with every player Pokemon. */
  readonly UNLIMITED_TM_COMPATIBILITY_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(overridesSource, overrideAnchor, overrideReplacement, "CATCH_BOSS_SHIELDS_OVERRIDE");
}
writeFile(overridesPath, overridesSource);

const battleScenePath = path.join("pokerogue-src", "src", "battle-scene.ts");
let battleSceneSource = readFile(battleScenePath);
if (battleSceneSource.includes("Math.floor(amount * activeOverrides.MONEY_GAIN_MULTIPLIER_OVERRIDE)")) {
  battleSceneSource = replaceRequired(
    battleSceneSource,
    "const multipliedAmount = Math.floor(amount * activeOverrides.MONEY_GAIN_MULTIPLIER_OVERRIDE);",
    "const multipliedAmount = amount > 0 ? Math.floor(amount * activeOverrides.MONEY_GAIN_MULTIPLIER_OVERRIDE) : amount;",
    "the original money-multiplier expression",
  );
} else if (!battleSceneSource.includes("amount > 0 ? Math.floor(amount * activeOverrides.MONEY_GAIN_MULTIPLIER_OVERRIDE)")) {
  const moneyAnchor = `  addMoney(amount: number): void {
    this.money = Math.min(this.money + amount, Number.MAX_SAFE_INTEGER);`;
  const moneyReplacement = `  addMoney(amount: number): void {
    const multipliedAmount = amount > 0 ? Math.floor(amount * activeOverrides.MONEY_GAIN_MULTIPLIER_OVERRIDE) : amount;
    this.money = Math.min(this.money + multipliedAmount, Number.MAX_SAFE_INTEGER);`;
  battleSceneSource = replaceRequired(battleSceneSource, moneyAnchor, moneyReplacement, "BattleScene.addMoney");
}
if (!battleSceneSource.includes("partyMemberExp[pm] * activeOverrides.EXP_GAIN_MULTIPLIER_OVERRIDE")) {
  const expAnchor = `      for (let pm = 0; pm < expPartyMembers.length; pm++) {
        const exp = partyMemberExp[pm];`;
  const expReplacement = `      for (let pm = 0; pm < expPartyMembers.length; pm++) {
        const exp = Math.floor(partyMemberExp[pm] * activeOverrides.EXP_GAIN_MULTIPLIER_OVERRIDE);`;
  battleSceneSource = replaceRequired(battleSceneSource, expAnchor, expReplacement, "the per-party-member EXP phase value");
}
writeFile(battleScenePath, battleSceneSource);

const pokemonPath = path.join("pokerogue-src", "src", "field", "pokemon.ts");
let pokemonSource = readFile(pokemonPath);
if (!pokemonSource.includes('import { tmPoolTiers } from "#balance/tm-pool-tiers";')) {
  pokemonSource = replaceRequired(
    pokemonSource,
    'import { getStarterValueFriendshipCap, TRAINER_MAX_FRIENDSHIP_WAVE, TRAINER_MIN_FRIENDSHIP } from "#balance/starters";',
    'import { getStarterValueFriendshipCap, TRAINER_MAX_FRIENDSHIP_WAVE, TRAINER_MIN_FRIENDSHIP } from "#balance/starters";\nimport { tmPoolTiers } from "#balance/tm-pool-tiers";',
    "the starters import in pokemon.ts",
  );
}
if (!pokemonSource.includes("IGNORE_EVOLUTION_REQUIREMENTS_OVERRIDE &&")) {
  const baseValidateAnchor = `      for (const e of evolutions) {
        if (e.validate(this)) {
          return e;
        }
      }`;
  const baseValidateReplacement = `      for (const e of evolutions) {
        const matchesCurrentForm = e.preFormKey == null || this.getFormKey() === e.preFormKey;
        if ((activeOverrides.IGNORE_EVOLUTION_REQUIREMENTS_OVERRIDE && matchesCurrentForm) || e.validate(this)) {
          return e;
        }
      }`;
  pokemonSource = replaceRequired(pokemonSource, baseValidateAnchor, baseValidateReplacement, "the base evolution validation loop");

  const fusionValidateAnchor = `      for (const fe of fusionEvolutions) {
        if (fe.validate(this, true)) {
          return fe;
        }
      }`;
  const fusionValidateReplacement = `      for (const fe of fusionEvolutions) {
        const matchesCurrentFusionForm = fe.preFormKey == null || this.getFusionFormKey() === fe.preFormKey;
        if (
          (activeOverrides.IGNORE_EVOLUTION_REQUIREMENTS_OVERRIDE && matchesCurrentFusionForm)
          || fe.validate(this, true)
        ) {
          return fe;
        }
      }`;
  pokemonSource = replaceRequired(
    pokemonSource,
    fusionValidateAnchor,
    fusionValidateReplacement,
    "the fusion evolution validation loop",
  );
}
if (!pokemonSource.includes("Object.keys(tmPoolTiers).map")) {
  const tmAnchor = `  getCompatibleTms(excludeKnown = false, excludeLevelUp = false, excludeUsedTMs = false): MoveId[] {
    const tms = new Set(this.species.getTms(this.getFormKey()));
    if (this.fusionSpecies) {
      this.fusionSpecies.getTms(this.getFusionFormKey() ?? undefined).forEach(tm => tms.add(tm));
    }`;
  const tmReplacement = `  getCompatibleTms(excludeKnown = false, excludeLevelUp = false, excludeUsedTMs = false): MoveId[] {
    const tms = activeOverrides.UNLIMITED_TM_COMPATIBILITY_OVERRIDE
      ? new Set(Object.keys(tmPoolTiers).map(tm => Number(tm) as MoveId))
      : new Set(this.species.getTms(this.getFormKey()));
    if (!activeOverrides.UNLIMITED_TM_COMPATIBILITY_OVERRIDE && this.fusionSpecies) {
      this.fusionSpecies.getTms(this.getFusionFormKey() ?? undefined).forEach(tm => tms.add(tm));
    }`;
  pokemonSource = replaceRequired(pokemonSource, tmAnchor, tmReplacement, "PlayerPokemon.getCompatibleTms");
}
writeFile(pokemonPath, pokemonSource);

for (const marker of [
  "MONEY_GAIN_MULTIPLIER_OVERRIDE",
  "EXP_GAIN_MULTIPLIER_OVERRIDE",
  "IGNORE_EVOLUTION_REQUIREMENTS_OVERRIDE",
  "UNLIMITED_TM_COMPATIBILITY_OVERRIDE",
]) {
  if (!readFile(overridesPath).includes(marker)) {
    fail(`Missing progression-cheat override marker: ${marker}`);
  }
}

console.log("Advanced progression cheats applied successfully.");
