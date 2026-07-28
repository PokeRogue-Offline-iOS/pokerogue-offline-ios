#!/usr/bin/env node

/**
 * Removes Google Drive and Google OAuth functionality added by
 * app-settings-menu.js while retaining the Offline settings tab,
 * daily-seed tools, Clear All Data, and custom sandbox settings.
 */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Could not find ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
  console.log(`Written: ${filePath}`);
}

/*
 * Remove Google/Drive keys and rows from settings.ts.
 */

const settingsPath = path.join(
  "pokerogue-src",
  "src",
  "system",
  "settings",
  "settings.ts",
);

let settingsSource = readFile(settingsPath);

const driveSettingKeys = [
  "Offline_Google_Connect",
  "Offline_Backup_Save",
  "Offline_Restore_Backup",
  "Offline_Include_Current_Run",
  "Offline_Drive_Last_Played",
];

for (const key of driveSettingKeys) {
  const keyPattern = new RegExp(
    `\\n\\s*${key}:\\s*"[^"]+",`,
  );

  if (!keyPattern.test(settingsSource)) {
    fail(`Could not find SettingKeys.${key}`);
  }

  settingsSource = settingsSource.replace(keyPattern, "");
}

for (const key of driveSettingKeys) {
  const rowPattern = new RegExp(
    `\\n  \\{\\n    key: SettingKeys\\.${key},[\\s\\S]*?\\n  \\},(?=\\n  \\{)`,
  );

  if (!rowPattern.test(settingsSource)) {
    fail(`Could not find the settings row for ${key}`);
  }

  settingsSource = settingsSource.replace(rowPattern, "");
}

writeFile(settingsPath, settingsSource);

/*
 * Replace the Google-aware Offline UI handler with a local-only handler.
 */

const handlerPath = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "settings",
  "offline-settings-ui-handler.ts",
);

