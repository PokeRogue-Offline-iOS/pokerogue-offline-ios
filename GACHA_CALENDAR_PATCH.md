# Gacha Calendar — Patch Set

Applies to branch `qualityOfLifeLove`. Adds a "Gacha Calendar" entry to the
pause menu, directly under "Egg Gacha".

## What it does

Opens a new, read-only offline screen showing which species is boosted in
the Legendary gacha for any day of the currently viewed month, plus a
"Today's Legendary" / "Tomorrow's Legendary" summary. Prev/next month via
the Cycle Shiny/Cycle Form buttons (L/R on gamepad), day-to-day movement
via the D-pad, Cancel to back out.

**No gameplay mechanics, save data, or the egg-pulling flow are touched.**
Every date is resolved through the REAL, already-exported
`getLegendaryGachaSpeciesForTimestamp(timestamp)` from `src/data/egg.ts` —
nothing about the seeded RNG or the day/cycle math is reimplemented here.
Every timestamp the new screen builds is constructed with `Date.UTC(...)`
and read back with `getUTC*` accessors, matching how that function itself
treats its input (plain UTC-day division, no timezone adjustment) — so the
calendar's "today" always agrees with what the real Egg Gacha screen shows
as boosted right now, in every timezone.

## How to apply

1. Copy `patches/all/node/gacha-calendar.js` → `patches/all/node/`
2. Copy `new-files/src/ui/handlers/gacha-calendar-ui-handler.ts` → repo root
   as `new-files/src/ui/handlers/` (the patch script reads from here at
   build time; the file gets written into `pokerogue-src` when the patch
   runs — it is NOT meant to be committed into `pokerogue-src` directly,
   since that's a fresh clone each build)
3. Add `apply_patch "gacha-calendar.js" all` to the "All platforms" section
   of `scripts/apply-patches.sh`, right after the existing
   `app-settings-menu.js` line (already done if you're pulling this repo
   as-is — just noting it for anyone applying by hand)

No secrets, no new dependencies, no config file changes required.

## What's been verified vs. what hasn't

**Verified (ran for real against a fresh clone of pagefaultgames/pokerogue):**
- All 4 sub-patches in `gacha-calendar.js` applied cleanly against a fresh
  clone, anchors matched exactly
- Full project `tsc --noEmit` run before and after the patch produces the
  *identical* 4 pre-existing errors (unrelated — missing `assets` submodule
  data used by one test file), i.e. this patch introduces zero new
  TypeScript errors
- `getLegendaryGachaSpeciesForTimestamp`'s day-boundary math confirmed by
  reading `src/data/egg.ts` directly: it's plain UTC epoch division, no
  local-timezone adjustment, so the new screen's `Date.UTC(...)` usage
  matches it exactly
- The handlers-array positional requirement (`this.handlers[this.mode]` in
  `ui.ts`) — confirmed `GachaCalendarUiHandler` is appended last in that
  array, matching `GACHA_CALENDAR` being the last `UiMode` entry (this is
  functionally required, not stylistic — the import line, by contrast, was
  placed in normal alphabetical order since imports don't have that
  constraint)

**NOT verified — needs your attention before this ships:**
- Actual in-game rendering/layout has NOT been checked in a running build
  (grid cell sizing, cursor positioning, footer spacing) — only compiled
  and had its patch anchors verified. Please open the screen in a real
  build and confirm nothing overlaps or clips before merging.
- The "Gacha Calendar" label is hardcoded (not routed through i18next),
  same reasoning as the existing "Offline" settings tab — this is an
  offline-client-only feature not present in the real locale files.
