#!/usr/bin/env node

/**
 * Adds four offline-only sandbox options:
 *
 * - Free Shop Items
 * - Free Rerolls
 * - Free Egg Gacha Pulls
 * - Guaranteed Capture
 */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) {
    fail(
      `Could not find ${description}. ` +
        "The upstream PokéRogue source or offline settings patch may have changed.",
    );
  }

  return source.replace(anchor, replacement);
}

/*
 * ---------------------------------------------------------------------------
 * 1. Add the four settings to settings.ts
 * ---------------------------------------------------------------------------
 */

const settingsTarget = path.join(
  "pokerogue-src",
  "src",
  "system",
  "settings",
  "settings.ts",
);

if (!fs.existsSync(settingsTarget)) {
  fail(`Could not find ${settingsTarget}`);
}

let settingsSource = fs
  .readFileSync(settingsTarget, "utf8")
  .replace(/\r\n/g, "\n");

/*
 * Import activeOverrides.
 */
if (
  !settingsSource.includes(
    'import { activeOverrides } from "#app/overrides";',
  )
) {
  const importAnchor =
    'import { globalScene } from "#app/global-scene";';

  const importReplacement =
    `${importAnchor}\n` +
    'import { activeOverrides } from "#app/overrides";';

  settingsSource = replaceRequired(
    settingsSource,
    importAnchor,
    importReplacement,
    "the globalScene import in settings.ts",
  );
}

/*
 * Add setting keys.
 */
if (!settingsSource.includes("Offline_Guaranteed_Capture")) {
  const keysAnchor =
    '  Offline_Update_Pop_Ups: "OFFLINE_UPDATE_POP_UPS",\n' +
    "};";

  const keysReplacement =
    '  Offline_Update_Pop_Ups: "OFFLINE_UPDATE_POP_UPS",\n' +
    '  Offline_Free_Shop_Items: "OFFLINE_FREE_SHOP_ITEMS",\n' +
    '  Offline_Free_Rerolls: "OFFLINE_FREE_REROLLS",\n' +
    '  Offline_Free_Egg_Pulls: "OFFLINE_FREE_EGG_PULLS",\n' +
    '  Offline_Guaranteed_Capture: "OFFLINE_GUARANTEED_CAPTURE",\n' +
    "};";

  settingsSource = replaceRequired(
    settingsSource,
    keysAnchor,
    keysReplacement,
    "the Offline setting keys",
  );
}

/*
 * Add four Off/On rows to the Offline settings tab.
 */
