#!/usr/bin/env node

/**
 * Adds three offline-only Sandbox Options:
 *
 * - Free Shop Items
 * - Free Rerolls
 * - Free Egg Gacha Pulls
 *
 * The settings are persisted through PokéRogue's normal settings system
 * and control its existing developer overrides.
 */

const fs = require("fs");
const path = require("path");

const target = path.join(
  "pokerogue-src",
  "src",
  "system",
  "settings",
  "settings.ts",
);

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

if (!fs.existsSync(target)) {
  fail(`Could not find ${target}`);
}

let source = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");

/*
 * 1. Import activeOverrides into settings.ts.
 */
if (!source.includes('import { activeOverrides } from "#app/overrides";')) {
  const importAnchor =
    'import { globalScene } from "#app/global-scene";';

  const importReplacement =
    `${importAnchor}\n` +
    'import { activeOverrides } from "#app/overrides";';

  source = replaceRequired(
    source,
    importAnchor,
    importReplacement,
    "the globalScene import",
  );
}

/*
 * 2. Add the three SettingKeys.
 */
if (!source.includes("Offline_Free_Shop_Items")) {
  const keysAnchor =
    '  Offline_Update_Pop_Ups: "OFFLINE_UPDATE_POP_UPS",\n' +
    "};";

  const keysReplacement =
    '  Offline_Update_Pop_Ups: "OFFLINE_UPDATE_POP_UPS",\n' +
    '  Offline_Free_Shop_Items: "OFFLINE_FREE_SHOP_ITEMS",\n' +
    '  Offline_Free_Rerolls: "OFFLINE_FREE_REROLLS",\n' +
    '  Offline_Free_Egg_Pulls: "OFFLINE_FREE_EGG_PULLS",\n' +
    "};";

  source = replaceRequired(
    source,
    keysAnchor,
    keysReplacement,
    "the Offline setting keys",
  );
}

/*
 * 3. Add three normal Off/On rows to the Offline tab.
 *
 * requireReload is intentional. The override is changed immediately,
 * but resetting after leaving Settings ensures that already-created shop
 * or gacha screens cannot continue displaying cached prices.
 */
if (!source.includes('label: "Free Shop Items"')) {
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
];`;

  source = replaceRequired(
    source,
    rowsAnchor,
    rowsReplacement,
    "the Update Pop-Ups settings row",
  );
}

/*
 * 4. Connect the settings to the existing PokéRogue overrides.
 */
if (!source.includes("case SettingKeys.Offline_Free_Shop_Items:")) {
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
    case SettingKeys.Language:`;

  source = replaceRequired(
    source,
    switchAnchor,
    switchReplacement,
    "the Prefer Baton Pass settings case",
  );
}

fs.writeFileSync(target, source, "utf8");

console.log(
  "Added Free Shop Items, Free Rerolls, and Free Egg Gacha Pulls settings.",
);
