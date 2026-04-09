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

apply_submodule_patch() {
  local file="$1"
  local submodule="$2"
  local full_path="$PATCHES_DIR/$file"
  echo "Applying: $file to $TARGET_DIR/$submodule"
  git -C "$TARGET_DIR/$submodule" apply "$full_path"
  echo "Applied: $file"
}

# Add patch files here:
# apply_patch "01-fix-something.patch"

# Patch to apply full unlock button
apply_patch "add-import-data-from-url.js"
apply_patch "inject-unlock-all.js"

# patch to implement PKR 7077
apply_patch "noLearnMove.patch"

# Patch to implement PKR 7222
apply_patch "iosImport.patch"

# Patch to implement PKR 7223
apply_patch "noZoom.patch"

# Patch in version string for offline client
apply_patch "offlineBanner.patch"

# Patch out logged in as and online count
apply_patch "update-title-labels.js"

echo "All patches applied successfully."
