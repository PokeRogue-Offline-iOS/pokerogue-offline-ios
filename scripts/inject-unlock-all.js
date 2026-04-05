const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/menu-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const injection = `
  if (isApp) {
    manageDataOptions.push({
      label: "Unlock Everything",
      handler: () => {
        fetch("/full_unlocks.prsv")
          .then(r => r.blob())
          .then(blob => {
            const file = new File([blob], "full_unlocks.prsv", { type: "application/octet-stream" });
            globalScene.gameData.importData(GameDataType.SYSTEM, file);
          });
        ui.revertMode();
        return true;
      },
      keepOpen: false,
    });
  }
`;

const anchor = `manageDataOptions.push({
    label: i18next.t("menuUiHandler:cancel"),`;

if (!content.includes(anchor)) {
  console.error('Anchor not found in menu-ui-handler.ts — skipping injection');
  process.exit(0);
}

content = content.replace(anchor, injection + '\n  ' + anchor);
fs.writeFileSync(filePath, content);
console.log('Injection successful');
