import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import type { ReleaseInfo } from "#system/offline/update-check-api";
import { ScrollBar } from "#ui/containers/scroll-bar";
import { addBBCodeTextObject, addTextObject } from "#ui/text";
import { UiHandler } from "#ui/ui-handler";
import { addWindow } from "#ui/ui-theme";
import { markdownToBBCode } from "#ui/utils/markdown-to-bbcode";
import type BBCodeText from "phaser3-rex-plugins/plugins/gameobjects/tagtext/bbcodetext/BBCodeText";

/**
 * Offline-only "Update Available" screen. Opened once per launch (from
 * title-ui-handler.ts's update checker) when one or more app versions newer
 * than the one currently installed exist. Left/Right page through each
 * missing version in ascending order; Up/Down scroll that version's
 * changelog text, with auto-scroll that stops the moment either is pressed
 * and resumes (from the top) on the next page change.
 */

// wordWrap/mask geometry use "true" font pixels, unaffected by the text
// object's own render scale - see the identical GLOBAL_SCALE convention in
// move-info-overlay.ts / pokedex-info-overlay.ts.
const GLOBAL_SCALE = 6;

const HEADER_H = 20;
const VERSION_H = 13;
const FOOTER_H = 20;
const BODY_Y = HEADER_H + VERSION_H;
const BODY_H = 180 - BODY_Y - FOOTER_H;
const FOOTER_Y = BODY_Y + BODY_H;

const BODY_X = 4;
const SCROLLBAR_W = 4;
const SCROLLBAR_X = 320 - SCROLLBAR_W - 2;
const BODY_WIDTH_PX = SCROLLBAR_X - BODY_X - 4;

const SCROLL_STEP_PX = 16;
const AUTO_SCROLL_TICK_MS = 50;
const AUTO_SCROLL_PX_PER_TICK = 0.5;

export class UpdateAvailableUiHandler extends UiHandler {
  private container: Phaser.GameObjects.Container;
  private titleText: Phaser.GameObjects.Text;
  private pagerText: Phaser.GameObjects.Text;
  private versionText: Phaser.GameObjects.Text;
  private footerText: Phaser.GameObjects.Text;
  private bodyText: BBCodeText;
  private scrollBar: ScrollBar;

  private releases: ReleaseInfo[] = [];
  private pageIndex = 0;

  private scrollY = 0;
  private autoScrollEnabled = true;
  private contentHeight = 0;

