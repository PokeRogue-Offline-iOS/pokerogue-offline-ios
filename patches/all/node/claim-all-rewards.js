#!/usr/bin/env node

/**
 * Adds an offline-only "Claim All Rewards" sandbox option.
 *
 * When enabled:
 * - Each generated free reward slot can be claimed once.
 * - Claimed rewards stay visible and show a clear CLAIMED badge.
 * - Selecting an already claimed reward plays the error sound.
 * - Rerolling creates a fresh reward set with no claimed slots.
 * - Cancel/skip still exits the reward screen normally.
 * - TMs and Memory Mushrooms are only marked claimed after the move is
 *   successfully learned. Cancelling returns to the same unclaimed reward.
 * - After every reward has been claimed, the reward phase ends automatically.
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) {
    fail(
      `Could not find ${description}. `
        + "The upstream PokéRogue source or an earlier SilverShadow patch may have changed.",
    );
  }

  return source.replace(anchor, replacement);
}

/*
 * ---------------------------------------------------------------------------
 * 1. Add the Offline setting and connect it to activeOverrides.
 * ---------------------------------------------------------------------------
 */

const settingsTarget = path.join(
  "pokerogue-src",
  "src",
  "system",
  "settings",
  "settings.ts",
);

let settingsSource = readFile(settingsTarget);

if (!settingsSource.includes("Offline_Claim_All_Rewards")) {
  const keyAnchor =
    '  Offline_Guaranteed_Capture: "OFFLINE_GUARANTEED_CAPTURE",\n'
    + "};";

  const keyReplacement =
    '  Offline_Guaranteed_Capture: "OFFLINE_GUARANTEED_CAPTURE",\n'
    + '  Offline_Claim_All_Rewards: "OFFLINE_CLAIM_ALL_REWARDS",\n'
    + "};";

  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    keyReplacement,
    "the Guaranteed Capture setting key",
  );
}

