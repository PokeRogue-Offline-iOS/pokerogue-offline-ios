#!/usr/bin/env node

/**
 * Add live player-side battle cheats with narrow runtime boundaries:
 *
 * - Never Miss bypasses only the final accuracy roll. Protect, immunities,
 *   Commander, and semi-invulnerable states retain their normal behavior.
 * - Always Critical Hit forces eligible player damage moves to crit while
 *   preserving the game's fixed-damage no-crit rule.
 * - Always Move First sorts player MovePhases ahead of enemy MovePhases while
 *   preserving normal ordering within each side.
 * - Full Heal After Every Battle silently restores the party after victory.
 * - No Charge / Recharge Turns reuses the normal instant-charge route and
 *   suppresses only RechargeAttr for player Pokemon. Rampage, Rage, Rollout,
 *   delayed attacks, and other consecutive-use mechanics are not changed.
 * - Run Never Fails forces the normal escape roll to succeed without changing
 *   trainer, final-biome, mystery-encounter, Commander, or trapping eligibility.
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
    fail(
      `Expected exactly one ${description}, found ${matches.length}. `
        + "The upstream source or an earlier patch may have changed.",
    );
  }
  const anchor = matches[0][0];
  return source.replace(anchor, `${anchor}\n${addition}`);
}

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);

if (!settingsSource.includes("Offline_No_Recharge_Turns")) {
  const keyAnchor = '  Offline_Player_Ohko: "OFFLINE_PLAYER_OHKO",';
  const keyReplacement = `${keyAnchor}
  Offline_Never_Miss: "OFFLINE_NEVER_MISS",
  Offline_Always_Critical_Hit: "OFFLINE_ALWAYS_CRITICAL_HIT",
  Offline_Always_Move_First: "OFFLINE_ALWAYS_MOVE_FIRST",
  Offline_Full_Heal_After_Battle: "OFFLINE_FULL_HEAL_AFTER_BATTLE",
  Offline_No_Recharge_Turns: "OFFLINE_NO_RECHARGE_TURNS",`;
  settingsSource = replaceRequired(settingsSource, keyAnchor, keyReplacement, "the Player OHKO setting key");
}

if (!settingsSource.includes('label: "No Charge / Recharge Turns"')) {
  const rowPattern = /  \{\r?\n    key: SettingKeys\.Offline_Player_Ohko,[\s\S]*?\r?\n  \},/;
  const offOnRows = [
    ["Offline_Never_Miss", "Never Miss"],
    ["Offline_Always_Critical_Hit", "Always Critical Hit"],
    ["Offline_Always_Move_First", "Always Move First"],
    ["Offline_Full_Heal_After_Battle", "Full Heal After Every Battle"],
    ["Offline_No_Recharge_Turns", "No Charge / Recharge Turns"],
  ]
    .map(
      ([key, label]) => `  {
    key: SettingKeys.${key},
    label: "${label}",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },`,
    )
    .join("\n");
  settingsSource = insertAfterUniquePattern(
    settingsSource,
    rowPattern,
    offOnRows,
    "the Player OHKO settings row",
  );
}

if (!settingsSource.includes("Offline_Run_Never_Fails")) {
  const keyAnchor = '  Offline_No_Recharge_Turns: "OFFLINE_NO_RECHARGE_TURNS",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}\n  Offline_Run_Never_Fails: "OFFLINE_RUN_NEVER_FAILS",`,
    "the no-recharge setting key for Run Never Fails",
  );
}

if (!settingsSource.includes('label: "Run Never Fails"')) {
  const rowAnchor = `  {
    key: SettingKeys.Offline_No_Recharge_Turns,
    label: "No Charge / Recharge Turns",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },`;
  const runRow = `  {
    key: SettingKeys.Offline_Run_Never_Fails,
    label: "Run Never Fails",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
  },`;
  settingsSource = replaceRequired(
    settingsSource,
    rowAnchor,
    `${rowAnchor}\n${runRow}`,
    "the no-recharge settings row for Run Never Fails",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_No_Recharge_Turns:")) {
  const switchAnchor = `    case SettingKeys.Offline_Player_Ohko:
      activeOverrides.PLAYER_OHKO_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Never_Miss:
      activeOverrides.PLAYER_NEVER_MISS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Always_Critical_Hit:
      activeOverrides.PLAYER_ALWAYS_CRIT_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Always_Move_First:
      activeOverrides.PLAYER_ALWAYS_FIRST_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Full_Heal_After_Battle:
      activeOverrides.FULL_HEAL_AFTER_BATTLE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_No_Recharge_Turns:
      activeOverrides.PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the Player OHKO setting switch case",
  );
}
if (!settingsSource.includes("case SettingKeys.Offline_Run_Never_Fails:")) {
  const switchAnchor = `    case SettingKeys.Offline_No_Recharge_Turns:
      activeOverrides.PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Run_Never_Fails:
      activeOverrides.RUN_SUCCESS_OVERRIDE = value === 1 ? true : null;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the no-recharge setting switch case for Run Never Fails",
  );
}
writeFile(settingsPath, settingsSource);

const overridesPath = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readFile(overridesPath);
if (!overridesSource.includes("PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE")) {
  const overrideAnchor = `  /** Makes the first hit of each player damage move lethal without bypassing boss rules. */
  readonly PLAYER_OHKO_OVERRIDE: boolean = false;`;
  const overrideReplacement = `${overrideAnchor}
  /** Bypasses only the final accuracy roll for player moves. */
  readonly PLAYER_NEVER_MISS_OVERRIDE: boolean = false;
  /** Forces eligible player damage moves to be critical hits. */
  readonly PLAYER_ALWAYS_CRIT_OVERRIDE: boolean = false;
  /** Sorts player attacks ahead of enemy attacks. */
  readonly PLAYER_ALWAYS_FIRST_OVERRIDE: boolean = false;
  /** Restores player HP, PP, and status after each victorious battle. */
  readonly FULL_HEAL_AFTER_BATTLE_OVERRIDE: boolean = false;
  /** Instantly releases charge moves and suppresses player recharge tags. */
  readonly PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(overridesSource, overrideAnchor, overrideReplacement, "PLAYER_OHKO_OVERRIDE");
}
writeFile(overridesPath, overridesSource);

