#!/bin/bash
set -e

source "$(dirname "$0")/patch-lib.sh"

# Pending upstream PRs (patch/ — remove once merged)
apply_patch "7230.patch"
apply_patch "noLearnMove.patch"       # PKR 7077
apply_patch "iosImport.patch"         # PKR 7222
apply_patch "noZoom.patch"            # PKR 7223
apply_patch "randomizer.patch"        # PKR 7269

# Offline client modifications (node/)
apply_patch "fix-daily-seed.js"
apply_patch "fix-android-image-paths.js"
apply_patch "add-import-data-from-url.js"
apply_patch "inject-unlock-all.js"
apply_patch "cheated-banner.js"
apply_patch "android-import-fix.js"
apply_patch "offline-banner.js"
apply_patch "update-title-labels.js"
apply_patch "export-fix.js"
apply_patch "background-audio-pause.js"
apply_patch "randomizer_locales.js"

echo "All patches applied successfully."
