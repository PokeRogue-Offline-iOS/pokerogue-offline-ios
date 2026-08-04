# Live SilverShadow gameplay settings

The Offline settings were audited against the generated PokéRogue source at
the event where each override is consumed. A setting is marked live only when
changing it updates `activeOverrides` immediately and its consumers read that
value again without relying on boot-time or scene-initialization state.

## Live without a restart

| Setting | Takes effect |
| --- | --- |
| Free Shop Items | On the next displayed price refresh and shop purchase |
| Free Rerolls | On the next reroll; the current reroll label refreshes |
| Free Egg Gacha Pulls | On the next gacha pull |
| Guaranteed Capture | On the next valid capture calculation |
| Max Luck (SSS) | On the next party-luck query/reward generation |
| Pokémon Candy Multiplier | On the next starter-candy award |
| Starting Level | When the next run creates its starting party |
| Shiny Rate / Always Shiny | On the next normal generated-Pokémon shiny roll |
| Rare Eggs | On the next egg-tier roll |
| Instant Hatch | At the next egg-lapse check |
| Form Change Items | On the next modifier-pool weight evaluation |
| Unlock Starter on Select | On the next Action press on a locked starter |
| All Starters Have Pokérus | When the next starter record is created |
| Candy Costs | On the next cost query or purchase menu construction |
| Reward Claim Mode | On the next reward interaction |
| Infinite Player HP | On the next player damage boundary |
| Infinite Player PP | On the next player moveset, move-use, or PP-drain boundary |
| Player OHKO | On the next first hit of a player damage move |
| Never Miss | On the next player accuracy check |
| Always Critical Hit | On the next player damage calculation |
| Always Move First | On the next queued attack-order comparison |
| No Charge / Recharge Turns | On the next player charge or recharge effect |
| Run Never Fails | On the next normally permitted Run attempt |
| Full Heal After Every Battle | At the end of the next victorious battle |
| Unlimited Poke Balls | On the next ball selection and throw |
| Catch Trainer Pokemon | On the next trainer-battle ball eligibility check |
| Catch Pokemon in Double Battles | On the next wild double-battle ball command |
| Catch Bosses Through Shields | On the next boss-shield capture check |
| Money Multiplier | On the next positive money gain |
| EXP Multiplier | On the next per-Pokemon EXP award |
| Candy Jar Count | Immediately in an active run; otherwise when the next run initializes |
| Ignore Evolution Requirements | On the next level-up evolution lookup |
| Unlimited TM Compatibility | On the next TM generation or compatibility query |

Turning a generator setting on does not rewrite already-generated state. For
example, Always Shiny affects the next eligible Pokémon, Starting Level affects
the next run, and All Starters Have Pokérus affects starter records created
after the setting changes. Candy Jar Count is the exception with explicit
dual behavior: the native picker edits the actual modifier stack when a run is
active and stores a new-run starting count when no run is active.

## Still restart-required

| Setting | Why the current selection is reset |
| --- | --- |
| 60 Starter Points | Disabling it can leave an already-selected team above the normal point cap. |
| Allow Duplicate Starters | Disabling it can leave duplicate records in editing paths that normally assume one record per species. |

The settings UI appends an asterisk only to these two rows and performs its
existing in-process reset when the Offline settings screen closes after either
one changes.

The complete advanced behavior, capture continuation design, setting
categories, deferred arbitrary-starter-move design, and back-to-back manual
test plan are documented in [ADVANCED_CHEATS.md](ADVANCED_CHEATS.md).

## Shop override correction

The original setting wiring updated `WAIVE_SHOP_FEES_OVERRIDE`, but the shop
affordability, deduction, deferred move-shop deduction, and displayed-price
paths accidentally checked `WAIVE_ROLL_FEE_OVERRIDE`. The live-settings patch
separates those paths: Free Shop Items controls purchases, while Free Rerolls
controls only rerolls.
