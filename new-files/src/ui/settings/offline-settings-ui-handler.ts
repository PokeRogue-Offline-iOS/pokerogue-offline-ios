import { globalScene } from "#app/global-scene";
import { UiMode } from "#enums/ui-mode";
import type { Setting } from "#system/settings";
import { SettingKeys, SettingType } from "#system/settings";
import { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";
import * as offlineBackup from "#system/offline/google-drive-backup";

/**
 * Scooom's "Offline" tab in the real Settings screen — sits alongside
 * General/Display/Audio/Gamepad/Keyboard, added via NavigationManager's
 * documented extension point (append to `modes`/`labels`).
 *
 * Two genuinely interactive rows ("Connect Google Account", "Backup Save"),
 * modeled as `activatable` Setting entries (same mechanism the base class
 * already uses for the touch-controls config row) rather than persisted
 * value-cyclers. Two read-only rows ("Last Played", "Battles") reuse the
 * same single-option-row trick purely for display.
 *
 * v1 scope: Google Drive backup only. No restore/import yet (deferred).
 *
 * NOTE: This has not been exercised in a live Phaser build yet. The
 * `optionValueLabels`/`activateSetting` visibility change this depends on
 * (private → protected in base-settings-ui-handler.ts) is a pure visibility
 * widening with no other logic touched, but the actual runtime behavior of
 * reaching into those rows post-construction hasn't been confirmed on a
 * real device/build.
 */
export class OfflineSettingsUiHandler extends BaseSettingsUiHandler {
  constructor(mode: UiMode | null = null) {
    super(SettingType.APP, mode);
    this.title = "Offline";
    this.localStorageKey = "settings";
  }

  private rowIndex(key: string): number {
    return this.settings.findIndex(s => s.key === key);
  }

  /** Directly overwrites a row's displayed (single-option) value text. */
  private setRowText(key: string, text: string): void {
    const idx = this.rowIndex(key);
    if (idx === -1) {
      return;
    }
    const label = this.optionValueLabels[idx]?.[0];
    if (label) {
      label.setText(text);
    }
  }

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
      console.error("OfflineSettingsUiHandler: failed to read save summary", err);
      return { lastPlayed: "—", battles: 0 };
    }
  }

  private refreshDisplay(): void {
    const { lastPlayed, battles } = this.readSaveSummary();
    this.setRowText(SettingKeys.Offline_Last_Played, lastPlayed);
    this.setRowText(SettingKeys.Offline_Battles, `${battles}`);
    this.setRowText(
      SettingKeys.Offline_Google_Connect,
      offlineBackup.isSignedIn() ? "Connected" : "Not Connected",
    );
  }

  public override show(args: any[]): boolean {
    const result = super.show(args);
    this.refreshDisplay();

    // Attempt a silent reconnect if we're not already signed in this
    // session. On Electron this is fast and popup-free when a stored
    // refresh token exists (see google-drive-backup.ts / main.cjs); it's a
    // no-op if there's nothing stored. Fire-and-forget — show() itself stays
    // synchronous, the row just updates once this resolves.
    if (!offlineBackup.isSignedIn()) {
      this.setRowText(SettingKeys.Offline_Google_Connect, "Checking connection…");
      offlineBackup
        .tryRestoreSession()
        .then(() => {
          this.refreshDisplay();
        })
        .catch(err => {
          console.warn("Silent session restore failed:", err);
          this.refreshDisplay();
        });
    }

    return result;
  }

  /**
   * Overrides the base class's (now-protected) activateSetting to add our
   * two action rows, falling back to super for everything else (currently
   * just the touch-controls config row).
   */
  protected override activateSetting(setting: Setting): boolean {
    switch (setting.key) {
      case SettingKeys.Offline_Google_Connect:
        this.handleConnectPress();
        return true;
      case SettingKeys.Offline_Backup_Save:
        this.handleBackupPress();
        return true;
    }
    return super.activateSetting(setting);
  }

  private handleConnectPress(): void {
    if (offlineBackup.isSignedIn()) {
      return;
    }
    this.setRowText(SettingKeys.Offline_Google_Connect, "Connecting…");
    offlineBackup
      .signIn()
      .then(() => {
        this.refreshDisplay();
      })
      .catch(err => {
        console.error("Google sign-in failed:", err);
        this.showText("Google sign-in failed. Check the console for details.", 0, () => this.showText("", 0), 1500);
        this.refreshDisplay();
      });
  }

  private handleBackupPress(): void {
    if (!offlineBackup.isSignedIn()) {
      this.showText("Connect your Google account first.", 0, () => this.showText("", 0), 1500);
      return;
    }
    this.setRowText(SettingKeys.Offline_Backup_Save, "Backing up…");
    offlineBackup
      .backupSave()
      .then(() => {
        this.setRowText(SettingKeys.Offline_Backup_Save, "Google Drive");
        this.showText("Backup complete.", 0, () => this.showText("", 0), 1500);
      })
      .catch(err => {
        console.error("Backup failed:", err);
        this.setRowText(SettingKeys.Offline_Backup_Save, "Google Drive");
        this.showText("Backup failed. Check the console for details.", 0, () => this.showText("", 0), 1500);
      })
      .finally(() => {
        globalScene.ui.playSelect();
      });
  }
}