const moveEffectPath = path.join("pokerogue-src", "src", "phases", "move-effect-phase.ts");
let moveEffectSource = readFile(moveEffectPath);
if (!moveEffectSource.includes("PLAYER_NEVER_MISS_OVERRIDE")) {
  const accuracyAnchor = `    if (moveAccuracy === -1 || bypassAccuracy) {
      return [HitCheckResult.HIT, effectiveness];
    }`;
  const accuracyReplacement = `    if (moveAccuracy === -1 || bypassAccuracy || (user.isPlayer() && activeOverrides.PLAYER_NEVER_MISS_OVERRIDE)) {
      return [HitCheckResult.HIT, effectiveness];
    }`;
  moveEffectSource = replaceRequired(
    moveEffectSource,
    accuracyAnchor,
    accuracyReplacement,
    "the final move accuracy bypass",
  );
}
if (!moveEffectSource.includes("PLAYER_ALWAYS_CRIT_OVERRIDE")) {
  const critAnchor = "    const isCritical = target.getCriticalHitResult(user, this.move);";
  const critReplacement = `    const isCritical =
      user.isPlayer() && activeOverrides.PLAYER_ALWAYS_CRIT_OVERRIDE && !this.move.hasAttr("FixedDamageAttr")
        ? true
        : target.getCriticalHitResult(user, this.move);`;
  moveEffectSource = replaceRequired(moveEffectSource, critAnchor, critReplacement, "the critical-hit calculation");
}
writeFile(moveEffectPath, moveEffectSource);

const moveQueuePath = path.join("pokerogue-src", "src", "queues", "move-phase-priority-queue.ts");
let moveQueueSource = readFile(moveQueuePath);
if (!moveQueueSource.includes('import { activeOverrides } from "#app/overrides";')) {
  moveQueueSource = replaceRequired(
    moveQueueSource,
    'import { globalScene } from "#app/global-scene";',
    'import { globalScene } from "#app/global-scene";\nimport { activeOverrides } from "#app/overrides";',
    "the globalScene import in move-phase-priority-queue.ts",
  );
}
if (!moveQueueSource.includes("activeOverrides.PLAYER_ALWAYS_FIRST_OVERRIDE")) {
  const comparatorAnchor = `    this.queue.sort((a, b) => {
      if (b.timingModifier !== a.timingModifier) {`;
  const comparatorReplacement = `    this.queue.sort((a, b) => {
      if (activeOverrides.PLAYER_ALWAYS_FIRST_OVERRIDE && a.pokemon.isPlayer() !== b.pokemon.isPlayer()) {
        return a.pokemon.isPlayer() ? -1 : 1;
      }

      if (b.timingModifier !== a.timingModifier) {`;
  moveQueueSource = replaceRequired(
    moveQueueSource,
    comparatorAnchor,
    comparatorReplacement,
    "the MovePhase priority comparator",
  );
}
writeFile(moveQueuePath, moveQueueSource);

