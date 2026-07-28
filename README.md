# Mod: Attempt to Add a Debug Menu

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
