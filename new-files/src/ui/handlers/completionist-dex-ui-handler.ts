import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { DexAttr } from "#enums/dex-attr";
import { Passive as PassiveAttr } from "#enums/passive";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { vouchers } from "#system/voucher";
import { UiHandler } from "#ui/ui-handler";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";
import { getRibbonKey, orderedRibbons } from "#utils/ribbon-utils";
import i18next from "i18next";

/**
 * Offline-only "Completionist Dex" screen.
 *
 * Purely informational, read-only against `globalScene.gameData` - never
 * mutates save data. Recomputed fresh every time the screen is opened, same
 * as the real Pokedex/Stats screens.
 *
 * Every category is derived from real, already-persisted save fields - no
 * new save data is introduced by this screen:
 *   - Caught / Fought / Seen  -> `dexData[id].caughtCount` / `.seenCount` /
 *     `.seenAttr`|`.caughtAttr`. "Fought" is what the base game internally
 *     calls "Encountered" (`seenCount > 0`).
 *   - Forms                   -> `dexData[id].caughtAttr` bits 7..7+n,
 *     matching `GameData.getFormAttr()`'s own encoding, checked against
 *     `species.forms.length` for every species with more than one form.
 *   - Shiny                   -> `caughtAttr & DexAttr.SHINY`, scoped to
 *     starters only (matches the base game's own "Shiny Starters" stat).
 *     Variant (VARIANT_2/VARIANT_3) tracking is NOT included in v1 - which
 *     variants are obtainable varies per species/sprite and isn't reliably
 *     derivable without a per-species obtainable-variant table. Flagged as
 *     a possible v2 addition, not silently guessed at here.
 *   - Vouchers                -> `gameData.voucherUnlocks` vs the real
 *     `vouchers` registry from `#system/voucher`.
 *   - Candy                   -> starters only, "maxed" = passive unlocked
 *     (`starterData[id].passiveAttr & PassiveAttr.UNLOCKED`) AND value
 *     reduction fully upgraded (`starterData[id].valueReduction >= 2`).
 *     Deliberately NOT `candyCount >= MAX_STARTER_CANDY_COUNT` - that
 *     constant is just an overflow ceiling on the banked-candy counter
 *     (see `GameData.addStarterCandy`), not a "fully upgraded" signal;
 *     candy is spent (decremented) on each upgrade purchase.
 *   - Ribbons                 -> v1 scope is a GLOBAL tally: for each flag
 *     in the real `orderedRibbons` list, "owned" means ANY species in the
 *     save has that ribbon. This is not a full species x ribbon matrix -
 *     ribbons are earned per-species via specific challenge-run
 *     conditions, and a full matrix is a meaningfully bigger UI. Flagged
 *     explicitly, not deferred silently.
 *   - Pokemon Defeated         -> `gameData.gameStats.pokemonDefeated`, a
 *     single lifetime counter with no per-species breakdown. Shown as a
 *     stat line only, not a completion %, and not pooled into the blend.
 *
 * Blended % pools item counts across every category below marked
 * `countsTowardBlend: true` (total-completed / total-possible, summed
 * across categories) rather than averaging six-ish percentages, so bulk
 * categories aren't diluted by small ones like Vouchers.
 */

interface CategoryRow {
  label: string;
  current: number;
  total: number;
  countsTowardBlend: boolean;
  missing: string[];
}

const HEADER_H = 22;
const ROW_H = 16;
const ROWS_Y = HEADER_H + 3;
const ROW_COUNT = 8;
const FOOTER_Y = ROWS_Y + ROW_COUNT * ROW_H + 2;
const FOOTER_H = 14;

const DRILLDOWN_HEADER_H = 22;
const DRILLDOWN_LINE_H = 14;
const DRILLDOWN_LINES_Y = DRILLDOWN_HEADER_H + 3;
const DRILLDOWN_VISIBLE_LINES = 10;

function pct(current: number, total: number): number {
  return total > 0 ? Math.round((current / total) * 1000) / 10 : 0;
}

export class CompletionistDexUiHandler extends UiHandler {
  // ── Summary view ──────────────────────────────────────────────────────
  private summaryContainer: Phaser.GameObjects.Container;
  private titleText: Phaser.GameObjects.Text;
  private rowLabelTexts: Phaser.GameObjects.Text[] = [];
  private rowStatTexts: Phaser.GameObjects.Text[] = [];
  private footerText: Phaser.GameObjects.Text;
  private cursorObj: Phaser.GameObjects.Image;

