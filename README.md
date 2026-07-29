# SilverShadow PokéRogue Offline

This repository is a personal fork of PokéRogue Offline with custom Android branding, optional offline gameplay modifiers, and Android-specific improvements.

> [!IMPORTANT]
> This is not an official PokéRogue or PokéRogue Offline release.

## Android Package IDs

The Android applications use custom SilverShadow package IDs so they do not conflict with the original PokéRogue Offline application.

| Build | Package ID |
| --- | --- |
| Main | `com.silvershadow.pkr` |
| Development | `com.silvershadow.pkrdev` |

Future APKs must continue using the same package ID and signing certificate to install as updates without deleting local application data.

## Custom Branding

The Android application and title-screen build label have been changed to use SilverShadow branding instead of the original offline-client branding.

The project supports separate main and development builds.

The development build uses its own:

- Package ID
- Application name
- Icon
- APK filename
- `DEV` title-screen label

## Offline Sandbox Options

The existing Offline settings menu has been extended with optional sandbox gameplay settings.

All options default to **Off** and are stored using the existing local settings system.

### Free Shop Items

All purchasable shop items cost zero.

### Free Rerolls

Normal and locked rerolls cost zero.

### Free Egg Gacha Pulls

Egg Gacha pulls do not consume vouchers or tokens.

### Guaranteed Capture

Every valid Poké Ball throw successfully captures the target while still consuming one ball.

Guaranteed Capture does not bypass encounters where Poké Balls cannot normally be used, including restricted encounters and Trainer battles.

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

Local save storage and manual save import and export remain available.

## Android Background Audio Handling

The mobile background-audio handling has been updated to use the native Capacitor application lifecycle.

Music pauses when:

- The phone screen is locked
- The application is sent to the background
- The user switches to another application

Music resumes when PokéRogue returns to the foreground.

Browser visibility events remain available as a fallback when native lifecycle events are unavailable.

## Build Process

The Android build continues to use the existing GitHub Actions workflow.

During each build, the workflow:

1. Downloads the selected upstream PokéRogue branch.
2. Applies the standard PokéRogue Offline patches.
3. Removes Google Drive and OAuth functionality.
4. Applies the SilverShadow sandbox settings.
5. Applies Android-specific fixes.
6. Builds the PokéRogue web application.
7. Packages it as a Capacitor Android application.
8. Signs the APK using the configured repository keystore.

The main and development builds contain the same gameplay changes but use separate Android package identities.

## Nintendo Switch proof of concept

The `feature/switch-port` work adds an isolated nx.js V8 / Phaser 3 Milestone 1
proof without changing existing platform builds. It uses exactly
`@nx.js/runtime@1.0.0-beta.6`, `@nx.js/nro@1.0.0-beta.6`, Phaser `3.90.0`, and
fat/self-contained NRO packaging.

This is not yet a playable PokéRogue port. Read
[`docs/SWITCH_PORT.md`](docs/SWITCH_PORT.md) for the feasibility assessment and
[`docs/SWITCH_INSTALL.md`](docs/SWITCH_INSTALL.md) for hardware test steps.

## Save Data Warning

> [!WARNING]
> Android stores application data separately for every package ID.

Data does not automatically transfer between:

- `com.silvershadow.pkr`
- `com.silvershadow.pkrdev`
- The original PokéRogue Offline package

Export your user data and active session before moving between package versions.

Do not uninstall the main application or clear its application storage without first exporting a backup.

## Updating From Upstream

This fork can continue receiving updates from:

`PokeRogue-Offline/pokerogue-offline`

After syncing the fork with upstream, a new APK can be built through GitHub Actions.

The SilverShadow patches are reapplied to the newly downloaded PokéRogue source during every build.

Upstream changes may occasionally require the custom patch scripts to be updated when source files or expected code blocks change.


# ORIGINAL README:

# PokeRogueOffline

A fully offline wrapper for PokéRogue, available on iOS, Android, Windows, and Linux. Play fully offline with local saves, or import your save from [pokerogue.net](https://pokerogue.net).

## Features

- Fully offline — no internet required after install
  - Exception: Starting a daily run will *attempt* to connect to this repo, but is not required.
- Local saves that persist between sessions
- Import saves from your online account
- Based on the latest `main` branch of [pagefaultgames / pokerogue](https://github.com/pagefaultgames/pokerogue/)

## What's New

### New Features
- Added a **Clear All Data** option in Settings → Offline — this deletes all current data. **USE WITH CAUTION**.
- This is the **only** offline client that loads the actual server daily seed. Useful when there are special event daily runs.
- Includes the build number in the banner for support reasons.

### Changes to How the App is Built
The app pulls directly from the official PokéRogue source and applies a small set of targeted fixes on top of it. This means the app will always be up to date with whatever the official game ships, with no manual syncing required.

## Importing your save

1. Go to [pokerogue.net](https://pokerogue.net) on a browser and log in
2. Navigate to **Pause → Manage Data → Export Save**
3. Open PokeRogueOffline and navigate to **Pause → Manage Data → Import Save**
4. Select the exported file

## Notes

- This app is for personal use only
- Saves are stored locally and are not synced to any server
- This is an unofficial fan project and is not affiliated with the PokéRogue team
