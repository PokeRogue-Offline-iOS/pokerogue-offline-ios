# Full Pokemon Editor

The Full Pokemon Editor is an offline-only, controller/touch-friendly editor
for selected starters and the active player party. It also provides a
versioned saved-build library. The implementation deliberately keeps unlocks,
legitimate starter moves, and normal battle/evolution rules authoritative.

## Enable the feature

Open **Settings → Offline → Team → Pokemon Editor**. The setting updates live.

| Mode | Available behavior |
| --- | --- |
| Off | Hides editor/build actions. Existing party Pokemon and saved builds are not rewritten or deleted. A selected starter with an editor draft starts from its preserved legitimate setup. |
| Use Saved Builds | Loads saved builds on the starter screen or between battles. Build creation and management stay read-only. |
| Full Editor | Adds field editing, unrestricted moves, build creation/management, restore, and undo actions. |

Changing the setting never scans or sanitizes an existing run. A Pokemon that
already exists in a session keeps its actual serialized level, moves, nature,
ability override, form, gender, shiny state, IVs, friendship, and Pokerus.

## Editable fields

The editor supports:

- safe permanent/starter-selectable form;
- level 1–10,000;
- nature;
- any implemented ability, including partial implementations;
- a species-valid gender choice;
- shiny off or standard/rare/epic shiny variant;
- all six IVs from 0–31, including max-all and zero-all shortcuts;
- friendship from 0–255;
- Pokerus;
- one to four unique editor-safe moves in an explicit order.

Edits are made in a draft. **Apply Changes** commits the draft; Cancel discards
it. Active-party apply recalculates stats and EXP, preserves fainted state, and
otherwise preserves current HP percentage against the new maximum.

## Starter screen and duplicate copies

Open a species' normal action menu. The existing **Manage Moves** action still
edits only legitimate level/egg moves. Editor modes add **Load Saved Build**;
Full Editor also adds **Edit Pokemon**, **Manage Any Moves**, **Save Current
Setup as Build**, **Restore Legitimate Setup**, and **Undo Last Editor
Changes** when applicable.

The species-grid and selected-team action menus show at most seven rows and
scroll through any remaining actions. Every editor picker and saved-build list
uses the same seven-row cap, with visible scroll arrows and controller wrapping.
Opening one editor page from another safely replaces the current menu; Cancel,
Back, and Done always return to the documented parent screen.

When duplicate starters are enabled:

- editing from a selected team icon targets only that exact copy;
- editing from the species grid prepares the next copy;
- every added copy receives a deep copy, so later edits do not cross-mutate;
- removing a copy removes only its transient edited setup;
- legitimate starter unlock data and the normal starter moveset are never
  overwritten by unrestricted moves.

At run construction, custom starter fields are applied once. Evolution, move
learning, form changes, and normal game mechanics then continue from the
Pokemon's real state; the saved build is not continuously re-applied.

## Active party safety

Party actions include **Load Saved Build** in both enabled modes and Full
Editor actions for editing fields, managing any moves, saving a build, and
undoing the last runtime editor change. Party action windows are also capped at
seven visible rows, including their scroll indicators and Cancel row.

Active-party mutation is permitted only in `SelectModifierPhase`, the normal
between-battles reward/shop boundary. An attempt from a battle party menu is
rejected with:

> Pokémon cannot be edited during battle. Finish the current battle first.

After a successful apply or undo, the current system and session are saved
locally.

## Unrestricted move browser

The move browser is generated dynamically from the game's initialized move
registry. There is no manual name chart. **Browse All Matching Moves** works
with no text input and is the primary discovery path. Name search is only an
optional shortcut.

Available controls:

- every implemented type filter, including Steel, Fire, Water, Dragon, Fairy,
  and all other registry types;
- Physical, Special, Status, or all categories;
- optional full-name substring search and controller-only A–Z initials;
- name A–Z/Z–A, power high/low, accuracy high/low, and PP high/low sorting;
- combined filters and sorting, matching-result count, clear filters, and
  eight-result pages;
- move-row summaries with name, type, category, power, accuracy, and PP;
- highlighted details with name, type, category, power, accuracy, PP,
  priority, targeting, and full registry description.

Status power is shown as `—`; never-miss accuracy is `Always`; variable-power,
fixed-damage, and one-hit-KO moves are labeled `Variable`, `Fixed`, and `OHKO`.
The cached normalized metadata excludes `NONE`, placeholder records,
unimplemented `(N)` moves, malformed entries, and zero-PP records. Partial
implemented moves remain available.

Controller-only Steel discovery example:

1. Open **Manage Any Moves** and choose a slot or **Add Move**.
2. Set **Type** to Steel.
3. Optionally set **Category** to Physical or Special.
4. Set **Sort** to Power High–Low.
5. Open **Browse All Matching Moves**, page through every match, and compare
   row values and highlighted full details.
6. Choose the move. No move name or external lookup is required.

## Saved builds

Each build has a stable ID independent of its editable name. Duplicate names,
multiple builds for the same species/form, and duplicate starter copies are
supported. Full Editor can:

- create with a safe default `Species Build N` name (important on Switch,
  where a software keyboard may be unavailable);
- view, rename, duplicate, and delete;
- mark one preferred build per species/form (preferred builds sort first);
- explicitly update an existing build from the current setup after
  confirmation.

Applying a build warns that it may contain moves the species cannot normally
learn. Apply copies all data; later Pokemon edits never silently mutate the
saved build. Source build IDs are retained only to support explicit update
workflows.

