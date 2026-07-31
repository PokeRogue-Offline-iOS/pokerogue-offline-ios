#!/usr/bin/env node

/**
 * Add two offline starter sandbox settings:
 *
 * - All Starters Have Pokerus: every selected Starter record receives Pokerus.
 *   This works per record, including duplicate species, and does not allocate
 *   Futuba's thousands of random starter cursors.
 * - Candy Costs: Default, Futuba-compatible Rebalanced (25%, rounded up), or
 *   Free for passive unlocks, starter point reductions, and species eggs.
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
      + "The upstream Pokemon Rogue source or an earlier offline patch may have changed.",
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

if (!settingsSource.includes("Offline_Unlock_Starter_On_Select")) {
  fail("starter-extra-settings.js must run after unlock-starter-on-select.js.");
}

if (!settingsSource.includes("Offline_All_Starters_Pokerus")) {
  const keyAnchor =
    '  Offline_Unlock_Starter_On_Select: "OFFLINE_UNLOCK_STARTER_ON_SELECT",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_All_Starters_Pokerus: "OFFLINE_ALL_STARTERS_POKERUS",
  Offline_Candy_Costs: "OFFLINE_CANDY_COSTS",`,
    "the Unlock Starter on Select setting key",
  );
}

if (!settingsSource.includes('label: "All Starters Have Pokerus"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Unlock_Starter_On_Select,
    label: "Unlock Starter on Select",
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
    key: SettingKeys.Offline_All_Starters_Pokerus,
    label: "All Starters Have Pokerus",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Candy_Costs,
    label: "Candy Costs",
    options: [
      { value: "0", label: "Default" },
      { value: "1", label: "Rebalanced" },
      { value: "2", label: "Free" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Unlock Starter on Select settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_All_Starters_Pokerus:")) {
  const switchAnchor = `    case SettingKeys.Offline_Unlock_Starter_On_Select:
      activeOverrides.UNLOCK_STARTER_ON_SELECT_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_All_Starters_Pokerus:
      activeOverrides.ALL_STARTERS_POKERUS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Candy_Costs:
      activeOverrides.CANDY_COST_MODE_OVERRIDE = value;
      activeOverrides.FREE_CANDY_UPGRADE_OVERRIDE = value === 2;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Unlock Starter on Select switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added All Starters Have Pokerus and Candy Costs settings.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("ALL_STARTERS_POKERUS_OVERRIDE")) {
  const overrideAnchor =
    "  readonly UNLOCK_STARTER_ON_SELECT_OVERRIDE: boolean = false;";
  const overrideReplacement = `${overrideAnchor}
  /** Gives every selected starter record Pokerus, including duplicate species. */
  readonly ALL_STARTERS_POKERUS_OVERRIDE: boolean = false;
  /** 0 = Default, 1 = Rebalanced (25%, rounded up), 2 = Free. */
  readonly CANDY_COST_MODE_OVERRIDE: number = 0;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "UNLOCK_STARTER_ON_SELECT_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added starter-extra runtime overrides.");

const starterSelectTarget = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "starter-select-ui-handler.ts",
);
let starterSelectSource = readNormalized(starterSelectTarget);

if (!starterSelectSource.includes(
  "pokerus: activeOverrides.ALL_STARTERS_POKERUS_OVERRIDE",
)) {
  const pokerusAnchor =
    "      pokerus: this.pokerusSpecies.includes(species),";
  const pokerusReplacement =
    "      pokerus: activeOverrides.ALL_STARTERS_POKERUS_OVERRIDE"
    + " || this.pokerusSpecies.includes(species),";
  starterSelectSource = replaceRequired(
    starterSelectSource,
    pokerusAnchor,
    pokerusReplacement,
    "the selected starter Pokerus field",
  );
}

fs.writeFileSync(starterSelectTarget, starterSelectSource, "utf8");
console.log("Enabled Pokerus on every selected starter record.");

const candyCostsTarget = path.join(
  "pokerogue-src",
  "src",
  "data",
  "balance",
  "starters.ts",
);
let candyCostsSource = readNormalized(candyCostsTarget);

if (!candyCostsSource.includes(
  'import { activeOverrides } from "#app/overrides";',
)) {
  const importAnchor =
    'import { IS_TEST } from "#constants/app-constants";';
  candyCostsSource = replaceRequired(
    candyCostsSource,
    importAnchor,
    `import { activeOverrides } from "#app/overrides";
${importAnchor}`,
    "the app-constants import in starters.ts",
  );
}

if (!candyCostsSource.includes("function applyCandyCostMode(")) {
  const helperAnchor = `const allStarterCandyCosts: readonly StarterCandyCosts[] = [`;
  const helperReplacement = `function applyCandyCostMode(cost: number): number {
  switch (activeOverrides.CANDY_COST_MODE_OVERRIDE) {
    case 1:
      return Math.ceil(cost * 0.25);
    case 2:
      return 0;
    default:
      return cost;
  }
}

${helperAnchor}`;
  candyCostsSource = replaceRequired(
    candyCostsSource,
    helperAnchor,
    helperReplacement,
    "the starter candy-cost table",
  );
}

if (!candyCostsSource.includes(
  "return applyCandyCostMode(allStarterCandyCosts[starterCost - 1].passive);",
)) {
  candyCostsSource = replaceRequired(
    candyCostsSource,
    "  return allStarterCandyCosts[starterCost - 1].passive;",
    "  return applyCandyCostMode(allStarterCandyCosts[starterCost - 1].passive);",
    "the passive candy-cost return",
  );
}

if (!candyCostsSource.includes(
  "return costs.map(applyCandyCostMode) as [number, number];",
)) {
  candyCostsSource = replaceRequired(
    candyCostsSource,
    `export function getValueReductionCandyCounts(starterCost: number): readonly [number, number] {
  return allStarterCandyCosts[starterCost - 1].costReduction;
}`,
    `export function getValueReductionCandyCounts(starterCost: number): readonly [number, number] {
  const costs = allStarterCandyCosts[starterCost - 1].costReduction;
  return costs.map(applyCandyCostMode) as [number, number];
}`,
    "the point-reduction candy-cost getter",
  );
}

if (!candyCostsSource.includes(
  "return applyCandyCostMode(starterCandyCosts.eggCosts[eggCostIndex]);",
)) {
  candyCostsSource = replaceRequired(
    candyCostsSource,
    "  return starterCandyCosts.eggCosts[eggCostIndex];",
    "  return applyCandyCostMode(starterCandyCosts.eggCosts[eggCostIndex]);",
    "the species-egg candy-cost return",
  );
}

fs.writeFileSync(candyCostsTarget, candyCostsSource, "utf8");
console.log("Enabled Default, Rebalanced, and Free candy costs.");
console.log("Starter extra settings patch applied successfully.");
