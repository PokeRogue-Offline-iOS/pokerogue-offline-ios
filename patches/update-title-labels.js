const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/title-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const anchor = `    this.titleContainer.add([`;

if (!content.includes(anchor)) {
  console.warn('titleContainer.add Anchor not found — skipping');
  process.exit(1);
}
const injection = `this.playerCountLabel.setText(\`\`);`;
content = content.replace(anchor, injection + '\n  ' + anchor);


const anchor2 = `    this.usernameLabel.setText(this.getUsername());`;

if (!content.includes(anchor2)) {
  console.warn('usernameLabel.setText Anchor not found — skipping');
  process.exit(1);
}
const injection2 = `    this.usernameLabel.setText(\`\`);`;
content = content.replace(anchor2, anchor2 + '\n  ' + injection2);



fs.writeFileSync(filePath, content);
console.log('Online labels removed successfully');
