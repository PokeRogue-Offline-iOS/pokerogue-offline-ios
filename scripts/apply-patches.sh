#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"
PATCHES_DIR="$SCRIPT_DIR/../patches"
TARGET_DIR="pokerogue-src"

apply_patch() {
  local file="$1"
  local full_path
  echo "Applying: $file"
  if [[ "$file" == *.patch ]]; then
    full_path="$PATCHES_DIR/patch/$file"
    git -C "$TARGET_DIR" apply "$full_path"
  elif [[ "$file" == *.js ]]; then
    full_path="$PATCHES_DIR/node/$file"
    node "$full_path"
  else
    echo "Unknown file type: $file"
    exit 1
  fi
  echo "Applied: $file"
}

apply_submodule_patch() {
  local file="$1"
  local submodule="$2"
  local full_path="$PATCHES_DIR/patch/$file"
  echo "Applying: $file to $TARGET_DIR/$submodule"
  git -C "$TARGET_DIR/$submodule" apply "$full_path"
  echo "Applied: $file"
}

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
