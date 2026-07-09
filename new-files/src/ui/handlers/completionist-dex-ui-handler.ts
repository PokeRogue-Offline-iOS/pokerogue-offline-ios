import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { DexAttr } from "#enums/dex-attr";
import { Passive as PassiveAttr } from "#enums/passive";
import { TextStyle } from "#enums/text-style";
import { TrainerType } from "#enums/trainer-type";
import { UiMode } from "#enums/ui-mode";
import { getVoucherTypeIcon, vouchers } from "#system/voucher";
import { MessageUiHandler } from "#ui/message-ui-handler";
import { ScrollBar } from "#ui/scroll-bar";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";

/**
 * Offline-only "Completionist Dex" screen. Read-only against
 * `globalScene.gameData` - never mutates save data. Recomputed fresh every
 * time the screen is opened, same as the real Achievements/Pokedex screens.
 *
 * Architecture mirrors `AchvsUiHandler` (header bar / icon grid+scrollbar /
 * single title bar / description panel), extended to three navigable
 * levels rather than Achv's two flat "pages":
 *
 *   Level 0 (category menu): one icon per top-level category. Two of these
 *   ("Vouchers", "Candy") are GROUPS that open a submenu instead of a
 *   drilldown directly - everything else is a plain leaf category.
 *
 *   Level 1 (submenu, groups only): one icon per sub-category within that
 *   group. Same grid size/behavior as the category menu.
 *
 *   Level 2 (drilldown): a grid of the actual species (or a list of
 *   vouchers) for whichever leaf category was selected, whether reached
 *   directly from level 0 or via a level-1 submenu. Defaults to showing
 *   what you already HAVE. Button.STATS (keyboard `C` / `Shift`) toggles to
 *   show what's MISSING instead. ACTION on a species icon opens that
 *   species' real Pokedex entry (UiMode.POKEDEX_PAGE) - voucher items don't
 *   have an equivalent target, so ACTION is a no-op for those.
 *
 *   CANCEL walks back up one level at a time; from level 0 it exits the
 *   screen entirely.
 *
 * The header bar (top-left text, static "Completionist Dex" in earlier
 * versions) is now a breadcrumb reflecting the current location, e.g.
 * "Completionist Dex > Vouchers > Gym Leaders".
 *
 * Category/sub-category definitions (all derived from real, already-
 * persisted save fields - nothing new is stored by this screen):
 *   - Starters Unlocked -> starters where `caughtAttr !== 0n`
 *   - Shiny Starters     -> starters where `caughtAttr & DexAttr.SHINY`
 *   - Species Fought     -> all species where `seenCount > 0` (this is what
 *                           the game internally calls "Encountered")
 *   - Species Seen       -> all species where `seenAttr !== 0n || caughtAttr !== 0n`
 *                           (approximates the real `isSeen()`, doesn't chase
 *                           the base-starter fallback for evolved/hatched-
 *                           without-encounter edge cases)
 *   - Species Caught     -> all species where `caughtAttr !== 0n`. NOTE:
 *                           this was originally `caughtCount > 0`, which was
 *                           wrong - `caughtCount` only increments on a
 *                           direct wild/trainer catch (see
 *                           `GameData.setPokemonSpeciesCaught`), NOT on
 *                           hatching or evolving into a species. `caughtAttr`
 *                           is set unconditionally regardless of how the
 *                           species was obtained, and is what the real
 *                           Pokedex screen itself checks (`!!dexEntry.caughtAttr`
 *                           in `pokedex-ui-handler.ts`). Caught this via a
 *                           real save mismatch during testing (927/1084
 *                           shown vs the true 1084/1084) - not a guess.
 *   - Vouchers (group)   -> the `vouchers` registry, split by TrainerType
 *                           band into four sub-categories:
 *                             Gym Leaders  -> >= BROCK    && < LORELEI
 *                             Elite Four   -> >= LORELEI  && < BLUE
 *                             Champion     -> >= BLUE     && < RIVAL
 *                             Evil Team    -> >= ROCKET_BOSS_GIOVANNI_1 && < BROCK
 *                           `vouchers` also has a CLASSIC_VICTORY entry
 *                           that isn't a TrainerType at all - `TrainerType[key]`
 *                           resolves to `undefined` for it and it's skipped.
 *                           The Evil Team band technically also spans the
 *                           generic-grunt and Mystery-Encounter-trainer
 *                           TrainerType numbers, but neither of those ever
 *                           has a voucher, so filtering the already-voucher-
 *                           only `vouchers` registry by that range is safe
 *                           in practice even though the raw enum range is
 *                           wider than "just bosses".
 *   - Candy (group)      -> starters, split into three sub-categories:
 *                             Passives  -> `passiveAttr & PassiveAttr.UNLOCKED`
 *   - Candy (group)      -> starters, split into four sub-categories:
 *                             Passives             -> `passiveAttr & PassiveAttr.UNLOCKED`
 *                             Any Reduction Amount  -> `starterData.valueReduction >= 1`
 *                             One Reduction         -> `starterData.valueReduction === 1` (exactly one, not two)
 *                             Two Reductions        -> `starterData.valueReduction === 2` (max tier)
 *                           "Any Reduction Amount" is the union of the other
 *                           two tiers; "One"/"Two" are exact matches, not
 *                           `>=`, so a fully-maxed starter shows under "Two
 *                           Reductions" and "Any Reduction Amount" but NOT
 *                           under "One Reduction".
 *
 * Forms and Ribbons from the original v1 pass are still dropped entirely -
 * not silently carried over as dead code.
 *
 * Icon choices are all real, already-used-elsewhere atlas keys, but exact
 * visual balance (spacing, scale) hasn't been eyeballed in an actual build
 * yet - flagged, not guessed at silently.
 */

