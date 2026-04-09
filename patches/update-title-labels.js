const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/title-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const anchor1 = `    return i18next.t("menu:loggedInAs", { username: displayName });`;

if (!content.includes(anchor1)) {
  console.warn('loggedInAs Anchor not found — skipping');
  process.exit(1);
}

content = content.replace(anchor1, `    return "";`);

const anchor2 = `    this.titleContainer.add([`;

if (!content.includes(anchor2)) {
  console.warn('titleContainer.add Anchor not found — skipping');
  process.exit(1);
}
const injection = `this.playerCountLabel.setText(\`\`);`;
content = content.replace(anchor2, injection + '\n  ' + anchor);



fs.writeFileSync(filePath, content);
console.log('Online labels removed successfully');
