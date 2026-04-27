#!/bin/bash
# patch-lib.sh — shared helpers sourced by apply-patches.sh and apply-post-build-patches.sh

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
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