type CategoryKind = "species" | "voucher";

interface LeafCategory {
  label: string;
  kind: CategoryKind;
  iconTexture: string;
  iconFrame: string | number;
  /** Species IDs or voucher keys the player already has. */
  haveIds: (number | string)[];
  /** Species IDs or voucher keys the player is missing. */
  missingIds: (number | string)[];
}

interface GroupCategory {
  label: string;
  iconTexture: string;
  iconFrame: string | number;
  subCategories: LeafCategory[];
}

type TopCategory = LeafCategory | GroupCategory;

function isGroup(category: TopCategory): category is GroupCategory {
  return "subCategories" in category;
}

const LEVEL0_COLS = 9;
const LEVEL0_ROWS = 2;
const LEVEL1_COLS = 18;
const LEVEL1_ROWS = 4;
// Icon pool is sized for the largest level; smaller levels just use the
// first few slots and hide the rest.
const MAX_COLS = LEVEL1_COLS;
const MAX_ROWS = LEVEL1_ROWS;
const ICON_SPACING_X = 17;
const ICON_SPACING_Y = 19;

const Level = {
  CATEGORY_MENU: 0,
  SUBMENU: 1,
  DRILLDOWN: 2,
} as const;
type Level = (typeof Level)[keyof typeof Level];

export class CompletionistDexUiHandler extends MessageUiHandler {
  private mainContainer: Phaser.GameObjects.Container;
  private iconsContainer: Phaser.GameObjects.Container;

  private headerBg: Phaser.GameObjects.NineSlice;
  private headerText: Phaser.GameObjects.Text;

  private iconsBg: Phaser.GameObjects.NineSlice;
  private icons: Phaser.GameObjects.Sprite[];

  private titleBg: Phaser.GameObjects.NineSlice;
  private titleText: Phaser.GameObjects.Text;

  private scrollBar: ScrollBar;
  private scrollCursor: number;
  private cursorObj: Phaser.GameObjects.NineSlice | null;

  private categories: TopCategory[] = [];
  private currentTotal: number;

