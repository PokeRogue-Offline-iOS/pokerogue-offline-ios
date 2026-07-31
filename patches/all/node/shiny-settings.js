#!/usr/bin/env node

/**
 * Add Futuba-inspired Shiny Rate and Always Shiny Offline settings.
 *
 * Shiny Rate applies to the normal generated-Pokémon PID threshold for player
 * and wild Pokémon, before Shiny Charm/event modifiers. It does not alter egg
 * shiny rolls or explicitly configured starters. Always Shiny is applied only
 * when the normal generated-Pokémon shiny roll runs, matching Futuba's hook.
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

if (!settingsSource.includes("Offline_Starting_Level")) {
  fail("shiny-settings.js must run after starting-level-settings.js.");
}

if (!settingsSource.includes("Offline_Shiny_Rate")) {
  const keyAnchor = '  Offline_Starting_Level: "OFFLINE_STARTING_LEVEL",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_Shiny_Rate: "OFFLINE_SHINY_RATE",
  Offline_Always_Shiny: "OFFLINE_ALWAYS_SHINY",`,
    "the Starting Level setting key",
  );
}

if (!settingsSource.includes('label: "Shiny Rate"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Starting_Level,
    label: "Starting Level",
    options: [
      { value: "0", label: "Default" },
      { value: "10", label: "10" },
      { value: "20", label: "20" },
      { value: "30", label: "30" },
      { value: "40", label: "40" },
      { value: "50", label: "50" },
      { value: "60", label: "60" },
      { value: "70", label: "70" },
      { value: "80", label: "80" },
      { value: "90", label: "90" },
      { value: "100", label: "100" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  const rowReplacement = `${rowAnchor}
  {
    key: SettingKeys.Offline_Shiny_Rate,
    label: "Shiny Rate",
    options: [
      { value: "1", label: "1x" },
      { value: "2", label: "2x" },
      { value: "4", label: "4x" },
      { value: "8", label: "8x" },
      { value: "10", label: "10x" },
      { value: "20", label: "20x" },
      { value: "100", label: "100x" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
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
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Starting Level settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Shiny_Rate:")) {
  const switchAnchor = `    case SettingKeys.Offline_Starting_Level:
      activeOverrides.STARTING_LEVEL_OVERRIDE = Number(Setting[index].options[value].value);
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Shiny_Rate:
      activeOverrides.SHINY_RATE_MULTIPLIER_OVERRIDE = Number(Setting[index].options[value].value);
      break;
    case SettingKeys.Offline_Always_Shiny:
      activeOverrides.ALWAYS_SHINY_GENERATION_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Starting Level setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added Shiny Rate and Always Shiny settings.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("SHINY_RATE_MULTIPLIER_OVERRIDE")) {
  const overrideAnchor =
    "  readonly ALLOW_DUPLICATE_STARTERS_OVERRIDE: boolean = false;";
  const overrideReplacement = `${overrideAnchor}
  /** Multiplies normal player/wild PID shiny thresholds. */
  readonly SHINY_RATE_MULTIPLIER_OVERRIDE: number = 1;
  /** Forces shiny when the normal generated-Pokémon shiny roll runs. */
  readonly ALWAYS_SHINY_GENERATION_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "ALLOW_DUPLICATE_STARTERS_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added shiny runtime overrides.");

const pokemonTarget = path.join(
  "pokerogue-src",
  "src",
  "field",
  "pokemon.ts",
);
let pokemonSource = readNormalized(pokemonTarget);

if (!pokemonSource.includes("SHINY_RATE_MULTIPLIER_OVERRIDE;\n        globalScene.applyModifiers")) {
  const multiplierAnchor = `      if (this.isPlayer() || !this.hasTrainer()) {
        // Apply shiny modifiers only to Player or wild mons
        globalScene.applyModifiers(ShinyRateBoosterModifier, true, shinyThreshold);
      }`;
  const multiplierReplacement = `      if (this.isPlayer() || !this.hasTrainer()) {
        // Apply shiny modifiers only to Player or wild mons
        shinyThreshold.value *= activeOverrides.SHINY_RATE_MULTIPLIER_OVERRIDE;
        globalScene.applyModifiers(ShinyRateBoosterModifier, true, shinyThreshold);
        shinyThreshold.value = Math.min(65536, Math.max(0, shinyThreshold.value));
      }`;
  pokemonSource = replaceRequired(
    pokemonSource,
    multiplierAnchor,
    multiplierReplacement,
    "the generated Pokémon shiny-modifier hook",
  );
}

if (!pokemonSource.includes("if (activeOverrides.ALWAYS_SHINY_GENERATION_OVERRIDE)")) {
  const alwaysAnchor = `    this.shiny = (E ^ F) < shinyThreshold.value;

    if (this.shiny) {`;
  const alwaysReplacement = `    this.shiny = (E ^ F) < shinyThreshold.value;
    if (activeOverrides.ALWAYS_SHINY_GENERATION_OVERRIDE) {
      this.shiny = true;
    }

    if (this.shiny) {`;
  pokemonSource = replaceRequired(
    pokemonSource,
    alwaysAnchor,
    alwaysReplacement,
    "the generated Pokémon shiny result",
  );
}

fs.writeFileSync(pokemonTarget, pokemonSource, "utf8");
console.log("Shiny settings patch applied successfully.");
