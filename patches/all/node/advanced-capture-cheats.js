#!/usr/bin/env node

/**
 * Add live capture cheats and make successful captures continue through
 * trainer and double battles using the existing faint/victory/summon flow.
 *
 * The capture animation, caught-data persistence, party add/release UI, and
 * EXP award remain in AttemptCapturePhase. Only battle eligibility, target
 * selection, inventory consumption, and post-capture battle continuation are
 * extended.
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

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settingsSource = readFile(settingsPath);
if (!settingsSource.includes("Offline_Catch_Boss_Shields")) {
  const keyAnchor = '  Offline_No_Recharge_Turns: "OFFLINE_NO_RECHARGE_TURNS",';
  const keyReplacement = `${keyAnchor}
  Offline_Unlimited_Pokeballs: "OFFLINE_UNLIMITED_POKEBALLS",
  Offline_Catch_Trainer_Pokemon: "OFFLINE_CATCH_TRAINER_POKEMON",
  Offline_Catch_Double_Battle: "OFFLINE_CATCH_DOUBLE_BATTLE",
  Offline_Catch_Boss_Shields: "OFFLINE_CATCH_BOSS_SHIELDS",`;
  settingsSource = replaceRequired(settingsSource, keyAnchor, keyReplacement, "the no-recharge setting key");
}

if (!settingsSource.includes('label: "Catch Bosses Through Shields"')) {
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
  const rows = [
    ["Offline_Unlimited_Pokeballs", "Unlimited Poke Balls"],
    ["Offline_Catch_Trainer_Pokemon", "Catch Trainer Pokemon"],
    ["Offline_Catch_Double_Battle", "Catch Pokemon in Double Battles"],
    ["Offline_Catch_Boss_Shields", "Catch Bosses Through Shields"],
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
  settingsSource = replaceRequired(settingsSource, rowAnchor, `${rowAnchor}\n${rows}`, "the no-recharge settings row");
}

if (!settingsSource.includes("case SettingKeys.Offline_Catch_Boss_Shields:")) {
  const switchAnchor = `    case SettingKeys.Offline_No_Recharge_Turns:
      activeOverrides.PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE = value === 1;
      break;`;
  const switchReplacement = `${switchAnchor}
    case SettingKeys.Offline_Unlimited_Pokeballs:
      activeOverrides.UNLIMITED_POKEBALLS_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Catch_Trainer_Pokemon:
      activeOverrides.CATCH_TRAINER_POKEMON_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Catch_Double_Battle:
      activeOverrides.CATCH_DOUBLE_BATTLE_OVERRIDE = value === 1;
      break;
    case SettingKeys.Offline_Catch_Boss_Shields:
      activeOverrides.CATCH_BOSS_SHIELDS_OVERRIDE = value === 1;
      break;`;
  settingsSource = replaceRequired(
    settingsSource,
    switchAnchor,
    switchReplacement,
    "the no-recharge setting switch case",
  );
}
writeFile(settingsPath, settingsSource);

const overridesPath = path.join("pokerogue-src", "src", "overrides.ts");
let overridesSource = readFile(overridesPath);
if (!overridesSource.includes("CATCH_BOSS_SHIELDS_OVERRIDE")) {
  const overrideAnchor = `  /** Instantly releases charge moves and suppresses player recharge tags. */
  readonly PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE: boolean = false;`;
  const overrideReplacement = `${overrideAnchor}
  /** Allows selecting and throwing any Poke Ball at a zero count without consuming it. */
  readonly UNLIMITED_POKEBALLS_OVERRIDE: boolean = false;
  /** Allows capture attempts against trainer-owned Pokemon. */
  readonly CATCH_TRAINER_POKEMON_OVERRIDE: boolean = false;
  /** Allows choosing one capture target in a wild double battle. */
  readonly CATCH_DOUBLE_BATTLE_OVERRIDE: boolean = false;
  /** Bypasses the remaining-boss-shield capture restriction. */
  readonly CATCH_BOSS_SHIELDS_OVERRIDE: boolean = false;`;
  overridesSource = replaceRequired(
    overridesSource,
    overrideAnchor,
    overrideReplacement,
    "PLAYER_SKIP_CHARGE_RECHARGE_OVERRIDE",
  );
}
writeFile(overridesPath, overridesSource);

const ballUiPath = path.join("pokerogue-src", "src", "ui", "handlers", "ball-ui-handler.ts");
let ballUiSource = readFile(ballUiPath);
if (!ballUiSource.includes('import { activeOverrides } from "#app/overrides";')) {
  ballUiSource = replaceRequired(
    ballUiSource,
    'import { globalScene } from "#app/global-scene";',
    'import { globalScene } from "#app/global-scene";\nimport { activeOverrides } from "#app/overrides";',
    "the globalScene import in ball-ui-handler.ts",
  );
}
if (!ballUiSource.includes("activeOverrides.UNLIMITED_POKEBALLS_OVERRIDE")) {
  ballUiSource = replaceRequired(
    ballUiSource,
    "        if (globalScene.pokeballCounts[this.cursor]) {",
    "        if (globalScene.pokeballCounts[this.cursor] || activeOverrides.UNLIMITED_POKEBALLS_OVERRIDE) {",
    "the Poke Ball inventory selection check",
  );
}
writeFile(ballUiPath, ballUiSource);

const commandPath = path.join("pokerogue-src", "src", "phases", "command-phase.ts");
let commandSource = readFile(commandPath);
if (!commandSource.includes('import { activeOverrides } from "#app/overrides";')) {
  commandSource = replaceRequired(
    commandSource,
    'import { getPokemonNameWithAffix } from "#app/messages";',
    'import { getPokemonNameWithAffix } from "#app/messages";\nimport { activeOverrides } from "#app/overrides";',
    "the message import in command-phase.ts",
  );
}
commandSource = commandSource.replace(
  'import { globalScene } from "#app/global-scene";\nimport { activeOverrides } from "#app/overrides";\nimport { speciesDataRegistry } from "#app/global-species-data-registry";\nimport { getPokemonNameWithAffix } from "#app/messages";',
  'import { globalScene } from "#app/global-scene";\nimport { speciesDataRegistry } from "#app/global-species-data-registry";\nimport { getPokemonNameWithAffix } from "#app/messages";\nimport { activeOverrides } from "#app/overrides";',
);
if (!commandSource.includes("battleType === BattleType.TRAINER && !activeOverrides.CATCH_TRAINER_POKEMON_OVERRIDE")) {
  commandSource = replaceRequired(
    commandSource,
    "    } else if (battleType === BattleType.TRAINER) {",
    "    } else if (battleType === BattleType.TRAINER && !activeOverrides.CATCH_TRAINER_POKEMON_OVERRIDE) {",
    "the trainer-battle capture restriction",
  );
}
if (!commandSource.includes("const canChooseCaptureTarget")) {
  const multiAnchor = `    if (targets.length > 1) {
      this.queueShowText("battle:noPokeballMulti");
      return false;
    }`;
  const multiReplacement = `    const canChooseCaptureTarget =
      activeOverrides.CATCH_DOUBLE_BATTLE_OVERRIDE
      || (globalScene.currentBattle.battleType === BattleType.TRAINER
        && activeOverrides.CATCH_TRAINER_POKEMON_OVERRIDE);
    if (targets.length > 1 && !canChooseCaptureTarget) {
      this.queueShowText("battle:noPokeballMulti");
      return false;
    }`;
  commandSource = replaceRequired(commandSource, multiAnchor, multiReplacement, "the double-battle capture restriction");
}
if (!commandSource.includes("&& !activeOverrides.CATCH_BOSS_SHIELDS_OVERRIDE")) {
  const bossAnchor = `        targetPokemon?.isBoss()
        && targetPokemon?.bossSegmentIndex >= 1 // TODO: Decouple this hardcoded exception for wonder guard and just check the target...
        && !targetPokemon?.hasAbility(AbilityId.WONDER_GUARD, false, true)`;
  const bossReplacement = `${bossAnchor}
        && !activeOverrides.CATCH_BOSS_SHIELDS_OVERRIDE`;
  commandSource = replaceRequired(commandSource, bossAnchor, bossReplacement, "the remaining boss-shield capture check");
}
if (!commandSource.includes("targets.length > 1 && canChooseCaptureTarget")) {
  const targetAnchor = `      globalScene.currentBattle.turnCommands[this.fieldIndex]!.targets = targets;
      if (this.fieldIndex) {`;
  const targetReplacement = `      globalScene.currentBattle.turnCommands[this.fieldIndex]!.targets = targets;
      if (targets.length > 1 && canChooseCaptureTarget) {
        globalScene.phaseManager.unshiftNew("SelectTargetPhase", this.fieldIndex);
      }
      if (this.fieldIndex) {`;
  commandSource = replaceRequired(commandSource, targetAnchor, targetReplacement, "the capture turn-command target assignment");
}
writeFile(commandPath, commandSource);

const selectTargetPath = path.join("pokerogue-src", "src", "phases", "select-target-phase.ts");
let selectTargetSource = readFile(selectTargetPath);
if (!selectTargetSource.includes('import { MoveId } from "#enums/move-id";')) {
  selectTargetSource = replaceRequired(
    selectTargetSource,
    'import { Command } from "#enums/command";',
    'import { Command } from "#enums/command";\nimport { MoveId } from "#enums/move-id";',
    "the Command import in select-target-phase.ts",
  );
}
if (!selectTargetSource.includes("const isBallCommand = turnCommand?.command === Command.BALL")) {
  const startAnchor = `    const turnCommand = globalScene.currentBattle.turnCommands[this.fieldIndex];
    const moveId = turnCommand?.move?.move;
    if (!moveId) {
      this.end();
      return;
    }

    // TODO: Move the logic for computing default targets here instead of \`target-select-ui-handler\`
    const move = allMoves[moveId];
    const fieldSide = globalScene.getField();

    const user = fieldSide[this.fieldIndex];
    const ally = user.getAlly();
    const shouldDefaultToAlly =
      globalScene.currentBattle.double // formatting
      && move.allyTargetDefault
      && ally != null
      && !ally.isFainted();
    const defaultTargets = shouldDefaultToAlly ? [ally.getBattlerIndex()] : undefined;`;
  const startReplacement = `    const turnCommand = globalScene.currentBattle.turnCommands[this.fieldIndex];
    const moveId = turnCommand?.move?.move;
    const isBallCommand = turnCommand?.command === Command.BALL;
    if (!moveId && !isBallCommand) {
      this.end();
      return;
    }

    // Poke Balls have no MoveId. Supply their active enemy targets directly
    // to the existing target UI and keep its normal single-target controls.
    const explicitTargets = isBallCommand
      ? globalScene.getEnemyField(true).map(pokemon => pokemon.getBattlerIndex())
      : undefined;
    const move = isBallCommand ? null : allMoves[moveId!];
    const fieldSide = globalScene.getField();

    const user = fieldSide[this.fieldIndex];
    const ally = user.getAlly();
    const shouldDefaultToAlly =
      !isBallCommand
      && globalScene.currentBattle.double // formatting
      && move!.allyTargetDefault
      && ally != null
      && !ally.isFainted();
    const defaultTargets = shouldDefaultToAlly ? [ally.getBattlerIndex()] : undefined;`;
  selectTargetSource = replaceRequired(selectTargetSource, startAnchor, startReplacement, "SelectTargetPhase setup");

  const uiAnchor = `      this.fieldIndex,
      move.id,
      (targets: BattlerIndex[]) => {`;
  const uiReplacement = `      this.fieldIndex,
      isBallCommand ? MoveId.NONE : move!.id,
      (targets: BattlerIndex[]) => {`;
  selectTargetSource = replaceRequired(selectTargetSource, uiAnchor, uiReplacement, "the target-selection UI arguments");

  const restrictAnchor = `        if (targets[0]) {
          const restrictingTag = user.getTargetRestrictingTag(moveId, fieldSide[targets[0]]);`;
  const restrictReplacement = `        if (!isBallCommand && targets[0]) {
          const restrictingTag = user.getTargetRestrictingTag(moveId!, fieldSide[targets[0]]);`;
  selectTargetSource = replaceRequired(selectTargetSource, restrictAnchor, restrictReplacement, "the move target restriction check");

  const endArgsAnchor = `      },
      defaultTargets,
    );`;
  const endArgsReplacement = `      },
      defaultTargets,
      explicitTargets,
    );`;
  selectTargetSource = replaceRequired(selectTargetSource, endArgsAnchor, endArgsReplacement, "the target-selection optional arguments");
}
if (selectTargetSource.includes("restrictingTag.selectionDeniedText(user, moveId)")) {
  selectTargetSource = replaceRequired(
    selectTargetSource,
    "restrictingTag.selectionDeniedText(user, moveId)",
    "restrictingTag.selectionDeniedText(user, moveId!)",
    "the target-restriction denial message MoveId",
  );
}
writeFile(selectTargetPath, selectTargetSource);

const targetUiPath = path.join("pokerogue-src", "src", "ui", "handlers", "target-select-ui-handler.ts");
let targetUiSource = readFile(targetUiPath);
if (!targetUiSource.includes("explicitTargets?: BattlerIndex[]")) {
  const signatureAnchor = `  show(
    args: [fieldIndex: number, moveId: MoveId, callback: TargetSelectCallback, defaultTargets?: BattlerIndex[]],
  ): boolean {`;
  const signatureReplacement = `  show(
    args: [
      fieldIndex: number,
      moveId: MoveId,
      callback: TargetSelectCallback,
      defaultTargets?: BattlerIndex[],
      explicitTargets?: BattlerIndex[],
    ],
  ): boolean {`;
  targetUiSource = replaceRequired(targetUiSource, signatureAnchor, signatureReplacement, "TargetSelectUiHandler.show signature");

  const targetsAnchor = `    const moveTargets = getMoveTargets(user, this.move);
    this.targets = moveTargets.targets;
    this.isMultipleTargets = moveTargets.multiple;`;
  const targetsReplacement = `    const explicitTargets = args[4];
    const moveTargets = explicitTargets
      ? { targets: explicitTargets, multiple: false }
      : getMoveTargets(user, this.move);
    this.targets = moveTargets.targets;
    this.isMultipleTargets = moveTargets.multiple;`;
  targetUiSource = replaceRequired(targetUiSource, targetsAnchor, targetsReplacement, "the target source calculation");
}
writeFile(targetUiPath, targetUiSource);

const capturePath = path.join("pokerogue-src", "src", "phases", "attempt-capture-phase.ts");
let captureSource = readFile(capturePath);
if (!captureSource.includes('import { BattleType } from "#enums/battle-type";')) {
  captureSource = replaceRequired(
    captureSource,
    'import { BattlerIndex } from "#enums/battler-index";',
    'import { BattleType } from "#enums/battle-type";\nimport { BattlerIndex } from "#enums/battler-index";',
    "the BattlerIndex import in attempt-capture-phase.ts",
  );
}
if (!captureSource.includes('import { SwitchType } from "#enums/switch-type";')) {
  captureSource = replaceRequired(
    captureSource,
    'import { StatusEffect } from "#enums/status-effect";',
    'import { StatusEffect } from "#enums/status-effect";\nimport { SwitchType } from "#enums/switch-type";',
    "the StatusEffect import in attempt-capture-phase.ts",
  );
}
if (!captureSource.includes("if (!activeOverrides.UNLIMITED_POKEBALLS_OVERRIDE)")) {
  captureSource = replaceRequired(
    captureSource,
    "    globalScene.pokeballCounts[this.pokeballType]--;",
    `    if (!activeOverrides.UNLIMITED_POKEBALLS_OVERRIDE) {
      globalScene.pokeballCounts[this.pokeballType]--;
    }`,
    "the Poke Ball inventory decrement",
  );
}
if (!captureSource.includes("const hasReservePartyMember = globalScene")) {
  const endAnchor = `          globalScene.phaseManager.unshiftNew("VictoryPhase", this.battlerIndex);
          globalScene.pokemonInfoContainer.hide();
          this.removePb();
          this.end();`;
  const endReplacement = `          globalScene.phaseManager.unshiftNew("VictoryPhase", this.battlerIndex);
          if ([BattleType.TRAINER, BattleType.MYSTERY_ENCOUNTER].includes(globalScene.currentBattle.battleType)) {
            const hasReservePartyMember = globalScene
              .getEnemyParty()
              .some(
                partyMember =>
                  partyMember.isActive() && !partyMember.isOnField() && partyMember.trainerSlot === pokemon.trainerSlot,
              );
            if (hasReservePartyMember) {
              globalScene.phaseManager.pushNew(
                "SwitchSummonPhase",
                SwitchType.SWITCH,
                this.fieldIndex,
                -1,
                false,
                false,
              );
            }
          }
          globalScene.pokemonInfoContainer.hide();
          this.removePb();
          this.end();`;
  captureSource = replaceRequired(captureSource, endAnchor, endReplacement, "the post-capture VictoryPhase queue");

  const removeAnchor = `        const removePokemon = () => {
          globalScene.addFaintedEnemyScore(pokemon);
          pokemon.hp = 0;
          pokemon.doSetStatus(StatusEffect.FAINT);
          globalScene.clearEnemyHeldItemModifiers();
          pokemon.leaveField(true, true, true);
        };`;
  const removeReplacement = `        const removePokemon = () => {
          globalScene.currentBattle.enemyFaints += 1;
          globalScene.currentBattle.enemyFaintsHistory.push({
            pokemon,
            turn: globalScene.currentBattle.turn,
          });
          globalScene.addFaintedEnemyScore(pokemon);
          pokemon.hp = 0;
          pokemon.doSetStatus(StatusEffect.FAINT);
          const allyPokemon = pokemon.getAlly();
          if (globalScene.currentBattle.double && allyPokemon != null) {
            globalScene.redirectPokemonMoves(pokemon, allyPokemon);
          }
          globalScene.clearEnemyHeldItemModifiers(pokemon);
          // Keep the enemy-party record alive until reserve switching or
          // BattleEndPhase cleanup, matching the normal faint path.
          pokemon.leaveField(true, true, false);
        };`;
  captureSource = replaceRequired(captureSource, removeAnchor, removeReplacement, "the captured-Pokemon field removal");

  const modifierAnchor =
    "          const modifiers = globalScene.findModifiers(m => m instanceof PokemonHeldItemModifier, false);";
  const modifierReplacement = `          const modifiers = globalScene.findModifiers(
            m => m instanceof PokemonHeldItemModifier && m.getPokemon() === pokemon,
            false,
          );`;
  captureSource = replaceRequired(captureSource, modifierAnchor, modifierReplacement, "the captured held-item lookup");
}
if (captureSource.includes('switchDiagnostics?.checkpoint?.("capture:queue-reserve"')) {
  const obsoleteDiagnostic = `              switchDiagnostics?.checkpoint?.("capture:queue-reserve", {
                wave: globalScene.currentBattle?.waveIndex ?? null,
                fieldIndex: this.fieldIndex,
              });
`;
  captureSource = replaceRequired(
    captureSource,
    obsoleteDiagnostic,
    "",
    "the obsolete shared Switch diagnostic",
  );
}
writeFile(capturePath, captureSource);

for (const marker of [
  "UNLIMITED_POKEBALLS_OVERRIDE",
  "CATCH_TRAINER_POKEMON_OVERRIDE",
  "CATCH_DOUBLE_BATTLE_OVERRIDE",
  "CATCH_BOSS_SHIELDS_OVERRIDE",
]) {
  if (!readFile(overridesPath).includes(marker)) {
    fail(`Missing capture-cheat override marker: ${marker}`);
  }
}

console.log("Advanced capture cheats applied successfully.");
