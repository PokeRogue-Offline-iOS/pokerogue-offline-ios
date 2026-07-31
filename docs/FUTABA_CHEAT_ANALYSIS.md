# Futuba Cheat Analysis

## Scope and method

This document records a behavioral analysis of the compiled Futuba build at
`C:\Users\plim\Documents\Codex\Futuba` and maps the recovered behavior to the
current PokéRogue source used by SilverShadow PokéRogue Offline.

Futuba was treated only as a behavioral reference. The implementation in this
repository consists of ordered, fail-fast JavaScript source patches; it does not
copy Futuba's minified code or modify a production bundle.

The comparison build was `C:\Users\plim\Documents\Codex\Latest`.

## Build inventory

| Item | Futuba finding |
| --- | --- |
| Reported version | `release-0d94c5b` in `currentVersion.txt` |
| Corresponding source commit | `0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4` |
| Entry point | `index.html` |
| Main JavaScript | `assets/index-d702b145.js` (6,705,071 bytes) |
| Main stylesheet | `assets/index-671ad488.css` |
| Other JavaScript | Service worker only |
| JavaScript source maps | None found |
| Locale/translation source | None found as separate locale files |
| Total extracted files | 29,444 |

The Futuba and Latest directories report the same short source commit, but their
output structures differ materially. Futuba is effectively a single-bundle
build, while Latest is code-split and contains separate locale resources.
Consequently, recovered offsets identify evidence in this particular Futuba
bundle, not stable source locations.

The cheat-setting region begins near byte/character offset 4,965,342 of
`assets/index-d702b145.js`. Recovered setting keys include:

- `STARTING_LEVEL_OVERRIDE`
- `SHINY_RATE`
- `ALWAYS_SHINY`
- `RARE_EGGS`
- `INSTANT_HATCH`
- `FORM_CHANGE_ITEMS`
- `PANDEMIC`
- `UNLOCK_STARTER_ON_SELECT`
- `ENABLE_DUPLICATE_STARTERS`

Other Futuba keys in the same region include `ALWAYS_CATCH`, `FREE_EGGS`,
`MAX_LUCK`, `FREE_REROLLS`, `UNLIMITED_STARTER_POINTS`, and `CANDY_COSTS`.

## Summary

| Option | Futuba behavior recovered | SilverShadow decision | Risk |
| --- | --- | --- | --- |
| Allow Duplicate Starters | Bypasses the add-time species duplicate check only | Implemented with additional current-source slot safety | Medium |
| Starting Level | Overrides the centralized game-mode starting level before normal mode calculation | Implemented | Low |
| Shiny Rate | Multiplies the normal player/wild shiny threshold before Shiny Charm modifiers | Implemented with requested modern values and a probability cap | Low |
| Always Shiny | Forces shiny at the end of the normal generated-Pokémon shiny-roll path | Implemented | Medium |
| Rare Eggs | Replaces gacha tier thresholds with 224/160/96 | Implemented | Medium |
| Instant Hatch | Gives newly pulled eggs one remaining hatch wave | Implemented using the current immediate-hatch override | Low |
| Form Change Items | Adds Rebalanced or Abundant modifier-pool entries | Implemented with a documented current-source adaptation | Medium |
| Candy Costs | Uses Default, quarter-cost Rebalanced, or Free prices | Implemented through current centralized candy-cost getters | Low |
| Unlock Starter on Select | Persistently writes minimum ownership data when Action is pressed on a locked starter | Implemented with save-data warning | High |
| Pandemic | Makes 5,000 seeded Pokérus selections with replacement and allocates 5,000 cursors | Replaced by deterministic All Starters Have Pokérus | Low |

## Allow Duplicate Starters

### Futuba behavior

The compiled hook is in starter-selection logic near offset 5,652,889.
Futuba changes the add-time duplicate predicate so that an existing species is
not considered a duplicate when `ENABLE_DUPLICATE_STARTERS` is enabled.

That change is narrow. The bundle does not repair the surrounding first-match
and species-wide update behavior. In particular, the recovered Futuba change
does not establish reliable per-slot removal or per-copy editing.

### Current source mapping

The current equivalent is
`src/ui/handlers/starter-select-ui-handler.ts`, including:

- Random Starter filtering
- Action-menu Add/Remove construction
- `isInParty`
- `addToParty` and `popStarter`
- moveset, passive, form, gender, shiny, variant, ability, nature, and Tera
  updates
- party-icon refreshes
- point and challenge validation
- start-of-run serialization

Current source already stores each selected starter as a separate record and
serializes the whole `starters` array. The unsafe parts were species-based
`indexOf` calls and loops that updated every record of a species.

