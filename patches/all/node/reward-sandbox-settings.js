#!/usr/bin/env node

/**
 * Extend Claim All Rewards into a mutually exclusive reward-claim mode and add
 * an optional fast reward UI.
 *
 * Reward Claim Mode:
 * - Default: upstream one-reward behavior.
 * - Claim All: each generated reward slot can be claimed once.
 * - Infinite: repeat successful rewards; cap/unique rewards become claimed
 *   when the game's own stack/eligibility rules say they are exhausted.
 *
 * Fast Reward UI reuses the existing reward cards for rerolls and multi-claim
 * completion. It does not remove gameplay phases such as move learning,
 * evolution, or level-up processing.
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
      + "The upstream Pokemon Rogue source or an earlier offline patch may have changed.",
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

if (!settingsSource.includes("Offline_Claim_All_Rewards")) {
  fail("reward-sandbox-settings.js must run after claim-all-rewards.js.");
}

if (!settingsSource.includes("Offline_Fast_Reward_UI")) {
  const keyAnchor =
    '  Offline_Claim_All_Rewards: "OFFLINE_CLAIM_ALL_REWARDS",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}
  Offline_Fast_Reward_UI: "OFFLINE_FAST_REWARD_UI",`,
    "the Claim All Rewards setting key",
  );
}

if (!settingsSource.includes('label: "Reward Claim Mode"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Claim_All_Rewards,
    label: "Claim All Rewards",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`;
  const rowReplacement = `  {
    key: SettingKeys.Offline_Claim_All_Rewards,
    label: "Reward Claim Mode",
    options: [
      { value: "0", label: "Default" },
      { value: "1", label: "Claim All" },
      { value: "2", label: "Infinite" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Fast_Reward_UI,
    label: "Fast Reward UI",
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
    "the Claim All Rewards settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Fast_Reward_UI:")) {
  const switchAnchor = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      activeOverrides.INFINITE_REWARDS_OVERRIDE = value === 2;
      break;
    case SettingKeys.Offline_Fast_Reward_UI:
      activeOverrides.FAST_REWARD_UI_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Claim All Rewards switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added Reward Claim Mode and Fast Reward UI settings.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("INFINITE_REWARDS_OVERRIDE")) {
  const overrideAnchor =
    "  readonly CLAIM_ALL_REWARDS_OVERRIDE: boolean = false;";
  const overrideReplacement = `${overrideAnchor}
  /** Reuses successful free rewards until their own cap or eligibility is exhausted. */
  readonly INFINITE_REWARDS_OVERRIDE: boolean = false;
  /** Reuses existing reward-card objects for rerolls and multi-claim returns. */
  readonly FAST_REWARD_UI_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "CLAIM_ALL_REWARDS_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");
console.log("Added reward sandbox runtime overrides.");

const modifierTarget = path.join(
  "pokerogue-src",
  "src",
  "modifier",
  "modifier.ts",
);
let modifierSource = readNormalized(modifierTarget);

if (!modifierSource.includes("isAtPokeballCapacity(): boolean")) {
  const pokeballAnchor = `  override apply(): boolean {
    const pokeballCounts = globalScene.pokeballCounts;
    pokeballCounts[this.pokeballType] = Math.min(
      pokeballCounts[this.pokeballType] + this.count,
      MAX_PER_TYPE_POKEBALLS,
    );

    return true;
  }
}`;
  const pokeballReplacement = `  override apply(): boolean {
    const pokeballCounts = globalScene.pokeballCounts;
    pokeballCounts[this.pokeballType] = Math.min(
      pokeballCounts[this.pokeballType] + this.count,
      MAX_PER_TYPE_POKEBALLS,
    );

    return true;
  }

  isAtPokeballCapacity(): boolean {
    return globalScene.pokeballCounts[this.pokeballType] >= MAX_PER_TYPE_POKEBALLS;
  }
}`;
  modifierSource = replaceRequired(
    modifierSource,
    pokeballAnchor,
    pokeballReplacement,
    "the AddPokeballModifier class",
  );
}

