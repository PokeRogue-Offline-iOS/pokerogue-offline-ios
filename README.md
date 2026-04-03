# PokeRogueOffline (iOS)

An offline iOS wrapper for PokéRogue, built with Capacitor. Play fully offline with local saves, or import your save from [pokerogue.net](https://pokerogue.net).

## Features

- Fully offline — no internet required after install
- Local saves that persist between sessions
- Import saves from your online account
- Based on the latest `main` branch of the fork

## Getting the IPA

Go to the [Releases](../../releases) tab and download `PokeRogueOffline.ipa` from the latest release.

## Installing the IPA

### Option 1: LiveContainer + SideStore (Recommended — unlimited apps, no 7-day limit with paid cert)

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

## Importing your save

1. Go to [pokerogue.net](https://pokerogue.net) on a browser and log in
2. Navigate to **Pause → Manage Data → Export Save**
3. Open PokeRogueOffline and navigate to **Pause → Manage Data → Import Save**
4. Select the exported file

## Notes

- This app is for personal use only
- Saves are stored locally and are not synced to any server
- This is an unofficial fan project and is not affiliated with the PokéRogue team