  private autoScrollTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(UiMode.UPDATE_AVAILABLE);
  }

  setup(): void {
    const ui = this.getUi();

    // Ui itself is positioned at (0, scaledCanvas.height) (see Ui's constructor), so any
    // container added directly via ui.add(...) must start at -scaledCanvas.height to land
    // back at world (0,0) - confirmed against AchvsUiHandler, a real shipped screen that's
    // also in noTransitionModes, which uses the exact same offset for the same reason.
    this.container = globalScene.add.container(0, -globalScene.scaledCanvas.height).setVisible(false);
    ui.add(this.container);

    const bg = globalScene.add
      .rectangle(0, 0, globalScene.scaledCanvas.width, globalScene.scaledCanvas.height, 0x006860)
      .setOrigin(0);
    this.container.add(bg);

    const headerWindow = addWindow(0, 0, globalScene.scaledCanvas.width, HEADER_H).setOrigin(0);
    this.container.add(headerWindow);

    this.titleText = addTextObject(4, 3, "Update Available", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(0);
    this.container.add(this.titleText);

    this.pagerText = addTextObject(globalScene.scaledCanvas.width - 4, 3, "", TextStyle.WINDOW, {
      maxLines: 1,
    }).setOrigin(1, 0);
    this.container.add(this.pagerText);

    this.versionText = addTextObject(4, HEADER_H + 2, "", TextStyle.WINDOW_ALT, { maxLines: 1 }).setOrigin(0);
    this.container.add(this.versionText);

    this.bodyText = addBBCodeTextObject(BODY_X, BODY_Y, "", TextStyle.WINDOW, {
      wordWrap: { width: BODY_WIDTH_PX * GLOBAL_SCALE },
    }).setOrigin(0);
    this.container.add(this.bodyText);

    // Clip the changelog text to the body band - geometry masks are drawn in
    // true pixels, then scaled up to match how the rest of this text-rendering
    // pipeline supersamples fonts (see GLOBAL_SCALE above).
    const bodyMaskRect = globalScene.make.graphics();
    bodyMaskRect.fillStyle(0xff0000);
    bodyMaskRect.fillRect(BODY_X, BODY_Y, BODY_WIDTH_PX, BODY_H);
    bodyMaskRect.setScale(GLOBAL_SCALE);
    this.bodyText.setMask(this.container.createGeometryMask(bodyMaskRect));

    this.scrollBar = new ScrollBar(SCROLLBAR_X, BODY_Y, SCROLLBAR_W, BODY_H, BODY_H);
    this.container.add(this.scrollBar);

    const footerWindow = addWindow(0, FOOTER_Y, globalScene.scaledCanvas.width, FOOTER_H).setOrigin(0);
    this.container.add(footerWindow);

    this.footerText = addTextObject(4, FOOTER_Y + 3, "", TextStyle.WINDOW, { maxLines: 1 }).setOrigin(0);
    this.container.add(this.footerText);
  }

  override show(args: any[]): boolean {
    super.show(args);

    this.releases = (args[0] as ReleaseInfo[]) ?? [];
    if (this.releases.length === 0) {
      return false;
    }

    this.pageIndex = 0;
    this.getUi().bringToTop(this.container);
    this.container.setVisible(true);
    this.renderPage();

    return true;
  }

  /** Renders the current page's version/changelog and resets scroll + auto-scroll, per spec. */
  private renderPage(): void {
    const release = this.releases[this.pageIndex];

    this.pagerText.setText(this.releases.length > 1 ? `${this.pageIndex + 1} / ${this.releases.length}` : "");
    this.versionText.setText(`v${release.version}  (build ${release.buildNumber})`);
    this.bodyText.setText(markdownToBBCode(release.changelog));

    const hints: string[] = ["↑↓ Scroll"];
    if (this.releases.length > 1) {
      hints.push("◀▶ Version");
    }
    hints.push("Cancel: Close");
    this.footerText.setText(hints.join("   "));

    this.scrollY = 0;
    this.autoScrollEnabled = true;
    this.contentHeight = this.bodyText.displayHeight;
    this.applyScrollY();

    this.scrollBar.setTotalRows(Math.max(this.contentHeight, BODY_H));
    this.scrollBar.setScrollCursor(0);

    this.resetAutoScrollTimer();
  }

  processInput(button: Button): boolean {
    const ui = this.getUi();
    let success = false;

    switch (button) {
      case Button.CANCEL:
        this.destroyAutoScrollTimer();
        ui.revertMode();
        success = true;
        break;
      case Button.LEFT:
        if (this.pageIndex > 0) {
          this.pageIndex--;
          this.renderPage();
          success = true;
        }
        break;
      case Button.RIGHT:
        if (this.pageIndex < this.releases.length - 1) {
          this.pageIndex++;
          this.renderPage();
          success = true;
        }
        break;
      case Button.UP:
        success = this.manualScroll(-SCROLL_STEP_PX);
        break;
      case Button.DOWN:
        success = this.manualScroll(SCROLL_STEP_PX);
        break;
      default:
        break;
    }

    if (success) {
      ui.playSelect();
    }

    return success;
  }

  /** Manual scroll - disables auto-scroll for the remainder of this page, per spec. */
  private manualScroll(delta: number): boolean {
    const maxScroll = Math.max(0, this.contentHeight - BODY_H);
    if (maxScroll === 0) {
      return false;
    }

    this.autoScrollEnabled = false;
    this.destroyAutoScrollTimer();

    const newScrollY = Phaser.Math.Clamp(this.scrollY + delta, 0, maxScroll);
    if (newScrollY === this.scrollY) {
      return false;
    }
    this.scrollY = newScrollY;
    this.applyScrollY();
    return true;
  }

  private applyScrollY(): void {
    this.bodyText.y = BODY_Y - this.scrollY;
    this.scrollBar.setScrollCursor(this.scrollY);
  }

  /** UiHandler has no per-frame update() hook, so auto-scroll drives itself off a Scene timer. */
  private resetAutoScrollTimer(): void {
    this.destroyAutoScrollTimer();
    if (!this.autoScrollEnabled) {
      return;
    }

    this.autoScrollTimer = globalScene.time.addEvent({
      delay: AUTO_SCROLL_TICK_MS,
      loop: true,
      callback: () => {
        const maxScroll = Math.max(0, this.contentHeight - BODY_H);
        if (maxScroll === 0 || this.scrollY >= maxScroll) {
          return;
        }
        this.scrollY = Math.min(this.scrollY + AUTO_SCROLL_PX_PER_TICK, maxScroll);
        this.applyScrollY();
      },
    });
  }

  private destroyAutoScrollTimer(): void {
    if (this.autoScrollTimer) {
      this.autoScrollTimer.destroy();
      this.autoScrollTimer = null;
    }
  }

  override clear(): void {
    super.clear();
    this.container.setVisible(false);
    this.destroyAutoScrollTimer();
  }
}