fs.writeFileSync(modifierTarget, modifierSource, "utf8");
console.log("Added the Pokeball capacity query used by Infinite rewards.");

const phaseTarget = path.join(
  "pokerogue-src",
  "src",
  "phases",
  "select-modifier-phase.ts",
);
let phaseSource = readNormalized(phaseTarget);

if (!phaseSource.includes("  AddPokeballModifier,\n")) {
  phaseSource = replaceRequired(
    phaseSource,
    "  ExtraModifierModifier,\n",
    "  AddPokeballModifier,\n  ExtraModifierModifier,\n",
    "the modifier import list in select-modifier-phase.ts",
  );
}

if (!phaseSource.includes(
  "(activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE)"
  + "\n      && this.claimedRewardIndices.has(cursor)",
)) {
  const claimedAnchor = `    if (
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
      && this.claimedRewardIndices.has(cursor)
    ) {`;
  const claimedReplacement = `    if (
      (activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE)
      && this.claimedRewardIndices.has(cursor)
    ) {`;
  phaseSource = replaceRequired(
    phaseSource,
    claimedAnchor,
    claimedReplacement,
    "the claimed reward guard",
  );
}

if (!phaseSource.includes(
  "return (\n      cost === -1\n      && !(\n        activeOverrides.FAST_REWARD_UI_OVERRIDE",
)) {
  const returnAnchor = `    return cost === -1;
  }

  // Reroll rewards`;
  const returnReplacement = `    return (
      cost === -1
      && !(
        activeOverrides.FAST_REWARD_UI_OVERRIDE
        && (activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE)
        && !(modifierType instanceof PokemonModifierType)
      )
    );
  }

  // Reroll rewards`;
  phaseSource = replaceRequired(
    phaseSource,
    returnAnchor,
    returnReplacement,
    "the chosen-modifier callback result",
  );
}

if (!phaseSource.includes("uiHandler.reuseRewardOptions(")) {
  const rerollAnchor = `  private rerollModifiers() {
    const rerollCost = this.getRerollCost(globalScene.lockModifierTiers);
    if (rerollCost < 0 || globalScene.money < rerollCost) {
      globalScene.ui.playError();
      return false;
    }
    globalScene.reroll = true;
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",
      this.rerollCount + 1,
      this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[],
    );
    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE).then(() => super.end());
    if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      globalScene.money -= rerollCost;
      globalScene.updateMoneyText();
      globalScene.animateMoneyChanged(false);
    }
    audioManager.playSound("se/buy");
    return true;
  }`;
  const rerollReplacement = `  private rerollModifiers() {
    const rerollCost = this.getRerollCost(globalScene.lockModifierTiers);
    if (rerollCost < 0 || globalScene.money < rerollCost) {
      globalScene.ui.playError();
      return false;
    }

    const nextRerollCount = this.rerollCount + 1;
    const nextModifierTiers = this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[];

    if (activeOverrides.FAST_REWARD_UI_OVERRIDE) {
      const modifierCount = this.getModifierCount();
      const uiHandler = globalScene.ui.getHandler() as ModifierSelectUiHandler;
      if (uiHandler.canReuseRewardOptions(modifierCount)) {
        globalScene.reroll = true;
        this.modifierTiers = nextModifierTiers;
        this.rerollCount = nextRerollCount;
        this.claimedRewardIndices.clear();
        clearPendingClaimAllReward();
        if (this.isCopy) {
          this.isCopy = false;
          this.customModifierSettings = undefined;
        }
        regenerateModifierPoolThresholds(globalScene.getPlayerParty(), this.getPoolType(), this.rerollCount);
        this.typeOptions = this.getModifierTypeOptions(modifierCount);

        if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
          globalScene.money -= rerollCost;
          globalScene.updateMoneyText();
          globalScene.animateMoneyChanged(false);
        }

        uiHandler.reuseRewardOptions(this.typeOptions, this.getRerollCost(globalScene.lockModifierTiers));
        globalScene.reroll = false;
        audioManager.playSound("se/buy");
        return false;
      }
    }

    globalScene.reroll = true;
    globalScene.phaseManager.unshiftNew("SelectModifierPhase", nextRerollCount, nextModifierTiers);
    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE).then(() => super.end());
    if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      globalScene.money -= rerollCost;
      globalScene.updateMoneyText();
      globalScene.animateMoneyChanged(false);
    }
    audioManager.playSound("se/buy");
    return true;
  }`;
  phaseSource = replaceRequired(
    phaseSource,
    rerollAnchor,
    rerollReplacement,
    "the reward reroll method",
  );
}