if (!settingsSource.includes('label: "Claim All Rewards"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_Guaranteed_Capture,
    label: "Guaranteed Capture",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
];`;

  const rowReplacement = `  {
    key: SettingKeys.Offline_Guaranteed_Capture,
    label: "Guaranteed Capture",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
  {
    key: SettingKeys.Offline_Claim_All_Rewards,
    label: "Claim All Rewards",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },
];`;

  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    rowReplacement,
    "the Guaranteed Capture Offline settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Claim_All_Rewards:")) {
  const switchAnchor = `    case SettingKeys.Offline_Guaranteed_Capture:
      activeOverrides.GUARANTEED_CAPTURE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Language:`;

  const switchReplacement = `    case SettingKeys.Offline_Guaranteed_Capture:
      activeOverrides.GUARANTEED_CAPTURE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Language:`;

  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Guaranteed Capture settings switch case",
  );
}

writeFile(settingsTarget, settingsSource);
console.log("Added the Claim All Rewards Offline setting.");

/*
 * ---------------------------------------------------------------------------
 * 2. Add the runtime override.
 * ---------------------------------------------------------------------------
 */

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readFile(overridesTarget);

if (!overridesSource.includes("CLAIM_ALL_REWARDS_OVERRIDE")) {
  const overrideAnchor = `  /** Forces every valid Poké Ball throw to capture successfully. */
  readonly GUARANTEED_CAPTURE_OVERRIDE: boolean = false;`;

  const overrideReplacement = `${overrideAnchor}
  /** Allows every generated free reward slot to be claimed once. */
  readonly CLAIM_ALL_REWARDS_OVERRIDE: boolean = false;`;

  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "the Guaranteed Capture override",
  );
}

writeFile(overridesTarget, overridesSource);
console.log("Added CLAIM_ALL_REWARDS_OVERRIDE.");

/*
 * ---------------------------------------------------------------------------
 * 3. Add tiny state helper for deferred TM / Memory Mushroom claims.
 * ---------------------------------------------------------------------------
 */

const claimStateTarget = path.join(
  "pokerogue-src",
  "src",
  "system",
  "offline",
  "claim-all-rewards-state.ts",
);

const claimStateSource = `/**
 * Holds one pending Claim All Rewards commit while a TM or Memory Mushroom
 * move-learning phase is active.
 *
 * A callback is used instead of importing SelectModifierPhase here, avoiding
 * a circular module dependency.
 */

let pendingClaimCommit: (() => void) | null = null;

export function setPendingClaimAllReward(commit: () => void): void {
  pendingClaimCommit = commit;
}

export function commitPendingClaimAllReward(): boolean {
  const commit = pendingClaimCommit;
  pendingClaimCommit = null;

  if (!commit) {
    return false;
  }

  commit();
  return true;
}

export function clearPendingClaimAllReward(): void {
  pendingClaimCommit = null;
}
`;

if (!fs.existsSync(claimStateTarget)) {
  writeFile(claimStateTarget, claimStateSource);
  console.log("Added deferred reward-claim state helper.");
} else {
  const existingClaimState = readFile(claimStateTarget);
  if (!existingClaimState.includes("commitPendingClaimAllReward")) {
    fail(`Unexpected existing file at ${claimStateTarget}`);
  }
}

/*
 * ---------------------------------------------------------------------------
 * 4. Keep the reward phase alive through cloned copies and track claimed slots.
 * ---------------------------------------------------------------------------
 */

const phaseTarget = path.join(
  "pokerogue-src",
  "src",
  "phases",
  "select-modifier-phase.ts",
);

let phaseSource = readFile(phaseTarget);

if (!phaseSource.includes('from "#system/offline/claim-all-rewards-state"')) {
  const importAnchor = 'import { BattlePhase } from "#phases/battle-phase";';
  const importReplacement = `${importAnchor}
import {
  clearPendingClaimAllReward,
  setPendingClaimAllReward,
} from "#system/offline/claim-all-rewards-state";`;

  phaseSource = replaceRequired(
    phaseSource,
    importAnchor,
    importReplacement,
    "the BattlePhase import in select-modifier-phase.ts",
  );
}

if (!phaseSource.includes("private claimedRewardIndices: Set<number>;")) {
  const fieldAnchor = `  private isCopy: boolean;

  private typeOptions: ModifierTypeOption[];`;

  const fieldReplacement = `  private isCopy: boolean;
  private claimedRewardIndices: Set<number>;

  private typeOptions: ModifierTypeOption[];`;

  phaseSource = replaceRequired(
    phaseSource,
    fieldAnchor,
    fieldReplacement,
    "the SelectModifierPhase fields",
  );
}

if (!phaseSource.includes("claimedRewardIndices: number[] = []")) {
  const constructorAnchor = `    customModifierSettings?: CustomModifierSettings,
    isCopy = false,
  ) {
    super();

    this.rerollCount = rerollCount;
    this.modifierTiers = modifierTiers;
    this.customModifierSettings = customModifierSettings;
    this.isCopy = isCopy;
  }`;

  const constructorReplacement = `    customModifierSettings?: CustomModifierSettings,
    isCopy = false,
    claimedRewardIndices: number[] = [],
  ) {
    super();

    this.rerollCount = rerollCount;
    this.modifierTiers = modifierTiers;
    this.customModifierSettings = customModifierSettings;
    this.isCopy = isCopy;
    this.claimedRewardIndices = new Set(claimedRewardIndices);
  }`;

  phaseSource = replaceRequired(
    phaseSource,
    constructorAnchor,
    constructorReplacement,
    "the SelectModifierPhase constructor",
  );
}

if (!phaseSource.includes("clearPendingClaimAllReward();\n\n    if (!this.isPlayer())")) {
  const startAnchor = `  start() {
    super.start();

    if (!this.isPlayer()) {`;

  const startReplacement = `  start() {
    super.start();

    // A retry phase begins only after the TM / Memory phase has completed.
    // Clear any stale callback left by a cancelled or rejected move lesson.
    clearPendingClaimAllReward();

    if (!this.isPlayer()) {`;

  phaseSource = replaceRequired(
    phaseSource,
    startAnchor,
    startReplacement,
    "the SelectModifierPhase start method",
  );
}

if (!phaseSource.includes("this.claimedRewardIndices.size >= this.typeOptions.length")) {
  const typeOptionsPattern =
    /(\n\s*this\.typeOptions\s*=\s*this\.getModifierTypeOptions\(\s*modifierCount\s*\);)/;

  if (!typeOptionsPattern.test(phaseSource)) {
    fail(
      "Could not find the reward option assignment. "
        + "The upstream PokéRogue source or an earlier SilverShadow patch may have changed.",
    );
  }

  phaseSource = phaseSource.replace(
    typeOptionsPattern,
    `$1

    // A successful TM or Memory Mushroom can resume through one final copied
    // phase. End immediately when that success completed the whole reward set.
    if (
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
      && this.claimedRewardIndices.size >= this.typeOptions.length
    ) {
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.MESSAGE);
      super.end();
      return;
    }`,
  );
}

if (!phaseSource.includes("this.claimedRewardIndices.has(cursor)")) {
  const rewardMethodAnchor = `  // Pick a modifier from among the rewards and apply it
  private selectRewardModifierOption(cursor: number, modifierSelectCallback: ModifierSelectCallback): boolean {
    if (this.typeOptions.length === 0) {
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.MESSAGE);
      super.end();
      return true;
    }
    const modifierType = this.typeOptions[cursor].type;
    return this.applyChosenModifier(modifierType, -1, modifierSelectCallback);
  }`;

  const rewardMethodReplacement = `  // Pick a modifier from among the rewards and apply it
  private selectRewardModifierOption(cursor: number, modifierSelectCallback: ModifierSelectCallback): boolean {
    if (this.typeOptions.length === 0) {
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.MESSAGE);
      super.end();
      return true;
    }

    if (
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
      && this.claimedRewardIndices.has(cursor)
    ) {
      globalScene.ui.playError();
      return false;
    }

    const modifierType = this.typeOptions[cursor].type;
    return this.applyChosenModifier(modifierType, -1, modifierSelectCallback, cursor);
  }`;

  phaseSource = replaceRequired(
    phaseSource,
    rewardMethodAnchor,
    rewardMethodReplacement,
    "the reward-selection method",
  );
}

if (!phaseSource.includes("rewardIndex?: number,")) {
  const applyChosenAnchor = `  // Apply a chosen modifier: do an effect or open the party menu
  private applyChosenModifier(
    modifierType: ModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): boolean {
    if (modifierType instanceof PokemonModifierType) {
      if (modifierType instanceof FusePokemonModifierType) {
        this.openFusionMenu(modifierType, cost, modifierSelectCallback);
      } else {
        this.openModifierMenu(modifierType, cost, modifierSelectCallback);
      }
    } else {
      this.applyModifier(modifierType.newModifier()!, cost);
    }
    return cost === -1;
  }`;

  const applyChosenReplacement = `  // Apply a chosen modifier: do an effect or open the party menu
  private applyChosenModifier(
    modifierType: ModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
    rewardIndex?: number,
  ): boolean {
    if (modifierType instanceof PokemonModifierType) {
      if (modifierType instanceof FusePokemonModifierType) {
        this.openFusionMenu(modifierType, cost, modifierSelectCallback, rewardIndex);
      } else {
        this.openModifierMenu(modifierType, cost, modifierSelectCallback, rewardIndex);
      }
    } else {
      this.applyModifier(
        modifierType.newModifier()!,
        cost,
        false,
        modifierSelectCallback,
        rewardIndex,
      );
    }
    return cost === -1;
  }`;

  phaseSource = replaceRequired(
    phaseSource,
    applyChosenAnchor,
    applyChosenReplacement,
    "the chosen-modifier dispatcher",
  );
}

if (!phaseSource.includes("private completeClaimAllReward(")) {
  const methodSignature = "  private applyModifier(";
  const methodStart = phaseSource.indexOf(methodSignature);

  if (methodStart < 0) {
    fail(
      "Could not find the applyModifier method signature. "
        + "The upstream PokéRogue source or an earlier SilverShadow patch may have changed.",
    );
  }

  // Replace the method by structure instead of matching every line exactly.
  // This tolerates upstream comment, spacing, and formatting changes.
  const documentationStart = phaseSource.lastIndexOf("  /**", methodStart);
  const bodyStart = phaseSource.indexOf("{", methodStart);

  if (documentationStart < 0 || bodyStart < 0) {
    fail("Could not locate the applyModifier documentation or method body.");
  }

  let braceDepth = 0;
  let methodEnd = -1;

  for (let index = bodyStart; index < phaseSource.length; index++) {
    if (phaseSource[index] === "{") {
      braceDepth++;
    } else if (phaseSource[index] === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        methodEnd = index + 1;
        break;
      }
    }
  }

  if (methodEnd < 0) {
    fail("Could not find the end of the applyModifier method.");
  }

  const applyModifierReplacement = `  /** Mark one slot on a copied Claim All Rewards phase. */
  public markRewardClaimed(rewardIndex: number): void {
    this.claimedRewardIndices.add(rewardIndex);
  }

  /**
   * Finish a successfully claimed free reward and queue the same reward set
   * again when unclaimed slots remain.
   */
  private completeClaimAllReward(rewardIndex: number): void {
    const nextClaimedRewardIndices = new Set(this.claimedRewardIndices);
    nextClaimedRewardIndices.add(rewardIndex);

    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE);

    if (nextClaimedRewardIndices.size < this.typeOptions.length) {
      globalScene.phaseManager.unshiftPhase(this.copy(nextClaimedRewardIndices));
    }

    super.end();
  }

  /**
   * Apply the effects of the chosen modifier
   * @param modifier - The modifier to apply
   * @param cost - The cost of the modifier if it was purchased, or -1 if selected as the modifier reward
   * @param playSound - Whether the 'obtain modifier' sound should be played when adding the modifier.
   * @param modifierSelectCallback - Callback used to restore the reward screen if applying the modifier fails.
   * @param rewardIndex - Reward slot index when Claim All Rewards is active.
   */
  private applyModifier(
    modifier: Modifier,
    cost = -1,
    playSound = false,
    modifierSelectCallback?: ModifierSelectCallback,
    rewardIndex?: number,
  ): void {
    const claimAllReward =
      cost === -1
      && rewardIndex !== undefined
      && activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE;
    const isMoveSelectionModifier =
      modifier.type instanceof RememberMoveModifierType
      || modifier.type instanceof TmModifierType;

    const result = globalScene.addModifier(modifier, false, playSound, undefined, undefined, cost);

    // Preserve upstream retry behavior for ordinary TMs and Memory Mushrooms.
    if (!claimAllReward && isMoveSelectionModifier) {
      globalScene.phaseManager.unshiftPhase(this.copy());
    }

    // Claim All Rewards must defer consuming a TM / Memory slot until the
    // LearnMovePhase confirms success. Cancelling leaves this copy unclaimed.
    if (claimAllReward && isMoveSelectionModifier && result) {
      const retryPhase = this.copy();
      setPendingClaimAllReward(() => retryPhase.markRewardClaimed(rewardIndex!));
      globalScene.phaseManager.unshiftPhase(retryPhase);
    }

    if (cost !== -1 && !(modifier.type instanceof RememberMoveModifierType)) {
      if (result) {
        if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
          globalScene.money -= cost;
          globalScene.updateMoneyText();
          globalScene.animateMoneyChanged(false);
        }
        audioManager.playSound("se/buy");
        (globalScene.ui.getHandler() as ModifierSelectUiHandler).updateCostText();
      } else {
        globalScene.ui.playError();
      }
      return;
    }

    if (claimAllReward) {
      if (!result) {
        clearPendingClaimAllReward();
        globalScene.ui.playError();
        if (modifierSelectCallback) {
          this.resetModifierSelect(modifierSelectCallback);
        }
        return;
      }

      if (isMoveSelectionModifier) {
        globalScene.ui.clearText();
        globalScene.ui.setMode(UiMode.MESSAGE);
        super.end();
        return;
      }

      this.completeClaimAllReward(rewardIndex!);
      return;
    }

    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE);
    super.end();
  }`;

  phaseSource =
    phaseSource.slice(0, documentationStart)
    + applyModifierReplacement
    + phaseSource.slice(methodEnd);
}

if (!phaseSource.includes("rewardIndex?: number,\n  ): void {\n    const party = globalScene.getPlayerParty();")) {
  const fusionSignatureAnchor = `  private openFusionMenu(
    modifierType: PokemonModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {`;

  const fusionSignatureReplacement = `  private openFusionMenu(
    modifierType: PokemonModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
    rewardIndex?: number,
  ): void {`;

  phaseSource = replaceRequired(
    phaseSource,
    fusionSignatureAnchor,
    fusionSignatureReplacement,
    "the fusion-menu signature",
  );

  phaseSource = replaceRequired(
    phaseSource,
    "            this.applyModifier(modifier, cost, true);",
    "            this.applyModifier(modifier, cost, true, modifierSelectCallback, rewardIndex);",
    "the fusion modifier application call",
  );
}

if (!phaseSource.includes("private openModifierMenu(\n    modifierType: PokemonModifierType,\n    cost: number,\n    modifierSelectCallback: ModifierSelectCallback,\n    rewardIndex?: number,")) {
  const modifierMenuSignatureAnchor = `  private openModifierMenu(
    modifierType: PokemonModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {`;

  const modifierMenuSignatureReplacement = `  private openModifierMenu(
    modifierType: PokemonModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
    rewardIndex?: number,
  ): void {`;

  phaseSource = replaceRequired(
    phaseSource,
    modifierMenuSignatureAnchor,
    modifierMenuSignatureReplacement,
    "the Pokémon modifier-menu signature",
  );

  phaseSource = replaceRequired(
    phaseSource,
    "            this.applyModifier(modifier!, cost, true); // TODO: is the bang correct?",
    "            this.applyModifier(modifier!, cost, true, modifierSelectCallback, rewardIndex); // TODO: is the bang correct?",
    "the Pokémon modifier application call",
  );
}

if (!phaseSource.includes("[...this.claimedRewardIndices],")) {
  const resetAnchor = `      this.typeOptions,
      modifierSelectCallback,
      this.getRerollCost(globalScene.lockModifierTiers),
    );`;

  const resetReplacement = `      this.typeOptions,
      modifierSelectCallback,
      this.getRerollCost(globalScene.lockModifierTiers),
      [...this.claimedRewardIndices],
    );`;

  phaseSource = replaceRequired(
    phaseSource,
    resetAnchor,
    resetReplacement,
    "the modifier-select UI reset arguments",
  );
}

if (!phaseSource.includes("copy(claimedRewardIndices = this.claimedRewardIndices)")) {
  const copyAnchor = `  copy(): SelectModifierPhase {
    return globalScene.phaseManager.create(
      "SelectModifierPhase",
      this.rerollCount,
      this.modifierTiers,
      {
        guaranteedModifierTypeOptions: this.typeOptions,
        rerollMultiplier: this.customModifierSettings?.rerollMultiplier,
        allowLuckUpgrades: false,
      },
      true,
    );
  }`;

  const copyReplacement = `  copy(claimedRewardIndices = this.claimedRewardIndices): SelectModifierPhase {
    return globalScene.phaseManager.create(
      "SelectModifierPhase",
      this.rerollCount,
      this.modifierTiers,
      {
        guaranteedModifierTypeOptions: this.typeOptions,
        rerollMultiplier: this.customModifierSettings?.rerollMultiplier,
        allowLuckUpgrades: false,
      },
      true,
      [...claimedRewardIndices],
    );
  }`;

  phaseSource = replaceRequired(
    phaseSource,
    copyAnchor,
    copyReplacement,
    "the SelectModifierPhase copy method",
  );
}

writeFile(phaseTarget, phaseSource);
console.log("Enabled multi-claim reward phase behavior.");

/*
 * ---------------------------------------------------------------------------
 * 5. Commit deferred TM / Memory Mushroom claims only after move success.
 * ---------------------------------------------------------------------------
 */

const learnMoveTarget = path.join(
  "pokerogue-src",
  "src",
  "phases",
  "learn-move-phase.ts",
);

let learnMoveSource = readFile(learnMoveTarget);

if (!learnMoveSource.includes('from "#system/offline/claim-all-rewards-state"')) {
  const importAnchor = 'import { PlayerPartyMemberPokemonPhase } from "#phases/player-party-member-pokemon-phase";';
  const importReplacement = `${importAnchor}
import { commitPendingClaimAllReward } from "#system/offline/claim-all-rewards-state";`;

  learnMoveSource = replaceRequired(
    learnMoveSource,
    importAnchor,
    importReplacement,
    "the PlayerPartyMemberPokemonPhase import in learn-move-phase.ts",
  );
}

if (!learnMoveSource.includes("commitPendingClaimAllReward()")) {
  const learnMoveSignature = "  async learnMove(";
  const learnMoveStart = learnMoveSource.indexOf(learnMoveSignature);

  if (learnMoveStart < 0) {
    fail("Could not find the LearnMovePhase.learnMove method.");
  }

  const learnMoveBodyStart = learnMoveSource.indexOf("{", learnMoveStart);

  if (learnMoveBodyStart < 0) {
    fail("Could not find the LearnMovePhase.learnMove method body.");
  }

  let learnMoveBraceDepth = 0;
  let learnMoveEnd = -1;

  for (let index = learnMoveBodyStart; index < learnMoveSource.length; index++) {
    if (learnMoveSource[index] === "{") {
      learnMoveBraceDepth++;
    } else if (learnMoveSource[index] === "}") {
      learnMoveBraceDepth--;
      if (learnMoveBraceDepth === 0) {
        learnMoveEnd = index + 1;
        break;
      }
    }
  }

  if (learnMoveEnd < 0) {
    fail("Could not find the end of the LearnMovePhase.learnMove method.");
  }

  let learnMoveMethod = learnMoveSource.slice(learnMoveStart, learnMoveEnd);

  const tmBranchStart = learnMoveMethod.indexOf(
    "if (this.learnMoveType === LearnMoveType.TM)",
  );
  const memoryBranchStart = learnMoveMethod.indexOf(
    "else if (this.learnMoveType === LearnMoveType.MEMORY)",
  );

  if (tmBranchStart < 0 || memoryBranchStart < 0 || memoryBranchStart <= tmBranchStart) {
    fail("Could not find the TM and Memory Mushroom success branches.");
  }

  let tmBranch = learnMoveMethod.slice(tmBranchStart, memoryBranchStart);
  const cleanupPattern =
    /^(\s*)globalScene\.phaseManager\.tryRemovePhase\("SelectModifierPhase"\);/m;
  const tmCleanupMatch = tmBranch.match(cleanupPattern);

  if (!tmCleanupMatch) {
    fail("Could not find the successful TM reward cleanup call.");
  }

  const tmIndent = tmCleanupMatch[1];
  const tmCleanupReplacement = `${tmIndent}if (
${tmIndent}  !activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
${tmIndent}  || !commitPendingClaimAllReward()
${tmIndent}) {
${tmIndent}  globalScene.phaseManager.tryRemovePhase("SelectModifierPhase");
${tmIndent}}`;

  tmBranch = tmBranch.replace(cleanupPattern, tmCleanupReplacement);

  let memoryBranch = learnMoveMethod.slice(memoryBranchStart);
  const freeMemoryStart = memoryBranch.indexOf("if (this.cost === -1)");

  if (freeMemoryStart < 0) {
    fail("Could not find the free Memory Mushroom branch.");
  }

  const memoryPrefix = memoryBranch.slice(0, freeMemoryStart);
  let freeMemoryBranch = memoryBranch.slice(freeMemoryStart);
  const memoryCleanupMatch = freeMemoryBranch.match(cleanupPattern);

  if (!memoryCleanupMatch) {
    fail("Could not find the successful free Memory Mushroom cleanup call.");
  }

  const memoryIndent = memoryCleanupMatch[1];
  const memoryCleanupReplacement = `${memoryIndent}if (
${memoryIndent}  !activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE
${memoryIndent}  || !commitPendingClaimAllReward()
${memoryIndent}) {
${memoryIndent}  globalScene.phaseManager.tryRemovePhase("SelectModifierPhase");
${memoryIndent}}`;

  freeMemoryBranch = freeMemoryBranch.replace(
    cleanupPattern,
    memoryCleanupReplacement,
  );
  memoryBranch = memoryPrefix + freeMemoryBranch;

  learnMoveMethod =
    learnMoveMethod.slice(0, tmBranchStart)
    + tmBranch
    + memoryBranch;

  learnMoveSource =
    learnMoveSource.slice(0, learnMoveStart)
    + learnMoveMethod
    + learnMoveSource.slice(learnMoveEnd);
}

writeFile(learnMoveTarget, learnMoveSource);
console.log("Connected successful move learning to deferred reward claims.");

/*
 * ---------------------------------------------------------------------------
 * 6. Dim and label claimed reward cards in the modifier-select UI.
 * ---------------------------------------------------------------------------
 */

const uiTarget = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "handlers",
  "modifier-select-ui-handler.ts",
);

let uiSource = readFile(uiTarget);

if (!uiSource.includes("const claimedRewardIndices = new Set<number>")) {
  const validationAnchor = `    if (args.length !== 4 || !Array.isArray(args[1]) || !(args[2] instanceof Function)) {
      return false;
    }`;

  const validationReplacement = `    if (
      (args.length !== 4 && args.length !== 5)
      || !Array.isArray(args[1])
      || !(args[2] instanceof Function)
    ) {
      return false;
    }`;

  uiSource = replaceRequired(
    uiSource,
    validationAnchor,
    validationReplacement,
    "the modifier-select UI argument validation",
  );

  const optionsAnchor = "    const typeOptions = args[1] as ModifierTypeOption[];";
  const optionsReplacement = `${optionsAnchor}
    const claimedRewardIndices = new Set<number>((args[4] as number[] | undefined) ?? []);`;

  uiSource = replaceRequired(
    uiSource,
    optionsAnchor,
    optionsReplacement,
    "the modifier reward options assignment",
  );

  const pushAnchor = `      this.modifierContainer.add(option);
      this.options.push(option);`;

  const pushReplacement = `      this.modifierContainer.add(option);
      this.options.push(option);
      if (claimedRewardIndices.has(m)) {
        option.markClaimed();
      }`;

  uiSource = replaceRequired(
    uiSource,
    pushAnchor,
    pushReplacement,
    "the reward-card insertion block",
  );
}

if (!uiSource.includes("markClaimed(): void")) {
  const modifierOptionClassSignature =
    "class ModifierOption extends Phaser.GameObjects.Container {";
  const modifierOptionClassStart = uiSource.indexOf(
    modifierOptionClassSignature,
  );

  if (modifierOptionClassStart < 0) {
    fail("Could not find the ModifierOption class.");
  }

  const setupSignature = "  setup() {";
  const setupStart = uiSource.indexOf(
    setupSignature,
    modifierOptionClassStart,
  );

  if (setupStart < 0) {
    fail("Could not find ModifierOption.setup().");
  }

  const setupBodyStart = uiSource.indexOf("{", setupStart);

  if (setupBodyStart < 0) {
    fail("Could not find the ModifierOption.setup() method body.");
  }

  let setupBraceDepth = 0;
  let setupEnd = -1;

  for (let index = setupBodyStart; index < uiSource.length; index++) {
    if (uiSource[index] === "{") {
      setupBraceDepth++;
    } else if (uiSource[index] === "}") {
      setupBraceDepth--;
      if (setupBraceDepth === 0) {
        setupEnd = index + 1;
        break;
      }
    }
  }

  if (setupEnd < 0) {
    fail("Could not find the end of ModifierOption.setup().");
  }

  const markClaimedMethod = `

  markClaimed(): void {
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

  uiSource =
    uiSource.slice(0, setupEnd)
    + markClaimedMethod
    + uiSource.slice(setupEnd);
}

writeFile(uiTarget, uiSource);
console.log("Added claimed reward-card visuals.");
console.log("Claim All Rewards patch applied successfully.");