  private level: Level = Level.CATEGORY_MENU;
  private currentGroup: GroupCategory | null = null;
  private currentLeaf: LeafCategory | null = null;
  /** Within a drilldown: false = showing "have", true = showing "missing". */
  private showingMissing = false;

  constructor(mode: UiMode | null = null) {
    super(mode);
    this.scrollCursor = 0;
  }

  setup(): void {
    const ui = this.getUi();

    const WIDTH = globalScene.scaledCanvas.width;
    const HEIGHT = globalScene.scaledCanvas.height;

    this.mainContainer = globalScene.add.container(1, -HEIGHT + 1);
    this.mainContainer.setInteractive(new Phaser.Geom.Rectangle(0, 0, WIDTH, HEIGHT), Phaser.Geom.Rectangle.Contains);

    this.headerBg = addWindow(0, 0, WIDTH - 2, 24);
    this.headerText = addTextObject(0, 0, "Completionist Dex", TextStyle.HEADER_LABEL)
      .setOrigin(0)
      .setPositionRelative(this.headerBg, 8, 4);

    this.iconsBg = addWindow(0, this.headerBg.height, WIDTH - 2, HEIGHT - this.headerBg.height - 68).setOrigin(0);

    const yOffset = 6;
    this.scrollBar = new ScrollBar(
      this.iconsBg.width - 9,
      this.iconsBg.y + yOffset,
      4,
      this.iconsBg.height - yOffset * 2,
      LEVEL1_ROWS,
    );

    this.iconsContainer = globalScene.add.container(5, this.headerBg.height + 8);

    this.icons = [];
    for (let a = 0; a < MAX_ROWS * MAX_COLS; a++) {
      const icon = globalScene.add.sprite(0, 0, "items", "unknown").setOrigin(0).setScale(0.5);
      this.icons.push(icon);
      this.iconsContainer.add(icon);
    }

    // Full-width title bar - no score/date boxes, per redesign spec.
    this.titleBg = addWindow(0, this.headerBg.height + this.iconsBg.height, WIDTH - 2, 24);
    this.titleText = addTextObject(0, 0, "", TextStyle.WINDOW).setOrigin();
    this.titleText.setPosition(this.titleBg.x + this.titleBg.width / 2, this.titleBg.y + this.titleBg.height / 2);

    const descriptionBg = addWindow(0, this.titleBg.y + this.titleBg.height, WIDTH - 2, 42);
    const descriptionText = addTextObject(0, 0, "", TextStyle.WINDOW, { maxLines: 2 })
      .setWordWrapWidth(1870)
      .setOrigin(0)
      .setPositionRelative(descriptionBg, 8, 4);
    this.message = descriptionText;

    this.mainContainer.add([
      this.headerBg,
      this.headerText,
      this.iconsBg,
      this.scrollBar,
      this.iconsContainer,
      this.titleBg,
      this.titleText,
      descriptionBg,
      descriptionText,
    ]);

    ui.add(this.mainContainer);
    this.mainContainer.setVisible(false);
  }

  override show(args: any[]): boolean {
    super.show(args);

    this.categories = this.computeCategories();
    this.showingMissing = false;

    this.enterCategoryMenu();

    this.mainContainer.setVisible(true);
    this.getUi().moveTo(this.mainContainer, this.getUi().length - 1);
    this.getUi().hideTooltip();

    return true;
  }