  // ── Drilldown view ───────────────────────────────────────────────────
  private drilldownContainer: Phaser.GameObjects.Container;
  private drilldownTitleText: Phaser.GameObjects.Text;
  private drilldownLineTexts: Phaser.GameObjects.Text[] = [];
  private drilldownScrollHint: Phaser.GameObjects.Text;

  private rows: CategoryRow[] = [];
  private rowCursor = 0;

  private viewingDrilldown = false;
  private drilldownScroll = 0;

  constructor() {
    super(UiMode.COMPLETIONIST_DEX);
  }

  setup(): void {
    const ui = this.getUi();
    const width = globalScene.scaledCanvas.width;
    const height = globalScene.scaledCanvas.height;

    // ── Summary container ──────────────────────────────────────────────
    this.summaryContainer = globalScene.add.container(0, -height).setVisible(false);
    ui.add(this.summaryContainer);

    const bg = globalScene.add.rectangle(0, 0, width, height, 0x006860).setOrigin(0);
    this.summaryContainer.add(bg);

    const headerWindow = addWindow(0, 0, width, HEADER_H).setOrigin(0);
    this.summaryContainer.add(headerWindow);

    this.titleText = addTextObject(2, 3, "", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(0);
    this.summaryContainer.add(this.titleText);

    for (let i = 0; i < ROW_COUNT; i++) {
      const y = ROWS_Y + i * ROW_H;

      const rowBg = addWindow(2, y, width - 4, ROW_H - 2).setOrigin(0);
      this.summaryContainer.add(rowBg);

      const labelText = addTextObject(6, y + 1, "", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(0);
      this.summaryContainer.add(labelText);
      this.rowLabelTexts.push(labelText);

      const statText = addTextObject(width - 6, y + 1, "", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(1, 0);
      this.summaryContainer.add(statText);
      this.rowStatTexts.push(statText);
    }

    this.cursorObj = globalScene.add.image(0, 0, "select_cursor").setOrigin(0);
    this.summaryContainer.add(this.cursorObj);

    const footerWindow = addWindow(0, FOOTER_Y, width, FOOTER_H).setOrigin(0);
    this.summaryContainer.add(footerWindow);

    this.footerText = addTextObject(4, FOOTER_Y + 2, "", TextStyle.WINDOW_ALT, { maxLines: 1 }).setOrigin(0);
    this.summaryContainer.add(this.footerText);

    // ── Drilldown container ────────────────────────────────────────────
    this.drilldownContainer = globalScene.add.container(0, -height).setVisible(false);
    ui.add(this.drilldownContainer);

    const drilldownBg = globalScene.add.rectangle(0, 0, width, height, 0x006860).setOrigin(0);
    this.drilldownContainer.add(drilldownBg);

    const drilldownHeaderWindow = addWindow(0, 0, width, DRILLDOWN_HEADER_H).setOrigin(0);
    this.drilldownContainer.add(drilldownHeaderWindow);

    this.drilldownTitleText = addTextObject(2, 3, "", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(0);
    this.drilldownContainer.add(this.drilldownTitleText);

    for (let i = 0; i < DRILLDOWN_VISIBLE_LINES; i++) {
      const y = DRILLDOWN_LINES_Y + i * DRILLDOWN_LINE_H;
      const lineText = addTextObject(4, y, "", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(0);
      this.drilldownContainer.add(lineText);
      this.drilldownLineTexts.push(lineText);
    }

    this.drilldownScrollHint = addTextObject(4, height - 12, "", TextStyle.WINDOW_ALT, { maxLines: 1 }).setOrigin(0);
    this.drilldownContainer.add(this.drilldownScrollHint);
  }

  override show(args: any[]): boolean {
    super.show(args);

    this.rows = this.computeRows();
    this.viewingDrilldown = false;
    this.rowCursor = 0;
    this.drilldownScroll = 0;

    this.renderSummary();

    this.summaryContainer.setVisible(true);
    this.drilldownContainer.setVisible(false);
    this.getUi().bringToTop(this.summaryContainer);
    this.setCursor(0);

    return true;
  }

  /** Pulls every category's current/total straight from `globalScene.gameData`. See file-header doc for exact definitions. */
  private computeRows(): CategoryRow[] {
    const gameData = globalScene.gameData;
    const dexData = gameData.dexData;
    const speciesIds = Object.keys(dexData).map(Number);

    let caughtCurrent = 0;
    const caughtMissing: string[] = [];
    let foughtCurrent = 0;
    const foughtMissing: string[] = [];
    let seenCurrent = 0;
    let formsCurrent = 0;
    let formsTotal = 0;
    const formsMissing: string[] = [];

    for (const id of speciesIds) {
      const entry = dexData[id];
      const species = speciesDataRegistry.getSpecies(id);
      const name = species.getName();

      if (entry.caughtCount > 0) {
        caughtCurrent++;
      } else {
        caughtMissing.push(name);
      }

      if (entry.seenCount > 0) {
        foughtCurrent++;
      } else {
        foughtMissing.push(name);
      }

      // Approximates the base game's `isSeen()`: caught or directly
      // encountered. Does not chase the base-starter caughtAttr fallback
      // isSeen() uses for evolved/hatched-without-encounter edge cases -
      // informational row only, not pooled into the blended %.
      if (entry.seenAttr !== 0n || entry.caughtAttr !== 0n) {
        seenCurrent++;
      }

      const forms = species.forms ?? [];
      if (forms.length > 1) {
        for (let f = 0; f < forms.length; f++) {
          formsTotal++;
          const bit = 1n << BigInt(7 + f);
          if (entry.caughtAttr & bit) {
            formsCurrent++;
          } else {
            formsMissing.push(`${name} (${forms[f].formKey || `form ${f}`})`);
          }
        }
      }
    }

    // Shiny - starters only, matches the base game's own "Shiny Starters" stat.
    const starterIds = speciesDataRegistry.getAllStarters();
    let shinyCurrent = 0;
    const shinyMissing: string[] = [];
    for (const id of starterIds) {
      const entry = dexData[id];
      const name = speciesDataRegistry.getSpecies(id).getName();
      if (entry.caughtAttr & DexAttr.SHINY) {
        shinyCurrent++;
      } else {
        shinyMissing.push(name);
      }
    }

    // Vouchers
    const voucherIds = Object.keys(vouchers);
    let voucherCurrent = 0;
    const voucherMissing: string[] = [];
    for (const vid of voucherIds) {
      if (Object.hasOwn(gameData.voucherUnlocks, vid)) {
        voucherCurrent++;
      } else {
        voucherMissing.push(vouchers[vid].description);
      }
    }

    // Candy - starters only, "maxed" = passive unlocked + value reduction maxed.
    const VALUE_REDUCTION_MAX = 2;
    let candyCurrent = 0;
    const candyMissing: string[] = [];
    for (const id of starterIds) {
      const sd = gameData.starterData[id];
      if (!sd) {
        continue;
      }
      const name = speciesDataRegistry.getSpecies(id).getName();
      const passiveDone = !!(sd.passiveAttr & PassiveAttr.UNLOCKED);
      const reductionDone = sd.valueReduction >= VALUE_REDUCTION_MAX;
      if (passiveDone && reductionDone) {
        candyCurrent++;
      } else {
        candyMissing.push(name);
      }
    }

    // Ribbons - global tally: owned by ANY species in the save, not a per-species matrix.
    let ribbonCurrent = 0;
    const ribbonMissing: string[] = [];
    for (const flag of orderedRibbons) {
      const owned = speciesIds.some(id => dexData[id].ribbons.has(flag));
      if (owned) {
        ribbonCurrent++;
      } else {
        ribbonMissing.push(i18next.t(`ribbons:${getRibbonKey(flag)}`));
      }
    }

    return [
      {
        label: "Caught",
        current: caughtCurrent,
        total: speciesIds.length,
        countsTowardBlend: true,
        missing: caughtMissing,
      },
      {
        label: "Fought",
        current: foughtCurrent,
        total: speciesIds.length,
        countsTowardBlend: true,
        missing: foughtMissing,
      },
      { label: "Seen", current: seenCurrent, total: speciesIds.length, countsTowardBlend: false, missing: [] },
      { label: "Forms", current: formsCurrent, total: formsTotal, countsTowardBlend: true, missing: formsMissing },
      {
        label: "Shiny Starters",
        current: shinyCurrent,
        total: starterIds.length,
        countsTowardBlend: true,
        missing: shinyMissing,
      },
      {
        label: "Vouchers",
        current: voucherCurrent,
        total: voucherIds.length,
        countsTowardBlend: true,
        missing: voucherMissing,
      },
      {
        label: "Candy Maxed",
        current: candyCurrent,
        total: starterIds.length,
        countsTowardBlend: true,
        missing: candyMissing,
      },
      {
        label: "Ribbons",
        current: ribbonCurrent,
        total: orderedRibbons.length,
        countsTowardBlend: true,
        missing: ribbonMissing,
      },
    ];
  }

  private computeBlendedPercent(): number {
    let curSum = 0;
    let totSum = 0;
    for (const row of this.rows) {
      if (row.countsTowardBlend) {
        curSum += row.current;
        totSum += row.total;
      }
    }
    return pct(curSum, totSum);
  }

  private renderSummary(): void {
    this.titleText.setText(`Completionist Dex - ${this.computeBlendedPercent()}%`);

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      this.rowLabelTexts[i].setText(row.label);
      this.rowStatTexts[i].setText(`${row.current}/${row.total} (${pct(row.current, row.total)}%)`);
    }

    const defeated = globalScene.gameData.gameStats.pokemonDefeated;
    this.footerText.setText(`Pokemon Defeated: ${defeated}`);
  }

  private openDrilldown(row: CategoryRow): void {
    this.viewingDrilldown = true;
    this.drilldownScroll = 0;

    this.drilldownTitleText.setText(row.label);
    this.renderDrilldownPage(row);

    this.summaryContainer.setVisible(false);
    this.drilldownContainer.setVisible(true);
    this.getUi().bringToTop(this.drilldownContainer);
  }

  private renderDrilldownPage(row: CategoryRow): void {
    if (row.missing.length === 0) {
      this.drilldownLineTexts[0].setText("Nothing missing - fully complete!");
      for (let i = 1; i < this.drilldownLineTexts.length; i++) {
        this.drilldownLineTexts[i].setText("");
      }
      this.drilldownScrollHint.setText("");
      return;
    }

    for (let i = 0; i < DRILLDOWN_VISIBLE_LINES; i++) {
      const item = row.missing[this.drilldownScroll + i];
      this.drilldownLineTexts[i].setText(item ?? "");
    }

    const shownEnd = Math.min(this.drilldownScroll + DRILLDOWN_VISIBLE_LINES, row.missing.length);
    this.drilldownScrollHint.setText(`${this.drilldownScroll + 1}-${shownEnd} of ${row.missing.length} missing`);
  }

  processInput(button: Button): boolean {
    const ui = this.getUi();
    let success = false;

    if (this.viewingDrilldown) {
      const row = this.rows[this.rowCursor];
      switch (button) {
        case Button.CANCEL:
          this.viewingDrilldown = false;
          this.drilldownContainer.setVisible(false);
          this.summaryContainer.setVisible(true);
          this.getUi().bringToTop(this.summaryContainer);
          success = true;
          break;
        case Button.UP:
          if (this.drilldownScroll > 0) {
            this.drilldownScroll--;
            this.renderDrilldownPage(row);
            success = true;
          }
          break;
        case Button.DOWN:
          if (this.drilldownScroll + DRILLDOWN_VISIBLE_LINES < row.missing.length) {
            this.drilldownScroll++;
            this.renderDrilldownPage(row);
            success = true;
          }
          break;
        default:
          break;
      }
    } else {
      switch (button) {
        case Button.CANCEL:
          ui.revertMode();
          success = true;
          break;
        case Button.UP:
          success = this.moveCursor(-1);
          break;
        case Button.DOWN:
          success = this.moveCursor(1);
          break;
        case Button.ACTION:
          this.openDrilldown(this.rows[this.rowCursor]);
          success = true;
          break;
        default:
          break;
      }
    }

    if (success) {
      ui.playSelect();
    }

    return success;
  }

  private moveCursor(delta: number): boolean {
    const next = (this.rowCursor + delta + this.rows.length) % this.rows.length;
    this.rowCursor = next;
    this.setCursor(this.rowCursor);
    return true;
  }

  override setCursor(cursor: number): boolean {
    const changed = super.setCursor(cursor);
    this.cursorObj.setPosition(1, ROWS_Y + cursor * ROW_H - 1);
    return changed;
  }

  override clear(): void {
    super.clear();
    this.summaryContainer.setVisible(false);
    this.drilldownContainer.setVisible(false);
  }
}
