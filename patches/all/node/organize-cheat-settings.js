#!/usr/bin/env node

/**
 * Reorder every SilverShadow cheat into contiguous functional sections.
 *
 * Offline management/backup rows remain first. Each cheat section begins with
 * a display-only heading that shared settings navigation skips.
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
    key: "OFFLINE_CATEGORY_SHOP",
    label: "SHOP",
    keys: ["Offline_Free_Shop_Items", "Offline_Free_Rerolls", "Offline_Money_Multiplier"],
  },
  {
    key: "OFFLINE_CATEGORY_REWARDS",
    label: "REWARDS",
    keys: ["Offline_Claim_All_Rewards", "Offline_Max_Luck"],
  },
  {
    key: "OFFLINE_CATEGORY_PROGRESS",
    label: "PROGRESS",
    keys: [
      "Offline_Exp_Multiplier",
      "Offline_Candy_Jar_Count",
      "Offline_Starter_Candy_Multiplier",
      "Offline_Candy_Costs",
    ],
  },
  {
    key: "OFFLINE_CATEGORY_TEAM",
    label: "TEAM",
    keys: [
      "Offline_Starter_Points_60",
      "Offline_Allow_Duplicate_Starters",
      "Offline_Starting_Level",
      "Offline_Unlock_Starter_On_Select",
      "Offline_All_Starters_Pokerus",
    ],
  },
  {
    key: "OFFLINE_CATEGORY_GEN_GACHA",
    label: "GEN / GACHA",
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
    key: "OFFLINE_CATEGORY_CAPTURE",
    label: "CAPTURE",
    keys: [
      "Offline_Guaranteed_Capture",
      "Offline_Unlimited_Pokeballs",
      "Offline_Catch_Trainer_Pokemon",
      "Offline_Catch_Double_Battle",
      "Offline_Catch_Boss_Shields",
    ],
  },
  {
    key: "OFFLINE_CATEGORY_BATTLE",
    label: "BATTLE",
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
    key: "OFFLINE_CATEGORY_EVOLVE_TM",
    label: "EVOLUTION / TM",
    keys: ["Offline_Ignore_Evolution_Requirements", "Offline_Unlimited_Tm_Compatibility"],
  },
];

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);

if (settingsSource.includes("  category?: string;")) {
  settingsSource = settingsSource.replace(
    /  \/\*\* Optional compact section marker used by the Offline cheat catalog\. \*\/\n  category\?: string;/,
    "  /** Display-only row used to divide the Offline cheat catalog. */\n  categoryHeader?: boolean;",
  );
}
if (!settingsSource.includes("  categoryHeader?: boolean;")) {
  settingsSource = replaceRequired(
    settingsSource,
    `export interface Setting {
  key: string;
  label: string;`,
    `export interface Setting {
  key: string;
  label: string;
  /** Display-only row used to divide the Offline cheat catalog. */
  categoryHeader?: boolean;`,
    "the Setting interface label field",
  );
}

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

// Remove headings from a prior application so this patch remains idempotent.
settingsSource = settingsSource.replace(
  /\n  \{\n    key: "OFFLINE_CATEGORY_[A-Z_]+",[\s\S]*?\n  \},/g,
  "",
);

const organizedRows = sections
  .map(section => {
    const heading = `
  {
    key: "${section.key}",
    label: "${section.label}",
    options: [],
    default: 0,
    type: SettingType.APP,
    categoryHeader: true,
  },`;
    const rows = section.keys.map(key => {
      const row = rowsByKey.get(key);
      if (!row) {
        fail(`Missing extracted settings row for ${key}`);
      }
      return row
        .replace(/\n    category: "[^"]+",/g, "")
        .replace(/\n    categoryHeader: true,/g, "");
    });
    return `${heading}${rows.join("")}`;
  })
  .join("");

const updateRowPattern = /\n  \{\n    key: SettingKeys\.Offline_Update_Pop_Ups,[\s\S]*?\n  \},/;
const updateMatches = [...settingsSource.matchAll(new RegExp(updateRowPattern.source, "g"))];
if (updateMatches.length !== 1) {
  fail(`Expected one Update Pop-Ups row, found ${updateMatches.length}`);
}
settingsSource = settingsSource.replace(updateMatches[0][0], `${updateMatches[0][0]}${organizedRows}`);
writeFile(settingsPath, settingsSource);

const baseSettingsPath = path.join("pokerogue-src", "src", "ui", "settings", "base-settings-ui-handler.ts");
let baseSettingsSource = readFile(baseSettingsPath);

const oldCategoryLabel = `      const beginsCategory = setting.category && this.settings[s - 1]?.category !== setting.category;
      let settingName = beginsCategory ? \`[\${setting.category}] \${setting.label}\` : setting.label;`;
if (baseSettingsSource.includes(oldCategoryLabel)) {
  baseSettingsSource = baseSettingsSource.replace(oldCategoryLabel, "      let settingName = setting.label;");
}

if (!baseSettingsSource.includes("if (setting.categoryHeader) {\n        return;\n      }")) {
  baseSettingsSource = replaceRequired(
    baseSettingsSource,
    `    this.settings.forEach((setting, s) => {
      const savedValue = Object.hasOwn(settings, setting.key) ? settings[setting.key] : this.settings[s].default;`,
    `    this.settings.forEach((setting, s) => {
      if (setting.categoryHeader) {
        return;
      }
      const savedValue = Object.hasOwn(settings, setting.key) ? settings[setting.key] : this.settings[s].default;`,
    "the saved settings renderer",
  );
}

