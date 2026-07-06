import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import type { Setting } from "#system/settings";
import { SettingKeys, SettingType } from "#system/settings";
import { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";
import { getTextColor } from "#ui/text";
import * as offlineBackup from "#system/offline/google-drive-backup";

/**
 * Scooom's "Offline" tab in the real Settings screen — sits alongside
 * General/Display/Audio/Gamepad/Keyboard, added via NavigationManager's
 * documented extension point (append to `modes`/`labels`).
 *
 * Rows:
 *   - Connect Google Account (always interactive)
 *   - Backup Save
 *   - Restore Backup (confirm, then a second press to reload)
 *   - Clear All Data (confirm with a delay, then reload)
 *   - Debug: List AppData Files (opens DebugAppDataListUiHandler)
 *   - Last Played / Battles (read-only info, never locked)
 *
 * Every row except "Connect" and the two info rows is greyed out
 * (TextStyle.SETTINGS_LOCKED, same style already used elsewhere for
 * unavailable keybind rows) and inert while not signed in.
 *
 * NOTE: This has not been exercised in a live Phaser build yet. The
 * `optionValueLabels`/`settingLabels`/`activateSetting` visibility changes
 * this depends on (private → protected in base-settings-ui-handler.ts) are
 * pure visibility widenings with no other logic touched, but the actual
 * runtime behavior of reaching into those rows post-construction hasn't
 * been confirmed on a real device/build.
 */
export class OfflineSettingsUiHandler extends BaseSettingsUiHandler {
  /** Rows that get greyed out and made inert while signed out. */
  private static readonly LOCKABLE_KEYS = [
    SettingKeys.Offline_Backup_Save,
    SettingKeys.Offline_Restore_Backup,
    SettingKeys.Offline_Clear_Data,
    SettingKeys.Offline_Debug_List_Files,
  ];

  /**
   * True after a restore has completed this screen-open — a second press on
   * "Restore Backup" reloads instead of restoring again. Deliberately reset
   * every time the tab opens (see show()) rather than persisted, so
   * navigating away and back always starts from a clean, unambiguous state.
   */
  private restoreComplete = false;

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

  /** Greys out (or restores) both the label and value text for one row. */
  private setRowLocked(key: string, locked: boolean): void {
    const idx = this.rowIndex(key);
    if (idx === -1) {
      return;
    }
    const labelStyle = locked ? TextStyle.SETTINGS_LOCKED : TextStyle.SETTINGS_LABEL;
    // Our rows only ever have a single option, so it's always "selected" when unlocked.
    const valueStyle = locked ? TextStyle.SETTINGS_LOCKED : TextStyle.SETTINGS_SELECTED;

    const labelText = this.settingLabels[idx];
    if (labelText) {
      labelText.setColor(getTextColor(labelStyle)).setShadowColor(getTextColor(labelStyle, true));
    }
    const valueText = this.optionValueLabels[idx]?.[0];
    if (valueText) {
      valueText.setColor(getTextColor(valueStyle)).setShadowColor(getTextColor(valueStyle, true));
    }
  }

  private applyLockedStyling(): void {
    const locked = !offlineBackup.isSignedIn();
    for (const key of OfflineSettingsUiHandler.LOCKABLE_KEYS) {
      this.setRowLocked(key, locked);
    }
  }

  /** Guard for the top of every action handler except Connect itself. */
  private requireSignedIn(): boolean {
    if (offlineBackup.isSignedIn()) {
      return true;
    }
    this.showText("Connect your Google account first.", 0, () => this.showText("", 0), 1500);
    return false;
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
    this.setRowText(SettingKeys.Offline_Google_Connect, offlineBackup.isSignedIn() ? "Connected" : "Not Connected");
    this.applyLockedStyling();
  }

  public override show(args: any[]): boolean {
    const result = super.show(args);

    this.restoreComplete = false;
    this.setRowText(SettingKeys.Offline_Restore_Backup, "Restore");

    this.refreshDisplay();

    // Attempt a silent reconnect if we're not already signed in this
    // session. On Electron this is fast and popup-free when a stored
    // refresh token exists (see google-drive-backup.ts / main.cjs); it's a
    // no-op if there's nothing stored. Fire-and-forget — show() itself stays
    // synchronous, the rows just update once this resolves.
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
   * action rows, falling back to super for everything else (currently just
   * the touch-controls config row).
   */
  protected override activateSetting(setting: Setting): boolean {
    switch (setting.key) {
      case SettingKeys.Offline_Google_Connect:
        this.handleConnectPress();
        return true;
      case SettingKeys.Offline_Backup_Save:
        this.handleBackupPress();
        return true;
      case SettingKeys.Offline_Restore_Backup:
        this.handleRestorePress();
        return true;
      case SettingKeys.Offline_Clear_Data:
        this.handleClearDataPress();
        return true;
      case SettingKeys.Offline_Debug_List_Files:
        this.handleDebugListPress();
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
    if (!this.requireSignedIn()) {
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

  private handleRestorePress(): void {
    if (!this.requireSignedIn()) {
      return;
    }

    if (this.restoreComplete) {
      window.location.reload();
      return;
    }

    const ui = this.getUi();
    ui.showText(
      "This will overwrite your current save data with your Google Drive backup. Your active run is not affected. Continue?",
      null,
      () => {
        ui.setOverlayMode(
          UiMode.CONFIRM,
          () => {
            ui.revertMode();
            this.showText("", 0);
            this.performRestore();
          },
          () => {
            ui.revertMode();
            this.showText("", 0);
          },
          false,
          0,
        );
      },
    );
  }

  private performRestore(): void {
    this.setRowText(SettingKeys.Offline_Restore_Backup, "Restoring…");
    offlineBackup
      .restoreFromBackup()
      .then(() => {
        this.restoreComplete = true;
        this.setRowText(SettingKeys.Offline_Restore_Backup, "Press Confirm to reload");
      })
      .catch(err => {
        console.error("Restore failed:", err);
        this.setRowText(SettingKeys.Offline_Restore_Backup, "Restore");
        this.showText("Restore failed. Check the console for details.", 0, () => this.showText("", 0), 1500);
      });
  }

  private handleClearDataPress(): void {
    if (!this.requireSignedIn()) {
      return;
    }

    const ui = this.getUi();
    ui.showText(
      "This will ERASE ALL local data — save, settings, everything — and cannot be undone. Continue?",
      null,
      () => {
        ui.setOverlayMode(
          UiMode.CONFIRM,
          () => {
            ui.revertMode();
            this.showText("", 0);
            localStorage.clear();
            window.location.reload();
          },
          () => {
            ui.revertMode();
            this.showText("", 0);
          },
          false,
          0,
          0,
          3000, // 3-second delay before "Yes" responds to input, per the plan.
        );
      },
    );
  }

  private handleDebugListPress(): void {
    if (!this.requireSignedIn()) {
      return;
    }

    this.setRowText(SettingKeys.Offline_Debug_List_Files, "Loading…");
    offlineBackup
      .listAppDataFiles()
      .then(files => {
        this.setRowText(SettingKeys.Offline_Debug_List_Files, "View");
        this.getUi().setOverlayMode(UiMode.APP_DEBUG_FILE_LIST, files);
      })
      .catch(err => {
        console.error("Failed to list appDataFolder files:", err);
        this.setRowText(SettingKeys.Offline_Debug_List_Files, "View");
        this.showText("Failed to list files. Check the console for details.", 0, () => this.showText("", 0), 1500);
      });
  }
}
