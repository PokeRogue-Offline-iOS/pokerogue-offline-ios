import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { DexAttr } from "#enums/dex-attr";
import { Passive as PassiveAttr } from "#enums/passive";
import { TextStyle } from "#enums/text-style";
import { TrainerType } from "#enums/trainer-type";
import type { UiMode } from "#enums/ui-mode";
import { getVariantIcon, getVariantTint } from "#sprites/variant";
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
 * Architecture deliberately mirrors `AchvsUiHandler` (header bar / icon
 * grid+scrollbar / single title bar / description panel) rather than the
 * old list-based v1 - two "levels" instead of Achv's two "pages":
 *
 *   Level 0 (category menu): one icon per tracked category. Hovering shows
 *   the category name in the title bar and its current/total detail in the
 *   description panel. ACTION drills into that category.
 *
 *   Level 1 (drilldown): a grid of the actual species (or a list of
 *   vouchers) for the selected category. Defaults to showing what you
 *   already HAVE. Button.STATS (bound to keyboard `C` / `Shift`) toggles to
 *   show what's MISSING instead. CANCEL returns to level 0.
 *
 * Category definitions (all derived from real, already-persisted save
 * fields - nothing new is stored by this screen):
 *   - Starters Unlocked -> starters where `caughtCount > 0`
 *   - Shiny Starters     -> starters where `caughtAttr & DexAttr.SHINY`
 *   - Species Fought     -> all species where `seenCount > 0` (this is what
 *                           the game internally calls "Encountered")
 *   - Species Seen       -> all species where `seenAttr !== 0n || caughtAttr !== 0n`
 *                           (approximates the real `isSeen()`, doesn't chase
 *                           the base-starter fallback for evolved/hatched-
 *                           without-encounter edge cases)
 *   - Species Caught     -> all species where `caughtCount > 0`
 *   - Gym Leader Vouchers -> the `vouchers` registry, filtered to keys whose
 *                           `TrainerType` falls in the Gym Leader band
 *                           (`BROCK`..`GRUSHA`, i.e. `>= 200 && < 300`).
 *                           NOTE: `vouchers` also contains Elite Four,
 *                           Champion, and Evil Team Leader entries - those
 *                           are deliberately excluded from this category.
 *   - Passives           -> starters where `passiveAttr & PassiveAttr.UNLOCKED`
 *
 * Forms, Ribbons, and the full Vouchers set from the old v1 are dropped
 * from this pass entirely, per explicit scope direction - not silently
 * carried over as dead code.
 *
 * Icon choices (pb / candy / shiny star / voucher frames) are all real,
 * already-used-elsewhere atlas keys, but exact visual balance (spacing,
 * scale) hasn't been eyeballed in an actual build yet - flagged, not
 * guessed at silently.
 */

type CategoryKind = "species" | "voucher";

interface CategoryDef {
  label: string;
  kind: CategoryKind;
  iconTexture: string;
  iconFrame: string | number;
  iconTint?: number;
  /** Species IDs or voucher keys the player already has. */
  haveIds: (number | string)[];
  /** Species IDs or voucher keys the player is missing. */
  missingIds: (number | string)[];
}

const LEVEL0_COLS = 4;
const LEVEL0_ROWS = 2;
const LEVEL1_COLS = 18;
const LEVEL1_ROWS = 4;
// Icon pool is sized for the larger of the two levels; level 0 just uses
// the first few slots and hides the rest.
const MAX_COLS = LEVEL1_COLS;
const MAX_ROWS = LEVEL1_ROWS;
const ICON_SPACING_X = 17;
const ICON_SPACING_Y = 19;

