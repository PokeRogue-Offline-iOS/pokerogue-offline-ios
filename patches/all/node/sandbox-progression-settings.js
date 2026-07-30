#!/usr/bin/env node

/**
 * Adds three low-risk, offline-only progression sandbox options:
 *
 * - Max Luck (14 / SSS)
 * - 100x Pokemon Candy
 * - 60 Starter Points
 *
 * This patch must run after sandbox-economy-settings.js because it extends
 * that patch's settings rows and active-override switch cases.
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
  if (!source.includes(anchor)) {
    fail(
      `Could not find ${description}. `
      + "The upstream PokéRogue source or an earlier offline patch may have changed.",
    );
  }

  return source.replace(anchor, replacement);
}

/*
 * ---------------------------------------------------------------------------
 * 1. Add three settings to the Offline settings tab
 * ---------------------------------------------------------------------------
 */

const settingsTarget = path.join(
  "pokerogue-src",
  "src",
  "system",
  "settings",
  "settings.ts",
);

let settingsSource = readNormalized(settingsTarget);

if (!settingsSource.includes("Offline_Guaranteed_Capture")) {
  fail(
    "sandbox-progression-settings.js must run after "
    + "sandbox-economy-settings.js.",
  );
}

if (!settingsSource.includes("Offline_Max_Luck")) {
  const keysAnchor =
    '  Offline_Guaranteed_Capture: "OFFLINE_GUARANTEED_CAPTURE",\n'
    + "};";

  const keysReplacement =
    '  Offline_Guaranteed_Capture: "OFFLINE_GUARANTEED_CAPTURE",\n'
    + '  Offline_Max_Luck: "OFFLINE_MAX_LUCK",\n'
    + '  Offline_Starter_Candy_100x: "OFFLINE_STARTER_CANDY_100X",\n'
    + '  Offline_Starter_Points_60: "OFFLINE_STARTER_POINTS_60",\n'
    + "};";

  settingsSource = replaceRequired(
    settingsSource,
    keysAnchor,
    keysReplacement,
    "the Guaranteed Capture setting key",
  );
}

if (!settingsSource.includes('label: "Max Luck (SSS)"')) {
  const rowsAnchor = `  {
    key: SettingKeys.Offline_Guaranteed_Capture,
    label: "Guaranteed Capture",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
];`;

  const rowsReplacement = `  {
    key: SettingKeys.Offline_Guaranteed_Capture,
    label: "Guaranteed Capture",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Max_Luck,
    label: "Max Luck (SSS)",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Starter_Candy_100x,
    label: "100x Pokemon Candy",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Starter_Points_60,
    label: "60 Starter Points",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
];`;

  settingsSource = replaceRequired(
    settingsSource,
    rowsAnchor,
    rowsReplacement,
    "the Guaranteed Capture settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Max_Luck:")) {
  const switchAnchor = `    case SettingKeys.Offline_Guaranteed_Capture:
      activeOverrides.GUARANTEED_CAPTURE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Language:`;

  const switchReplacement = `    case SettingKeys.Offline_Guaranteed_Capture:
      activeOverrides.GUARANTEED_CAPTURE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Max_Luck:
      activeOverrides.MAX_LUCK_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Starter_Candy_100x:
      activeOverrides.STARTER_CANDY_MULTIPLIER_OVERRIDE = value === 1 ? 100 : 1;
      break;
    case SettingKeys.Offline_Starter_Points_60:
      activeOverrides.STARTER_POINT_LIMIT_OVERRIDE = value === 1 ? 60 : null;
      break;
    case SettingKeys.Language:`;

  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Guaranteed Capture setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added Max Luck, 100x Pokemon Candy, and 60 Starter Points settings.");

/*
 * ---------------------------------------------------------------------------
 * 2. Add the three runtime overrides
 * ---------------------------------------------------------------------------
 */

const overridesTarget = path.join(
  "pokerogue-src",
  "src",
  "overrides.ts",
);

let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("MAX_LUCK_OVERRIDE")) {
  const overrideAnchor =
    "  readonly GUARANTEED_CAPTURE_OVERRIDE: boolean = false;";

  const overrideReplacement = `${overrideAnchor}
  /** Forces the player's effective luck to the game's maximum: 14 / SSS. */
  readonly MAX_LUCK_OVERRIDE: boolean = false;
  /** Multiplies species/starter candy awards. Does not affect Rare Candy items. */
  readonly STARTER_CANDY_MULTIPLIER_OVERRIDE: number = 1;
  /** Overrides the starter-selection point limit. Null preserves normal rules. */
  readonly STARTER_POINT_LIMIT_OVERRIDE: number | null = null;`;

  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "GUARANTEED_CAPTURE_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added progression runtime overrides.");

