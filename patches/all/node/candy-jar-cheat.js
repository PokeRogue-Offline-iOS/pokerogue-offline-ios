#!/usr/bin/env node

/**
 * Add a live, exact Candy Jar count cheat.
 *
 * The Offline settings row is an action rather than a left/right toggle. It
 * opens the game's native scrolling option picker so keyboard, controller,
 * touch, and console builds all use the same input path. The saved value is
 * applied to new runs; an active run displays and edits its real modifier
 * stack. Loaded runs are never overwritten merely by loading settings.
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

function insertAfterUniquePattern(source, pattern, addition, description) {
  const matches = [...source.matchAll(new RegExp(pattern.source, "g"))];
  if (matches.length !== 1) {
    fail(`Expected exactly one ${description}, found ${matches.length}.`);
  }
  return source.replace(matches[0][0], `${matches[0][0]}\n${addition}`);
}

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);

if (!settingsSource.includes("Offline_Candy_Jar_Count")) {
  settingsSource = replaceRequired(
    settingsSource,
    '  Offline_Exp_Multiplier: "OFFLINE_EXP_MULTIPLIER",',
    `  Offline_Exp_Multiplier: "OFFLINE_EXP_MULTIPLIER",
  Offline_Candy_Jar_Count: "OFFLINE_CANDY_JAR_COUNT",`,
    "the Offline EXP multiplier setting key",
  );
}

if (!settingsSource.includes("  directValue?: boolean;")) {
  settingsSource = replaceRequired(
    settingsSource,
    `  /** Whether the setting can be activated or not */
  activatable?: boolean;`,
    `  /** Whether the setting can be activated or not */
  activatable?: boolean;
  /** Store the supplied number directly instead of treating it as an option index. */
  directValue?: boolean;`,
    "the Setting activatable field",
  );
}

if (!settingsSource.includes('label: "Candy Jar Count"')) {
  const candyJarRow = `  {
    key: SettingKeys.Offline_Candy_Jar_Count,
    label: "Candy Jar Count",
    options: [{ value: "0", label: "0" }],
    default: 0,
    type: SettingType.APP,
    activatable: true,
    directValue: true,
  },`;
  settingsSource = insertAfterUniquePattern(
    settingsSource,
    /  \{\n    key: SettingKeys\.Offline_Exp_Multiplier,[\s\S]*?\n  \},/,
    candyJarRow,
    "EXP multiplier settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Candy_Jar_Count:")) {
  const expCase = `    case SettingKeys.Offline_Exp_Multiplier:
      activeOverrides.EXP_GAIN_MULTIPLIER_OVERRIDE = Number(Setting[index].options[value].value);
      break;`;
  const candyJarCase = `${expCase}
    case SettingKeys.Offline_Candy_Jar_Count:
      activeOverrides.STARTING_CANDY_JAR_COUNT_OVERRIDE = Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(0, Math.floor(Number(value) || 0)),
      );
      break;`;
  settingsSource = replaceRequired(settingsSource, expCase, candyJarCase, "the EXP multiplier setting case");
}
writeFile(settingsPath, settingsSource);

const overridesPath = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readFile(overridesPath);
if (!overridesSource.includes("STARTING_CANDY_JAR_COUNT_OVERRIDE")) {
  const expOverride = `  /** Multiplies each party member's calculated EXP gain. */
  readonly EXP_GAIN_MULTIPLIER_OVERRIDE: number = 1;`;
  const candyJarOverride = `${expOverride}
  /** Exact Candy Jar count assigned when a new run begins. */
  readonly STARTING_CANDY_JAR_COUNT_OVERRIDE: number = 0;`;
  overridesSource = replaceRequired(overridesSource, expOverride, candyJarOverride, "the EXP gain override");
}
writeFile(overridesPath, overridesSource);

const baseSettingsPath = path.join("pokerogue-src", "src", "ui", "settings", "base-settings-ui-handler.ts");
let baseSettingsSource = readFile(baseSettingsPath);
if (!baseSettingsSource.includes("setting.directValue ? setting.default : savedValue")) {
  const showAnchor = `    this.settings.forEach((setting, s) => {
      this.setOptionCursor(s, Object.hasOwn(settings, setting.key) ? settings[setting.key] : this.settings[s].default);
    });`;
  const showReplacement = `    this.settings.forEach((setting, s) => {
      const savedValue = Object.hasOwn(settings, setting.key) ? settings[setting.key] : this.settings[s].default;
      this.setOptionCursor(s, setting.directValue ? setting.default : savedValue);
    });`;
  baseSettingsSource = replaceRequired(baseSettingsSource, showAnchor, showReplacement, "the saved settings cursor loop");
}
writeFile(baseSettingsPath, baseSettingsSource);

const uiTypesPath = path.join("pokerogue-src", "src", "@types", "ui-types.ts");
let uiTypesSource = readFile(uiTypesPath);
if (!uiTypesSource.includes("initialCursor?: number;")) {
  uiTypesSource = replaceRequired(
    uiTypesSource,
    `  supportHover?: boolean;
}`,
    `  supportHover?: boolean;
  /** Initial full-list cursor used by native scrolling pickers. */
  initialCursor?: number;
  /** Avoid rebuilding off-screen labels for unusually large native lists. */
  measureVisibleOptionsOnly?: boolean;
}`,
    "the OptionSelectConfig supportHover field",
  );
}
if (!uiTypesSource.includes("pageStep?: number;")) {
  uiTypesSource = replaceRequired(
    uiTypesSource,
    `  /** Avoid rebuilding off-screen labels for unusually large native lists. */
  measureVisibleOptionsOnly?: boolean;`,
    `  /** Avoid rebuilding off-screen labels for unusually large native lists. */
  measureVisibleOptionsOnly?: boolean;
  /** Optional left/right jump size for long native lists. */
  pageStep?: number;`,
    "the OptionSelectConfig large-list field",
  );
}
if (!uiTypesSource.includes("pageStepMaxIndex?: number;")) {
  uiTypesSource = replaceRequired(
    uiTypesSource,
    `  /** Optional left/right jump size for long native lists. */
  pageStep?: number;`,
    `  /** Optional left/right jump size for long native lists. */
  pageStep?: number;
  /** Optional inclusive bounds for left/right page jumps. */
  pageStepMinIndex?: number;
  pageStepMaxIndex?: number;
  /** Set false when Up/Down must stop at the list boundaries. */
  wrapNavigation?: boolean;`,
    "the OptionSelectConfig page navigation bounds",
  );
}
writeFile(uiTypesPath, uiTypesSource);

const optionSelectPath = path.join("pokerogue-src", "src", "ui", "handlers", "base-option-select-ui-handler.ts");
let optionSelectSource = readFile(optionSelectPath);
if (!optionSelectSource.includes("measureVisibleOptionsOnly ? optionsWithScroll")) {
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `    this.unskippedIndices = this.getUnskippedIndices(configOptions);

    if (this.optionSelectText) {`,
    `    if (!this.config?.measureVisibleOptionsOnly) {
      this.unskippedIndices = this.getUnskippedIndices(configOptions);
    }

    if (this.optionSelectText) {`,
    "the option select unskipped-index refresh",
  );
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `    const optionsForWidth = globalScene.ui.getMode() === UiMode.AUTO_COMPLETE ? optionsWithScroll : options;`,
    `    const optionsForWidth =
      globalScene.ui.getMode() === UiMode.AUTO_COMPLETE || this.config?.measureVisibleOptionsOnly
        ? optionsWithScroll
        : options;`,
    "the option select width option source",
  );
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `    options.forEach((option: OptionSelectItem, i: number) => {`,
    `    const iconOptions = this.config?.measureVisibleOptionsOnly ? optionsWithScroll : options;
    iconOptions.forEach((option: OptionSelectItem, i: number) => {`,
    "the option select icon iteration",
  );
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `    this.config = args[0] as OptionSelectConfig;
    this.setupOptions();

    globalScene.ui.bringToTop(this.optionSelectContainer);

    this.optionSelectContainer.setVisible(true);
    this.scrollCursor = 0;
    this.fullCursor = 0;
    this.setCursor(0);`,
    `    this.config = args[0] as OptionSelectConfig;
    this.unskippedIndices = this.getUnskippedIndices(this.config.options);

    globalScene.ui.bringToTop(this.optionSelectContainer);

    this.optionSelectContainer.setVisible(true);
    this.scrollCursor = 0;
    this.fullCursor = 0;
    const initialCursor = Phaser.Math.Clamp(this.config.initialCursor ?? 0, 0, this.unskippedIndices.length - 1);
    this.setCursor(initialCursor);`,
    "the option select show initialization",
  );

  const scrollAnchor = `    const options = this.config.options.slice(0);

    if (!this.config.maxOptions || this.config.options.length < this.config.maxOptions) {
      return options;
    }

    const optionsScrollTotal = options.length;`;
  const scrollReplacement = `    if (!this.config.maxOptions || this.config.options.length < this.config.maxOptions) {
      return this.config.options.slice(0);
    }

    const optionsScrollTotal = this.config.options.length;`;
  optionSelectSource = replaceRequired(optionSelectSource, scrollAnchor, scrollReplacement, "the scrolling option list copy");
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `    if (this.config?.maxOptions && options.length > this.config.maxOptions) {
      options.splice(optionEndIndex, optionsScrollTotal);
      options.splice(0, optionStartIndex);`,
    `    const options = this.config.options.slice(optionStartIndex, optionEndIndex);

    if (this.config?.maxOptions && optionsScrollTotal > this.config.maxOptions) {`,
    "the scrolling option list slice",
  );
}
if (!optionSelectSource.includes("direction * this.config.pageStep")) {
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `        case Button.DOWN:
          if (this.fullCursor < this.unskippedIndices.length - 1) {
            success = this.setCursor(this.fullCursor + 1);
          } else {
            success = this.setCursor(0);
          }
          break;`,
    `        case Button.DOWN:
          if (this.fullCursor < this.unskippedIndices.length - 1) {
            success = this.setCursor(this.fullCursor + 1);
          } else {
            success = this.setCursor(0);
          }
          break;
        case Button.LEFT:
        case Button.RIGHT:
          if (this.config?.pageStep) {
            const direction = button === Button.LEFT ? -1 : 1;
            success = this.setCursor(
              Phaser.Math.Clamp(
                this.fullCursor + direction * this.config.pageStep,
                0,
                this.unskippedIndices.length - 1,
              ),
            );
          }
          break;`,
    "the native option picker directional input",
  );
}
if (!optionSelectSource.includes("this.config?.wrapNavigation !== false")) {
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `        case Button.UP:
          if (this.fullCursor === 0) {
            success = this.setCursor(this.unskippedIndices.length - 1);
          } else if (this.fullCursor) {
            success = this.setCursor(this.fullCursor - 1);
          }
          break;
        case Button.DOWN:
          if (this.fullCursor < this.unskippedIndices.length - 1) {
            success = this.setCursor(this.fullCursor + 1);
          } else {
            success = this.setCursor(0);
          }
          break;`,
    `        case Button.UP:
          if (this.fullCursor === 0) {
            if (this.config?.wrapNavigation !== false) {
              success = this.setCursor(this.unskippedIndices.length - 1);
            }
          } else if (this.fullCursor) {
            success = this.setCursor(this.fullCursor - 1);
          }
          break;
        case Button.DOWN:
          if (this.fullCursor < this.unskippedIndices.length - 1) {
            success = this.setCursor(this.fullCursor + 1);
          } else if (this.config?.wrapNavigation !== false) {
            success = this.setCursor(0);
          }
          break;`,
    "the native option picker boundary behavior",
  );
}
if (!optionSelectSource.includes("this.config.pageStepMaxIndex ??")) {
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `                this.fullCursor + direction * this.config.pageStep,
                0,
                this.unskippedIndices.length - 1,`,
    `                this.fullCursor + direction * this.config.pageStep,
                this.config.pageStepMinIndex ?? 0,
                this.config.pageStepMaxIndex ?? this.unskippedIndices.length - 1,`,
    "the native option picker page bounds",
  );
}
if (!optionSelectSource.includes("const pageStepTarget")) {
  optionSelectSource = replaceRequired(
    optionSelectSource,
    `            success = this.setCursor(
              Phaser.Math.Clamp(
                this.fullCursor + direction * this.config.pageStep,
                this.config.pageStepMinIndex ?? 0,
                this.config.pageStepMaxIndex ?? this.unskippedIndices.length - 1,
              ),
            );`,
    `            const minimum = this.config.pageStepMinIndex ?? 0;
            const maximum = this.config.pageStepMaxIndex ?? this.unskippedIndices.length - 1;
            const pageStepTarget =
              direction < 0 && this.fullCursor < minimum
                ? this.fullCursor
                : Phaser.Math.Clamp(this.fullCursor + direction * this.config.pageStep, minimum, maximum);
            success = this.setCursor(pageStepTarget);`,
    "the bounded native option picker page target",
  );
}
writeFile(optionSelectPath, optionSelectSource);

const modifierPath = path.join("pokerogue-src", "src", "modifier", "modifier.ts");
let modifierSource = readFile(modifierPath);
if (!modifierSource.includes("setPlayerCandyJarCount")) {
  const candyJarClass = `export class LevelIncrementBoosterModifier extends PersistentModifier {
  match(modifier: Modifier) {
    return modifier instanceof LevelIncrementBoosterModifier;
  }

  clone() {
    return new LevelIncrementBoosterModifier(this.type, this.stackCount);
  }

  /**
   * Checks if {@linkcode LevelIncrementBoosterModifier} should be applied
   * @param count {@linkcode NumberHolder} holding the level increment count
   * @returns \`true\` if {@linkcode LevelIncrementBoosterModifier} should be applied
   */
  override shouldApply(count: NumberHolder): boolean {
    return !!count;
  }

  /**
   * Applies {@linkcode LevelIncrementBoosterModifier}
   * @param count {@linkcode NumberHolder} holding the level increment count
   * @returns always \`true\`
   */
  override apply(count: NumberHolder): boolean {
    count.value += this.getStackCount();

    return true;
  }

  getMaxStackCount(_forThreshold?: boolean): number {
    return 99;
  }
}`;
  const candyJarReplacement = `export class LevelIncrementBoosterModifier extends PersistentModifier {
  match(modifier: Modifier) {
    return modifier instanceof LevelIncrementBoosterModifier;
  }

  clone() {
    return new LevelIncrementBoosterModifier(this.type, this.stackCount);
  }

  /**
   * Checks if {@linkcode LevelIncrementBoosterModifier} should be applied
   * @param count {@linkcode NumberHolder} holding the level increment count
   * @returns \`true\` if {@linkcode LevelIncrementBoosterModifier} should be applied
   */
  override shouldApply(count: NumberHolder): boolean {
    return !!count;
  }

  /**
   * Applies {@linkcode LevelIncrementBoosterModifier}
   * @param count {@linkcode NumberHolder} holding the level increment count
   * @returns always \`true\`
   */
  override apply(count: NumberHolder): boolean {
    count.value += this.getStackCount();

    return true;
  }

  getMaxStackCount(_forThreshold?: boolean): number {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Return the real Candy Jar stack owned by the active player run. */
export function getPlayerCandyJarCount(): number {
  return globalScene.modifiers.find(modifier => modifier instanceof LevelIncrementBoosterModifier)?.stackCount ?? 0;
}

/** Replace the active player's Candy Jar stack with an exact non-negative count. */
export function setPlayerCandyJarCount(count: number): void {
  const normalizedCount = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(count) || 0)));
  const candyJar = globalScene.modifiers.find(modifier => modifier instanceof LevelIncrementBoosterModifier) as
    | LevelIncrementBoosterModifier
    | undefined;

  if (candyJar) {
    if (normalizedCount === 0) {
      globalScene.removeModifier(candyJar);
    } else {
      candyJar.stackCount = normalizedCount;
    }
  } else if (normalizedCount > 0) {
    const newCandyJar = modifierTypes
      .CANDY_JAR()
      .withIdFromFunc(modifierTypes.CANDY_JAR)
      .newModifier() as LevelIncrementBoosterModifier;
    newCandyJar.stackCount = normalizedCount;
    globalScene.addModifier(newCandyJar, true, false, false, true);
  }

  globalScene.updateModifiers(true, true);
}

/** Apply the configured exact count only at a new-run boundary. */
export function applyStartingCandyJarCountOverride(): void {
  setPlayerCandyJarCount(activeOverrides.STARTING_CANDY_JAR_COUNT_OVERRIDE);
}`;
  modifierSource = replaceRequired(modifierSource, candyJarClass, candyJarReplacement, "the Candy Jar modifier class");
}
writeFile(modifierPath, modifierSource);

const selectStarterPath = path.join("pokerogue-src", "src", "phases", "select-starter-phase.ts");
let selectStarterSource = readFile(selectStarterPath);
if (!selectStarterSource.includes("applyStartingCandyJarCountOverride")) {
  selectStarterSource = replaceRequired(
    selectStarterSource,
    'import { overrideHeldItems, overrideModifiers } from "#modifiers/modifier";',
    'import { applyStartingCandyJarCountOverride, overrideHeldItems, overrideModifiers } from "#modifiers/modifier";',
    "the SelectStarterPhase modifier import",
  );
  selectStarterSource = replaceRequired(
    selectStarterSource,
    `    overrideModifiers();
    overrideHeldItems(party[0]);`,
    `    overrideModifiers();
    applyStartingCandyJarCountOverride();
    overrideHeldItems(party[0]);`,
    "the standard new-run modifier initialization",
  );
}
writeFile(selectStarterPath, selectStarterSource);

const titlePath = path.join("pokerogue-src", "src", "phases", "title-phase.ts");
let titleSource = readFile(titlePath);
if (!titleSource.includes("applyStartingCandyJarCountOverride")) {
  titleSource = replaceRequired(
    titleSource,
    'import type { Modifier } from "#modifiers/modifier";',
    'import { applyStartingCandyJarCountOverride, type Modifier } from "#modifiers/modifier";',
    "the TitlePhase modifier import",
  );
  titleSource = replaceRequired(
    titleSource,
    `        globalScene.updateModifiers(true, true);

        Promise.all(loadPokemonAssets).then(async () => {`,
    `        applyStartingCandyJarCountOverride();

        Promise.all(loadPokemonAssets).then(async () => {`,
    "the daily-run starting modifier update",
  );
}
writeFile(titlePath, titleSource);

const offlineSettingsPath = path.join("pokerogue-src", "src", "ui", "settings", "offline-settings-ui-handler.ts");
let offlineSettingsSource = readFile(offlineSettingsPath);
if (!offlineSettingsSource.includes("handleCandyJarCountPress")) {
  if (!offlineSettingsSource.includes('import { globalScene } from "#app/global-scene";')) {
    offlineSettingsSource = replaceRequired(
      offlineSettingsSource,
      'import { UiMode } from "#enums/ui-mode";',
      'import { globalScene } from "#app/global-scene";\nimport { UiMode } from "#enums/ui-mode";',
      "the Offline settings UiMode import",
    );
  }
  if (!offlineSettingsSource.includes('import { activeOverrides } from "#app/overrides";')) {
    offlineSettingsSource = replaceRequired(
      offlineSettingsSource,
      'import { globalScene } from "#app/global-scene";',
      'import { globalScene } from "#app/global-scene";\nimport { activeOverrides } from "#app/overrides";',
      "the Offline settings globalScene import",
    );
  }
  if (!offlineSettingsSource.includes('from "#modifiers/modifier";')) {
    offlineSettingsSource = replaceRequired(
      offlineSettingsSource,
      'import { UiMode } from "#enums/ui-mode";',
      'import { UiMode } from "#enums/ui-mode";\nimport { getPlayerCandyJarCount, setPlayerCandyJarCount } from "#modifiers/modifier";',
      "the Offline settings modifier import",
    );
  }
  if (!offlineSettingsSource.includes('import type { OptionSelectItem } from "#types/ui-types";')) {
    offlineSettingsSource = replaceRequired(
      offlineSettingsSource,
      'import { SettingKeys, SettingType } from "#system/settings";',
      'import { SettingKeys, SettingType } from "#system/settings";\nimport type { OptionSelectItem } from "#types/ui-types";',
      "the Offline settings system import",
    );
  }
  offlineSettingsSource = replaceRequired(
    offlineSettingsSource,
    `    const result = super.show(args);`,
    `    const result = super.show(args);
    this.setRowText(SettingKeys.Offline_Candy_Jar_Count, this.getDisplayedCandyJarCount().toLocaleString());`,
    "the Offline settings super.show call",
  );
  offlineSettingsSource = replaceRequired(
    offlineSettingsSource,
    `      case SettingKeys.Offline_Clear_Data:
        this.handleClearDataPress();
        return true;`,
    `      case SettingKeys.Offline_Clear_Data:
        this.handleClearDataPress();
        return true;
      case SettingKeys.Offline_Candy_Jar_Count:
        this.handleCandyJarCountPress();
        return true;`,
    "the Offline setting activation switch",
  );

  const classEndAnchor = `  private handleClearDataPress(): void {`;
  const candyJarMethods = `  private hasActiveRun(): boolean {
    return !!globalScene.currentBattle && globalScene.getPlayerParty().length > 0;
  }

  private getDisplayedCandyJarCount(): number {
    return this.hasActiveRun() ? getPlayerCandyJarCount() : activeOverrides.STARTING_CANDY_JAR_COUNT_OVERRIDE;
  }

  private handleCandyJarCountPress(): void {
    const maxPickerCount = 9999;
    const currentCount = this.getDisplayedCandyJarCount();
    const chooseCount = (count: number): boolean => {
      globalScene.gameData.saveSetting(SettingKeys.Offline_Candy_Jar_Count, count);
      if (this.hasActiveRun()) {
        setPlayerCandyJarCount(count);
      }
      this.setRowText(SettingKeys.Offline_Candy_Jar_Count, count.toLocaleString());
      globalScene.ui.revertMode();
      return true;
    };
    const cancel = (): boolean => {
      globalScene.ui.revertMode();
      return true;
    };
    const options: OptionSelectItem[] = Array.from({ length: maxPickerCount + 1 }, (_, count) => ({
      label: count.toLocaleString(),
      handler: () => chooseCount(count),
    }));
    options.push({ label: "Cancel", handler: cancel });

    globalScene.ui.setOverlayMode(UiMode.OPTION_SELECT, {
      options,
      maxOptions: 7,
      initialCursor: Math.min(currentCount, maxPickerCount),
      measureVisibleOptionsOnly: true,
      pageStep: 10,
      pageStepMinIndex: 0,
      pageStepMaxIndex: maxPickerCount,
      wrapNavigation: false,
    });
  }

`;
  offlineSettingsSource = replaceRequired(
    offlineSettingsSource,
    classEndAnchor,
    `${candyJarMethods}${classEndAnchor}`,
    "the Offline clear-data handler",
  );
}
if (offlineSettingsSource.includes("pageStep: 100,")) {
  offlineSettingsSource = offlineSettingsSource.replace(
    `      maxOptions: 12,
      initialCursor: Math.min(currentCount, maxPickerCount),
      measureVisibleOptionsOnly: true,
      pageStep: 100,`,
    `      maxOptions: 7,
      initialCursor: Math.min(currentCount, maxPickerCount),
      measureVisibleOptionsOnly: true,
      pageStep: 10,
      pageStepMinIndex: 0,
      pageStepMaxIndex: maxPickerCount,
      wrapNavigation: false,`,
  );
}
writeFile(offlineSettingsPath, offlineSettingsSource);

for (const marker of [
  "Offline_Candy_Jar_Count",
  "STARTING_CANDY_JAR_COUNT_OVERRIDE",
  "setPlayerCandyJarCount",
  "initialCursor",
  "measureVisibleOptionsOnly",
  "pageStep",
  "pageStepMaxIndex",
  "wrapNavigation",
]) {
  const combined = [settingsSource, overridesSource, modifierSource, uiTypesSource, optionSelectSource, offlineSettingsSource].join("\n");
  if (!combined.includes(marker)) {
    fail(`Missing Candy Jar cheat marker: ${marker}`);
  }
}

console.log("Live Candy Jar count cheat applied successfully.");
