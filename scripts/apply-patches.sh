#!/bin/bash
set -e
# apply-patches.sh — pre-build patches
#
# Usage:
#   ./apply-patches.sh            # all platforms (default)
#   ./apply-patches.sh mobile     # all + mobile (iOS + Android)
#   ./apply-patches.sh android    # all + mobile + android

PLATFORM="${1:-all}"

source "$(dirname "$0")/patch-lib.sh"

# ── All platforms ─────────────────────────────────────────────────────────────
ls -alR

# Pending upstream PRs (remove once merged upstream)
apply_patch "7230.patch"         all   # PKR 7230
apply_patch "noLearnMove.patch"  all   # PKR 7077
apply_patch "randomizer.patch"   all   # PKR 7269

# Offline client modifications
apply_patch "fix-daily-seed.js"       all
apply_patch "inject-unlock-all.js"    all
apply_patch "cheated-banner.js"       all
apply_patch "offline-banner.js"       all
apply_patch "update-title-labels.js"  all
apply_patch "randomizer_locales.js"   all

# ── Mobile (iOS + Android) ────────────────────────────────────────────────────
if [[ "$PLATFORM" == "mobile" || "$PLATFORM" == "android" ]]; then

  # Pending upstream PRs
  apply_patch "iosImport.patch"  mobile  # PKR 7222
  apply_patch "noZoom.patch"     mobile  # PKR 7223

  apply_patch "add-import-data-from-url.js"  mobile
  apply_patch "android-import-fix.js"        mobile
  apply_patch "export-fix.js"                mobile
  apply_patch "background-audio-pause.js"    mobile

fi

# ── Android only ──────────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "android" ]]; then

  apply_patch "fix-android-image-paths.js"  android

fi

echo "All patches applied successfully (platform: $PLATFORM)."
