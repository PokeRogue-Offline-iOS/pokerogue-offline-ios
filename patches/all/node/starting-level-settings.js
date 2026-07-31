#!/usr/bin/env node

/** Add Futuba's configurable starting-level option to Offline settings. */

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
let source = readNormalized(settingsTarget);

if (!source.includes("Offline_Allow_Duplicate_Starters")) {
  fail("starting-level-settings.js must run after duplicate-starters.js.");
}

if (!source.includes("Offline_Starting_Level")) {
  const keyAnchor =
    '  Offline_Allow_Duplicate_Starters: "OFFLINE_ALLOW_DUPLICATE_STARTERS",';
  source = replaceRequired(
    source,
    keyAnchor,
    `${keyAnchor}
  Offline_Starting_Level: "OFFLINE_STARTING_LEVEL",`,
    "the Allow Duplicate Starters setting key",
  );
}

if (!source.includes('label: "Starting Level"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Allow_Duplicate_Starters,
    label: "Allow Duplicate Starters",
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
  source = replaceRequired(
    source,
    rowAnchor,
    rowReplacement,
    "the Allow Duplicate Starters settings row",
  );
}

if (!source.includes("case SettingKeys.Offline_Starting_Level:")) {
  const switchAnchor = `    case SettingKeys.Offline_Allow_Duplicate_Starters:
      activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Starting_Level:
      activeOverrides.STARTING_LEVEL_OVERRIDE = Number(Setting[index].options[value].value);
      break;`;
  source = replaceRequired(
    source,
    switchAnchor,
    switchReplacement,
    "the Allow Duplicate Starters setting switch case",
  );
}

fs.writeFileSync(settingsTarget, source, "utf8");
console.log("Starting Level setting patch applied successfully.");
