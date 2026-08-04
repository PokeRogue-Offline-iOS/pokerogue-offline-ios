# Advanced cheat catalog and behavior

This document covers the advanced cheats added by
`advanced-battle-cheats.js`, `advanced-capture-cheats.js`,
`advanced-progression-cheats.js`, and `candy-jar-cheat.js`. They are shared `patches/all` behavior, so
the same runtime code is used by Windows, Linux, macOS, iOS, Android, and
Switch builds.

All settings in this document update `activeOverrides` immediately. A change
does not rewrite an event that has already been queued or generated; it is
read at the next boundary described below.

## Settings catalog

The Offline settings screen groups all existing and new cheats into these
contiguous sections:

| Section | Settings |
| --- | --- |
| Shop | Free Shop Items, Free Rerolls, Money Multiplier |
| Rewards | Reward Claim Mode, Max Luck (SSS) |
| Progress | EXP Multiplier, Candy Jar Count, Pokemon Candy Multiplier, Candy Costs |
| Team | 60 Starter Points, Allow Duplicate Starters, Starting Level, Unlock Starter on Select, All Starters Have Pokerus |
| Generation / Gacha | Free Egg Gacha Pulls, Rare Eggs, Instant Hatch, Shiny Rate, Always Shiny, Form Change Items |
| Capture | Guaranteed Capture, Unlimited Poke Balls, Catch Trainer Pokemon, Catch Pokemon in Double Battles, Catch Bosses Through Shields |
| Battle | Infinite Player HP, Infinite Player PP, Player OHKO, Never Miss, Always Critical Hit, Always Move First, No Charge / Recharge Turns, Full Heal After Every Battle |
| Evolution / TM | Ignore Evolution Requirements, Unlimited TM Compatibility |

The first row in each section receives a compact visible section prefix. The
existing Google Drive, backup, clear-data, and update rows remain above the
cheat catalog.

## Battle cheats

### Never Miss

The player's next accuracy roll is treated as successful. This is deliberately
an accuracy cheat, not a universal bypass. It preserves:

- Protect and related protection effects;
- type and ability immunities;
- Magic Coat and Magic Bounce reflection;
- semi-invulnerable states such as Fly or Dig unless the move can normally hit
  that state;
- Commander and targets that are no longer on the field.

It applies to each player-controlled hit, including both player slots in a
double battle.

### Always Critical Hit

Every player damage calculation is marked critical. It bypasses normal crit
rolls and crit-blocking effects because the requested result is unconditional.
Fixed-damage moves remain non-critical because a crit cannot alter their
damage and several downstream effects assume that rule.

### Always Move First

Player attack phases are sorted before opponent attack phases. Normal move
priority and speed still order moves within the player side and within the
opponent side. The setting does not reorder switches, Poke Ball throws, run
attempts, or other non-attack commands.

### Full Heal After Every Battle

After a victorious battle, every Pokemon in the player party is restored to
maximum HP, fainted Pokemon are revived, persistent status and confusion are
cleared, and every move's used PP is reset to zero. The restoration is
immediate at `BattleEndPhase`, after normal post-battle abilities. It does not
activate after a loss or heal during a battle.

### No Charge / Recharge Turns

Player charging moves use the game's existing instant-charge route and attack
on the same turn. Player `RechargeAttr` is suppressed, so Hyper Beam-style
moves do not add a recharge turn.

The cheat does not suppress independent consecutive-use mechanics. Rage,
Outrage-style rampage, Rollout, move queues, delayed attacks, and similar
automatic sequences retain their normal tags and behavior.

## Capture cheats

### Unlimited Poke Balls

Every Poke Ball type remains selectable at a displayed count of zero. Throws
do not decrement the selected ball count while the setting is on, including
when the player already owns one or more of that ball.

This setting changes inventory only. It does not guarantee the capture or
bypass encounter restrictions.

### Catch Trainer Pokemon and double-battle continuation

`Catch Trainer Pokemon` removes the trainer-battle eligibility block. It also
enables target selection in trainer double battles so the trainer cheat meets
its single- and double-battle contract. `Catch Pokemon in Double Battles`
enables the same target selection for wild double battles. A trainer battle
still requires `Catch Trainer Pokemon`; turning on only the double-battle
setting does not make trainer-owned Pokemon catchable.

A successful capture retains the normal animation, caught-data persistence,
party-add flow, full-party summary/release UI, and EXP phase. For battle
continuation, the captured enemy is then processed as a removed combatant:

1. Its enemy-faint count/history and score entry are recorded.
2. Its HP/status are marked fainted so victory logic will not count it as a
   remaining trainer party member.
3. Only that Pokemon's held-item modifiers are transferred and cleared.
4. Pending double-battle attacks aimed at it are redirected through the
   existing faint-target redirector.
5. The field object leaves without being destroyed, allowing the existing
   Victory and reserve-switch phases to inspect it safely.
