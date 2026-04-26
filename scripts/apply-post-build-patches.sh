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

# Add post-build patch files here (these run after pnpm build, targeting dist/):
apply_patch "notch-fix.js"

# Fixes external links
apply_patch "fix-browser.js"

# Fixes rotating the game
apply_patch "landscape-canvas-fit.js"

echo "All post-build patches applied successfully."