const battleEndPath = path.join("pokerogue-src", "src", "phases", "battle-end-phase.ts");
let battleEndSource = readFile(battleEndPath);
if (!battleEndSource.includes('import { activeOverrides } from "#app/overrides";')) {
  battleEndSource = replaceRequired(
    battleEndSource,
    'import { globalScene } from "#app/global-scene";',
    'import { globalScene } from "#app/global-scene";\nimport { activeOverrides } from "#app/overrides";',
    "the globalScene import in battle-end-phase.ts",
  );
}
if (!battleEndSource.includes("activeOverrides.FULL_HEAL_AFTER_BATTLE_OVERRIDE")) {
  const healAnchor = `    for (const pokemon of globalScene.getPokemonAllowedInBattle()) {
      applyAbAttrs("PostBattleAbAttr", { pokemon, victory: this.isVictory });
    }`;
  const healReplacement = `${healAnchor}

    if (this.isVictory && activeOverrides.FULL_HEAL_AFTER_BATTLE_OVERRIDE) {
      for (const pokemon of globalScene.getPlayerParty()) {
        pokemon.hp = pokemon.getMaxHp();
        pokemon.resetStatus(true, true, false, false);
        for (const move of pokemon.moveset) {
          move.ppUsed = 0;
        }
        pokemon.updateInfo(true);
      }
    }`;
  battleEndSource = replaceRequired(battleEndSource, healAnchor, healReplacement, "the post-battle ability loop");
}
if (battleEndSource.includes("pokemon.resetStatus(true, false, false, true);")) {
  battleEndSource = replaceRequired(
    battleEndSource,
    "pokemon.resetStatus(true, false, false, true);",
    "pokemon.resetStatus(true, true, false, false);",
    "the original queued post-battle status reset",
  );
}
writeFile(battleEndPath, battleEndSource);

const chargePath = path.join("pokerogue-src", "src", "phases", "move-charge-phase.ts");
let chargeSource = readFile(chargePath);
if (!chargeSource.includes('import { activeOverrides } from "#app/overrides";')) {
  chargeSource = replaceRequired(
    chargeSource,
    'import { globalScene } from "#app/global-scene";',
    'import { globalScene } from "#app/global-scene";\nimport { activeOverrides } from "#app/overrides";',
    "the globalScene import in move-charge-phase.ts",
  );
}
if (!chargeSource.includes("activeOverrides.PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE")) {
  const instantAnchor = `    const instantCharge = new BooleanHolder(false);
    applyMoveChargeAttrs("InstantChargeAttr", user, null, move, instantCharge);`;
  const instantReplacement = `${instantAnchor}
    if (user.isPlayer() && activeOverrides.PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE) {
      instantCharge.value = true;
    }`;
  chargeSource = replaceRequired(chargeSource, instantAnchor, instantReplacement, "the instant-charge attribute check");
}
writeFile(chargePath, chargeSource);

const moveDataPath = path.join("pokerogue-src", "src", "data", "moves", "move.ts");
let moveDataSource = readFile(moveDataPath);
if (!moveDataSource.includes("No Charge / Recharge Turns suppresses only RechargeAttr")) {
  const rechargeAnchor = `export class RechargeAttr extends AddBattlerTagAttr {
  constructor() {
    super(BattlerTagType.RECHARGING, true, false, 1, 1, true);
  }
}`;
  const rechargeReplacement = `export class RechargeAttr extends AddBattlerTagAttr {
  constructor() {
    super(BattlerTagType.RECHARGING, true, false, 1, 1, true);
  }

  override apply(user: Pokemon, target: Pokemon, move: Move, args: any[]): boolean {
    // No Charge / Recharge Turns suppresses only RechargeAttr. Rampage and
    // consecutive-use mechanics use separate tags/attributes and stay intact.
    if (user.isPlayer() && activeOverrides.PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE) {
      return false;
    }
    return super.apply(user, target, move, args);
  }
}`;
  moveDataSource = replaceRequired(moveDataSource, rechargeAnchor, rechargeReplacement, "the RechargeAttr class");
}
writeFile(moveDataPath, moveDataSource);

for (const marker of [
  "PLAYER_NEVER_MISS_OVERRIDE",
  "PLAYER_ALWAYS_CRIT_OVERRIDE",
  "PLAYER_ALWAYS_FIRST_OVERRIDE",
  "FULL_HEAL_AFTER_BATTLE_OVERRIDE",
  "PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE",
]) {
  if (!readFile(overridesPath).includes(marker)) {
    fail(`Missing battle-cheat override marker: ${marker}`);
  }
}

for (const marker of [
  "Offline_Run_Never_Fails",
  'label: "Run Never Fails"',
  "activeOverrides.RUN_SUCCESS_OVERRIDE = value === 1 ? true : null",
]) {
  if (!readFile(settingsPath).includes(marker)) {
    fail(`Missing Run Never Fails setting marker: ${marker}`);
  }
}

console.log("Advanced battle cheats applied successfully.");