if (!phaseSource.includes("private shouldMarkInfiniteReward(")) {
  const completeAnchor = `  /**
   * Finish a successfully claimed free reward and reopen the same reward set.
   *
   * Even after every slot is claimed, keep the reward screen available so
   * the player can reroll for a fresh set or leave manually.
   */
  private completeClaimAllReward(rewardIndex: number): void {
    const nextClaimedRewardIndices = new Set(this.claimedRewardIndices);
    nextClaimedRewardIndices.add(rewardIndex);

    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE);
    globalScene.phaseManager.unshiftPhase(
      this.copy(nextClaimedRewardIndices),
    );

    super.end();
  }`;
  const completeReplacement = `  private shouldMarkInfiniteReward(modifier: Modifier): boolean {
    if (modifier instanceof AddPokeballModifier) {
      return modifier.isAtPokeballCapacity();
    }

    if (modifier instanceof PersistentModifier) {
      const matchingModifier = globalScene.findModifier(
        existing => existing === modifier || existing.match(modifier) || modifier.match(existing),
      );
      return !!matchingModifier && matchingModifier.getStackCount() >= matchingModifier.getMaxStackCount();
    }

    const selectFilter = modifier.type instanceof PokemonModifierType ? modifier.type.selectFilter : undefined;
    if (selectFilter) {
      return globalScene.getPlayerParty().every(pokemon => !!selectFilter(pokemon));
    }

    return false;
  }

  /**
   * Finish a successful multi-reward pick and reopen the same reward set.
   * Infinite mode marks only rewards that have reached their own cap.
   */
  private completeMultiReward(
    rewardIndex: number,
    modifier: Modifier,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {
    const shouldMarkReward = activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || this.shouldMarkInfiniteReward(modifier);
    if (shouldMarkReward) {
      this.claimedRewardIndices.add(rewardIndex);
    }

    if (activeOverrides.FAST_REWARD_UI_OVERRIDE) {
      const uiHandler = globalScene.ui.getHandler() as ModifierSelectUiHandler;
      if (shouldMarkReward) {
        uiHandler.markRewardClaimed(rewardIndex);
      }
      this.resetModifierSelect(modifierSelectCallback);
      return;
    }

    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE);
    globalScene.phaseManager.unshiftPhase(this.copy());
    super.end();
  }`;
  phaseSource = replaceRequired(
    phaseSource,
    completeAnchor,
    completeReplacement,
    "the Claim All reward completion method",
  );
}

if (!phaseSource.includes("const multiReward =")) {
  const multiAnchor = `    const claimAllReward =
      cost === -1
      && rewardIndex !== undefined
      && activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE;`;
  const multiReplacement = `    const multiReward =
      cost === -1
      && rewardIndex !== undefined
      && (activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE);`;
  phaseSource = replaceRequired(
    phaseSource,
    multiAnchor,
    multiReplacement,
    "the Claim All reward activation check",
  );
  phaseSource = phaseSource.replaceAll("!claimAllReward", "!multiReward");
  phaseSource = phaseSource.replaceAll("claimAllReward &&", "multiReward &&");
  phaseSource = phaseSource.replaceAll("if (claimAllReward)", "if (multiReward)");
}

