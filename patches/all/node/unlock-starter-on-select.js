#!/usr/bin/env node

/**
 * Add Futuba's persistent Unlock Starter on Select option.
 *
 * Pressing Action on a locked starter writes only Futuba's observed minimum
 * ownership state: non-shiny male default form/variant, Ability 1, and six IVs
 * of 10. It does not grant candy, caught counts, egg moves, passives, alternate
 * forms, natures, shiny variants, or automatically add the starter to the team.
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

if (!settingsSource.includes("Offline_Form_Change_Items")) {
  fail(
    "unlock-starter-on-select.js must run after "
    + "form-change-item-settings.js.",
  );
}

if (!settingsSource.includes("Offline_Unlock_Starter_On_Select")) {
  const keyAnchor =
    '  Offline_Form_Change_Items: "OFFLINE_FORM_CHANGE_ITEMS",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_Unlock_Starter_On_Select: "OFFLINE_UNLOCK_STARTER_ON_SELECT",`,
    "the Form Change Items setting key",
  );
}

if (!settingsSource.includes('label: "Unlock Starter on Select"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Form_Change_Items,
    label: "Form Change Items",
    options: [
      { value: "0", label: "Default" },
      { value: "1", label: "Rebalanced" },
      { value: "2", label: "Abundant" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  const rowReplacement = `${rowAnchor}
  {
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
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Form Change Items settings row",
  );
}

if (
  !settingsSource.includes(
    "case SettingKeys.Offline_Unlock_Starter_On_Select:",
  )
) {
  const switchAnchor = `    case SettingKeys.Offline_Form_Change_Items:
      activeOverrides.FORM_CHANGE_ITEM_MODE_OVERRIDE = value;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Unlock_Starter_On_Select:
      activeOverrides.UNLOCK_STARTER_ON_SELECT_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Form Change Items setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added the Unlock Starter on Select setting.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("UNLOCK_STARTER_ON_SELECT_OVERRIDE")) {
  const overrideAnchor =
    "  readonly FORM_CHANGE_ITEM_MODE_OVERRIDE: number = 0;";
  const overrideReplacement = `${overrideAnchor}
  /** Persistently grants Futuba's minimum starter ownership state on select. */
  readonly UNLOCK_STARTER_ON_SELECT_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "FORM_CHANGE_ITEM_MODE_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added UNLOCK_STARTER_ON_SELECT_OVERRIDE.");

const starterSelectTarget = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "starter-select-ui-handler.ts",
);
let starterSource = readNormalized(starterSelectTarget);

if (!starterSource.includes("// unlock-starter-on-select: persistent Futuba ownership state")) {
  const unlockAnchor = `        if (!this.speciesStarterDexEntry?.caughtAttr) {
          error = true;
        } else if (this.starterSpecies.length <= 6) {`;
  const unlockReplacement = `        if (!this.speciesStarterDexEntry?.caughtAttr) {
          if (activeOverrides.UNLOCK_STARTER_ON_SELECT_OVERRIDE) {
            // unlock-starter-on-select: persistent Futuba ownership state
            const speciesId = this.lastSpecies.speciesId;
            const dexEntry = globalScene.gameData.dexData[speciesId];
            const starterEntry = globalScene.gameData.starterData[speciesId];
            const unlockedAttr = DexAttr.NON_SHINY | DexAttr.MALE | DexAttr.DEFAULT_VARIANT | DexAttr.DEFAULT_FORM;

            dexEntry.seenAttr = unlockedAttr;
            dexEntry.caughtAttr = unlockedAttr;
            starterEntry.abilityAttr = AbilityAttr.ABILITY_1;
            dexEntry.ivs.fill(10);

            audioManager.playSound("se/level_up_fanfare");
            globalScene.gameData.saveSystem().then(saved => {
              if (!saved) {
                globalScene.reset(true);
              }
            });
            // Refresh only the unlocked grid icon; do not rebuild filters or selected-team state.
            if (starterContainer) {
              starterContainer.icon.clearTint();
            }
            this.setSpecies(this.lastSpecies);
            success = true;
          } else {
            error = true;
          }
        } else if (this.starterSpecies.length <= 6) {`;
  starterSource = replaceRequired(
    starterSource,
    unlockAnchor,
    unlockReplacement,
    "the locked-starter Action branch",
  );
}

fs.writeFileSync(starterSelectTarget, starterSource, "utf8");
console.log("Unlock Starter on Select patch applied successfully.");