6. A living reserve in the same trainer slot is queued with the same
   `SwitchSummonPhase` used after a normal faint.
7. The battle ends only when no active wild opponent or non-fainted trainer
   party member remains.

Capturing is not a knockout, so PostFaint, PostKnockOut, and PostVictory
ability effects are intentionally not fired. This avoids effects such as
Moxie or Aftermath treating a capture as an attack KO while preserving the
requested battle flow.

### Catch Bosses Through Shields

This bypasses only the remaining-shield check (`bossSegmentIndex >= 1`). It
does not make an otherwise forbidden encounter catchable, bypass final-boss
ownership/challenge restrictions, or imply a guaranteed catch. Combine it
with Guaranteed Capture if the throw itself must always succeed.

## Economy and progression cheats

### Money Multiplier

Options are Default, 2x, 5x, 10x, and 100x. Positive values entering the
central `BattleScene.addMoney` gain boundary are multiplied and floored. Shop
prices, spending, and any future negative adjustment are not multiplied.

### EXP Multiplier

Options are Default, 2x, 4x, 8x, 16x, and 100x. Each party member's calculated
EXP is multiplied immediately before its EXP display/award phase. Participant
shares, Pokerus, EXP Share/Balance behavior, and Pokemon-specific boosters are
calculated through the normal pipeline.

### Candy Jar Count

This row is an action-backed number picker rather than a left/right cheat
toggle. Press Action to open the game's native scrolling option menu and pick
an exact value from 0 through 9,999. The picker uses the same UI/input path on
keyboard, controller, touchscreen, Windows, Linux, macOS, iOS, Android, and
Switch. Its large-list rendering is restricted to the visible window so
moving the cursor does not rebuild thousands of off-screen labels. Up/Down
moves by one and Left/Right jumps by 100 for practical controller and touch
navigation.

The setting has two deliberate modes:

- Outside a run, it stores the exact Candy Jar count assigned when the next
  standard or daily run initializes.
- Inside a run, the row reads the real current Candy Jar modifier stack. A
  confirmed choice immediately replaces that stack; choosing 0 removes it.

Opening settings never overwrites a loaded run with the configured starting
value. A loaded save keeps its serialized Candy Jar count until the player
confirms a new value. The persistent modifier's old maximum of 99 is raised to
JavaScript's safe-integer limit, so normal item rewards can continue stacking
beyond the picker range. Both Rare Candy and Rarer Candy already consume the
same Candy Jar modifier, so each receives the selected bonus without a second
multiplier path.

### Ignore Evolution Requirements

On a level-up event, `PlayerPokemon.getEvolution()` selects the first formal
evolution registered for the Pokemon's current form, without checking level,
time, friendship, trade, held-item, gender, move, biome, party, or evolution
item requirements.

`LevelUpPhase` performs one evolution lookup even if the EXP award grants many
levels, so at most one evolution is queued for that award. For example, a
multi-level Charmander award can produce Charmeleon, not immediately chain to
Charizard. A later level-up event performs the next lookup.

Important boundaries:

- The existing Pause Evolutions choice is still respected.
- Branching species use the first registry entry matching the current form.
  This is deterministic but does not add a branch-selection prompt.
- Fusion halves use the same formal-evolution rule.
- Mega Evolution, Gigantamax, Dynamax, Terastallization, and other form-change
  systems use separate registries/phases and are not selected by this cheat.

### Unlimited TM Compatibility

Every player Pokemon reports the complete `tmPoolTiers` move set as compatible.
The normal caller flags still remove moves already known, learned by level-up,
or already used when those exclusions are requested.

This changes both ends of the TM flow:

- reward generation now considers the full TM pool compatible with the party,
  rather than hiding TMs no current party member can learn;
- the party teach UI reports every valid, not-already-known TM as Able.

TM tier weights and reward rarity are unchanged. Compatibility-based mystery
encounter requirements also see the expanded compatibility, which is
consistent with the Pokemon actually being able to learn that TM. Pokedex
species pages continue to display the legitimate species TM list.

## Deferred: arbitrary starter move editor

The arbitrary starter move editor was not added in this change. It is the one
request that crosses persistent system-save schema, a large controller/touch
UI, duplicate-starter editing, and run-start validation. Reusing the existing
`moveset` field would be unsafe: `setSpeciesDetails()` filters it back to the
species' legitimate level/egg pool, and `SelectStarterPhase` validates it again
when creating the run.

The recommended implementation is a separate feature change with this shape:

1. Add a live `Custom Starter Moves` cheat toggle.
2. Add a separate optional `customMoveset` field to `StarterDataEntry`, its
   form-indexed equivalent, the compressed system-save key map, defaults, and
   old-save validation/migration. Never overwrite the legitimate `moveset`.
3. Add `customMoveset` to the transient selected `Starter` record so duplicate
   copies can be edited independently during team selection.
4. Add a distinct `Manage Any Moves` action beside the normal `Manage Moves`
   action only while the cheat is enabled.
