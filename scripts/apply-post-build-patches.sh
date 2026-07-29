#!/bin/bash
set -e
# apply-post-build-patches.sh — post-build patches (run after pnpm build, targeting dist/)
#
# Usage:
#   ./apply-post-build-patches.sh            # all platforms (default)
#   ./apply-post-build-patches.sh mobile     # all + mobile (iOS + Android)
#   ./apply-post-build-patches.sh android    # all + mobile + android
#   ./apply-post-build-patches.sh switch     # switch only (currently no-op)

PLATFORM="${1:-all}"

source "$(dirname "$0")/patch-lib.sh"

# ── Mobile (iOS + Android) ────────────────────────────────────────────────────
if [[ "$PLATFORM" == "mobile" || "$PLATFORM" == "android" ]]; then

  apply_patch "notch-fix.js"           mobile
  apply_patch "fix-browser.js"         mobile
  apply_patch "canvas-scale-fix.js"    mobile

fi

if [[ "$PLATFORM" == "switch" ]]; then

  # Switch patches belong at source level before compilation. This hook remains
  # available for generated-manifest work that cannot be performed pre-build.
  :

fi

echo "All post-build patches applied successfully (platform: $PLATFORM)."
