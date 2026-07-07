# App Settings Menu + Google Drive Backup — Patch Set

Applies to branch `qualityOfLifeLove`. Drop these files into the matching
paths in the `pokerogue-offline` repo root.

## How to apply

1. Copy `patches/all/node/app-settings-menu.js` → `patches/all/node/`
2. Copy `new-files/` contents → repo root as `new-files/` (the patch script
   reads from here at build time; the two files under it get written into
   `pokerogue-src` when the patch runs — they are NOT meant to be committed
   into `pokerogue-src` directly, since that's a fresh clone each build)
3. Copy `configs/` contents over the existing `configs/` — these **overwrite**
   `capacitor.config.json` (both platforms), `MainActivity.java`,
   `main.cjs`, and both `electron-builder.*.json` files, and **add**
   `preload.cjs` (new)
4. Copy `.github/workflows/*.yml` over the existing four workflow files
5. Add `patches/all/node/app-settings-menu.js` to the "All platforms"
   section of `scripts/apply-patches.sh` (one line, same as the other
   `apply_patch` calls in that file)

## Before this actually works — placeholders and secrets

**Already filled in (safe to commit, not secret):**
- `configs/android/capacitor/capacitor.config.json`, `configs/ios/capacitor/capacitor.config.json`, and `new-files/src/system/offline/google-drive-backup.ts` all carry this project's real client IDs now — no placeholders left to fill in here.
- The web client ID is still duplicated across three call sites though (`capacitor.config.json` ×2 and `google-drive-backup.ts`) — worth factoring into one shared constant later.

**Add as GitHub Actions Secrets (repo Settings → Secrets and variables → Actions):**
- `GOOGLE_DESKTOP_CLIENT_ID`
- `GOOGLE_DESKTOP_CLIENT_SECRET`
- `GOOGLE_IOS_REVERSED_CLIENT_ID` (the `com.googleusercontent.apps.XXXX` string Google shows for the iOS client)
- `ANDROID_DEBUG_KEYSTORE_B64` (base64 of the pinned debug keystore, generated separately) — the restore-keystore step is already wired into `build-android.yml`, running right before `assembleDebug`.

## What's been verified vs. what hasn't

**Verified (ran for real against a fresh clone of pagefaultgames/pokerogue):**
- All 6 sub-patches in `app-settings-menu.js` applied cleanly, anchors matched exactly
- All new/modified `.ts` files pass TypeScript syntax checking
- Both Electron `.cjs` files pass `node --check`
- The plugin swap from the archived `@codetrix-studio/capacitor-google-auth` to the maintained `@capgo/capacitor-social-login@8.3.33` (peer dep confirmed against Capacitor 8 on the npm registry)
- Both `electron-builder.*.json` files needed `preload.cjs` added to their `files` allowlist — caught and fixed (would've been a silent runtime break otherwise)
- `MainActivity.java`'s `notifyGoogleActivityResult(...)` call — confirmed against the plugin's actual setup docs and migration guide; method name/signature/dispatch pattern match exactly
- `app-settings-ui-handler.ts`'s live label refresh (calling `show()` again from inside a button handler) — confirmed working in a real build
- The Drive API v3 multipart upload request shape in `google-drive-backup.ts` and the OAuth loopback flow in `main.cjs` — confirmed working end-to-end: save on iOS, restore on the AppImage build using the same Google account

**NOT verified — needs your attention before this ships:**
- The Scooom icon badge — deliberately left out of v1 rather than guessing at Phaser's dynamic texture-loading API blind. Maroon background tint is in; the icon is a follow-up once the game's actual loader-scene pattern can be confirmed.

## Suggested test order once secrets are in place

1. Desktop build first (`build-exe.yml`) — fastest feedback loop, no APK/keystore complexity
2. Confirm the pause menu entry appears under "Game Settings" and the screen opens
3. Confirm sign-in round-trips to an access token
4. Confirm "Backup Save" actually creates a file in Drive's hidden app-data folder (visible via [Google's OAuth Playground](https://developers.google.com/oauthplayground) or a small test script, not the regular Drive UI)
5. Only then move to Android/iOS
