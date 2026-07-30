# SilverShadow PokéRogue Switch Port Handoff

## Purpose

This file transfers the current Nintendo Switch port work to a new Codex session on the same computer.

The next session must continue from the existing local repository and current branch. Do not clone a fresh copy, reinstall dependencies, or rebuild the development environment unless the existing environment is proven broken.

## Repository and Working Copy

- Repository: https://github.com/silvershadowkat/pokerogue-offline
- Local repository path: `C:\Users\plim\Documents\Codex\2026-07-29\build\work\pokerogue-offline`
- Current local branch: `fix/switch-alpha-runtime`
- Remote branch: `origin/fix/switch-alpha-runtime`
- Branch page: https://github.com/silvershadowkat/pokerogue-offline/tree/fix/switch-alpha-runtime
- Current confirmed baseline commit: `d5853ca`
- Baseline commit message: `fix(switch): keep claimed rewards and BGM alive`

At the time of handoff, the local branch and remote branch were synchronized at `d5853ca`.

Before changing anything, run:

```powershell
git status -sb
git branch --show-current
git branch -vv
git log --oneline -25
```

Expected branch:

```text
fix/switch-alpha-runtime
```

Do not switch to `main`, merge into `main`, rebase, or reset the branch unless explicitly instructed.

## Important Recent Commits

Review these before making changes:

- `d5853ca` - fix(switch): keep claimed rewards and BGM alive
- `3ac7f66` - fix(switch): reuse reward UI across rerolls
- `2cf081c` - fix(switch): contain reroll native memory pressure
- `03310e4` - fix(switch): ignore late audio ended events after teardown
- `9c0dc8f` - fix(switch): repair loading progress diagnostics scope
- `43b3c28` - fix(switch): stabilize audio and reward rerolls
- `a83ee75` - fix(switch): enable audio loading and guard party heal

Inspect the diffs for these commits, especially the reward UI lifecycle, scene transitions, reroll behavior, audio teardown, and native memory-pressure handling.

## Current Confirmed Working State

The Switch alpha is playable on real Nintendo Switch hardware.

Confirmed working:

- The game launches.
- The game reaches the title screen.
- Continue works.
- Starter selection works.
- Battles work.
- The game reaches the rewards screen.
- Pokémon can be caught.
- SilverShadow cheats can be enabled.
- External assets load from the SD card.
- The Poké Ball reward item now works as expected.
- Super Lure can be selected and claimed successfully.
- Background music loops correctly during the latest test.
- Pressing PLUS still opens the menu during the reward-screen problem.
- Save and Quit still works during the reward-screen problem.
- Save and Quit performs the normal approximately 40-second reload to the title screen.
- The saved run can then be continued successfully.

## Latest Hardware Findings

The current problem is narrowed down to reward items that temporarily leave the reward screen so the player can choose a Pokémon or move, then return to the reward screen.

### Rare Candy reproduction

1. Reach the rewards screen.
2. Choose Rare Candy.
3. Select a Pokémon to receive the Rare Candy.
4. The game returns to the rewards screen.
5. The Rare Candy appears claimed.
6. The reward screen then appears frozen or stuck.

Additional observations:

- The background song continued looping correctly.
- Pressing PLUS still opened the menu.
- This means the whole game process was not fully frozen.
- Save and Quit still worked.
- After the approximately 40-second reload, Continue returned to the saved run.

### PP Up reproduction

1. Continue the run after Save and Quit.
2. Complete another battle.
3. Reach the rewards screen.
4. Choose PP Up.
5. Select the Pokémon move to receive PP Up.
6. The game returns to the rewards screen.
7. The reward screen becomes stuck in the same way.

### Working comparison cases

- Poké Ball reward works.
- Super Lure reward works.
- Rare Candy causes the problem after returning from Pokémon selection.
- PP Up causes the problem after returning from Pokémon and move selection.

## Current Interpretation

Treat this as a likely reward-screen soft lock or input/UI re-entry problem, not a full application freeze.

The most useful distinction is:

- Rewards that are applied immediately on the reward screen appear to work.
- Rewards that leave the reward screen for a Pokémon or move selection flow appear to get stuck after returning.

Do not assume this interpretation is the root cause. Confirm it using the attached runtime log and the code.

Areas to inspect include:

- Reward UI reuse after returning from another scene or modal flow
- Input focus and controller focus restoration
- Reward selection state and claimed-item state
- Scene resume or phase resume logic
- Pending promises, callbacks, or event handlers
- Duplicate or stale reward UI instances
- Native wrapper lifecycle behavior
- Whether the reward phase is marked complete, paused, or blocked
- Whether the previous fixes preserve the claimed reward but fail to restore interactivity
- Any difference between immediate-use items and targeted items
- Any late teardown or re-entry event that affects the reward UI
- Memory pressure only if the log supports it

Avoid broad rewrites. Find the smallest safe fix.

## Runtime Log

The next prompt will include the latest hardware runtime log as an attachment.

Requirements:

1. Read the entire attached log before changing code.
2. Identify the log filename in the response.
3. Correlate the log with the Rare Candy and PP Up reproduction steps.
4. Search for errors, warnings, phase transitions, input changes, reward UI creation/destruction, audio events, memory warnings, and scene changes.
5. Distinguish expected log noise from evidence related to the soft lock.
6. Do not delete or overwrite the original log.
7. Copy it into a diagnostics folder only if that is useful and does not modify the original attachment.

## Required Investigation Process

1. Open the existing local repository at the path in this file.
2. Read this entire `HANDOFF.md`.
3. Read all applicable `AGENTS.md` files.
4. Review the last 25 commits.
5. Inspect the diffs for the recent reward and audio fixes.
6. Confirm the working tree state and current branch.
7. Read the attached hardware log completely.
8. Compare the working reward paths against Rare Candy and PP Up.
9. Identify the likely root cause before making broad changes.
10. Implement the smallest targeted fix.
11. Preserve all currently working behavior.
12. Build using the existing environment and caches.
13. Produce a minimal, uncompressed hardware-test update.
14. Report exactly what changed and how to test it.

## Build and Environment Requirements

Use the existing local environment.

Do not unnecessarily:

- Clone the repository again
- Delete build caches
- Delete `node_modules`
- Reinstall dependencies
- Clean the entire build
- Download all assets again
- Rebuild unrelated Android outputs
- Reconfigure the toolchain

A clean build may be used only when required to prove the incremental build is not stale. Explain why before doing it.

Real Nintendo Switch hardware is the source of truth. A successful desktop or local build is not proof that the runtime bug is fixed.

## Incremental Hardware-Test Package Requirements

The current hardware-test baseline remains:

```text
d5853ca
```

Keep using `d5853ca` as the comparison baseline until the user confirms that a newer hardware test is successful.

A new fix may have a new commit SHA. That is expected. Do not replace the hardware-test baseline with the new SHA until the user explicitly confirms the test passed.

After building:

1. Determine all deployment files that changed or became required compared with baseline `d5853ca`.
2. Include generated artifacts required by those changes, not only Git source files.
3. Preserve the directory structure expected on the SD card.
4. Include linked chunks, manifests, indexes, maps, or runtime files when a changed output references them.
5. Do not include unrelated files merely because their timestamps changed.
6. Do not include saves, user data, screenshots, or logs.
7. Do not overwrite or delete existing save files or user data.
8. Do not create a ZIP file.
9. Place the minimal update in a normal folder.
10. Point the user directly to the folder path.
11. Provide a plain-text list of every file in the folder.
12. If only a small handful of files are affected, include every affected file rather than omitting dependencies.
13. If a minimal delta cannot be proven safe, explain why and provide the smallest safe set.

Use the project's existing incremental packaging process if one exists.

If no standard folder is already defined, use a clear path such as:

```text
C:\Users\plim\Documents\Codex\2026-07-29\build\work\pokerogue-offline\build\handoff\incremental\from-d5853ca
```

Do not zip that folder.

## Required Final Report After Each Fix

Report all of the following:

- Root cause found, or best-supported hypothesis if not fully proven
- Attached log filename reviewed
- Source files changed
- Generated deployment files changed
- New commit SHA, if a commit was created
- Baseline SHA used for the incremental comparison
- Exact uncompressed incremental-output folder path
- Complete list of files to copy to the SD card
- Any files that must be removed from the SD card
- Exact hardware reproduction and verification steps
- Known risks or unresolved questions
- Whether the existing build environment was reused
- Whether any dependency reinstall or clean build was necessary

## Git Safety

- Stay on `fix/switch-alpha-runtime`.
- Do not merge to `main`.
- Do not force-push.
- Do not discard existing commits.
- Do not reset to an older commit.
- Keep the current branch backed up on `origin/fix/switch-alpha-runtime`.
- Make focused commits with clear messages.
- Push only to `origin/fix/switch-alpha-runtime`.
- Never push directly to `main`.

Before pushing, confirm:

```powershell
git status -sb
git branch --show-current
git log --oneline -5
```

## Product Constraints

- Keep the game fully offline.
- Preserve SilverShadow branding.
- Do not add Google Drive.
- Do not add Google OAuth.
- Do not break Android or normal web functionality.
- Do not modify unrelated systems.
- Prefer small, targeted Switch-specific fixes.
- Preserve saves, logs, settings, and user data during incremental updates.
- Do not bundle all external assets into the NRO without explicit approval.
- Do not remove working diagnostics that are still useful for hardware testing.

## Definition of Done for the Next Fix

The next fix is ready for hardware testing when:

- The project builds successfully.
- The smallest safe deployment set is identified.
- The update folder is uncompressed.
- The user is given the exact folder path and complete file list.
- Rare Candy can be applied and the returned reward screen remains interactive.
- PP Up can be applied and the returned reward screen remains interactive.
- Immediate-use rewards such as Poké Ball and Super Lure still work.
- Background music continues to behave correctly.
- PLUS still opens the menu.
- Save and Quit still works.
- Continue still resumes the run.
- No unrelated regression is knowingly introduced.

The baseline remains `d5853ca` until the user confirms the new hardware test passed.
