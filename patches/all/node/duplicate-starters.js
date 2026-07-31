#!/usr/bin/env node

/**
 * Adds the offline-only "Allow Duplicate Starters" setting.
 *
 * The runtime changes keep selected starters as independent records. Species
 * grid actions target the most recently added matching starter, while actions
 * opened from the team panel target the exact highlighted slot.
 *
 * This patch must run after sandbox-progression-settings.js.
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

/*
 * ---------------------------------------------------------------------------
 * 1. Add the setting and runtime override
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

if (!settingsSource.includes("Offline_Starter_Points_60")) {
  fail(
    "duplicate-starters.js must run after sandbox-progression-settings.js.",
  );
}

if (!settingsSource.includes("Offline_Allow_Duplicate_Starters")) {
  const keyAnchor =
    '  Offline_Starter_Points_60: "OFFLINE_STARTER_POINTS_60",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_Allow_Duplicate_Starters: "OFFLINE_ALLOW_DUPLICATE_STARTERS",`,
    "the 60 Starter Points setting key",
  );
}

if (!settingsSource.includes('label: "Allow Duplicate Starters"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Starter_Points_60,
    label: "60 Starter Points",
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
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the 60 Starter Points settings row",
  );
}

if (
  !settingsSource.includes(
    "case SettingKeys.Offline_Allow_Duplicate_Starters:",
  )
) {
  const switchAnchor = `    case SettingKeys.Offline_Starter_Points_60:
      activeOverrides.STARTER_POINT_LIMIT_OVERRIDE = value === 1 ? 60 : null;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Allow_Duplicate_Starters:
      activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the 60 Starter Points setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added the Allow Duplicate Starters Offline setting.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("ALLOW_DUPLICATE_STARTERS_OVERRIDE")) {
  const overrideAnchor =
    "  readonly STARTER_POINT_LIMIT_OVERRIDE: number | null = null;";
  const overrideReplacement = `${overrideAnchor}
  /** Allows independent duplicate species records in starter selection. */
  readonly ALLOW_DUPLICATE_STARTERS_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "STARTER_POINT_LIMIT_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added ALLOW_DUPLICATE_STARTERS_OVERRIDE.");

/*
 * ---------------------------------------------------------------------------
 * 2. Make starter selection duplicate-aware and slot-aware
 * ---------------------------------------------------------------------------
 */

const starterSelectTarget = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "starter-select-ui-handler.ts",
);
let starterSource = readNormalized(starterSelectTarget);

if (!starterSource.includes("getSelectedStarterIndex(")) {
  const helperAnchor = `  isInParty(species: PokemonSpecies): [boolean, number] {
    let removeIndex = 0;
    let isDupe = false;
    for (let s = 0; s < this.starterSpecies.length; s++) {
      if (this.starterSpecies[s] === species) {
        isDupe = true;
        removeIndex = s;
        break;
      }
    }
    return [isDupe, removeIndex];
  }
`;
  const helperReplacement = `${helperAnchor}
  /**
   * Resolve an independently editable starter record.
   *
   * Team-panel actions target the highlighted slot. Species-grid actions use
   * the most recently added matching copy for display and removal.
   */
  private getSelectedStarterIndex(species: PokemonSpecies): number {
    if (this.starterIconsCursorObj.visible && this.starterSpecies[this.starterIconsCursorIndex] === species) {
      return this.starterIconsCursorIndex;
    }

    return this.starterSpecies.lastIndexOf(species);
  }

  /**
   * Resolve the starter record that may be changed by the current cursor.
   *
   * With duplicates enabled, species-grid edits prepare the next copy and do
   * not overwrite an existing copy. Team-panel edits still target one slot.
   */
  private getEditableStarterIndex(species: PokemonSpecies): number {
    if (activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE && !this.starterIconsCursorObj.visible) {
      return -1;
    }

    return this.getSelectedStarterIndex(species);
  }
`;
  starterSource = replaceRequired(
    starterSource,
    helperAnchor,
    helperReplacement,
    "isInParty in starter-select-ui-handler.ts",
  );
}

if (!starterSource.includes("getEditableStarterIndex(")) {
  const editableHelperAnchor = `  private getSelectedStarterIndex(species: PokemonSpecies): number {
    if (this.starterIconsCursorObj.visible && this.starterSpecies[this.starterIconsCursorIndex] === species) {
      return this.starterIconsCursorIndex;
    }

    return this.starterSpecies.lastIndexOf(species);
  }
`;
  const editableHelperReplacement = `${editableHelperAnchor}
  /**
   * Resolve the starter record that may be changed by the current cursor.
   *
   * With duplicates enabled, species-grid edits prepare the next copy and do
   * not overwrite an existing copy. Team-panel edits still target one slot.
   */
  private getEditableStarterIndex(species: PokemonSpecies): number {
    if (activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE && !this.starterIconsCursorObj.visible) {
      return -1;
    }

    return this.getSelectedStarterIndex(species);
  }
`;
  starterSource = replaceRequired(
    starterSource,
    editableHelperAnchor,
    editableHelperReplacement,
    "getSelectedStarterIndex in starter-select-ui-handler.ts",
  );
}

