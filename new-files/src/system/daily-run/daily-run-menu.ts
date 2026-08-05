import { globalScene } from "#app/global-scene";
import { parseDailySeed } from "#data/daily-seed/daily-seed-utils";
import { UiMode } from "#enums/ui-mode";
import type { OptionSelectItem } from "#types/ui-types";
import i18next from "i18next";
import {
  loadOfficialDailyArchive,
  serializeSpecialDailyEntry,
  type DailyArchiveEntry,
  type LoadedDailyArchive,
} from "./daily-run-archive";
import {
  createCustomTextSeed,
  createOfflineDailySeed,
  createRandomDailySeed,
  CUSTOM_TEXT_ALGORITHM_VERSION,
  getUtcDateKey,
  isInvisibleControlCharacter,
  normalizeAndValidateExactSeed,
  OFFLINE_DAILY_ALGORITHM_VERSION,
  RANDOM_DAILY_ALGORITHM_VERSION,
} from "./daily-run-seed-utils";
import type { DailyRunLaunchRequest } from "./daily-run-types";

export interface DailyRunMenuContext {
  launch: (request: DailyRunLaunchRequest) => void;
  cancel: () => void;
}

type KeyboardPage = "lowercase" | "uppercase" | "numbers" | "symbols";

const MAX_VISIBLE_DATES = 8;
const MAX_CUSTOM_TEXT_CHARACTERS = 128;
const keyboardPages: Record<KeyboardPage, string[]> = {
  lowercase: Array.from("abcdefghijklmnopqrstuvwxyz"),
  uppercase: Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  numbers: Array.from("0123456789"),
  symbols: ["+", "/", "=", "-", "_", ".", "'", " ", "!", "?", ":", "@", "#", "&", "(", ")"],
};
const keyboardPageOrder = Object.keys(keyboardPages) as KeyboardPage[];

function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(`menu:${key}`, options);
}

function showOptions(options: OptionSelectItem[], initialCursor = 0, maxOptions?: number): void {
  globalScene.ui.refreshOverlayMode(UiMode.OPTION_SELECT, {
    options,
    initialCursor,
    maxOptions,
    measureVisibleOptionsOnly: maxOptions != null && options.length > maxOptions,
    supportHover: true,
    wrapNavigation: false,
  });
}

function showError(message: string, callback: () => void): void {
  console.warn("Daily Run menu error:", message);
  globalScene.ui.showText(`${t("shadowDailyError")}\n${message}`, null, callback, null, true);
}

function confirm(message: string, yes: () => void, no: () => void): void {
  globalScene.ui.showText(message, null, () => {
    globalScene.ui.setOverlayMode(UiMode.CONFIRM, yes, no);
  });
}

function archiveEntryHelp(entry: DailyArchiveEntry, loaded: LoadedDailyArchive): string {
  return [
    t("shadowDailySelectedDate", { date: entry.date }),
    entry.format === "daily-config" ? t("shadowDailySpecialType") : t("shadowDailyStandardType"),
    t("shadowDailySeedValue", { seed: entry.seed }),
    t("shadowDailyArchiveSource", { source: t(`shadowDailySource${loaded.source}`) }),
  ].join("\n");
}

function requestForArchiveEntry(entry: DailyArchiveEntry, loaded: LoadedDailyArchive): DailyRunLaunchRequest {
  if (entry.format === "seed") {
    return {
      seedOrConfig: entry.seed,
      metadata: {
        mode: "official",
        canonicalSeed: entry.seed,
        selectedDate: entry.date,
        archiveSource: loaded.source,
        archiveDownloadedAt: loaded.downloadedAt,
        specialDailyConfig: false,
      },
    };
  }
  const serializedDailyConfig = serializeSpecialDailyEntry(entry);
  if (!parseDailySeed(serializedDailyConfig)) {
    throw new Error(t("shadowDailyInvalidSpecialConfig", { date: entry.date }));
  }
  return {
    seedOrConfig: serializedDailyConfig,
    metadata: {
      mode: "official",
      canonicalSeed: entry.seed,
      selectedDate: entry.date,
      archiveSource: loaded.source,
      archiveDownloadedAt: loaded.downloadedAt,
      specialDailyConfig: true,
      serializedDailyConfig,
    },
  };
}