const handlerSource = `import { globalScene } from "#app/global-scene";
import { UiMode } from "#enums/ui-mode";
import type { Setting } from "#system/settings";
import { SettingKeys, SettingType } from "#system/settings";
import { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";

const DAILY_SEED_URL =
  "https://pokerogue-offline.github.io/pokerogue-offline/daily-seed.txt";

const DAILY_SEED_KEY = "daily_seed";
const DAILY_SEED_DATE_KEY = "daily_seed_date";
const DAILY_SEED_FETCHED_AT_KEY = "daily_seed_fetched_at";

export class OfflineSettingsUiHandler extends BaseSettingsUiHandler {
  private forceSeedInProgress = false;

  constructor(mode: UiMode | null = null) {
    super(SettingType.APP, mode);
    this.title = "Offline";
    this.localStorageKey = "settings";
  }

  private rowIndex(key: string): number {
    return this.settings.findIndex(setting => setting.key === key);
  }

  private setRowText(key: string, text: string): void {
    const index = this.rowIndex(key);

    if (index === -1) {
      return;
    }

    const label = this.optionValueLabels[index]?.[0];

    if (label) {
      label.setText(text);
    }
  }

  private static formatRelative(target: Date, now: Date): string {
    const differenceMs = target.getTime() - now.getTime();
    const past = differenceMs <= 0;

    const totalMinutesRaw = Math.floor(
      Math.abs(differenceMs) / 60000,
    );

    const totalMinutes =
      totalMinutesRaw - (totalMinutesRaw % 5);

    if (totalMinutes < 5) {
      return past ? "just now" : "in a moment";
    }

    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    let body: string;

    if (days > 0) {
      body = hours > 0
        ? \`\${days}d \${hours}h\`
        : \`\${days}d\`;
    } else if (hours > 0) {
      body = minutes > 0
        ? \`\${hours}h \${minutes}m\`
        : \`\${hours}h\`;
    } else {
      body = \`\${minutes}m\`;
    }

    return past ? \`\${body} ago\` : \`in \${body}\`;
  }

  private refreshDailySeedInfo(): void {
    const seed = localStorage.getItem(DAILY_SEED_KEY);
    const cachedDate = localStorage.getItem(
      DAILY_SEED_DATE_KEY,
    );

    const fetchedAtRaw = localStorage.getItem(
      DAILY_SEED_FETCHED_AT_KEY,
    );

    this.setRowText(
      SettingKeys.Offline_Daily_Seed_Value,
      seed ?? "None",
    );

    if (!seed || !cachedDate) {
      this.setRowText(
        SettingKeys.Offline_Daily_Seed_Fetched,
        "—",
      );

      this.setRowText(
        SettingKeys.Offline_Daily_Seed_Expires,
        "—",
      );

      return;
    }

    const now = new Date();
    const expiry = new Date(
      \`\${cachedDate}T00:00:00.000Z\`,
    );

    expiry.setUTCDate(expiry.getUTCDate() + 1);

    this.setRowText(
      SettingKeys.Offline_Daily_Seed_Expires,
      OfflineSettingsUiHandler.formatRelative(expiry, now),
    );

    const fetchedAtMs = fetchedAtRaw
      ? Number(fetchedAtRaw)
      : Number.NaN;

    this.setRowText(
      SettingKeys.Offline_Daily_Seed_Fetched,
      Number.isFinite(fetchedAtMs)
        ? OfflineSettingsUiHandler.formatRelative(
            new Date(fetchedAtMs),
            now,
          )
        : "unknown",
    );
  }

  public override show(args: any[]): boolean {
    const result = super.show(args);
    this.refreshDailySeedInfo();
    return result;
  }

  protected override activateSetting(
    setting: Setting,
  ): boolean {
    switch (setting.key) {
      case SettingKeys.Offline_Clear_Data:
        this.handleClearDataPress();
        return true;

      case SettingKeys.Offline_Force_Daily_Seed:
        this.handleForceDailySeedPress();
        return true;
    }

    return super.activateSetting(setting);
  }

  private handleClearDataPress(): void {
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
          3000,
        );
      },
    );
  }

  private handleForceDailySeedPress(): void {
    if (this.forceSeedInProgress) {
      return;
    }

    this.forceSeedInProgress = true;

    this.setRowText(
      SettingKeys.Offline_Force_Daily_Seed,
      "Updating…",
    );

    fetch(DAILY_SEED_URL)
      .then(response => {
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}\`);
        }

        return response.text();
      })
      .then(fetchedSeed => {
        const seed = fetchedSeed.trim();
        const todayUtc = new Date()
          .toISOString()
          .slice(0, 10);

        localStorage.setItem(
          DAILY_SEED_DATE_KEY,
          todayUtc,
        );

        localStorage.setItem(
          DAILY_SEED_KEY,
          seed,
        );

        localStorage.setItem(
          DAILY_SEED_FETCHED_AT_KEY,
          Date.now().toString(),
        );

        this.refreshDailySeedInfo();

        this.showText(
          "Daily seed updated.",
          0,
          () => this.showText("", 0),
          1500,
        );
      })
      .catch(error => {
        console.error(
          "Force daily seed fetch failed:",
          error,
        );

        this.showText(
          "Could not fetch daily seed.",
          0,
          () => this.showText("", 0),
          1500,
        );
      })
      .finally(() => {
        this.setRowText(
          SettingKeys.Offline_Force_Daily_Seed,
          "Update",
        );

        this.forceSeedInProgress = false;
        globalScene.ui.playSelect();
      });
  }
}
`;

writeFile(handlerPath, handlerSource);

/*
 * Remove the Google prewarm code from General settings.
 */

const generalSettingsPath = path.join(
  "pokerogue-src",
  "src",
  "ui",
  "settings",
  "settings-ui-handler.ts",
);

let generalSource = readFile(generalSettingsPath);

generalSource = generalSource.replace(
  '\nimport * as offlineBackup from "#system/offline/google-drive-backup";',
  "",
);

const prewarmMarker =
  "\n\n  // app-settings-menu: prewarm";

const prewarmStart = generalSource.indexOf(prewarmMarker);

if (prewarmStart !== -1) {
  const finalClassBrace = generalSource.lastIndexOf("\\n}");

  if (finalClassBrace === -1) {
    fail("Could not locate final class brace in settings-ui-handler.ts");
  }

  generalSource =
    generalSource.slice(0, prewarmStart) +
    generalSource.slice(finalClassBrace);
}

writeFile(generalSettingsPath, generalSource);

/*
 * Remove the generated Drive module.
 */

const driveModulePath = path.join(
  "pokerogue-src",
  "src",
  "system",
  "offline",
  "google-drive-backup.ts",
);

if (fs.existsSync(driveModulePath)) {
  fs.unlinkSync(driveModulePath);
  console.log(`Deleted: ${driveModulePath}`);
}

console.log("Google Drive and OAuth game code removed.");