The build library is stored in `SystemSaveData.pokemonBuildLibrary`, included
in normal local export/import and compressed-save key conversion. Old saves
initialize an empty library. Load normalization repairs safe field ranges,
deduplicates moves, regenerates duplicate IDs, removes dangling preferred
references, and skips only unusable records such as a build with no valid
moves. One consolidated warning is logged per distinct repair reason.

The version-1 shape is:

- library: `schemaVersion`, `builds[]`, and `preferredBySpeciesForm` (a
  species/form key to stable build-ID map);
- build identity: immutable `id`, mutable `name`, `schemaVersion`,
  `speciesId`, `formIndex`, `createdAt`, `updatedAt`, and optional
  `lastUsedAt`;
- optional override fields: `level`, `nature`, `abilityId`, `gender`, `shiny`,
  `variant`, six `ivs`, `friendship`, `pokerus`, and ordered `moves`.

The editor adds a separate optional `editorData` object only to a transient
selected `Starter`: custom level, ability, friendship, moves, source build ID,
and a legitimate-setup snapshot. It does not add editor moves to
`StarterDataEntry` and therefore cannot falsely unlock an egg/TM/level move.
Active-run values use the existing `PokemonData` session schema; only the
optional source build ID is added to serialized `CustomPokemonData`.

Normal **Clear Data** behavior removes the system save and therefore its build
library. Turning the editor Off is not a reset. Deleting a build removes only
that library record and any preferred reference; it does not rewrite Pokemon
already created from it.

## Precedence and normal mechanics

An explicit editor/build value wins for that Pokemon. When a build field is
absent, the current Pokemon/starter draft is the fallback; global cheats and
normal generation remain authoritative outside explicit fields. Normal move
learning, evolution, challenge rules, save loading, and battle processing are
not patched with continuous enforcement hooks.

Current intentional limits:

- species replacement is not exposed; builds apply to the same species;
- held items use PokéRogue's modifier system and remain in normal item
  management, not the Pokemon editor;
- battle-only, unobtainable, and non-starter-selectable forms are excluded;
- native Switch text entry may be unavailable, so filtering, browsing, default
  build names, and all required actions work without a keyboard.

## Manual acceptance scenarios

Use a disposable export and cover at least these cases:

1. Set Full Editor, prepare Caterpie from the species grid, give it Draco
   Meteor plus Tackle, add two Caterpie copies, edit only the second copy, and
   confirm each begins the run independently.
2. Repeat the Steel discovery workflow above using only a controller.
3. Save two same-name builds for one form, mark one preferred, duplicate it,
   rename/delete/update only through explicit actions, export/import, and
   confirm stable independent records.
4. Toggle Off before starting with an edited selected starter; confirm its
   preserved legitimate setup is used and the build library remains intact.
5. Edit an active non-fainted Pokemon between battles and confirm HP percentage
   is retained. Repeat with a fainted Pokemon and confirm HP remains zero.
6. Save and quit, reload, evolve or learn a move, and confirm the resulting
   state persists without the old build being re-applied.
7. Attempt an edit from an active battle party menu and confirm the exact
   rejection message and zero mutation.
8. Exercise mouse/touch, keyboard, and controller navigation. On Switch, save
   and apply a default-named build without invoking text input.

## Automated coverage

`test/system/pokemon-editor.test.ts` covers unrestricted species/move pairing,
move uniqueness, CRUD and duplicate-name behavior, stable preferred
references, deep-copy isolation, explicit update, normalization of corrupt/old
data, Off-mode legitimate starter restoration, and registry discovery/filter/
sort behavior including the controller-first Steel workflow.

Implementation validation:

| Check | Result |
| --- | --- |
| Pokemon editor Vitest suite | Passed: 8/8 |
| Automated Draco Caterpie build → session Pokemon serialization → Off-mode reload | Passed |
| JavaScript syntax and idempotent direct editor-patch reapplication | Passed |
| Clean shared `all` patch application | Passed |
| Clean `mobile` patch application | Passed |
| Clean `android` patch application | Passed |
| Clean `switch` patch application | Passed |
| Generated-source TypeScript check after the Switch overlay | Passed |
| Biome error-level check for editor source and tests | Passed |
| Production app-mode Vite build after the Switch overlay | Passed |
| Repository `git diff --check` | Passed |

The clean shared TypeScript check uses the same temporary validation-only
Capgo declaration and empty asset-submodule masterlist shape described by the
existing advanced-cheat handoff. Neither stub is part of this change. The
Switch overlay removes Google Drive and passes without the Capgo declaration.

Native Android APK, Apple packages, and a Switch NRO are not built as part of
this feature validation. Source patches and shared web output cover those
platform layers; real-device navigation remains a manual boundary.

## Files changed

- `patches/all/node/pokemon-editor.js`: idempotent generated-source installer
  and integration anchors;
- `new-files/src/system/pokemon-editor/`: types, validation/build service, and
  native option-menu UI;
- `new-files/test/system/pokemon-editor.test.ts`: focused unit/persistence
  coverage;
- `scripts/apply-patches.sh` and
  `patches/all/node/organize-cheat-settings.js`: shared patch order and Team
  settings placement;
- `docs/POKEMON_EDITOR.md`, `docs/ADVANCED_CHEATS.md`, and `README.md`:
  behavior, access, migration, validation, and repository documentation.