  /** Pulls every category/sub-category's have/missing lists straight from `globalScene.gameData`. See file-header doc for exact definitions. */
  private computeCategories(): TopCategory[] {
    const gameData = globalScene.gameData;
    const dexData = gameData.dexData;
    const speciesIds = Object.keys(dexData).map(Number);
    const starterIds = speciesDataRegistry.getAllStarters();

    const caughtHave: number[] = [];
    const caughtMissing: number[] = [];
    const foughtHave: number[] = [];
    const foughtMissing: number[] = [];
    const seenHave: number[] = [];
    const seenMissing: number[] = [];

    for (const id of speciesIds) {
      const entry = dexData[id];
      (entry.caughtAttr !== 0n ? caughtHave : caughtMissing).push(id);
      (entry.seenCount > 0 ? foughtHave : foughtMissing).push(id);
      (entry.seenAttr !== 0n || entry.caughtAttr !== 0n ? seenHave : seenMissing).push(id);
    }

    const startersHave: number[] = [];
    const startersMissing: number[] = [];
    const shinyHave: number[] = [];
    const shinyMissing: number[] = [];
    const passiveHave: number[] = [];
    const passiveMissing: number[] = [];
    const reducedAnyHave: number[] = [];
    const reducedAnyMissing: number[] = [];
    const reducedOneHave: number[] = [];
    const reducedOneMissing: number[] = [];
    const reducedTwoHave: number[] = [];
    const reducedTwoMissing: number[] = [];

    for (const id of starterIds) {
      const entry = dexData[id];
      (entry.caughtAttr !== 0n ? startersHave : startersMissing).push(id);
      (entry.caughtAttr & DexAttr.SHINY ? shinyHave : shinyMissing).push(id);

      const sd = gameData.starterData[id];
      const passiveUnlocked = !!sd && !!(sd.passiveAttr & PassiveAttr.UNLOCKED);
      (passiveUnlocked ? passiveHave : passiveMissing).push(id);

      const valueReduction = sd?.valueReduction ?? 0;
      (valueReduction >= 1 ? reducedAnyHave : reducedAnyMissing).push(id);
      (valueReduction === 1 ? reducedOneHave : reducedOneMissing).push(id);
      (valueReduction === 2 ? reducedTwoHave : reducedTwoMissing).push(id);
    }

    // Vouchers - split the shared registry by TrainerType band. See
    // file-header doc for the exact bands and the CLASSIC_VICTORY/grunt/ME-
    // trainer edge cases.
    const gymLeaderHave: string[] = [];
    const gymLeaderMissing: string[] = [];
    const eliteFourHave: string[] = [];
    const eliteFourMissing: string[] = [];
    const evilTeamHave: string[] = [];
    const evilTeamMissing: string[] = [];
    const championHave: string[] = [];
    const championMissing: string[] = [];

    for (const key of Object.keys(vouchers)) {
      const trainerType = TrainerType[key as keyof typeof TrainerType];
      if (trainerType === undefined) {
        continue;
      }
      const unlocked = Object.hasOwn(gameData.voucherUnlocks, key);

      if (trainerType >= TrainerType.BROCK && trainerType < TrainerType.LORELEI) {
        (unlocked ? gymLeaderHave : gymLeaderMissing).push(key);
      } else if (trainerType >= TrainerType.LORELEI && trainerType < TrainerType.BLUE) {
        (unlocked ? eliteFourHave : eliteFourMissing).push(key);
      } else if (trainerType >= TrainerType.BLUE && trainerType < TrainerType.RIVAL) {
        (unlocked ? championHave : championMissing).push(key);
      } else if (trainerType >= TrainerType.ROCKET_BOSS_GIOVANNI_1 && trainerType < TrainerType.BROCK) {
        (unlocked ? evilTeamHave : evilTeamMissing).push(key);
      }
      // Anything outside these four bands (shouldn't happen given
      // `vouchers` is already boss-trainer-only) is silently skipped
      // rather than risking a miscategorized entry.
    }

    const vouchersGroup: GroupCategory = {
      label: "Vouchers",
      iconTexture: "items",
      iconFrame: "coupon",
      subCategories: [
        {
          label: "Gym Leaders",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "coupon",
          haveIds: gymLeaderHave,
          missingIds: gymLeaderMissing,
        },
        {
          label: "Elite Four",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "pair_of_tickets",
          haveIds: eliteFourHave,
          missingIds: eliteFourMissing,
        },
        {
          label: "Evil Team",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "mystic_ticket",
          haveIds: evilTeamHave,
          missingIds: evilTeamMissing,
        },
        {
          label: "Champion",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "golden_mystic_ticket",
          haveIds: championHave,
          missingIds: championMissing,
        },
      ],
    };

    const candyGroup: GroupCategory = {
      label: "Candy",
      iconTexture: "items",
      iconFrame: "candy",
      subCategories: [
        {
          label: "Passives",
          kind: "species",
          iconTexture: "items",
          iconFrame: "candy",
          haveIds: passiveHave,
          missingIds: passiveMissing,
        },
        {
          label: "Any Reduction Amount",
          kind: "species",
          iconTexture: "items",
          iconFrame: "relic_gold",
          haveIds: reducedAnyHave,
          missingIds: reducedAnyMissing,
        },
        {
          label: "One Reduction",
          kind: "species",
          iconTexture: "items",
          iconFrame: "nugget",
          haveIds: reducedOneHave,
          missingIds: reducedOneMissing,
        },
        {
          label: "Two Reductions",
          kind: "species",
          iconTexture: "items",
          iconFrame: "big_nugget",
          haveIds: reducedTwoHave,
          missingIds: reducedTwoMissing,
        },
      ],
    };

    return [
      {
        label: "Starters Unlocked",
        kind: "species",
        iconTexture: "items",
        iconFrame: "pb",
        haveIds: startersHave,
        missingIds: startersMissing,
      },
      {
        label: "Shiny Starters",
        kind: "species",
        // Deliberately NOT one of the shiny_icons variant-tier sparkles -
        // those are reserved for an upcoming submenu that uses all three.
        iconTexture: "items",
        iconFrame: "golden_egg",
        haveIds: shinyHave,
        missingIds: shinyMissing,
      },
      {
        label: "Species Fought",
        kind: "species",
        iconTexture: "items",
        iconFrame: "expert_belt",
        haveIds: foughtHave,
        missingIds: foughtMissing,
      },
      {
        label: "Species Seen",
        kind: "species",
        iconTexture: "items",
        iconFrame: "scope_lens",
        haveIds: seenHave,
        missingIds: seenMissing,
      },
      {
        label: "Species Caught",
        kind: "species",
        iconTexture: "items",
        iconFrame: "pb",
        haveIds: caughtHave,
        missingIds: caughtMissing,
      },
      vouchersGroup,
      candyGroup,
    ];
  }

