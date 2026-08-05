#!/usr/bin/env node

/**
 * Make the audited SilverShadow gameplay settings take effect at runtime.
 *
 * Every live setting writes through GameData.saveSetting() -> setSetting(),
 * which updates activeOverrides immediately. Their consumers read the active
 * value at the next relevant event boundary, so forcing BattleScene.reset()
 * when the settings screen closes is unnecessary and especially expensive on
 * memory-constrained platforms.
 *
 * Two starter-selection settings deliberately retain requireReload:
 *
 * - 60 Starter Points can leave an already-selected team over the normal cap
 *   when disabled.
 * - Allow Duplicate Starters can leave duplicate records in a UI whose normal
 *   editing paths assume one record per species when disabled.
 *
 * The patch also separates Free Shop Items from Free Rerolls. The original
 * wiring set WAIVE_SHOP_FEES_OVERRIDE but accidentally checked
 * WAIVE_ROLL_FEE_OVERRIDE in every shop transaction path.
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
  if (!source.includes(anchor)) {
    fail(`Could not find ${description}. The upstream source or an earlier patch may have changed.`);
  }
  return source.replace(anchor, replacement);
}

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);

const liveSettingKeys = [
  "Offline_Free_Shop_Items",
  "Offline_Free_Rerolls",
  "Offline_Free_Egg_Pulls",
  "Offline_Guaranteed_Capture",
  "Offline_Max_Luck",
  "Offline_Starter_Candy_Multiplier",
  "Offline_Starting_Level",
  "Offline_Shiny_Rate",
  "Offline_Always_Shiny",
  "Offline_Rare_Eggs",
  "Offline_Instant_Hatch",
  "Offline_Form_Change_Items",
  "Offline_Unlock_Starter_On_Select",
  "Offline_All_Starters_Pokerus",
  "Offline_Candy_Costs",
  "Offline_Claim_All_Rewards",
  "Offline_Infinite_Player_Hp",
  "Offline_Infinite_Player_Pp",
  "Offline_Player_Ohko",
];

for (const key of liveSettingKeys) {
  const rowPattern = new RegExp(`(\\n  \\{\\n    key: SettingKeys\\.${key},[\\s\\S]*?\\n  \\},)`);
  const rowMatch = settingsSource.match(rowPattern);
  if (!rowMatch) {
    fail(`Could not find the settings row for ${key}`);
  }

  const row = rowMatch[1];
  if (row.includes("    requireReload: true,\n")) {
    settingsSource = settingsSource.replace(row, row.replace("    requireReload: true,\n", ""));
  }
}

for (const key of ["Offline_Starter_Points_60", "Offline_Allow_Duplicate_Starters"]) {
  const rowPattern = new RegExp(`\\n  \\{\\n    key: SettingKeys\\.${key},[\\s\\S]*?\\n  \\},`);
  const row = settingsSource.match(rowPattern)?.[0];
  if (!row?.includes("    requireReload: true,\n")) {
    fail(`${key} must remain restart-required for starter-selection state safety`);
  }
}

const unsafeRefreshHelper = `/** Refresh already-rendered shop and reroll prices after a live setting change. */
function refreshModifierSelectCosts(): void {
  const handler = globalScene.ui?.handlers?.[UiMode.MODIFIER_SELECT] as
    | { updateCostText?: () => void }
    | undefined;
  handler?.updateCostText?.();
}`;
const safeRefreshHelper = `/** Refresh already-rendered shop and reroll prices after a live setting change. */
function refreshModifierSelectCosts(): void {
  const handler = globalScene.ui?.handlers?.[UiMode.MODIFIER_SELECT] as
    | { updateCostText?: () => void; rerollCost?: number; rerollCostText?: unknown }
    | undefined;
  // UI constructs every handler up front.  Before Modifier Select has ever
  // been shown its rerollCost is intentionally undefined, and formatting it
  // throws.  Refresh only a handler whose cost display has been initialized;
  // show() computes the current live cost when the handler is first opened.
  if (handler?.rerollCostText && Number.isFinite(handler.rerollCost)) {
    handler.updateCostText?.();
  }
}`;
if (settingsSource.includes(unsafeRefreshHelper)) {
  settingsSource = settingsSource.replace(unsafeRefreshHelper, safeRefreshHelper);
} else if (!settingsSource.includes("function refreshModifierSelectCosts(): void")) {
  const helperAnchor = `/**
 * Updates a setting
 * @param setting string ideally from SettingKeys`;
  const helper = `${safeRefreshHelper}\n\n${helperAnchor}`;
  settingsSource = replaceRequired(settingsSource, helperAnchor, helper, "the setSetting documentation anchor");
}

settingsSource = settingsSource.replace(
  `    case SettingKeys.Offline_Free_Shop_Items:
      activeOverrides.WAIVE_SHOP_FEES_OVERRIDE = value === 1;
      break;`,
  `    case SettingKeys.Offline_Free_Shop_Items:
      activeOverrides.WAIVE_SHOP_FEES_OVERRIDE = value === 1;
      refreshModifierSelectCosts();
      break;`,
);
settingsSource = settingsSource.replace(
  `    case SettingKeys.Offline_Free_Rerolls:
      activeOverrides.WAIVE_ROLL_FEE_OVERRIDE = value === 1;
      break;`,
  `    case SettingKeys.Offline_Free_Rerolls:
      activeOverrides.WAIVE_ROLL_FEE_OVERRIDE = value === 1;
      refreshModifierSelectCosts();
      break;`,
);

for (const marker of [
  "activeOverrides.WAIVE_SHOP_FEES_OVERRIDE = value === 1;\n      refreshModifierSelectCosts();",
  "activeOverrides.WAIVE_ROLL_FEE_OVERRIDE = value === 1;\n      refreshModifierSelectCosts();",
]) {
  if (!settingsSource.includes(marker)) {
    fail(`Missing live cost refresh marker: ${marker}`);
  }
}

for (const key of liveSettingKeys) {
  const rowPattern = new RegExp(`\\n  \\{\\n    key: SettingKeys\\.${key},[\\s\\S]*?\\n  \\},`);
  const finalRow = settingsSource.match(rowPattern)?.[0];
  if (!finalRow || finalRow.includes("requireReload")) {
    fail(`${key} is live but retained requireReload in the final generated settings source`);
  }
}

writeFile(settingsPath, settingsSource);

const selectModifierPath = path.join("pokerogue-src", "src", "phases", "select-modifier-phase.ts");
let selectModifierSource = readFile(selectModifierPath);

selectModifierSource = selectModifierSource.replace(
  "if (globalScene.money < cost && !activeOverrides.WAIVE_ROLL_FEE_OVERRIDE)",
  "if (globalScene.money < cost && !activeOverrides.WAIVE_SHOP_FEES_OVERRIDE)",
);

const shopDeductionAnchor = `    if (cost !== -1 && !(modifier.type instanceof RememberMoveModifierType)) {
      if (result) {
        if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {`;
const shopDeductionReplacement = `    if (cost !== -1 && !(modifier.type instanceof RememberMoveModifierType)) {
      if (result) {
        if (!activeOverrides.WAIVE_SHOP_FEES_OVERRIDE) {`;
if (!selectModifierSource.includes(shopDeductionReplacement)) {
  selectModifierSource = replaceRequired(
    selectModifierSource,
    shopDeductionAnchor,
    shopDeductionReplacement,
    "the shop purchase deduction",
  );
}

for (const marker of [
  "globalScene.money < cost && !activeOverrides.WAIVE_SHOP_FEES_OVERRIDE",
  "if (!activeOverrides.WAIVE_SHOP_FEES_OVERRIDE) {\n          globalScene.money -= cost;",
]) {
  if (!selectModifierSource.includes(marker)) {
    fail(`Shop fee override is incomplete in select-modifier-phase.ts: ${marker}`);
  }
}
writeFile(selectModifierPath, selectModifierSource);

const learnMovePath = path.join("pokerogue-src", "src", "phases", "learn-move-phase.ts");
let learnMoveSource = readFile(learnMovePath);
const learnMoveAnchor = `      } else {
        if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
          globalScene.money -= this.cost;`;
const learnMoveReplacement = `      } else {
        if (!activeOverrides.WAIVE_SHOP_FEES_OVERRIDE) {
          globalScene.money -= this.cost;`;
if (!learnMoveSource.includes(learnMoveReplacement)) {
  learnMoveSource = replaceRequired(
    learnMoveSource,
    learnMoveAnchor,
    learnMoveReplacement,
    "the move-shop purchase deduction",
  );
}
writeFile(learnMovePath, learnMoveSource);

const modifierUiPath = path.join("pokerogue-src", "src", "ui", "handlers", "modifier-select-ui-handler.ts");
let modifierUiSource = readFile(modifierUiPath);
modifierUiSource = modifierUiSource.replace(
  "const cost = activeOverrides.WAIVE_ROLL_FEE_OVERRIDE ? 0 : this.modifierTypeOption.cost;",
  "const cost = activeOverrides.WAIVE_SHOP_FEES_OVERRIDE ? 0 : this.modifierTypeOption.cost;",
);

const rerollCostAnchor = `    this.rerollCostText.setVisible(true);
    const canReroll = globalScene.money >= this.rerollCost;

    const formattedMoney = formatMoney(globalScene.moneyFormat, this.rerollCost);`;
const rerollCostReplacement = `    this.rerollCostText.setVisible(true);
    const displayedRerollCost = activeOverrides.WAIVE_ROLL_FEE_OVERRIDE ? 0 : this.rerollCost;
    const canReroll = globalScene.money >= displayedRerollCost;

    const formattedMoney = formatMoney(globalScene.moneyFormat, displayedRerollCost);`;
if (!modifierUiSource.includes(rerollCostReplacement)) {
  modifierUiSource = replaceRequired(
    modifierUiSource,
    rerollCostAnchor,
    rerollCostReplacement,
    "the reroll cost display calculation",
  );
}

for (const marker of [
  "activeOverrides.WAIVE_SHOP_FEES_OVERRIDE ? 0 : this.modifierTypeOption.cost",
  "activeOverrides.WAIVE_ROLL_FEE_OVERRIDE ? 0 : this.rerollCost",
]) {
  if (!modifierUiSource.includes(marker)) {
    fail(`Live shop UI marker is missing: ${marker}`);
  }
}
writeFile(modifierUiPath, modifierUiSource);

console.log("Audited SilverShadow settings now update live where safe.");
console.log("60 Starter Points and Allow Duplicate Starters remain restart-required.");
console.log("Free Shop Items and Free Rerolls now use independent runtime overrides.");
