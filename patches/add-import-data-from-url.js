const fs = require('fs');

const filePath = 'pokerogue-src/src/system/game-data.ts';
let content = fs.readFileSync(filePath, 'utf8');

const injection = `
  /**
   * Fetches a .prsv file from a URL and imports it as system save data.
   * Used by the offline iOS app to import the bundled full unlocks save.
   */
  public importDataFromUrl(url: string): void {
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], "full_unlocks.prsv");
        const reader = new FileReader();
        reader.onload = e => {
          const dataKey = \`data_\${loggedInUser?.username}\`;
          let dataStr = AES.decrypt(e.target?.result?.toString()!, saveKey).toString(enc.Utf8);
          dataStr = this.convertSystemDataStr(dataStr);
          localStorage.setItem(dataKey, encrypt(dataStr, bypassLogin));
          window.location.reload();
        };
        reader.readAsText(file);
      })
      .catch(err => console.error("importDataFromUrl failed:", err));
  }
`;

const anchor = `  migrateStarterAbilities(systemData: SystemSaveData, initialStarterData?: StarterData): void {`;

if (!content.includes(anchor)) {
  console.warn('Anchor not found in game-data.ts — skipping injection');
  process.exit(0);
}

content = content.replace(anchor, injection + '\n  ' + anchor);
fs.writeFileSync(filePath, content);
console.log('importDataFromUrl injected successfully');