if (!settingsSource.includes('label: "Guaranteed Capture"')) {
  const rowsAnchor = `  {
    key: SettingKeys.Offline_Update_Pop_Ups,
    label: "Update Pop-Ups",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 1,
    type: SettingType.APP,
  },
];`;

  const rowsReplacement = `  {
    key: SettingKeys.Offline_Update_Pop_Ups,
    label: "Update Pop-Ups",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 1,
    type: SettingType.APP,
  },
  {
    key: SettingKeys.Offline_Free_Shop_Items,
    label: "Free Shop Items",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Free_Rerolls,
    label: "Free Rerolls",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Free_Egg_Pulls,
    label: "Free Egg Gacha Pulls",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
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

  settingsSource = replaceRequired(
    settingsSource,
    rowsAnchor,
    rowsReplacement,
    "the Update Pop-Ups settings row",
  );
}

/*
 * Connect the settings to PokéRogue's active overrides.
 */
if (
  !settingsSource.includes(
    "case SettingKeys.Offline_Guaranteed_Capture:",
  )
) {
  const switchAnchor = `    case SettingKeys.Prefer_Baton_Pass:
      globalScene.preferBatonPass = Setting[index].options[value].value === "On";
      break;
    case SettingKeys.Language:`;

  const switchReplacement = `    case SettingKeys.Prefer_Baton_Pass:
      globalScene.preferBatonPass = Setting[index].options[value].value === "On";
      break;
    case SettingKeys.Offline_Free_Shop_Items:
      activeOverrides.WAIVE_SHOP_FEES_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Free_Rerolls:
      activeOverrides.WAIVE_ROLL_FEE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Free_Egg_Pulls:
      activeOverrides.EGG_FREE_GACHA_PULLS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Guaranteed_Capture:
      activeOverrides.GUARANTEED_CAPTURE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Language:`;

  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Prefer Baton Pass settings case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");

console.log("Added four Offline sandbox settings.");

/*
 * ---------------------------------------------------------------------------
 * 2. Add GUARANTEED_CAPTURE_OVERRIDE to overrides.ts
 * ---------------------------------------------------------------------------
 */

const overridesTarget = path.join(
  "pokerogue-src",
  "src",
  "overrides.ts",
);

if (!fs.existsSync(overridesTarget)) {
  fail(`Could not find ${overridesTarget}`);
}

let overridesSource = fs
  .readFileSync(overridesTarget, "utf8")
  .replace(/\r\n/g, "\n");

if (
  !overridesSource.includes(
    "GUARANTEED_CAPTURE_OVERRIDE",
  )
) {
  const overrideAnchor =
    "  readonly RUN_SUCCESS_OVERRIDE: boolean | null = null;";

  const overrideReplacement = `${overrideAnchor}
  /** Forces every valid Poké Ball throw to capture successfully. */
  readonly GUARANTEED_CAPTURE_OVERRIDE: boolean = false;`;

  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "RUN_SUCCESS_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");

console.log("Added GUARANTEED_CAPTURE_OVERRIDE.");

/*
 * ---------------------------------------------------------------------------
 * 3. Use the override in AttemptCapturePhase
 * ---------------------------------------------------------------------------
 */

const captureTarget = path.join(
  "pokerogue-src",
  "src",
  "phases",
  "attempt-capture-phase.ts",
);

if (!fs.existsSync(captureTarget)) {
  fail(`Could not find ${captureTarget}`);
}

let captureSource = fs
  .readFileSync(captureTarget, "utf8")
  .replace(/\r\n/g, "\n");

/*
 * Import activeOverrides.
 */
if (
  !captureSource.includes(
    'import { activeOverrides } from "#app/overrides";',
  )
) {
  const captureImportAnchor =
    'import { globalScene } from "#app/global-scene";';

  const captureImportReplacement =
    `${captureImportAnchor}\n` +
    'import { activeOverrides } from "#app/overrides";';

  captureSource = replaceRequired(
    captureSource,
    captureImportAnchor,
    captureImportReplacement,
    "the globalScene import in attempt-capture-phase.ts",
  );
}

/*
 * A modified catch rate of 255 is already handled by the game as a
 * guaranteed capture. This preserves the normal throw, shake, sound,
 * party-selection and ball-consumption behaviour.
 */
if (
  !captureSource.includes(
    "activeOverrides.GUARANTEED_CAPTURE_OVERRIDE\n      ? 255",
  )
) {
  const catchRateAnchor = `    const modifiedCatchRate = Math.round(
      (((_3m - _2h) * catchRate * pokeballMultiplier) / _3m) * statusMultiplier * shinyMultiplier,
    );`;

  const catchRateReplacement = `    const modifiedCatchRate = activeOverrides.GUARANTEED_CAPTURE_OVERRIDE
      ? 255
      : Math.round(
          (((_3m - _2h) * catchRate * pokeballMultiplier) / _3m) * statusMultiplier * shinyMultiplier,
        );`;

  captureSource = replaceRequired(
    captureSource,
    catchRateAnchor,
    catchRateReplacement,
    "the modified catch-rate calculation",
  );
}

fs.writeFileSync(captureTarget, captureSource, "utf8");

console.log("Enabled the Guaranteed Capture runtime override.");
console.log("Sandbox economy and capture patch applied successfully.");
