const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/menu-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Remove "Change Password" from Manage Data ─────────────────────────────
// It's part of a manageDataOptions.push( exportData, changePassword ) call.
// We keep exportData and drop changePassword entirely.

const CHANGE_PASSWORD_ORIGINAL = `    manageDataOptions.push(
      {
        label: i18next.t("menuUiHandler:exportData"),
        handler: () => {
          globalScene.gameData.tryExportData(GameDataType.SYSTEM);
          return true;
        },
        keepOpen: true,
      },
      {
        // Note: i18n key is under \`menu\`, not \`menuUiHandler\` to avoid duplication
        label: i18next.t("menu:changePassword"),
        handler: () => {
          ui.setOverlayMode(UiMode.CHANGE_PASSWORD_FORM, {
            buttonActions: [() => ui.revertMode(), () => ui.revertMode()],
          });
          return true;
        },
        keepOpen: true,
      },
    );`;

const CHANGE_PASSWORD_REPLACEMENT = `    manageDataOptions.push(
      {
        label: i18next.t("menuUiHandler:exportData"),
        handler: () => {
          globalScene.gameData.tryExportData(GameDataType.SYSTEM);
          return true;
        },
        keepOpen: true,
      },
    );`;

if (!content.includes(CHANGE_PASSWORD_ORIGINAL)) {
  console.error('Anchor for Change Password removal not found — skipping that removal');
} else {
  content = content.replace(CHANGE_PASSWORD_ORIGINAL, CHANGE_PASSWORD_REPLACEMENT);
  console.log('Removed Change Password menu item');
}

// ── 2. Remove "Admin" from Community ─────────────────────────────────────────

const ADMIN_ORIGINAL = `    if (bypassLogin || loggedInUser?.hasAdminRole) {
      communityOptions.push({
        label: "Admin",
        handler: () => {
          const skippedAdminModes: AdminMode[] = [AdminMode.ADMIN]; // this is here so that we can skip the menu populating enums that aren't meant for the menu, such as the AdminMode.ADMIN
          const options: OptionSelectItem[] = [];
          Object.values(AdminMode)
            .filter(v => !Number.isNaN(Number(v)) && !skippedAdminModes.includes(v as AdminMode))
            .forEach(mode => {
              // this gets all the enums in a way we can use
              options.push({
                label: getAdminModeName(mode as AdminMode),
                handler: () => {
                  ui.playSelect();
                  ui.setOverlayMode(
                    UiMode.ADMIN,
                    {
                      buttonActions: [
                        // we double revert here and below to go back 2 layers of menus
                        () => {
                          ui.revertMode();
                          ui.revertMode();
                        },
                        () => {
                          ui.revertMode();
                          ui.revertMode();
                        },
                      ],
                    },
                    mode,
                  ); // mode is our AdminMode enum
                  return true;
                },
              });
            });
          options.push({
            label: "Cancel",
            handler: () => {
              ui.revertMode();
              return true;
            },
          });
          globalScene.ui.setOverlayMode(UiMode.OPTION_SELECT, {
            options,
            delay: 0,
          });
          return true;
        },
        keepOpen: true,
      });
    }`;

if (!content.includes(ADMIN_ORIGINAL)) {
  console.error('Anchor for Admin removal not found — skipping that removal');
} else {
  content = content.replace(ADMIN_ORIGINAL, '');
  console.log('Removed Admin community menu item');
}

// ── 3. Inject app-only options before the cancel button ───────────────────────
// Adds: Unlock Everything (with confirm), Add Egg Vouchers (with confirm),
// and FULL RESET (with confirm).

const CONFIRM_TEXT = `This is an unofficial feature for convenience only. It is not part of normal play and may reduce your enjoyment of the game. Are you sure?`;

const injection = `    if (isApp) {
      manageDataOptions.push({
        label: "Unlock Everything",
        handler: () => {
          ui.showText("${CONFIRM_TEXT}", null, () => {
            ui.setOverlayMode(
              UiMode.CONFIRM,
              () => {
                globalScene.gameData.importDataFromUrl("/full_unlocks.prsv");
                ui.revertMode();
                ui.showText("", 0);
              },
              () => {
                ui.revertMode();
                ui.showText("", 0);
              },
              false,
              -98,
            );
          });
          return true;
        },
        keepOpen: true,
      });
      manageDataOptions.push({
        label: "Add Egg Vouchers",
        handler: () => {
          ui.showText("${CONFIRM_TEXT}", null, () => {
            ui.setOverlayMode(
              UiMode.CONFIRM,
              () => {
                globalScene.gameData.voucherCounts[0] = (globalScene.gameData.voucherCounts[0] ?? 0) + 99;
                globalScene.gameData.voucherCounts[1] = (globalScene.gameData.voucherCounts[1] ?? 0) + 99;
                globalScene.gameData.voucherCounts[2] = (globalScene.gameData.voucherCounts[2] ?? 0) + 99;
                globalScene.gameData.voucherCounts[3] = (globalScene.gameData.voucherCounts[3] ?? 0) + 99;
                globalScene.gameData.saveSystem().then(() => {
                  ui.revertMode();
                  ui.showText("Added 99 of each egg voucher.", null, () => ui.showText("", 0), fixedInt(2000));
                });
              },
              () => {
                ui.revertMode();
                ui.showText("", 0);
              },
              false,
              -98,
            );
          });
          return true;
        },
        keepOpen: true,
      });
      manageDataOptions.push({
        label: "FULL RESET",
        handler: () => {
          ui.showText("Are you sure you want to delete ALL data? This cannot be undone.", null, () => {
            ui.setOverlayMode(
              UiMode.CONFIRM,
              () => {
                globalScene.gameData.deleteData();
                ui.revertMode();
                ui.showText("", 0);
              },
              () => {
                ui.revertMode();
                ui.showText("", 0);
              },
              false,
              -98,
            );
          });
          return true;
        },
        keepOpen: true,
      });
    }
`;

const anchor = `    manageDataOptions.push({
      label: i18next.t("menuUiHandler:cancel"),`;

if (!content.includes(anchor)) {
  console.error('Anchor for app option injection not found in menu-ui-handler.ts');
  process.exit(1);
}

content = content.replace(anchor, injection + anchor);
console.log('Injected app-only menu options');

fs.writeFileSync(filePath, content);
console.log('inject-unlock-all: all changes applied successfully');