if (!baseSettingsSource.includes("if (this.settings[cursor]?.categoryHeader) {\n      return false;\n    }")) {
  baseSettingsSource = replaceRequired(
    baseSettingsSource,
    `  private processLeftRightInput(cursor: number, dir: -1 | 1): boolean {
    let boundaryAction = Phaser.Math.Wrap;`,
    `  private processLeftRightInput(cursor: number, dir: -1 | 1): boolean {
    if (this.settings[cursor]?.categoryHeader) {
      return false;
    }
    let boundaryAction = Phaser.Math.Wrap;`,
    "the left/right settings input handler",
  );
}

const oldVerticalNavigation = `        case Button.UP:
          if (cursor) {
            if (this.cursor) {
              success = this.setCursor(this.cursor - 1);
            } else {
              success = this.setScrollCursor(this.scrollCursor - 1);
            }
          } else {
            // When at the top of the menu and pressing UP, move to the bottommost item.
            // First, set the cursor to the last visible element, preparing for the scroll to the end.
            const successA = this.setCursor(this.rowsToDisplay - 1);
            // Then, adjust the scroll to display the bottommost elements of the menu.
            const successB = this.setScrollCursor(this.optionValueLabels.length - this.rowsToDisplay);
            success = successA && successB; // success is just there to play the little validation sound effect
          }
          break;
        case Button.DOWN:
          if (cursor < this.optionValueLabels.length - 1) {
            if (this.cursor < this.rowsToDisplay - 1) {
              // if the visual cursor is in the frame of 0 to 8
              success = this.setCursor(this.cursor + 1);
            } else if (this.scrollCursor < this.optionValueLabels.length - this.rowsToDisplay) {
              success = this.setScrollCursor(this.scrollCursor + 1);
            }
          } else {
            // When at the bottom of the menu and pressing DOWN, move to the topmost item.
            // First, set the cursor to the first visible element, resetting the scroll to the top.
            const successA = this.setCursor(0);
            // Then, reset the scroll to start from the first element of the menu.
            const successB = this.setScrollCursor(0);
            success = successA && successB; // Indicates a successful cursor and scroll adjustment.
          }
          break;`;
const newVerticalNavigation = `        case Button.UP:
          success = this.moveSettingCursor(-1);
          break;
        case Button.DOWN:
          success = this.moveSettingCursor(1);
          break;`;
if (baseSettingsSource.includes(oldVerticalNavigation)) {
  baseSettingsSource = baseSettingsSource.replace(oldVerticalNavigation, newVerticalNavigation);
}

if (!baseSettingsSource.includes("private moveSettingCursor(direction: -1 | 1): boolean")) {
  baseSettingsSource = replaceRequired(
    baseSettingsSource,
    `  /**
   * Processes input from a specified button.`,
    `  /** Move vertically while treating category headings as display-only rows. */
  private moveSettingCursor(direction: -1 | 1): boolean {
    const rowCount = this.settings.length;
    if (!rowCount) {
      return false;
    }

    const startingIndex = this.cursor + this.scrollCursor;
    let targetIndex = startingIndex;
    do {
      targetIndex = Phaser.Math.Wrap(targetIndex + direction, 0, rowCount);
    } while (this.settings[targetIndex]?.categoryHeader && targetIndex !== startingIndex);

    if (targetIndex === startingIndex || this.settings[targetIndex]?.categoryHeader) {
      return false;
    }

    const maxScroll = Math.max(0, rowCount - this.rowsToDisplay);
    let nextScroll = this.scrollCursor;
    if (targetIndex < nextScroll) {
      nextScroll = targetIndex;
    } else if (targetIndex >= nextScroll + this.rowsToDisplay) {
      nextScroll = targetIndex - this.rowsToDisplay + 1;
    }
    nextScroll = Phaser.Math.Clamp(nextScroll, 0, maxScroll);

    this.setScrollCursor(nextScroll);
    this.setCursor(targetIndex - nextScroll);
    return true;
  }

  /**
   * Processes input from a specified button.`,
    "the processInput documentation",
  );
}

if (!baseSettingsSource.includes("const setting = this.settings[settingIndex];\n    if (setting.categoryHeader)")) {
  baseSettingsSource = replaceRequired(
    baseSettingsSource,
    `    const setting = this.settings[settingIndex];
    const lastCursor = this.optionCursors[settingIndex];`,
    `    const setting = this.settings[settingIndex];
    if (setting.categoryHeader) {
      return false;
    }
    const lastCursor = this.optionCursors[settingIndex];`,
    "the option cursor setting lookup",
  );
}

writeFile(baseSettingsPath, baseSettingsSource);

for (const section of sections) {
  const headingPattern = new RegExp(
    `\\n  \\{\\n    key: "${section.key}",[\\s\\S]*?\\n  \\},`,
    "g",
  );
  const headings = [...settingsSource.matchAll(headingPattern)];
  if (
    headings.length !== 1
    || !headings[0][0].includes("    options: [],")
    || !headings[0][0].includes("    categoryHeader: true,")
  ) {
    fail(`Cheat catalog heading is incomplete for ${section.label}`);
  }
  for (const key of section.keys) {
    const rowPattern = new RegExp(`\\n  \\{\\n    key: SettingKeys\\.${key},[\\s\\S]*?\\n  \\},`);
    const matches = [...settingsSource.matchAll(new RegExp(rowPattern.source, "g"))];
    if (matches.length !== 1 || matches[0][0].includes("category:")) {
      fail(`Cheat catalog row is incomplete or still categorized for ${key}`);
    }
  }
}

if (baseSettingsSource.includes("beginsCategory") || baseSettingsSource.includes("[${setting.category}]")) {
  fail("The legacy inline category prefix renderer is still present.");
}
if (!baseSettingsSource.includes("private moveSettingCursor(direction: -1 | 1): boolean")) {
  fail("Category-aware settings navigation was not installed.");
}

console.log("Offline cheats organized under display-only functional headings.");
