const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/menu-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const injection = `
  if (isApp) {
    manageDataOptions.push({
      label: "Debug: Show Storage Keys",
      handler: () => {
        const keys = Object.keys(localStorage);
        alert(keys.join("\\n") || "No keys found");
        return true;
      },
      keepOpen: true,
    });
  }
  if (isApp) {
    manageDataOptions.push({
      label: "Unlock Everything",
      handler: () => {
        fetch("/full_unlocks.prsv")
          .then(r => {
            if (!r.ok) {
              alert("Failed to load save file: " + r.status + " " + r.url);
              return null;
            }
            return r.arrayBuffer();
          })
          .then(buffer => {
            if (!buffer) return;
            const blob = new Blob([buffer]);
            const file = new File([blob], "full_unlocks.prsv");
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const dataKey = \`data_Guest\`;
                const saveData = e.target?.result?.toString();
                alert(saveData);
                localStorage.setItem(dataKey, saveData);
                window.location.reload();
              } catch(err) {
                alert("Error: " + err.message);
              }
            };
            reader.readAsText(file);
          })
          .catch(err => alert("Fetch error: " + err.message));
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
