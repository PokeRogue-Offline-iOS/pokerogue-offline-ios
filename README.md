# SilverShadow PokéRogue Offline

An unofficial PokéRogue Offline fork with SilverShadow Android branding, optional offline sandbox modifiers, quality-of-life improvements, and an experimental Nintendo Switch port.

> [!IMPORTANT]
> This is not an official PokéRogue or PokéRogue Offline release. It is a personal fan-made fork intended for offline use.

## Download

Download the latest Android APK or Nintendo Switch Alpha `-switch.zip` from the repository's [Releases page](https://github.com/silvershadowkat/pokerogue-offline/releases).

Before installing an update, export your save data and active session as a precaution.

The Switch build is an experimental homebrew Alpha. Read the installation and known-issues sections below before using it.

## v2.0.0 Highlights

Version 2.0.0 expands the Offline sandbox with starter customization, reward
generation, progression, and battle-debugging options. It also adds the first
public Nintendo Switch Alpha package, including:

- A self-contained nx.js NRO with a SilverShadow Homebrew Menu icon.
- Full offline PokéRogue gameplay files packaged into four random-access asset containers instead of roughly 34,000 loose files.
- Hardware-tested fixes for controller input, rendering, fonts, local saves, BGM playback, reward selection, and returning from targeted rewards.
- Clear startup diagnostics and checks for missing or damaged asset packs.

The expanded sandbox includes:

- **Duplicate Starters** supports up to six independently customized copies of
  the same species, including separate moves, gender, nature, ability, form,
  shiny variant, Tera type, and passive selection.
- **Reward Claim Mode** combines the mutually exclusive Default, Claim All, and
  Infinite reward behaviors into one setting.
- **Infinite Player HP**, **Infinite Player PP**, and **Player OHKO** provide
  guarded battle-debugging tools that preserve enemy behavior, boss shields,
  scripted boss limits, and normal move resolution.
- **Starting Level**, **All Starters Have Pokérus**, and **Unlock Starter on
  Select** add targeted starter setup controls.
- **Pokémon Candy Multiplier** now offers Default, 2x, 5x, 10x, 50x, and 100x;
  **Candy Costs** separately offers Default, Rebalanced, and Free costs.
- **Shiny Rate**, **Always Shiny**, **Rare Eggs**, **Instant Hatch**, and **Form
  Change Items** provide configurable generation and progression shortcuts.

The experimental **Fast Reward UI** option was removed from v2.0.0. Reward
claims use the normal game interface and animation flow for stability.

## Features

### Fully Offline Gameplay

- Play without a constant internet connection after the game files are installed.
- Save data is stored locally on the device.
- User data and active sessions can be manually imported and exported.
- The live Daily Run seed is mirrored from PokéRogue's official API by this fork's own workflow and cached by the app.
  If that feed is unavailable, the game immediately falls back to a deterministic UTC-date seed and remains playable offline.
- The app is built from current PokéRogue source with SilverShadow patches applied during the build.

The **Publish Daily Run Seed** workflow requests the seed from PokéRogue's official API several times during the first
three UTC hours and publishes a dated JSON payload to this fork's own `seed` branch. To avoid Cloudflare rejecting a
command-line request from a GitHub runner, the workflow uses a real first-party `pokerogue.net` browser context with the
Chrome and ChromeDriver already installed on the runner. It does not use Scooom's server or another offline seed mirror. If the
official service remains unavailable, it publishes a marked, non-cacheable offline fallback that a later scheduled run
can replace. After enabling Actions on a new fork, run that workflow once manually to create the branch immediately.
The app reads this fork's raw `seed` branch URL.

### SilverShadow Android Branding

The Android app uses SilverShadow branding rather than the original offline-client identity.

| Build | Package ID |
| --- | --- |
| Main | `com.silvershadow.pkr` |
| Development | `com.silvershadow.pkrdev` |

The development build has its own:

- Package ID
- Application name
- Icon
- APK filename
- `DEV` title-screen label

The separate package IDs allow the main and development versions to be installed on the same Android device.

> [!WARNING]
> Android stores application data separately for every package ID. Saves do not automatically transfer between the main build, development build, or original PokéRogue Offline app.

## Offline Sandbox Options

The **Settings → Offline** menu includes optional gameplay modifiers.

All sandbox options:

- Default to **Off** or the normal game value
- Are stored locally
- Take effect at their next documented runtime boundary; only **60 Starter
  Points** and **Allow Duplicate Starters** retain an in-process reload
- Can be enabled together, except that reward claiming uses one mutually
  exclusive mode

### Available Options

| Option | Behaviour |
| --- | --- |
| **Free Shop Items** | Makes purchasable shop items cost zero. |
| **Free Rerolls** | Makes normal and locked reward rerolls cost zero. |
| **Free Egg Gacha Pulls** | Egg Gacha pulls do not consume vouchers or tokens. |
| **Guaranteed Capture** | Every valid Poké Ball throw captures the target while still consuming one ball. |
| **Unlimited Poke Balls** | Allows every ball type to be thrown at zero count without consuming inventory. |
| **Catch Trainer Pokemon** | Allows trainer-owned Pokemon to be captured while the battle continues through remaining opponents. |
| **Catch Pokemon in Double Battles** | Adds target selection and continuation when capturing one opponent in a wild double battle. |
| **Catch Bosses Through Shields** | Bypasses the remaining-shield capture check without bypassing other encounter restrictions. |
| **Reward Claim Mode** | **Default** keeps the normal single choice, **Claim All** allows each generated slot to be taken once, and **Infinite** retains eligible rewards for repeated selection. |
| **Max Luck (SSS)** | Sets effective party luck to 14, the maximum SSS value used by the luck and reward systems. |
| **Pokémon Candy Multiplier** | Selects Default, 2x, 5x, 10x, 50x, or 100x species-candy awards while preserving the normal cap. |
| **Candy Costs** | Uses Default, Rebalanced (25%, rounded up), or Free passive, point-reduction, and same-species egg costs. |
| **60 Starter Points** | Raises the starter selection point limit to 60. |
| **Allow Duplicate Starters** | Allows up to six independently customized copies of a species when point and challenge rules permit them. |
| **All Starters Have Pokérus** | Gives every selected starter record Pokérus, including every duplicate copy. |
| **Starting Level** | Selects Default or level 10 through 100 in increments of 10 for the player's selected starters. |
| **Shiny Rate** | Selects 1x, 2x, 4x, 8x, 10x, 20x, or 100x for normal generated player/wild shiny rolls. |
| **Always Shiny** | Forces shiny for newly generated Pokémon that use the normal shiny-roll path. |
| **Rare Eggs** | Uses tier-weighted gacha odds: 12.5% Common, 25% Rare, 25% Epic, and 37.5% Legendary before machine offsets and guarantees. |
| **Instant Hatch** | Schedules eligible eggs for the normal hatch flow at the next egg-lapse opportunity. |
| **Form Change Items** | Selects Default, Rebalanced, or Abundant reward-pool access for form-changing items and prerequisites. |
| **Unlock Starter on Select** | Pressing Action on a locked starter persistently grants its minimum ownership data and immediately refreshes its visual state. |
| **Infinite Player HP** | Makes every battle damage result zero for both player field slots; enemies retain normal damage. |
| **Infinite Player PP** | Prevents move-use, Pressure, Grudge, and move-based PP depletion for the player's party without changing enemy PP or PP Up/PP Max upgrades. |
| **Player OHKO** | Amplifies the first successful hit of a player damage move while preserving immunities, protection, substitutes, Endure effects, boss shields, and scripted boss caps. |
| **Never Miss** | Makes player accuracy rolls succeed while preserving protection, immunity, reflection, and semi-invulnerable-state rules. |
| **Always Critical Hit** | Marks every non-fixed player damage calculation as critical. |
| **Always Move First** | Orders player attacks before opponent attacks while retaining normal order within each side. |
| **No Charge / Recharge Turns** | Resolves player charging moves immediately and suppresses Hyper Beam-style recharge turns. |
| **Full Heal After Every Battle** | Restores the full party's HP, PP, faint/status state, and confusion after a victory. |
| **Money Multiplier** | Selects Default, 2x, 5x, 10x, or 100x for positive money gains without changing prices. |
| **EXP Multiplier** | Selects Default, 2x, 4x, 8x, 16x, or 100x for each party member's EXP award. |
| **Candy Jar Count** | Opens the native scrolling picker to set an exact 0-9,999 starting or live-run Candy Jar stack; the old 99-stack runtime cap is removed. |
| **Ignore Evolution Requirements** | Makes the first matching formal evolution eligible on the next level-up event, one evolution per EXP award. |
| **Unlimited TM Compatibility** | Makes the complete TM reward pool teachable to every player Pokemon. |

