const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/menu-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const injection = `
  if (isApp) {
    manageDataOptions.push({
      label: "Unlock Everything",
      handler: () => {
        fetch("/full_unlocks.prsv")
          .then(r => r.arrayBuffer())
          .then(buffer => {
            const blob = new Blob([buffer]);
            const file = new File([blob], "full_unlocks.prsv");
            const reader = new FileReader();
            reader.onload = (e) => {
              const dataKey = \`system_\${loggedInUser?.username}\`;
              let dataStr = AES.decrypt(e.target?.result?.toString(), saveKey).toString(enc.Utf8);
              dataStr = globalScene.gameData.convertSystemDataStr(dataStr);
              localStorage.setItem(dataKey, encrypt(dataStr, bypassLogin));
              window.location.reload();
            };
            reader.readAsText(file);
          });
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
