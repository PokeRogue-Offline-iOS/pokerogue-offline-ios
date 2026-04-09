const fs = require('fs');

const filePath = 'pokerogue-src/src/ui/handlers/title-ui-handler.ts';
let content = fs.readFileSync(filePath, 'utf8');

const anchor = `    this.titleContainer.add([
      logo,
      this.usernameLabel,
      this.playerCountLabel,
      this.splashMessageText,
      this.appVersionText,
    ]);`;

if (!content.includes(anchor)) {
  console.warn('Anchor not found — skipping');
  process.exit(1);
}

content = content.replace(anchor, `    this.titleContainer.add([
      logo,
      this.splashMessageText,
      this.appVersionText,
    ]);`);

fs.writeFileSync(filePath, content);
console.log('Online labels removed successfully');