### Sandbox Notes

- **Guaranteed Capture** does not bypass encounters where Poké Balls cannot normally be used, including Trainer battles and other restricted encounters.
- **Pokémon Candy Multiplier** affects awarded species candy. It does not modify Rare Candy battle items or the separate **Candy Costs** setting.
- **Candy Costs** applies to passive unlocks, both starter point reductions, and same-species eggs. Rebalanced costs are 25% of normal, rounded up; Free costs are zero.
- **Candy Jar Count** affects both Rare Candy and Rarer Candy through their normal Candy Jar modifier. Outside a run it configures the next run; inside a run the row displays and edits the real current stack immediately.
- **60 Starter Points** changes the point limit only. Combine it with **Allow Duplicate Starters** when selecting costly duplicate teams.
- With duplicate starters enabled, species-grid customization prepares the next copy. Highlight a selected copy in the team panel to edit or remove that specific copy; adding another copy is done from the main species pool. Gender, moves, nature, ability, form, shiny variant, Tera type, and passive selection are stored per copy and survive save/continue.
- Passive ownership is still unlocked once per species, while the enabled/disabled passive choice is stored independently on each selected duplicate.
- **Claim All** rewards can each be taken once from the generated set. **Infinite** rewards remain selectable after a successful claim until the game's stack, uniqueness, or target-eligibility rules reach their cap. Unique persistent items such as Map and capped Poké Balls are then marked claimed, while targeted rewards retain their normal eligibility checks.
- **Always Shiny** and **Shiny Rate** do not replace the separate egg shiny roll or retroactively change existing Pokémon.
- **Rare Eggs** changes the base egg-tier weights only; the selected machine's normal offsets and guaranteed pulls still apply. **Instant Hatch** sets eligible eggs to one remaining wave and lets the normal hatch, reward, and removal flow complete them.
- **Form Change Items: Rebalanced** modestly adds prerequisite and fusion items to their normal reward tiers. **Abundant** adds very high-weight Common-tier access to eligible fusion, Tera, evolution, Mega, Dynamax, and regular/rare form-change items; normal eligibility checks still decide what can appear.
- **Unlock Starter on Select** grants the minimum seen/caught state, first ability, and baseline IVs needed to select the species. It does not grant candy, passives, hidden abilities, shiny variants, or extra forms. The change is permanent save data, so export a backup before using it; disabling the option does not remove prior unlocks.
- Futuba's literal **Pandemic** implementation is intentionally not included because it creates 5,000 Pokérus selections and UI cursors. **All Starters Have Pokérus** provides the deterministic result without that allocation.
- **Infinite Player HP** acts at the shared HP-damage boundary, so direct hits,
  confusion self-hits, recoil, drain, status/weather damage, Perish Song, OHKO
  moves, and self-damage all finish their normal effect flow but deal zero
  actual damage to either player field slot, including double battles. It
  prevents new damage but does not heal HP already missing, and intentionally
  leaves non-battle scripted HP changes alone.
- **Infinite Player PP** covers normal move use, Pressure, PP-removing moves,
  and Grudge for the player's party only. PP Up and PP Max can still increase a
  move's maximum PP, and enemies continue using PP normally.
- **Player OHKO** adds damage only after a move successfully produces positive
  damage. Cheat-added boss damage stops at the current shield, and a final-bar
  boss is left at 1 HP unless the move's original damage was naturally lethal.
  This preserves catch opportunities and forced story transitions. Misses,
  immunities, protection, substitutes, Endure/Sturdy behavior, and other enemy
  damage rules stay authoritative. Later hits of a multi-hit move keep their
  unmodified damage.
- The options share the existing Offline override system and are designed to be
  enabled together; the full on-device combination remains part of the manual
  Android checklist.

Technical behavior, version differences, validation results, and the manual test
matrix are documented in [Futuba Cheat Analysis](docs/FUTABA_CHEAT_ANALYSIS.md).
The newer battle, capture, evolution, TM, and multiplier behavior is documented
in [Advanced Cheats](docs/ADVANCED_CHEATS.md). The starter and active-party
editor, saved builds, and unrestricted registry move browser are documented in
[Pokemon Editor](docs/POKEMON_EDITOR.md).