/*
 * ---------------------------------------------------------------------------
 * 3. Force the centralized party-luck calculation to 14 / SSS
 * ---------------------------------------------------------------------------
 */

const modifierTypeTarget = path.join(
  "pokerogue-src",
  "src",
  "modifier",
  "modifier-type.ts",
);

let modifierTypeSource = readNormalized(modifierTypeTarget);

if (
  !modifierTypeSource.includes(
    "if (activeOverrides.MAX_LUCK_OVERRIDE) {\n    return 14;",
  )
) {
  const luckAnchor =
    "export function getPartyLuckValue(party: readonly Pokemon[]): number {\n"
    + "  if (globalScene.gameMode.isDaily) {";

  const luckReplacement =
    "export function getPartyLuckValue(party: readonly Pokemon[]): number {\n"
    + "  if (activeOverrides.MAX_LUCK_OVERRIDE) {\n"
    + "    return 14;\n"
    + "  }\n"
    + "\n"
    + "  if (globalScene.gameMode.isDaily) {";

  modifierTypeSource = replaceRequired(
    modifierTypeSource,
    luckAnchor,
    luckReplacement,
    "getPartyLuckValue in modifier-type.ts",
  );
}

fs.writeFileSync(modifierTypeTarget, modifierTypeSource, "utf8");
console.log("Enabled the Max Luck runtime hook.");

/*
 * ---------------------------------------------------------------------------
 * 4. Multiply all centralized species/starter candy awards
 * ---------------------------------------------------------------------------
 */

const gameDataTarget = path.join(
  "pokerogue-src",
  "src",
  "system",
  "game-data.ts",
);

let gameDataSource = readNormalized(gameDataTarget);

if (
  !gameDataSource.includes(
    "const candyMultiplier = activeOverrides.STARTER_CANDY_MULTIPLIER_OVERRIDE;",
  )
) {
  const candyAnchor = `  public addStarterCandy(speciesId: SpeciesId, numCandiesToAdd: number): boolean {
    const { candyCount } = this.starterData[speciesId];
    if (candyCount >= MAX_STARTER_CANDY_COUNT) {
      return false;
    }

    this.starterData[speciesId].candyCount = Math.min(candyCount + numCandiesToAdd, MAX_STARTER_CANDY_COUNT);
    globalScene.candyBar.showStarterSpeciesCandy(speciesId, numCandiesToAdd);

    return true;
  }`;

  const candyReplacement = `  public addStarterCandy(speciesId: SpeciesId, numCandiesToAdd: number): boolean {
    const { candyCount } = this.starterData[speciesId];
    if (candyCount >= MAX_STARTER_CANDY_COUNT) {
      return false;
    }

    const candyMultiplier = activeOverrides.STARTER_CANDY_MULTIPLIER_OVERRIDE;
    const candiesToAdd = numCandiesToAdd * candyMultiplier;

    this.starterData[speciesId].candyCount = Math.min(candyCount + candiesToAdd, MAX_STARTER_CANDY_COUNT);
    globalScene.candyBar.showStarterSpeciesCandy(speciesId, candiesToAdd);

    return true;
  }`;

  gameDataSource = replaceRequired(
    gameDataSource,
    candyAnchor,
    candyReplacement,
    "addStarterCandy in game-data.ts",
  );
}

fs.writeFileSync(gameDataTarget, gameDataSource, "utf8");
console.log("Enabled the 100x Pokemon Candy runtime hook.");

/*
 * ---------------------------------------------------------------------------
 * 5. Override the centralized starter-point limit after challenge calculation
 * ---------------------------------------------------------------------------
 */

const starterSelectTarget = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "starter-select-ui-handler.ts",
);

let starterSelectSource = readNormalized(starterSelectTarget);

if (
  !starterSelectSource.includes(
    "if (activeOverrides.STARTER_POINT_LIMIT_OVERRIDE !== null)",
  )
) {
  const starterLimitAnchor = `    applyChallenges(ChallengeType.STARTER_POINTS, valueLimit);

    return valueLimit.value;`;

  const starterLimitReplacement = `    applyChallenges(ChallengeType.STARTER_POINTS, valueLimit);

    if (activeOverrides.STARTER_POINT_LIMIT_OVERRIDE !== null) {
      valueLimit.value = activeOverrides.STARTER_POINT_LIMIT_OVERRIDE;
    }

    return valueLimit.value;`;

  starterSelectSource = replaceRequired(
    starterSelectSource,
    starterLimitAnchor,
    starterLimitReplacement,
    "the starter point-limit return in starter-select-ui-handler.ts",
  );
}

fs.writeFileSync(starterSelectTarget, starterSelectSource, "utf8");
console.log("Enabled the 60 Starter Points runtime hook.");

console.log("Sandbox progression patch applied successfully.");
