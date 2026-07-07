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
 * Rows, in display order (locked ones grouped together):
 *   - Connect Google Account (always interactive)
 *   - Backup Save                    \
 *   - Restore Backup                  } locked until connected
 *   - Include Current Run (Off/On)   /
 *   - Drive Last Played (read-only, populates once connected — not
 *     itself "locked", just shows a placeholder until there's something
 *     to show)
 *   - Clear All Data (always interactive — wiping local data has nothing
 *     to do with being connected)
 *
 * "Include Current Run" is a genuine two-option Setting (not activatable),
 * so its Left/Right cycling and persistence are entirely free — the base
 * class's existing generic mechanism handles it with zero code from us,
 * same as every other real setting in the game. It governs whether
 * backupSave() includes sessionData keys; restoreFromBackup() doesn't need
 * to know about the toggle at all, since it just writes back whatever a
 * given backup actually contains.
 *
 * NOTE: This has not been exercised in a live Phaser build yet. The
 * `settingLabels`/`optionValueLabels`/`optionCursors`/`activateSetting`
 * visibility changes this depends on (private → protected in
 * base-settings-ui-handler.ts) are pure visibility widenings with no other
 * logic touched, but the actual runtime behavior of reaching into those
 * rows post-construction hasn't been confirmed on a real device/build.
 */
export class OfflineSettingsUiHandler extends BaseSettingsUiHandler {
  /** Rows that get greyed out and made inert while signed out. */
  private static readonly LOCKABLE_KEYS = [
    SettingKeys.Offline_Backup_Save,
    SettingKeys.Offline_Restore_Backup,
    SettingKeys.Offline_Include_Current_Run,
  ];

  /**
   * True after a restore has completed this screen-open — a second press on
   * "Restore Backup" reloads instead of restoring again. Deliberately reset
   * every time the tab opens (see show()) rather than persisted, so
   * navigating away and back always starts from a clean, unambiguous state.
   */
  private restoreComplete = false;

  /**
   * True while a Connect press is in flight (or within the 1s post-settle
   * debounce window below) — prevents a double-tap from firing a second
   * SocialLogin.login() call and spawning a second native account-chooser
   * on top of the first.
   */
  private connectInProgress = false;

  constructor(mode: UiMode | null = null) {
    super(SettingType.APP, mode);
    this.title = "Offline";
    this.localStorageKey = "settings";
  }

  private rowIndex(key: string): number {
    return this.settings.findIndex(s => s.key === key);
  }

  /** Directly overwrites a single-option row's displayed value text. */
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

  /**
   * Greys out (or restores) a row's label and every one of its value
   * options. Handles both our single-option action rows and genuine
   * multi-option rows (currently just "Include Current Run") — when
   * unlocking a multi-option row, the previously-selected option correctly
   * goes back to SETTINGS_SELECTED rather than every option looking the
   * same.
   */
  private setRowLocked(key: string, locked: boolean): void {
    const idx = this.rowIndex(key);
    if (idx === -1) {
      return;
    }

    const labelStyle = locked ? TextStyle.SETTINGS_LOCKED : TextStyle.SETTINGS_LABEL;
    const labelText = this.settingLabels[idx];
    if (labelText) {
      labelText.setColor(getTextColor(labelStyle)).setShadowColor(getTextColor(labelStyle, true));
    }

    const values = this.optionValueLabels[idx] ?? [];
    const selectedCursor = this.optionCursors[idx];
    values.forEach((valueText, optionIdx) => {
      const valueStyle = locked
        ? TextStyle.SETTINGS_LOCKED
        : optionIdx === selectedCursor
          ? TextStyle.SETTINGS_SELECTED
          : TextStyle.SETTINGS_VALUE;
      valueText.setColor(getTextColor(valueStyle)).setShadowColor(getTextColor(valueStyle, true));
    });
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

  private refreshDisplay(): void {
    this.setRowText(SettingKeys.Offline_Google_Connect, offlineBackup.isSignedIn() ? "Connected" : "Not Connected");
    this.applyLockedStyling();
  }

  /** Fetches and displays the Drive backup's embedded save time — only meaningful once connected. */
  private refreshDriveLastPlayed(): void {
    if (!offlineBackup.isSignedIn()) {
      this.setRowText(SettingKeys.Offline_Drive_Last_Played, "—");
      return;
    }
    this.setRowText(SettingKeys.Offline_Drive_Last_Played, "Checking…");
    offlineBackup
      .getRemoteLastPlayed()
      .then(lastPlayed => {
        this.setRowText(SettingKeys.Offline_Drive_Last_Played, lastPlayed ?? "No backup found");
      })
      .catch(err => {
        console.error("Failed to fetch Drive last-played time:", err);
        this.setRowText(SettingKeys.Offline_Drive_Last_Played, "—");
      });
  }

  public override show(args: any[]): boolean {
    const result = super.show(args);

    this.restoreComplete = false;
    this.setRowText(SettingKeys.Offline_Restore_Backup, "Restore");

    this.refreshDisplay();
    this.refreshDriveLastPlayed();

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
          this.refreshDriveLastPlayed();
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
   * the touch-controls config row). Note "Include Current Run" is NOT
   * handled here — it's a normal cycling Setting, not activatable, so it
   * never reaches this method at all.
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
    }
    return super.activateSetting(setting);
  }

  private handleConnectPress(): void {
    if (offlineBackup.isSignedIn() || this.connectInProgress) {
      return;
    }
    this.connectInProgress = true;
    // Enforce a hard minimum lock on top of connectInProgress, so a fast
    // rejection can't be immediately re-tapped into spawning a second
    // account-chooser before the UI's had a chance to settle.
    const unlockAt = Date.now() + 1000;
    this.setRowText(SettingKeys.Offline_Google_Connect, "Connecting…");
    offlineBackup
      .signIn()
      .then(() => {
        this.refreshDisplay();
        this.refreshDriveLastPlayed();
      })
      .catch(err => {
        console.error("Google sign-in failed:", err);
        this.showText("Google sign-in failed. Check the console for details.", 0, () => this.showText("", 0), 1500);
        this.refreshDisplay();
      })
      .finally(() => {
        const remaining = unlockAt - Date.now();
        if (remaining > 0) {
          setTimeout(() => {
            this.connectInProgress = false;
          }, remaining);
        } else {
          this.connectInProgress = false;
        }
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
        this.refreshDriveLastPlayed();
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
      "This will overwrite your current save data with your Google Drive backup. Continue?",
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
    // Deliberately NOT gated behind requireSignedIn() — wiping local data has
    // nothing to do with being connected to Google.
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
}