## Additional Quality-of-Life Features

### Gacha Calendar

A read-only **Gacha Calendar** screen is available from the pause menu near Egg Gacha.

It displays the Legendary Gacha boost for each day of the selected month using PokéRogue's own Legendary Gacha date calculation.

### Update Notifications

Release builds can check GitHub for newer SilverShadow releases when the app launches.

- An **Update Available!** notice appears on the title screen when a newer release is found.
- The optional update pop-up can display changelogs for missed versions.
- Update checks fail silently when the device is offline.
- Development builds skip the release update check.

### Touch-Control Auto Hide

Touch controls fade out after two seconds without touch input.

- Touching the screen reveals them again.
- Keyboard or controller input does not force them to remain visible.
- This makes switching between touchscreen and controller play less distracting.

### Settings Navigation Fixes

The Offline settings screen includes navigation fixes for:

- Touchscreen forward and reverse tab buttons
- Controller `LB` and `RB` tab navigation
- Leaving and returning to the Offline settings screen

### Android Background Audio Handling

Music pauses when:

- The phone screen is locked
- The app is sent to the background
- The user switches to another app

Music resumes when PokéRogue returns to the foreground.

The Android implementation uses the native Capacitor application lifecycle, with browser visibility events retained as a fallback.

### Mobile Save Import and Export Fixes

The mobile build includes targeted fixes for importing and exporting local save data.

Manual save management remains available through:

**Pause → Manage Data**

### Clear All Data

The Offline settings menu includes a **Clear All Data** option.

> [!CAUTION]
> This permanently deletes the app's local data. Export a backup before using it.

### Offline-Focused Menus and Labels

The fork includes several interface adjustments for offline use:

- SilverShadow title-screen branding and build information
- Offline-specific settings menu
- Updated title labels
- Offline-appropriate Community menu entries
- Removal of irrelevant online administration options
- Direct access to the app repository
- Improved update-available screen

## Save Data

### Importing an Online Save

