#!/usr/bin/env node

/**
 * Reorder every SilverShadow cheat into contiguous functional sections.
 *
 * Offline management/backup rows remain first. The first row in each cheat
 * section receives a compact visible category prefix from the shared settings
 * renderer; subsequent rows remain concise and contiguous beneath it.
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

const sections = [
  {
    category: "SHOP",
    keys: ["Offline_Free_Shop_Items", "Offline_Free_Rerolls", "Offline_Money_Multiplier"],
  },
  {
    category: "REWARDS",
    keys: ["Offline_Claim_All_Rewards", "Offline_Max_Luck"],
  },
  {
    category: "PROGRESS",
    keys: ["Offline_Exp_Multiplier", "Offline_Starter_Candy_Multiplier", "Offline_Candy_Costs"],
  },
  {
    category: "TEAM",
    keys: [
      "Offline_Starter_Points_60",
      "Offline_Allow_Duplicate_Starters",
      "Offline_Starting_Level",
      "Offline_Unlock_Starter_On_Select",
      "Offline_All_Starters_Pokerus",
    ],
  },
  {
    category: "GEN/GACHA",
    keys: [
      "Offline_Free_Egg_Pulls",
      "Offline_Rare_Eggs",
      "Offline_Instant_Hatch",
      "Offline_Shiny_Rate",
      "Offline_Always_Shiny",
      "Offline_Form_Change_Items",
    ],
  },
  {
    category: "CAPTURE",
    keys: [
      "Offline_Guaranteed_Capture",
      "Offline_Unlimited_Pokeballs",
      "Offline_Catch_Trainer_Pokemon",
      "Offline_Catch_Double_Battle",
      "Offline_Catch_Boss_Shields",
    ],
  },
  {
    category: "BATTLE",
    keys: [
      "Offline_Infinite_Player_Hp",
      "Offline_Infinite_Player_Pp",
      "Offline_Player_Ohko",
      "Offline_Never_Miss",
      "Offline_Always_Critical_Hit",
      "Offline_Always_Move_First",
      "Offline_No_Recharge_Turns",
      "Offline_Full_Heal_After_Battle",
    ],
  },
  {
    category: "EVOLVE/TM",
    keys: ["Offline_Ignore_Evolution_Requirements", "Offline_Unlimited_Tm_Compatibility"],
  },
];

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);

if (!settingsSource.includes("  category?: string;")) {
  settingsSource = replaceRequired(
    settingsSource,
    `export interface Setting {
  key: string;
  label: string;`,
    `export interface Setting {
  key: string;
  label: string;
  /** Optional compact section marker used by the Offline cheat catalog. */
  category?: string;`,
    "the Setting interface label field",
  );
}

const categoryMarkersPresent = sections.every(section =>
  settingsSource.includes(`    category: "${section.category}",`),
);

if (!categoryMarkersPresent) {
  const rowsByKey = new Map();
  for (const section of sections) {
    for (const key of section.keys) {
      const pattern = new RegExp(`\\n  \\{\\n    key: SettingKeys\\.${key},[\\s\\S]*?\\n  \\},`);
      const matches = [...settingsSource.matchAll(new RegExp(pattern.source, "g"))];
      if (matches.length !== 1) {
        fail(`Expected exactly one settings row for ${key}, found ${matches.length}`);
      }
      rowsByKey.set(key, matches[0][0]);
    }
  }

  for (const row of rowsByKey.values()) {
    settingsSource = settingsSource.replace(row, "");
  }

  const organizedRows = sections
    .flatMap(section =>
      section.keys.map(key => {
        const row = rowsByKey.get(key);
        if (!row) {
          fail(`Missing extracted settings row for ${key}`);
        }
        return row.replace("\n  },", `\n    category: "${section.category}",\n  },`);
      }),
    )
    .join("");

  const updateRowPattern = /\n  \{\n    key: SettingKeys\.Offline_Update_Pop_Ups,[\s\S]*?\n  \},/;
  const updateMatches = [...settingsSource.matchAll(new RegExp(updateRowPattern.source, "g"))];
  if (updateMatches.length !== 1) {
    fail(`Expected one Update Pop-Ups row, found ${updateMatches.length}`);
  }
  settingsSource = settingsSource.replace(updateMatches[0][0], `${updateMatches[0][0]}${organizedRows}`);
}
writeFile(settingsPath, settingsSource);

const baseSettingsPath = path.join("pokerogue-src", "src", "ui", "settings", "base-settings-ui-handler.ts");
let baseSettingsSource = readFile(baseSettingsPath);
if (!baseSettingsSource.includes("const beginsCategory =")) {
  const labelAnchor = `    this.settings.forEach((setting, s) => {
      let settingName = setting.label;`;
  const labelReplacement = `    this.settings.forEach((setting, s) => {
      const beginsCategory = setting.category && this.settings[s - 1]?.category !== setting.category;
      let settingName = beginsCategory ? \`[\${setting.category}] \${setting.label}\` : setting.label;`;
  baseSettingsSource = replaceRequired(baseSettingsSource, labelAnchor, labelReplacement, "the settings label renderer");
}
writeFile(baseSettingsPath, baseSettingsSource);

for (const section of sections) {
  for (const key of section.keys) {
    const rowPattern = new RegExp(
      `key: SettingKeys\\.${key},[\\s\\S]*?category: "${section.category}",[\\s\\S]*?\\n  \\},`,
    );
    if (!rowPattern.test(settingsSource)) {
      fail(`Cheat catalog order/category marker is incomplete for ${key}`);
    }
  }
}

console.log("Offline cheats organized into functional sections.");
