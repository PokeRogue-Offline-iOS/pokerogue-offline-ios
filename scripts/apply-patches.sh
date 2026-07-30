#!/bin/bash
set -e
# apply-patches.sh - pre-build patches
#
# Usage:
#   ./apply-patches.sh            # all platforms (default)
#   ./apply-patches.sh mobile     # all + mobile (iOS + Android)
#   ./apply-patches.sh android    # all + mobile + android
#   ./apply-patches.sh switch     # all + switch

PLATFORM="${1:-all}"

source "$(dirname "$0")/patch-lib.sh"

# --- All platforms ------------------------------------------------------------
# Offline client modifications
apply_patch "fix-daily-seed.js"       all
apply_patch "offline-banner.js"       all
apply_patch "update-check.js"         all
apply_patch "update-title-labels.js"  all

apply_patch "app-settings-menu.js"          all
apply_patch "remove-google-drive.js"        all
apply_patch "offline-settings-navigation-fix.js" all
apply_patch "auto-hide-touch-controls.js" all
apply_patch "sandbox-economy-settings.js"   all
apply_patch "sandbox-progression-settings.js" all
apply_patch "claim-all-rewards.js"          all
apply_patch "duplicate-starters.js"         all
apply_patch "starting-level-settings.js"    all
apply_patch "shiny-settings.js"             all
apply_patch "egg-settings.js"               all
apply_patch "form-change-item-settings.js"  all
apply_patch "unlock-starter-on-select.js"   all
apply_patch "gacha-calendar.js"             all
apply_patch "community-menu.js"             all

apply_patch "update-available-screen.js" all
# --- Mobile (iOS + Android) ---------------------------------------------------
if [[ "$PLATFORM" == "mobile" || "$PLATFORM" == "android" ]]; then

  # Targeted Patches
  apply_patch "android-import-fix.js"        mobile
  apply_patch "export-fix.js"                mobile
  apply_patch "background-audio-pause.js"    mobile
fi
# --- Android only -------------------------------------------------------------
if [[ "$PLATFORM" == "android" ]]; then

  apply_patch "fix-android-image-paths.js"  android

fi

# --- Switch only --------------------------------------------------------------
if [[ "$PLATFORM" == "switch" ]]; then

  # Hand the real Phaser application the nx.js screen canvas and inject the
  # Switch Milestone 2 build label. Browser compatibility stays in the nx.js
  # bootstrap so failures remain observable and narrowly scoped.
  apply_patch "nxjs-bootstrap.js" switch

fi

echo "All patches applied successfully (platform: $PLATFORM)."
