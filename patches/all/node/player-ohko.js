#!/usr/bin/env node

/** Add a player-only OHKO debug option while preserving boss progression rules. */

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

const settingsTarget = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readNormalized(settingsTarget);

if (!settingsSource.includes("Offline_Claim_All_Rewards")) {
  fail("player-ohko.js must run after claim-all-rewards.js.");
}

if (!settingsSource.includes("Offline_Player_Ohko")) {
  const keyAnchor = '  Offline_Claim_All_Rewards: "OFFLINE_CLAIM_ALL_REWARDS",';
  settingsSource = replaceRequired(
    settingsSource,
    keyAnchor,
    `${keyAnchor}\n  Offline_Player_Ohko: "OFFLINE_PLAYER_OHKO",`,
    "the Claim All Rewards setting key",
  );
}

if (!settingsSource.includes('label: "Player OHKO"')) {
  const rowAnchor = `  {
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
    `${rowAnchor}
  {
    key: SettingKeys.Offline_Player_Ohko,
    label: "Player OHKO",
    options: [
      { value: "0", label: "Off" },
      { value: "1", label: "On" },
    ],
    default: 0,
    type: SettingType.APP,
    requireReload: true,
  },`,
    "the Claim All Rewards settings row",
  );
}

if (!settingsSource.includes("case SettingKeys.Offline_Player_Ohko:")) {
  const switchAnchor = `    case SettingKeys.Offline_Claim_All_Rewards:
      activeOverrides.CLAIM_ALL_REWARDS_OVERRIDE = value === 1;
      activeOverrides.INFINITE_REWARDS_OVERRIDE = value === 2;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    `${switchAnchor}
    case SettingKeys.Offline_Player_Ohko:
      activeOverrides.PLAYER_OHKO_OVERRIDE = value === 1;
      break;`,
    "the Claim All Rewards setting switch case",
  );
}

fs.writeFileSync(settingsTarget, settingsSource, "utf8");

const overridesTarget = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readNormalized(overridesTarget);

if (!overridesSource.includes("PLAYER_OHKO_OVERRIDE")) {
  const overrideAnchor = "  readonly CLAIM_ALL_REWARDS_OVERRIDE: boolean = false;";
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    `${overrideAnchor}
  /** Makes the first hit of each player damage move lethal without bypassing boss rules. */
  readonly PLAYER_OHKO_OVERRIDE: boolean = false;`,
    "CLAIM_ALL_REWARDS_OVERRIDE in overrides.ts",
  );
}

fs.writeFileSync(overridesTarget, overridesSource, "utf8");

const damageTarget = path.join("pokerogue-src", "src", "phases", "move-effect-phase.ts");
let damageSource = readNormalized(damageTarget);

if (!damageSource.includes('import { activeOverrides } from "#app/overrides";')) {
  const importAnchor = 'import { getPokemonNameWithAffix } from "#app/messages";';
  damageSource = replaceRequired(
    damageSource,
    importAnchor,
    `${importAnchor}\nimport { activeOverrides } from "#app/overrides";`,
    "the messages import in move-effect-phase.ts",
  );
}

if (!damageSource.includes("const applyPlayerOhko =")) {
  const calculationAnchor = `    const { result, damage: initialDmg } = target.getAttackDamage({
      source: user,
      move: this.move,
      ignoreAbility: false,
      ignoreSourceAbility: false,
      ignoreAllyAbility: false,
      ignoreSourceAllyAbility: false,
      simulated: false,
      effectiveness,
      isCritical,
    });`;
  const calculationReplacement = `    const attackDamage = target.getAttackDamage({
      source: user,
      move: this.move,
      ignoreAbility: false,
      ignoreSourceAbility: false,
      ignoreAllyAbility: false,
      ignoreSourceAllyAbility: false,
      simulated: false,
      effectiveness,
      isCritical,
    });
    const { result } = attackDamage;
    let initialDmg = attackDamage.damage;`;
  damageSource = replaceRequired(
    damageSource,
    calculationAnchor,
    calculationReplacement,
    "the move damage calculation",
  );

  const guardAnchor = `    if (initialDmg <= 0) {
      return [result, 0, false];
    }

    const isOneHitKo = result === HitResult.ONE_HIT_KO;`;
  const guardReplacement = `    if (initialDmg <= 0) {
      return [result, 0, false];
    }

    // Only the first hit receives cheat-added damage. Later multi-hits retain
    // their natural damage, so the override itself cannot clear several boss shields.
    const applyPlayerOhko =
      activeOverrides.PLAYER_OHKO_OVERRIDE && user.isPlayer() && target.isEnemy() && this.firstHit;
    if (applyPlayerOhko) {
      const naturalDamage = initialDmg;
      if (!target.isBoss()) {
        initialDmg = target.hp;
      } else if (target.bossSegmentIndex > 0) {
        const segmentSize = target.getMaxHp() / target.bossSegments;
        const currentShieldHp = target.hp - Math.round(segmentSize * target.bossSegmentIndex);
        // Guarantee exactly the current shield, but never reduce damage the move
        // would have dealt naturally. EnemyPokemon.damage remains authoritative.
        initialDmg = Math.max(naturalDamage, currentShieldHp);
      } else if (naturalDamage < target.hp) {
        // Keep a final-bar boss catchable unless the unmodified hit was lethal.
        initialDmg = target.hp - 1;
      }
    }

    const isOneHitKo = result === HitResult.ONE_HIT_KO;`;
  damageSource = replaceRequired(
    damageSource,
    guardAnchor,
    guardReplacement,
    "the positive-damage guard in move-effect-phase.ts",
  );

  damageSource = replaceRequired(
    damageSource,
    "          ignoreSegments: isOneHitKo,",
    "          ignoreSegments: isOneHitKo && !applyPlayerOhko,",
    "the native OHKO boss-segment flag",
  );
}

for (const required of [
  "activeOverrides.PLAYER_OHKO_OVERRIDE",
  "target.bossSegmentIndex > 0",
  "Math.max(naturalDamage, currentShieldHp)",
  "ignoreSegments: isOneHitKo && !applyPlayerOhko",
]) {
  if (!damageSource.includes(required)) {
    fail(`Player OHKO guardrail is incomplete: missing ${required}`);
  }
}

fs.writeFileSync(damageTarget, damageSource, "utf8");
console.log("Player OHKO patch applied successfully.");