if (!phaseSource.includes(
  "setPendingClaimAllReward(() => {\n        if (activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE)",
)) {
  const pendingAnchor =
    "      setPendingClaimAllReward(() => retryPhase.markRewardClaimed(rewardIndex!));";
  const pendingReplacement = `      setPendingClaimAllReward(() => {
        if (activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE) {
          retryPhase.markRewardClaimed(rewardIndex!);
        }
      });`;
  phaseSource = replaceRequired(
    phaseSource,
    pendingAnchor,
    pendingReplacement,
    "the deferred move-reward claim callback",
  );
}

if (!phaseSource.includes(
  "this.completeMultiReward(rewardIndex!, modifier, modifierSelectCallback!);",
)) {
  phaseSource = replaceRequired(
    phaseSource,
    "      this.completeClaimAllReward(rewardIndex!);",
    "      this.completeMultiReward(rewardIndex!, modifier, modifierSelectCallback!);",
    "the multi-reward completion call",
  );
}

phaseSource = phaseSource.replace(
  `  HealShopCostModifier,
  PokemonHeldItemModifier,
  PersistentModifier,`,
  `  HealShopCostModifier,
  PersistentModifier,
  PokemonHeldItemModifier,`,
);
phaseSource = phaseSource.replace(
  `import {
  clearPendingClaimAllReward,
  setPendingClaimAllReward,
} from "#system/offline/claim-all-rewards-state";`,
  `import { clearPendingClaimAllReward, setPendingClaimAllReward } from "#system/offline/claim-all-rewards-state";`,
);
phaseSource = phaseSource.replace(
  `      this.applyModifier(
        modifierType.newModifier()!,
        cost,
        false,
        modifierSelectCallback,
        rewardIndex,
      );`,
  "      this.applyModifier(modifierType.newModifier()!, cost, false, modifierSelectCallback, rewardIndex);",
);
phaseSource = phaseSource.replace(
  `    const isMoveSelectionModifier =
      modifier.type instanceof RememberMoveModifierType
      || modifier.type instanceof TmModifierType;`,
  `    const isMoveSelectionModifier =
      modifier.type instanceof RememberMoveModifierType || modifier.type instanceof TmModifierType;`,
);

fs.writeFileSync(phaseTarget, phaseSource, "utf8");
console.log("Enabled Claim All, Infinite, and fast reroll phase behavior.");

const learnMoveTarget = path.join(
  "pokerogue-src",
  "src",
  "phases",
  "learn-move-phase.ts",
);
let learnMoveSource = readNormalized(learnMoveTarget);

if (!learnMoveSource.includes(
  "activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE",
)) {
  const cleanupAnchor = `      if (
        !activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
        || !commitPendingClaimAllReward()
      ) {`;
  const cleanupReplacement = `      if (
        !(activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE)
        || !commitPendingClaimAllReward()
      ) {`;
  learnMoveSource = replaceRequired(
    learnMoveSource,
    cleanupAnchor,
    cleanupReplacement,
    "the successful TM reward cleanup",
  );

  const memoryCleanupAnchor = `        if (
          !activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
          || !commitPendingClaimAllReward()
        ) {`;
  const memoryCleanupReplacement = `        if (
          !(activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || activeOverrides.INFINITE_REWARDS_OVERRIDE)
          || !commitPendingClaimAllReward()
        ) {`;
  learnMoveSource = replaceRequired(
    learnMoveSource,
    memoryCleanupAnchor,
    memoryCleanupReplacement,
    "the successful Memory Mushroom reward cleanup",
  );
}

fs.writeFileSync(learnMoveTarget, learnMoveSource, "utf8");
console.log("Kept Infinite TM and Memory rewards available after successful learning.");

const uiTarget = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "modifier-select-ui-handler.ts",
);
let uiSource = readNormalized(uiTarget);

