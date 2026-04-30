#!/usr/bin/env node
/**
 * Patch: seeded-classic-run.js
 *
 * Adds a "Seeded Run" option to the New Game submenu. The player types any
 * string as a seed and the game starts a standard Classic run using that seed
 * instead of the usual random one.
 *
 * Four sub-patches, applied in order:
 *
 *   1. src/enums/ui-mode.ts
 *        Add SEED_INPUT enum value (after RENAME_RUN).
 *
 *   2. src/ui/handlers/seed-input-ui-handler.ts  (new file)
 *        A dedicated FormModalUiHandler subclass with the correct title
 *        ("Seeded Run"), field label ("Seed"), and button labels
 *        ("Start", "Cancel"). Avoids reusing the "Rename Run" modal and its
 *        misleading title.
 *
 *   3. src/ui/ui.ts
 *        Import SeedInputUiHandler and register a new instance at the
 *        position matching UiMode.SEED_INPUT in the handlers array.
 *        Also adds UiMode.SEED_INPUT to noTransitionModes.
 *
 *   4. src/phases/title-phase.ts
 *        Inject the "Seeded Run" option after Classic.
 *        On submit: decode the modal's output, store in Overrides.SEED_OVERRIDE
 *        so newBattle()'s setSeed() call picks it up, then call
 *        setModeAndEnd(GameModes.CLASSIC).
 *
 *   5. locales/en/menu.json
 *        Add "seededRun", "seededRunTitle", "seed", and "startRun" keys.
 *
 * Why Overrides.SEED_OVERRIDE?
 *   newBattle() does: this.setSeed(Overrides.SEED_OVERRIDE || randomString(24))
 *   Setting it here means the seed flows through without any additional patching
 *   of newBattle(). The override persists for the entire run (intentional —
 *   a seeded run should be repeatable).
 */

const fs   = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Could not find ${filePath}`);
    console.error("Make sure this script is run from the repo root and all submodules are initialised.");
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  Written: ${filePath}`);
}