### SilverShadow implementation

`patches/all/node/duplicate-starters.js` adds:

- Offline setting `Allow Duplicate Starters`, default Off, reload required
- `ALLOW_DUPLICATE_STARTERS_OVERRIDE`
- duplicate-aware Random Starter filtering
- simultaneous `Add to Party` and `Remove One from Party` choices
- most-recent matching removal from the species grid
- exact highlighted-slot targeting from the team panel
- slot-specific moveset, passive, form, gender, shiny, variant, ability, nature,
  Tera, and icon updates
- independent icon rebuilding after removal

Normal duplicate blocking remains unchanged while the option is Off. Every copy
continues through the existing point-limit and challenge validation. The
existing six-member party maximum remains authoritative, so a seventh copy is
blocked.

When duplicates are enabled, customization from the species grid prepares the
next copy without changing a copy already in the team. Highlighting a copy in
the team panel loads and edits that record's own gender, moveset, and other
starter settings. Passive ownership remains a species-wide unlock, but each
selected record keeps its own enabled or disabled passive state.

The species grid intentionally keeps one selected marker rather than rendering
overlapping markers or a count.

### Recommendation

Recommended and implemented. This deliberately exceeds Futuba's narrow bypass
because reproducing that bypass literally would retain known first-copy and
all-copy editing bugs.

## Starting Level

### Futuba behavior

The relevant `GameMode.getStartingLevel(scene)` logic is near offset 5,080,340.
It returns `scene.startingLevelOverride` first, then falls back to Daily mode
level 20 or normal level 5.

Consequences:

- The override happens before the normal game-mode result is selected.
- Daily mode is overridden too.
- Every selected starter uses the same centralized starting level.
- General enemy wave-level calculation is not changed.
- Other code that asks the game mode for its starting level observes the
  override, including initial-run scaffolding that relies on that value.

### Current source mapping and implementation

Current PokéRogue already exposes `STARTING_LEVEL_OVERRIDE` and centralizes the
calculation. `patches/all/node/starting-level-settings.js` connects the Offline
setting to that existing override with:

`Default, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100`.

Default stores `0`, which preserves the current source's normal calculation.

### Recommendation

Recommended and implemented. Risk is low because the current source already
provides the runtime override.

## Shiny Rate

### Futuba behavior

The relevant generated-Pokémon hook is `Pokemon.trySetShiny`, near offset
5,420,190.

The base PID threshold is 32 out of 65,536. Futuba multiplies that threshold for
player or wild Pokémon (`isPlayer()` or no Trainer) before the normal Shiny
Charm modifier is applied. Trainer-owned Pokémon are excluded from the rate
multiplier.

Futuba's actual compiled menu values are:

`1x, 2x, 3x, 4x, 5x, 10x`

This differs from the requested values listed for the feature. Futuba does not
need an explicit cap with those low multipliers.

The hook affects normal calls to `trySetShiny`, which includes wild Pokémon and
wild bosses generated through that path, plus generated player Pokémon that use
the normal roll. It does not alter:

- egg shiny rolls, which are stored by egg generation and applied separately
- a starter whose shiny state is explicitly selected and passed to construction
- Pokémon created through a shiny-lock or explicit shiny override path
- already existing Pokémon

### SilverShadow implementation

`patches/all/node/shiny-settings.js` uses the requested modern menu values:

`1x, 2x, 4x, 8x, 10x, 20x, 100x`

`SHINY_RATE_MULTIPLIER_OVERRIDE` is applied at the same conceptual point as
Futuba: to player/wild normal shiny thresholds before current-source shiny
modifiers. The result is clamped to the valid interval from 0 through 65,536.
This matters for 100x combined with Shiny Charm modifiers.

### Recommendation

Recommended and implemented. The menu-value divergence is intentional and the
cap is a current-version safety improvement.

## Always Shiny

### Futuba behavior

Futuba assigns `shiny = true` at the end of `Pokemon.trySetShiny`.
Accordingly, it affects newly generated Pokémon whose construction invokes that
normal roll, including trainers when that method is used, even though trainers
are excluded from the Shiny Rate multiplier.

It does not retroactively update existing Pokémon. Egg shiny state and
explicitly configured starter shiny state are applied by separate paths and can
bypass or replace the normal roll. Shiny locks can also bypass or reset it.

Variant generation remains in the normal PokéRogue path. If variant data is not
available, current logic falls back to a standard shiny rather than inventing
an invalid variant.

### SilverShadow implementation