5. Use a dedicated searchable or type/category-filtered, paged move picker.
   Passing the complete move registry to the current generic option list would
   be slow and difficult to use with a controller.
6. Validate one to four unique, real `MoveId` values and exclude placeholder or
   unusable internal move records.
7. At run creation, apply `customMoveset` with validation bypass only when the
   cheat is currently enabled. When disabled, retain the saved custom data but
   use and display the untouched legitimate moveset.
8. Cover species forms, duplicate selected copies, save export/import, old
   saves without the new key, fresh-start challenges, touch, keyboard, and
   controller navigation in tests.

The main product choice for that later work is persistence scope. The safest
default is to persist one custom moveset per species/form, while allowing an
already-selected duplicate copy to diverge for the current team. Persisting a
separate permanent moveset for every duplicate slot would require a new
slot-identity model rather than the existing species-keyed starter save.

## Back-to-back manual test plan

Use a disposable save/export and toggle each setting off again without
restarting after its positive test.

1. Open Offline settings and confirm the eight section prefixes and ordering.
2. In a normal battle, test Never Miss with a low-accuracy move, then confirm
   Protect, an immunity, and a semi-invulnerable target still work normally.
3. Test Always Critical Hit with an ordinary damage move and a target that can
   normally block crits; confirm a fixed-damage move remains fixed.
4. Give an opponent a higher-speed priority move and the player a low-priority
   move; confirm the player attacks first while the toggle is on and normal
   order returns immediately when it is off.
5. Test a charging move, Hyper Beam, Rage, an Outrage-style move, and Rollout.
   Charge/recharge should be skipped; the three consecutive-use mechanics
   should continue normally.
6. Finish a battle with missing HP, a fainted party member, status, confusion,
   and used PP. Confirm the entire party is restored only after victory.
7. Set a ball count to zero, throw that ball, and confirm it remains zero. Also
   throw a ball with a positive count and confirm the count is unchanged.
8. In a wild double battle, capture the left and right slots in separate runs.
   Confirm the animation/UI, remaining enemy turn, targeting, and final battle
   end. Repeat once with a failed capture.
9. In a trainer single battle with reserves, catch the lead and confirm the
   next Pokemon is sent out. Fill the player party first and exercise both the
   release and decline paths.
10. In a trainer double battle with at least one reserve per relevant trainer
    slot, capture each side separately. Confirm the partner remains, pending
    moves redirect normally, the correct reserve enters, and the battle ends
    only after all opponents are defeated or caught.
11. Attempt a shielded boss with the shield cheat off and on. Confirm other
    encounter/final-boss restrictions remain authoritative.
12. Record a known money and EXP reward and verify every multiplier option,
    including the 100x cap/floor behavior.
13. Outside a run, set Candy Jar Count to 250 and begin both a standard run and
    a daily run; confirm each starts at 250. In a loaded run with a different
    count, open Offline settings and confirm the row shows the saved run's
    actual value without changing it. Pick 0, 100, and 9,999 in succession and
    confirm the modifier bar and both Rare Candy and Rarer Candy update without
    restarting. Earn another Candy Jar at 9,999 and confirm it stacks to 10,000.
14. With evolution requirements ignored, test a low-level standard evolution,
    an item/trade/friendship evolution, a branching species, and a multi-level
    EXP award. Confirm one formal evolution per award and no Mega/Gigantamax/
    Dynamax/Tera form change.
15. Generate TM rewards with a deliberately incompatible party, teach one to
    that Pokemon, and confirm known/used exclusions still work. Turn the cheat
    off and confirm legitimate compatibility returns.
16. Repeat the battle/capture tests in both player slots where possible and
    once with existing Infinite HP, Infinite PP, Player OHKO, Guaranteed
    Capture, and reward cheats enabled together.

## Validation completed during implementation

| Check | Result |
| --- | --- |
| JavaScript syntax for all five advanced-cheat patch scripts | Passed |
| Idempotent direct reapplication of the five advanced-cheat patch scripts | Passed |
| Clean `all` patch application (desktop/web: Windows, Linux, macOS) | Passed |
| Clean `mobile` patch application (iOS + shared mobile) | Passed |
| Clean `android` patch application | Passed |
| Clean `switch` patch application | Passed |
| Source TypeScript check for clean shared desktop/mobile output | Passed with temporary validation stubs for the Capgo dependency and unpopulated asset-submodule JSON |
| Source TypeScript check after the Switch overlay | Passed with temporary validation JSON for the unpopulated asset submodule |
| Production app-mode Vite build after the Switch overlay | Passed |
| Biome check of generated files touched by the advanced patches | Candy Jar output clean; older Google Drive/live-settings formatting findings remain |

Native APK, IPA, macOS DMG, and NRO packages were not produced. The repository
handoff forbids building an Android APK for this task, and Apple-native packages
require macOS/Xcode. Clean source patching covers every defined patch layer;
interactive gameplay and native hardware remain the manual test boundary.