1. Open [pokerogue.net](https://pokerogue.net) in a browser and sign in.
2. Open **Pause → Manage Data → Export Save**.
3. Open SilverShadow PokéRogue Offline.
4. Open **Pause → Manage Data → Import Save**.
5. Select the exported save file.

### Moving Between SilverShadow Builds

Data does not automatically transfer between:

- `com.silvershadow.pkr`
- `com.silvershadow.pkrdev`
- The original PokéRogue Offline package
- Other PokéRogue Android forks

Export both your user data and active session before switching package versions.

Do not uninstall the main app or clear its Android application storage until you have confirmed that your backup can be imported.

## Google Drive Backups

Supported Android, iOS, Windows, Linux, and macOS builds include manual Google
Drive backup and restore in **Settings → Offline**. Backups use only the hidden
Drive app-data folder and can optionally include the current run. Manual local
save import/export remains available and is recommended as a second backup.

OAuth values are injected from repository secrets. Builds without credentials
still complete, but Google connection reports that it is not configured. See
[Google Drive OAuth setup](docs/GOOGLE_DRIVE_SETUP.md) for the exact client
types, package IDs, signing SHA-1 requirements, and secret names. The
network-disabled Nintendo Switch build intentionally omits Drive integration.

## Build Process

Android builds are produced through GitHub Actions.

During a build, the workflow:

1. Downloads the selected upstream PokéRogue source.
2. Applies standard PokéRogue Offline modifications.
3. Applies SilverShadow branding and offline settings.
4. Adds the Offline settings, live sandbox gameplay options, and Google Drive backup UI.
5. Applies interface and quality-of-life changes.
6. Applies mobile and Android-specific fixes, including the native Google sign-in bridge.
7. Builds the PokéRogue web application.
8. Packages the web build as a Capacitor Android application.
9. Signs the APK using the repository's configured signing certificate.

The main and development APKs contain the same gameplay modifications but use separate Android identities.

Future main releases must continue using the same `com.silvershadow.pkr` package ID and signing certificate to install over an existing version without deleting its local data.

## Patch System

SilverShadow changes are kept as targeted, ordered patch scripts rather than directly maintaining a full copy of the generated PokéRogue source.

Important directories include:

| Path | Purpose |
| --- | --- |
| `patches/` | Ordered JavaScript patch scripts for shared, mobile, Android, and Switch changes |
| `new-files/` | New source files copied into PokéRogue during patching |
| `scripts/` | Patch runner, build helpers, and supporting scripts |
| `.github/workflows/` | Automated Android build and release workflows |
| `switch/` | Nintendo Switch nx.js bootstrap and packaging work |
| `docs/` | Switch architecture, installation, compatibility, and testing documentation |

The patch runner intentionally stops when an expected upstream code anchor cannot be found. This prevents a build from silently producing a partially patched or unpredictable application.

## Nintendo Switch Alpha

This repository contains an experimental Nintendo Switch homebrew port built with [nx.js](https://github.com/TooTallNate/nx.js) and Phaser. Android builds are separate and are not affected by the Switch port.

> [!WARNING]
> The Switch build remains **Alpha**. Back up your saves, expect occasional stalls, and do not treat a successful build or a short play session as proof of long-session stability.

### Confirmed Working on Real Switch Hardware

The following have worked on a Nintendo Switch OLED in handheld, title-override/application-memory mode:

- The custom SilverShadow icon appears in the Homebrew Menu and the self-contained NRO launches.
- Offline package validation, indexed asset loading, and readable fatal diagnostics.
- The title screen, starter selection, Pokédex, party screen, battles, rewards, menus, and continuation of an active run.
- WebGL rendering scaled correctly from PokéRogue's 1920×1080 layout to the 1280×720 handheld display.
- Readable regular and bitmap fonts.
- Attached-controller D-pad navigation and Nintendo A/B behavior.
- PLUS-menu access in tested ordinary scenes.
- Catching Pokémon and persistence of Pokédex and active-session data after fully closing and relaunching.
- Save and Quit followed by Continue.
- BGM playback and looping during tested gameplay.
- Immediate rewards and targeted reward flows such as Rare Candy and PP Up returning to an interactive reward screen.
- SilverShadow offline settings and cheats during tested sessions.
- Front-end assets, sprites, animations, fonts, locales, audio, and game data loaded directly from four uncompressed random-access packs without extracting thousands of SD-card files.

These are hardware observations, not guarantees for every console, firmware, controller arrangement, game mode, move, Pokémon form, or length of play session.

### Switch Requirements

- A homebrew-capable Nintendo Switch with Atmosphère and hbmenu.
- At least 1 GB of free SD-card space.
- Title-override/application-memory mode. Album/applet mode does not provide enough memory.
- A backup of `/switch/SilverShadow-PokeRogue/saves/` before updating.

### Installing the `-switch.zip`

1. Download the release file whose name ends in `-switch.zip`.
2. Back up your existing `/switch/SilverShadow-PokeRogue/saves/`, `config/`, and `logs/` directories if present.
3. Extract the ZIP directly to the SD-card root. The final NRO path must be:

   ```text
   /switch/SilverShadow-PokeRogue/SilverShadow-PokeRogue.nro
   ```

4. Allow the release files to replace older files, but preserve `saves/`, `config/`, and `logs/`.
5. If updating from the former loose-asset build, remove only the obsolete `game/assets/`, `game/audio/`, `game/battle-anims/`, `game/fonts/`, `game/images/`, and `game/locales/` directories after the new package has copied successfully. Never delete the whole `SilverShadow-PokeRogue` directory.
6. Hold `R` while starting an installed Switch title to enter hbmenu with title override, then launch **SilverShadow PokeRogue**.
7. Allow at least 60 seconds for the first screen. A long black screen during this period does not necessarily mean the application has frozen.

The fat NRO already contains the nx.js runtime. No separate runtime NRO, NSP forwarder, network connection, or extraction of the four `.sspack` files is required.

### Building the Switch ZIP with GitHub Actions

Run the **Build PokeRogueOffline Switch NRO** workflow manually, or let it run for a matching pull request or push to `main`. The workflow builds the pinned, SilverShadow-patched PokÃ©Rogue source, creates a fat NRO, generates the Homebrew Menu icon from `configs/android/icon-main.png`, builds and verifies the four `.sspack` files, and uploads `SilverShadow-PokeRogue-v<upstream>-<SilverShadow>-switch.zip`. The ZIP starts with the `switch/` directory and is ready to extract to an SD-card root.

The shared release version comes from `configs/release-version.txt`. Updating
that one file controls Android, iOS, Windows, macOS, Linux AppImage, Switch,
release tags, native package metadata, title-screen banners, and artifact
versioning. Every packaged icon is generated from
`configs/android/icon-main.png`, or `configs/android/icon-dev.png` for supported
development builds. The workflows reject an invalid version before packaging.

### Expected Loading Behavior

- A cold launch can remain black for approximately 35–45 seconds before showing the first game content. Some observed launches have exceeded 40 seconds and looked frozen while still loading.
- Returning to the main menu triggers a similar full refresh and can again appear frozen for roughly 40 seconds.
- Smaller loading hiccups can occur during play while assets are read or decoded from the SD card.
- Wait at least 60 seconds before assuming a black loading screen has failed. If an error screen appears, retain the newest `/switch/SilverShadow-PokeRogue/logs/milestone2-*.log`.

### Memory and Stability Warning

Normal gameplay has been smooth enough in the sessions tested so far, but many consecutive battles and very long sessions have not been thoroughly stress-tested.

Extreme reward-cheat use can exhaust native memory. In particular, repeatedly using infinite/free rerolls or generating and claiming many reward sets without leaving the reward phase can eventually block further rerolls, cause severe slowdown, or crash the homebrew process. The build includes a memory guard to stop rerolls before the most dangerous point, but it cannot make unlimited stress use safe. Save, fully close, and relaunch if memory pressure develops.

Other Alpha limitations include:

- Occasional loading stalls or native crashes may still occur.
- Some move effects may still show a missing-texture placeholder or another visual irregularity.
- PLUS behavior, suspend/resume, docked mode, detached controllers, controller reconnection, and long-session audio lifecycle have not been exhaustively tested.
- Some on-screen button prompts may still use keyboard or Xbox-style artwork.
- Real hardware behavior can vary with firmware, Atmosphère, hbmenu, SD-card speed, filesystem, and controller configuration.

### Updating and Troubleshooting

Release updates should be merged over the existing application folder so local saves remain in place. Never distribute, overwrite, or delete another user's `saves/`, `config/`, or `logs/` directories.

Each launch writes a timestamped diagnostic log under:

```text
/switch/SilverShadow-PokeRogue/logs/milestone2-*.log
```

When reporting a problem, include the newest complete log, a photo of any error screen, the step that failed, and whether title override was used.

Detailed Switch information is available in:

- [`docs/SWITCH_PORT.md`](docs/SWITCH_PORT.md)
- [`docs/SWITCH_NXJS_COMPATIBILITY.md`](docs/SWITCH_NXJS_COMPATIBILITY.md)
- [`docs/SWITCH_INSTALL.md`](docs/SWITCH_INSTALL.md)
- [`docs/SWITCH_ALPHA_STATUS.md`](docs/SWITCH_ALPHA_STATUS.md)

## Updating From Upstream

This fork can continue receiving updates from:

- [PokeRogue-Offline/pokerogue-offline](https://github.com/PokeRogue-Offline/pokerogue-offline)
- [pagefaultgames/pokerogue](https://github.com/pagefaultgames/pokerogue)

After upstream changes are synchronized, GitHub Actions downloads the selected PokéRogue source and reapplies the SilverShadow patches.

Upstream changes may occasionally move or rewrite the code used as a patch anchor. When this happens, the affected patch must be reviewed and updated before a new build can complete.

## Credits

SilverShadow PokéRogue Offline builds on the work of:

- [PokéRogue](https://github.com/pagefaultgames/pokerogue)
- [PokéRogue Offline](https://github.com/PokeRogue-Offline/pokerogue-offline), including Scooom and its contributors, which is the base of this fork
- [nx.js](https://github.com/TooTallNate/nx.js) by Nathan Rajlich and its contributors, which provides the Nintendo Switch JavaScript runtime and NRO tooling
- [Phaser](https://github.com/phaserjs/phaser), used by PokéRogue for rendering and game systems
- The developers, artists, translators, testers, and community contributors behind these projects

PokéRogue source is distributed under the GNU Affero General Public License v3.0. nx.js is distributed under the MIT License. The Switch package includes the applicable license texts and third-party notices. Corresponding source for SilverShadow release builds is available in this repository and its release tag.

This repository is an unofficial fan project and is not affiliated with or endorsed by the official PokéRogue team, Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.

## Notes

- This app is intended for personal offline use.
- Saves are stored locally and are not synchronized with a SilverShadow server.
- Always export a backup before installing experimental builds, changing package variants, clearing application storage, or uninstalling the app.