function requireAnchor(src, anchor, label) {
  if (!src.includes(anchor)) {
    console.error(`ERROR: Could not find anchor for "${label}".`);
    console.error("The upstream file may have changed. Manual inspection required.");
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 1: src/enums/ui-mode.ts  →  add SEED_INPUT
// ─────────────────────────────────────────────────────────────────────────────

const UI_MODE_PATH = path.join("pokerogue-src", "src", "enums", "ui-mode.ts");
let uiModeSrc = readFile(UI_MODE_PATH);

if (uiModeSrc.includes("SEED_INPUT")) {
  console.log("SKIP ui-mode.ts — SEED_INPUT already present");
} else {
  const ANCHOR = "RENAME_RUN,";
  requireAnchor(uiModeSrc, ANCHOR, "RENAME_RUN in ui-mode.ts");
  uiModeSrc = uiModeSrc.replace(ANCHOR, `${ANCHOR}\n  SEED_INPUT,`);
  writeFile(UI_MODE_PATH, uiModeSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 2: src/ui/handlers/seed-input-ui-handler.ts  (new file)
// ─────────────────────────────────────────────────────────────────────────────

const HANDLER_PATH = path.join(
  "pokerogue-src", "src", "ui", "handlers", "seed-input-ui-handler.ts"
);

if (fs.existsSync(HANDLER_PATH)) {
  console.log("SKIP seed-input-ui-handler.ts — already exists");
} else {
  const HANDLER_CONTENT = `import i18next from "i18next";
import { FormModalUiHandler, type InputFieldConfig } from "./form-modal-ui-handler";
import type { ModalConfig } from "./modal-ui-handler";

/**
 * Modal that prompts the player to enter a seed string before starting a
 * Seeded Classic run. Added by the seeded-classic-run offline patch.
 */
export class SeedInputUiHandler extends FormModalUiHandler {
  getModalTitle(_config?: ModalConfig): string {
    return i18next.t("menu:seededRunTitle");
  }

  getWidth(_config?: ModalConfig): number {
    return 160;
  }

  getMargin(_config?: ModalConfig): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(_config?: ModalConfig): string[] {
    return [i18next.t("menu:startRun"), i18next.t("menu:cancel")];
  }

  override getInputFieldConfigs(): InputFieldConfig[] {
    return [{ label: i18next.t("menu:seed") }];
  }

  show(args: any[]): boolean {
    if (!super.show(args)) {
      return false;
    }
    // Clear any leftover text from a previous open.
    this.inputs.forEach(input => {
      input.text = "";
    });
    const config = args[0] as ModalConfig;
    this.submitAction = () => {
      this.sanitizeInputs();
      // Encode the same way rename handlers do so callers can use the same
      // decodeURIComponent(atob(...)) pattern to decode.
      const encodedSeed = btoa(encodeURIComponent(this.inputs[0].text));
      config.buttonActions[0](encodedSeed);
      return true;
    };
    return true;
  }
}
`;
  writeFile(HANDLER_PATH, HANDLER_CONTENT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 3: src/ui/ui.ts  →  import + register + noTransitionModes
// ─────────────────────────────────────────────────────────────────────────────

const UI_PATH = path.join("pokerogue-src", "src", "ui", "ui.ts");
let uiSrc = readFile(UI_PATH);

if (uiSrc.includes("SeedInputUiHandler")) {
  console.log("SKIP ui.ts — SeedInputUiHandler already present");
} else {
  // 3a. Import — insert after the RenameRunFormUiHandler import
  const IMPORT_ANCHOR = `import { RenameRunFormUiHandler } from "./handlers/rename-run-ui-handler";`;
  requireAnchor(uiSrc, IMPORT_ANCHOR, "RenameRunFormUiHandler import in ui.ts");
  uiSrc = uiSrc.replace(
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\nimport { SeedInputUiHandler } from "./handlers/seed-input-ui-handler";`,
  );

  // 3b. Register handler — insert after new RenameRunFormUiHandler()
  const HANDLER_ANCHOR = `new RenameRunFormUiHandler(),`;
  requireAnchor(uiSrc, HANDLER_ANCHOR, "new RenameRunFormUiHandler() in ui.ts");
  uiSrc = uiSrc.replace(
    HANDLER_ANCHOR,
    `${HANDLER_ANCHOR}\n      new SeedInputUiHandler(),`,
  );

  // 3c. noTransitionModes — insert after UiMode.RENAME_RUN
  const NO_TRANSITION_ANCHOR = `UiMode.RENAME_RUN,`;
  requireAnchor(uiSrc, NO_TRANSITION_ANCHOR, "UiMode.RENAME_RUN in noTransitionModes");
  uiSrc = uiSrc.replace(
    NO_TRANSITION_ANCHOR,
    `${NO_TRANSITION_ANCHOR}\n  UiMode.SEED_INPUT,`,
  );

  writeFile(UI_PATH, uiSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 4: src/phases/title-phase.ts  →  inject Seeded Run option
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_PATH = path.join("pokerogue-src", "src", "phases", "title-phase.ts");
let phaseSrc = readFile(PHASE_PATH);

if (phaseSrc.includes("seeded-classic-run")) {
  console.log("SKIP title-phase.ts — Seeded Run option already present");
} else {
  const CLASSIC_BLOCK =
`          options.push({
            label: GameMode.getModeName(GameModes.CLASSIC),
            handler: () => {
              setModeAndEnd(GameModes.CLASSIC);
              return true;
            },
          });`;

  requireAnchor(phaseSrc, CLASSIC_BLOCK, "Classic option block in title-phase.ts");

  const SEEDED_OPTION =
`          // seeded-classic-run: player-supplied seed, otherwise a standard Classic run.
          options.push({
            label: i18next.t("menu:seededRun"),
            handler: () => {
              globalScene.ui.setOverlayMode(
                UiMode.SEED_INPUT,
                {
                  buttonActions: [
                    (encodedSeed: string) => {
                      const seed = decodeURIComponent(atob(encodedSeed)).trim();
                      if (seed) {
                        // Overrides.SEED_OVERRIDE is read by newBattle() as:
                        //   this.setSeed(Overrides.SEED_OVERRIDE || randomString(24))
                        // Setting it here is the canonical way to supply a fixed seed.
                        Overrides.SEED_OVERRIDE = seed;
                      }
                      globalScene.ui.revertMode();
                      setModeAndEnd(GameModes.CLASSIC);
                    },
                    () => {
                      // Cancel — close the modal, option list stays open.
                      globalScene.ui.revertMode();
                    },
                  ],
                },
              );
              return true;
            },
          });`;

  phaseSrc = phaseSrc.replace(CLASSIC_BLOCK, `${CLASSIC_BLOCK}\n${SEEDED_OPTION}`);
  writeFile(PHASE_PATH, phaseSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 5: locales/en/menu.json  →  add new keys
// ─────────────────────────────────────────────────────────────────────────────

const LOCALE_PATH = path.join("pokerogue-src", "locales", "en", "menu.json");
let localeSrc = readFile(LOCALE_PATH);

if (localeSrc.includes('"seededRunTitle"')) {
  console.log("SKIP menu.json — locale keys already present");
} else {
  // Inject all new keys after "dailyRun" so they sit together in the file.
  const LOCALE_ANCHOR = `"dailyRun": "Daily Run"`;
  requireAnchor(localeSrc, LOCALE_ANCHOR, "dailyRun key in menu.json");

  // If the previous seeded-classic-run patch already added "seededRun", append
  // only the missing keys; otherwise add everything.
  const hasSeededRun = localeSrc.includes('"seededRun"');

  if (hasSeededRun) {
    // Insert after the existing seededRun line
    const EXISTING_ANCHOR = `"seededRun": "Seeded Run"`;
    requireAnchor(localeSrc, EXISTING_ANCHOR, "seededRun key in menu.json");
    localeSrc = localeSrc.replace(
      EXISTING_ANCHOR,
      `${EXISTING_ANCHOR},\n  "seededRunTitle": "Seeded Run",\n  "seed": "Seed",\n  "startRun": "Start"`,
    );
  } else {
    localeSrc = localeSrc.replace(
      LOCALE_ANCHOR,
      `${LOCALE_ANCHOR},\n  "seededRun": "Seeded Run",\n  "seededRunTitle": "Seeded Run",\n  "seed": "Seed",\n  "startRun": "Start"`,
    );
  }

  writeFile(LOCALE_PATH, localeSrc);
}

console.log("\nSeeded classic run patch applied successfully.");