if (
  !starterSource.includes(
    "!isDupe || activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE",
  )
) {
  const randomAnchor =
    "!isDupe && isValidForChallenge && currentPartyValue + starterCost <= this.getValueLimit() && isCaught";
  const randomReplacement =
    "(!isDupe || activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE)\n"
    + "              && isValidForChallenge\n"
    + "              && currentPartyValue + starterCost <= this.getValueLimit()\n"
    + "              && isCaught";
  starterSource = replaceRequired(
    starterSource,
    randomAnchor,
    randomReplacement,
    "the Random Starter duplicate filter",
  );
}

if (!starterSource.includes("const canAddSelectedStarter =")) {
  starterSource = replaceRequired(
    starterSource,
    "          let options: any[] = []; // TODO: add proper type",
    "          const options: any[] = []; // TODO: add proper type",
    "the starter option collection",
  );
  const optionsAnchor = `          if (
            !isDupe
            && isValidForChallenge
            && currentPartyValue + newCost <= this.getValueLimit()
            && this.starterSpecies.length < PLAYER_PARTY_MAX_SIZE
          ) {
            options = [
              {
                label: i18next.t("starterSelectUiHandler:addToParty"),
                handler: () => {
                  ui.setMode(UiMode.STARTER_SELECT);
                  const isOverValueLimit = this.tryUpdateValue(
                    globalScene.gameData.getSpeciesStarterValue(this.lastSpecies.speciesId),
                    true,
                  );
                  if (!isDupe && isValidForChallenge && isOverValueLimit) {
                    this.starterCursorObjs[this.starterSpecies.length]
                      .setVisible(true)
                      .setPosition(this.cursorObj.x, this.cursorObj.y);
                    this.addToParty(
                      this.lastSpecies,
                      this.dexAttrCursor,
                      this.abilityCursor,
                      this.natureCursor as unknown as Nature,
                      this.starterMoveset?.slice(0) as StarterMoveset,
                      this.teraCursor,
                    );
                    ui.playSelect();
                  } else {
                    ui.playError(); // this should be redundant as there is now a trigger for when a pokemon can't be added to party
                  }
                  return true;
                },
                overrideSound: true,
              },
            ];
          } else if (isDupe) {
            // if it already exists in your party, it will give you the option to remove from your party
            options = [
              {
                label: i18next.t("starterSelectUiHandler:removeFromParty"),
                handler: () => {
                  this.popStarter(removeIndex);
                  ui.setMode(UiMode.STARTER_SELECT);
                  return true;
                },
              },
            ];
          }`;
  const optionsReplacement = `          const duplicatesAllowed = activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE;
          const canAddSelectedStarter =
            (!isDupe || duplicatesAllowed)
            && isValidForChallenge
            && currentPartyValue + newCost <= this.getValueLimit()
            && this.starterSpecies.length < PLAYER_PARTY_MAX_SIZE;

          if (canAddSelectedStarter) {
            options.push({
              label: i18next.t("starterSelectUiHandler:addToParty"),
              handler: () => {
                ui.setMode(UiMode.STARTER_SELECT);
                const withinValueLimit = this.tryUpdateValue(
                  globalScene.gameData.getSpeciesStarterValue(this.lastSpecies.speciesId),
                  true,
                );
                if (
                  (!isDupe || activeOverrides.ALLOW_DUPLICATE_STARTERS_OVERRIDE)
                  && isValidForChallenge
                  && withinValueLimit
                  && this.starterSpecies.length < PLAYER_PARTY_MAX_SIZE
                ) {
                  if (!isDupe) {
                    this.starterCursorObjs[this.starterSpecies.length]
                      .setVisible(true)
                      .setPosition(this.cursorObj.x, this.cursorObj.y);
                  }
                  this.addToParty(
                    this.lastSpecies,
                    this.dexAttrCursor,
                    this.abilityCursor,
                    this.natureCursor as unknown as Nature,
                    this.starterMoveset?.slice(0) as StarterMoveset,
                    this.teraCursor,
                  );
                  this.updateScroll();
                  ui.playSelect();
                } else {
                  ui.playError();
                }
                return true;
              },
              overrideSound: true,
            });
          }

          if (isDupe) {
            options.push({
              label: duplicatesAllowed ? "Remove One from Party" : i18next.t("starterSelectUiHandler:removeFromParty"),
              handler: () => {
                this.popStarter(removeIndex);
                ui.setMode(UiMode.STARTER_SELECT);
                return true;
              },
            });
          }`;
  starterSource = replaceRequired(
    starterSource,
    optionsAnchor,
    optionsReplacement,
    "the starter Add/Remove option construction",
  );
}

