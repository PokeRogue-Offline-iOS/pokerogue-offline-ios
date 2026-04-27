#!/bin/bash
set -e

source "$(dirname "$0")/patch-lib.sh"

# Add post-build patch files here (these run after pnpm build, targeting dist/):
apply_patch "notch-fix.js"

# Fixes external links
apply_patch "fix-browser.js"

# Fixes rotating the game
apply_patch "landscape-canvas-fit.js"

echo "All post-build patches applied successfully."
