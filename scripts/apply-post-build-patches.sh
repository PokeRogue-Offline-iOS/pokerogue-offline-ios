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

# Add post-build patch files here (these run after pnpm build, targeting dist/):
apply_patch "notch-fix.js"

echo "All post-build patches applied successfully."