if (
  !starterSource.includes(
    "const removeIndex = this.getSelectedStarterIndex(this.lastSpecies);",
  )
) {
  const removeIndexAnchor =
    "          const [isDupe, removeIndex]: [boolean, number] = this.isInParty(this.lastSpecies);";
  const removeIndexReplacement = `          const [isDupe]: [boolean, number] = this.isInParty(this.lastSpecies);
          const removeIndex = this.getSelectedStarterIndex(this.lastSpecies);`;
  starterSource = replaceRequired(
    starterSource,
    removeIndexAnchor,
    removeIndexReplacement,
    "the selected starter removal index",
  );
}

if (!starterSource.includes("const selectedIndex = this.getEditableStarterIndex(species);")) {
  const movesAnchor = `    for (const [index, species] of this.starterSpecies.entries()) {
      if (species.speciesId === id) {
        this.starters[index].moveset = this.starterMoveset;
      }
    }`;
  const movesReplacement = `    const species = speciesDataRegistry.getSpecies(id);
    const selectedIndex = this.getEditableStarterIndex(species);
    if (selectedIndex >= 0) {
      this.starters[selectedIndex].moveset = this.starterMoveset.slice() as StarterMoveset;
    }`;
  starterSource = replaceRequired(
    starterSource,
    movesAnchor,
    movesReplacement,
    "updateSelectedStarterMoveset's species-wide loop",
  );
}

const firstCopyAnchor =
  "        const starterIndex = this.starterSpecies.indexOf(species);";
if (starterSource.includes(firstCopyAnchor)) {
  starterSource = starterSource.replace(
    firstCopyAnchor,
    "        const starterIndex = this.getSelectedStarterIndex(species);",
  );
}
if (starterSource.includes(firstCopyAnchor)) {
  starterSource = starterSource.replace(
    firstCopyAnchor,
    "        const starterIndex = this.getEditableStarterIndex(species);",
  );
}

if (
  starterSource.includes(
    "      const [isInParty, partyIndex]: [boolean, number] = this.isInParty(species);",
  )
) {
  const partyIconAnchor =
    "\n      const [isInParty, partyIndex]: [boolean, number] = this.isInParty(species); // we use this to firstly check if the pokemon is in the party, and if so, to get the party index in order to update the icon image\n"
    + "      if (isInParty) {\n"
    + "        this.updatePartyIcon(species, partyIndex);\n"
    + "      }";
  starterSource = replaceRequired(
    starterSource,
    partyIconAnchor,
    "",
    "the premature party-icon update",
  );
}

if (!starterSource.includes("const passiveStarterIndex = this.getEditableStarterIndex(this.lastSpecies);")) {
  const passiveLabelAnchor = `          const passiveAttr = starterData.passiveAttr;
          if (passiveAttr & PassiveAttr.UNLOCKED) {
            // this is for enabling and disabling the passive
            const label = i18next.t(
              passiveAttr & PassiveAttr.ENABLED
                ? "starterSelectUiHandler:disablePassive"
                : "starterSelectUiHandler:enablePassive",
            );`;
  const passiveLabelReplacement = `          const passiveAttr = starterData.passiveAttr;
          const passiveStarterIndex = this.getEditableStarterIndex(this.lastSpecies);
          const passiveEnabled =
            passiveStarterIndex >= 0
              ? this.starters[passiveStarterIndex].passive
              : !!(passiveAttr & PassiveAttr.ENABLED);
          if (passiveAttr & PassiveAttr.UNLOCKED) {
            // this is for enabling and disabling the passive
            const label = i18next.t(
              passiveEnabled ? "starterSelectUiHandler:disablePassive" : "starterSelectUiHandler:enablePassive",
            );`;
  starterSource = replaceRequired(
    starterSource,
    passiveLabelAnchor,
    passiveLabelReplacement,
    "the passive toggle label",
  );
}

