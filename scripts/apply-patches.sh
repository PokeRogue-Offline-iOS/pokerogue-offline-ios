#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"
PATCHES_DIR="$SCRIPT_DIR/../patches"
TARGET_DIR="pokerogue-src"

apply_patch() {
  local file="$1"
  local full_path="$PATCHES_DIR/$file"
  echo "Applying: $file"
  if [[ "$file" == *.patch ]]; then
    git -C "$TARGET_DIR" apply "$full_path"
  elif [[ "$file" == *.js ]]; then
    node "$full_path"
  else
    echo "Unknown file type: $file"
    exit 1
  fi
  echo "Applied: $file"
}

# Add patch files here:
# apply_patch "01-fix-something.patch"

apply_patch "add-import-data-from-url.js"
apply_patch "inject-unlock-all.js"
#apply_patch "iosImport.patch"
#apply_patch "noLearnMove.patch"
#apply_patch "noZoom.patch"
apply_patch "offlineBanner.patch"


echo "All patches applied successfully."
