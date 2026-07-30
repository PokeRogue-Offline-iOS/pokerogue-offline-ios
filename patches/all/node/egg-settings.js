#!/usr/bin/env node

/**
 * Add Futuba's Rare Eggs and Instant Hatch options.
 *
 * Rare Eggs uses Futuba's exact 256-roll tier thresholds. Instant Hatch uses
 * current PokéRogue's existing immediate-hatch override, which selects eggs on
 * the next EggLapsePhase and preserves normal hatch processing and animation.
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

if (!settingsSource.includes("Offline_Always_Shiny")) {
  fail("egg-settings.js must run after shiny-settings.js.");
}

if (!settingsSource.includes("Offline_Rare_Eggs")) {
  const keyAnchor = '  Offline_Always_Shiny: "OFFLINE_ALWAYS_SHINY",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_Rare_Eggs: "OFFLINE_RARE_EGGS",
  Offline_Instant_Hatch: "OFFLINE_INSTANT_HATCH",`,
    "the Always Shiny setting key",
  );
}

if (!settingsSource.includes('label: "Rare Eggs"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Always_Shiny,
    label: "Always Shiny",
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
    key: SettingKeys.Offline_Rare_Eggs,
    label: "Rare Eggs",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
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
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Always Shiny settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Rare_Eggs:")) {
  const switchAnchor = `    case SettingKeys.Offline_Always_Shiny:
      activeOverrides.ALWAYS_SHINY_GENERATION_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Rare_Eggs:
      activeOverrides.RARE_EGG_ODDS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Instant_Hatch:
      activeOverrides.EGG_IMMEDIATE_HATCH_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Always Shiny setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added Rare Eggs and Instant Hatch settings.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("RARE_EGG_ODDS_OVERRIDE")) {
  const overrideAnchor = "  readonly EGG_TIER_OVERRIDE: EggTier | null = null;";
  const overrideReplacement = `${overrideAnchor}
  /** Uses Futuba's tier-weighted 256-roll gacha odds. */
  readonly RARE_EGG_ODDS_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "EGG_TIER_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added RARE_EGG_ODDS_OVERRIDE.");

const eggTarget = path.join("pokerogue-src", "src", "data", "egg.ts");
let eggSource = readNormalized(eggTarget);

if (!eggSource.includes("const commonThreshold = activeOverrides.RARE_EGG_ODDS_OVERRIDE")) {
  const oddsAnchor = `    const tierValue = randInt(256);
    return tierValue >= GACHA_DEFAULT_COMMON_EGG_THRESHOLD + tierValueOffset
      ? EggTier.COMMON
      : tierValue >= GACHA_DEFAULT_RARE_EGG_THRESHOLD + tierValueOffset
        ? EggTier.RARE
        : tierValue >= GACHA_DEFAULT_EPIC_EGG_THRESHOLD + tierValueOffset
          ? EggTier.EPIC
          : EggTier.LEGENDARY;`;
  const oddsReplacement = `    const tierValue = randInt(256);
    // Futuba Rare Eggs: 32 Common, 64 Rare, 64 Epic, 96 Legendary
    // outcomes out of 256 before the legendary-machine threshold offset.
    const commonThreshold = activeOverrides.RARE_EGG_ODDS_OVERRIDE ? 224 : GACHA_DEFAULT_COMMON_EGG_THRESHOLD;
    const rareThreshold = activeOverrides.RARE_EGG_ODDS_OVERRIDE ? 160 : GACHA_DEFAULT_RARE_EGG_THRESHOLD;
    const epicThreshold = activeOverrides.RARE_EGG_ODDS_OVERRIDE ? 96 : GACHA_DEFAULT_EPIC_EGG_THRESHOLD;
    return tierValue >= commonThreshold + tierValueOffset
      ? EggTier.COMMON
      : tierValue >= rareThreshold + tierValueOffset
        ? EggTier.RARE
        : tierValue >= epicThreshold + tierValueOffset
          ? EggTier.EPIC
          : EggTier.LEGENDARY;`;
  eggSource = replaceRequired(
    eggSource,
    oddsAnchor,
    oddsReplacement,
    "rollEggTier in data/egg.ts",
  );
}

fs.writeFileSync(eggTarget, eggSource, "utf8");
console.log("Egg settings patch applied successfully.");
