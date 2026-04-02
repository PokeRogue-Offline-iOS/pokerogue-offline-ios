# PokeRogueOffline (iOS)

An offline iOS wrapper for [PokeRogue-Offline-iOS/pokerogue](https://github.com/PokeRogue-Offline-iOS/pokerogue), built with Capacitor.

## How it works

- GitHub Actions clones the fork, builds it with `VITE_BYPASS_LOGIN=1`
- Capacitor wraps the built web app into a native iOS project
- An unsigned `.ipa` is exported and attached to each release

Saves are stored locally on the device and work fully offline.

## Getting the IPA

1. Go to the **Releases** tab and download `PokeRogueOffline.ipa`
2. Sign and install with [Feather](https://github.com/khcrysalis/Feather) or Sideloadly

## Triggering a build

1. Go to the **Actions** tab
2. Select **Build PokeRogueOffline IPA**
3. Click **Run workflow**

## Notes

- Fully offline — no account or server required
- Saves persist locally between sessions
- Landscape orientation
