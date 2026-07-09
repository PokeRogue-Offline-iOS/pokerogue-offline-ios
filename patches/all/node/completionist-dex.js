#!/usr/bin/env node
/**
 * Patch: completionist-dex.js
 *
 * Adds a "Completionist Dex" entry to the pause menu, directly under
 * "Gacha Calendar". Opens a new offline-only screen, architecturally
 * mirroring the base game's own Achievements screen (icon grid, single
 * title bar, description panel) rather than a plain list:
 *
 *   Level 0 (category menu): one icon per tracked category - Starters
 *   Unlocked, Shiny Starters, Species Fought, Species Seen, Species
 *   Caught, Gym Leader Vouchers, Passives. Hovering shows the category
 *   name + current/total in the title bar and description panel.
 *
 *   Level 1 (drilldown, ACTION): a grid of the actual species (or list of
 *   vouchers) for that category. Defaults to showing what you already
 *   HAVE; Button.STATS (keyboard `C` / `Shift`) toggles to show what's
 *   MISSING. CANCEL returns to level 0.
 *
 * See the top-of-file doc comment in completionist-dex-ui-handler.ts for
 * exact per-category definitions and v1 scoping decisions (Gym Leader
 * Vouchers is a filtered subset of the vouchers registry, Shiny is
 * starters-only, etc). Forms, Ribbons, and the full Vouchers set from the
 * original v1 pass are dropped entirely in this redesign.
 *
 * This is a read-only info screen: it does not touch save data, gameplay
 * mechanics, or any purchase/upgrade flow. Every stat is computed fresh
 * from `globalScene.gameData` each time the screen is opened.
 *
 * Runs after gacha-calendar.js in apply-patches.sh, and every anchor below
 * assumes that patch has already been applied to the working tree (this
 * matches how gacha-calendar.js itself assumed app-settings-menu.js had
 * already run).
 *
 * Sub-patches, applied in order:
 *
 *   1. src/enums/ui-mode.ts
 *        Insert COMPLETIONIST_DEX directly after GACHA_CALENDAR.
 *
 *   2. src/ui/handlers/completionist-dex-ui-handler.ts  (new file)
 *        The screen itself. Copied verbatim from new-files/.
 *
 *   3. src/ui/ui.ts
 *        Import CompletionistDexUiHandler, register directly after
 *        GachaCalendarUiHandler in the handlers array (positional, must
 *        match enum order), add to noTransitionModes directly after
 *        UiMode.GACHA_CALENDAR.
 *
 *   4. src/ui/handlers/menu-ui-handler.ts
 *        - Insert MenuOptions.COMPLETIONIST_DEX directly after
 *          MenuOptions.GACHA_CALENDAR.
 *        - Extend the existing GACHA_CALENDAR label special-case with a
 *          second case for COMPLETIONIST_DEX -> hardcoded "Completionist
 *          Dex" (offline-client-only feature, same reasoning as Gacha
 *          Calendar/Offline settings - not in the real locale files).
 *        - Add a switch-case that opens UiMode.COMPLETIONIST_DEX.
 *        - Add MenuOptions.COMPLETIONIST_DEX to the same two exclusion
 *          lists that already exclude MenuOptions.GACHA_CALENDAR, so it's
 *          only ever offered in the same contexts Gacha Calendar is.
 *
 *   5. index.css
 *        Add COMPLETIONIST_DEX to the #apadOpenFilters touch-button
 *        allowlist, so the on-screen "C" button (bound to Button.STATS,
 *        used for the have/missing toggle) actually shows up on this
 *        screen on mobile/touch builds. Reuses the same DOM element the
 *        Pokedex/Starter Select screens already show their "C" hint on -
 *        no new touch button, just an extra allowed UiMode.
 *
 *   6. src/ui-inputs.ts
 *        Adds CompletionistDexUiHandler to the buttonGoToFilter() whitelist
 *        so Button.STATS (C/Shift) actually reaches our processInput()
 *        instead of being swallowed by the unrelated battle-info toggle.
 *
 * NOTE ON TESTING: anchors below were confirmed against pokerogue-offline's
 * completionistDex branch working tree, post gacha-calendar.js, at the
 * time this was written. TS/CSS syntax-checked and byte-diff verified per
 * standard patch discipline - runtime behavior (grid navigation, drilldown
 * scroll, have/missing toggle, icon visuals) has NOT been verified in an
 * actual build yet, do that before shipping.
 */