`ALWAYS_SHINY_GENERATION_OVERRIDE` sets shiny after the normal PID comparison in
the current `trySetShiny` implementation. It intentionally preserves the same
scope and limitations rather than claiming to affect every egg, selected
starter, or saved Pokémon.

### Recommendation

Recommended and implemented, with the scope clearly labeled as generated
Pokémon using the normal shiny-roll path.

## Rare Eggs

### Futuba behavior

The gacha tier code is near offsets 5,726,302 and 5,726,680; related helpers
begin near offset 4,973,153.

Normal gacha uses a random integer from 0 through 255 and the current thresholds
52, 8, and 1. With `RARE_EGGS`, Futuba replaces the thresholds with:

- Common threshold: 224
- Rare threshold: 160
- Epic threshold: 96

Before Legendary-machine offset, guarantees, and pity behavior, this yields:

| Tier | Outcomes | Probability |
| --- | ---: | ---: |
| Common | 32/256 | 12.5% |
| Rare | 64/256 | 25% |
| Epic | 64/256 | 25% |
| Legendary | 96/256 | 37.5% |

The Legendary Gacha machine still applies its existing threshold offset. Pull
guarantees and pity logic remain in their normal later paths. This option
changes egg tiers, not the species pool within a tier.

### SilverShadow implementation

`patches/all/node/egg-settings.js` adds `RARE_EGG_ODDS_OVERRIDE` and substitutes
the recovered thresholds only when enabled.

### Recommendation

Recommended and implemented because the term "Rare Eggs" was traced to exact
tier thresholds rather than inferred from its label.

## Instant Hatch

### Futuba behavior

Futuba's egg helper returns one remaining hatch wave for every newly pulled egg
while Instant Hatch is enabled. It does not use zero and does not immediately
award the Pokémon inside the gacha transaction.

The next egg-lapse opportunity triggers the normal hatch phases, animation, and
reward processing. The standard removal flow prevents a repeated-hatch loop.

### Current source mapping and implementation

Current PokéRogue already provides `EGG_IMMEDIATE_HATCH_OVERRIDE`. Its
`EggLapsePhase` behavior schedules eligible eggs for the normal hatch phases
without waiting for the remaining-wave countdown.

`patches/all/node/egg-settings.js` connects the Offline `Instant Hatch` setting
to that existing override. This is behaviorally equivalent at the important
boundary: the next lapse processes a normal hatch, with normal animation and
rewards.

### Recommendation

Recommended and implemented using the current source's purpose-built hook.

## Form Change Items

### Futuba behavior

Recovered modifier-pool hooks occur near offsets 5,110,250, 5,112,412, and
5,113,731.

`Rebalanced` keeps the normal pools and adds:

- Mega Bracelet to Great tier at weight 4
- Dynamax Band to Great tier at weight 4
- eligible DNA Splicers to Rogue tier at weight 1

DNA Splicers remain conditional on having more than one unfused party member.

`Abundant` adds Common-tier entries at weight 500 for:

- DNA Splicers, with the same party eligibility
- Tera Shard
- Evolution Item
- Tera Orb
- Form Change Item
- Mega Bracelet
- Dynamax Band

The option changes reward tier and weight by adding entries. It does not merely
toggle item eligibility.

### Version adaptation

Current source separates regular and rare form-change item generators. The
SilverShadow Abundant mode adds both generators to preserve Futuba's conceptual
"form change items" coverage after the source split.

### SilverShadow implementation

`patches/all/node/form-change-item-settings.js` adds:

- Offline values `Default`, `Rebalanced`, and `Abundant`
- `FORM_CHANGE_ITEM_MODE_OVERRIDE`
- the recovered Great, Rogue, and Common pool entries

Default adds zero weight and preserves vanilla behavior.

### Recommendation

Recommended and implemented. Risk is medium because modifier-pool composition
can change over time and its exact anchors should fail loudly after upstream
pool refactors.

## Candy Costs

Futuba exposes `Default`, `Rebalanced`, and `Free`. Its Rebalanced path uses
25% of the normal price rounded up; Free uses zero. The current source
centralizes the relevant prices in three getters, so
`starter-extra-settings.js` applies the mode to passive unlocks, both starter
point reductions, and same-species egg purchases without duplicating purchase
logic in the starter and Pokédex menus.

## Pandemic

### Futuba behavior

The setting is consumed in Pokérus starter setup near offsets 5,640,585 and
5,649,533.

Normal Futuba code chooses three seeded random starter entries. Pandemic changes
the selection count to 5,000, selecting with replacement, and allocates 5,000
corresponding Pokérus cursor images.

