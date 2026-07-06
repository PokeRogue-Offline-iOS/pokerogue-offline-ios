import { UiMode } from "#enums/ui-mode";
import type { OptionSelectConfig } from "#ui/base-option-select-ui-handler";
import { BaseOptionSelectUiHandler } from "#ui/base-option-select-ui-handler";
import type { AppDataFileInfo } from "#system/offline/google-drive-backup";

/**
 * Debug screen listing every file currently in the app's Drive appDataFolder
 * — reachable from the "Offline" settings tab's "Debug: List AppData Files"
 * row. Every entry's handler (and Cancel, which the base class maps to
 * whatever option is last in the list) just closes the screen; this is
 * purely informational, nothing is selectable in a meaningful sense.
 *
 * Modeled directly on ConfirmUiHandler's shape (same base class, same
 * "dynamic OptionSelectConfig passed through show()" pattern).
 */
export class DebugAppDataListUiHandler extends BaseOptionSelectUiHandler {
  public static readonly windowWidth = 240;

  constructor() {
    super(UiMode.APP_DEBUG_FILE_LIST);
  }

  getWindowWidth(): number {
    return DebugAppDataListUiHandler.windowWidth;
  }

  /** Expects args[0] to be an AppDataFileInfo[] (see google-drive-backup.ts). */
  show(args: any[]): boolean {
    const files: AppDataFileInfo[] = Array.isArray(args[0]) ? args[0] : [];

    const options =
      files.length > 0
        ? files.map(file => ({
            label: `${file.name}  (${formatSize(file.size)}, ${formatDate(file.modifiedTime)})`,
            handler: () => true,
          }))
        : [
            {
              label: "No files found in appDataFolder.",
              handler: () => true,
            },
          ];

    const config: OptionSelectConfig = { options };
    return super.show([config]);
  }
}

function formatSize(sizeBytes: string): string {
  const bytes = Number(sizeBytes);
  if (!Number.isFinite(bytes)) {
    return "? B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "?" : date.toLocaleString();
}