function showOfficialDateList(context: DailyRunMenuContext, loaded: LoadedDailyArchive, cursor = 0): void {
  const options: OptionSelectItem[] = loaded.archive.entries.map((entry, index) => ({
    label: `${entry.date}${entry.format === "daily-config" ? `  ${t("shadowDailySpecialIndicator")}` : ""}`,
    handler: () => {
      try {
        context.launch(requestForArchiveEntry(entry, loaded));
      } catch (error) {
        showError(error instanceof Error ? error.message : t("shadowDailyUnknownError"), () =>
          showOfficialDateList(context, loaded, index),
        );
      }
      return true;
    },
    onHover: () => globalScene.ui.showText(archiveEntryHelp(entry, loaded), 0),
  }));
  options.push({
    label: t("cancel"),
    handler: () => {
      showDailyRunTypeMenu(context);
      return true;
    },
    onHover: () => globalScene.ui.showText(t("shadowDailyCancelDateHelp"), 0),
  });
  globalScene.ui.showText(archiveEntryHelp(loaded.archive.entries[cursor], loaded), 0);
  globalScene.ui.refreshOverlayMode(UiMode.OPTION_SELECT, {
    options,
    initialCursor: cursor,
    maxOptions: MAX_VISIBLE_DATES,
    measureVisibleOptionsOnly: true,
    pageStep: 1,
    pageStepVisibleOptions: true,
    supportHover: true,
    wrapNavigation: false,
  });
}

function openOfficialArchive(context: DailyRunMenuContext): void {
  globalScene.ui.showText(t("shadowDailyLoadingArchive"), 0);
  void loadOfficialDailyArchive()
    .then(loaded => {
      globalScene.ui.showText(loaded.notice, null, () => showOfficialDateList(context, loaded), null, true);
    })
    .catch(error => {
      showError(error instanceof Error ? error.message : t("shadowDailyUnknownError"), () =>
        showDailyRunTypeMenu(context),
      );
    });
}

function openOfflineRun(context: DailyRunMenuContext): void {
  // Capture one instant so a confirmation spanning UTC midnight cannot label
  // one date while launching the seed for another.
  const selectedInstant = new Date();
  const date = getUtcDateKey(selectedInstant);
  confirm(
    t("shadowDailyOfflineConfirm", { date }),
    () => {
      const canonicalSeed = createOfflineDailySeed(selectedInstant);
      context.launch({
        seedOrConfig: canonicalSeed,
        metadata: {
          mode: "offline",
          canonicalSeed,
          selectedDate: date,
          algorithmVersion: OFFLINE_DAILY_ALGORITHM_VERSION,
          specialDailyConfig: false,
        },
      });
    },
    () => showDailyRunTypeMenu(context),
  );
}

function openRandomRun(context: DailyRunMenuContext): void {
  confirm(
    t("shadowDailyRandomConfirm"),
    () => {
      const canonicalSeed = createRandomDailySeed();
      globalScene.ui.showText(
        t("shadowDailyGeneratedSeed", { seed: canonicalSeed }),
        null,
        () =>
          context.launch({
            seedOrConfig: canonicalSeed,
            metadata: {
              mode: "random",
              canonicalSeed,
              algorithmVersion: RANDOM_DAILY_ALGORITHM_VERSION,
              specialDailyConfig: false,
            },
          }),
        null,
        true,
      );
    },
    () => showDailyRunTypeMenu(context),
  );
}