const fs = require("fs");
const path = require("path");

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Could not find ${filePath}`);
    console.error("Make sure this script is run from the repo root and all submodules are initialised.");
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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

// This patch script lives at patches/all/node/completionist-dex.js in the
// pkr-offline repo. The new source file it writes is checked into this
// same repo (under new-files/) so this script and its payload stay together.
const NEW_FILES_DIR = path.join(__dirname, "..", "..", "..", "new-files");

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 1: src/enums/ui-mode.ts  →  insert COMPLETIONIST_DEX after GACHA_CALENDAR
// ─────────────────────────────────────────────────────────────────────────────

const UI_MODE_PATH = path.join("pokerogue-src", "src", "enums", "ui-mode.ts");
let uiModeSrc = readFile(UI_MODE_PATH);

if (uiModeSrc.includes("COMPLETIONIST_DEX")) {
  console.log("SKIP ui-mode.ts — COMPLETIONIST_DEX already present");
} else {
  const ANCHOR = "GACHA_CALENDAR,";
  requireAnchor(uiModeSrc, ANCHOR, "GACHA_CALENDAR in ui-mode.ts");
  uiModeSrc = uiModeSrc.replace(ANCHOR, `${ANCHOR}\n  COMPLETIONIST_DEX,`);
  writeFile(UI_MODE_PATH, uiModeSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 2: src/ui/handlers/completionist-dex-ui-handler.ts  (new file)
// ─────────────────────────────────────────────────────────────────────────────

const HANDLER_PATH = path.join("pokerogue-src", "src", "ui", "handlers", "completionist-dex-ui-handler.ts");

if (fs.existsSync(HANDLER_PATH)) {
  console.log("SKIP completionist-dex-ui-handler.ts — already exists");
} else {
  const src = fs.readFileSync(
    path.join(NEW_FILES_DIR, "src", "ui", "handlers", "completionist-dex-ui-handler.ts"),
    "utf8",
  );
  writeFile(HANDLER_PATH, src);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 3: src/ui/ui.ts  →  import + register + noTransitionModes
// ─────────────────────────────────────────────────────────────────────────────

const UI_PATH = path.join("pokerogue-src", "src", "ui", "ui.ts");
let uiSrc = readFile(UI_PATH);

if (uiSrc.includes("CompletionistDexUiHandler")) {
  console.log("SKIP ui.ts — CompletionistDexUiHandler already present");
} else {
  const IMPORT_ANCHOR = `import { GachaCalendarUiHandler } from "#ui/gacha-calendar-ui-handler";`;
  requireAnchor(uiSrc, IMPORT_ANCHOR, "GachaCalendarUiHandler import in ui.ts");
  uiSrc = uiSrc.replace(
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\nimport { CompletionistDexUiHandler } from "#ui/completionist-dex-ui-handler";`,
  );

  // Ui.getHandler() does `this.handlers[this.mode]` - the handlers array is
  // indexed positionally by UiMode's numeric enum value, NOT looked up by
  // type. Since COMPLETIONIST_DEX is inserted directly after GACHA_CALENDAR
  // in the enum, its handler instance MUST also sit directly after
  // GachaCalendarUiHandler's in this array.
  const HANDLER_ANCHOR = `new GachaCalendarUiHandler(),`;
  requireAnchor(uiSrc, HANDLER_ANCHOR, "new GachaCalendarUiHandler() in ui.ts");
  uiSrc = uiSrc.replace(HANDLER_ANCHOR, `${HANDLER_ANCHOR}\n      new CompletionistDexUiHandler(),`);

  const NO_TRANSITION_ANCHOR = `UiMode.GACHA_CALENDAR,`;
  requireAnchor(uiSrc, NO_TRANSITION_ANCHOR, "UiMode.GACHA_CALENDAR in noTransitionModes");
  uiSrc = uiSrc.replace(NO_TRANSITION_ANCHOR, `${NO_TRANSITION_ANCHOR}\n  UiMode.COMPLETIONIST_DEX,`);

  writeFile(UI_PATH, uiSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 4: src/ui/handlers/menu-ui-handler.ts
// ─────────────────────────────────────────────────────────────────────────────

const MENU_PATH = path.join("pokerogue-src", "src", "ui", "handlers", "menu-ui-handler.ts");
let menuSrc = readFile(MENU_PATH);

if (menuSrc.includes("COMPLETIONIST_DEX")) {
  console.log("SKIP menu-ui-handler.ts — COMPLETIONIST_DEX already present");
} else {
  // 4a. MenuOptions enum — insert right after GACHA_CALENDAR.
  const ENUM_ANCHOR = `  GACHA_CALENDAR,\n  POKEDEX,`;
  requireAnchor(menuSrc, ENUM_ANCHOR, "GACHA_CALENDAR in MenuOptions enum");
  menuSrc = menuSrc.replace(ENUM_ANCHOR, `  GACHA_CALENDAR,\n  COMPLETIONIST_DEX,\n  POKEDEX,`);

  // 4b. Label rendering — extend the existing GACHA_CALENDAR special-case
  //     with a second hardcoded label for COMPLETIONIST_DEX.
  const LABEL_ANCHOR = `o === MenuOptions.GACHA_CALENDAR
            ? "Gacha Calendar"
            : \`\${i18next.t(\`menuUiHandler:\${toCamelCase(MenuOptions[o])}\`)}\`,`;
  requireAnchor(menuSrc, LABEL_ANCHOR, "GACHA_CALENDAR label case in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    LABEL_ANCHOR,
    `o === MenuOptions.GACHA_CALENDAR
            ? "Gacha Calendar"
            : o === MenuOptions.COMPLETIONIST_DEX
              ? "Completionist Dex"
              : \`\${i18next.t(\`menuUiHandler:\${toCamelCase(MenuOptions[o])}\`)}\`,`,
  );

  // 4c. Switch-case — open the new screen, same pattern as GACHA_CALENDAR.
  const CASE_ANCHOR = `        case MenuOptions.GACHA_CALENDAR:
          ui.revertMode();
          ui.setOverlayMode(UiMode.GACHA_CALENDAR);
          success = true;
          break;`;
  requireAnchor(menuSrc, CASE_ANCHOR, "MenuOptions.GACHA_CALENDAR switch-case in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    CASE_ANCHOR,
    `${CASE_ANCHOR}
        case MenuOptions.COMPLETIONIST_DEX:
          ui.revertMode();
          ui.setOverlayMode(UiMode.COMPLETIONIST_DEX);
          success = true;
          break;`,
  );

  // 4d. Exclusion lists — hide it in the same contexts GACHA_CALENDAR is hidden in.
  const EXCLUSION_1_ANCHOR = `options: [MenuOptions.EGG_GACHA, MenuOptions.EGG_LIST, MenuOptions.GACHA_CALENDAR],`;
  requireAnchor(menuSrc, EXCLUSION_1_ANCHOR, "constructor excludedMenus in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    EXCLUSION_1_ANCHOR,
    `options: [MenuOptions.EGG_GACHA, MenuOptions.EGG_LIST, MenuOptions.GACHA_CALENDAR, MenuOptions.COMPLETIONIST_DEX],`,
  );

  const EXCLUSION_2_ANCHOR = `options: [MenuOptions.EGG_GACHA, MenuOptions.GACHA_CALENDAR],`;
  requireAnchor(menuSrc, EXCLUSION_2_ANCHOR, "render() excludedMenus in menu-ui-handler.ts");
  menuSrc = menuSrc.replace(
    EXCLUSION_2_ANCHOR,
    `options: [MenuOptions.EGG_GACHA, MenuOptions.GACHA_CALENDAR, MenuOptions.COMPLETIONIST_DEX],`,
  );

  writeFile(MENU_PATH, menuSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 5: index.css  →  show the #apadOpenFilters "C" touch button on this screen
// ─────────────────────────────────────────────────────────────────────────────

const CSS_PATH = path.join("pokerogue-src", "index.css");
let cssSrc = readFile(CSS_PATH);

if (cssSrc.includes('[data-ui-mode="COMPLETIONIST_DEX"]')) {
  console.log("SKIP index.css — COMPLETIONIST_DEX already present");
} else {
  const CSS_ANCHOR = `#touchControls:not(.config-mode):not(
    [data-ui-mode="STARTER_SELECT"],
    [data-ui-mode="POKEDEX"],
    [data-ui-mode="POKEDEX_PAGE"]
  )
  #apadOpenFilters,`;
  requireAnchor(cssSrc, CSS_ANCHOR, "#apadOpenFilters touch-button allowlist in index.css");
  cssSrc = cssSrc.replace(
    CSS_ANCHOR,
    `#touchControls:not(.config-mode):not(
    [data-ui-mode="STARTER_SELECT"],
    [data-ui-mode="POKEDEX"],
    [data-ui-mode="POKEDEX_PAGE"],
    [data-ui-mode="COMPLETIONIST_DEX"]
  )
  #apadOpenFilters,`,
  );
  writeFile(CSS_PATH, cssSrc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-patch 6: src/ui-inputs.ts  →  let Button.STATS actually reach our handler
// ─────────────────────────────────────────────────────────────────────────────
//
// Button.STATS (keyboard C/Shift) doesn't reach UiHandler.processInput()
// generically - it's intercepted by UiInputs.buttonGoToFilter(), which only
// forwards it to globalScene.ui.processInput() for a hardcoded whitelist of
// handler classes (StarterSelectUiHandler, PokedexUiHandler,
// PokedexPageUiHandler). Anything else just calls the unrelated battle-info
// buttonStats() toggle instead, which does nothing visible on our screen.
// Confirmed via real testing (C did nothing on this screen) before writing
// this patch - not a guess.

const UI_INPUTS_PATH = path.join("pokerogue-src", "src", "ui-inputs.ts");
let uiInputsSrc = readFile(UI_INPUTS_PATH);

if (uiInputsSrc.includes("CompletionistDexUiHandler")) {
  console.log("SKIP ui-inputs.ts — CompletionistDexUiHandler already present");
} else {
  const IMPORT_ANCHOR = `import { PokedexPageUiHandler } from "#ui/pokedex-page-ui-handler";`;
  requireAnchor(uiInputsSrc, IMPORT_ANCHOR, "PokedexPageUiHandler import in ui-inputs.ts");
  uiInputsSrc = uiInputsSrc.replace(
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\nimport { CompletionistDexUiHandler } from "#ui/completionist-dex-ui-handler";`,
  );

  const WHITELIST_ANCHOR = `const whitelist = [StarterSelectUiHandler, PokedexUiHandler, PokedexPageUiHandler];`;
  requireAnchor(uiInputsSrc, WHITELIST_ANCHOR, "buttonGoToFilter whitelist in ui-inputs.ts");
  uiInputsSrc = uiInputsSrc.replace(
    WHITELIST_ANCHOR,
    `const whitelist = [StarterSelectUiHandler, PokedexUiHandler, PokedexPageUiHandler, CompletionistDexUiHandler];`,
  );

  writeFile(UI_INPUTS_PATH, uiInputsSrc);
}

console.log("\ncompletionist-dex patch applied successfully.");
