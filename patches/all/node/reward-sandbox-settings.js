#!/usr/bin/env node

/**
 * Extend Claim All Rewards into a mutually exclusive reward-claim mode.
 *
 * Reward Claim Mode:
 * - Default: upstream one-reward behavior.
 * - Claim All: each generated reward slot can be claimed once.
 * - Infinite: repeat successful rewards; cap/unique rewards become claimed
 *   when the game's own stack/eligibility rules say they are exhausted.
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
  },`;
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Claim All Rewards settings row",
  );
}

if (!settingsSource.includes("activeOverrides.INFINITE_REWARDS_OVERRIDE = value === 2;")) {
  const switchAnchor = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      activeOverrides.INFINITE_REWARDS_OVERRIDE = value === 2;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Claim All Rewards switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");
console.log("Added the Reward Claim Mode setting.");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("INFINITE_REWARDS_OVERRIDE")) {
  const overrideAnchor =
    "  readonly CLAIM_ALL_REWARDS_OVERRIDE: boolean = false;";
  const overrideReplacement = `${overrideAnchor}
  /** Reuses successful free rewards until their own cap or eligibility is exhausted. */
  readonly INFINITE_REWARDS_OVERRIDE: boolean = false;`;
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
  private completeMultiReward(rewardIndex: number, modifier: Modifier): void {
    const shouldMarkReward = activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE || this.shouldMarkInfiniteReward(modifier);
    if (shouldMarkReward) {
      this.claimedRewardIndices.add(rewardIndex);
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

phaseSource = phaseSource.replace(
  `  private completeMultiReward(
    rewardIndex: number,
    modifier: Modifier,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {`,
  "  private completeMultiReward(rewardIndex: number, modifier: Modifier): void {",
);
phaseSource = phaseSource.replace(
  "      this.completeMultiReward(rewardIndex!, modifier, modifierSelectCallback!);",
  "      this.completeMultiReward(rewardIndex!, modifier);",
);

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
  "this.completeMultiReward(rewardIndex!, modifier);",
)) {
  phaseSource = replaceRequired(
    phaseSource,
    "      this.completeClaimAllReward(rewardIndex!);",
    "      this.completeMultiReward(rewardIndex!, modifier);",
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
console.log("Enabled Claim All and Infinite reward behavior.");

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
console.log("Reward sandbox settings patch applied successfully.");