function keyboardStatus(mode: "exact" | "text", value: string, page: KeyboardPage, error?: string): string {
  const displayValue = value || t("shadowDailyKeyboardEmpty");
  return [
    t(mode === "exact" ? "shadowDailyExactSeed" : "shadowDailyTextSeed"),
    t("shadowDailyKeyboardValue", { value: displayValue }),
    t("shadowDailyKeyboardCount", { count: Array.from(value).length }),
    t("shadowDailyKeyboardPage", { page: t(`shadowDailyKeyboardPage${page}`) }),
    error ? t("shadowDailyKeyboardError", { error }) : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function showSeedKeyboard(
  mode: "exact" | "text",
  context: DailyRunMenuContext,
  back: () => void,
  value = "",
  page: KeyboardPage = "lowercase",
  error?: string,
): void {
  const maxCharacters = mode === "text" ? MAX_CUSTOM_TEXT_CHARACTERS : 256;
  const rerender = (nextValue = value, nextPage = page, nextError?: string) =>
    showSeedKeyboard(mode, context, back, nextValue, nextPage, nextError);
  const options: OptionSelectItem[] = keyboardPages[page].map(character => ({
    label: character === " " ? t("shadowDailyKeyboardSpace") : character,
    handler: () => {
      if (Array.from(value).length >= maxCharacters) {
        rerender(value, page, t("shadowDailyKeyboardTooLong", { max: maxCharacters }));
      } else {
        rerender(value + character, page);
      }
      return true;
    },
  }));
  options.push(
    {
      label: t("shadowDailyKeyboardChangePage"),
      handler: () => {
        const nextPage = keyboardPageOrder[(keyboardPageOrder.indexOf(page) + 1) % keyboardPageOrder.length];
        rerender(value, nextPage);
        return true;
      },
    },
    {
      label: t("shadowDailyKeyboardBackspace"),
      handler: () => {
        const characters = Array.from(value);
        characters.pop();
        rerender(characters.join(""));
        return true;
      },
    },
    { label: t("shadowDailyKeyboardClear"), handler: () => (rerender(""), true) },
  );
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    options.push({
      label: t("shadowDailyKeyboardPaste"),
      handler: () => {
        void navigator.clipboard
          .readText()
          .then(pasted => {
            if (isInvisibleControlCharacter(pasted)) {
              rerender(value, page, t("shadowDailyKeyboardControlCharacters"));
              return;
            }
            rerender(Array.from(pasted).slice(0, maxCharacters).join(""));
          })
          .catch(() => rerender(value, page, t("shadowDailyKeyboardPasteFailed")));
        return true;
      },
    });
  }
  options.push(
    {
      label: t("shadowDailyKeyboardConfirm"),
      handler: () => {
        if (isInvisibleControlCharacter(value)) {
          rerender(value, page, t("shadowDailyKeyboardControlCharacters"));
          return true;
        }
        if (mode === "exact") {
          try {
            const canonicalSeed = normalizeAndValidateExactSeed(value);
            context.launch({
              seedOrConfig: canonicalSeed,
              metadata: { mode: "custom-exact", canonicalSeed, specialDailyConfig: false },
            });
          } catch (validationError) {
            rerender(
              value,
              page,
              validationError instanceof Error ? validationError.message : t("shadowDailyInvalidExactSeed"),
            );
          }
          return true;
        }
        try {
          const result = createCustomTextSeed(value);
          globalScene.ui.showText(
            t("shadowDailyGeneratedSeed", { seed: result.canonicalSeed }),
            null,
            () =>
              context.launch({
                seedOrConfig: result.canonicalSeed,
                metadata: {
                  mode: "custom-text",
                  canonicalSeed: result.canonicalSeed,
                  friendlyTextSeed: result.friendlyText,
                  algorithmVersion: CUSTOM_TEXT_ALGORITHM_VERSION,
                  specialDailyConfig: false,
                },
              }),
            null,
            true,
          );
        } catch (validationError) {
          rerender(
            value,
            page,
            validationError instanceof Error ? validationError.message : t("shadowDailyEmptyTextSeed"),
          );
        }
        return true;
      },
    },
    { label: t("cancel"), handler: () => (back(), true) },
  );
  globalScene.ui.showText(keyboardStatus(mode, value, page, error), 0);
  showOptions(options, 0, 10);
}

function showCustomRunMenu(context: DailyRunMenuContext): void {
  const options: OptionSelectItem[] = [
    {
      label: t("shadowDailyExactSeed"),
      handler: () => (showSeedKeyboard("exact", context, () => showCustomRunMenu(context)), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyExactDescription"), 0),
    },
    {
      label: t("shadowDailyTextSeed"),
      handler: () => (showSeedKeyboard("text", context, () => showCustomRunMenu(context)), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyTextDescription"), 0),
    },
    { label: t("cancel"), handler: () => (showDailyRunTypeMenu(context), true) },
  ];
  globalScene.ui.showText(t("shadowDailyExactDescription"), 0);
  showOptions(options);
}

export function showDailyRunTypeMenu(context: DailyRunMenuContext): void {
  const options: OptionSelectItem[] = [
    {
      label: t("shadowDailyOfficial"),
      handler: () => (openOfficialArchive(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyOfficialDescription"), 0),
    },
    {
      label: t("shadowDailyOffline"),
      handler: () => (openOfflineRun(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyOfflineDescription"), 0),
    },
    {
      label: t("shadowDailyRandom"),
      handler: () => (openRandomRun(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyRandomDescription"), 0),
    },
    {
      label: t("shadowDailyCustom"),
      handler: () => (showCustomRunMenu(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyCustomDescription"), 0),
    },
    { label: t("cancel"), handler: () => (context.cancel(), true) },
  ];
  globalScene.ui.showText(t("shadowDailyOfficialDescription"), 0);
  showOptions(options);
}