starterSource = starterSource.replace(
  `            const label = i18next.t(
              passiveEnabled
                ? "starterSelectUiHandler:disablePassive"
                : "starterSelectUiHandler:enablePassive",
            );`,
  `            const label = i18next.t(
              passiveEnabled ? "starterSelectUiHandler:disablePassive" : "starterSelectUiHandler:enablePassive",
            );`,
);

if (!starterSource.includes("const nextPassiveEnabled = !passiveEnabled;")) {
  const originalPassiveHandlerAnchor = `                starterData.passiveAttr ^= PassiveAttr.ENABLED;
                persistentStarterData.passiveAttr ^= PassiveAttr.ENABLED;
                ui.setMode(UiMode.STARTER_SELECT);`;
  const previousPassiveHandlerAnchor = `                starterData.passiveAttr ^= PassiveAttr.ENABLED;
                persistentStarterData.passiveAttr ^= PassiveAttr.ENABLED;
                const selectedStarterIndex = this.getEditableStarterIndex(this.lastSpecies);
                if (selectedStarterIndex >= 0) {
                  this.starters[selectedStarterIndex].passive = !!(starterData.passiveAttr & PassiveAttr.ENABLED);
                }
                ui.setMode(UiMode.STARTER_SELECT);`;
  const passiveHandlerAnchor = starterSource.includes(previousPassiveHandlerAnchor)
    ? previousPassiveHandlerAnchor
    : originalPassiveHandlerAnchor;
  const passiveHandlerReplacement = `                const nextPassiveEnabled = !passiveEnabled;
                if (nextPassiveEnabled) {
                  starterData.passiveAttr |= PassiveAttr.ENABLED;
                  persistentStarterData.passiveAttr |= PassiveAttr.ENABLED;
                } else {
                  starterData.passiveAttr &= ~PassiveAttr.ENABLED;
                  persistentStarterData.passiveAttr &= ~PassiveAttr.ENABLED;
                }
                if (passiveStarterIndex >= 0) {
                  this.starters[passiveStarterIndex].passive = nextPassiveEnabled;
                }
                ui.setMode(UiMode.STARTER_SELECT);`;
  starterSource = replaceRequired(
    starterSource,
    passiveHandlerAnchor,
    passiveHandlerReplacement,
    "the per-copy passive toggle handler",
  );
}

if (!starterSource.includes("this.starters[passiveStarterIndex].passive = true;")) {
  const unlockPassiveAnchor = `                    persistentStarterData.passiveAttr |= PassiveAttr.UNLOCKED | PassiveAttr.ENABLED;
                    starterData.passiveAttr = persistentStarterData.passiveAttr;`;
  const unlockPassiveReplacement = `${unlockPassiveAnchor}
                    if (passiveStarterIndex >= 0) {
                      this.starters[passiveStarterIndex].passive = true;
                    }`;
  starterSource = replaceRequired(
    starterSource,
    unlockPassiveAnchor,
    unlockPassiveReplacement,
    "the passive unlock handler",
  );
}

if (!starterSource.includes("const passiveStarterIndex = this.getEditableStarterIndex(species);")) {
  const passiveDisplayAnchor = `          const isUnlocked = !!(passiveAttr & PassiveAttr.UNLOCKED);
          const isEnabled = !!(passiveAttr & PassiveAttr.ENABLED);`;
  const passiveDisplayReplacement = `          const isUnlocked = !!(passiveAttr & PassiveAttr.UNLOCKED);
          const passiveStarterIndex = this.getEditableStarterIndex(species);
          const isEnabled =
            passiveStarterIndex >= 0
              ? this.starters[passiveStarterIndex].passive
              : !!(passiveAttr & PassiveAttr.ENABLED);`;
  starterSource = replaceRequired(
    starterSource,
    passiveDisplayAnchor,
    passiveDisplayReplacement,
    "the passive enabled-state display",
  );
}

if (!starterSource.includes("const starter = this.starters[index];\n    this.starterIcons[index]")) {
  const updatePartyIconAnchor = `  updatePartyIcon(species: PokemonSpecies, index: number) {
    const props = globalScene.gameData.getSpeciesDexAttrProps(species, this.getCurrentDexProps(species.speciesId));
    this.starterIcons[index].setTexture(species.getIconAtlasKey(props.formIndex, props.shiny, props.variant));
    this.starterIcons[index].setFrame(species.getIconId(props.female, props.formIndex, props.shiny, props.variant));
    this.checkIconId(this.starterIcons[index], species, props.female, props.formIndex, props.shiny, props.variant);
  }`;
  const updatePartyIconReplacement = `  updatePartyIcon(species: PokemonSpecies, index: number) {
    const starter = this.starters[index];
    this.starterIcons[index].setTexture(species.getIconAtlasKey(starter.formIndex, starter.shiny, starter.variant));
    this.starterIcons[index].setFrame(
      species.getIconId(starter.female ?? false, starter.formIndex, starter.shiny, starter.variant),
    );
    this.checkIconId(
      this.starterIcons[index],
      species,
      starter.female ?? false,
      starter.formIndex,
      starter.shiny,
      starter.variant,
    );
  }`;
  starterSource = replaceRequired(
    starterSource,
    updatePartyIconAnchor,
    updatePartyIconReplacement,
    "updatePartyIcon's species-wide preference lookup",
  );
}

