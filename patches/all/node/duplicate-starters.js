#!/usr/bin/env node

/**
 * Adds the offline-only "Allow Duplicate Starters" setting.
 *
 * The runtime changes keep selected starters as independent records. Species
 * grid edits prepare defaults for the next copy (and removal targets the most
 * recent copy), while team-panel actions target the exact highlighted slot.
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

if (!starterSource.includes("const editableStarterIndex = this.getEditableStarterIndex(this.lastSpecies);")) {
  const editContextAnchor = `      const starterAttributes = this.starterPreferences[this.lastSpecies.speciesId]!;
      const originalStarterAttributes = this.originalStarterPreferences[this.lastSpecies.speciesId]!;`;
  const editContextReplacement = `${editContextAnchor}
      // Capture the exact team slot before opening nested option/rename/move
      // handlers, which may temporarily hide the team-panel cursor.
      const editableStarterIndex = this.getEditableStarterIndex(this.lastSpecies);`;
  starterSource = replaceRequired(
    starterSource,
    editContextAnchor,
    editContextReplacement,
    "the starter edit context",
  );
}

if (!starterSource.includes("starterIndexOverride?: number,")) {
  const setSpeciesDetailsSignatureAnchor =
    "  setSpeciesDetails(species: PokemonSpecies, options: SpeciesDetails = {}, save = true): void {";
  const setSpeciesDetailsSignatureReplacement = `  setSpeciesDetails(
    species: PokemonSpecies,
    options: SpeciesDetails = {},
    save = true,
    starterIndexOverride?: number,
  ): void {`;
  starterSource = replaceRequired(
    starterSource,
    setSpeciesDetailsSignatureAnchor,
    setSpeciesDetailsSignatureReplacement,
    "the setSpeciesDetails signature",
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

if (
  !starterSource.includes(
    "switchMoveHandler(targetIndex: number, newMove: MoveId, previousMove: MoveId, starterIndexOverride?: number)",
  )
) {
  const switchMoveSignatureAnchor =
    "  switchMoveHandler(targetIndex: number, newMove: MoveId, previousMove: MoveId) {";
  const switchMoveSignatureReplacement =
    "  switchMoveHandler(targetIndex: number, newMove: MoveId, previousMove: MoveId, starterIndexOverride?: number) {";
  starterSource = replaceRequired(
    starterSource,
    switchMoveSignatureAnchor,
    switchMoveSignatureReplacement,
    "the switchMoveHandler signature",
  );

  const updateMovesSignatureAnchor =
    "  private updateSelectedStarterMoveset(id: SpeciesId): void {";
  const updateMovesSignatureReplacement =
    "  private updateSelectedStarterMoveset(id: SpeciesId, starterIndexOverride?: number): void {";
  starterSource = replaceRequired(
    starterSource,
    updateMovesSignatureAnchor,
    updateMovesSignatureReplacement,
    "the updateSelectedStarterMoveset signature",
  );
}

if (!starterSource.includes("const selectedIndex = starterIndexOverride ?? this.getEditableStarterIndex(species);")) {
  const movesAnchor = `    for (const [index, species] of this.starterSpecies.entries()) {
      if (species.speciesId === id) {
        this.starters[index].moveset = this.starterMoveset;
      }
    }`;
  const previouslyPatchedMovesAnchor = `    const species = speciesDataRegistry.getSpecies(id);
    const selectedIndex = this.getEditableStarterIndex(species);
    if (selectedIndex >= 0) {
      this.starters[selectedIndex].moveset = this.starterMoveset.slice() as StarterMoveset;
    }`;
  const movesReplacement = `    const species = speciesDataRegistry.getSpecies(id);
    const selectedIndex = starterIndexOverride ?? this.getEditableStarterIndex(species);
    if (selectedIndex >= 0) {
      this.starters[selectedIndex].moveset = this.starterMoveset.slice() as StarterMoveset;
    }`;
  const selectedMovesAnchor = starterSource.includes(previouslyPatchedMovesAnchor)
    ? previouslyPatchedMovesAnchor
    : movesAnchor;
  starterSource = replaceRequired(
    starterSource,
    selectedMovesAnchor,
    movesReplacement,
    "updateSelectedStarterMoveset's target selection",
  );
}

if (!starterSource.includes("this.switchMoveHandler(i, sm, m, editableStarterIndex);")) {
  starterSource = replaceRequired(
    starterSource,
    "                                            this.switchMoveHandler(i, sm, m);",
    "                                            this.switchMoveHandler(i, sm, m, editableStarterIndex);",
    "the starter move-swap callback",
  );
}

if (
  !starterSource.includes(
    "this.updateSelectedStarterMoveset(speciesId, starterIndexOverride);\n"
      + "    this.setSpeciesDetails(this.lastSpecies, { forSeen: false }, true, starterIndexOverride);",
  )
) {
  const moveRefreshAnchor = `    this.hasSwappedMoves = true;
    this.setSpeciesDetails(this.lastSpecies, { forSeen: false });
    this.updateSelectedStarterMoveset(speciesId);`;
  const moveRefreshReplacement = `    this.hasSwappedMoves = true;
    // Save the edited moveset to the captured copy before refreshing. Refreshing
    // first would reload that copy's old moves and discard the user's change.
    this.updateSelectedStarterMoveset(speciesId, starterIndexOverride);
    this.setSpeciesDetails(this.lastSpecies, { forSeen: false }, true, starterIndexOverride);`;
  starterSource = replaceRequired(
    starterSource,
    moveRefreshAnchor,
    moveRefreshReplacement,
    "the move-swap refresh order",
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
    "        const starterIndex = starterIndexOverride ?? this.getEditableStarterIndex(species);",
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

if (!starterSource.includes("const passiveEnabled =\n            editableStarterIndex >= 0")) {
  const passiveLabelAnchor = `          const passiveAttr = starterData.passiveAttr;
          if (passiveAttr & PassiveAttr.UNLOCKED) {
            // this is for enabling and disabling the passive
            const label = i18next.t(
              passiveAttr & PassiveAttr.ENABLED
                ? "starterSelectUiHandler:disablePassive"
                : "starterSelectUiHandler:enablePassive",
            );`;
  const passiveLabelReplacement = `          const passiveAttr = starterData.passiveAttr;
          const passiveEnabled =
            editableStarterIndex >= 0
              ? this.starters[editableStarterIndex].passive
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
                if (editableStarterIndex >= 0) {
                  this.starters[editableStarterIndex].passive = nextPassiveEnabled;
                }
                ui.setMode(UiMode.STARTER_SELECT);`;
  starterSource = replaceRequired(
    starterSource,
    passiveHandlerAnchor,
    passiveHandlerReplacement,
    "the per-copy passive toggle handler",
  );
}

if (!starterSource.includes("this.starters[editableStarterIndex].passive = true;")) {
  const unlockPassiveAnchor = `                    persistentStarterData.passiveAttr |= PassiveAttr.UNLOCKED | PassiveAttr.ENABLED;
                    starterData.passiveAttr = persistentStarterData.passiveAttr;`;
  const unlockPassiveReplacement = `${unlockPassiveAnchor}
                    if (editableStarterIndex >= 0) {
                      this.starters[editableStarterIndex].passive = true;
                    }`;
  starterSource = replaceRequired(
    starterSource,
    unlockPassiveAnchor,
    unlockPassiveReplacement,
    "the passive unlock handler",
  );
}

if (!starterSource.includes("const passiveStarterIndex = starterIndexOverride ?? this.getEditableStarterIndex(species);")) {
  const passiveDisplayAnchor = `          const isUnlocked = !!(passiveAttr & PassiveAttr.UNLOCKED);
          const isEnabled = !!(passiveAttr & PassiveAttr.ENABLED);`;
  const passiveDisplayReplacement = `          const isUnlocked = !!(passiveAttr & PassiveAttr.UNLOCKED);
          const passiveStarterIndex = starterIndexOverride ?? this.getEditableStarterIndex(species);
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
  const moveDataReplacement = `        const selectedStarterIndex = starterIndexOverride ?? this.getSelectedStarterIndex(species);
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

if (!starterSource.includes("// Keep form-adjusted moves on the same selected copy.")) {
  const movesetFinalizeAnchor = `    if (!this.starterMoveset) {
      this.starterMoveset = this.speciesStarterMoves.slice(0, 4) as StarterMoveset;
    }

    for (let m = 0; m < 4; m++) {`;
  const movesetFinalizeReplacement = `    if (!this.starterMoveset) {
      this.starterMoveset = this.speciesStarterMoves.slice(0, 4) as StarterMoveset;
    }

    // Keep form-adjusted moves on the same selected copy.
    this.updateSelectedStarterMoveset(species.speciesId, starterIndexOverride);

    for (let m = 0; m < 4; m++) {`;
  starterSource = replaceRequired(
    starterSource,
    movesetFinalizeAnchor,
    movesetFinalizeReplacement,
    "the finalized starter moveset",
  );
}

if (!starterSource.includes("const selectedNickname =")) {
  const renameSourceAnchor =
    '              let nickname = starterAttributes.nickname ? String(starterAttributes.nickname) : "";';
  const renameSourceReplacement = `              const selectedNickname =
                editableStarterIndex >= 0 ? this.starters[editableStarterIndex].nickname : starterAttributes.nickname;
              let nickname = selectedNickname ? String(selectedNickname) : "";`;
  starterSource = replaceRequired(
    starterSource,
    renameSourceAnchor,
    renameSourceReplacement,
    "the rename dialog's nickname source",
  );

  const renameWriteAnchor = `                      starterAttributes.nickname = sanitizedName;
                      originalStarterAttributes.nickname = sanitizedName;
                      const name = decodeURIComponent(escape(atob(starterAttributes.nickname)));`;
  const renameWriteReplacement = `                      starterAttributes.nickname = sanitizedName;
                      originalStarterAttributes.nickname = sanitizedName;
                      if (editableStarterIndex >= 0) {
                        this.starters[editableStarterIndex].nickname = sanitizedName;
                      }
                      const name = decodeURIComponent(escape(atob(sanitizedName)));`;
  starterSource = replaceRequired(
    starterSource,
    renameWriteAnchor,
    renameWriteReplacement,
    "the rename dialog's nickname update",
  );
}

if (!starterSource.includes("setSpecies(species: PokemonSpecies | null, starterIndexOverride?: number)")) {
  starterSource = replaceRequired(
    starterSource,
    "  setSpecies(species: PokemonSpecies | null) {",
    "  setSpecies(species: PokemonSpecies | null, starterIndexOverride?: number) {",
    "the setSpecies signature",
  );
}

if (
  !starterSource.includes(
    "const selectedStarterIndex = species == null ? -1 : (starterIndexOverride ?? this.getEditableStarterIndex(species));",
  )
) {
  const selectedStarterContextAnchor = `    const starterAttributes: StarterAttributes | null = species
      ? { ...this.starterPreferences[species.speciesId] }
      : null;`;
  const selectedStarterContextReplacement = `${selectedStarterContextAnchor}
    const selectedStarterIndex = species == null ? -1 : (starterIndexOverride ?? this.getEditableStarterIndex(species));
    const selectedStarter = selectedStarterIndex >= 0 ? this.starters[selectedStarterIndex] : null;`;
  starterSource = replaceRequired(
    starterSource,
    selectedStarterContextAnchor,
    selectedStarterContextReplacement,
    "the setSpecies selected-record context",
  );
}

if (!starterSource.includes("const displayedNickname = selectedStarter?.nickname ?? starterAttributes?.nickname;")) {
  const nicknameDisplayAnchor = `      if (starterAttributes?.nickname) {
        const name = decodeURIComponent(escape(atob(starterAttributes.nickname)));
        this.pokemonNameText.setText(name);
      } else {
        this.pokemonNameText.setText(species.name);
      }`;
  const nicknameDisplayReplacement = `      const displayedNickname = selectedStarter?.nickname ?? starterAttributes?.nickname;
      if (displayedNickname) {
        const name = decodeURIComponent(escape(atob(displayedNickname)));
        this.pokemonNameText.setText(name);
      } else {
        this.pokemonNameText.setText(species.name);
      }`;
  starterSource = replaceRequired(
    starterSource,
    nicknameDisplayAnchor,
    nicknameDisplayReplacement,
    "the displayed starter nickname",
  );
}

if (!starterSource.includes("defaultProps.formIndex = selectedStarter.formIndex;")) {
  const selectedDisplayPropsAnchor = `        const defaultDexAttr = this.getCurrentDexProps(species.speciesId);
        const defaultProps = globalScene.gameData.getSpeciesDexAttrProps(species, defaultDexAttr);
        const variant = defaultProps.variant;`;
  const selectedDisplayPropsReplacement = `        const defaultDexAttr = this.getCurrentDexProps(species.speciesId);
        const defaultProps = globalScene.gameData.getSpeciesDexAttrProps(species, defaultDexAttr);
        if (selectedStarter) {
          defaultProps.shiny = selectedStarter.shiny;
          defaultProps.variant = selectedStarter.variant;
          defaultProps.formIndex = selectedStarter.formIndex;
          defaultProps.female = selectedStarter.female ?? false;
        }
        const variant = defaultProps.variant;`;
  starterSource = replaceRequired(
    starterSource,
    selectedDisplayPropsAnchor,
    selectedDisplayPropsReplacement,
    "the selected record's shiny and form display properties",
  );
}

if (!starterSource.includes("if (selectedStarterIndex >= 0 && selectedStarter)")) {
  const selectedRecordAnchor = `        const starterIndex = this.getSelectedStarterIndex(species);

        const props = globalScene.gameData.getSpeciesDexAttrProps(species, defaultDexAttr);

        if (starterIndex > -1) {
          const starter = this.starters[starterIndex];
          this.setSpeciesDetails(
            species,
            {
              shiny: starter.shiny,
              formIndex: starter.formIndex,
              female: starter.female,
              variant: starter.variant,
              abilityIndex: starter.abilityIndex,
              natureIndex: starter.nature,
              teraType: starter.teraType,
            },
            false,
          );`;
  const selectedRecordReplacement = `        const props = defaultProps;

        if (selectedStarterIndex >= 0 && selectedStarter) {
          this.setSpeciesDetails(
            species,
            {
              shiny: selectedStarter.shiny,
              formIndex: selectedStarter.formIndex,
              female: selectedStarter.female,
              variant: selectedStarter.variant,
              abilityIndex: selectedStarter.abilityIndex,
              natureIndex: selectedStarter.nature,
              teraType: selectedStarter.teraType,
            },
            false,
            selectedStarterIndex,
          );`;
  starterSource = replaceRequired(
    starterSource,
    selectedRecordAnchor,
    selectedRecordReplacement,
    "the selected record's setSpecies display",
  );
}

if (!starterSource.includes("this.updateSelectedStarterMoveset(species.speciesId, selectedStarterIndex);")) {
  starterSource = replaceRequired(
    starterSource,
    "          this.updateSelectedStarterMoveset(species.speciesId);",
    "          this.updateSelectedStarterMoveset(species.speciesId, selectedStarterIndex);",
    "the setSpecies moveset synchronization",
  );
}

if (!starterSource.includes("const displayedFormIndex = selectedStarter?.formIndex ?? props.formIndex;")) {
  const displayedFormAnchor = `        if (props.formIndex != null) {
          // If switching forms while the pokemon is in the team, update its moveset
          this.updateSelectedStarterMoveset(species.speciesId, selectedStarterIndex);
        }

        const speciesForm = getPokemonSpeciesForm(species.speciesId, props.formIndex);`;
  const displayedFormReplacement = `        const displayedFormIndex = selectedStarter?.formIndex ?? props.formIndex;
        if (displayedFormIndex != null) {
          // If switching forms while the pokemon is in the team, update its moveset
          this.updateSelectedStarterMoveset(species.speciesId, selectedStarterIndex);
        }

        const speciesForm = getPokemonSpeciesForm(species.speciesId, displayedFormIndex);`;
  starterSource = replaceRequired(
    starterSource,
    displayedFormAnchor,
    displayedFormReplacement,
    "the selected record's displayed form",
  );
}

if (!starterSource.includes("              teraType: starterAttributes?.tera,\n            },\n            false,\n            selectedStarterIndex,")) {
  const defaultDetailsAnchor = `              teraType: starterAttributes?.tera,
            },
            false,
          );`;
  const defaultDetailsReplacement = `              teraType: starterAttributes?.tera,
            },
            false,
            selectedStarterIndex,
          );`;
  starterSource = replaceRequired(
    starterSource,
    defaultDetailsAnchor,
    defaultDetailsReplacement,
    "the next-copy default setSpeciesDetails call",
  );
}

if (!starterSource.includes("              teraType: selectedStarter.teraType,")) {
  const staleSelectedDetailsAnchor = `              teraType: starter.teraType,
            },
            false,
            starterIndex,
          );`;
  const staleSelectedDetailsReplacement = `              teraType: selectedStarter.teraType,
            },
            false,
            selectedStarterIndex,
          );`;
  starterSource = replaceRequired(
    starterSource,
    staleSelectedDetailsAnchor,
    staleSelectedDetailsReplacement,
    "a previously patched setSpeciesDetails call",
  );
}

if (!starterSource.includes("this.setSpecies(this.lastSpecies, editableStarterIndex);")) {
  const pokedexAttributesAnchor = `                const attributes = {
                  shiny: starterAttributes.shiny,
                  variant: starterAttributes.variant,
                  form: starterAttributes.form,
                  female: starterAttributes.female,
                };`;
  const pokedexAttributesReplacement = `                const currentProps = globalScene.gameData.getSpeciesDexAttrProps(this.lastSpecies, this.dexAttrCursor);
                const attributes = {
                  shiny: currentProps.shiny,
                  variant: currentProps.variant,
                  form: currentProps.formIndex,
                  female: currentProps.female,
                };`;
  starterSource = replaceRequired(
    starterSource,
    pokedexAttributesAnchor,
    pokedexAttributesReplacement,
    "the Pokédex overlay's current starter attributes",
  );

  const pokedexReturnAnchor = `                    this.setSpecies(this.lastSpecies);
                  }
                });`;
  const pokedexReturnReplacement = `                    this.setSpecies(this.lastSpecies, editableStarterIndex);
                  }
                });`;
  starterSource = replaceRequired(
    starterSource,
    pokedexReturnAnchor,
    pokedexReturnReplacement,
    "the Pokédex return callback",
  );
}

if (
  !starterSource.includes(
    "        const props = globalScene.gameData.getSpeciesDexAttrProps(this.lastSpecies, this.dexAttrCursor);\n"
      + "        switch (button)",
  )
) {
  const cyclePropsAnchor = `        const props = globalScene.gameData.getSpeciesDexAttrProps(
          this.lastSpecies,
          this.getCurrentDexProps(this.lastSpecies.speciesId),
        );
        switch (button)`;
  const cyclePropsReplacement = `        const props = globalScene.gameData.getSpeciesDexAttrProps(this.lastSpecies, this.dexAttrCursor);
        switch (button)`;
  starterSource = replaceRequired(
    starterSource,
    cyclePropsAnchor,
    cyclePropsReplacement,
    "the current editable starter properties",
  );
}

if (!starterSource.includes("              if (props.shiny === false) {")) {
  starterSource = replaceRequired(
    starterSource,
    "              if (starterAttributes.shiny === false) {",
    "              if (props.shiny === false) {",
    "the selected copy's shiny state",
  );
}

if (!starterSource.includes("                const newVariant = props.variant;")) {
  const shinyVariantAnchor = `                const newProps = globalScene.gameData.getSpeciesDexAttrProps(
                  this.lastSpecies,
                  this.getCurrentDexProps(this.lastSpecies.speciesId),
                );
                const newVariant = starterAttributes.variant
                  ? (starterAttributes.variant as Variant)
                  : newProps.variant;`;
  const shinyVariantReplacement = "                const newVariant = props.variant;";
  starterSource = replaceRequired(
    starterSource,
    shinyVariantAnchor,
    shinyVariantReplacement,
    "the selected copy's shiny variant",
  );
}

if (
  !starterSource.includes(
    "              const speciesForm = getPokemonSpeciesForm(this.lastSpecies.speciesId, props.formIndex);",
  )
) {
  starterSource = replaceRequired(
    starterSource,
    "              const speciesForm = getPokemonSpeciesForm(this.lastSpecies.speciesId, starterAttributes.form ?? 0);",
    "              const speciesForm = getPokemonSpeciesForm(this.lastSpecies.speciesId, props.formIndex);",
    "the selected copy's form for Tera cycling",
  );
}

if (
  !starterSource.includes(
    "                                natureIndex: n,\n"
      + "                              },\n"
      + "                              true,\n"
      + "                              editableStarterIndex,",
  )
) {
  const natureMenuRefreshAnchor = `                            this.setSpeciesDetails(this.lastSpecies, {
                              natureIndex: n,
                            });`;
  const natureMenuRefreshReplacement = `                            this.setSpeciesDetails(
                              this.lastSpecies,
                              {
                                natureIndex: n,
                              },
                              true,
                              editableStarterIndex,
                            );`;
  starterSource = replaceRequired(
    starterSource,
    natureMenuRefreshAnchor,
    natureMenuRefreshReplacement,
    "the nested nature-menu refresh",
  );
}

const passiveRefreshAnchor = `                ui.setMode(UiMode.STARTER_SELECT);
                this.setSpeciesDetails(this.lastSpecies);`;
const passiveRefreshReplacement = `                ui.setMode(UiMode.STARTER_SELECT);
                this.setSpeciesDetails(this.lastSpecies, {}, true, editableStarterIndex);`;
if (starterSource.includes(passiveRefreshAnchor)) {
  starterSource = replaceRequired(
    starterSource,
    passiveRefreshAnchor,
    passiveRefreshReplacement,
    "the passive-toggle refresh",
  );
}

const unlockPassiveRefreshAnchor = `                    ui.setMode(UiMode.STARTER_SELECT);
                    this.setSpeciesDetails(this.lastSpecies);
                    audioManager.playSound("se/buy");`;
const unlockPassiveRefreshReplacement = `                    ui.setMode(UiMode.STARTER_SELECT);
                    this.setSpeciesDetails(this.lastSpecies, {}, true, editableStarterIndex);
                    audioManager.playSound("se/buy");`;
if (starterSource.includes(unlockPassiveRefreshAnchor)) {
  starterSource = replaceRequired(
    starterSource,
    unlockPassiveRefreshAnchor,
    unlockPassiveRefreshReplacement,
    "the passive-unlock refresh",
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

const requiredPerCopyBehavior = [
  ["const editableStarterIndex = this.getEditableStarterIndex(this.lastSpecies);", "stable edit-slot capture"],
  ["this.switchMoveHandler(i, sm, m, editableStarterIndex);", "move-menu slot forwarding"],
  ["this.updateSelectedStarterMoveset(speciesId, starterIndexOverride);", "move update before refresh"],
  ["// Keep form-adjusted moves on the same selected copy.", "form-adjusted moveset synchronization"],
  ["const selectedIndex = starterIndexOverride ?? this.getEditableStarterIndex(species);", "moveset target"],
  ["starter.shiny = props.shiny;", "shiny record update"],
  ["starter.variant = props.variant;", "variant record update"],
  ["starter.female = props.female;", "gender record update"],
  ["starter.formIndex = props.formIndex;", "form record update"],
  ["starter.abilityIndex = this.abilityCursor;", "ability record update"],
  ["starter.nature = this.natureCursor;", "nature record update"],
  ["starter.teraType = this.teraCursor;", "Tera record update"],
  ["this.starters[editableStarterIndex].passive = nextPassiveEnabled;", "passive record update"],
  ["this.starters[editableStarterIndex].nickname = sanitizedName;", "nickname record update"],
  ["starterIndexOverride ?? this.getSelectedStarterIndex(species);", "moveset record source"],
  ["selectedStarter?.nickname ?? starterAttributes?.nickname", "nickname record source"],
  ["const displayedFormIndex = selectedStarter?.formIndex ?? props.formIndex;", "form record display"],
];
for (const [snippet, description] of requiredPerCopyBehavior) {
  if (!starterSource.includes(snippet)) {
    fail(`Missing ${description}; refusing to leave duplicate starter state partially shared.`);
  }
}

const forbiddenSpeciesWideBehavior = [
  ["this.starterSpecies.indexOf(species)", "species-first starter lookup"],
  ["this.switchMoveHandler(i, sm, m);", "move callback without a captured slot"],
  ["this.setSpeciesDetails(this.lastSpecies, { forSeen: false });\n    this.updateSelectedStarterMoveset(speciesId);",
    "move refresh before record update"],
  ["              if (starterAttributes.shiny === false) {", "species-preference shiny cycle"],
  ["              const speciesForm = getPokemonSpeciesForm(this.lastSpecies.speciesId, starterAttributes.form ?? 0);",
    "species-preference form cycle"],
];
for (const [snippet, description] of forbiddenSpeciesWideBehavior) {
  if (starterSource.includes(snippet)) {
    fail(`A stale ${description} remains after patching.`);
  }
}

fs.writeFileSync(starterSelectTarget, starterSource, "utf8");
console.log("Enabled independent duplicate starter selection and editing.");
console.log("Duplicate starters patch applied successfully.");