The practical effect is that nearly every starter is likely to be selected at
least once, but it is not a deterministic "all starters have Pokérus" flag.
Duplicates are common, and the 5,000 UI objects create avoidable memory and
rendering risk.

Current source normally selects five Pokérus starters through
`getPokerusStarters`.

### SilverShadow implementation

The literal behavior remains excluded. `All Starters Have Pokérus` sets the
existing `pokerus` field when each selected starter record is created. Every
duplicate copy therefore receives Pokérus independently, while the normal five
daily indicators and cursor objects remain unchanged.

## Unlock Starter on Select

### Futuba behavior

The starter-selection hook is near offset 5,667,289.

Pressing Action on a locked species while the option is enabled writes:

- seen and caught attributes for non-shiny, male, default variant, default form
- first-ability ownership
- IV value 10 in all six stats

It plays the level-up fanfare and calls the save system. It does not immediately
add the species to the party. It does not grant candy, caught-count progression,
passive ownership, hidden ability, shiny state, alternate variants, or alternate
forms.

Because game data is saved, the unlock persists after restart.

### SilverShadow implementation

`patches/all/node/unlock-starter-on-select.js` writes the equivalent persistent
dex and starter-data fields in current source, refreshes starter data, and saves
through the normal save system.

The action is deliberately limited to pressing Action on a locked species.
Merely moving the cursor over a species does not modify data.

### Recommendation

Implemented, but high risk from a user-data perspective. The setting defaults
Off and should be tested only after exporting save data. There is no automatic
rollback for starters unlocked while the option was enabled.

## Reward flow additions

`Reward Claim Mode` is one setting with `Default`, `Claim All`, and `Infinite`,
so Claim All and Infinite cannot be active together. Infinite retains a
successful reward until its own cap is reached. Persistent modifiers use their
live stack maximum, targeted items use the game's target eligibility, and Poké
Balls use their existing per-type cap.

## Patch order and compatibility

The new all-platform order is:

1. `sandbox-progression-settings.js`
2. `claim-all-rewards.js`
3. `reward-sandbox-settings.js`
4. `duplicate-starters.js`
5. `starting-level-settings.js`
6. `shiny-settings.js`
7. `egg-settings.js`
8. `form-change-item-settings.js`
9. `unlock-starter-on-select.js`
10. `starter-extra-settings.js`
11. `player-ohko.js`
12. `infinite-player-pp.js`
13. `infinite-player-hp.js`
14. existing Gacha Calendar and community patches

Claim All Rewards must remain before these additions because it anchors to the
then-final Offline setting and override rows. Each new script checks for its own
markers, requires exact upstream anchors for unapplied work, and leaves its
generated targets byte-identical on a second run.

## Validation results

Validation was performed against a clean checkout of current source commit
`0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4`.

| Check | Result |
| --- | --- |
| JavaScript syntax for all all-platform patch scripts | Passed |
| Clean all-platform patch application | Passed |
| Second run of the three changed/new scripts | Passed; eight generated target hashes unchanged |
| TypeScript `tsc --noEmit` | Passed |
| Biome on the eight generated-source targets | Passed with no fixes required |
| Vite app build | Passed |
| Focused existing offline tests | 15 passed in 2 files |
| Full upstream Vitest suite | Inconclusive: exceeded 120 seconds with many existing offline/session test timeouts |
| Complete Android patch wrapper from an LF checkout | Passed |

The earlier Android wrapper failure was caused by a local CRLF working tree.
The unchanged Android image-path patch matches and completes in an LF checkout,
which mirrors the GitHub Ubuntu runner.

The repository's older `offline-settings-navigation-fix.js` also fails if the
entire patch wrapper is run a second time. The six new scripts themselves pass
the byte-for-byte idempotence check.

### Battle debug option validation

The three battle options were additionally checked from an LF-normalized clean
working tree, matching the GitHub Ubuntu checkout behavior:

| Check | Result |
| --- | --- |
| Complete all-platform patch order | Passed |
| Complete Android patch order, including the unchanged image-path patch | Passed |
| JavaScript syntax for all three independent patch files | Passed |
| Second run of all three battle patches | Passed; seven generated target hashes unchanged |
| Biome formatting on the six modified runtime targets | Passed; no fixes required |
| Focused player-side, boss-shield, final-bar, multi-hit, PP-drain, and sacrificial-heal source assertions | Passed |

The source-only TypeScript check traversed all modified battle and setting
files without a diagnostic in them. Its overall exit remains blocked by
unrelated source/dependency baseline diagnostics in this local validation
checkout. The Android-layer check also lacks the optional Capacitor package and
generated sprite masterlists that are supplied by the full Android build
environment.

