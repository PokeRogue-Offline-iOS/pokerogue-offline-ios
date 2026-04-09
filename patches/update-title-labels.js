const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/title-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const anchor1 = `    return i18next.t("menu:loggedInAs", { username: displayName });`;

if (!content.includes(anchor1)) {
  console.warn('loggedInAs Anchor not found — skipping');
  process.exit(1);
}

content = content.replace(anchor1, `    return "";`);

const anchor2 = `    this.playerCountLabel = addTextObject(labelPosX, 0, \`? ${i18next.t("menu:playersOnline")}\`, TextStyle.MESSAGE, {`;

if (!content.includes(anchor2)) {
  console.warn('playerCountLabel Anchor not found — skipping');
  process.exit(1);
}

content = content.replace(anchor2, `    this.playerCountLabel = addTextObject(labelPosX, 0, \`\`, TextStyle.MESSAGE, {`);



fs.writeFileSync(filePath, content);
console.log('Online labels removed successfully');
