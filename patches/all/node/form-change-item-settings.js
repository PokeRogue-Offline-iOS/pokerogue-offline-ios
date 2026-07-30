#!/usr/bin/env node

/**
 * Add Futuba's Default/Rebalanced/Abundant form-change item modes.
 *
 * Rebalanced adds Mega Bracelet and Dynamax Band to Great tier (weight 4)
 * and eligible DNA Splicers to Rogue tier (weight 1).
 *
 * Abundant adds eligible DNA Splicers plus Tera Shards, evolution items,
 * Tera Orbs, regular/rare form-change items, Mega Bracelet, and Dynamax Band
 * to Common tier with weight 500.
 */

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
    fail(
      `Could not find ${description}. `
      + "The upstream PokéRogue source or an earlier offline patch may have changed.",
    );
  }
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    fail(`Found more than one ${description}; refusing an ambiguous patch.`);
  }
  return source.replace(anchor, replacement);
}

const settingsTarget = path.join(
  "pokerogue-src",
  "src",
  "system",
  "settings",
  "settings.ts",
);
let settingsSource = readNormalized(settingsTarget);

if (!settingsSource.includes("Offline_Instant_Hatch")) {
  fail("form-change-item-settings.js must run after egg-settings.js.");
}

if (!settingsSource.includes("Offline_Form_Change_Items")) {
  const keyAnchor = '  Offline_Instant_Hatch: "OFFLINE_INSTANT_HATCH",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_Form_Change_Items: "OFFLINE_FORM_CHANGE_ITEMS",`,
    "the Instant Hatch setting key",
  );
}

if (!settingsSource.includes('label: "Form Change Items"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Instant_Hatch,
    label: "Instant Hatch",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  const rowReplacement = `${rowAnchor}
  {
    key: SettingKeys.Offline_Form_Change_Items,
    label: "Form Change Items",
    options: [
      { value: "0", label: "Default" },
      { value: "1", label: "Rebalanced" },
      { value: "2", label: "Abundant" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Instant Hatch settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Form_Change_Items:")) {
  const switchAnchor = `    case SettingKeys.Offline_Instant_Hatch:
      activeOverrides.EGG_IMMEDIATE_HATCH_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Form_Change_Items:
      activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE = value;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Instant Hatch setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added the Form Change Items setting.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("FORM_CHANGE_ITEM_MODE_OVERRIDE")) {
  const overrideAnchor =
    "  readonly RARE_EGG_ODDS_OVERRIDE: boolean = false;";
  const overrideReplacement = `${overrideAnchor}
  /** 0 = Default, 1 = Rebalanced, 2 = Abundant. */
  readonly FORM_CHANGE_ITEM_MODE_OVERRIDE: number = 0;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "RARE_EGG_ODDS_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added FORM_CHANGE_ITEM_MODE_OVERRIDE.");

const poolsTarget = path.join(
  "pokerogue-src",
  "src",
  "modifier",
  "init-modifier-pools.ts",
);
let poolsSource = readNormalized(poolsTarget);

if (!poolsSource.includes('import { activeOverrides } from "#app/overrides";')) {
  const importAnchor =
    'import { speciesDataRegistry } from "#app/global-species-data-registry";';
  poolsSource = replaceRequired(
    poolsSource,
    importAnchor,
    `${importAnchor}
import { activeOverrides } from "#app/overrides";`,
    "the speciesDataRegistry import in init-modifier-pools.ts",
  );
}

if (!poolsSource.includes("// Futuba Abundant form-change pool")) {
  const commonAnchor =
    "    new WeightedModifierType(modifierTypes.TM_COMMON, 2),";
  const commonReplacement = `${commonAnchor}
    // Futuba Abundant form-change pool
    new WeightedModifierType(
      modifierTypes.DNA_SPLICERS,
      (party: readonly Pokemon[]) =>
        activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 && party.filter(p => !p.fusionSpecies).length > 1
          ? 500
          : 0,
      500,
    ),
    new WeightedModifierType(
      modifierTypes.TERA_SHARD,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),
    new WeightedModifierType(
      modifierTypes.EVOLUTION_ITEM,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),
    new WeightedModifierType(
      modifierTypes.TERA_ORB,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),
    new WeightedModifierType(
      modifierTypes.FORM_CHANGE_ITEM,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),
    new WeightedModifierType(
      modifierTypes.RARE_FORM_CHANGE_ITEM,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),
    new WeightedModifierType(
      modifierTypes.MEGA_BRACELET,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),
    new WeightedModifierType(
      modifierTypes.DYNAMAX_BAND,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 2 ? 500 : 0),
      500,
    ),`;
  poolsSource = replaceRequired(
    poolsSource,
    commonAnchor,
    commonReplacement,
    "TM_COMMON in the Common modifier pool",
  );
}

if (!poolsSource.includes("// Futuba Rebalanced access items")) {
  const greatAnchor = `    new WeightedModifierType(
      modifierTypes.VOUCHER,
      (_party: readonly Pokemon[], rerollCount: number) =>
        globalScene.gameMode.isDaily ? 0 : Math.max(1 - rerollCount, 0),
      1,
    ),`;
  const greatReplacement = `${greatAnchor}
    // Futuba Rebalanced access items
    new WeightedModifierType(
      modifierTypes.MEGA_BRACELET,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 1 ? 4 : 0),
      4,
    ),
    new WeightedModifierType(
      modifierTypes.DYNAMAX_BAND,
      () => (activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 1 ? 4 : 0),
      4,
    ),`;
  poolsSource = replaceRequired(
    poolsSource,
    greatAnchor,
    greatReplacement,
    "VOUCHER at the end of the Great modifier pool",
  );
}

if (!poolsSource.includes("// Futuba Rebalanced DNA Splicers")) {
  const rogueAnchor = `    new WeightedModifierType(
      modifierTypes.RARE_FORM_CHANGE_ITEM,
      () => Math.min(Math.ceil(globalScene.currentBattle.waveIndex / 50), 4) * 6,
      24,
    ),`;
  const rogueReplacement = `${rogueAnchor}
    // Futuba Rebalanced DNA Splicers
    new WeightedModifierType(
      modifierTypes.DNA_SPLICERS,
      (party: readonly Pokemon[]) =>
        activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE === 1 && party.filter(p => !p.fusionSpecies).length > 1 ? 1 : 0,
      1,
    ),`;
  poolsSource = replaceRequired(
    poolsSource,
    rogueAnchor,
    rogueReplacement,
    "RARE_FORM_CHANGE_ITEM in the Rogue modifier pool",
  );
}

fs.writeFileSync(poolsTarget, poolsSource, "utf8");
console.log("Form Change Items patch applied successfully.");
