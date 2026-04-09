const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/title-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const anchor = `    this.titleContainer.add([`;

if (!content.includes(anchor)) {
  console.warn('titleContainer.add Anchor not found — skipping');
  process.exit(1);
}
const injection = `this.playerCountLabel.setText(\`\`); this.usernameLabel.setText(\`\`); `;
content = content.replace(anchor, injection + '\n  ' + anchor);



fs.writeFileSync(filePath, content);
console.log('Online labels removed successfully');