if (!starterSource.includes("this.updatePartyIcon(species, starterIndex);")) {
  const starterMutationAnchor = `          starter.abilityIndex = this.abilityCursor;
          starter.nature = this.natureCursor;
          starter.teraType = this.teraCursor;`;
  const starterMutationReplacement = `${starterMutationAnchor}
          this.updatePartyIcon(species, starterIndex);`;
  starterSource = replaceRequired(
    starterSource,
    starterMutationAnchor,
    starterMutationReplacement,
    "the selected starter record update",
  );
}

if (!starterSource.includes("const selectedStarterMoveset =")) {
  const moveDataAnchor = `        const speciesMoveData = starterDataEntry.moveset;
        const moveData: StarterMoveset | null = speciesMoveData
          ? Array.isArray(speciesMoveData)
            ? speciesMoveData
            : speciesMoveData[formIndex!] // TODO: is this bang correct?
          : null;`;
  const moveDataReplacement = `        const selectedStarterIndex = this.getSelectedStarterIndex(species);
        const selectedStarterMoveset =
          selectedStarterIndex >= 0 ? this.starters[selectedStarterIndex].moveset : undefined;
        const speciesMoveData = starterDataEntry.moveset;
        const moveData: StarterMoveset | null | undefined =
          selectedStarterMoveset
          ?? (speciesMoveData
            ? Array.isArray(speciesMoveData)
              ? speciesMoveData
              : speciesMoveData[formIndex!] // TODO: is this bang correct?
            : null);`;
  starterSource = replaceRequired(
    starterSource,
    moveDataAnchor,
    moveDataReplacement,
    "the selected starter moveset source",
  );
}

if (!starterSource.includes("const starter = this.starters[s];\n      this.starterIcons[s]")) {
  const iconRebuildAnchor = `      const species = this.starterSpecies[s];
      const currentDexAttr = this.getCurrentDexProps(species.speciesId);
      const props = globalScene.gameData.getSpeciesDexAttrProps(species, currentDexAttr);
      this.starterIcons[s]
        .setTexture(species.getIconAtlasKey(props.formIndex, props.shiny, props.variant))
        .setFrame(species.getIconId(props.female, props.formIndex, props.shiny, props.variant));
      this.checkIconId(this.starterIcons[s], species, props.female, props.formIndex, props.shiny, props.variant);`;
  const iconRebuildReplacement = `      const species = this.starterSpecies[s];
      const starter = this.starters[s];
      this.starterIcons[s]
        .setTexture(species.getIconAtlasKey(starter.formIndex, starter.shiny, starter.variant))
        .setFrame(species.getIconId(starter.female ?? false, starter.formIndex, starter.shiny, starter.variant));
      this.checkIconId(
        this.starterIcons[s],
        species,
        starter.female ?? false,
        starter.formIndex,
        starter.shiny,
        starter.variant,
      );`;
  starterSource = replaceRequired(
    starterSource,
    iconRebuildAnchor,
    iconRebuildReplacement,
    "popStarter's party icon rebuild",
  );
}

if (
  !starterSource.includes(
    "    this.updateScroll();\n    this.tryUpdateValue();\n  }\n\n  // TODO: Dedupe from pokedex",
  )
) {
  const popEndAnchor = `    this.tryUpdateValue();
  }

  // TODO: Dedupe from pokedex
  updateStarterValueLabel`;
  const popEndReplacement = `    this.updateScroll();
    this.tryUpdateValue();
  }

  // TODO: Dedupe from pokedex
  updateStarterValueLabel`;
  starterSource = replaceRequired(
    starterSource,
    popEndAnchor,
    popEndReplacement,
    "the end of popStarter",
  );
}

if (starterSource.includes("this.starterSpecies.indexOf(species)")) {
  fail(
    "A species-first starter lookup remains after patching; "
    + "review the current starter-selection implementation.",
  );
}

fs.writeFileSync(starterSelectTarget, starterSource, "utf8");
console.log("Enabled independent duplicate starter selection and editing.");
console.log("Duplicate starters patch applied successfully.");
