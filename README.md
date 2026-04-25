# PokeRogueOffline (iOS)

An fully offline wrapper for PokéRogue, built with Capacitor. Play fully offline with local saves, or import your save from [pokerogue.net](https://pokerogue.net).

## Features

- Fully offline — no internet required after install
- Local saves that persist between sessions
- Import saves from your online account
- Based on the latest `main` branch of [pagefaultgames / pokerogue](https://github.com/pagefaultgames/pokerogue/)

## What's New

### New Features
- Added an **Unlock Everything** option in Manage Data — this instantly unlocks all starters, forms, and progression without needing to import a save manually.
- Added an **Reset Everything** option in Manage Data — this deletes all current data. **USE WITH CAUTION**.

- Includes the build number in the banner for support reasons.

### Changes to How the App is Built
The app pulls directly from the official PokéRogue source and applies a small set of targeted fixes on top of it. This means the app will always be up to date with whatever the official game ships, with no manual syncing required.

Four of those fixes are improvements I've submitted to the PokéRogue team for inclusion in the main game. Once they're accepted, the app will automatically stop applying them and just use the official versions. The three pending changes are:

- [#7077](https://github.com/pagefaultgames/pokerogue/pull/7077) — A new setting to skip the "are you sure?" prompt when choosing not to learn a move
- [#7222](https://github.com/pagefaultgames/pokerogue/pull/7222) — A fix for the file import screen on iOS
- [#7223](https://github.com/pagefaultgames/pokerogue/pull/7223) — A fix to stop the screen from accidentally zooming in when tapping quickly
- [#7269](https://github.com/pagefaultgames/pokerogue/pull/7269) — Implements a Randomizer Challenge Mode
  - Note: This will likely not be implented in favor of one made by the PokeRogue Develeopment team. This will be removed if so


# iOS

## Getting the IPA

Go to the [Releases](https://github.com/PokeRogue-Offline/pokerogue-offline/releases) and download `PokeRogueOffline.ipa` from the latest release.

## Installing the IPA

### Option 1: LiveContainer + SideStore (Recommended — unlimited apps)

LiveContainer lets you run IPAs inside a container without using up your sideloading slots.

**First-time setup:**
1. Install **iLoader** on your PC/Mac from [GitHub](https://github.com/nab138/iloader)
2. Connect your iPhone via USB and open iLoader
3. Sign in with your Apple ID
4. Select **LiveContainer + SideStore** and install it
5. Open LiveContainer on your device and complete the setup (import certificate from SideStore)

**Installing PokeRogueOffline:**
1. Download `PokeRogueOffline.ipa` to your iPhone (via Safari or Files)
2. Open LiveContainer and tap the **+** button in the top right
3. Select the IPA file
4. Tap the app to launch it

> **Note:** LiveContainer signs the app with your SideStore certificate automatically — no manual signing needed.

---

### Option 2: SideStore (without LiveContainer)

SideStore lets you sideload up to 3 apps and refresh them wirelessly without a PC after setup.

1. Install SideStore using iLoader or AltServer
2. Open SideStore and tap **+** in My Apps
3. Select `PokeRogueOffline.ipa`
4. Apps must be refreshed every 7 days (can be automated with a Shortcuts automation)

---

### Option 3: Feather / Sideloadly

If you already use Feather or Sideloadly, just sign and install the IPA as you normally would.

---

# Android

Go to the [Releases](https://github.com/PokeRogue-Offline/pokerogue-offline/releases) and download `PokeRogueOffline.ipa` from the latest release.
- Enable "Install from Unknown Sources" in Settings
- Download and install the APK
- Note: APK is debug-signed, you may need to allow installation


## Importing your save

1. Go to [pokerogue.net](https://pokerogue.net) on a browser and log in
2. Navigate to **Pause → Manage Data → Export Save**
3. Open PokeRogueOffline and navigate to **Pause → Manage Data → Import Save**
4. Select the exported file

## Notes

- This app is for personal use only
- Saves are stored locally and are not synced to any server
- This is an unofficial fan project and is not affiliated with the PokéRogue team