## Manual test checklist

Export both save data and the active session before testing Unlock Starter on
Select.

### Duplicate Starters

- [ ] With Allow Duplicate Starters Off, selecting an already selected species
  retains normal duplicate blocking/removal behavior.
- [ ] With it On, add two identical starters.
- [ ] With it On and 60 Starter Points On, select six identical Eternatus.
- [ ] Confirm the displayed point total counts every copy.
- [ ] Confirm a seventh starter cannot be added.
- [ ] From the species grid, use Remove One and confirm only the most recently
  added matching copy is removed.
- [ ] From the team panel, highlight a middle duplicate and remove it; confirm
  that exact slot is removed.
- [ ] Give duplicate copies different moves, nature, ability, form, gender,
  shiny/variant state, Tera type, and passive state where the species supports
  those choices.
- [ ] Prepare a differently configured copy from the species grid and confirm
  the already-selected copy does not change.
- [ ] Re-edit one team-panel copy and confirm the other copies do not change.
- [ ] Start a run with duplicate starters.
- [ ] Save and quit the run, then reload it.
- [ ] Continue the active session and verify all copies and configurations.
- [ ] Test a restrictive challenge and confirm invalid duplicate additions are
  still rejected.
- [ ] Enable every SilverShadow sandbox option and start a duplicate-starter
  run.
- [ ] Turn Allow Duplicate Starters Off, reload, and confirm normal behavior is
  restored for new selections.

### Other settings

- [ ] Starting Level: test Default, 10, and 100 in Classic and Daily; confirm
  selected starters share the chosen level and normal enemies do not.
- [ ] Shiny Rate: test 1x and 100x on new wild encounters; confirm existing
  party members do not change.
- [ ] Always Shiny: generate wild and Trainer Pokémon, then separately test an
  egg and explicitly configured starter to verify the documented scope.
- [ ] Rare Eggs: pull a statistically meaningful batch and confirm mixed tiers
  remain possible; verify guarantees/pity still operate.
- [ ] Instant Hatch: obtain eggs, advance to the next lapse, and confirm normal
  hatch animation, reward, and egg removal.
- [ ] Form Change Items: compare Default, Rebalanced, and Abundant reward pools;
  test DNA Splicers with one and with two unfused party members.
- [ ] Candy Costs: verify Default, quarter-cost rounded-up Rebalanced, and Free
  for passives, both point reductions, and same-species eggs.
- [ ] All Starters Have Pokérus: select distinct and duplicate starters and
  confirm every resulting party member has Pokérus.
- [ ] Pokémon Candy Multiplier: verify 2x, 5x, 10x, 50x, and 100x awards and the
  existing maximum candy cap.
- [ ] Reward Claim Mode: verify Default exits after one reward, Claim All marks
  each slot once, and Infinite keeps repeatable rewards available.
- [ ] Infinite rewards: reach the Map, persistent-item, targeted-item, and Poké
  Ball caps and confirm the exhausted slot becomes claimed.
- [ ] Unlock Starter on Select: with a backup save, press Action on a locked
  starter, restart the app, confirm persistence, and confirm no candy/passive or
  alternate forms were granted.
- [ ] Infinite Player HP: test both player slots in a double battle against
  direct damage, confusion self-hits loaded from an existing save, OHKO moves,
  burn/poison/weather, Perish Song, recoil, self-destruct, and draining moves;
  confirm actual damage remains zero and the opponent versions remain normal.
- [ ] Infinite Player PP: test ordinary use, Pressure, Spite/Eerie Spell, and
  Grudge on multiple party members; apply PP Up/PP Max and confirm maximum PP
  still increases while enemy PP continues to decrease normally.
- [ ] Player OHKO: test misses, immunities, Protect, Substitute, Endure/Sturdy,
  spread moves, and multi-hit moves. On bosses, confirm cheat-added damage
  breaks only the current shield, the final bar stops at 1 HP when natural
  damage was nonlethal, naturally lethal damage remains lethal, and Classic
  final-boss transitions still occur normally.
- [ ] Disable every new option and confirm a normal run still starts.

### Android-specific smoke test

- [ ] Apply the Android patch pipeline from a clean source checkout.
- [ ] Build and install both main and development APKs.
- [ ] Open Settings → Offline and verify every new row and value is reachable by
  touch and controller.
- [ ] Change each setting, reload, and verify persistence.
- [ ] Run the Duplicate Starters checklist on-device.
- [ ] Verify app pause/resume and a full process restart preserve save/session
  data.
- [ ] Confirm no new network dependency is introduced while offline.
