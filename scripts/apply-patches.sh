#!/bin/bash
set -e

TARGET_DIR="pokerogue-src"

apply_patch() {
  echo "Applying patch: $1"
  git -C "$TARGET_DIR" apply "../patches/$1"
  echo "Applied: $1"
}

# Add patch files here:
# apply_patch "01-fix-something.patch"

apply_patch "add-import-data-from-url.patch"
#apply_patch "iosImport.patch"
#apply_patch "noLearnMove.patch"
#apply_patch "noZoom.patch"
#apply_patch "offlineBanner.patch"


echo "All patches applied successfully."
