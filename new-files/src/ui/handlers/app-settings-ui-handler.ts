import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import type { OptionSelectConfig } from "#ui/base-option-select-ui-handler";
import { BaseOptionSelectUiHandler } from "#ui/base-option-select-ui-handler";
import { addTextObject } from "#ui/text";
import * as offlineBackup from "#system/offline/google-drive-backup";

/**
 * Scooom's app-layer settings screen — reachable from the pause menu,
 * directly under "Game Settings". This is a standalone screen, NOT a tab
 * bolted into the upstream Settings tab system (General/Display/Audio),
 * added entirely by the offline app's `app-settings-menu` patch so it never
 * touches that subsystem.
 *
 * v1 scope: Google Drive backup only. No restore/import yet (deferred).
 *
 * NOTE: The busy/connected label refresh below calls `super.show()` again
 * from inside an option's handler to redraw in place. This has not been
 * exercised in a live Phaser build yet — if it misbehaves (duplicate
 * containers, cursor reset oddities), the simplest fallback is to close and
 * reopen the screen instead of refreshing in place.
 */
export class AppSettingsUiHandler extends BaseOptionSelectUiHandler {
  public static readonly windowWidth = 214;

  private infoText: Phaser.GameObjects.Text;
  private statusText: Phaser.GameObjects.Text;
  private tintBg: Phaser.GameObjects.Rectangle;

  private signedIn = false;
  private busy = false;

  constructor() {
    super(UiMode.APP_SETTINGS);
  }

  getWindowWidth(): number {
    return AppSettingsUiHandler.windowWidth;
  }

  setup(): void {
    super.setup();

    // Maroon section-tint behind the info rows — signals "this is Scooom's
    // app layer", not an upstream PokeRogue screen. (A Scooom icon badge was
    // planned alongside this, but is deferred until the game's actual
    // asset-loading/loader-scene pattern for dynamically-added textures has
    // been confirmed — didn't want to guess at that blind.)
    this.tintBg = globalScene.add.rectangle(0, 0, AppSettingsUiHandler.windowWidth, 26, 0x4a1518, 0.55);
    this.tintBg.setOrigin(0, 0);
    this.optionSelectContainer.addAt(this.tintBg, 0);

    this.infoText = addTextObject(8, 4, "", TextStyle.WINDOW);
    this.optionSelectContainer.add(this.infoText);

    this.statusText = addTextObject(8, 16, "", TextStyle.WINDOW);
    this.optionSelectContainer.add(this.statusText);
  }

  /**
   * Reads last-played time + total battles directly from the persisted
   * saveData blob in localStorage (`data_Guest` under bypassLogin), rather
   * than through any in-memory game object — consistent with how the backup
   * itself reads raw localStorage rather than live game state.
   */
  private readSaveSummary(): { lastPlayed: string; battles: number } {
    try {
      const raw = localStorage.getItem("data_Guest");
      if (!raw) {
        return { lastPlayed: "—", battles: 0 };
      }
      const json = decodeURIComponent(atob(raw));
      const parsed = JSON.parse(json);
      const lastPlayed = parsed?.timestamp ? new Date(parsed.timestamp).toLocaleString() : "—";
      const battles = parsed?.gameStats?.battles ?? 0;
      return { lastPlayed, battles };
    } catch (err) {
      console.error("AppSettingsUiHandler: failed to read save summary", err);
      return { lastPlayed: "—", battles: 0 };
    }
  }

  private refreshOptions(): void {
    const { lastPlayed, battles } = this.readSaveSummary();
    this.infoText.setText(`Last played: ${lastPlayed}`);
    this.statusText.setText(`Battles: ${battles}`);

    const config: OptionSelectConfig = {
      yOffset: 30,
      options: [
        {
          label: this.busy ? "Connecting…" : this.signedIn ? "Google Account: Connected" : "Connect Google Account",
          handler: () => {
            if (this.signedIn || this.busy) {
              return true;
            }
            this.busy = true;
            this.refreshOptions();
            offlineBackup
              .signIn()
              .then(() => {
                this.signedIn = true;
              })
              .catch(err => {
                console.error("Google sign-in failed:", err);
              })
              .finally(() => {
                this.busy = false;
                this.refreshOptions();
              });
            return true;
          },
          keepOpen: true,
        },
        {
          label: this.busy ? "Backing up…" : "Backup Save",
          handler: () => {
            if (!this.signedIn || this.busy) {
              return true;
            }
            this.busy = true;
            this.refreshOptions();
            offlineBackup
              .backupSave()
              .then(madeAt => {
                console.log(`Backup complete: ${madeAt}`);
              })
              .catch(err => {
                console.error("Backup failed:", err);
              })
              .finally(() => {
                this.busy = false;
                this.refreshOptions();
              });
            return true;
          },
          keepOpen: true,
        },
      ],
    };

    super.show([config]);
  }

  show(_args: any[]): boolean {
    this.signedIn = offlineBackup.isSignedIn();
    this.refreshOptions();
    return true;
  }
}