const Level = {
  CATEGORY_MENU: 0,
  DRILLDOWN: 1,
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

  private categories: CategoryDef[] = [];
  private currentTotal: number;

  private level: Level = Level.CATEGORY_MENU;
  private selectedCategoryIndex = 0;
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
    this.level = Level.CATEGORY_MENU;
    this.selectedCategoryIndex = 0;
    this.showingMissing = false;

    this.enterCategoryMenu();

    this.mainContainer.setVisible(true);
    this.getUi().moveTo(this.mainContainer, this.getUi().length - 1);
    this.getUi().hideTooltip();

    return true;
  }

  /** Pulls every category's have/missing lists straight from `globalScene.gameData`. See file-header doc for exact per-category definitions. */
  private computeCategories(): CategoryDef[] {
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
      (entry.caughtCount > 0 ? caughtHave : caughtMissing).push(id);
      (entry.seenCount > 0 ? foughtHave : foughtMissing).push(id);
      (entry.seenAttr !== 0n || entry.caughtAttr !== 0n ? seenHave : seenMissing).push(id);
    }

    const startersHave: number[] = [];
    const startersMissing: number[] = [];
    const shinyHave: number[] = [];
    const shinyMissing: number[] = [];
    const passiveHave: number[] = [];
    const passiveMissing: number[] = [];

    for (const id of starterIds) {
      const entry = dexData[id];
      (entry.caughtCount > 0 ? startersHave : startersMissing).push(id);
      (entry.caughtAttr & DexAttr.SHINY ? shinyHave : shinyMissing).push(id);

      const sd = gameData.starterData[id];
      const passiveUnlocked = !!sd && !!(sd.passiveAttr & PassiveAttr.UNLOCKED);
      (passiveUnlocked ? passiveHave : passiveMissing).push(id);
    }

    // Gym Leader Vouchers - filter the shared vouchers registry down to the
    // Gym Leader TrainerType band. `vouchers` also has Elite Four/Champion/
    // Evil Team Leader/CLASSIC_VICTORY entries - excluded here on purpose.
    const gymLeaderVoucherHave: string[] = [];
    const gymLeaderVoucherMissing: string[] = [];
    for (const key of Object.keys(vouchers)) {
      const trainerType = TrainerType[key as keyof typeof TrainerType];
      if (trainerType === undefined || trainerType < TrainerType.BROCK || trainerType >= TrainerType.LORELEI) {
        continue;
      }
      (Object.hasOwn(gameData.voucherUnlocks, key) ? gymLeaderVoucherHave : gymLeaderVoucherMissing).push(key);
    }

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
        iconTexture: "shiny_icons",
        iconFrame: getVariantIcon(2),
        iconTint: getVariantTint(2),
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
      {
        label: "Gym Leader Vouchers",
        kind: "voucher",
        iconTexture: "items",
        iconFrame: "coupon",
        haveIds: gymLeaderVoucherHave,
        missingIds: gymLeaderVoucherMissing,
      },
      {
        label: "Passives",
        kind: "species",
        iconTexture: "items",
        iconFrame: "candy",
        haveIds: passiveHave,
        missingIds: passiveMissing,
      },
    ];
  }

  private enterCategoryMenu(): void {
    this.level = Level.CATEGORY_MENU;
    this.layoutGrid(LEVEL0_COLS);
    this.currentTotal = this.categories.length;
    this.setScrollCursor(0);
    this.refreshCategoryMenuIcons();
    this.setCursor(0, true);
  }

  private enterDrilldown(categoryIndex: number): void {
    this.level = Level.DRILLDOWN;
    this.selectedCategoryIndex = categoryIndex;
    this.showingMissing = false;
    this.layoutGrid(LEVEL1_COLS);
    this.refreshDrilldownState();
  }

  private refreshDrilldownState(): void {
    const category = this.categories[this.selectedCategoryIndex];
    const list = this.showingMissing ? category.missingIds : category.haveIds;
    this.currentTotal = list.length;
    this.setScrollCursor(0);
    this.refreshDrilldownIcons();
    this.setCursor(0, true);
  }

  private toggleMissing(): void {
    this.showingMissing = !this.showingMissing;
    this.refreshDrilldownState();
  }

  /** Repositions the shared icon pool for the given column count and hides any slots beyond `rows * cols`. */
  private layoutGrid(cols: number): void {
    const rows = cols === LEVEL0_COLS ? LEVEL0_ROWS : LEVEL1_ROWS;
    for (let a = 0; a < this.icons.length; a++) {
      if (a >= rows * cols) {
        this.icons[a].setVisible(false);
        continue;
      }
      this.icons[a].setPosition((a % cols) * ICON_SPACING_X, Math.floor(a / cols) * ICON_SPACING_Y);
    }
  }

  private currentCols(): number {
    return this.level === Level.CATEGORY_MENU ? LEVEL0_COLS : LEVEL1_COLS;
  }

  private refreshCategoryMenuIcons(): void {
    this.categories.forEach((category, i) => {
      const icon = this.icons[i];
      icon.setTexture(category.iconTexture, category.iconFrame);
      icon.clearTint();
      if (category.iconTint !== undefined) {
        icon.setTint(category.iconTint);
      }
      icon.setVisible(true);
    });
    for (let i = this.categories.length; i < LEVEL0_ROWS * LEVEL0_COLS; i++) {
      this.icons[i].setVisible(false);
    }
  }

  private refreshDrilldownIcons(): void {
    const category = this.categories[this.selectedCategoryIndex];
    const list = this.showingMissing ? category.missingIds : category.haveIds;
    const itemOffset = this.scrollCursor * LEVEL1_COLS;
    const itemLimit = LEVEL1_ROWS * LEVEL1_COLS;
    const itemRange = list.slice(itemOffset, itemOffset + itemLimit);

    itemRange.forEach((item, i) => {
      const icon = this.icons[i];
      icon.clearTint();
      if (category.kind === "species") {
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
      const category = this.categories[this.cursor + this.scrollCursor * LEVEL0_COLS];
      if (!category) {
        return;
      }
      this.titleText.setText(category.label);
      const total = category.haveIds.length + category.missingIds.length;
      const percent = total > 0 ? Math.round((category.haveIds.length / total) * 1000) / 10 : 0;
      this.showText(`${category.haveIds.length}/${total} (${percent}%)`);
      return;
    }

    const category = this.categories[this.selectedCategoryIndex];
    const list = this.showingMissing ? category.missingIds : category.haveIds;
    const item = list[this.cursor + this.scrollCursor * LEVEL1_COLS];
    const modeLabel = this.showingMissing ? "Missing" : "Unlocked";

    if (item === undefined) {
      this.titleText.setText(`${category.label} - ${modeLabel}`);
      this.showText("");
      return;
    }

    if (category.kind === "species") {
      const name = speciesDataRegistry.getSpecies(item as number).getName();
      this.titleText.setText(`${name} - ${category.label} (${modeLabel})`);
      this.showText("");
    } else {
      const voucher = vouchers[item as string];
      this.titleText.setText(`${category.label} (${modeLabel})`);
      this.showText(voucher.description);
    }
  }

  // #region Input Processing

  processInput(button: Button): boolean {
    let success = false;

    switch (button) {
      case Button.ACTION:
        if (this.level === Level.CATEGORY_MENU) {
          const index = this.cursor + this.scrollCursor * LEVEL0_COLS;
          if (index < this.categories.length) {
            this.enterDrilldown(index);
            success = true;
          }
        }
        break;
      case Button.CANCEL:
        if (this.level === Level.DRILLDOWN) {
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
    if (this.cursor - cols < 0) {
      if (this.scrollCursor > 0) {
        return this.setScrollCursor(this.scrollCursor - 1);
      }
      return false;
    }
    return this.setCursor(this.cursor - cols);
  }

  private processDownInput(): boolean {
    const cols = this.currentCols();
    const rows = this.level === Level.CATEGORY_MENU ? LEVEL0_ROWS : LEVEL1_ROWS;
    const itemOffset = this.scrollCursor * cols;
    if (this.cursor + cols >= rows * cols || this.cursor + cols + itemOffset >= this.currentTotal) {
      const maxScrollCursor = Math.max(0, Math.ceil(this.currentTotal / cols) - rows);
      if (this.scrollCursor < maxScrollCursor) {
        return this.setScrollCursor(this.scrollCursor + 1);
      }
      return false;
    }
    return this.setCursor(this.cursor + cols);
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
      this.refreshCategoryMenuIcons();
    } else {
      this.refreshDrilldownIcons();
    }
    this.updateDetailPanel();
    return true;
  }

  override clear(): void {
    super.clear();
    this.level = Level.CATEGORY_MENU;
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
