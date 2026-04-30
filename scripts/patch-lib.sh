#!/bin/bash
set -e
# patch-lib.sh — shared helpers sourced by apply-patches.sh and apply-post-build-patches.sh

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
PATCHES_DIR="$SCRIPT_DIR/../patches"
TARGET_DIR="pokerogue-src"

# apply_patch <file> <category>
#   <file>     — filename only, e.g. "fix-daily-seed.js" or "noLearnMove.patch"
#   <category> — subdirectory under patches/, e.g. "all", "mobile", "android"
apply_patch() {
  local file="$1"
  local category="$2"
  local full_path

  echo "Applying: $file ($category)"

  if [[ "$file" == *.patch ]]; then
    full_path="$PATCHES_DIR/$category/patch/$file"
    # Resolve to an absolute path that survives git's -C directory change on Windows
    full_path="$(cd "$(dirname "$full_path")" && pwd)/$(basename "$full_path")"
    git -C "$TARGET_DIR" apply "$full_path"
  elif [[ "$file" == *.js ]]; then
    full_path="$PATCHES_DIR/$category/node/$file"
    node "$full_path"
  else
    echo "Unknown file type: $file"
    exit 1
  fi

  echo "Applied: $file"
}
