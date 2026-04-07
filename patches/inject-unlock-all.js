const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/menu-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const injection = `
  if (isApp) {
    manageDataOptions.push({
      label: "Unlock Everything",
      handler: () => {
        globalScene.gameData.importDataFromUrl("/full_unlocks.prsv");
        ui.revertMode();
        return true;
      },
      keepOpen: false,
    });
  }
`;

const anchor = `    manageDataOptions.push({
      label: i18next.t("menuUiHandler:cancel"),`;

if (!content.includes(anchor)) {
  console.error('Anchor not found in menu-ui-handler.ts — skipping injection');
  process.exit(1);
}

content = content.replace(anchor, injection + '\n  ' + anchor);
fs.writeFileSync(filePath, content);
console.log('Injection successful');