if (!uiSource.includes("canReuseRewardOptions(rewardOptionCount: number)")) {
  const methodsAnchor = `  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
  const methodsReplacement = `  canReuseRewardOptions(rewardOptionCount: number): boolean {
    return this.active && this.options.length === rewardOptionCount;
  }

  reuseRewardOptions(typeOptions: ModifierTypeOption[], rerollCost: number): void {
    if (!this.canReuseRewardOptions(typeOptions.length)) {
      throw new Error("Reward option reuse count mismatch");
    }
    for (let index = 0; index < typeOptions.length; index++) {
      this.options[index].reuse(typeOptions[index]);
    }
    this.rerollCost = rerollCost;
    this.updateCostText();
  }

  markRewardClaimed(rewardIndex: number): boolean {
    const option = this.options[rewardIndex];
    if (!this.active || !option) {
      return false;
    }
    option.markClaimed();
    return true;
  }

  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
  uiSource = replaceRequired(
    uiSource,
    methodsAnchor,
    methodsReplacement,
    "the modifier-select reroll-cost setter",
  );
}

if (!uiSource.includes(
  "private claimedBackground?: Phaser.GameObjects.Rectangle;",
)) {
  const fieldsAnchor = `  private itemText: Phaser.GameObjects.Text;
  private itemCostText: Phaser.GameObjects.Text;`;
  const fieldsReplacement = `${fieldsAnchor}
  private claimedBackground?: Phaser.GameObjects.Rectangle;
  private claimedText?: Phaser.GameObjects.Text;`;
  uiSource = replaceRequired(
    uiSource,
    fieldsAnchor,
    fieldsReplacement,
    "the ModifierOption item fields",
  );
}

if (!uiSource.includes("reuse(modifierTypeOption: ModifierTypeOption): void")) {
  const markAnchor = `  markClaimed(): void {
    this.item.setTint(0x666666);
    this.itemText.setTint(0x777777);
    this.pb?.setTint(0x555555);

    const claimedBackground = globalScene.add.rectangle(
      0,
      62,
      96,
      18,
      0x000000,
      0.9,
    );
    claimedBackground.setStrokeStyle(2, 0xff3030, 1);
    this.add(claimedBackground);

    const claimedText = addTextObject(
      0,
      56,
      "CLAIMED",
      TextStyle.PARTY_RED,
      {
        align: "center",
      },
    );
    claimedText.setOrigin(0.5, 0);
    this.add(claimedText);
  }`;
  const markReplacement = `  reuse(modifierTypeOption: ModifierTypeOption): void {
    this.modifierTypeOption = modifierTypeOption;
    this.item.setTexture("items", modifierTypeOption.type?.iconImage);
    this.item.clearTint();
    this.itemText.setText(modifierTypeOption.type?.name ?? "");
    this.itemText.clearTint();
    if (modifierTypeOption.type?.tier) {
      this.itemText.setTint(getModifierTierTextTint(modifierTypeOption.type.tier));
    }
    this.claimedBackground?.setVisible(false);
    this.claimedText?.setVisible(false);
  }

  markClaimed(): void {
    this.item.setTint(0x666666);
    this.itemText.setTint(0x777777);
    this.pb?.setTint(0x555555);

    if (!this.claimedBackground) {
      this.claimedBackground = globalScene.add.rectangle(0, 62, 96, 18, 0x000000, 0.9);
      this.claimedBackground.setStrokeStyle(2, 0xff3030, 1);
      this.add(this.claimedBackground);
    }
    this.claimedBackground.setVisible(true);

    if (!this.claimedText) {
      this.claimedText = addTextObject(0, 56, "CLAIMED", TextStyle.PARTY_RED, {
        align: "center",
      });
      this.claimedText.setOrigin(0.5, 0);
      this.add(this.claimedText);
    }
    this.claimedText.setVisible(true);
  }`;
  uiSource = replaceRequired(
    uiSource,
    markAnchor,
    markReplacement,
    "the claimed reward-card method",
  );
}

uiSource = uiSource.replace(
  `    if (
      (args.length !== 4 && args.length !== 5)
      || !Array.isArray(args[1])
      || !(args[2] instanceof Function)
    ) {`,
  `    if ((args.length !== 4 && args.length !== 5) || !Array.isArray(args[1]) || !(args[2] instanceof Function)) {`,
);

fs.writeFileSync(uiTarget, uiSource, "utf8");
console.log("Added in-place reward-card reuse and cap visuals.");
console.log("Reward sandbox settings patch applied successfully.");
