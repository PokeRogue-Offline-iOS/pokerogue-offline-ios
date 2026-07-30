# SilverShadow PokéRogue Offline

An unofficial PokéRogue Offline fork with SilverShadow Android branding, optional offline sandbox modifiers, quality-of-life improvements, and an experimental Nintendo Switch port.

> [!IMPORTANT]
> This is not an official PokéRogue or PokéRogue Offline release. It is a personal fan-made fork intended for offline use.

## Download

Download the latest Android APK from the repository's [Releases page](https://github.com/silvershadowkat/pokerogue-offline/releases).

Before installing an update, export your save data and active session as a precaution.

## v1.0.2 Highlights

Version 1.0.2 adds three new optional progression modifiers:

- **Max Luck (SSS)** sets effective party luck to the maximum value of 14.
- **100x Pokémon Candy** multiplies species or starter candy awards by 100.
- **60 Starter Points** increases the starter selection point limit to 60.

All three options have been tested together with every previously available SilverShadow sandbox option enabled at the same time.

## Features

### Fully Offline Gameplay

- Play without a constant internet connection after the game files are installed.
- Save data is stored locally on the device.
- User data and active sessions can be manually imported and exported.
- The real server Daily Run seed is requested when available, but a connection is not required to play.
- The app is built from current PokéRogue source with SilverShadow patches applied during the build.

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

- Default to **Off**
- Are stored locally
- Require a reload after being changed
- Can be enabled together

### Available Options

| Option | Behaviour |
| --- | --- |
| **Free Shop Items** | Makes purchasable shop items cost zero. |
| **Free Rerolls** | Makes normal and locked reward rerolls cost zero. |
| **Free Egg Gacha Pulls** | Egg Gacha pulls do not consume vouchers or tokens. |
| **Guaranteed Capture** | Every valid Poké Ball throw captures the target while still consuming one ball. |
| **Claim All Rewards** | Allows every generated reward slot to be claimed once before leaving or refreshing the reward set. |
| **Max Luck (SSS)** | Sets effective party luck to 14, the maximum SSS value used by the luck and reward systems. |
| **100x Pokémon Candy** | Multiplies species or starter candy awards by 100 while preserving the normal maximum candy cap. |
| **60 Starter Points** | Raises the starter selection point limit to 60. |
| **Allow Duplicate Starters** | Allows up to six independent copies of a species when point and challenge rules permit it. |
| **Starting Level** | Overrides the centralized starting level with a value from 10 through 100. |
| **Shiny Rate** | Multiplies normal generated player/wild shiny rolls from 1x through 100x. |
| **Always Shiny** | Forces shiny for newly generated Pokémon that use the normal shiny-roll path. |
| **Rare Eggs** | Uses Futuba's tier-weighted gacha odds: 12.5% Common, 25% Rare, 25% Epic, and 37.5% Legendary before machine offsets and guarantees. |
| **Instant Hatch** | Schedules eligible eggs for the normal hatch flow at the next egg-lapse opportunity. |
| **Form Change Items** | Adds Rebalanced or Abundant reward-pool access for transformation-related items. |
| **Unlock Starter on Select** | Persistently grants minimum ownership data when Action is pressed on a locked starter. |

### Sandbox Notes

- **Guaranteed Capture** does not bypass encounters where Poké Balls cannot normally be used, including Trainer battles and other restricted encounters.
- **100x Pokémon Candy** affects the species candy used for starter upgrades, egg purchases, passive abilities, and similar unlocks. It does not modify Rare Candy battle items.
- **60 Starter Points** changes the point limit only. Combine it with **Allow Duplicate Starters** when selecting costly duplicate teams.
- **Claim All Rewards** works especially well with **Free Rerolls**, since each reroll generates a fresh reward set.
- **Always Shiny** and **Shiny Rate** do not replace the separate egg shiny roll or retroactively change existing Pokémon.
- **Unlock Starter on Select** permanently changes save data. Export your save before using it; disabling the option does not remove prior unlocks.
- Futuba's **Pandemic** option is intentionally not included because its recovered implementation creates 5,000 Pokérus selections and UI cursors.
- The options share the existing Offline override system and are designed to be
  enabled together; the full on-device combination remains part of the manual
  Android checklist.

Technical behavior, version differences, validation results, and the manual test
matrix are documented in [Futuba Cheat Analysis](docs/FUTABA_CHEAT_ANALYSIS.md).

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

## Google Drive and OAuth Removal

Google Drive backup and Google OAuth integration have been removed from this fork.

Removed functionality includes:

- Google account connection
- Google Drive backup
- Google Drive restore
- Include-current-run Drive setting
- Drive last-played information
- Google session prewarming
- Google social-login Android plugin
- Google OAuth client configuration
- Google-specific Android activity-result handling

Local saves and manual import and export remain available.

## Build Process

Android builds are produced through GitHub Actions.

During a build, the workflow:

1. Downloads the selected upstream PokéRogue source.
2. Applies standard PokéRogue Offline modifications.
3. Applies SilverShadow branding and offline settings.
4. Removes Google Drive and OAuth functionality.
5. Applies sandbox gameplay options in their required order.
6. Applies interface and quality-of-life changes.
7. Applies mobile and Android-specific fixes.
8. Builds the PokéRogue web application.
9. Packages the web build as a Capacitor Android application.
10. Signs the APK using the repository's configured signing certificate.

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

This repository also contains an experimental Nintendo Switch port using nx.js and Phaser.

The real SilverShadow-patched PokéRogue application has reached playable gameplay on real Switch hardware, including:

- Starter selection
- Battles
- Reward selection
- Catching Pokémon
- Cheat settings
- Controller input
- Pokédex persistence
- Active-session continuation

The Switch version remains **Alpha** and is not considered a stable release.

Current limitations can include:

- Long black-screen startup
- No working audio
- Missing-texture placeholders during some effects
- Visual irregularities
- Severe slowdowns in some areas
- Occasional native crashes
- Non-Switch controller prompts

Android builds are separate and are not affected by the Switch port.

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
- [PokéRogue Offline](https://github.com/PokeRogue-Offline/pokerogue-offline)
- The developers, artists, translators, testers, and community contributors behind both projects

This repository is an unofficial fan project and is not affiliated with or endorsed by the official PokéRogue team, Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.

## Notes

- This app is intended for personal offline use.
- Saves are stored locally and are not synchronized with a SilverShadow server.
- Always export a backup before installing experimental builds, changing package variants, clearing application storage, or uninstalling the app.