  private enterCategoryMenu(): void {
    this.level = Level.CATEGORY_MENU;
    this.currentGroup = null;
    this.currentLeaf = null;
    this.layoutGrid(LEVEL0_COLS);
    this.currentTotal = this.categories.length;
    this.setScrollCursor(0);
    this.refreshTileIcons(this.categories);
    this.updateHeaderText();
    this.setCursor(0, true);
  }

  private enterSubmenu(group: GroupCategory): void {
    this.level = Level.SUBMENU;
    this.currentGroup = group;
    this.currentLeaf = null;
    this.layoutGrid(LEVEL0_COLS);
    this.currentTotal = group.subCategories.length;
    this.setScrollCursor(0);
    this.refreshTileIcons(group.subCategories);
    this.updateHeaderText();
    this.setCursor(0, true);
  }

  private enterDrilldown(leaf: LeafCategory): void {
    this.level = Level.DRILLDOWN;
    this.currentLeaf = leaf;
    this.showingMissing = false;
    this.layoutGrid(LEVEL1_COLS);
    this.updateHeaderText();
    this.refreshDrilldownState();
  }

  private refreshDrilldownState(): void {
    const leaf = this.currentLeaf;
    if (!leaf) {
      return;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    this.currentTotal = list.length;
    this.setScrollCursor(0);
    this.refreshDrilldownIcons();
    this.setCursor(0, true);
  }

  private toggleMissing(): void {
    this.showingMissing = !this.showingMissing;
    this.refreshDrilldownState();
  }

  private updateHeaderText(): void {
    const parts = ["Completionist Dex"];
    if (this.currentGroup) {
      parts.push(this.currentGroup.label);
    }
    if (this.level === Level.DRILLDOWN && this.currentLeaf) {
      parts.push(this.currentLeaf.label);
    }
    this.headerText.setText(parts.join(" > "));
  }

  /** Repositions the shared icon pool for the given column count and hides any slots beyond `rows * cols`. */
  private layoutGrid(cols: number): void {
    const rows = cols === LEVEL1_COLS ? LEVEL1_ROWS : LEVEL0_ROWS;
    for (let a = 0; a < this.icons.length; a++) {
      if (a >= rows * cols) {
        this.icons[a].setVisible(false);
        continue;
      }
      this.icons[a].setPosition((a % cols) * ICON_SPACING_X, Math.floor(a / cols) * ICON_SPACING_Y);
    }
  }

  private currentCols(): number {
    return this.level === Level.DRILLDOWN ? LEVEL1_COLS : LEVEL0_COLS;
  }

  private currentRows(): number {
    return this.level === Level.DRILLDOWN ? LEVEL1_ROWS : LEVEL0_ROWS;
  }

  private refreshTileIcons(tiles: { iconTexture: string; iconFrame: string | number }[]): void {
    tiles.forEach((tile, i) => {
      const icon = this.icons[i];
      icon.setTexture(tile.iconTexture, tile.iconFrame);
      icon.clearTint();
      icon.setVisible(true);
    });
    for (let i = tiles.length; i < LEVEL0_ROWS * LEVEL0_COLS; i++) {
      this.icons[i].setVisible(false);
    }
  }

  private refreshDrilldownIcons(): void {
    const leaf = this.currentLeaf;
    if (!leaf) {
      return;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const itemOffset = this.scrollCursor * LEVEL1_COLS;
    const itemLimit = LEVEL1_ROWS * LEVEL1_COLS;
    const itemRange = list.slice(itemOffset, itemOffset + itemLimit);

    itemRange.forEach((item, i) => {
      const icon = this.icons[i];
      icon.clearTint();
      if (leaf.kind === "species") {
        const species = speciesDataRegistry.getSpecies(item as number);
        icon.setTexture(species.getIconAtlasKey(0, false, 0), species.getIconId(false, 0, false, 0));
      } else {
        icon.setTexture("items", getVoucherTypeIcon(vouchers[item as string].voucherType));
      }
      icon.setVisible(true);
    });

    for (let i = itemRange.length; i < LEVEL1_ROWS * LEVEL1_COLS; i++) {
      this.icons[i].setVisible(false);
    }
  }

  /** Updates the title bar + description panel for whatever's currently under the cursor. */
  private updateDetailPanel(): void {
    if (this.level === Level.CATEGORY_MENU) {
      const tile = this.categories[this.cursor + this.scrollCursor * LEVEL0_COLS];
      if (!tile) {
        return;
      }
      this.titleText.setText(tile.label);
      if (isGroup(tile)) {
        const total = tile.subCategories.reduce((sum, c) => sum + c.haveIds.length + c.missingIds.length, 0);
        const have = tile.subCategories.reduce((sum, c) => sum + c.haveIds.length, 0);
        this.showText(`${have}/${total} (${pct(have, total)}%)`);
      } else {
        const total = tile.haveIds.length + tile.missingIds.length;
        this.showText(`${tile.haveIds.length}/${total} (${pct(tile.haveIds.length, total)}%)`);
      }
      return;
    }

    if (this.level === Level.SUBMENU) {
      const leaf = this.currentGroup?.subCategories[this.cursor + this.scrollCursor * LEVEL0_COLS];
      if (!leaf) {
        return;
      }
      this.titleText.setText(leaf.label);
      const total = leaf.haveIds.length + leaf.missingIds.length;
      this.showText(`${leaf.haveIds.length}/${total} (${pct(leaf.haveIds.length, total)}%)`);
      return;
    }

    // DRILLDOWN
    const leaf = this.currentLeaf;
    if (!leaf) {
      return;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const item = list[this.cursor + this.scrollCursor * LEVEL1_COLS];
    const modeLabel = this.showingMissing ? "Missing" : "Unlocked";

    if (item === undefined) {
      this.titleText.setText(`${leaf.label} - ${modeLabel}`);
      this.showText("");
      return;
    }

    if (leaf.kind === "species") {
      const name = speciesDataRegistry.getSpecies(item as number).getName();
      this.titleText.setText(`${name} - ${leaf.label} (${modeLabel})`);
      this.showText("Press ACTION to view its Pokedex entry.");
    } else {
      const voucher = vouchers[item as string];
      this.titleText.setText(`${leaf.label} (${modeLabel})`);
      this.showText(voucher.description);
    }
  }

  /** ACTION on a species icon while drilled down opens that species' real Pokedex entry. No-op for voucher items. */
  private openPokedexEntryForCursor(): boolean {
    const leaf = this.currentLeaf;
    if (!leaf || leaf.kind !== "species") {
      return false;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const item = list[this.cursor + this.scrollCursor * LEVEL1_COLS];
    if (item === undefined) {
      return false;
    }
    const species = speciesDataRegistry.getSpecies(item as number);
    globalScene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, species);
    return true;
  }

  // #region Input Processing

  processInput(button: Button): boolean {
    let success = false;

    switch (button) {
      case Button.ACTION:
        if (this.level === Level.CATEGORY_MENU) {
          const tile = this.categories[this.cursor + this.scrollCursor * LEVEL0_COLS];
          if (tile) {
            if (isGroup(tile)) {
              this.enterSubmenu(tile);
            } else {
              this.enterDrilldown(tile);
            }
            success = true;
          }
        } else if (this.level === Level.SUBMENU) {
          const leaf = this.currentGroup?.subCategories[this.cursor + this.scrollCursor * LEVEL0_COLS];
          if (leaf) {
            this.enterDrilldown(leaf);
            success = true;
          }
        } else {
          success = this.openPokedexEntryForCursor();
        }
        break;
      case Button.CANCEL:
        if (this.level === Level.DRILLDOWN) {
          if (this.currentGroup) {
            this.enterSubmenu(this.currentGroup);
          } else {
            this.enterCategoryMenu();
          }
        } else if (this.level === Level.SUBMENU) {
          this.enterCategoryMenu();
        } else {
          globalScene.ui.revertMode();
        }
        success = true;
        break;
      case Button.STATS:
        if (this.level === Level.DRILLDOWN) {
          this.toggleMissing();
          success = true;
        }
        break;
      case Button.UP:
        success = this.processUpInput();
        break;
      case Button.DOWN:
        success = this.processDownInput();
        break;
      case Button.LEFT:
        success = this.processLeftInput();
        break;
      case Button.RIGHT:
        success = this.processRightInput();
        break;
      default:
        break;
    }

    if (success) {
      this.getUi().playSelect();
    }

    return success;
  }

  private processUpInput(): boolean {
    const cols = this.currentCols();
    if (this.cursor - cols >= 0) {
      return this.setCursor(this.cursor - cols);
    }
    if (this.scrollCursor > 0) {
      return this.setScrollCursor(this.scrollCursor - 1);
    }
    // Already at the very top row - loop to the bottom.
    return this.wrapToEdge(false);
  }

  private processDownInput(): boolean {
    const cols = this.currentCols();
    const rows = this.currentRows();
    const itemOffset = this.scrollCursor * cols;
    if (this.cursor + cols < rows * cols && this.cursor + cols + itemOffset < this.currentTotal) {
      return this.setCursor(this.cursor + cols);
    }
    const maxScrollCursor = Math.max(0, Math.ceil(this.currentTotal / cols) - rows);
    if (this.scrollCursor < maxScrollCursor) {
      return this.setScrollCursor(this.scrollCursor + 1);
    }
    // Already at the very bottom row - loop to the top.
    return this.wrapToEdge(true);
  }

  /** Loops UP↔DOWN navigation across the top/bottom edge of the current grid, preserving column where possible. */
  private wrapToEdge(toTop: boolean): boolean {
    const cols = this.currentCols();
    const rows = this.currentRows();
    const col = this.cursor % cols;

    if (toTop) {
      this.setScrollCursor(0);
      return this.setCursor(Math.min(col, this.currentTotal - 1));
    }

    const totalRows = Math.max(1, Math.ceil(this.currentTotal / cols));
    const lastRow = totalRows - 1;
    const lastRowItemCount = this.currentTotal - lastRow * cols;
    const targetCol = Math.min(col, lastRowItemCount - 1);
    const newScrollCursor = Math.max(0, lastRow - (rows - 1));
    this.setScrollCursor(newScrollCursor);
    return this.setCursor((lastRow - newScrollCursor) * cols + targetCol);
  }

  private processLeftInput(): boolean {
    const cols = this.currentCols();
    const itemOffset = this.scrollCursor * cols;
    if (this.cursor % cols === 0) {
      return this.setCursor(Math.min(this.cursor + cols - 1, this.currentTotal - itemOffset - 1));
    }
    return this.setCursor(this.cursor - 1);
  }

  private processRightInput(): boolean {
    const cols = this.currentCols();
    const itemOffset = this.scrollCursor * cols;
    if ((this.cursor + 1) % cols === 0 || this.cursor + itemOffset === this.currentTotal - 1) {
      return this.setCursor(this.cursor - (this.cursor % cols));
    }
    return this.setCursor(this.cursor + 1);
  }

  // #endregion Input Processing

  override setCursor(cursor: number, levelChange?: boolean): boolean {
    const ret = super.setCursor(cursor);

    let update = ret;
    if (!this.cursorObj) {
      this.cursorObj = globalScene.add
        .nineslice(0, 0, "select_cursor_highlight", undefined, 16, 16, 1, 1, 1, 1)
        .setOrigin(0);
      this.iconsContainer.add(this.cursorObj);
      update = true;
    }

    this.cursorObj.setPositionRelative(this.icons[this.cursor], 0, 0);
    if (!update && !levelChange) {
      return ret;
    }

    this.updateDetailPanel();
    return ret;
  }

  setScrollCursor(scrollCursor: number): boolean {
    if (scrollCursor === this.scrollCursor) {
      return false;
    }

    this.scrollCursor = scrollCursor;
    this.scrollBar.setTotalRows(Math.ceil(this.currentTotal / this.currentCols()));
    this.scrollBar.setScrollCursor(this.scrollCursor);

    const cols = this.currentCols();
    const maxCursor = Math.min(this.cursor, this.currentTotal - this.scrollCursor * cols - 1);
    if (maxCursor !== this.cursor) {
      this.setCursor(Math.max(0, maxCursor));
    }

    if (this.level === Level.CATEGORY_MENU) {
      this.refreshTileIcons(this.categories);
    } else if (this.level === Level.SUBMENU) {
      this.refreshTileIcons(this.currentGroup?.subCategories ?? []);
    } else {
      this.refreshDrilldownIcons();
    }
    this.updateDetailPanel();
    return true;
  }

  override clear(): void {
    super.clear();
    this.level = Level.CATEGORY_MENU;
    this.currentGroup = null;
    this.currentLeaf = null;
    this.mainContainer.setVisible(false);
    this.eraseCursor();
  }

  private eraseCursor(): void {
    if (this.cursorObj) {
      this.cursorObj.destroy();
    }
    this.cursorObj = null;
  }
}

function pct(current: number, total: number): number {
  return total > 0 ? Math.round((current / total) * 1000) / 10 : 0;
}
