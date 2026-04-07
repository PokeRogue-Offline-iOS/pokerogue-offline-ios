#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"
PATCHES_DIR="$SCRIPT_DIR/../patches"
TARGET_DIR="pokerogue-src"

apply_patch() {
  local file="$PATCHES_DIR/$1"
  echo "Applying: $1"
  if [[ "$1" == *.patch ]]; then
    git -C "$TARGET_DIR" apply "../$file"
  elif [[ "$1" == *.js ]]; then
    node "$file"
  else
    echo "Unknown file type: $1"
    exit 1
  fi
  echo "Applied: $1"
}
# Add patch files here:
# apply_patch "01-fix-something.patch"

apply_patch "add-import-data-from-url.js"
apply_patch "inject-unlock-all.js"
#apply_patch "iosImport.patch"
#apply_patch "noLearnMove.patch"
#apply_patch "noZoom.patch"
#apply_patch "offlineBanner.patch"


echo "All patches applied successfully."
